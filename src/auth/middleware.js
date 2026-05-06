import jwt from 'jsonwebtoken';
import { findUserById, getUserKeys } from './users.js';

function getSecret() {
  return process.env.JWT_SECRET || 'dev-secret-change-in-production';
}

/**
 * Sign a JWT token for a user
 * @param {{ id: string, username: string }} user
 * @param {string} expiresIn - Token expiry (default: '7d')
 * @returns {string} JWT token
 */
export function signToken(user, expiresIn = '7d') {
  return jwt.sign(
    { id: user.id, username: user.username },
    getSecret(),
    { expiresIn }
  );
}

/**
 * Verify and decode a JWT token
 * @param {string} token
 * @returns {{ id: string, username: string }|null}
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, getSecret());
  } catch {
    return null;
  }
}

/**
 * Express middleware: requires valid JWT in Authorization header
 * Attaches req.user = { id, username } on success
 *
 * When SKIP_AUTH=true, bypasses token verification
 * and uses a fixed test user so smoke tests work without login.
 */
export function requireAuth(req, res, next) {
  if (process.env.SKIP_AUTH === 'true') {
    req.user = { id: 'test-user', username: 'test' };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  if (!findUserById(payload.id, req.app?.locals?.usersFile)) {
    return res.status(401).json({ error: 'User not found' });
  }

  req.user = { id: payload.id, username: payload.username };
  next();
}

/**
 * Express middleware: populates req.user if a valid JWT is present,
 * but does NOT reject the request if missing or invalid.
 */
export function optionalAuth(req, res, next) {
  if (process.env.SKIP_AUTH === 'true') {
    req.user = { id: 'test-user', username: 'test' };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (payload) {
      req.user = { id: payload.id, username: payload.username };
    }
  }

  next();
}

/**
 * Middleware to attach decrypted user API keys to request
 * Must be used after requireAuth or optionalAuth
 */
export function attachUserKeys(req, res, next) {
  if (req.user?.id) {
    req.userKeys = getUserKeys(req.user.id);
  } else {
    req.userKeys = {};
  }
  next();
}
