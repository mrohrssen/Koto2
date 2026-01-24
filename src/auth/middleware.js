import jwt from 'jsonwebtoken';

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
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = { id: payload.id, username: payload.username };
  next();
}
