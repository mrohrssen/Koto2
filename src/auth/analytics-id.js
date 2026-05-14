import { createHmac } from 'node:crypto';

const ANALYTICS_ID_PREFIX = 'ka_';
const ANALYTICS_ID_LENGTH = 32;

export function getAnalyticsId(userId, env = process.env) {
  if (!userId || typeof userId !== 'string') return null;

  const secret = env?.ANALYTICS_ID_SECRET;
  if (!secret || typeof secret !== 'string') return null;

  const digest = createHmac('sha256', secret)
    .update(userId)
    .digest('hex')
    .slice(0, ANALYTICS_ID_LENGTH);

  return `${ANALYTICS_ID_PREFIX}${digest}`;
}
