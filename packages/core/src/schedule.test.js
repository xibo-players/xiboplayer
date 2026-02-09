/**
 * Schedule Manager Tests
 *
 * Tests for campaign support in schedule manager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ScheduleManager } from './schedule.js';

// Helper to create date strings
function dateStr(hoursOffset = 0) {
  const d = new Date();
  d.setHours(d.getHours() + hoursOffset);
  return d.toISOString();
}

describe('ScheduleManager - Campaigns', () => {
  let manager;

  beforeEach(() => {
    manager = new ScheduleManager();
  });

  describe('Campaign Priority', () => {
    it('should prioritize campaign over standalone layout when priority is higher', () => {
      manager.setSchedule({
        default: '0',
        layouts: [
          { file: '100', priority: 5, fromdt: dateStr(-1), todt: dateStr(1) }
        ],
        campaigns: [
          {
            id: '1',
            priority: 10,
            fromdt: dateStr(-1),
            todt: dateStr(1),
            layouts: [
              { file: '200' },
              { file: '201' },
              { file: '202' }
            ]
          }
        ]
      });

      const layouts = manager.getCurrentLayouts();

      expect(layouts).toHaveLength(3);
      expect(layouts[0]).toBe('200');
      expect(layouts[1]).toBe('201');
      expect(layouts[2]).toBe('202');
    });

    it('should include all layouts from multiple campaigns at same priority', () => {
      manager.setSchedule({
        default: '0',
        layouts: [],
        campaigns: [
          {
            id: '1',
            priority: 10,
            fromdt: dateStr(-1),
            todt: dateStr(1),
            layouts: [
              { file: '100' },
              { file: '101' }
            ]
          },
          {
            id: '2',
            priority: 10,
            fromdt: dateStr(-1),
            todt: dateStr(1),
            layouts: [
              { file: '200' },
              { file: '201' }
            ]
          }
        ]
      });

      const layouts = manager.getCurrentLayouts();

      expect(layouts).toHaveLength(4);
      expect(layouts).toContain('100');
      expect(layouts).toContain('101');
      expect(layouts).toContain('200');
      expect(layouts).toContain('201');
    });

    it('should include both campaign and standalone layouts at same priority', () => {
      manager.setSchedule({
        default: '0',
        layouts: [
          { file: '100', priority: 10, fromdt: dateStr(-1), todt: dateStr(1) },
          { file: '101', priority: 10, fromdt: dateStr(-1), todt: dateStr(1) }
        ],
        campaigns: [
          {
            id: '1',
            priority: 10,
            fromdt: dateStr(-1),
            todt: dateStr(1),
            layouts: [
              { file: '200' },
              { file: '201' }
            ]
          }
        ]
      });

      const layouts = manager.getCurrentLayouts();

      expect(layouts).toHaveLength(4);
      expect(layouts).toContain('100');
      expect(layouts).toContain('101');
      expect(layouts).toContain('200');
      expect(layouts).toContain('201');
    });
  });

  describe('Campaign Time Windows', () => {
    it('should ignore campaign outside time window', () => {
      manager.setSchedule({
        default: '0',
        layouts: [
          { file: '100', priority: 5, fromdt: dateStr(-1), todt: dateStr(1) }
        ],
        campaigns: [
          {
            id: '1',
            priority: 10,
            fromdt: dateStr(-10), // Started 10 hours ago
            todt: dateStr(-5),    // Ended 5 hours ago
            layouts: [
              { file: '200' },
              { file: '201' }
            ]
          }
        ]
      });

      const layouts = manager.getCurrentLayouts();

      expect(layouts).toHaveLength(1);
      expect(layouts[0]).toBe('100');
    });
  });

  describe('Default Layout', () => {
    it('should return default layout when no schedules active', () => {
      manager.setSchedule({
        default: '999',
        layouts: [],
        campaigns: []
      });

      const layouts = manager.getCurrentLayouts();

      expect(layouts).toHaveLength(1);
      expect(layouts[0]).toBe('999');
    });
  });

  describe('Campaign Layout Order', () => {
    it('should preserve layout order within campaign', () => {
      manager.setSchedule({
        default: '0',
        layouts: [],
        campaigns: [
          {
            id: '1',
            priority: 10,
            fromdt: dateStr(-1),
            todt: dateStr(1),
            layouts: [
              { file: '205' },
              { file: '203' },
              { file: '204' },
              { file: '201' },
              { file: '202' }
            ]
          }
        ]
      });

      const layouts = manager.getCurrentLayouts();

      expect(layouts).toHaveLength(5);
      expect(layouts[0]).toBe('205');
      expect(layouts[1]).toBe('203');
      expect(layouts[2]).toBe('204');
      expect(layouts[3]).toBe('201');
      expect(layouts[4]).toBe('202');
    });
  });
});
