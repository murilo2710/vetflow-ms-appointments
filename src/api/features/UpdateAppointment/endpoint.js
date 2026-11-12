import { asyncRoute } from '../../http/asyncRoute.js';

/** PUT /appointments/{id} (reagendar) */
export function register(router, handler) {
  router.put('/appointments/:id', asyncRoute(async (req, res) => {
    res.json(await handler.execute({ id: req.params.id, changes: req.body ?? {} }));
  }));
}
