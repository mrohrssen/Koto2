const MANIFEST_PATH = '/assets/sprites/npcs-animated/manifest.json';

let manifestPromise = null;

export function normalizeNpcAnimationManifest(raw) {
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

export async function loadNpcAnimationManifest(fetchImpl = fetch) {
  if (!manifestPromise) {
    manifestPromise = fetchImpl(MANIFEST_PATH)
      .then(response => response.ok ? response.json() : null)
      .then(normalizeNpcAnimationManifest)
      .catch(() => null);
  }
  return manifestPromise;
}

export function resetNpcAnimationManifestForTests() {
  manifestPromise = null;
}

export function getAnimatedNpcEntry(manifest, npcId) {
  if (!manifest?.animations || !npcId) return null;
  const entry = manifest.animations[npcId];
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
