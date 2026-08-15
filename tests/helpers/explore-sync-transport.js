export const EXPLORE_TRANSPORT_KEYS = [
  'transport',
  'httpStatus',
  'body',
  'parseError',
  'networkError',
  'aborted',
  'clientAuthMismatch',
  'authRevision',
];

export function makeExploreTransport(overrides = {}) {
  return {
    transport: true,
    httpStatus: 0,
    body: null,
    parseError: null,
    networkError: null,
    aborted: false,
    clientAuthMismatch: false,
    authRevision: 0,
    ...overrides,
  };
}

export function makeExploreV1OkTransport(request = {}, bodyOverrides = {}) {
  const entries = Array.isArray(request.entries) ? request.entries : [];
  return makeExploreTransport({
    httpStatus: 200,
    body: {
      protocolVersion: 1,
      status: 'ok',
      confirmedThroughSeq: entries.at(-1)?.seq ?? 0,
      results: [],
      ...bodyOverrides,
    },
  });
}
