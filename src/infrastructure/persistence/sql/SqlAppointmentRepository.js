import sql from 'mssql';
import { conflict } from '../../../domain/errors.js';
import { ACTIVE_STATUSES } from '../../../domain/appointment.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);

const toDomain = (r) => r && ({
  id: r.id,
  petId: r.pet_id,
  petName: r.pet_name,
  tutorEmail: r.tutor_email,
  vetName: r.vet_name,
  serviceId: r.service_id,
  serviceName: r.service_name,
  startsAt: iso(r.starts_at),
  endsAt: iso(r.ends_at),
  priceCents: r.price_cents,
  status: r.status,
  notes: r.notes,
  cancelReason: r.cancel_reason,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at)
});

const bind = (request, a) => request
  .input('id', sql.NVarChar(36), a.id)
  .input('petId', sql.NVarChar(64), a.petId)
  .input('petName', sql.NVarChar(60), a.petName)
  .input('tutorEmail', sql.NVarChar(254), a.tutorEmail)
  .input('vetName', sql.NVarChar(100), a.vetName)
  .input('serviceId', sql.NVarChar(40), a.serviceId)
  .input('serviceName', sql.NVarChar(80), a.serviceName)
  .input('startsAt', sql.DateTime2, new Date(a.startsAt))
  .input('endsAt', sql.DateTime2, new Date(a.endsAt))
  .input('priceCents', sql.Int, a.priceCents)
  .input('status', sql.NVarChar(20), a.status)
  .input('notes', sql.NVarChar(500), a.notes)
  .input('cancelReason', sql.NVarChar(300), a.cancelReason)
  .input('createdAt', sql.DateTime2, new Date(a.createdAt))
  .input('updatedAt', sql.DateTime2, new Date(a.updatedAt));

const isUniqueViolation = (err) => [2601, 2627].includes(err?.number) || [2601, 2627].includes(err?.originalError?.info?.number);

/**
 * Adaptador da porta AppointmentRepository para o Azure SQL Database.
 * Cada escrita roda numa transação SERIALIZABLE que (1) bloqueia o intervalo do
 * veterinário com UPDLOCK/HOLDLOCK, (2) grava a consulta e (3) grava os eventos no outbox.
 * O índice único filtrado appointment_one_active_per_vet_start é a segunda barreira.
 */
export class SqlAppointmentRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async #write(appointment, events, statement) {
    const tx = new sql.Transaction(this.pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      if (ACTIVE_STATUSES.includes(appointment.status)) {
        const clash = await new sql.Request(tx)
          .input('id', sql.NVarChar(36), appointment.id)
          .input('vetName', sql.NVarChar(100), appointment.vetName)
          .input('startsAt', sql.DateTime2, new Date(appointment.startsAt))
          .input('endsAt', sql.DateTime2, new Date(appointment.endsAt))
          .query(`SELECT TOP 1 id FROM dbo.appointment WITH (UPDLOCK, HOLDLOCK)
                  WHERE vet_name = @vetName AND id <> @id AND status IN ('SCHEDULED', 'CONFIRMED')
                    AND starts_at < @endsAt AND ends_at > @startsAt`);
        if (clash.recordset.length) throw conflict('O veterinário já tem uma consulta nesse horário');
      }
      await bind(new sql.Request(tx), appointment).query(statement);
      for (const event of events) {
        await new sql.Request(tx)
          .input('id', sql.NVarChar(36), event.eventId)
          .input('type', sql.NVarChar(60), event.type)
          .input('payload', sql.NVarChar(sql.MAX), JSON.stringify(event))
          .input('occurredAt', sql.DateTime2, new Date(event.occurredAt))
          .query('INSERT INTO dbo.outbox_event (id, type, payload, occurred_at) VALUES (@id, @type, @payload, @occurredAt)');
      }
      await tx.commit();
      return appointment;
    } catch (err) {
      await tx.rollback().catch(() => {});
      if (isUniqueViolation(err)) throw conflict('O veterinário já tem uma consulta nesse horário');
      throw err;
    }
  }

  insert(appointment, events = []) {
    return this.#write(appointment, events, `
      INSERT INTO dbo.appointment (id, pet_id, pet_name, tutor_email, vet_name, service_id, service_name,
        starts_at, ends_at, price_cents, status, notes, cancel_reason, created_at, updated_at)
      VALUES (@id, @petId, @petName, @tutorEmail, @vetName, @serviceId, @serviceName,
        @startsAt, @endsAt, @priceCents, @status, @notes, @cancelReason, @createdAt, @updatedAt)`);
  }

  update(appointment, events = []) {
    return this.#write(appointment, events, `
      UPDATE dbo.appointment SET vet_name = @vetName, service_id = @serviceId, service_name = @serviceName,
        starts_at = @startsAt, ends_at = @endsAt, price_cents = @priceCents, status = @status,
        notes = @notes, cancel_reason = @cancelReason, updated_at = @updatedAt
      WHERE id = @id`);
  }

  async findById(id) {
    const r = await this.pool.request().input('id', sql.NVarChar(36), id)
      .query('SELECT * FROM dbo.appointment WHERE id = @id');
    return toDomain(r.recordset[0]) ?? null;
  }

  async list({ status, petId, vetName, from, to } = {}) {
    const request = this.pool.request();
    const where = [];
    if (status) { where.push('status = @status'); request.input('status', sql.NVarChar(20), status); }
    if (petId) { where.push('pet_id = @petId'); request.input('petId', sql.NVarChar(64), petId); }
    if (vetName) { where.push('vet_name = @vetName'); request.input('vetName', sql.NVarChar(100), vetName); }
    if (from) { where.push('starts_at >= @from'); request.input('from', sql.DateTime2, new Date(from)); }
    if (to) { where.push('starts_at <= @to'); request.input('to', sql.DateTime2, new Date(to)); }
    const r = await request.query(`SELECT TOP 200 * FROM dbo.appointment
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY starts_at`);
    return r.recordset.map(toDomain);
  }

  async delete(id) {
    const r = await this.pool.request().input('id', sql.NVarChar(36), id)
      .query('DELETE FROM dbo.appointment WHERE id = @id');
    return r.rowsAffected[0] === 1;
  }

  // ---- Outbox (OutboxStore usado pelo dispatcher + OutboxReader usado pela API) ----
  async pending(limit) {
    const r = await this.pool.request().input('n', sql.Int, limit)
      .query(`SELECT TOP (@n) id, type, payload, occurred_at, attempts FROM dbo.outbox_event
              WHERE sent_at IS NULL AND attempts < 10 ORDER BY occurred_at`);
    return r.recordset.map((e) => ({ id: e.id, type: e.type, payload: JSON.parse(e.payload), occurredAt: iso(e.occurred_at), attempts: e.attempts }));
  }

  async markSent(id, when) {
    await this.pool.request().input('id', sql.NVarChar(36), id).input('when', sql.DateTime2, when)
      .query('UPDATE dbo.outbox_event SET sent_at = @when WHERE id = @id');
  }

  async markFailed(id, error) {
    await this.pool.request().input('id', sql.NVarChar(36), id).input('err', sql.NVarChar(500), String(error).slice(0, 500))
      .query('UPDATE dbo.outbox_event SET attempts = attempts + 1, last_error = @err WHERE id = @id');
  }

  async recent(limit) {
    const r = await this.pool.request().input('n', sql.Int, limit)
      .query('SELECT TOP (@n) * FROM dbo.outbox_event ORDER BY occurred_at DESC');
    return r.recordset.map((e) => ({
      id: e.id, type: e.type, payload: JSON.parse(e.payload), occurredAt: iso(e.occurred_at),
      sentAt: iso(e.sent_at), attempts: e.attempts, lastError: e.last_error
    }));
  }

  async ping() {
    await this.pool.request().query('SELECT 1 AS ok');
    return true;
  }
}

/** Adaptador da porta ServiceCatalog (tabela dbo.service). */
export class SqlServiceCatalog {
  constructor(pool) {
    this.pool = pool;
  }

  static #map(r) {
    return { id: r.id, name: r.name, priceCents: r.price_cents, durationMin: r.duration_min, active: Boolean(r.active) };
  }

  async list() {
    const r = await this.pool.request().query('SELECT * FROM dbo.service ORDER BY name');
    return r.recordset.map(SqlServiceCatalog.#map);
  }

  async findById(id) {
    const r = await this.pool.request().input('id', sql.NVarChar(40), id).query('SELECT * FROM dbo.service WHERE id = @id');
    return r.recordset[0] ? SqlServiceCatalog.#map(r.recordset[0]) : null;
  }
}
