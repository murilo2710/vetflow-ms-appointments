import { conflict } from '../../domain/errors.js';
import { ACTIVE_STATUSES, overlaps } from '../../domain/appointment.js';
import { SEED_SERVICES } from './seed.js';

const clone = (v) => structuredClone(v);

/**
 * Adaptadores em memória (desenvolvimento local e testes). Aplicam as mesmas regras de
 * integridade do Azure SQL: sem consultas ativas sobrepostas para o mesmo veterinário e
 * consulta + eventos do outbox gravados juntos.
 */
export class InMemoryAppointmentRepository {
  constructor() {
    this.items = new Map();
    this.outbox = [];
  }

  #assertNoConflict(appointment) {
    if (!ACTIVE_STATUSES.includes(appointment.status)) return;
    const clash = [...this.items.values()].find((other) =>
      other.id !== appointment.id && other.vetName.toLowerCase() === appointment.vetName.toLowerCase() &&
      ACTIVE_STATUSES.includes(other.status) && overlaps(other, appointment));
    if (clash) throw conflict('O veterinário já tem uma consulta nesse horário');
  }

  #addEvents(events) {
    for (const e of events) this.outbox.push({ id: e.eventId, type: e.type, payload: clone(e), occurredAt: e.occurredAt, sentAt: null, attempts: 0, lastError: null });
  }

  async insert(appointment, events = []) {
    this.#assertNoConflict(appointment);
    this.items.set(appointment.id, clone(appointment));
    this.#addEvents(events);
    return clone(appointment);
  }

  async update(appointment, events = []) {
    this.#assertNoConflict(appointment);
    this.items.set(appointment.id, clone(appointment));
    this.#addEvents(events);
    return clone(appointment);
  }

  async findById(id) {
    const a = this.items.get(id);
    return a ? clone(a) : null;
  }

  async list({ status, petId, vetName, from, to } = {}) {
    return [...this.items.values()]
      .filter((a) => !status || a.status === status)
      .filter((a) => !petId || a.petId === petId)
      .filter((a) => !vetName || a.vetName.toLowerCase() === vetName.toLowerCase())
      .filter((a) => !from || a.startsAt >= from)
      .filter((a) => !to || a.startsAt <= to)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map(clone);
  }

  async delete(id) {
    return this.items.delete(id);
  }

  // ---- Outbox (OutboxStore + OutboxReader) ----
  async pending(limit) {
    return this.outbox.filter((e) => !e.sentAt && e.attempts < 10).slice(0, limit).map(clone);
  }

  async markSent(id, when) {
    const e = this.outbox.find((x) => x.id === id);
    if (e) e.sentAt = when.toISOString();
  }

  async markFailed(id, error) {
    const e = this.outbox.find((x) => x.id === id);
    if (e) { e.attempts += 1; e.lastError = String(error).slice(0, 500); }
  }

  async recent(limit) {
    return [...this.outbox].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, limit).map(clone);
  }

  async ping() { return true; }
}

export class InMemoryServiceCatalog {
  constructor(services = SEED_SERVICES) {
    this.services = services.map(clone);
  }

  async list() { return this.services.map(clone); }

  async findById(id) {
    const s = this.services.find((x) => x.id === id);
    return s ? clone(s) : null;
  }
}
