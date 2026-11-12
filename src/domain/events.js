// Eventos de domínio publicados pelo Serviço de Agenda (contrato descrito no AsyncAPI em /docs/events).
export const EventType = Object.freeze({
  AppointmentBooked: 'AppointmentBooked',
  AppointmentRescheduled: 'AppointmentRescheduled',
  AppointmentConfirmed: 'AppointmentConfirmed',
  AppointmentCancelled: 'AppointmentCancelled'
});

export const EVENT_SOURCE = 'vetflow-ms-appointments';

/** Monta o envelope do evento. O eventId permite que o consumidor ignore mensagens repetidas. */
export function appointmentEvent(type, appointment, { eventId, occurredAt }) {
  return {
    eventId,
    type,
    version: 1,
    source: EVENT_SOURCE,
    occurredAt: occurredAt.toISOString(),
    data: {
      appointmentId: appointment.id,
      petId: appointment.petId,
      petName: appointment.petName,
      tutorEmail: appointment.tutorEmail,
      vetName: appointment.vetName,
      serviceName: appointment.serviceName,
      startsAt: appointment.startsAt,
      priceCents: appointment.priceCents,
      status: appointment.status,
      cancelReason: appointment.cancelReason ?? null
    }
  };
}
