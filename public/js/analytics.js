import { PLATFORM } from './platform.js';
import {
  buildFirebaseConfig,
  extractGameContext,
  sanitizeParams,
  createMilestoneStore,
  nextFurthestStep
} from './analytics-core.js';

function getDefaultEnv() {
  return import.meta.env || {};
}

async function createWebTransport(config) {
  const [{ initializeApp }, { getAnalytics, logEvent, setUserId, setUserProperties }] = await Promise.all([
    import('firebase/app'),
    import('firebase/analytics')
  ]);
  const app = initializeApp(config);
  const analytics = getAnalytics(app);
  return {
    init: async () => {},
    logEvent: async (name, params) => logEvent(analytics, name, params),
    setUserId: async (userId) => setUserId(analytics, userId),
    setUserProperty: async (key, value) => setUserProperties(analytics, { [key]: value }),
    setCrashKey: async () => {},
    recordException: async () => {}
  };
}

function toCrashlyticsValue(key, value) {
  if (typeof value === 'boolean') return { key, value, type: 'boolean' };
  if (typeof value === 'number' && Number.isInteger(value)) return { key, value, type: 'int' };
  if (typeof value === 'number') return { key, value, type: 'double' };
  return { key, value: String(value), type: 'string' };
}

async function createNativeTransport() {
  const [{ FirebaseAnalytics }, crashlyticsModule] = await Promise.all([
    import('@capacitor-firebase/analytics'),
    import('@capacitor-firebase/crashlytics').catch(() => ({ FirebaseCrashlytics: null }))
  ]);
  const FirebaseCrashlytics = crashlyticsModule.FirebaseCrashlytics || null;
  return {
    init: async () => {
      try {
        await FirebaseAnalytics.setEnabled?.({ enabled: true });
      } catch (err) {
        console.warn('[Analytics] native collection enable failed:', err?.message || err);
      }
    },
    logEvent: async (name, params) => FirebaseAnalytics.logEvent({ name, params }),
    setUserId: async (userId) => {
      await FirebaseAnalytics.setUserId({ userId });
      await FirebaseCrashlytics?.setUserId?.({ userId });
    },
    setUserProperty: async (key, value) => FirebaseAnalytics.setUserProperty({ key, value }),
    setCrashKey: async (key, value) => FirebaseCrashlytics?.setCustomKey?.(toCrashlyticsValue(key, value)),
    recordException: async (error, context) => FirebaseCrashlytics?.recordException?.({
      message: error?.message || String(error),
      keysAndValues: Object.entries(context || {}).map(([key, value]) => toCrashlyticsValue(key, value))
    })
  };
}

export function createAnalyticsClient({
  env = getDefaultEnv(),
  platform = PLATFORM,
  storage = typeof localStorage !== 'undefined' ? localStorage : null,
  transportFactory = null
} = {}) {
  const config = buildFirebaseConfig(env);
  let transport = null;
  let analyticsId = null;
  let milestoneStore = null;
  let initialized = false;
  let furthestStep = null;
  const warnedLabels = new Set();

  async function runSafely(label, fn) {
    try {
      return await fn();
    } catch (err) {
      // Firebase plugins are unimplemented on iOS; without this gate their
      // failure warnings fill the entire diagnostics console buffer within
      // seconds and blind bug reports to real errors.
      if (!warnedLabels.has(label)) {
        warnedLabels.add(label);
        console.warn(`[Analytics] ${label} failed:`, err?.message || err);
      }
      return null;
    }
  }

  async function ensureTransport() {
    if (!config) return null;
    if (transport) return transport;
    const factory = transportFactory || (platform.isNative ? createNativeTransport : createWebTransport);
    try {
      transport = await factory(config, { platform });
      await transport.init?.();
      return transport;
    } catch (err) {
      console.warn('[Analytics] init failed:', err?.message || err);
      transport = null;
      return null;
    }
  }

  async function init() {
    if (initialized) return;
    initialized = true;
    await ensureTransport();
  }

  async function setAnalyticsUser(user = {}) {
    analyticsId = user.analyticsId || null;
    milestoneStore = createMilestoneStore(storage, analyticsId);
    const t = await ensureTransport();
    if (!t || !analyticsId) return;
    await runSafely('setUserId', () => t.setUserId?.(analyticsId));
    await runSafely('set platform', () => t.setUserProperty?.('koto_platform', platform.isNative ? 'native' : 'web'));
  }

  async function setUserProperty(key, value) {
    if (value === null || value === undefined) return;
    const t = await ensureTransport();
    if (!t) return;
    await runSafely('setUserProperty', () => t.setUserProperty?.(key, String(value)));
  }

  async function trackEvent(name, params = {}) {
    const t = await ensureTransport();
    if (!t) return;
    await runSafely('logEvent', () => t.logEvent?.(name, sanitizeParams(params)));
  }

  async function trackMilestone(name, params = {}, step = null) {
    if (!milestoneStore) milestoneStore = createMilestoneStore(storage, analyticsId);
    if (milestoneStore.has(name)) return;
    await trackEvent(name, params);
    milestoneStore.mark(name);
    if (step) {
      furthestStep = nextFurthestStep(furthestStep, step);
      if (furthestStep) await setUserProperty('koto_furthest_step', furthestStep);
    }
  }

  async function setCrashContext(stateOrContext = {}) {
    const context = stateOrContext.run || stateOrContext.combat || stateOrContext.meta
      ? extractGameContext(stateOrContext)
      : sanitizeParams(stateOrContext);
    const t = await ensureTransport();
    if (!t) return;
    for (const [key, value] of Object.entries(context)) {
      await runSafely('setCrashKey', () => t.setCrashKey?.(key, value));
    }
  }

  async function updateCurrentUserProperties(state = {}) {
    const context = extractGameContext(state);
    await setUserProperty('koto_tutorial_step', context.tutorial_step);
    await setUserProperty('koto_highest_area', context.highest_area);
  }

  async function recordNonFatal(error, context = {}) {
    const t = await ensureTransport();
    if (!t) return;
    const safeContext = sanitizeParams(context);
    for (const [key, value] of Object.entries(safeContext)) {
      await runSafely('setCrashKey', () => t.setCrashKey?.(key, value));
    }
    await runSafely('recordException', () => t.recordException?.(error, safeContext));
  }

  return {
    init,
    setAnalyticsUser,
    setUserProperty,
    updateCurrentUserProperties,
    trackEvent,
    trackMilestone,
    setCrashContext,
    recordNonFatal
  };
}

export const analytics = createAnalyticsClient();
export const initAnalytics = (...args) => analytics.init(...args);
export const setAnalyticsUser = (...args) => analytics.setAnalyticsUser(...args);
export const updateCurrentUserProperties = (...args) => analytics.updateCurrentUserProperties(...args);
export const trackEvent = (...args) => analytics.trackEvent(...args);
export const trackMilestone = (...args) => analytics.trackMilestone(...args);
export const setCrashContext = (...args) => analytics.setCrashContext(...args);
export const recordNonFatal = (...args) => analytics.recordNonFatal(...args);
