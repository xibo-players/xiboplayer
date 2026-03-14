// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Pau Aliagas <linuxnow@gmail.com>
import { describe, it, expect } from 'vitest';
import { computeStagger } from './choreography.js';

// ── 1D helpers ────────────────────────────────────────────────────
const opts = (choreography, position, totalDisplays = 4, staggerMs = 150) =>
  ({ choreography, position, totalDisplays, staggerMs });

// ── 2D helpers ────────────────────────────────────────────────────
const opts2D = (choreography, x, y, gridCols = 3, gridRows = 2, staggerMs = 100) =>
  ({ choreography, topology: { x, y }, gridCols, gridRows, staggerMs });

// ══════════════════════════════════════════════════════════════════
// 1D MODE (backward compatible)
// ══════════════════════════════════════════════════════════════════
describe('computeStagger — 1D mode', () => {
  describe('simultaneous (default)', () => {
    it('returns 0 for simultaneous', () => {
      expect(computeStagger(opts('simultaneous', 0))).toBe(0);
      expect(computeStagger(opts('simultaneous', 3))).toBe(0);
    });

    it('returns 0 when no choreography', () => {
      expect(computeStagger(opts(null, 2))).toBe(0);
      expect(computeStagger(opts(undefined, 2))).toBe(0);
      expect(computeStagger(opts('', 2))).toBe(0);
    });

    it('returns 0 for single display', () => {
      expect(computeStagger(opts('wave-right', 0, 1, 150))).toBe(0);
    });

    it('returns 0 when staggerMs is 0', () => {
      expect(computeStagger(opts('wave-right', 2, 4, 0))).toBe(0);
    });
  });

  describe('wave-right', () => {
    it('staggers left to right', () => {
      expect(computeStagger(opts('wave-right', 0))).toBe(0);
      expect(computeStagger(opts('wave-right', 1))).toBe(150);
      expect(computeStagger(opts('wave-right', 2))).toBe(300);
      expect(computeStagger(opts('wave-right', 3))).toBe(450);
    });
  });

  describe('wave-left', () => {
    it('staggers right to left', () => {
      expect(computeStagger(opts('wave-left', 0))).toBe(450);
      expect(computeStagger(opts('wave-left', 1))).toBe(300);
      expect(computeStagger(opts('wave-left', 2))).toBe(150);
      expect(computeStagger(opts('wave-left', 3))).toBe(0);
    });
  });

  describe('center-out', () => {
    it('explodes from center (even count)', () => {
      // 4 displays: center = 1.5
      // pos 0: |0-1.5| = 1.5 → round(1.5)*150 = 2*150 = 300
      // pos 1: |1-1.5| = 0.5 → round(0.5)*150 = 1*150 = 150  (JS rounds .5 up)
      // pos 2: |2-1.5| = 0.5 → round(0.5)*150 = 1*150 = 150
      // pos 3: |3-1.5| = 1.5 → round(1.5)*150 = 2*150 = 300
      expect(computeStagger(opts('center-out', 0))).toBe(300);
      expect(computeStagger(opts('center-out', 1))).toBe(150);
      expect(computeStagger(opts('center-out', 2))).toBe(150);
      expect(computeStagger(opts('center-out', 3))).toBe(300);
    });

    it('explodes from center (odd count)', () => {
      // 5 displays: center = 2
      expect(computeStagger(opts('center-out', 0, 5, 100))).toBe(200);
      expect(computeStagger(opts('center-out', 1, 5, 100))).toBe(100);
      expect(computeStagger(opts('center-out', 2, 5, 100))).toBe(0);
      expect(computeStagger(opts('center-out', 3, 5, 100))).toBe(100);
      expect(computeStagger(opts('center-out', 4, 5, 100))).toBe(200);
    });
  });

  describe('outside-in', () => {
    it('implodes from edges (odd count)', () => {
      expect(computeStagger(opts('outside-in', 0, 5, 100))).toBe(0);
      expect(computeStagger(opts('outside-in', 1, 5, 100))).toBe(100);
      expect(computeStagger(opts('outside-in', 2, 5, 100))).toBe(200);
      expect(computeStagger(opts('outside-in', 3, 5, 100))).toBe(100);
      expect(computeStagger(opts('outside-in', 4, 5, 100))).toBe(0);
    });
  });

  describe('random', () => {
    it('returns a value within range', () => {
      const delay = computeStagger(opts('random', 2));
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThan(3 * 150); // last * staggerMs
    });
  });

  describe('unknown choreography', () => {
    it('returns 0 for unrecognized name', () => {
      expect(computeStagger(opts('zigzag', 2))).toBe(0);
    });
  });
});

// ══════════════════════════════════════════════════════════════════
// 2D MODE (topology-based)
// ══════════════════════════════════════════════════════════════════
describe('computeStagger — 2D mode', () => {
  // 3×2 grid:
  //   (0,0) (1,0) (2,0)
  //   (0,1) (1,1) (2,1)

  describe('edge cases', () => {
    it('returns 0 for 1×1 grid', () => {
      expect(computeStagger(opts2D('wave-right', 0, 0, 1, 1, 100))).toBe(0);
    });

    it('returns 0 for simultaneous', () => {
      expect(computeStagger(opts2D('simultaneous', 1, 1))).toBe(0);
    });
  });

  describe('wave-right (by x only)', () => {
    it('staggers by x coordinate', () => {
      expect(computeStagger(opts2D('wave-right', 0, 0))).toBe(0);
      expect(computeStagger(opts2D('wave-right', 1, 0))).toBe(100);
      expect(computeStagger(opts2D('wave-right', 2, 0))).toBe(200);
      // Same x = same delay regardless of y
      expect(computeStagger(opts2D('wave-right', 1, 1))).toBe(100);
    });
  });

  describe('wave-left (by x, reversed)', () => {
    it('staggers right to left', () => {
      expect(computeStagger(opts2D('wave-left', 0, 0))).toBe(200);
      expect(computeStagger(opts2D('wave-left', 2, 0))).toBe(0);
    });
  });

  describe('wave-down (by y only)', () => {
    it('staggers by y coordinate', () => {
      expect(computeStagger(opts2D('wave-down', 0, 0))).toBe(0);
      expect(computeStagger(opts2D('wave-down', 0, 1))).toBe(100);
      // Same y = same delay regardless of x
      expect(computeStagger(opts2D('wave-down', 2, 0))).toBe(0);
    });
  });

  describe('wave-up (by y, reversed)', () => {
    it('staggers bottom to top', () => {
      expect(computeStagger(opts2D('wave-up', 0, 0))).toBe(100);
      expect(computeStagger(opts2D('wave-up', 0, 1))).toBe(0);
    });
  });

  describe('diagonal-tl (from top-left)', () => {
    it('staggers by Manhattan distance from (0,0)', () => {
      // (0,0)→0, (1,0)→1, (2,0)→2, (0,1)→1, (1,1)→2, (2,1)→3
      expect(computeStagger(opts2D('diagonal-tl', 0, 0))).toBe(0);
      expect(computeStagger(opts2D('diagonal-tl', 1, 0))).toBe(100);
      expect(computeStagger(opts2D('diagonal-tl', 0, 1))).toBe(100);
      expect(computeStagger(opts2D('diagonal-tl', 2, 0))).toBe(200);
      expect(computeStagger(opts2D('diagonal-tl', 1, 1))).toBe(200);
      expect(computeStagger(opts2D('diagonal-tl', 2, 1))).toBe(300);
    });
  });

  describe('diagonal-tr (from top-right)', () => {
    it('staggers by Manhattan distance from (maxX,0)', () => {
      // maxX=2: (2,0)→0, (1,0)→1, (0,0)→2, (2,1)→1, (1,1)→2, (0,1)→3
      expect(computeStagger(opts2D('diagonal-tr', 2, 0))).toBe(0);
      expect(computeStagger(opts2D('diagonal-tr', 1, 0))).toBe(100);
      expect(computeStagger(opts2D('diagonal-tr', 0, 0))).toBe(200);
      expect(computeStagger(opts2D('diagonal-tr', 0, 1))).toBe(300);
    });
  });

  describe('diagonal-bl (from bottom-left)', () => {
    it('staggers by Manhattan distance from (0,maxY)', () => {
      // maxY=1: (0,1)→0, (1,1)→1, (0,0)→1, (2,1)→2, (1,0)→2, (2,0)→3
      expect(computeStagger(opts2D('diagonal-bl', 0, 1))).toBe(0);
      expect(computeStagger(opts2D('diagonal-bl', 0, 0))).toBe(100);
      expect(computeStagger(opts2D('diagonal-bl', 2, 1))).toBe(200);
      expect(computeStagger(opts2D('diagonal-bl', 2, 0))).toBe(300);
    });
  });

  describe('diagonal-br (from bottom-right)', () => {
    it('staggers by Manhattan distance from (maxX,maxY)', () => {
      // (2,1)→0, (1,1)→1, (2,0)→1, (0,1)→2, (1,0)→2, (0,0)→3
      expect(computeStagger(opts2D('diagonal-br', 2, 1))).toBe(0);
      expect(computeStagger(opts2D('diagonal-br', 1, 1))).toBe(100);
      expect(computeStagger(opts2D('diagonal-br', 2, 0))).toBe(100);
      expect(computeStagger(opts2D('diagonal-br', 0, 0))).toBe(300);
    });
  });

  describe('center-out (Euclidean from center)', () => {
    it('radiates from center of 3×3 grid', () => {
      // 3×3 grid, center = (1,1)
      // (1,1)→0, (0,1)→1, (1,0)→1, (0,0)→√2≈1.41→round=1
      const o = (x, y) => opts2D('center-out', x, y, 3, 3, 100);
      expect(computeStagger(o(1, 1))).toBe(0);     // center
      expect(computeStagger(o(0, 1))).toBe(100);   // dist 1
      expect(computeStagger(o(1, 0))).toBe(100);   // dist 1
      expect(computeStagger(o(0, 0))).toBe(100);   // dist √2 ≈ 1.41 → round = 1
      expect(computeStagger(o(2, 2))).toBe(100);   // dist √2 ≈ 1.41 → round = 1
    });
  });

  describe('outside-in (reverse radial)', () => {
    it('edges first, center last on 3×3', () => {
      // 3×3: maxDist = round(√(1²+1²)) = round(1.41) = 1
      // (0,0): dist=√2≈1.41→round=1 → (1-1)=0 → 0ms
      // (1,1): dist=0→round=0 → (1-0)=1 → 100ms
      const o = (x, y) => opts2D('outside-in', x, y, 3, 3, 100);
      expect(computeStagger(o(0, 0))).toBe(0);     // corner, starts first
      expect(computeStagger(o(1, 1))).toBe(100);   // center, last
    });
  });

  describe('random (2D)', () => {
    it('returns a value within range', () => {
      const delay = computeStagger(opts2D('random', 1, 1));
      // maxSteps = maxX + maxY = 2 + 1 = 3
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThan(3 * 100);
    });
  });

  describe('unknown 2D choreography', () => {
    it('returns 0', () => {
      expect(computeStagger(opts2D('spiral', 1, 1))).toBe(0);
    });
  });

  describe('topology with orientation', () => {
    it('orientation does not affect stagger (cosmetic metadata)', () => {
      const base = computeStagger(opts2D('wave-right', 1, 0));
      const withOrientation = computeStagger({
        choreography: 'wave-right',
        topology: { x: 1, y: 0, orientation: 90 },
        gridCols: 3, gridRows: 2, staggerMs: 100,
      });
      expect(withOrientation).toBe(base);
    });
  });
});
