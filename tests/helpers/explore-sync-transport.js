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
