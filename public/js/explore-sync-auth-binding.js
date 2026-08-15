let binding = null;
let authRevision = 0;

function storageToken() {
  try {
    return globalThis.localStorage?.getItem('authToken') ?? null;
  } catch {
    return null;
  }
}

export function bindExploreSyncAuthPrincipal({ principalId, token } = {}) {
  if (
    typeof principalId !== 'string'
    || principalId.length === 0
    || typeof token !== 'string'
    || token.length === 0
  ) {
    clearExploreSyncAuthPrincipal();
    return;
  }
  if (binding?.principalId === principalId && binding.token === token) return;
  binding = { principalId, token };
  authRevision += 1;
}

export function clearExploreSyncAuthPrincipal() {
  if (!binding) return;
  binding = null;
  authRevision += 1;
}

export function captureExploreSyncAuthLease() {
  const capturedBinding = binding;
  const capturedRevision = authRevision;
  return {
    label: 'explore sync auth',
    authRevision: capturedRevision,
    token: capturedBinding?.token ?? null,
    isCurrent() {
      return Boolean(capturedBinding)
        && capturedRevision === authRevision
        && binding?.principalId === capturedBinding.principalId
        && binding?.token === capturedBinding.token
        && storageToken() === capturedBinding.token;
    },
  };
}

export function isExploreSyncResponseAuthCurrent(transport) {
  const lease = captureExploreSyncAuthLease();
  return Number.isInteger(transport?.authRevision)
    && transport.authRevision === lease.authRevision
    && lease.isCurrent();
}
