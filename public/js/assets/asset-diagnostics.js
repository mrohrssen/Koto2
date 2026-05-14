const enabled = typeof __ASSET_DIAGNOSTICS__ !== 'undefined' && __ASSET_DIAGNOSTICS__;
const events = [];

export function recordAssetEvent(event) {
  if (!enabled) return;
  events.push({ ...event, timestamp: Date.now() });
}

export function getAssetLoadStats() {
  return events.slice();
}

export function resetAssetDiagnosticsForTests() {
  events.length = 0;
}

if (enabled && typeof window !== 'undefined') {
  window.__assetStats = getAssetLoadStats;
}
