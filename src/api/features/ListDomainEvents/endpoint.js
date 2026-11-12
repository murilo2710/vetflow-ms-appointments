import { asyncRoute } from '../../http/asyncRoute.js';

/** GET /events?limit= (eventos do outbox e status de publicação) */
export function register(router, handler) {
  router.get('/events', asyncRoute(async (req, res) => {
    res.json(await handler.execute({ limit: req.query.limit }));
  }));
}
