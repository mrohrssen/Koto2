const STORAGE_KEYS = {
  bgm: 'jrpg_bgmVolume',
  sfx: 'jrpg_sfxVolume',
  tts: 'jrpg_ttsVolume',
  muted: 'jrpg_audioMuted'
};

const DEFAULT_VOLUMES = {
  bgm: 0.7,
  sfx: 0.8,
  tts: 1.0
};

const listeners = new Set();

let volumes = {
  bgm: readVolumePreference('bgm'),
  sfx: readVolumePreference('sfx'),
  tts: readVolumePreference('tts')
};
let muted = readMutedPreference();

function clampVolume(value, fallback = 1) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback;
}

function readVolumePreference(type) {
  try {
    const fallback = DEFAULT_VOLUMES[type];
    const saved = globalThis.localStorage?.getItem(STORAGE_KEYS[type]);
    if (saved === null || saved === undefined) return fallback;
    return clampVolume(saved, fallback);
  } catch {
    return DEFAULT_VOLUMES[type];
  }
}

function readMutedPreference() {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEYS.muted) === 'true';
  } catch {
    return false;
  }
}

function emit(change) {
  for (const listener of listeners) {
    listener(change);
  }
}

export function reloadAudioSettings() {
  volumes = {
    bgm: readVolumePreference('bgm'),
    sfx: readVolumePreference('sfx'),
    tts: readVolumePreference('tts')
  };
  muted = readMutedPreference();
  emit({ type: 'reload', volumes: { ...volumes }, muted });
}

export function subscribeAudioSettings(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getVolume(type) {
  return volumes[type] ?? 1;
}

export function setVolume(type, value) {
  if (!Object.hasOwn(DEFAULT_VOLUMES, type)) return;
  const clamped = clampVolume(value, DEFAULT_VOLUMES[type]);
  volumes[type] = clamped;
  globalThis.localStorage?.setItem(STORAGE_KEYS[type], String(clamped));
  emit({ type: 'volume', target: type, value: clamped, muted });
}

export function isMuted() {
  return muted;
}

export function setMuted(nextMuted) {
  muted = Boolean(nextMuted);
  if (muted) {
    globalThis.localStorage?.setItem(STORAGE_KEYS.muted, 'true');
  } else {
    globalThis.localStorage?.removeItem(STORAGE_KEYS.muted);
  }
  emit({ type: 'muted', muted });
}

export function getEffectiveVolume(type) {
  return muted ? 0 : getVolume(type);
}

export const AUDIO_STORAGE_KEYS = STORAGE_KEYS;
