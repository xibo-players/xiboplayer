// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Pau Aliagas <linuxnow@gmail.com>
/**
 * Tests for the minimal JSONPath evaluator.
 * Covers the subset ADA emits on xp:jsonpath=.
 */

import { describe, it, expect } from 'vitest';
import { parseJsonPath, evalJsonPath } from './jsonpath.js';

describe('parseJsonPath', () => {
  it('parses root-only path', () => {
    expect(parseJsonPath('$')).toEqual([]);
  });

  it('parses simple dot notation', () => {
    expect(parseJsonPath('$.a.b.c')).toEqual([
      { kind: 'key', value: 'a' },
      { kind: 'key', value: 'b' },
      { kind: 'key', value: 'c' },
    ]);
  });

  it('parses bracket index', () => {
    expect(parseJsonPath('$.items[3]')).toEqual([
      { kind: 'key', value: 'items' },
      { kind: 'index', value: 3 },
    ]);
  });

  it('parses mixed dot + brackets', () => {
    expect(parseJsonPath('$.data.rooms[0].name')).toEqual([
      { kind: 'key', value: 'data' },
      { kind: 'key', value: 'rooms' },
      { kind: 'index', value: 0 },
      { kind: 'key', value: 'name' },
    ]);
  });

  it('parses quoted bracket keys (single quotes)', () => {
    expect(parseJsonPath("$['a.b'].c")).toEqual([
      { kind: 'key', value: 'a.b' },
      { kind: 'key', value: 'c' },
    ]);
  });

  it('parses quoted bracket keys (double quotes)', () => {
    expect(parseJsonPath('$["with space"]')).toEqual([
      { kind: 'key', value: 'with space' },
    ]);
  });

  it('parses wildcard', () => {
    expect(parseJsonPath('$.items[*].price')).toEqual([
      { kind: 'key', value: 'items' },
      { kind: 'wildcard' },
      { kind: 'key', value: 'price' },
    ]);
  });

  it('tolerates path without leading $', () => {
    expect(parseJsonPath('a.b')).toEqual([
      { kind: 'key', value: 'a' },
      { kind: 'key', value: 'b' },
    ]);
  });

  it('tolerates negative index', () => {
    expect(parseJsonPath('$.items[-1]')).toEqual([
      { kind: 'key', value: 'items' },
      { kind: 'index', value: -1 },
    ]);
  });

  it('throws on unterminated bracket', () => {
    expect(() => parseJsonPath('$.a[0')).toThrow(/unterminated/);
  });

  it('throws on empty path', () => {
    expect(() => parseJsonPath('')).toThrow();
    expect(() => parseJsonPath(null)).toThrow();
  });
});

describe('evalJsonPath', () => {
  const sample = {
    data: {
      rooms: [
        { name: 'Alpha', status: 'free' },
        { name: 'Beta', status: 'busy' },
      ],
    },
    prices: { 'VIP Room': 250 },
    tags: ['a', 'b', 'c'],
  };

  it('returns root for $', () => {
    expect(evalJsonPath(sample, '$')).toBe(sample);
  });

  it('extracts nested key', () => {
    expect(evalJsonPath(sample, '$.data.rooms[0].name')).toBe('Alpha');
  });

  it('returns undefined for missing key', () => {
    expect(evalJsonPath(sample, '$.data.rooms[0].missing')).toBeUndefined();
  });

  it('returns undefined for out-of-range index', () => {
    expect(evalJsonPath(sample, '$.data.rooms[99].name')).toBeUndefined();
  });

  it('supports negative index', () => {
    expect(evalJsonPath(sample, '$.tags[-1]')).toBe('c');
  });

  it('supports quoted bracket keys', () => {
    expect(evalJsonPath(sample, "$.prices['VIP Room']")).toBe(250);
  });

  it('wildcard yields array of values', () => {
    expect(evalJsonPath(sample, '$.data.rooms[*].name')).toEqual(['Alpha', 'Beta']);
  });

  it('wildcard on empty array yields empty array', () => {
    expect(evalJsonPath({ items: [] }, '$.items[*]')).toEqual([]);
  });

  it('returns undefined for null/undefined data', () => {
    expect(evalJsonPath(null, '$.a')).toBeUndefined();
    expect(evalJsonPath(undefined, '$.a')).toBeUndefined();
  });

  it('returns undefined for primitive traversal', () => {
    expect(evalJsonPath('hello', '$.a')).toBeUndefined();
    expect(evalJsonPath(42, '$.a')).toBeUndefined();
  });

  it('accepts pre-parsed segments', () => {
    const segs = parseJsonPath('$.data.rooms[1].status');
    expect(evalJsonPath(sample, segs)).toBe('busy');
  });

  it('handles wildcard on object (yields values)', () => {
    const values = evalJsonPath({ a: 1, b: 2, c: 3 }, '$[*]');
    // Order of Object.keys is insertion order in practice
    expect(values.sort()).toEqual([1, 2, 3]);
  });
});
