import { asyncRoute } from '../../http/asyncRoute.js';

/** PATCH /appointments/{id}/cancel */
export function register(router, handler) {
  router.patch('/appointments/:id/cancel', asyncRoute(async (req, res) => {
    res.json(await handler.execute({ id: req.params.id, reason: req.body?.reason }));
  }));
}
