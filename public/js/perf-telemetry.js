// Pure telemetry factories wired into diagnostics.js. No imports — the
// texture-count reader is injected so this stays trivially unit-testable.

// A frame delta > SUSPEND_GAP_MS is an app-suspend/background artifact
// (rAF pauses when the app is backgrounded), not a slow frame.
const SUSPEND_GAP_MS = 2000;

/**
 * Per-minute frame-time bucket counters in a bounded ring.
 * Buckets: ≤17ms (healthy 60fps), 17–25, 25–33, 33–50, >50ms.
 */
export function createFrameStats({ maxMinutes = 45 } = {}) {
  const minutes = [];
  let current = null;

  function onFrame(deltaMs, nowMs) {
    if (deltaMs > SUSPEND_GAP_MS) return;
    const m = Math.floor(nowMs / 60_000);
    if (!current || current.m !== m) {
      current = { m, f: 0, b17: 0, b25: 0, b33: 0, b50: 0, over: 0 };
      minutes.push(current);
      if (minutes.length > maxMinutes) minutes.shift();
    }
    current.f++;
    if (deltaMs <= 17) current.b17++;
    else if (deltaMs <= 25) current.b25++;
    else if (deltaMs <= 33) current.b33++;
    else if (deltaMs <= 50) current.b50++;
    else current.over++;
  }

  return {
    onFrame,
    toArray: () => minutes.map((r) => ({ ...r })),
  };
}

/**
 * Periodic sampler for the GPU-managed texture count. getCount is injected
 * (diagnostics reads the PIXI renderer); null/throwing reads are skipped so
 * sampling is a no-op until PIXI boots.
 */
export function createTextureSampler({ getCount, intervalMs = 30_000, maxSamples = 90 } = {}) {
  const samples = [];
  let lastSampleAt = -Infinity;

  function maybeSample(nowMs) {
    if (nowMs - lastSampleAt < intervalMs) return;
    lastSampleAt = nowMs;
    let n = null;
    try { n = getCount(); } catch { n = null; }
    if (typeof n !== 'number') return;
    samples.push({ t: Math.round(nowMs / 1000), n });
    if (samples.length > maxSamples) samples.shift();
  }

  return {
    maybeSample,
    toArray: () => samples.map((s) => ({ ...s })),
  };
}
