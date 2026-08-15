function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const TRANSPORT_KEYS = [
  'transport',
  'httpStatus',
  'body',
  'parseError',
  'networkError',
  'aborted',
  'clientAuthMismatch',
  'authRevision',
];

function isCompleteTransportEnvelope(transport) {
  return isObject(transport)
    && TRANSPORT_KEYS.every(key => Object.hasOwn(transport, key))
    && transport.transport === true
    && Number.isInteger(transport.httpStatus)
    && transport.httpStatus >= 0
    && (transport.parseError === null || typeof transport.parseError === 'object')
    && (transport.networkError === null || typeof transport.networkError === 'object')
    && typeof transport.aborted === 'boolean'
    && typeof transport.clientAuthMismatch === 'boolean'
    && Number.isInteger(transport.authRevision)
    && transport.authRevision >= 0;
}

function isV1Envelope(body) {
  if (
    !isObject(body)
    || (Object.hasOwn(body, 'protocolVersion') && body.protocolVersion !== 1)
    || !Array.isArray(body.results)
  ) return false;
  if (body.status === 'ok') return Number.isInteger(body.confirmedThroughSeq);
  return body.status === 'corrected'
    && (body.confirmedThroughSeq === null || Number.isInteger(body.confirmedThroughSeq))
    && Number.isInteger(body.rejectedSeq);
}

function isV2Envelope(body) {
  return isObject(body)
    && body.protocolVersion === 2
    && (body.status === 'ok' || body.status === 'corrected')
    && typeof body.runId === 'string'
    && body.runId.length > 0
    && Number.isInteger(body.appliedThroughSeq)
    && Number.isInteger(body.nextExpectedSeq)
    && Array.isArray(body.results);
}

function isV2Conflict(body) {
  return isObject(body)
    && body.protocolVersion === 2
    && body.status === 'conflict'
    && typeof body.reason === 'string'
    && body.reason.length > 0;
}

export function classifyExploreTransport({
  expectedProtocolVersion = 1,
  ...transport
} = {}) {
  if (!isCompleteTransportEnvelope(transport)) return 'indeterminate';
  const {
    httpStatus,
    body,
    parseError,
    networkError,
    aborted,
    clientAuthMismatch,
  } = transport;
  if (httpStatus === 401 || clientAuthMismatch) return 'authRequired';
  if (networkError || aborted || parseError) return 'indeterminate';
  if (httpStatus === 429 || httpStatus >= 500 || httpStatus < 200) return 'indeterminate';
  if (expectedProtocolVersion !== 1 && expectedProtocolVersion !== 2) return 'indeterminate';
  if (httpStatus === 409) {
    if (isV2Conflict(body)) return 'conflict';
    if (expectedProtocolVersion === 2) return 'indeterminate';
    return isV1Envelope(body) && body.status === 'corrected' ? 'v1Settled' : 'indeterminate';
  }
  if (httpStatus < 200 || httpStatus >= 300) return 'indeterminate';
  if (isV2Envelope(body)) return 'unsupportedProtocol';
  if (expectedProtocolVersion === 2) return 'indeterminate';
  return isV1Envelope(body) ? 'v1Settled' : 'indeterminate';
}
