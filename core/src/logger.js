/**
 * Configurable Logger for Xibo Players
 *
 * Supports log levels: DEBUG, INFO, WARNING, ERROR
 * Production: Only WARNING and ERROR
 * Development: All levels
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARNING: 2,
  ERROR: 3,
  NONE: 4
};

class Logger {
  constructor(name, level = 'INFO') {
    this.name = name;
    this.setLevel(level);
  }

  setLevel(level) {
    if (typeof level === 'string') {
      this.level = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
    } else {
      this.level = level;
    }
  }

  debug(...args) {
    if (this.level <= LOG_LEVELS.DEBUG) {
      console.log(`[${this.name}] DEBUG:`, ...args);
    }
  }

  info(...args) {
    if (this.level <= LOG_LEVELS.INFO) {
      console.log(`[${this.name}]`, ...args);
    }
  }

  warn(...args) {
    if (this.level <= LOG_LEVELS.WARNING) {
      console.warn(`[${this.name}]`, ...args);
    }
  }

  error(...args) {
    if (this.level <= LOG_LEVELS.ERROR) {
      console.error(`[${this.name}]`, ...args);
    }
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

// Set global level from environment or localStorage
if (typeof window !== 'undefined') {
  const urlParams = new URLSearchParams(window.location.search);
  const urlLevel = urlParams.get('logLevel');
  const storageLevel = localStorage.getItem('xibo_log_level');

  if (urlLevel) {
    globalConfig.setGlobalLevel(urlLevel);
  } else if (storageLevel) {
    globalConfig.setGlobalLevel(storageLevel);
  } else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    // Development mode - debug logging
    globalConfig.setGlobalLevel('DEBUG');
  } else {
    // Production mode - warnings and errors only
    globalConfig.setGlobalLevel('WARNING');
  }
}

// Factory function
export function createLogger(name, level = null) {
  const logger = new Logger(name, level ?? globalConfig.getLevelName(globalConfig.level));
  return logger;
}

// Set global log level
export function setLogLevel(level) {
  globalConfig.setGlobalLevel(level);

  // Save to localStorage
  if (typeof window !== 'undefined') {
    localStorage.setItem('xibo_log_level', level.toUpperCase());
  }
}

// Get current log level
export function getLogLevel() {
  return globalConfig.getLevelName(globalConfig.level);
}

export { LOG_LEVELS };
