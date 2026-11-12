import { asyncRoute } from '../../http/asyncRoute.js';

/** GET /appointments/{id} */
export function register(router, handler) {
  router.get('/appointments/:id', asyncRoute(async (req, res) => {
    res.json(await handler.execute({ id: req.params.id }));
  }));
}
