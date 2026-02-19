// @xiboplayer/utils - Shared utilities
import pkg from '../package.json' with { type: 'json' };
export const VERSION = pkg.version;
export { createLogger, setLogLevel, getLogLevel, isDebug, applyCmsLogLevel, mapCmsLogLevel, registerLogSink, unregisterLogSink, LOG_LEVELS } from './logger.js';
export { EventEmitter } from './event-emitter.js';
export { config } from './config.js';
export { fetchWithRetry } from './fetch-retry.js';
export { CmsApiClient, CmsApiError } from './cms-api.js';
