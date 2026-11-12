import { notFound } from '../../../domain/errors.js';
import { cancelAppointment } from '../../../domain/appointment.js';
import { appointmentEvent, EventType } from '../../../domain/events.js';

/** Caso de uso: cancelar consulta (RF09). Publica AppointmentCancelled. */
export class CancelAppointmentHandler {
  constructor({ appointmentRepository, clock, idGenerator }) {
    this.appointmentRepository = appointmentRepository;
    this.clock = clock;
    this.idGenerator = idGenerator;
  }

  async execute({ id, reason }) {
    const current = await this.appointmentRepository.findById(id);
    if (!current) throw notFound('Consulta não encontrada');
    const now = this.clock.now();
    const cancelled = cancelAppointment(current, reason, now);
    const event = appointmentEvent(EventType.AppointmentCancelled, cancelled, { eventId: this.idGenerator.newId(), occurredAt: now });
    return this.appointmentRepository.update(cancelled, [event]);
  }
}
