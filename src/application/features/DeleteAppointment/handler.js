import { notFound } from '../../../domain/errors.js';
import { assertDeletable } from '../../../domain/appointment.js';

/** Caso de uso: excluir consulta (apenas agendadas não pagas ou já canceladas). */
export class DeleteAppointmentHandler {
  constructor({ appointmentRepository }) {
    this.appointmentRepository = appointmentRepository;
  }

  async execute({ id }) {
    const current = await this.appointmentRepository.findById(id);
    if (!current) throw notFound('Consulta não encontrada');
    assertDeletable(current);
    await this.appointmentRepository.delete(id);
    return { deleted: true, id };
  }
}
