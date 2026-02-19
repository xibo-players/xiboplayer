// @xiboplayer/settings - CMS settings management
import pkg from '../package.json' with { type: 'json' };
export const VERSION = pkg.version;

/**
 * Settings manager for Xibo Player
 * @module @xiboplayer/settings
 */
export { DisplaySettings } from './settings.js';
