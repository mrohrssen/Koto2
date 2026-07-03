import { store } from './store.js';
import { extractGameContext } from './analytics-core.js';
import { setCrashContext, trackMilestone, recordNonFatal } from './analytics.js';
import { createFrameStats, createTextureSampler } from './perf-telemetry.js';

// ============ RING BUFFER ============

class RingBuffer {
  constructor(maxSize) {
    this.items = [];
    this.maxSize = maxSize;
  }
  push(item) {
    this.items.push(item);
    if (this.items.length > this.maxSize) this.items.shift();
  }
  toArray() { return [...this.items]; }
}

// ============ CONSOLE ERROR BUFFER (capacity 50) ============

const consoleBuffer = new RingBuffer(50);
let diagnosticsInitialized = false;
let globalErrorCaptureInitialized = false;

export function formatDiagnosticArg(arg) {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return `${arg.name || 'Error'}: ${arg.message || ''}`.trim();
  try {
    const json = JSON.stringify(arg);
    return json === undefined ? String(arg) : json;
  } catch {
    return String(arg);
  }
}

function initConsoleCapture() {
  const origError = console.error;
  const origWarn = console.warn;

  console.error = (...args) => {
    origError.apply(console, args);
    try {
      consoleBuffer.push({
        level: 'error',
        message: args.map(formatDiagnosticArg).join(' ').slice(0, 500),
        timestamp: new Date().toISOString()
      });
      const firstError = args.find(arg => arg instanceof Error);
      if (firstError) {
        recordNonFatal(firstError, extractGameContext(store.get('gameState') || {}));
      }
    } catch { /* never throw from diagnostic code */ }
  };

  console.warn = (...args) => {
    origWarn.apply(console, args);
    try {
      consoleBuffer.push({
        level: 'warn',
        message: args.map(formatDiagnosticArg).join(' ').slice(0, 500),
        timestamp: new Date().toISOString()
      });
    } catch { /* silent */ }
  };
}

// ============ NETWORK ERROR LOG (capacity 20) ============

const networkBuffer = new RingBuffer(20);

function initNetworkCapture() {
  const origFetch = window.fetch;

  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    const method = init?.method || 'GET';

    try {
      const response = await origFetch.apply(this, arguments);

      if (response.status >= 400 && !url.includes('/api/bug-report')) {
        let bodyPreview = '';
        try { bodyPreview = (await response.clone().text()).slice(0, 200); } catch { /* skip */ }
        networkBuffer.push({
          url: url.slice(0, 200), method,
          status: response.status,
          statusText: response.statusText,
          bodyPreview,
          timestamp: new Date().toISOString()
        });
      }
      return response;
    } catch (err) {
      if (!url.includes('/api/bug-report')) {
        networkBuffer.push({
          url: url.slice(0, 200), method,
          status: 0,
          statusText: (err.message || 'Network error').slice(0, 200),
          bodyPreview: '',
          timestamp: new Date().toISOString()
        });
      }
      throw err;
    }
  };
}

// ============ RECENT ACTION LOG (capacity 30) ============

const actionBuffer = new RingBuffer(30);

export function logAction(type, detail = null) {
  try {
    let safeDetail = detail;
    if (detail && typeof detail === 'object') {
      const str = JSON.stringify(detail);
      safeDetail = str.length > 300 ? str.slice(0, 300) + '...' : detail;
    }
    actionBuffer.push({ type, detail: safeDetail, timestamp: new Date().toISOString() });
  } catch { /* silent */ }
}

export function pushFailure({ tag, detail }) {
  logAction('intent_check_fail', `${tag}: ${detail}`);
}

function initActionTracking() {
  let lastPhase = null;
  store.subscribe((state) => {
    const phase = state.gameState?.phase;
    if (phase && phase !== lastPhase) {
      logAction('phase_change', { from: lastPhase, to: phase });
      const context = extractGameContext(state.gameState || {});
      setCrashContext(context);
      if (phase === 'room') {
        trackMilestone('koto_first_room_seen', context, 'first_room_seen');
      }
      if (phase === 'combat') {
        trackMilestone('koto_first_combat_started', context, 'first_combat_started');
      }
      lastPhase = phase;
    }
  });
}

function initGlobalErrorCapture() {
  if (globalErrorCaptureInitialized) return;
  globalErrorCaptureInitialized = true;

  window.addEventListener('error', (event) => {
    recordNonFatal(
      event.error || new Error(event.message || 'window.error'),
      extractGameContext(store.get('gameState') || {})
    );
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error
      ? event.reason
      : new Error(String(event.reason || 'unhandled rejection'));
    recordNonFatal(reason, extractGameContext(store.get('gameState') || {}));
  });
}

// ============ PERFORMANCE TRACKING ============

let frameCount = 0;
let slowFrameCount = 0;
let lastFrameTime = 0;
let frameStats = null;
let textureSampler = null;

function initPerformanceTracking() {
  lastFrameTime = performance.now();
  frameStats = createFrameStats();
  textureSampler = createTextureSampler({
    getCount: () =>
      window.__pixiApp?.()?.app?.renderer?.texture?.managedTextures?.length ?? null,
  });
  function tick() {
    const now = performance.now();
    frameCount++;
    const delta = now - lastFrameTime;
    if (delta > 33) slowFrameCount++;
    frameStats.onFrame(delta, now);
    textureSampler.maybeSample(now);
    lastFrameTime = now;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ============ PUBLIC API ============

export function snapshot() {
  return {
    consoleErrors: consoleBuffer.toArray(),
    recentActions: actionBuffer.toArray(),
    networkErrors: networkBuffer.toArray(),
    performance: {
      timeSinceLoad: Math.round(performance.now()),
      memoryUsage: performance.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize
      } : null,
      slowFrames: slowFrameCount,
      totalFrames: frameCount,
      frameBuckets: frameStats ? frameStats.toArray() : [],
      textureTimeline: textureSampler ? textureSampler.toArray() : []
    }
  };
}

export function init() {
  if (diagnosticsInitialized) return;
  diagnosticsInitialized = true;
  initConsoleCapture();
  initNetworkCapture();
  initActionTracking();
  initGlobalErrorCapture();
  initPerformanceTracking();
}
