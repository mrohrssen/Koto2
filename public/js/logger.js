const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const storedLevel = typeof localStorage !== 'undefined' ? localStorage.getItem('logLevel') : null;
let currentLevel = LEVELS[storedLevel] ?? LEVELS.info;

function shouldLog(level) {
  return LEVELS[level] >= currentLevel;
}

function formatMessage(level, ...args) {
  const prefix = `[${level}]`;
  if (level === 'debug') {
    const time = new Date().toISOString().split('T')[1].slice(0, 12);
    return [time, prefix, ...args];
  }
  return [prefix, ...args];
}

export const logger = {
  debug(...args) {
    if (shouldLog('debug')) {
      console.debug(...formatMessage('debug', ...args));
    }
  },

  info(...args) {
    if (shouldLog('info')) {
      console.log(...formatMessage('info', ...args));
    }
  },

  warn(...args) {
    if (shouldLog('warn')) {
      console.warn(...formatMessage('warn', ...args));
    }
  },

  error(...args) {
    if (shouldLog('error')) {
      console.error(...formatMessage('error', ...args));
    }
  },

  setLevel(level) {
    if (level in LEVELS) {
      currentLevel = LEVELS[level];
      localStorage.setItem('logLevel', level);
    }
  },

  getLevel() {
    return Object.keys(LEVELS).find(k => LEVELS[k] === currentLevel);
  }
};

// Expose to window for browser console access
if (typeof window !== 'undefined') {
  window.logger = logger;
}
