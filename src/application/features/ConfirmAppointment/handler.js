import { notFound } from '../../../domain/errors.js';
import { confirmAppointment } from '../../../domain/appointment.js';
import { appointmentEvent, EventType } from '../../../domain/events.js';

/** Caso de uso: confirmar consulta após o pagamento aprovado (RF11). Publica AppointmentConfirmed. */
export class ConfirmAppointmentHandler {
  constructor({ appointmentRepository, clock, idGenerator }) {
    this.appointmentRepository = appointmentRepository;
    this.clock = clock;
    this.idGenerator = idGenerator;
  }

  async execute({ id }) {
    const current = await this.appointmentRepository.findById(id);
    if (!current) throw notFound('Consulta não encontrada');
    const now = this.clock.now();
    const confirmed = confirmAppointment(current, now);
    const event = appointmentEvent(EventType.AppointmentConfirmed, confirmed, { eventId: this.idGenerator.newId(), occurredAt: now });
    return this.appointmentRepository.update(confirmed, [event]);
  }
}
