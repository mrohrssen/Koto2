const MANIFEST_PATH = '/assets/asset-manifest.json';

let manifestPromise = null;
let manifestValue = null;

export function normalizeAssetManifest(raw) {
  if (!raw || typeof raw !== 'object') return { version: '', creatures: {}, backgrounds: {}, actions: [] };
  return {
    version: raw.version || '',
    creatures: raw.creatures && typeof raw.creatures === 'object' ? raw.creatures : {},
    backgrounds: raw.backgrounds && typeof raw.backgrounds === 'object' ? raw.backgrounds : {},
    actions: Array.isArray(raw.actions) ? raw.actions : [],
  };
}

export function startAssetManifestLoad(fetchImpl = fetch) {
  if (!manifestPromise) {
    manifestPromise = fetchImpl(MANIFEST_PATH)
      .then(response => response.ok ? response.json() : null)
      .then(normalizeAssetManifest)
      .then(manifest => {
        manifestValue = manifest;
        return manifest;
      })
      .catch(() => {
        manifestValue = normalizeAssetManifest(null);
        return manifestValue;
      });
  }
  return manifestPromise;
}

export function getAssetManifestSnapshot() {
  return manifestValue;
}

export function hasCreatureIdle(id) {
  return !!manifestValue?.creatures?.[id]?.idle;
}

export function resetAssetManifestForTests() {
  manifestPromise = null;
  manifestValue = null;
}
