// Portas que os casos de uso recebem por injeção (implementadas em src/infrastructure).

/**
 * @typedef {Object} AppointmentRepository
 * @property {(appointment: object, events: object[]) => Promise<object>} insert
 *   Grava a consulta e os eventos no outbox na MESMA transação. Lança DomainError
 *   'conflict' se o veterinário já tiver consulta ativa no intervalo.
 * @property {(appointment: object, events: object[]) => Promise<object>} update   Idem, para alterações
 * @property {(id: string) => Promise<object|null>} findById
 * @property {(filter: object) => Promise<object[]>} list
 * @property {(id: string) => Promise<boolean>} delete
 */

/**
 * @typedef {Object} ServiceCatalog
 * @property {() => Promise<object[]>} list
 * @property {(id: string) => Promise<object|null>} findById
 */

/**
 * @typedef {Object} OutboxReader
 * @property {(limit: number) => Promise<object[]>} recent   Últimos eventos gravados, com status de envio
 */

/** @typedef {{ now: () => Date }} Clock */
/** @typedef {{ newId: () => string }} IdGenerator */

export const PORTS = Object.freeze(['appointmentRepository', 'serviceCatalog', 'outboxReader', 'clock', 'idGenerator']);
