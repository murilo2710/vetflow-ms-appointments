import { asyncRoute } from '../../http/asyncRoute.js';

/** GET /services */
export function register(router, handler) {
  router.get('/services', asyncRoute(async (req, res) => {
    res.json(await handler.execute());
  }));
}
