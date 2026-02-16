/**
 * Configurable Logger for Xibo Players
 *
 * Supports log levels: DEBUG, INFO, WARNING, ERROR, NONE
 *
 * Level precedence (highest wins):
 *   1. URL param ?logLevel=DEBUG
 *   2. localStorage xibo_log_level
 *   3. CMS setting via RegisterDisplay (call applyCmsLogLevel())
 *   4. Default: DEBUG on localhost, INFO in production
 *
 * Loggers created without an explicit level are REACTIVE — they follow
 * the global level at call time, so setLogLevel() affects all of them.
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARNING: 2,
  ERROR: 3,
  NONE: 4
};

// Log sink system — external consumers (e.g., LogReporter) can intercept all log output
const logSinks = [];

class Logger {
  /**
   * @param {string} name - Logger name (shown in prefix)
   * @param {string|null} level - Explicit level string, or null to follow global
   */
  constructor(name, level = null) {
    this.name = name;
    this.useGlobal = (level === null);
    if (!this.useGlobal) {
      this.setLevel(level);
    }
  }

  setLevel(level) {
    this.useGlobal = false;
    if (typeof level === 'string') {
      this.level = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
    } else {
      this.level = level;
    }
  }

  /** Effective level: own override or global */
  getEffectiveLevel() {
    return this.useGlobal ? globalConfig.level : this.level;
  }

  debug(...args) {
    if (this.getEffectiveLevel() <= LOG_LEVELS.DEBUG) {
      console.log(`[${this.name}] DEBUG:`, ...args);
    }
    _dispatchToSinks('debug', this.name, args);
  }

  info(...args) {
    if (this.getEffectiveLevel() <= LOG_LEVELS.INFO) {
      console.log(`[${this.name}]`, ...args);
    }
    _dispatchToSinks('info', this.name, args);
  }

  warn(...args) {
    if (this.getEffectiveLevel() <= LOG_LEVELS.WARNING) {
      console.warn(`[${this.name}]`, ...args);
    }
    _dispatchToSinks('warning', this.name, args);
  }

  error(...args) {
    if (this.getEffectiveLevel() <= LOG_LEVELS.ERROR) {
      console.error(`[${this.name}]`, ...args);
    }
    _dispatchToSinks('error', this.name, args);
  }

  // Convenience method for conditional logging
  log(level, ...args) {
    switch (level.toUpperCase()) {
      case 'DEBUG': return this.debug(...args);
      case 'INFO': return this.info(...args);
      case 'WARNING':
      case 'WARN': return this.warn(...args);
      case 'ERROR': return this.error(...args);
    }
  }
}

// Global log level configuration
const globalConfig = {
  level: LOG_LEVELS.INFO, // Default: INFO and above

  setGlobalLevel(level) {
    if (typeof level === 'string') {
      this.level = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
    } else {
      this.level = level;
    }

    console.log(`[Logger] Global log level set to: ${this.getLevelName(this.level)}`);
  },

  getLevelName(level) {
    return Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level) || 'UNKNOWN';
  }
};

// Track whether the level was set by a local override (URL param / localStorage)
let hasLocalOverride = false;

// Set global level from environment or localStorage
if (typeof window !== 'undefined') {
  const urlParams = new URLSearchParams(window.location.search);
  const urlLevel = urlParams.get('logLevel');
  const storageLevel = localStorage.getItem('xibo_log_level');

  if (urlLevel) {
    globalConfig.setGlobalLevel(urlLevel);
    hasLocalOverride = true;
  } else if (storageLevel) {
    globalConfig.setGlobalLevel(storageLevel);
    hasLocalOverride = true;
  } else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    // Development mode - debug logging
    globalConfig.setGlobalLevel('DEBUG');
  } else {
    // Production mode - INFO by default (CMS can override later)
    globalConfig.setGlobalLevel('INFO');
  }
}

// Factory function — loggers follow global level by default (reactive)
export function createLogger(name, level = null) {
  return new Logger(name, level);
}

// Set global log level (and persist to localStorage)
export function setLogLevel(level) {
  globalConfig.setGlobalLevel(level);

  // Save to localStorage
  if (typeof window !== 'undefined') {
    localStorage.setItem('xibo_log_level', level.toUpperCase());
  }
}

// Get current log level name
export function getLogLevel() {
  return globalConfig.getLevelName(globalConfig.level);
}

/**
 * Returns true when the effective global level is DEBUG.
 * Use this for conditional debug features (video controls, overlays, etc.)
 */
export function isDebug() {
  return globalConfig.level <= LOG_LEVELS.DEBUG;
}

/**
 * Apply CMS logLevel setting — only if no local override (URL/localStorage) exists.
 * @param {string} cmsLevel - CMS level string: 'error', 'audit', 'info', 'debug'
 * @returns {boolean} true if the level was applied
 */
export function applyCmsLogLevel(cmsLevel) {
  if (hasLocalOverride) return false;
  if (!cmsLevel) return false;

  const mapped = mapCmsLogLevel(cmsLevel);
  globalConfig.setGlobalLevel(mapped);
  return true;
}

/**
 * Map CMS logLevel strings to internal level names.
 * CMS uses: 'emergency','alert','critical','error','warning','notice','info','debug','audit'
 * We collapse them to our 4 levels.
 */
export function mapCmsLogLevel(cmsLevel) {
  switch ((cmsLevel || '').toLowerCase()) {
    case 'debug':
      return 'DEBUG';
    case 'info':
    case 'notice':
    case 'audit':
      return 'INFO';
    case 'warning':
      return 'WARNING';
    case 'error':
    case 'critical':
    case 'alert':
    case 'emergency':
      return 'ERROR';
    default:
      return 'INFO';
  }
}

/**
 * Dispatch log entry to all registered sinks.
 * Sinks receive { level, name, args } and should not throw.
 * @private
 */
function _dispatchToSinks(level, name, args) {
  if (logSinks.length === 0) return;
  for (const fn of logSinks) {
    try {
      fn({ level, name, args });
    } catch (_) {
      // Sink errors must never break logging
    }
  }
}

/**
 * Register a log sink — receives all log output regardless of level filtering.
 * @param {function} fn - Callback: ({ level, name, args }) => void
 */
export function registerLogSink(fn) {
  logSinks.push(fn);
}

/**
 * Unregister a previously registered log sink.
 * @param {function} fn - The same function reference passed to registerLogSink
 */
export function unregisterLogSink(fn) {
  const idx = logSinks.indexOf(fn);
  if (idx >= 0) logSinks.splice(idx, 1);
}

export { LOG_LEVELS };
