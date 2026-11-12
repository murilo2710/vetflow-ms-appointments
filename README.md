# VetFlow · ms-appointments (Serviço de Agenda · Azure SQL + Eventos)

Microserviço 2 do VetFlow. Cuida das **consultas** (agendar, reagendar, confirmar o pagamento, cancelar e excluir) e da **tabela de serviços e preços**. Usa banco próprio no **Azure SQL Database** (oferta gratuita) e publica **eventos de domínio** no **Azure Service Bus** pelo padrão **Transactional Outbox**.

**Alunos:** Bernardo Vieira · Murilo Regnier
PUCPR · Engenharia de Software · Arquitetura e Soluções Cloud · PJBL Entrega 3

## Links (nuvem)

| Item | URL |
|---|---|
| API (Azure Container Apps) | `https://vetflow-ms-appointments.<ambiente>.azurecontainerapps.io` |
| Swagger | `.../docs/` |
| AsyncAPI (Swagger dos eventos) | `.../docs/events/` |
| Imagem Docker Hub | `https://hub.docker.com/r/<usuario>/vetflow-ms-appointments` |

## Arquitetura

```
src/
  domain/          appointment.js (regras da agenda), events.js (eventos de domínio), errors.js
  application/
    ports.js       AppointmentRepository, ServiceCatalog, OutboxReader, Clock, IdGenerator
    features/      CreateAppointment, GetAppointment, ListAppointments, UpdateAppointment,
                   CancelAppointment, ConfirmAppointment, DeleteAppointment, ListServices, ListDomainEvents
  infrastructure/
    persistence/sql/     SqlDatabase (migração idempotente), SqlAppointmentRepository, SqlServiceCatalog
    persistence/         InMemoryStores (dev/testes), seed.js
    messaging/           OutboxDispatcher, ServiceBusEventPublisher, HttpEventPublisher, LogEventPublisher
  api/             features/<Feature>/endpoint.js, openapi.js, asyncapi.js, http/
  main.js          composition root
```

### Regras de negócio
- **Preço** sempre vem da tabela de serviços (`priceOf`), nunca do cliente.
- Agendamento com **no mínimo 2h** de antecedência e no máximo 90 dias.
- O mesmo veterinário não pode ter **duas consultas ativas sobrepostas**. A checagem roda numa transação `SERIALIZABLE` com `UPDLOCK, HOLDLOCK`, e o índice único filtrado `appointment_one_active_per_vet_start` é a segunda barreira (409).
- Reagendar só antes do pagamento; confirmar só consulta agendada e futura.
- Consulta **paga** só pode ser cancelada com **24h** de antecedência; o cancelamento exige motivo.
- Consulta paga não é excluída (precisa ser cancelada).

### Eventos (EDA)
`AppointmentBooked`, `AppointmentRescheduled`, `AppointmentConfirmed`, `AppointmentCancelled`.
1. O caso de uso grava a consulta **e** o evento na tabela `outbox_event`, na mesma transação.
2. O `OutboxDispatcher` publica os pendentes na fila `vetflow-eventos` do Service Bus a cada 5 s (`messageId = eventId`).
3. A Azure Function `processarEventoConsulta` (Service Bus trigger) consome o evento e gera a notificação do tutor.

Se o Service Bus estiver fora, o evento continua pendente e é reenviado (entrega pelo menos uma vez). `GET /events` mostra cada evento e quando foi publicado.

### Endpoints
| Método | Rota | Feature |
|---|---|---|
| GET | `/appointments?status=&petId=&vetName=&from=&to=` | ListAppointments |
| POST | `/appointments` | CreateAppointment → AppointmentBooked |
| GET | `/appointments/{id}` | GetAppointment |
| PUT | `/appointments/{id}` | UpdateAppointment → AppointmentRescheduled |
| PATCH | `/appointments/{id}/confirm` | ConfirmAppointment → AppointmentConfirmed |
| PATCH | `/appointments/{id}/cancel` | CancelAppointment → AppointmentCancelled |
| DELETE | `/appointments/{id}` | DeleteAppointment |
| GET | `/services` | ListServices |
| GET | `/events` | ListDomainEvents |

## Tecnologias
Node.js 22, Express 4, `mssql` (Azure SQL Database), `@azure/service-bus`, Docker, GitHub Actions, `node:test`.

## Como rodar localmente

```bash
npm install
npm test
npm start                                   # sem variáveis: banco em memória e eventos no log
SQL_CONNECTION_STRING="Server=tcp:...;..." SERVICEBUS_CONNECTION="Endpoint=sb://..." npm start
```
As tabelas `service`, `appointment` e `outbox_event` são criadas automaticamente na primeira execução. O Azure SQL gratuito pausa quando fica ocioso; o serviço tenta conectar de novo por até 1 minuto.

## Docker

```bash
docker build -t <usuario-dockerhub>/vetflow-ms-appointments:v1 .
docker login
docker push <usuario-dockerhub>/vetflow-ms-appointments:v1
```
O workflow de CI publica a imagem automaticamente quando os secrets do Docker Hub existem.
