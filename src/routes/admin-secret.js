import { Router } from 'express';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

export function isLocalAdminSecretRequest(req) {
  const hostname = req.hostname || '';
  const remoteAddress = req.socket?.remoteAddress || req.ip || '';
  if (hostname) {
    return LOCAL_HOSTNAMES.has(hostname);
  }

  return remoteAddress === '127.0.0.1'
    || remoteAddress === '::1'
    || remoteAddress === '::ffff:127.0.0.1';
}

export function createAdminSecretRouter() {
  const router = Router();

  router.get('/secret', (req, res) => {
    const secret = process.env.ADMIN_SECRET || '';
    if (!secret || !isLocalAdminSecretRequest(req)) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.json({ secret });
  });

  return router;
}
