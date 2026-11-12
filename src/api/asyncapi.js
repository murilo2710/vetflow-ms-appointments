// Contrato dos eventos (AsyncAPI 2.6), o "Swagger dos eventos". Publicado em /docs/events/.
const eventData = {
  type: 'object',
  properties: {
    appointmentId: { type: 'string', format: 'uuid' },
    petId: { type: 'string' },
    petName: { type: 'string', example: 'Thor' },
    tutorEmail: { type: 'string', format: 'email' },
    vetName: { type: 'string', example: 'Dra. Carla Mendes' },
    serviceName: { type: 'string', example: 'Consulta clínica' },
    startsAt: { type: 'string', format: 'date-time' },
    priceCents: { type: 'integer', example: 15000 },
    status: { type: 'string', enum: ['SCHEDULED', 'CONFIRMED', 'CANCELLED', 'COMPLETED'] },
    cancelReason: { type: 'string', nullable: true }
  }
};

const envelope = (type, description) => ({
  name: type,
  title: type,
  summary: description,
  contentType: 'application/json',
  headers: { type: 'object', properties: { type: { type: 'string', const: type }, source: { type: 'string' } } },
  payload: {
    type: 'object',
    required: ['eventId', 'type', 'version', 'occurredAt', 'data'],
    properties: {
      eventId: { type: 'string', format: 'uuid', description: 'Também usado como messageId (idempotência no consumidor)' },
      type: { type: 'string', const: type },
      version: { type: 'integer', const: 1 },
      source: { type: 'string', const: 'vetflow-ms-appointments' },
      occurredAt: { type: 'string', format: 'date-time' },
      data: eventData
    }
  }
});

export const asyncapi = {
  asyncapi: '2.6.0',
  info: {
    title: 'VetFlow - Eventos de Agenda',
    version: '1.0.0',
    description: 'Eventos publicados pelo Serviço de Agenda (ms-appointments) via Transactional Outbox e ' +
      'consumidos pela Azure Function processarEventoConsulta (Service Bus trigger), que gera as notificações do tutor. ' +
      'Entrega "pelo menos uma vez": consumidores ignoram eventId repetido.'
  },
  servers: {
    azure: {
      url: '{namespace}.servicebus.windows.net',
      protocol: 'amqp',
      protocolVersion: '1.0',
      description: 'Azure Service Bus',
      variables: { namespace: { default: 'vetflow-bus' } }
    }
  },
  channels: {
    'vetflow-eventos': {
      description: 'Fila do Azure Service Bus com os eventos de domínio da agenda.',
      publish: {
        operationId: 'publishAppointmentEvent',
        summary: 'ms-appointments publica (OutboxDispatcher)',
        message: {
          oneOf: [
            { $ref: '#/components/messages/AppointmentBooked' },
            { $ref: '#/components/messages/AppointmentRescheduled' },
            { $ref: '#/components/messages/AppointmentConfirmed' },
            { $ref: '#/components/messages/AppointmentCancelled' }
          ]
        }
      },
      subscribe: {
        operationId: 'processarEventoConsulta',
        summary: 'Azure Function processarEventoConsulta consome e gera a notificação',
        message: {
          oneOf: [
            { $ref: '#/components/messages/AppointmentBooked' },
            { $ref: '#/components/messages/AppointmentRescheduled' },
            { $ref: '#/components/messages/AppointmentConfirmed' },
            { $ref: '#/components/messages/AppointmentCancelled' }
          ]
        }
      }
    }
  },
  components: {
    messages: {
      AppointmentBooked: envelope('AppointmentBooked', 'Consulta agendada, aguardando pagamento'),
      AppointmentRescheduled: envelope('AppointmentRescheduled', 'Consulta reagendada'),
      AppointmentConfirmed: envelope('AppointmentConfirmed', 'Pagamento aprovado, consulta confirmada'),
      AppointmentCancelled: envelope('AppointmentCancelled', 'Consulta cancelada (com motivo)')
    }
  }
};

/** Página /docs/events/ com o AsyncAPI renderizado (componente oficial carregado do CDN). */
export function registerEventDocs(app) {
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>VetFlow - AsyncAPI (eventos)</title>
  <link rel="stylesheet" href="https://unpkg.com/@asyncapi/react-component@1.4.10/styles/default.min.css" />
  <style>body{margin:0;font-family:sans-serif} pre{padding:16px;background:#f6f8fa;white-space:pre-wrap}</style>
</head>
<body>
  <div id="asyncapi"></div>
  <script src="https://unpkg.com/@asyncapi/react-component@1.4.10/browser/standalone/index.js"></script>
  <script>
    const base = location.href.split(/[?#]/)[0].replace(/\\/?$/, '/');
    fetch(base + 'asyncapi.json').then(r => r.json()).then(schema => {
      try {
        AsyncApiStandalone.render({ schema, config: { show: { sidebar: true } } }, document.getElementById('asyncapi'));
      } catch (e) {
        document.getElementById('asyncapi').innerHTML = '<h1>AsyncAPI</h1><pre>' + JSON.stringify(schema, null, 2) + '</pre>';
      }
      setTimeout(() => {
        const el = document.getElementById('asyncapi');
        if (!el.innerHTML.trim()) el.innerHTML = '<h1>AsyncAPI</h1><pre>' + JSON.stringify(schema, null, 2) + '</pre>';
      }, 4000);
    });
  </script>
</body>
</html>`;
  app.get('/docs/events/asyncapi.json', (req, res) => res.json(asyncapi));
  app.get('/docs/events', (req, res) => {
    if (req.originalUrl.split('?')[0].endsWith('/')) return res.type('html').send(html);
    return res.redirect(301, 'events/');
  });
}
