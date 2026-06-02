import { Router } from 'express';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

function normalizeHostname(hostname) {
  return String(hostname || '').toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
}

function isLoopbackRemoteAddress(remoteAddress) {
  return remoteAddress === '127.0.0.1'
    || remoteAddress === '::1'
    || remoteAddress === '::ffff:127.0.0.1';
}

export function isSafeLocalAdminSecretOrigin(origin) {
  if (!origin) {
    return true;
  }

  try {
    const url = new URL(origin);
    return LOCAL_HOSTNAMES.has(normalizeHostname(url.hostname));
  } catch {
    return false;
  }
}

export function isLocalAdminSecretRequest(req) {
  const hostname = normalizeHostname(req.hostname);
  const remoteAddress = req.socket?.remoteAddress || req.ip || '';
  return LOCAL_HOSTNAMES.has(hostname)
    && isLoopbackRemoteAddress(remoteAddress)
    && isSafeLocalAdminSecretOrigin(req.get?.('origin'));
}

export function isLocalAdminSecretEnabled() {
  return process.env.ENABLE_LOCAL_ADMIN_SECRET === '1';
}

export function createAdminSecretRouter() {
  const router = Router();

  router.get('/secret', (req, res) => {
    const secret = process.env.ADMIN_SECRET || '';
    if (!secret || !isLocalAdminSecretEnabled() || !isLocalAdminSecretRequest(req)) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.json({ secret });
  });

  return router;
}
