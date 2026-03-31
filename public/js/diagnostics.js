/**
 * Client-side diagnostics collector for enhanced bug reports.
 *
 * Captures console errors, network failures, player actions, and
 * performance data in lightweight ring buffers. Call init() early
 * (before other modules) so console/fetch are wrapped first.
 */

import { store } from './store.js';

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

function initConsoleCapture() {
  const origError = console.error;
  const origWarn = console.warn;

  console.error = (...args) => {
    origError.apply(console, args);
    try {
      consoleBuffer.push({
        level: 'error',
        message: args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ').slice(0, 500),
        timestamp: new Date().toISOString()
      });
    } catch { /* never throw from diagnostic code */ }
  };

  console.warn = (...args) => {
    origWarn.apply(console, args);
    try {
      consoleBuffer.push({
        level: 'warn',
        message: args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ').slice(0, 500),
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

function initActionTracking() {
  let lastPhase = null;
  store.subscribe((state) => {
    const phase = state.gameState?.phase;
    if (phase && phase !== lastPhase) {
      logAction('phase_change', { from: lastPhase, to: phase });
      lastPhase = phase;
    }
  });
}

// ============ PERFORMANCE TRACKING ============

let frameCount = 0;
let slowFrameCount = 0;
let lastFrameTime = 0;

function initPerformanceTracking() {
  lastFrameTime = performance.now();
  function tick() {
    const now = performance.now();
    frameCount++;
    if (now - lastFrameTime > 33) slowFrameCount++;
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
      totalFrames: frameCount
    }
  };
}

export function init() {
  initConsoleCapture();
  initNetworkCapture();
  initActionTracking();
  initPerformanceTracking();
}
