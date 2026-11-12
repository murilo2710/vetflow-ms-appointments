/** Caso de uso: últimos eventos de domínio gravados no outbox, com status de publicação. */
export class ListDomainEventsHandler {
  constructor({ outboxReader }) {
    this.outboxReader = outboxReader;
  }

  async execute({ limit } = {}) {
    const n = Math.min(Math.max(Number(limit) || 20, 1), 100);
    return this.outboxReader.recent(n);
  }
}
