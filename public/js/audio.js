/**
 * Audio Module - BGM & SFX Manager
 *
 * SFX: Web Audio API (low latency, overlap support)
 * BGM: HTMLAudioElement (streaming, looping)
 */

const SFX_PATH = '/assets/audio/sfx/';
const BGM_PATH = '/assets/audio/bgm/';
const AUDIO_VERSION = '20260212';

const SFX_FILES = [
  'attack', 'player-hit', 'enemy-defeat', 'heal',
  'swipe-right', 'swipe-left', 'creature-equip', 'creature-skill',
  'button-tap', 'takeover-open', 'takeover-close',
  'victory', 'defeat'
];

let audioCtx = null;
const sfxBuffers = {};
let sfxVolume = 0.8;
let bgmVolume = 0.7;
let muted = false;

// BGM state
let bgmElement = null;
let bgmPlaying = false;

// Phase-based BGM tracking
let currentTrack = null;

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

  // Load saved preferences
  const savedSfxVol = localStorage.getItem('jrpg_sfxVolume');
  const savedBgmVol = localStorage.getItem('jrpg_bgmVolume');
  const savedMuted = localStorage.getItem('jrpg_audioMuted');
  if (savedSfxVol !== null) sfxVolume = parseFloat(savedSfxVol);
  if (savedBgmVol !== null) bgmVolume = parseFloat(savedBgmVol);
  if (savedMuted === 'true') muted = true;

  // Preload all SFX
  await Promise.allSettled(SFX_FILES.map(loadSfx));

  // Set up BGM element (only if not already created by playBGM)
  if (!bgmElement) {
    bgmElement = new Audio();
    bgmElement.loop = true;
  }
  bgmElement.volume = muted ? 0 : bgmVolume;
}

async function loadSfx(name) {
  try {
    const response = await fetch(`${SFX_PATH}${name}.mp3?v=${AUDIO_VERSION}`);
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
  if (muted || !audioCtx || !sfxBuffers[name]) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const source = audioCtx.createBufferSource();
  source.buffer = sfxBuffers[name];

  const gainNode = audioCtx.createGain();
  gainNode.gain.value = sfxVolume;

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
  const src = `${BGM_PATH}${track}.mp3?v=${AUDIO_VERSION}`;
  if (bgmElement.src !== new URL(src, location.href).href) {
    bgmElement.src = src;
  }
  bgmElement.volume = muted ? 0 : bgmVolume;
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
  const src = `${BGM_PATH}${track}.mp3?v=${AUDIO_VERSION}`;
  const fullSrc = new URL(src, location.href).href;

  // If same track, just seek to random position
  if (bgmElement.src === fullSrc && bgmElement.duration) {
    bgmElement.currentTime = Math.random() * bgmElement.duration;
    bgmElement.volume = muted ? 0 : bgmVolume;
    bgmElement.play().catch(() => {});
    bgmPlaying = true;
    currentTrack = track;
    return;
  }

  // Different track - load and seek once ready
  bgmElement.src = src;
  bgmElement.volume = muted ? 0 : bgmVolume;

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
    if (bgmElement.volume > 0.05) {
      bgmElement.volume = Math.max(0, bgmElement.volume - 0.05);
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
  if (bgmElement && bgmPlaying && !muted) bgmElement.play().catch(() => {});
}

// ============ VOLUME & MUTE ============

/**
 * Set volume for BGM or SFX.
 * @param {'bgm'|'sfx'} type
 * @param {number} val - 0 to 1
 */
export function setVolume(type, val) {
  const clamped = Math.max(0, Math.min(1, val));
  if (type === 'sfx') {
    sfxVolume = clamped;
    localStorage.setItem('jrpg_sfxVolume', String(clamped));
  } else if (type === 'bgm') {
    bgmVolume = clamped;
    localStorage.setItem('jrpg_bgmVolume', String(clamped));
    if (bgmElement) bgmElement.volume = muted ? 0 : clamped;
  }
}

/**
 * Get current volume.
 * @param {'bgm'|'sfx'} type
 * @returns {number} 0 to 1
 */
export function getVolume(type) {
  return type === 'sfx' ? sfxVolume : bgmVolume;
}

/** Mute all audio */
export function mute() {
  muted = true;
  localStorage.setItem('jrpg_audioMuted', 'true');
  if (bgmElement) bgmElement.volume = 0;
}

/** Unmute all audio */
export function unmute() {
  muted = false;
  localStorage.removeItem('jrpg_audioMuted');
  if (bgmElement) bgmElement.volume = bgmVolume;
  if (audioCtx?.state === 'suspended') audioCtx.resume();
}

/** Check mute state */
export function isMuted() {
  return muted;
}
