// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Pau Aliagas <linuxnow@gmail.com>
/**
 * Minimal JSONPath evaluator for the subset ADA emits on xp:jsonpath=
 *
 * Supported syntax:
 *   $                      root
 *   $.a.b.c                dot notation (object keys)
 *   $.a[0]                 bracket index (array access)
 *   $.a[0].b               mixed
 *   $['a key'].b           bracket key (for keys with dots/spaces)
 *   $["a key"].b           bracket key (double-quoted)
 *   $.items[*].price       wildcard — returns array of values
 *
 * NOT supported (by design — ADA/xp:datasource never emits these):
 *   - filter expressions  $.items[?(@.price > 10)]
 *   - recursive descent   $..name
 *   - slices              $.items[1:3]
 *   - script expressions  $.items[(@.length-1)]
 *
 * Behaviour on mismatch: returns `undefined`. Callers should fall back to the
 * widget's xp:fallback= literal.
 */

/**
 * Parse a JSONPath into a flat list of segments.
 * Each segment is either { kind: 'key', value: string }, { kind: 'index', value: number },
 * or { kind: 'wildcard' }.
 * @param {string} path
 * @returns {Array<{kind: string, value?: string|number}>}
 */
export function parseJsonPath(path) {
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error('jsonpath: path must be a non-empty string');
  }

  // Accept "$.foo", "$foo", "$[0]", "foo.bar" (no leading $) — tolerate what ADA emits.
  let p = path.trim();
  if (p.startsWith('$')) p = p.slice(1);
  // Leading dot is optional / noop
  if (p.startsWith('.')) p = p.slice(1);

  const segments = [];
  let i = 0;
  const len = p.length;
  let buf = '';

  const flushKey = () => {
    if (buf.length > 0) {
      segments.push({ kind: 'key', value: buf });
      buf = '';
    }
  };

  while (i < len) {
    const c = p[i];

    if (c === '.') {
      flushKey();
      i++;
      continue;
    }

    if (c === '[') {
      flushKey();
      // Find matching ']'
      const end = p.indexOf(']', i);
      if (end === -1) {
        throw new Error(`jsonpath: unterminated '[' at position ${i}`);
      }
      const inner = p.slice(i + 1, end).trim();
      if (inner === '*') {
        segments.push({ kind: 'wildcard' });
      } else if (
        (inner.startsWith("'") && inner.endsWith("'")) ||
        (inner.startsWith('"') && inner.endsWith('"'))
      ) {
        segments.push({ kind: 'key', value: inner.slice(1, -1) });
      } else if (/^-?\d+$/.test(inner)) {
        segments.push({ kind: 'index', value: parseInt(inner, 10) });
      } else {
        // Unquoted key in brackets (some producers omit quotes)
        segments.push({ kind: 'key', value: inner });
      }
      i = end + 1;
      continue;
    }

    buf += c;
    i++;
  }
  flushKey();

  return segments;
}

/**
 * Evaluate a parsed or string JSONPath against a JSON value.
 * Returns `undefined` when any segment fails to resolve.
 * A wildcard segment always yields an array (even if empty).
 *
 * @param {any} data
 * @param {string|Array} pathOrSegments
 * @returns {any}
 */
export function evalJsonPath(data, pathOrSegments) {
  if (data === undefined || data === null) return undefined;

  const segments = typeof pathOrSegments === 'string'
    ? parseJsonPath(pathOrSegments)
    : pathOrSegments;

  let current = [data];
  let isWildcarded = false;

  for (const seg of segments) {
    const next = [];
    for (const node of current) {
      if (node === undefined || node === null) continue;

      if (seg.kind === 'wildcard') {
        if (Array.isArray(node)) {
          for (const item of node) next.push(item);
        } else if (typeof node === 'object') {
          for (const k of Object.keys(node)) next.push(node[k]);
        }
        // else: wildcard on primitive → drop
      } else if (seg.kind === 'index') {
        if (Array.isArray(node)) {
          const idx = seg.value < 0 ? node.length + seg.value : seg.value;
          if (idx >= 0 && idx < node.length) next.push(node[idx]);
        }
      } else if (seg.kind === 'key') {
        if (typeof node === 'object' && !Array.isArray(node) && seg.value in node) {
          next.push(node[seg.value]);
        }
      }
    }

    if (seg.kind === 'wildcard') isWildcarded = true;
    current = next;
    if (current.length === 0) break;
  }

  if (isWildcarded) return current;
  if (current.length === 0) return undefined;
  return current[0];
}
