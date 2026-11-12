import { validation } from '../../../domain/errors.js';
import { AppointmentStatus } from '../../../domain/appointment.js';

/** Caso de uso: agenda (lista de consultas) com filtros. */
export class ListAppointmentsHandler {
  constructor({ appointmentRepository }) {
    this.appointmentRepository = appointmentRepository;
  }

  async execute({ status, petId, vetName, from, to } = {}) {
    const filter = {};
    if (status) {
      filter.status = String(status).toUpperCase();
      if (!Object.values(AppointmentStatus).includes(filter.status)) {
        throw validation('Filtro inválido', { status: `Use ${Object.values(AppointmentStatus).join(', ')}` });
      }
    }
    if (petId) filter.petId = String(petId);
    if (vetName) filter.vetName = String(vetName);
    for (const [key, value] of Object.entries({ from, to })) {
      if (!value) continue;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) throw validation('Filtro inválido', { [key]: 'Data inválida' });
      filter[key] = date.toISOString();
    }
    return this.appointmentRepository.list(filter);
  }
}
