import { asyncRoute } from '../../http/asyncRoute.js';

/** GET /appointments?status=&petId=&vetName=&from=&to= */
export function register(router, handler) {
  router.get('/appointments', asyncRoute(async (req, res) => {
    const { status, petId, vetName, from, to } = req.query;
    res.json(await handler.execute({ status, petId, vetName, from, to }));
  }));
}
