const MAX_ERRORS_PER_USER = 30;
const MAX_USERS = 200;
const userErrors = new Map();

export function captureError(userId, { route, method, message, stack }) {
  if (!userId) return;

  if (!userErrors.has(userId)) {
    // Evict oldest user entry if at capacity (Map preserves insertion order)
    if (userErrors.size >= MAX_USERS) {
      const oldestKey = userErrors.keys().next().value;
      userErrors.delete(oldestKey);
    }
    userErrors.set(userId, []);
  }

  const buffer = userErrors.get(userId);
  buffer.push({
    route: (route || '').slice(0, 200),
    method: method || 'UNKNOWN',
    message: (message || '').slice(0, 500),
    stack: (stack || '').slice(0, 300),
    timestamp: new Date().toISOString()
  });

  if (buffer.length > MAX_ERRORS_PER_USER) {
    buffer.shift();
  }
}

export function getErrors(userId) {
  if (!userId) return [];
  return [...(userErrors.get(userId) || [])];
}
