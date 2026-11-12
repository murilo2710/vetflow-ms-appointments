import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bookAppointment, rescheduleAppointment, cancelAppointment, confirmAppointment, assertDeletable,
  priceOf, overlaps, AppointmentStatus
} from '../../src/domain/appointment.js';
import { appointmentEvent, EventType } from '../../src/domain/events.js';

const now = new Date('2026-11-12T12:00:00Z');
const service = { id: 'consulta-clinica', name: 'Consulta clínica', priceCents: 15000, durationMin: 30, active: true };
const input = {
  petId: 'p1', petName: 'Thor', tutorEmail: 'ANA@email.com', vetName: 'Dra. Carla',
  serviceId: 'consulta-clinica', startsAt: '2026-11-13T14:00:00Z', priceCents: 1
};

test('agendamento usa o preço da tabela de serviços, nunca o enviado pelo cliente', () => {
  const a = bookAppointment(input, service, now, 'a1');
  assert.equal(a.priceCents, 15000);
  assert.equal(a.status, AppointmentStatus.SCHEDULED);
  assert.equal(a.endsAt, '2026-11-13T14:30:00.000Z');
  assert.equal(a.tutorEmail, 'ana@email.com');
});

test('agendamento exige 2h de antecedência e no máximo 90 dias', () => {
  assert.throws(() => bookAppointment({ ...input, startsAt: '2026-11-12T13:00:00Z' }, service, now, 'a1'),
    (e) => e.type === 'validation' && /2h/.test(e.details.startsAt));
  assert.throws(() => bookAppointment({ ...input, startsAt: '2027-03-01T13:00:00Z' }, service, now, 'a1'),
    (e) => /90 dias/.test(e.details.startsAt));
});

test('agendamento recusa serviço inexistente ou inativo e campos obrigatórios vazios', () => {
  assert.throws(() => bookAppointment(input, null, now, 'a1'), (e) => Boolean(e.details.serviceId));
  assert.throws(() => bookAppointment(input, { ...service, active: false }, now, 'a1'), (e) => e.details.serviceId === 'Serviço inativo');
  assert.throws(() => bookAppointment({}, service, now, 'a1'), (e) => Object.keys(e.details).length >= 4);
});

test('priceOf recusa serviço sem preço válido', () => {
  assert.throws(() => priceOf({ priceCents: 0 }), /preço/);
});

test('overlaps detecta sobreposição de intervalos', () => {
  const a = { startsAt: '2026-11-13T14:00:00Z', endsAt: '2026-11-13T14:30:00Z' };
  assert.equal(overlaps(a, { startsAt: '2026-11-13T14:15:00Z', endsAt: '2026-11-13T14:45:00Z' }), true);
  assert.equal(overlaps(a, { startsAt: '2026-11-13T14:30:00Z', endsAt: '2026-11-13T15:00:00Z' }), false);
});

test('consulta confirmada (paga) só pode ser cancelada com 24h de antecedência', () => {
  const confirmed = { ...bookAppointment(input, service, now, 'a1'), status: AppointmentStatus.CONFIRMED };
  assert.throws(() => cancelAppointment(confirmed, 'Tutor viajou', new Date('2026-11-13T00:00:00Z')), (e) => e.type === 'conflict');
  const ok = cancelAppointment(confirmed, 'Tutor viajou', now);
  assert.equal(ok.status, AppointmentStatus.CANCELLED);
  assert.equal(ok.cancelReason, 'Tutor viajou');
});

test('cancelamento exige motivo e não vale para consulta já cancelada', () => {
  const a = bookAppointment(input, service, now, 'a1');
  assert.throws(() => cancelAppointment(a, '', now), (e) => e.type === 'validation');
  const cancelled = cancelAppointment(a, 'Mudou de ideia', now);
  assert.throws(() => cancelAppointment(cancelled, 'De novo', now), (e) => e.type === 'conflict');
});

test('confirmar só consultas agendadas; reagendar só antes do pagamento', () => {
  const a = bookAppointment(input, service, now, 'a1');
  const confirmed = confirmAppointment(a, now);
  assert.equal(confirmed.status, AppointmentStatus.CONFIRMED);
  assert.throws(() => confirmAppointment(confirmed, now), (e) => e.type === 'conflict');
  assert.throws(() => rescheduleAppointment(confirmed, { startsAt: '2026-11-14T10:00:00Z' }, service, now), (e) => e.type === 'conflict');
  const moved = rescheduleAppointment(a, { startsAt: '2026-11-14T10:00:00Z' }, { ...service, priceCents: 9000, durationMin: 15 }, now);
  assert.equal(moved.priceCents, 9000);
  assert.equal(moved.endsAt, '2026-11-14T10:15:00.000Z');
});

test('consulta confirmada não pode ser excluída', () => {
  const a = bookAppointment(input, service, now, 'a1');
  assert.doesNotThrow(() => assertDeletable(a));
  assert.throws(() => assertDeletable(confirmAppointment(a, now)), (e) => e.type === 'conflict');
});

test('envelope do evento carrega eventId, tipo, versão e dados da consulta', () => {
  const a = bookAppointment(input, service, now, 'a1');
  const e = appointmentEvent(EventType.AppointmentBooked, a, { eventId: 'e1', occurredAt: now });
  assert.equal(e.eventId, 'e1');
  assert.equal(e.type, 'AppointmentBooked');
  assert.equal(e.version, 1);
  assert.equal(e.data.appointmentId, 'a1');
  assert.equal(e.data.priceCents, 15000);
});
