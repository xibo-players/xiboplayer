#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// CLI bridge for hardware detection — used by Chromium's launch-kiosk.sh
// Usage: node detect-hardware.js [--gpu=auto|nvidia|intel|amd|/dev/dri/renderDNNN] [--json]
//
// Output (default): KEY=VALUE pairs for shell eval
// Output (--json):  JSON object

import { detectGPUs, selectGPU, getMemoryTuning } from '../src/hardware.js';

const args = process.argv.slice(2);
const gpuPref = (args.find(a => a.startsWith('--gpu=')) || '').split('=')[1] || 'auto';
const jsonOutput = args.includes('--json');

const gpus = detectGPUs();
const selected = selectGPU(gpus, gpuPref);
const mem = getMemoryTuning();

const result = {
  gpu_count: gpus.length,
  gpu_selected: selected ? selected.label : 'none',
  gpu_render_node: selected ? selected.renderNode : '',
  gpu_va_driver: selected ? (selected.vaDriver || '') : '',
  gpu_vendor: selected ? selected.name : '',
  gpu_has_display: selected ? selected.hasDisplay : false,
  ram_gb: mem.totalRAM_GB,
  cpu_count: mem.cpuCount,
  max_old_space_mb: mem.maxOldSpaceMB,
  raster_threads: mem.rasterThreads,
};

if (jsonOutput) {
  console.log(JSON.stringify(result));
} else {
  for (const [k, v] of Object.entries(result)) {
    console.log(`${k.toUpperCase()}=${v}`);
  }
}
