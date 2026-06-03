import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { verifyPassword } from '../auth/crypto.js';

export const ADMIN_COOKIE_NAME = 'koto_admin';

function getJwtSecret() {
  return process.env.JWT_SECRET || 'dev-secret-change-in-production';
}

function hasAdminCredentials() {
  return Boolean(process.env.ADMIN_USER && process.env.ADMIN_PASS_HASH);
}

function getCookie(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  for (const cookie of cookies) {
    const [rawKey, ...rawValue] = cookie.split('=');
    const key = rawKey?.trim();
    if (key === name) {
      return decodeURIComponent(rawValue.join('=').trim());
    }
  }
  return '';
}

function isHttpsRequest(req) {
  return req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https';
}

function adminCookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttpsRequest(req),
    path: '/',
    maxAge: 12 * 60 * 60 * 1000,
  };
}

function clearAdminCookieOptions(req) {
  const { maxAge, ...options } = adminCookieOptions(req);
  return options;
}

export function signAdminToken(username) {
  return jwt.sign(
    { scope: 'admin', username },
    getJwtSecret(),
    { expiresIn: '12h' }
  );
}

export function verifyAdminToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, getJwtSecret());
    if (payload?.scope !== 'admin' || payload.username !== process.env.ADMIN_USER) {
      return null;
    }
    return { username: payload.username };
  } catch {
    return null;
  }
}

export function getAdminSession(req) {
  return verifyAdminToken(getCookie(req, ADMIN_COOKIE_NAME));
}

function hasValidLegacySecret(req) {
  const adminSecret = process.env.ADMIN_SECRET || '';
  return Boolean(adminSecret && req.headers['x-admin-secret'] === adminSecret);
}

/**
 * Admin middleware for protected operations.
 *
 * Prefer a real admin session cookie. Keep x-admin-secret as a compatibility
 * path for scripts and older one-off admin pages.
 */
export function adminAuth(req, res, next) {
  if (hasValidLegacySecret(req)) {
    return next();
  }

  const session = getAdminSession(req);
  if (session) {
    req.admin = session;
    return next();
  }

  const legacySecretConfigured = Boolean(process.env.ADMIN_SECRET);
  if (!hasAdminCredentials() && !legacySecretConfigured) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (!hasAdminCredentials()) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  return res.status(401).json({ error: 'Admin login required' });
}

export default function createAdminAuthRoutes() {
  const router = Router();

  router.post('/login', async (req, res) => {
    const username = String(req.body?.username || '');
    const password = String(req.body?.password || '');

    if (!username || !password) {
      return res.status(400).json({ error: 'Admin username and password required' });
    }

    if (!hasAdminCredentials()) {
      return res.status(503).json({ error: 'Admin credentials not configured' });
    }

    const valid = username === process.env.ADMIN_USER
      && await verifyPassword(password, process.env.ADMIN_PASS_HASH);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }

    res.cookie(ADMIN_COOKIE_NAME, signAdminToken(username), adminCookieOptions(req));
    return res.json({ authenticated: true, username });
  });

  router.get('/session', (req, res) => {
    const session = getAdminSession(req);
    if (!session) {
      return res.json({ authenticated: false });
    }
    return res.json({ authenticated: true, username: session.username });
  });

  router.post('/logout', (req, res) => {
    res.clearCookie(ADMIN_COOKIE_NAME, clearAdminCookieOptions(req));
    return res.json({ authenticated: false });
  });

  return router;
}
