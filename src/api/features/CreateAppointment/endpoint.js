import { asyncRoute } from '../../http/asyncRoute.js';

/** POST /appointments */
export function register(router, handler) {
  router.post('/appointments', asyncRoute(async (req, res) => {
    const appointment = await handler.execute(req.body ?? {});
    res.status(201).location(`/appointments/${appointment.id}`).json(appointment);
  }));
}
