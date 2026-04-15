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

// ============ DISPATCH TABLES ============

const ATTACK_SOUNDS = {
  fire: fireAttack,
  water: waterAttack,
  earth: earthAttack,
  metal: metalAttack,
  wood: woodAttack
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
