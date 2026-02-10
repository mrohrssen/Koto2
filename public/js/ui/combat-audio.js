/**
 * @file combat-audio.js - Element-Typed Combat Sound Effects via Web Audio API
 *
 * PURPOSE:
 * Synthesizes element-appropriate attack and ultimate sounds using oscillators,
 * noise generators, and filters. No audio files needed.
 *
 * USAGE:
 *   import { playAttackSound, playUltimateSound } from './combat-audio.js';
 *   playAttackSound('fire');    // Short crackling burst
 *   playUltimateSound('fire');  // Roaring explosion
 *
 * ELEMENTS: fire, water, earth, metal, wood
 *
 * Each element has:
 *   - Attack sound (0.3-0.8s): quick, punchy
 *   - Ultimate sound (0.5-1.5s): big, impactful, layered
 */

// ============ AUDIO CONTEXT ============

let ctx = null;

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// ============ UTILITY GENERATORS ============

/**
 * Create a white noise buffer
 * @param {AudioContext} audioCtx
 * @param {number} duration - Seconds
 * @returns {AudioBuffer}
 */
function createNoiseBuffer(audioCtx, duration) {
  const sampleRate = audioCtx.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const buffer = audioCtx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/**
 * Create a gain node with envelope
 * @param {AudioContext} audioCtx
 * @param {number} attack - Attack time in seconds
 * @param {number} decay - Decay time in seconds
 * @param {number} sustain - Sustain level (0-1)
 * @param {number} release - Release time in seconds
 * @param {number} peak - Peak gain value
 * @returns {GainNode}
 */
function createEnvelope(audioCtx, attack, decay, sustain, release, peak = 0.3) {
  const gain = audioCtx.createGain();
  const now = audioCtx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + attack);
  gain.gain.linearRampToValueAtTime(sustain * peak, now + attack + decay);
  gain.gain.linearRampToValueAtTime(0, now + attack + decay + release);
  return gain;
}

/**
 * Get volume from localStorage settings (match audio.js behavior)
 * @returns {number} 0-1
 */
function getSfxVolume() {
  const saved = localStorage.getItem('jrpg_sfxVolume');
  const muted = localStorage.getItem('jrpg_audioMuted');
  if (muted === 'true') return 0;
  return saved !== null ? parseFloat(saved) : 0.8;
}

// ============ ELEMENT ATTACK SOUNDS ============

/**
 * Fire attack: crackling sizzle burst
 */
function fireAttack(audioCtx) {
  const vol = getSfxVolume();
  const now = audioCtx.currentTime;
  const master = audioCtx.createGain();
  master.gain.value = vol * 0.25;
  master.connect(audioCtx.destination);

  // Noise burst through bandpass for crackle
  const noise = audioCtx.createBufferSource();
  noise.buffer = createNoiseBuffer(audioCtx, 0.4);
  const bp = audioCtx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(3000, now);
  bp.frequency.exponentialRampToValueAtTime(800, now + 0.35);
  bp.Q.value = 2;
  const env = createEnvelope(audioCtx, 0.01, 0.05, 0.3, 0.3, 0.8);
  noise.connect(bp);
  bp.connect(env);
  env.connect(master);
  noise.start(now);
  noise.stop(now + 0.4);

  // Low rumble oscillator
  const osc = audioCtx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.exponentialRampToValueAtTime(80, now + 0.3);
  const oscEnv = createEnvelope(audioCtx, 0.01, 0.1, 0.2, 0.2, 0.4);
  osc.connect(oscEnv);
  oscEnv.connect(master);
  osc.start(now);
  osc.stop(now + 0.4);
}

/**
 * Water attack: splash/bubble
 */
function waterAttack(audioCtx) {
  const vol = getSfxVolume();
  const now = audioCtx.currentTime;
  const master = audioCtx.createGain();
  master.gain.value = vol * 0.25;
  master.connect(audioCtx.destination);

  // Filtered noise for splash
  const noise = audioCtx.createBufferSource();
  noise.buffer = createNoiseBuffer(audioCtx, 0.5);
  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(4000, now);
  lp.frequency.exponentialRampToValueAtTime(600, now + 0.4);
  lp.Q.value = 5;
  const env = createEnvelope(audioCtx, 0.02, 0.1, 0.3, 0.35, 0.6);
  noise.connect(lp);
  lp.connect(env);
  env.connect(master);
  noise.start(now);
  noise.stop(now + 0.5);

  // Bubble: short sine blips
  for (let i = 0; i < 3; i++) {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    const t = now + 0.05 + i * 0.08;
    osc.frequency.setValueAtTime(800 + i * 200, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.06);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.01);
    g.gain.linearRampToValueAtTime(0, t + 0.06);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 0.07);
  }
}

/**
 * Earth attack: rumble/thud
 */
function earthAttack(audioCtx) {
  const vol = getSfxVolume();
  const now = audioCtx.currentTime;
  const master = audioCtx.createGain();
  master.gain.value = vol * 0.3;
  master.connect(audioCtx.destination);

  // Low thud oscillator
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
  const env = createEnvelope(audioCtx, 0.005, 0.05, 0.3, 0.25, 0.9);
  osc.connect(env);
  env.connect(master);
  osc.start(now);
  osc.stop(now + 0.35);

  // Noise crunch
  const noise = audioCtx.createBufferSource();
  noise.buffer = createNoiseBuffer(audioCtx, 0.3);
  const bp = audioCtx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 400;
  bp.Q.value = 1;
  const nEnv = createEnvelope(audioCtx, 0.005, 0.05, 0.2, 0.2, 0.5);
  noise.connect(bp);
  bp.connect(nEnv);
  nEnv.connect(master);
  noise.start(now);
  noise.stop(now + 0.3);
}

/**
 * Metal attack: metallic clang/ring
 */
function metalAttack(audioCtx) {
  const vol = getSfxVolume();
  const now = audioCtx.currentTime;
  const master = audioCtx.createGain();
  master.gain.value = vol * 0.2;
  master.connect(audioCtx.destination);

  // Metallic ring: inharmonic oscillators
  const freqs = [1200, 1800, 2400, 3200];
  for (const freq of freqs) {
    const osc = audioCtx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.4, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + 0.5);
  }

  // Impact noise burst
  const noise = audioCtx.createBufferSource();
  noise.buffer = createNoiseBuffer(audioCtx, 0.1);
  const hp = audioCtx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2000;
  const nEnv = createEnvelope(audioCtx, 0.001, 0.02, 0.1, 0.07, 0.6);
  noise.connect(hp);
  hp.connect(nEnv);
  nEnv.connect(master);
  noise.start(now);
  noise.stop(now + 0.1);
}

/**
 * Wood attack: whoosh/rustle
 */
function woodAttack(audioCtx) {
  const vol = getSfxVolume();
  const now = audioCtx.currentTime;
  const master = audioCtx.createGain();
  master.gain.value = vol * 0.25;
  master.connect(audioCtx.destination);

  // Whoosh: filtered noise sweep
  const noise = audioCtx.createBufferSource();
  noise.buffer = createNoiseBuffer(audioCtx, 0.5);
  const bp = audioCtx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(500, now);
  bp.frequency.exponentialRampToValueAtTime(3000, now + 0.15);
  bp.frequency.exponentialRampToValueAtTime(800, now + 0.4);
  bp.Q.value = 3;
  const env = createEnvelope(audioCtx, 0.02, 0.1, 0.4, 0.3, 0.7);
  noise.connect(bp);
  bp.connect(env);
  env.connect(master);
  noise.start(now);
  noise.stop(now + 0.5);

  // Soft tonal whoosh
  const osc = audioCtx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(300, now);
  osc.frequency.exponentialRampToValueAtTime(600, now + 0.15);
  osc.frequency.exponentialRampToValueAtTime(200, now + 0.4);
  const oscEnv = createEnvelope(audioCtx, 0.02, 0.1, 0.2, 0.25, 0.3);
  osc.connect(oscEnv);
  oscEnv.connect(master);
  osc.start(now);
  osc.stop(now + 0.45);
}

// ============ ELEMENT ULTIMATE SOUNDS ============

/**
 * Fire ultimate: roaring explosion
 */
function fireUltimate(audioCtx) {
  const vol = getSfxVolume();
  const now = audioCtx.currentTime;
  const master = audioCtx.createGain();
  master.gain.value = vol * 0.3;
  master.connect(audioCtx.destination);

  // Heavy noise explosion
  const noise = audioCtx.createBufferSource();
  noise.buffer = createNoiseBuffer(audioCtx, 1.2);
  const bp = audioCtx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(4000, now);
  bp.frequency.exponentialRampToValueAtTime(200, now + 1.0);
  bp.Q.value = 1.5;
  const env = audioCtx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(1.0, now + 0.03);
  env.gain.setValueAtTime(1.0, now + 0.1);
  env.gain.exponentialRampToValueAtTime(0.01, now + 1.2);
  noise.connect(bp);
  bp.connect(env);
  env.connect(master);
  noise.start(now);
  noise.stop(now + 1.2);

  // Deep rumble
  const osc = audioCtx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(100, now);
  osc.frequency.exponentialRampToValueAtTime(30, now + 1.0);
  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 200;
  const oscEnv = audioCtx.createGain();
  oscEnv.gain.setValueAtTime(0, now);
  oscEnv.gain.linearRampToValueAtTime(0.7, now + 0.02);
  oscEnv.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
  osc.connect(lp);
  lp.connect(oscEnv);
  oscEnv.connect(master);
  osc.start(now);
  osc.stop(now + 1.1);

  // Secondary crackle layer
  const noise2 = audioCtx.createBufferSource();
  noise2.buffer = createNoiseBuffer(audioCtx, 0.8);
  const hp = audioCtx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3000;
  const n2Env = audioCtx.createGain();
  n2Env.gain.setValueAtTime(0, now + 0.05);
  n2Env.gain.linearRampToValueAtTime(0.5, now + 0.08);
  n2Env.gain.exponentialRampToValueAtTime(0.01, now + 0.7);
  noise2.connect(hp);
  hp.connect(n2Env);
  n2Env.connect(master);
  noise2.start(now + 0.05);
  noise2.stop(now + 0.8);
}

/**
 * Water ultimate: rushing wave
 */
function waterUltimate(audioCtx) {
  const vol = getSfxVolume();
  const now = audioCtx.currentTime;
  const master = audioCtx.createGain();
  master.gain.value = vol * 0.3;
  master.connect(audioCtx.destination);

  // Sweeping noise wave
  const noise = audioCtx.createBufferSource();
  noise.buffer = createNoiseBuffer(audioCtx, 1.5);
  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(200, now);
  lp.frequency.exponentialRampToValueAtTime(6000, now + 0.4);
  lp.frequency.exponentialRampToValueAtTime(1500, now + 0.8);
  lp.frequency.exponentialRampToValueAtTime(300, now + 1.4);
  lp.Q.value = 3;
  const env = audioCtx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(0.8, now + 0.3);
  env.gain.setValueAtTime(0.8, now + 0.5);
  env.gain.exponentialRampToValueAtTime(0.01, now + 1.4);
  noise.connect(lp);
  lp.connect(env);
  env.connect(master);
  noise.start(now);
  noise.stop(now + 1.5);

  // Tonal undertow
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(100, now);
  osc.frequency.linearRampToValueAtTime(250, now + 0.4);
  osc.frequency.linearRampToValueAtTime(80, now + 1.2);
  const oscEnv = audioCtx.createGain();
  oscEnv.gain.setValueAtTime(0, now);
  oscEnv.gain.linearRampToValueAtTime(0.4, now + 0.3);
  oscEnv.gain.exponentialRampToValueAtTime(0.01, now + 1.2);
  osc.connect(oscEnv);
  oscEnv.connect(master);
  osc.start(now);
  osc.stop(now + 1.3);
}

/**
 * Earth ultimate: earthquake tremor
 */
function earthUltimate(audioCtx) {
  const vol = getSfxVolume();
  const now = audioCtx.currentTime;
  const master = audioCtx.createGain();
  master.gain.value = vol * 0.35;
  master.connect(audioCtx.destination);

  // Deep rumble with modulation for tremor effect
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(50, now);

  // LFO for tremor modulation
  const lfo = audioCtx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 8;
  const lfoGain = audioCtx.createGain();
  lfoGain.gain.value = 20;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  const env = audioCtx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(1.0, now + 0.1);
  env.gain.setValueAtTime(1.0, now + 0.6);
  env.gain.exponentialRampToValueAtTime(0.01, now + 1.3);
  osc.connect(env);
  env.connect(master);
  osc.start(now);
  lfo.start(now);
  osc.stop(now + 1.3);
  lfo.stop(now + 1.3);

  // Rock crumble noise
  const noise = audioCtx.createBufferSource();
  noise.buffer = createNoiseBuffer(audioCtx, 1.2);
  const bp = audioCtx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(300, now);
  bp.frequency.linearRampToValueAtTime(800, now + 0.3);
  bp.frequency.linearRampToValueAtTime(200, now + 1.0);
  bp.Q.value = 2;
  const nEnv = audioCtx.createGain();
  nEnv.gain.setValueAtTime(0, now);
  nEnv.gain.linearRampToValueAtTime(0.6, now + 0.08);
  nEnv.gain.exponentialRampToValueAtTime(0.01, now + 1.1);
  noise.connect(bp);
  bp.connect(nEnv);
  nEnv.connect(master);
  noise.start(now);
  noise.stop(now + 1.2);

  // Impact thuds
  for (let i = 0; i < 4; i++) {
    const t = now + i * 0.2;
    const thud = audioCtx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(80 - i * 10, t);
    thud.frequency.exponentialRampToValueAtTime(30, t + 0.15);
    const tEnv = audioCtx.createGain();
    tEnv.gain.setValueAtTime(0, t);
    tEnv.gain.linearRampToValueAtTime(0.5, t + 0.005);
    tEnv.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    thud.connect(tEnv);
    tEnv.connect(master);
    thud.start(t);
    thud.stop(t + 0.15);
  }
}

/**
 * Metal ultimate: heavy smash/resonance
 */
function metalUltimate(audioCtx) {
  const vol = getSfxVolume();
  const now = audioCtx.currentTime;
  const master = audioCtx.createGain();
  master.gain.value = vol * 0.25;
  master.connect(audioCtx.destination);

  // Massive metallic impact: many inharmonic partials
  const freqs = [800, 1100, 1600, 2200, 3000, 3800, 4500];
  for (const freq of freqs) {
    const osc = audioCtx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.5, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 1.0 + (freq / 5000));
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + 1.2);
  }

  // Heavy low impact
  const sub = audioCtx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(150, now);
  sub.frequency.exponentialRampToValueAtTime(40, now + 0.5);
  const subEnv = audioCtx.createGain();
  subEnv.gain.setValueAtTime(0, now);
  subEnv.gain.linearRampToValueAtTime(0.8, now + 0.01);
  subEnv.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
  sub.connect(subEnv);
  subEnv.connect(master);
  sub.start(now);
  sub.stop(now + 0.6);

  // Noise crash
  const noise = audioCtx.createBufferSource();
  noise.buffer = createNoiseBuffer(audioCtx, 0.6);
  const hp = audioCtx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 4000;
  const nEnv = audioCtx.createGain();
  nEnv.gain.setValueAtTime(0, now);
  nEnv.gain.linearRampToValueAtTime(0.7, now + 0.01);
  nEnv.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
  noise.connect(hp);
  hp.connect(nEnv);
  nEnv.connect(master);
  noise.start(now);
  noise.stop(now + 0.6);
}

/**
 * Wood ultimate: creaking growth burst
 */
function woodUltimate(audioCtx) {
  const vol = getSfxVolume();
  const now = audioCtx.currentTime;
  const master = audioCtx.createGain();
  master.gain.value = vol * 0.25;
  master.connect(audioCtx.destination);

  // Creaking: slow frequency sweep through resonant filter
  const osc = audioCtx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(100, now);
  osc.frequency.linearRampToValueAtTime(400, now + 0.6);
  osc.frequency.linearRampToValueAtTime(150, now + 1.0);
  const bp = audioCtx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(300, now);
  bp.frequency.linearRampToValueAtTime(1200, now + 0.5);
  bp.frequency.linearRampToValueAtTime(400, now + 1.0);
  bp.Q.value = 8;
  const env = audioCtx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(0.6, now + 0.2);
  env.gain.setValueAtTime(0.6, now + 0.6);
  env.gain.exponentialRampToValueAtTime(0.01, now + 1.2);
  osc.connect(bp);
  bp.connect(env);
  env.connect(master);
  osc.start(now);
  osc.stop(now + 1.2);

  // Leafy rustle burst
  const noise = audioCtx.createBufferSource();
  noise.buffer = createNoiseBuffer(audioCtx, 1.0);
  const nlp = audioCtx.createBiquadFilter();
  nlp.type = 'bandpass';
  nlp.frequency.setValueAtTime(2000, now + 0.3);
  nlp.frequency.exponentialRampToValueAtTime(5000, now + 0.6);
  nlp.frequency.exponentialRampToValueAtTime(1500, now + 1.0);
  nlp.Q.value = 2;
  const nEnv = audioCtx.createGain();
  nEnv.gain.setValueAtTime(0, now + 0.3);
  nEnv.gain.linearRampToValueAtTime(0.5, now + 0.5);
  nEnv.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
  noise.connect(nlp);
  nlp.connect(nEnv);
  nEnv.connect(master);
  noise.start(now + 0.3);
  noise.stop(now + 1.0);

  // Growth tone: rising harmonic
  const growOsc = audioCtx.createOscillator();
  growOsc.type = 'triangle';
  growOsc.frequency.setValueAtTime(200, now);
  growOsc.frequency.exponentialRampToValueAtTime(800, now + 0.8);
  const gEnv = audioCtx.createGain();
  gEnv.gain.setValueAtTime(0, now);
  gEnv.gain.linearRampToValueAtTime(0.3, now + 0.1);
  gEnv.gain.exponentialRampToValueAtTime(0.01, now + 0.9);
  growOsc.connect(gEnv);
  gEnv.connect(master);
  growOsc.start(now);
  growOsc.stop(now + 0.9);
}

// ============ DISPATCH TABLES ============

const ATTACK_SOUNDS = {
  fire: fireAttack,
  water: waterAttack,
  earth: earthAttack,
  metal: metalAttack,
  wood: woodAttack
};

const ULTIMATE_SOUNDS = {
  fire: fireUltimate,
  water: waterUltimate,
  earth: earthUltimate,
  metal: metalUltimate,
  wood: woodUltimate
};

// ============ PUBLIC API ============

/**
 * Play the element-typed attack sound
 * @param {string} element - 'fire', 'water', 'earth', 'metal', 'wood'
 */
export function playAttackSound(element) {
  try {
    const audioCtx = getCtx();
    const fn = ATTACK_SOUNDS[element];
    if (fn) fn(audioCtx);
  } catch (e) {
    console.warn('[CombatAudio] Attack sound failed:', e.message);
  }
}

/**
 * Play the element-typed ultimate sound
 * @param {string} element - 'fire', 'water', 'earth', 'metal', 'wood'
 */
export function playUltimateSound(element) {
  try {
    const audioCtx = getCtx();
    const fn = ULTIMATE_SOUNDS[element];
    if (fn) fn(audioCtx);
  } catch (e) {
    console.warn('[CombatAudio] Ultimate sound failed:', e.message);
  }
}
