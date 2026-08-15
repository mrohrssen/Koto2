import { makeExploreTransport } from '../../helpers/explore-sync-transport.js';

function cloneValue(value) {
  if (value === undefined) return undefined;
  return structuredClone(value);
}

export function createFaultLink({ client, scheduler, path = '/api/game/explore/sync' } = {}) {
  if (typeof client?.post !== 'function') throw new Error('authenticated API client required');
  if (typeof scheduler?.wait !== 'function') throw new Error('virtual scheduler required');

  const operations = [];
  const requests = [];
  const serverResponses = [];

  async function send(payload) {
    const response = await client.post(path, payload);
    serverResponses.push(cloneValue(response));
    return response;
  }

  async function request(payload) {
    requests.push(cloneValue(payload));
    const operation = operations.shift() || { type: 'pass' };

    if (operation.type === 'dropBeforeRequest') {
      return makeExploreTransport({ networkError: new Error('request dropped before server') });
    }
    if (operation.type === 'respond') {
      return makeExploreTransport({
        httpStatus: operation.response.status,
        body: cloneValue(operation.response.body),
      });
    }
    if (operation.type === 'delay') {
      await scheduler.wait(operation.ms);
    }

    const response = await send(payload);
    if (operation.type === 'dropResponseAfterCommit') {
      return makeExploreTransport({ networkError: new Error('response dropped after server commit') });
    }
    if (operation.type === 'duplicate') {
      const replay = await send(payload);
      return makeExploreTransport({ httpStatus: replay.status, body: replay.body });
    }
    return makeExploreTransport({ httpStatus: response.status, body: response.body });
  }

  const link = {
    request,
    dropBeforeRequestOnce() {
      operations.push({ type: 'dropBeforeRequest' });
      return link;
    },
    dropResponseAfterCommitOnce() {
      operations.push({ type: 'dropResponseAfterCommit' });
      return link;
    },
    delayNext(ms) {
      operations.push({ type: 'delay', ms: Math.max(0, Number(ms) || 0) });
      return link;
    },
    respondOnce(response) {
      operations.push({ type: 'respond', response: cloneValue(response) });
      return link;
    },
    duplicateNext() {
      operations.push({ type: 'duplicate' });
      return link;
    },
    reset() {
      operations.length = 0;
      requests.length = 0;
      serverResponses.length = 0;
      return link;
    },
    requests,
    serverResponses,
  };

  return link;
}
