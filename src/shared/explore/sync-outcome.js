function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isV1Envelope(body) {
  if (!isObject(body) || !Array.isArray(body.results)) return false;
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
  httpStatus = 0,
  body = null,
  parseError = null,
  networkError = null,
  aborted = false,
} = {}) {
  if (networkError || aborted || parseError) return 'indeterminate';
  if (httpStatus === 401) return 'authRequired';
  if (httpStatus === 429 || httpStatus >= 500 || httpStatus < 200) return 'indeterminate';
  if (httpStatus === 409 && isV2Conflict(body)) return 'conflict';

  if (expectedProtocolVersion === 2) {
    return isV2Envelope(body) ? 'settled' : 'indeterminate';
  }
  return isV1Envelope(body) || isV2Envelope(body) ? 'settled' : 'indeterminate';
}
