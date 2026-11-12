// Entidade Consulta (appointment) e regras da agenda. Código puro, sem banco nem HTTP.
import { validation, conflict } from './errors.js';

export const AppointmentStatus = Object.freeze({
  SCHEDULED: 'SCHEDULED',   // agendada, aguardando pagamento/confirmação
  CONFIRMED: 'CONFIRMED',   // paga e confirmada
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED'
});
export const ACTIVE_STATUSES = Object.freeze([AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED]);

export const MIN_BOOKING_NOTICE_HOURS = 2;
export const MIN_CANCEL_NOTICE_HOURS = 24;
export const MAX_BOOKING_DAYS_AHEAD = 90;
const HOUR = 60 * 60 * 1000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const str = (v) => (typeof v === 'string' ? v.trim() : v);

/** O preço sempre vem da tabela de serviços da clínica, nunca do cliente. */
export function priceOf(service) {
  if (!service || !Number.isInteger(service.priceCents) || service.priceCents <= 0) {
    throw validation('Serviço sem preço válido');
  }
  return service.priceCents;
}

/** Duas consultas se sobrepõem quando um intervalo começa antes do outro terminar. */
export function overlaps(a, b) {
  return new Date(a.startsAt) < new Date(b.endsAt) && new Date(b.startsAt) < new Date(a.endsAt);
}

function assertSchedule({ startsAt, service }, now) {
  const errors = {};
  const start = new Date(startsAt);
  if (typeof startsAt !== 'string' || Number.isNaN(start.getTime())) {
    errors.startsAt = 'Data/hora inválida (use ISO 8601, ex: 2026-11-20T14:00:00-03:00)';
  } else {
    if (start.getTime() - now.getTime() < MIN_BOOKING_NOTICE_HOURS * HOUR) {
      errors.startsAt = `A consulta precisa ser marcada com pelo menos ${MIN_BOOKING_NOTICE_HOURS}h de antecedência`;
    } else if (start.getTime() - now.getTime() > MAX_BOOKING_DAYS_AHEAD * 24 * HOUR) {
      errors.startsAt = `A agenda fica aberta para os próximos ${MAX_BOOKING_DAYS_AHEAD} dias`;
    }
  }
  if (!service) errors.serviceId = 'Serviço não encontrado na tabela da clínica';
  else if (!service.active) errors.serviceId = 'Serviço inativo';
  if (Object.keys(errors).length) throw validation('Agendamento inválido', errors);
  return start;
}

function schedule(start, service) {
  return {
    serviceId: service.id,
    serviceName: service.name,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + service.durationMin * 60 * 1000).toISOString(),
    priceCents: priceOf(service)
  };
}

/** Agendar consulta (RF08). */
export function bookAppointment(input = {}, service, now, id) {
  const data = {
    petId: str(input.petId),
    petName: str(input.petName),
    tutorEmail: typeof input.tutorEmail === 'string' ? input.tutorEmail.trim().toLowerCase() : input.tutorEmail,
    vetName: str(input.vetName),
    notes: input.notes ? str(input.notes) : null
  };
  const errors = {};
  if (typeof data.petId !== 'string' || !data.petId) errors.petId = 'petId é obrigatório';
  if (typeof data.petName !== 'string' || data.petName.length < 2) errors.petName = 'Nome do pet é obrigatório';
  if (typeof data.tutorEmail !== 'string' || !EMAIL.test(data.tutorEmail)) errors.tutorEmail = 'E-mail do tutor inválido';
  if (typeof data.vetName !== 'string' || data.vetName.length < 3) errors.vetName = 'Nome do veterinário é obrigatório';
  if (data.notes && data.notes.length > 500) errors.notes = 'Observações devem ter até 500 caracteres';
  if (Object.keys(errors).length) throw validation('Agendamento inválido', errors);

  const start = assertSchedule({ startsAt: input.startsAt, service }, now);
  return {
    id,
    ...data,
    ...schedule(start, service),
    status: AppointmentStatus.SCHEDULED,
    cancelReason: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

/** Reagendar: só consultas ainda não pagas; as regras de agenda valem de novo. */
export function rescheduleAppointment(appointment, changes = {}, service, now) {
  if (appointment.status !== AppointmentStatus.SCHEDULED) {
    throw conflict(`Consulta com status ${appointment.status} não pode ser alterada`);
  }
  const vetName = changes.vetName != null ? str(changes.vetName) : appointment.vetName;
  if (typeof vetName !== 'string' || vetName.length < 3) throw validation('Agendamento inválido', { vetName: 'Nome do veterinário é obrigatório' });
  const notes = changes.notes !== undefined ? (changes.notes ? str(changes.notes) : null) : appointment.notes;
  const start = assertSchedule({ startsAt: changes.startsAt ?? appointment.startsAt, service }, now);
  return { ...appointment, vetName, notes, ...schedule(start, service), updatedAt: now.toISOString() };
}

/** Cancelar (RF09): consulta paga exige 24h de antecedência. */
export function cancelAppointment(appointment, reason, now) {
  if (!ACTIVE_STATUSES.includes(appointment.status)) {
    throw conflict(`Consulta com status ${appointment.status} não pode ser cancelada`);
  }
  const text = str(reason);
  if (typeof text !== 'string' || text.length < 3) throw validation('Informe o motivo do cancelamento', { reason: 'Motivo obrigatório' });
  if (appointment.status === AppointmentStatus.CONFIRMED) {
    const notice = new Date(appointment.startsAt).getTime() - now.getTime();
    if (notice < MIN_CANCEL_NOTICE_HOURS * HOUR) {
      throw conflict(`Consulta paga só pode ser cancelada com ${MIN_CANCEL_NOTICE_HOURS}h de antecedência`);
    }
  }
  return { ...appointment, status: AppointmentStatus.CANCELLED, cancelReason: text, updatedAt: now.toISOString() };
}

/** Confirmar: representa o pagamento Pix aprovado. Só consultas agendadas e ainda no futuro. */
export function confirmAppointment(appointment, now) {
  if (appointment.status !== AppointmentStatus.SCHEDULED) {
    throw conflict(`Consulta com status ${appointment.status} não pode ser confirmada`);
  }
  if (new Date(appointment.startsAt) <= now) throw conflict('Consulta já passou e não pode ser confirmada');
  return { ...appointment, status: AppointmentStatus.CONFIRMED, updatedAt: now.toISOString() };
}

/** Consulta paga não é apagada: precisa ser cancelada (fica no histórico financeiro). */
export function assertDeletable(appointment) {
  if (![AppointmentStatus.SCHEDULED, AppointmentStatus.CANCELLED].includes(appointment.status)) {
    throw conflict(`Consulta com status ${appointment.status} não pode ser excluída; cancele-a`);
  }
}
