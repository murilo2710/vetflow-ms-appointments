import { notFound } from '../../../domain/errors.js';

/** Caso de uso: consultar uma consulta pelo id. */
export class GetAppointmentHandler {
  constructor({ appointmentRepository }) {
    this.appointmentRepository = appointmentRepository;
  }

  async execute({ id }) {
    const appointment = await this.appointmentRepository.findById(id);
    if (!appointment) throw notFound('Consulta não encontrada');
    return appointment;
  }
}
