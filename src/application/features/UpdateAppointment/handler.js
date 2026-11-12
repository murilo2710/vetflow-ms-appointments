import { notFound } from '../../../domain/errors.js';
import { rescheduleAppointment } from '../../../domain/appointment.js';
import { appointmentEvent, EventType } from '../../../domain/events.js';

/** Caso de uso: reagendar/alterar consulta ainda não paga. Publica AppointmentRescheduled. */
export class UpdateAppointmentHandler {
  constructor({ appointmentRepository, serviceCatalog, clock, idGenerator }) {
    this.appointmentRepository = appointmentRepository;
    this.serviceCatalog = serviceCatalog;
    this.clock = clock;
    this.idGenerator = idGenerator;
  }

  async execute({ id, changes = {} }) {
    const current = await this.appointmentRepository.findById(id);
    if (!current) throw notFound('Consulta não encontrada');
    const now = this.clock.now();
    const service = await this.serviceCatalog.findById(String(changes.serviceId ?? current.serviceId));
    const updated = rescheduleAppointment(current, changes, service, now);
    const event = appointmentEvent(EventType.AppointmentRescheduled, updated, { eventId: this.idGenerator.newId(), occurredAt: now });
    return this.appointmentRepository.update(updated, [event]);
  }
}
