import { sfxUrl, bgmUrl } from './assets/asset-urls.js';
import {
  getEffectiveVolume,
  getVolume as getStoredVolume,
  isMuted as isAudioMuted,
  reloadAudioSettings,
  setMuted as setStoredMuted,
  setVolume as setStoredVolume,
  subscribeAudioSettings
} from './audio-settings.js';

const SFX_FILES = [
  'attack', 'player-hit', 'enemy-defeat', 'heal',
  'swipe-right', 'swipe-left', 'creature-equip', 'creature-skill',
  'button-tap', 'takeover-open', 'takeover-close',
  'victory', 'defeat'
];

let audioCtx = null;
const sfxBuffers = {};

// BGM state
let bgmElement = null;
let bgmPlaying = false;
let bgmSourceNode = null;
let bgmGainNode = null;

// Phase-based BGM tracking
let currentTrack = null;

subscribeAudioSettings((change) => {
  if (change.type === 'muted' || change.type === 'reload' || change.target === 'bgm') {
    applyBgmVolume();
  }
});

function getBgmPlaybackVolume() {
  return getEffectiveVolume('bgm');
}

function ensureBgmGraph() {
  if (!audioCtx || !bgmElement || bgmGainNode) return;
  try {
    bgmSourceNode = audioCtx.createMediaElementSource(bgmElement);
    bgmGainNode = audioCtx.createGain();
    bgmSourceNode.connect(bgmGainNode);
    bgmGainNode.connect(audioCtx.destination);
  } catch (e) {
    bgmSourceNode = null;
    bgmGainNode = null;
    console.warn('[Audio] Failed to route BGM through Web Audio:', e.message);
  }
}

function setBgmOutputVolume(volume) {
  if (bgmGainNode) {
    bgmGainNode.gain.value = volume;
  } else if (bgmElement) {
    bgmElement.volume = volume;
  }
}

function getBgmOutputVolume() {
  return bgmGainNode ? bgmGainNode.gain.value : (bgmElement?.volume ?? 0);
}

function applyBgmVolume() {
  if (!bgmElement) return;
  ensureBgmGraph();
  const volume = getBgmPlaybackVolume();
  bgmElement.muted = isAudioMuted();
  bgmElement.volume = bgmGainNode ? 1 : volume;
  setBgmOutputVolume(volume);
}

const PHASE_TRACKS = {
  hub: 'main',
  exploration: 'explore',
  event: 'event',
  combat: 'battle',
  victory: 'creature-shop',
  defeat: 'main',
  floorComplete: 'main',
  runComplete: 'main',
};

/**
 * Get the BGM track name for a game phase.
 * @param {string} phase - Current game phase
 * @returns {string} Track filename (without extension)
 */
export function getTrackForPhase(phase) {
  const mapping = {
    hub: 'hub',
    exploring: 'exploration',
    room: 'exploration',
    room_encounter: 'exploration',
    shrine: 'event',
    quiz: 'event',
    wordDiscovery: 'event',
    ward_selection: 'exploration',
    combat: 'combat',
    victory: 'victory',
    post_combat_shop: 'victory',
    defeat: 'defeat',
    run_ended: 'defeat',
    floor_complete: 'floorComplete',
    run_complete: 'runComplete',
  };

  return PHASE_TRACKS[mapping[phase]] || PHASE_TRACKS.hub;
}

/**
 * Update BGM based on game phase. Only changes track if different.
 * @param {string} phase - Current game phase
 */
export function updateBGMForPhase(phase) {
  const track = getTrackForPhase(phase);
  if (track !== currentTrack) {
    currentTrack = track;
    playBGM(track);
  }
}

// ============ INITIALIZATION ============

/**
 * Initialize audio context and preload SFX buffers.
 * Must be called after first user interaction (autoplay policy).
 */
export async function initAudio() {
  if (audioCtx) return; // already initialized
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  await audioCtx.resume(); // Required for mobile autoplay policy

  reloadAudioSettings();

  // Preload all SFX
  await Promise.allSettled(SFX_FILES.map(loadSfx));

  // Set up BGM element (only if not already created by playBGM)
  if (!bgmElement) {
    bgmElement = new Audio();
    bgmElement.loop = true;
  }
  applyBgmVolume();
  if (bgmPlaying && !isAudioMuted()) {
    bgmElement.play().catch(() => {});
  }
}

async function loadSfx(name) {
  try {
    const response = await fetch(sfxUrl(name));
    if (!response.ok) return;
    const arrayBuffer = await response.arrayBuffer();
    sfxBuffers[name] = await audioCtx.decodeAudioData(arrayBuffer);
  } catch (e) {
    console.warn(`Failed to load SFX: ${name}`, e);
  }
}

// ============ SFX ============

/**
 * Play a sound effect (fire-and-forget, supports overlap).
 * @param {string} name - SFX name (without extension)
 */
export function playSFX(name) {
  if (isAudioMuted() || !audioCtx || !sfxBuffers[name]) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const source = audioCtx.createBufferSource();
  source.buffer = sfxBuffers[name];

  const gainNode = audioCtx.createGain();
  gainNode.gain.value = getEffectiveVolume('sfx');

  source.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  source.start(0);
}

// ============ BGM ============

/**
 * Start/resume background music.
 * @param {string} [track='main'] - Track name (without extension)
 */
export function playBGM(track = 'main') {
  if (!bgmElement) {
    bgmElement = new Audio();
    bgmElement.loop = true;
  }
  applyBgmVolume();
  const src = bgmUrl(track);
  if (bgmElement.src !== new URL(src, location.href).href) {
    bgmElement.src = src;
  }
  applyBgmVolume();
  bgmElement.play().catch(() => {}); // ignore autoplay rejection
  bgmPlaying = true;
}

/**
 * Play BGM starting from a random position in the track.
 * Useful for variety when entering the same mode multiple times.
 * @param {string} track - Track name (without extension)
 */
export function playBGMRandomStart(track) {
  if (!bgmElement) {
    bgmElement = new Audio();
    bgmElement.loop = true;
  }
  applyBgmVolume();
  const src = bgmUrl(track);
  const fullSrc = new URL(src, location.href).href;

  // If same track, just seek to random position
  if (bgmElement.src === fullSrc && bgmElement.duration) {
    bgmElement.currentTime = Math.random() * bgmElement.duration;
    applyBgmVolume();
    bgmElement.play().catch(() => {});
    bgmPlaying = true;
    currentTrack = track;
    return;
  }

  // Different track - load and seek once ready
  bgmElement.src = src;
  applyBgmVolume();

  const seekOnLoad = () => {
    if (bgmElement.duration) {
      bgmElement.currentTime = Math.random() * bgmElement.duration;
    }
    bgmElement.removeEventListener('loadedmetadata', seekOnLoad);
  };
  bgmElement.addEventListener('loadedmetadata', seekOnLoad);
  bgmElement.play().catch(() => {});
  bgmPlaying = true;
  currentTrack = track;
}

/** Stop BGM with a short fade out */
export function stopBGM() {
  if (!bgmElement || !bgmPlaying) return;
  const fadeInterval = setInterval(() => {
    const currentVolume = getBgmOutputVolume();
    if (currentVolume > 0.05) {
      setBgmOutputVolume(Math.max(0, currentVolume - 0.05));
    } else {
      clearInterval(fadeInterval);
      bgmElement.pause();
      bgmElement.currentTime = 0;
      bgmPlaying = false;
    }
  }, 50);
}

/** Pause BGM (for tab hidden) */
export function pauseBGM() {
  if (bgmElement && bgmPlaying) bgmElement.pause();
}

/** Resume BGM (for tab visible) */
export function resumeBGM() {
  if (bgmElement && bgmPlaying && !isAudioMuted()) bgmElement.play().catch(() => {});
}

// ============ VOLUME & MUTE ============

/**
 * Set volume for BGM or SFX.
 * @param {'bgm'|'sfx'} type
 * @param {number} val - 0 to 1
 */
export function setVolume(type, val) {
  setStoredVolume(type, val);
}

/**
 * Get current volume.
 * @param {'bgm'|'sfx'} type
 * @returns {number} 0 to 1
 */
export function getVolume(type) {
  return getStoredVolume(type);
}

/** Mute all audio */
export function mute() {
  setStoredMuted(true);
}

/** Unmute all audio */
export function unmute() {
  setStoredMuted(false);
  if (audioCtx?.state === 'suspended') audioCtx.resume();
  if (bgmElement && bgmPlaying) bgmElement.play().catch(() => {});
}

/** Check mute state */
export function isMuted() {
  return isAudioMuted();
}
