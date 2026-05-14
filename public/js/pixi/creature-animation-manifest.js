const MANIFEST_PATH = '/assets/sprites/creatures-animated/manifest.json';

let manifestPromise = null;
let manifestValue = null;
let manifestPending = false;

export function normalizeAnimationManifest(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    version: raw.version || '',
    frameWidth: Number(raw.frameWidth) || 256,
    frameHeight: Number(raw.frameHeight) || 256,
    columns: Number(raw.columns) || 6,
    frames: Number(raw.frames) || 24,
    fps: Number(raw.fps) || 12,
    renderScale: Number(raw.renderScale) || 1,
    animations: raw.animations && typeof raw.animations === 'object' ? raw.animations : {},
  };
}

export function startCreatureAnimationManifestLoad(fetchImpl = fetch) {
  if (!manifestPromise) {
    manifestPending = true;
    manifestPromise = fetchImpl(MANIFEST_PATH)
      .then(response => response.ok ? response.json() : null)
      .then(normalizeAnimationManifest)
      .then(manifest => {
        manifestValue = manifest;
        manifestPending = false;
        return manifest;
      })
      .catch(() => {
        manifestValue = null;
        manifestPending = false;
        return null;
      });
  }
  return manifestPromise;
}

export async function loadCreatureAnimationManifest(fetchImpl = fetch) {
  return startCreatureAnimationManifestLoad(fetchImpl);
}

export function getCreatureAnimationManifestSnapshot() {
  return manifestValue;
}

export function isCreatureAnimationManifestPending() {
  return manifestPending;
}

export function resetCreatureAnimationManifestForTests() {
  manifestPromise = null;
  manifestValue = null;
  manifestPending = false;
}

export function getAnimatedCreatureEntry(manifest, creatureId) {
  if (!manifest?.animations || !creatureId) return null;
  const entry = manifest.animations[creatureId];
  if (!entry?.idle && !entry?.walk) return null;
  return {
    ...entry,
    frameWidth: manifest.frameWidth,
    frameHeight: manifest.frameHeight,
    columns: manifest.columns,
    frames: manifest.frames,
    fps: manifest.fps,
    renderScale: manifest.renderScale,
  };
}
