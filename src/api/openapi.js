// Documentação OpenAPI 3 do Serviço de Agenda (Swagger em /docs).
const err = (description) => ({ description, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } });
const json = (schema) => ({ 'application/json': { schema } });
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const appt = { $ref: '#/components/schemas/Appointment' };

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'VetFlow - Serviço de Agenda (ms-appointments)',
    version: '1.0.0',
    description: 'Microserviço de consultas do VetFlow. Banco: Azure SQL Database (database per service). ' +
      'Publica eventos de domínio no Azure Service Bus pelo padrão Transactional Outbox ' +
      '(contrato AsyncAPI em /docs/events/). Autores: Bernardo Vieira e Murilo Regnier.'
  },
  servers: [{ url: '/', description: 'Este servidor' }],
  tags: [{ name: 'Consultas' }, { name: 'Serviços' }, { name: 'Eventos' }, { name: 'Health' }],
  paths: {
    '/appointments': {
      get: {
        tags: ['Consultas'], summary: 'Agenda: listar consultas (ListAppointments)',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['SCHEDULED', 'CONFIRMED', 'CANCELLED', 'COMPLETED'] } },
          { name: 'petId', in: 'query', schema: { type: 'string' } },
          { name: 'vetName', in: 'query', schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } }
        ],
        responses: { 200: { description: 'Consultas ordenadas por horário', content: json({ type: 'array', items: appt }) }, 400: err('Filtro inválido') }
      },
      post: {
        tags: ['Consultas'], summary: 'Agendar consulta (CreateAppointment) - publica AppointmentBooked',
        description: 'Regras: antecedência mínima de 2h, agenda aberta por 90 dias, preço vindo da tabela de serviços ' +
          '(nunca do cliente) e veterinário sem outra consulta ativa no intervalo.',
        requestBody: { required: true, content: json({ $ref: '#/components/schemas/AppointmentInput' }) },
        responses: { 201: { description: 'Agendada', content: json(appt) }, 400: err('Dados inválidos'), 409: err('Conflito de horário') }
      }
    },
    '/appointments/{id}': {
      get: { tags: ['Consultas'], summary: 'Consultar (GetAppointment)', parameters: [idParam], responses: { 200: { description: 'OK', content: json(appt) }, 404: err('Não encontrada') } },
      put: {
        tags: ['Consultas'], summary: 'Reagendar/alterar (UpdateAppointment) - publica AppointmentRescheduled', parameters: [idParam],
        requestBody: { required: true, content: json({ $ref: '#/components/schemas/AppointmentChanges' }) },
        responses: { 200: { description: 'Alterada', content: json(appt) }, 400: err('Dados inválidos'), 404: err('Não encontrada'), 409: err('Status não permite ou conflito de horário') }
      },
      delete: {
        tags: ['Consultas'], summary: 'Excluir (DeleteAppointment) - só agendadas não pagas ou canceladas', parameters: [idParam],
        responses: { 204: { description: 'Excluída' }, 404: err('Não encontrada'), 409: err('Consulta confirmada não pode ser excluída') }
      }
    },
    '/appointments/{id}/confirm': {
      patch: {
        tags: ['Consultas'], summary: 'Confirmar após pagamento (ConfirmAppointment) - publica AppointmentConfirmed', parameters: [idParam],
        responses: { 200: { description: 'Confirmada', content: json(appt) }, 404: err('Não encontrada'), 409: err('Status não permite') }
      }
    },
    '/appointments/{id}/cancel': {
      patch: {
        tags: ['Consultas'], summary: 'Cancelar (CancelAppointment) - publica AppointmentCancelled',
        description: 'Consulta paga (CONFIRMED) só pode ser cancelada com 24h de antecedência.', parameters: [idParam],
        requestBody: { required: true, content: json({ type: 'object', required: ['reason'], properties: { reason: { type: 'string', example: 'Tutor viajou' } } }) },
        responses: { 200: { description: 'Cancelada', content: json(appt) }, 400: err('Motivo obrigatório'), 404: err('Não encontrada'), 409: err('Fora do prazo ou status não permite') }
      }
    },
    '/services': {
      get: { tags: ['Serviços'], summary: 'Tabela de serviços e preços (ListServices)', responses: { 200: { description: 'OK', content: json({ type: 'array', items: { $ref: '#/components/schemas/Service' } }) } } }
    },
    '/events': {
      get: {
        tags: ['Eventos'], summary: 'Eventos de domínio gravados no outbox (ListDomainEvents)',
        description: 'Mostra cada evento e quando foi publicado no Azure Service Bus (sentAt). Contrato completo em /docs/events/.',
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } }],
        responses: { 200: { description: 'OK', content: json({ type: 'array', items: { $ref: '#/components/schemas/OutboxEntry' } }) } }
      }
    },
    '/health': { get: { tags: ['Health'], summary: 'Saúde do serviço e do Azure SQL', responses: { 200: { description: 'OK' }, 503: { description: 'Banco indisponível' } } } }
  },
  components: {
    schemas: {
      Error: {
        type: 'object',
        properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' }, details: { type: 'object' } } } }
      },
      AppointmentInput: {
        type: 'object',
        required: ['petId', 'petName', 'tutorEmail', 'vetName', 'serviceId', 'startsAt'],
        properties: {
          petId: { type: 'string', example: '6733a1f0c2b4e5a1d2f3a4b5' },
          petName: { type: 'string', example: 'Thor' },
          tutorEmail: { type: 'string', format: 'email', example: 'ana@email.com' },
          vetName: { type: 'string', example: 'Dra. Carla Mendes' },
          serviceId: { type: 'string', example: 'consulta-clinica' },
          startsAt: { type: 'string', format: 'date-time', example: '2026-11-20T14:00:00-03:00' },
          notes: { type: 'string', example: 'Coçando a orelha há 3 dias' }
        }
      },
      AppointmentChanges: {
        type: 'object',
        properties: {
          vetName: { type: 'string' }, serviceId: { type: 'string' },
          startsAt: { type: 'string', format: 'date-time' }, notes: { type: 'string' }
        }
      },
      Appointment: {
        allOf: [
          { $ref: '#/components/schemas/AppointmentInput' },
          {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              serviceName: { type: 'string' },
              endsAt: { type: 'string', format: 'date-time' },
              priceCents: { type: 'integer', example: 15000 },
              status: { type: 'string', enum: ['SCHEDULED', 'CONFIRMED', 'CANCELLED', 'COMPLETED'] },
              cancelReason: { type: 'string', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' }
            }
          }
        ]
      },
      Service: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'consulta-clinica' }, name: { type: 'string', example: 'Consulta clínica' },
          priceCents: { type: 'integer', example: 15000 }, durationMin: { type: 'integer', example: 30 }, active: { type: 'boolean' }
        }
      },
      OutboxEntry: {
        type: 'object',
        properties: {
          id: { type: 'string' }, type: { type: 'string', example: 'AppointmentBooked' }, payload: { type: 'object' },
          occurredAt: { type: 'string', format: 'date-time' }, sentAt: { type: 'string', format: 'date-time', nullable: true },
          attempts: { type: 'integer' }, lastError: { type: 'string', nullable: true }
        }
      }
    }
  }
};
