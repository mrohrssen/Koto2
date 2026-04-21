import { postKnownWordExposures } from '../api.js';
import { extractExposureEntries } from '../shared/exposure-extractor.js';

const DEFAULT_DEBOUNCE_MS = 500;

let pendingEntries = [];
let flushTimer = null;
let debounceMs = DEFAULT_DEBOUNCE_MS;
let postFn = postKnownWordExposures;
let currentDocument = null;
let currentWindow = null;
let onlineTarget = null;
let cleanupFns = [];
let initialized = false;

function clearFlushTimer() {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

function registerListener(target, type, listener) {
  if (!target?.addEventListener) return;
  target.addEventListener(type, listener);
  cleanupFns.push(() => target.removeEventListener?.(type, listener));
}

function scheduleFlush() {
  clearFlushTimer();
  flushTimer = setTimeout(() => {
    void flushNow();
  }, debounceMs);
}

export function init(options = {}) {
  teardown();

  initialized = true;
  debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  postFn = options.postFn ?? postKnownWordExposures;
  currentDocument = options.document ?? globalThis.document ?? null;
  currentWindow = options.window ?? globalThis.window ?? null;
  onlineTarget = options.onlineTarget ?? currentWindow;

  registerListener(currentDocument, 'visibilitychange', () => {
    if (currentDocument?.visibilityState === 'hidden') {
      void flushNow({ keepalive: true });
    }
  });

  registerListener(currentWindow, 'pagehide', () => {
    void flushNow({ keepalive: true });
  });

  registerListener(onlineTarget, 'online', () => {
    if (pendingEntries.length > 0) {
      void flushNow();
    }
  });

  return teardown;
}

export function record(tokens, wordDict, overrides = {}) {
  if (!initialized) return;

  const entries = extractExposureEntries(tokens, wordDict, overrides);
  if (entries.length === 0) return;

  pendingEntries.push(...entries);
  scheduleFlush();
}

export async function flushNow(options = {}) {
  clearFlushTimer();

  if (!initialized || pendingEntries.length === 0) {
    return false;
  }

  const batch = pendingEntries;
  pendingEntries = [];

  try {
    await postFn(batch, { keepalive: options.keepalive === true });
    return true;
  } catch (error) {
    pendingEntries.unshift(...batch);
    console.warn('[exposure-buffer] Failed to flush exposures:', error?.message || error);
    return false;
  }
}

export function teardown() {
  clearFlushTimer();
  while (cleanupFns.length > 0) {
    cleanupFns.pop()();
  }
  pendingEntries = [];
  debounceMs = DEFAULT_DEBOUNCE_MS;
  postFn = postKnownWordExposures;
  currentDocument = null;
  currentWindow = null;
  onlineTarget = null;
  initialized = false;
}
