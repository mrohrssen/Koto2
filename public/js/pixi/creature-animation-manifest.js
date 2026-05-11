const MANIFEST_PATH = '/assets/sprites/creatures-animated/manifest.json';

let manifestPromise = null;

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

export async function loadCreatureAnimationManifest(fetchImpl = fetch) {
  if (!manifestPromise) {
    manifestPromise = fetchImpl(MANIFEST_PATH)
      .then(response => response.ok ? response.json() : null)
      .then(normalizeAnimationManifest)
      .catch(() => null);
  }
  return manifestPromise;
}

export function resetCreatureAnimationManifestForTests() {
  manifestPromise = null;
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
