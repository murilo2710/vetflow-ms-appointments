import { bookAppointment } from '../../../domain/appointment.js';
import { appointmentEvent, EventType } from '../../../domain/events.js';

/** Caso de uso: agendar consulta (RF08). Publica AppointmentBooked via outbox. */
export class CreateAppointmentHandler {
  constructor({ appointmentRepository, serviceCatalog, clock, idGenerator }) {
    this.appointmentRepository = appointmentRepository;
    this.serviceCatalog = serviceCatalog;
    this.clock = clock;
    this.idGenerator = idGenerator;
  }

  async execute(input = {}) {
    const now = this.clock.now();
    const service = input.serviceId ? await this.serviceCatalog.findById(String(input.serviceId)) : null;
    const appointment = bookAppointment(input, service, now, this.idGenerator.newId());
    const event = appointmentEvent(EventType.AppointmentBooked, appointment, { eventId: this.idGenerator.newId(), occurredAt: now });
    return this.appointmentRepository.insert(appointment, [event]);
  }
}
