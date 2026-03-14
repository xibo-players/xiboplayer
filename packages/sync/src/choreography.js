// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Pau Aliagas <linuxnow@gmail.com>
/**
 * Transition choreography — compute stagger delays for cascading
 * layout transitions across multiple displays.
 *
 * Supports two modes:
 *
 * 1D mode (position-based):
 *   Displays are numbered 0..N-1 in a row. Simple linear choreographies.
 *   Config: { position, totalDisplays }
 *
 * 2D mode (topology-based):
 *   Each display has (x, y) coordinates and an orientation vector.
 *   Enables directional sweeps, diagonal cascades, and radial effects.
 *   Config: { topology: { x, y, orientation? }, gridCols, gridRows }
 *
 * Topology format:
 *   { x: 1, y: 0, orientation: 0 }
 *   - x, y: grid coordinates (0-indexed)
 *   - orientation: degrees clockwise from upright (0=landscape, 90=portrait-right,
 *     180=inverted, 270=portrait-left). Defaults to 0.
 *
 * Choreographies:
 *   simultaneous — all at once (default, no delay)
 *   wave-right   — sweep left to right (by x)
 *   wave-left    — sweep right to left (by x)
 *   wave-down    — sweep top to bottom (by y, 2D only)
 *   wave-up      — sweep bottom to top (by y, 2D only)
 *   diagonal-tl  — cascade from top-left corner (2D only)
 *   diagonal-tr  — cascade from top-right corner (2D only)
 *   diagonal-bl  — cascade from bottom-left corner (2D only)
 *   diagonal-br  — cascade from bottom-right corner (2D only)
 *   center-out   — explode from center to edges
 *   outside-in   — implode from edges to center
 *   random       — random delay per display
 *
 * @module @xiboplayer/sync/choreography
 */

/**
 * Compute the stagger delay for a display.
 *
 * @param {Object} options
 * @param {string} options.choreography — choreography name
 * @param {number} [options.position] — 1D: this display's 0-indexed position
 * @param {number} [options.totalDisplays] — 1D: total displays in the group
 * @param {Object} [options.topology] — 2D: this display's topology { x, y, orientation? }
 * @param {number} [options.gridCols] — 2D: grid width (columns)
 * @param {number} [options.gridRows] — 2D: grid height (rows)
 * @param {number} options.staggerMs — base delay between consecutive displays (ms)
 * @returns {number} delay in ms before this display should execute its transition
 *
 * @example
 * // 1D: 4 displays, wave-right with 150ms stagger
 * computeStagger({ choreography: 'wave-right', position: 2, totalDisplays: 4, staggerMs: 150 })
 * // → 300
 *
 * @example
 * // 2D: 3×2 grid, diagonal from top-left
 * computeStagger({
 *   choreography: 'diagonal-tl',
 *   topology: { x: 2, y: 1 },
 *   gridCols: 3, gridRows: 2,
 *   staggerMs: 100,
 * })
 * // → 300 (Manhattan distance 2+1=3, so 3×100)
 */
export function computeStagger({ choreography, position, totalDisplays, topology, gridCols, gridRows, staggerMs }) {
  if (!choreography || choreography === 'simultaneous' || !staggerMs) {
    return 0;
  }

  // 2D mode: topology with grid dimensions
  if (topology && gridCols != null && gridRows != null) {
    if (gridCols <= 1 && gridRows <= 1) return 0;
    return _computeStagger2D(choreography, topology, gridCols, gridRows, staggerMs);
  }

  // 1D mode: position-based
  if (totalDisplays == null || totalDisplays <= 1) return 0;
  return _computeStagger1D(choreography, position ?? 0, totalDisplays, staggerMs);
}

/** @private 1D stagger computation */
function _computeStagger1D(choreography, position, totalDisplays, staggerMs) {
  const last = totalDisplays - 1;
  const center = last / 2;

  switch (choreography) {
    case 'wave-right':
      return position * staggerMs;

    case 'wave-left':
      return (last - position) * staggerMs;

    case 'center-out':
      return Math.round(Math.abs(position - center)) * staggerMs;

    case 'outside-in': {
      const maxDist = Math.round(center);
      return (maxDist - Math.round(Math.abs(position - center))) * staggerMs;
    }

    case 'random':
      return Math.floor(Math.random() * last * staggerMs);

    default:
      return 0;
  }
}

/** @private 2D stagger computation */
function _computeStagger2D(choreography, topology, gridCols, gridRows, staggerMs) {
  const { x, y } = topology;
  const maxX = gridCols - 1;
  const maxY = gridRows - 1;
  const centerX = maxX / 2;
  const centerY = maxY / 2;

  switch (choreography) {
    // Axis-aligned sweeps
    case 'wave-right':
      return x * staggerMs;

    case 'wave-left':
      return (maxX - x) * staggerMs;

    case 'wave-down':
      return y * staggerMs;

    case 'wave-up':
      return (maxY - y) * staggerMs;

    // Corner diagonals (Manhattan distance from corner)
    case 'diagonal-tl':
      return (x + y) * staggerMs;

    case 'diagonal-tr':
      return ((maxX - x) + y) * staggerMs;

    case 'diagonal-bl':
      return (x + (maxY - y)) * staggerMs;

    case 'diagonal-br':
      return ((maxX - x) + (maxY - y)) * staggerMs;

    // Radial patterns (Euclidean distance from center)
    case 'center-out': {
      const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
      return Math.round(dist) * staggerMs;
    }

    case 'outside-in': {
      const maxDist = Math.round(Math.sqrt(centerX ** 2 + centerY ** 2));
      const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
      return (maxDist - Math.round(dist)) * staggerMs;
    }

    case 'random': {
      const maxSteps = maxX + maxY; // Manhattan extent
      return Math.floor(Math.random() * maxSteps * staggerMs);
    }

    default:
      return 0;
  }
}
