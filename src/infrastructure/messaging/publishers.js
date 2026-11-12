import { ServiceBusClient } from '@azure/service-bus';

/**
 * Publicadores de eventos (todos com o mesmo método publish(event)).
 * - ServiceBusEventPublisher: produção, fila/tópico do Azure Service Bus
 * - HttpEventPublisher: desenvolvimento local, envia para a Function por HTTP
 * - LogEventPublisher: sem broker configurado, apenas registra no log
 */
export class ServiceBusEventPublisher {
  constructor(connectionString, entityName) {
    this.client = new ServiceBusClient(connectionString);
    this.sender = this.client.createSender(entityName);
    this.name = `servicebus:${entityName}`;
  }

  async publish(event) {
    await this.sender.sendMessages({
      messageId: event.eventId,          // permite detecção de duplicatas no broker
      subject: event.type,
      contentType: 'application/json',
      body: event,
      applicationProperties: { type: event.type, source: event.source }
    });
  }

  async close() {
    await this.sender.close();
    await this.client.close();
  }
}

export class HttpEventPublisher {
  constructor(url) {
    this.url = url;
    this.name = `http:${url}`;
  }

  async publish(event) {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ao publicar ${event.type}`);
  }
}

export class LogEventPublisher {
  constructor() {
    this.name = 'log';
  }

  async publish(event) {
    console.log(JSON.stringify({ level: 'info', msg: 'evento publicado (modo log)', type: event.type, eventId: event.eventId }));
  }
}
