// @xiboplayer/core - Player core orchestration
import pkg from '../package.json' with { type: 'json' };
export const VERSION = pkg.version;
export { PlayerCore } from './player-core.js';
export { PlayerState } from './state.js';
export { DataConnectorManager } from './data-connectors.js';
