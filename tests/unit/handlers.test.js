// Fluxos dos casos de uso com os adaptadores em memória (sem Azure SQL nem Service Bus).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CreateAppointmentHandler } from '../../src/application/features/CreateAppointment/handler.js';
import { ListAppointmentsHandler } from '../../src/application/features/ListAppointments/handler.js';
import { GetAppointmentHandler } from '../../src/application/features/GetAppointment/handler.js';
import { UpdateAppointmentHandler } from '../../src/application/features/UpdateAppointment/handler.js';
import { CancelAppointmentHandler } from '../../src/application/features/CancelAppointment/handler.js';
import { ConfirmAppointmentHandler } from '../../src/application/features/ConfirmAppointment/handler.js';
import { DeleteAppointmentHandler } from '../../src/application/features/DeleteAppointment/handler.js';
import { ListServicesHandler } from '../../src/application/features/ListServices/handler.js';
import { ListDomainEventsHandler } from '../../src/application/features/ListDomainEvents/handler.js';
import { InMemoryAppointmentRepository, InMemoryServiceCatalog } from '../../src/infrastructure/persistence/InMemoryStores.js';
import { OutboxDispatcher } from '../../src/infrastructure/messaging/OutboxDispatcher.js';

function setup() {
  let seq = 0;
  const repo = new InMemoryAppointmentRepository();
  const deps = {
    appointmentRepository: repo,
    serviceCatalog: new InMemoryServiceCatalog(),
    outboxReader: repo,
    clock: { now: () => new Date('2026-11-12T12:00:00Z') },
    idGenerator: { newId: () => `id-${++seq}` }
  };
  return {
    repo, deps,
    create: new CreateAppointmentHandler(deps),
    list: new ListAppointmentsHandler(deps),
    get: new GetAppointmentHandler(deps),
    update: new UpdateAppointmentHandler(deps),
    cancel: new CancelAppointmentHandler(deps),
    confirm: new ConfirmAppointmentHandler(deps),
    remove: new DeleteAppointmentHandler(deps),
    services: new ListServicesHandler(deps),
    events: new ListDomainEventsHandler(deps)
  };
}

const booking = {
  petId: 'p1', petName: 'Thor', tutorEmail: 'ana@email.com', vetName: 'Dra. Carla',
  serviceId: 'consulta-clinica', startsAt: '2026-11-13T14:00:00Z'
};

test('agendar grava a consulta e o evento AppointmentBooked no outbox', async () => {
  const h = setup();
  const a = await h.create.execute(booking);
  assert.equal(a.priceCents, 15000);
  const [event] = await h.events.execute();
  assert.equal(event.type, 'AppointmentBooked');
  assert.equal(event.payload.data.appointmentId, a.id);
  assert.equal(event.sentAt, null);
});

test('mesmo veterinário em horário sobreposto gera conflito (409); outro veterinário pode', async () => {
  const h = setup();
  await h.create.execute(booking);
  await assert.rejects(h.create.execute({ ...booking, petId: 'p2', startsAt: '2026-11-13T14:15:00Z' }), (e) => e.type === 'conflict');
  const other = await h.create.execute({ ...booking, petId: 'p2', vetName: 'Dr. Paulo', startsAt: '2026-11-13T14:15:00Z' });
  assert.equal(other.status, 'SCHEDULED');
});

test('horário de consulta cancelada pode ser reaproveitado', async () => {
  const h = setup();
  const a = await h.create.execute(booking);
  await h.cancel.execute({ id: a.id, reason: 'Tutor desistiu' });
  const again = await h.create.execute({ ...booking, petId: 'p2' });
  assert.equal(again.status, 'SCHEDULED');
});

test('fluxo completo: agendar, reagendar, confirmar, cancelar, excluir', async () => {
  const h = setup();
  const a = await h.create.execute(booking);
  const moved = await h.update.execute({ id: a.id, changes: { startsAt: '2026-11-15T10:00:00Z', serviceId: 'vacinacao' } });
  assert.equal(moved.priceCents, 9000);
  const confirmed = await h.confirm.execute({ id: a.id });
  assert.equal(confirmed.status, 'CONFIRMED');
  await assert.rejects(h.remove.execute({ id: a.id }), (e) => e.type === 'conflict');
  const cancelled = await h.cancel.execute({ id: a.id, reason: 'Tutor viajou' });
  assert.equal(cancelled.status, 'CANCELLED');
  assert.deepEqual(await h.remove.execute({ id: a.id }), { deleted: true, id: a.id });
  await assert.rejects(h.get.execute({ id: a.id }), (e) => e.type === 'not_found');
  const types = (await h.events.execute()).map((e) => e.type).sort();
  assert.deepEqual(types, ['AppointmentBooked', 'AppointmentCancelled', 'AppointmentConfirmed', 'AppointmentRescheduled']);
});

test('ListAppointments filtra por status e recusa status inválido', async () => {
  const h = setup();
  const a = await h.create.execute(booking);
  await h.create.execute({ ...booking, vetName: 'Dr. Paulo' });
  await h.confirm.execute({ id: a.id });
  assert.equal((await h.list.execute({ status: 'confirmed' })).length, 1);
  await assert.rejects(h.list.execute({ status: 'XYZ' }), (e) => e.type === 'validation');
});

test('ListServices devolve a tabela de preços ativa', async () => {
  const h = setup();
  const services = await h.services.execute();
  assert.ok(services.length >= 4);
  assert.ok(services.every((s) => s.active && s.priceCents > 0));
});

test('OutboxDispatcher publica os pendentes e marca como enviados; falha fica pendente', async () => {
  const h = setup();
  await h.create.execute(booking);
  const published = [];
  let fail = true;
  const publisher = { name: 'fake', publish: async (e) => { if (fail) throw new Error('broker fora'); published.push(e); } };
  const logger = { log() {}, warn() {} };
  const dispatcher = new OutboxDispatcher({ outboxStore: h.repo, publisher, clock: h.deps.clock, logger });

  assert.deepEqual(await dispatcher.tick(), { published: 0, failed: 1 });
  assert.equal((await h.events.execute())[0].sentAt, null);
  assert.equal((await h.events.execute())[0].attempts, 1);

  fail = false;
  assert.deepEqual(await dispatcher.tick(), { published: 1, failed: 0 });
  assert.equal(published[0].type, 'AppointmentBooked');
  assert.ok((await h.events.execute())[0].sentAt);
  assert.deepEqual(await dispatcher.tick(), { published: 0, failed: 0 });
});
