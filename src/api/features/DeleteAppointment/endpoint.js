import { asyncRoute } from '../../http/asyncRoute.js';

/** DELETE /appointments/{id} */
export function register(router, handler) {
  router.delete('/appointments/:id', asyncRoute(async (req, res) => {
    await handler.execute({ id: req.params.id });
    res.status(204).end();
  }));
}
