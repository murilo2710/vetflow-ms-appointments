import { asyncRoute } from '../../http/asyncRoute.js';

/** PATCH /appointments/{id}/confirm (pagamento aprovado) */
export function register(router, handler) {
  router.patch('/appointments/:id/confirm', asyncRoute(async (req, res) => {
    res.json(await handler.execute({ id: req.params.id }));
  }));
}
