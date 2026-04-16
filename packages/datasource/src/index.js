// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Pau Aliagas <linuxnow@gmail.com>
// @xiboplayer/datasource — shared data-source cache for ADA xp:datasource widgets
import pkg from '../package.json' with { type: 'json' };
export const VERSION = pkg.version;
export { DatasourceClient } from './datasource-client.js';
export { parseJsonPath, evalJsonPath } from './jsonpath.js';
export {
  buildWidgetPreamble,
  attachHostBridge,
  DATASOURCE_MSG_TYPE,
} from './widget-preamble.js';
