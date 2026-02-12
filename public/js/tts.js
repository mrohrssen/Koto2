/**
 * @fileoverview TTS (Text-to-Speech) Module for VOICEVOX integration
 * @module public/js/tts
 *
 * PURPOSE:
 * Provides text-to-speech functionality via VOICEVOX API. Handles audio
 * synthesis, playback, caching, and speaker/voice management.
 *
 * KEY EXPORTS:
 * - State: isEnabled(), getSpeed(), getVolume(), getSpeakerId()
 * - Setters: setEnabled(), setSpeed(), setVolume(), setSpeakerId()
 * - Playback: speakNarration(), speakText(), speakWithVoice(), stop()
 * - Word Audio: prefetchWord(), playWord(), isWordAudioEnabled()
 * - Status: checkStatus(), loadSpeakers()
 * - Constants: PERSONALITY_SPEAKERS
 */

const API_BASE = '';

// ============ TTS STATE ============

let ttsEnabled = true;
let ttsSpeakerId = 13; // 玄野武宏 (クール) - default narrator
let ttsSpeed = 0.9;
let ttsVolume = 1.0;
let muted = localStorage.getItem('jrpg_audioMuted') === 'true';
let currentAudio = null;
let lastSpokenNarration = null;
let ttsRequestId = 0;

// Narration audio prefetch cache
const narrationCache = new Map();
const MAX_NARRATION_CACHE = 10;

// Word audio cache
const wordAudioCache = new Map();
let wordAudioEnabled = true;

// UI audio (for short texts like chip names)
let currentUiAudio = null;

// ============ PERSONALITY SPEAKERS ============

/**
 * Personality to VoiceVox speaker mapping
 * Maps enemy personality types to appropriate voice styles
 */
export const PERSONALITY_SPEAKERS = {
  // Aggressive/Angry - 玄野武宏 (ツンギレ) male angry
  aggressive: 39, belligerent: 39, furious: 39, hostile: 39, rowdy: 39,

  // Cold/Calculating - 四国めたん (ノーマル) cool female
  cold: 2, calculating: 2, clinical: 2, detached: 2, precise: 2,

  // Robotic/Mechanical - ナースロボ_タイプT robotic
  robotic: 47, mechanical: 47, 'machine-like': 47, rigid: 47, repetitive: 47,

  // Nervous/Panicked - 春日部つむぎ higher pitched female
  frantic: 8, panicked: 8, terrified: 8, anxious: 8, stressed: 8,

  // Exhausted/Slow - 青山龍星 (ノーマル) slow male
  exhausted: 13, lethargic: 13, apathetic: 13, dazed: 13,

  // Erratic/Chaotic - ずんだもん (あまあま) expressive
  erratic: 1, hyper: 1, obsessive: 1, intense: 1, eager: 1,

  // Authoritative/Proud - 白上虎太郎 (ノーマル) deep male
  authoritarian: 12, domineering: 12, authoritative: 12, ruthless: 12,

  // Mysterious/Silent - 雨晴はう (ノーマル) soft whisper
  silent: 10, elusive: 10, transcendent: 10,

  // Confused/Lost - もち子さん (ノーマル) uncertain
  confused: 20, lost: 20, paralyzed: 20, frozen: 20,

  // Cheerful/Performative - 小夜/SAYO gentle female
  charming: 46, performative: 46, gossipy: 46,

  // Default for unmapped - cool narrator
  default: 13
};

// ============ STATE GETTERS/SETTERS ============

export function isEnabled() {
  return ttsEnabled;
}

export function setEnabled(enabled) {
  ttsEnabled = enabled;
}

export function getSpeakerId() {
  return ttsSpeakerId;
}

export function setSpeakerId(id) {
  ttsSpeakerId = id;
}

export function getSpeed() {
  return ttsSpeed;
}

export function setSpeed(speed) {
  ttsSpeed = speed;
}

export function getVolume() {
  return ttsVolume;
}

export function setVolume(volume) {
  ttsVolume = volume;
}

export function setMuted(val) {
  muted = val;
}

export function getLastSpokenNarration() {
  return lastSpokenNarration;
}

export function isWordAudioEnabled() {
  return wordAudioEnabled;
}

// ============ CORE TTS FUNCTIONS ============

/**
 * Synthesize audio from text via VOICEVOX API
 * @param {string} text - Text to synthesize
 * @param {object} options - Optional overrides for speakerId, speed, volume
 * @returns {Promise<{blob: Blob, url: string}|null>} Audio blob and URL, or null on error
 */
async function synthesize(text, options = {}) {
  if (!text || text.trim().length === 0) return null;

  try {
    const response = await fetch(`${API_BASE}/api/tts/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        speakerId: options.speakerId ?? ttsSpeakerId,
        speed: options.speed ?? ttsSpeed
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.warn('TTS synthesis error:', error.error);
      return null;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    return { blob, url };
  } catch (error) {
    console.warn('TTS synthesis failed:', error);
    return null;
  }
}

/**
 * Prefetch narration audio in the background.
 * Call this as early as possible (e.g. when narration text arrives).
 * speakNarration() will use the cached result if available.
 * @param {string} text - Text to prefetch audio for
 * @param {object} [options] - Optional overrides (speakerId, speed)
 */
export function prefetchNarration(text, options = {}) {
  if (!ttsEnabled || muted || !text || text.trim().length === 0) return;
  if (narrationCache.has(text)) return;

  // Evict oldest if full
  if (narrationCache.size >= MAX_NARRATION_CACHE) {
    const oldest = narrationCache.keys().next().value;
    const entry = narrationCache.get(oldest);
    if (entry?.url) URL.revokeObjectURL(entry.url);
    narrationCache.delete(oldest);
  }

  // Store the promise so speakNarration can await it
  const promise = synthesize(text, options);
  narrationCache.set(text, { promise, url: null });
  promise.then(result => {
    const entry = narrationCache.get(text);
    if (entry) {
      entry.url = result?.url || null;
      entry.blob = result?.blob || null;
    }
  });
}

/**
 * Speak narration text using VOICEVOX
 * Cancels any currently playing narration. Uses prefetch cache if available.
 */
export async function speakNarration(text) {
  // Stop any currently playing audio
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  if (!text || text.trim().length === 0) return;

  // Store for repeat with 'r' key
  lastSpokenNarration = text;

  if (!ttsEnabled || muted) return;

  // Increment request ID to cancel any pending requests
  const thisRequestId = ++ttsRequestId;

  // Check prefetch cache first
  let result = null;
  const cached = narrationCache.get(text);
  if (cached) {
    narrationCache.delete(text);
    result = await cached.promise;
  }

  if (!result) {
    result = await synthesize(text);
  }
  if (!result) return;

  // Check if this request was canceled while waiting
  if (thisRequestId !== ttsRequestId) {
    URL.revokeObjectURL(result.url);
    return;
  }

  currentAudio = new Audio(result.url);
  currentAudio.volume = Math.min(ttsVolume, 1.0);
  currentAudio.onended = () => {
    URL.revokeObjectURL(result.url);
    currentAudio = null;
  };
  currentAudio.play();
}

/**
 * Simple TTS for short text (chip names, UI feedback)
 * Doesn't interrupt narration or manage request cancellation
 */
export async function speakText(text) {
  if (!ttsEnabled || muted || !text || text.trim().length === 0) return;

  const result = await synthesize(text);
  if (!result) return;

  // Stop previous UI audio if playing
  if (currentUiAudio) {
    currentUiAudio.pause();
    currentUiAudio = null;
  }

  currentUiAudio = new Audio(result.url);
  currentUiAudio.volume = Math.min(ttsVolume, 1.0);
  currentUiAudio.onended = () => URL.revokeObjectURL(result.url);
  currentUiAudio.onerror = () => URL.revokeObjectURL(result.url);
  currentUiAudio.play();
}

/**
 * Speak text with a specific voice (for enemy dialogue)
 * @param {string} text - Text to speak
 * @param {number} speakerId - VOICEVOX speaker ID
 * @returns {Promise<Audio|null>} Audio element for playback control, or null on error
 */
export async function speakWithVoice(text, speakerId) {
  if (!ttsEnabled || muted || !text || text.trim().length === 0) return null;

  // Stop any currently playing narration audio
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  const result = await synthesize(text, { speakerId });
  if (!result) return null;

  const audio = new Audio(result.url);
  audio.volume = Math.min(ttsVolume, 1.0);

  // Auto-revoke URL when done
  const cleanup = () => URL.revokeObjectURL(result.url);
  audio.onended = cleanup;
  audio.onerror = cleanup;

  return audio;
}

/**
 * Stop any currently playing TTS audio and cancel pending requests
 */
export function stop() {
  // Increment request ID to cancel any pending TTS fetches
  ttsRequestId++;

  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

// ============ WORD AUDIO FUNCTIONS ============

/**
 * Prefetch audio for a single word
 */
export async function prefetchWord(word) {
  if (!wordAudioEnabled || !word) return;

  // Already cached or pending
  if (wordAudioCache.has(word)) return;

  // Mark as pending
  wordAudioCache.set(word, { status: 'pending', blob: null, url: null });

  try {
    const response = await fetch(`${API_BASE}/api/tts/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: word })
    });

    if (!response.ok) {
      throw new Error(`TTS failed: ${response.status}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    wordAudioCache.set(word, { status: 'ready', blob, url });
    console.log(`[WordAudio] Prefetched: ${word}`);
  } catch (e) {
    console.warn(`[WordAudio] Failed to prefetch "${word}":`, e.message);
    wordAudioCache.set(word, { status: 'error', blob: null, url: null });

    // Disable audio if VOICEVOX is unavailable
    if (e.message.includes('500') || e.message.includes('fetch')) {
      wordAudioEnabled = false;
      console.log('[WordAudio] Disabled - VOICEVOX unavailable');
    }
  }
}

/**
 * Play cached audio for a word
 */
export function playWord(word) {
  if (!wordAudioEnabled || muted || !word) return;

  const cached = wordAudioCache.get(word);
  if (!cached || cached.status !== 'ready' || !cached.url) {
    console.log(`[WordAudio] No cached audio for: ${word}`);
    return;
  }

  try {
    const audio = new Audio(cached.url);
    audio.volume = ttsVolume || 1.0;
    audio.play().catch(e => console.warn('[WordAudio] Playback failed:', e.message));
  } catch (e) {
    console.warn('[WordAudio] Error playing audio:', e.message);
  }
}

// ============ STATUS/SPEAKERS ============

/**
 * Check VOICEVOX status
 * @returns {Promise<{running: boolean, version?: string}>}
 */
export async function checkStatus() {
  try {
    const response = await fetch(`${API_BASE}/api/tts/status`);
    const data = await response.json();
    return data;
  } catch (error) {
    return { running: false };
  }
}

/**
 * Load available TTS speakers/voices
 * @returns {Promise<Array<{id: number, displayName: string}>>}
 */
export async function loadSpeakers() {
  try {
    const response = await fetch(`${API_BASE}/api/tts/speakers`);
    const data = await response.json();
    return data.speakers || [];
  } catch (error) {
    console.warn('Failed to load TTS speakers:', error);
    return [];
  }
}

/**
 * Initialize TTS settings
 */
export function initSettings(settings) {
  ttsEnabled = settings.gameTtsEnabled ?? true;
  ttsSpeakerId = settings.gameTtsSpeakerId || 13;
  ttsSpeed = settings.gameTtsSpeed || 0.9;
  ttsVolume = settings.gameTtsVolume || 1.0;
}

/**
 * Get speaker ID for a personality type
 */
export function getSpeakerForPersonality(personality) {
  return PERSONALITY_SPEAKERS[personality] ?? PERSONALITY_SPEAKERS.default;
}
