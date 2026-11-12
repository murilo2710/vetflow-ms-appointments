/**
 * Transactional Outbox: os eventos são gravados na mesma transação da consulta e este
 * dispatcher os publica depois no broker. Se o Service Bus cair, nada se perde: o evento
 * continua pendente e é reenviado no próximo ciclo (entrega "pelo menos uma vez").
 */
export class OutboxDispatcher {
  constructor({ outboxStore, publisher, clock, intervalMs = 5000, batchSize = 20, logger = console }) {
    this.outboxStore = outboxStore;
    this.publisher = publisher;
    this.clock = clock;
    this.intervalMs = intervalMs;
    this.batchSize = batchSize;
    this.logger = logger;
    this.running = false;
    this.timer = null;
  }

  async tick() {
    if (this.running) return { published: 0, failed: 0 };
    this.running = true;
    let published = 0;
    let failed = 0;
    try {
      const pending = await this.outboxStore.pending(this.batchSize);
      for (const entry of pending) {
        try {
          await this.publisher.publish(entry.payload);
          await this.outboxStore.markSent(entry.id, this.clock.now());
          published += 1;
        } catch (err) {
          failed += 1;
          await this.outboxStore.markFailed(entry.id, err.message);
          this.logger.warn(JSON.stringify({ level: 'warn', msg: 'falha ao publicar evento', eventId: entry.id, error: err.message }));
        }
      }
    } catch (err) {
      this.logger.warn(JSON.stringify({ level: 'warn', msg: 'falha ao ler o outbox', error: err.message }));
    } finally {
      this.running = false;
    }
    if (published) this.logger.log(JSON.stringify({ level: 'info', msg: 'outbox publicado', published, via: this.publisher.name }));
    return { published, failed };
  }

  start() {
    this.timer = setInterval(() => { this.tick(); }, this.intervalMs);
    this.timer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
  }
}
