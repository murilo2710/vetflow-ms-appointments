// Composition root: único lugar que conhece as implementações concretas.
import { loadConfig } from './infrastructure/config.js';
import { systemClock, uuidGenerator } from './infrastructure/system.js';
import { connectSql, ensureSchema } from './infrastructure/persistence/sql/SqlDatabase.js';
import { SqlAppointmentRepository, SqlServiceCatalog } from './infrastructure/persistence/sql/SqlAppointmentRepository.js';
import { InMemoryAppointmentRepository, InMemoryServiceCatalog } from './infrastructure/persistence/InMemoryStores.js';
import { ServiceBusEventPublisher, HttpEventPublisher, LogEventPublisher } from './infrastructure/messaging/publishers.js';
import { OutboxDispatcher } from './infrastructure/messaging/OutboxDispatcher.js';
import { CreateAppointmentHandler } from './application/features/CreateAppointment/handler.js';
import { ListAppointmentsHandler } from './application/features/ListAppointments/handler.js';
import { GetAppointmentHandler } from './application/features/GetAppointment/handler.js';
import { UpdateAppointmentHandler } from './application/features/UpdateAppointment/handler.js';
import { CancelAppointmentHandler } from './application/features/CancelAppointment/handler.js';
import { ConfirmAppointmentHandler } from './application/features/ConfirmAppointment/handler.js';
import { DeleteAppointmentHandler } from './application/features/DeleteAppointment/handler.js';
import { ListServicesHandler } from './application/features/ListServices/handler.js';
import { ListDomainEventsHandler } from './application/features/ListDomainEvents/handler.js';
import { createApp } from './api/app.js';

async function main() {
  const config = loadConfig();

  let appointmentRepository;
  let serviceCatalog;
  if (config.dbMode === 'sql') {
    const pool = await connectSql(config.sqlConnectionString);
    await ensureSchema(pool);
    appointmentRepository = new SqlAppointmentRepository(pool);
    serviceCatalog = new SqlServiceCatalog(pool);
  } else {
    console.warn('[ms-appointments] SQL_CONNECTION_STRING não definido: usando armazenamento em memória (somente desenvolvimento).');
    appointmentRepository = new InMemoryAppointmentRepository();
    serviceCatalog = new InMemoryServiceCatalog();
  }

  const publisher = config.eventsMode === 'servicebus'
    ? new ServiceBusEventPublisher(config.serviceBusConnection, config.serviceBusEntity)
    : config.eventsMode === 'http' ? new HttpEventPublisher(config.eventsHttpUrl) : new LogEventPublisher();
  const dispatcher = new OutboxDispatcher({
    outboxStore: appointmentRepository, publisher, clock: systemClock, intervalMs: config.outboxIntervalMs
  });
  dispatcher.start();

  const deps = {
    appointmentRepository,
    serviceCatalog,
    outboxReader: appointmentRepository,
    clock: systemClock,
    idGenerator: uuidGenerator
  };
  const handlers = {
    createAppointment: new CreateAppointmentHandler(deps),
    listAppointments: new ListAppointmentsHandler(deps),
    getAppointment: new GetAppointmentHandler(deps),
    updateAppointment: new UpdateAppointmentHandler(deps),
    cancelAppointment: new CancelAppointmentHandler(deps),
    confirmAppointment: new ConfirmAppointmentHandler(deps),
    deleteAppointment: new DeleteAppointmentHandler(deps),
    listServices: new ListServicesHandler(deps),
    listDomainEvents: new ListDomainEventsHandler(deps)
  };

  const app = createApp({
    handlers,
    health: () => appointmentRepository.ping(),
    corsOrigin: config.corsOrigin,
    serviceName: config.serviceName,
    info: { database: config.dbMode, events: publisher.name }
  });
  app.listen(config.port, () => {
    console.log(`[ms-appointments] porta ${config.port} | banco: ${config.dbMode} | eventos: ${publisher.name} | Swagger em /docs`);
  });
}

main().catch((err) => {
  console.error('[ms-appointments] falha ao iniciar:', err);
  process.exit(1);
});
