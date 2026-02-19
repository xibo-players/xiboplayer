// @xiboplayer/xmr - XMR WebSocket client
import pkg from '../package.json' with { type: 'json' };
export const VERSION = pkg.version;
export { XmrWrapper } from './xmr-wrapper.js';
