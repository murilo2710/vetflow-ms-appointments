import express from 'express';
import { cors, requestLog } from './http/middlewares.js';
import { errorHandler, notFoundHandler } from './http/errors.js';
import { registerDocs } from './http/docs.js';
import { openapi } from './openapi.js';
import { registerEventDocs } from './asyncapi.js';
import * as CreateAppointment from './features/CreateAppointment/endpoint.js';
import * as ListAppointments from './features/ListAppointments/endpoint.js';
import * as GetAppointment from './features/GetAppointment/endpoint.js';
import * as UpdateAppointment from './features/UpdateAppointment/endpoint.js';
import * as CancelAppointment from './features/CancelAppointment/endpoint.js';
import * as ConfirmAppointment from './features/ConfirmAppointment/endpoint.js';
import * as DeleteAppointment from './features/DeleteAppointment/endpoint.js';
import * as ListServices from './features/ListServices/endpoint.js';
import * as ListDomainEvents from './features/ListDomainEvents/endpoint.js';

/** Monta a aplicação HTTP com os casos de uso recebidos do composition root (src/main.js). */
export function createApp({ handlers, health, corsOrigin = '*', serviceName = 'vetflow-ms-appointments', info = {} }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestLog(serviceName));
  app.use(cors(corsOrigin));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', async (req, res) => {
    try {
      await health();
      res.json({ status: 'ok', service: serviceName, ...info });
    } catch (e) {
      res.status(503).json({ status: 'unavailable', service: serviceName, reason: e.message });
    }
  });
  registerEventDocs(app);
  registerDocs(app, openapi);

  const router = express.Router();
  ListAppointments.register(router, handlers.listAppointments);
  CreateAppointment.register(router, handlers.createAppointment);
  GetAppointment.register(router, handlers.getAppointment);
  UpdateAppointment.register(router, handlers.updateAppointment);
  CancelAppointment.register(router, handlers.cancelAppointment);
  ConfirmAppointment.register(router, handlers.confirmAppointment);
  DeleteAppointment.register(router, handlers.deleteAppointment);
  ListServices.register(router, handlers.listServices);
  ListDomainEvents.register(router, handlers.listDomainEvents);
  app.use(router);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
