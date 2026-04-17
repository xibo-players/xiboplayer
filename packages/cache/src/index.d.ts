// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Pau Aliagas <linuxnow@gmail.com>
export const VERSION: string;

// ─── ContentStore protocol ───────────────────────────────────────────
//
// Shared API that both storage implementations satisfy:
//   - `@xiboplayer/proxy/content-store` — filesystem-backed, used by
//     Electron + Chromium kiosk proxies
//   - `@xiboplayer/sw/content-store-browser` — CacheStorage+IndexedDB,
//     used by the PWA when it runs directly on the CMS
//
// Defined here (lowest-dep package) so both implementations can mark
// themselves as `@implements {import('@xiboplayer/cache').ContentStore}`
// without introducing a circular dependency.
//
// The two backends diverge on one thing: the read primitive. Node
// returns fs.ReadStream (for zero-copy pipe into Express); browser
// returns Response (for event.respondWith). The backend-specific
// methods live on `FilesystemContentStore` and `BrowserContentStore`
// extension interfaces rather than polluting the shared contract.
//
// See #374 for a potential future refactor to a single class with
// pluggable backends — deferred pending perf benchmark.

/** Byte range for chunked reads. Both bounds inclusive; omit for tail. */
export interface ChunkRange {
  start?: number;
  end?: number;
}

/** Metadata stored alongside every cached item. */
export interface ContentStoreMetadata {
  key: string;
  size: number;
  contentType: string;
  md5: string | null;
  createdAt: number;
  updatedAt?: number;
  completedAt?: number;
  complete?: boolean;
  /** Present for items stored as chunks. Cleared once assembled (Node) or kept (browser, per #373). */
  numChunks?: number;
  chunkSize?: number;
}

/** Result shape of `ContentStore.has(key)`. */
export interface ContentStoreHasResult {
  exists: boolean;
  chunked: boolean;
  metadata: ContentStoreMetadata | null;
}

/** Entry shape returned by `ContentStore.list()`. */
export interface ContentStoreListEntry {
  key: string;
  size: number;
  contentType: string;
  chunked: boolean;
  complete: boolean;
}

/**
 * The 13-method contract shared by all ContentStore implementations.
 *
 * Behavioural invariants (enforced by both impls, verified by their
 * respective unit tests):
 *
 *   - `isWriteLocked(key, chunkIndex?)` reflects in-flight putChunk ops
 *   - `has` / `hasChunk` / `missingChunks` report existence only —
 *     never touch the data
 *   - `put` stores + writes metadata atomically
 *   - `putChunk` is reentrant-safe via a per-chunk write lock
 *   - `assembleChunks` requires all numChunks to be present, returns
 *     false otherwise. In the Node backend it concatenates; in the
 *     browser backend it currently concatenates too (limit ~50 MB —
 *     see #373 for the streaming rewrite)
 *   - `delete` removes whole + chunks + metadata
 *   - `list` returns every metadata record
 */
export interface ContentStore {
  init(): Promise<void>;
  isWriteLocked(key: string, chunkIndex?: number): boolean;
  has(key: string): Promise<ContentStoreHasResult>;
  hasChunk(key: string, chunkIndex: number): Promise<boolean>;
  missingChunks(key: string): Promise<number[]>;
  getMetadata(key: string): Promise<ContentStoreMetadata | null>;
  put(
    key: string,
    buffer: ArrayBuffer | Uint8Array | Blob,
    metadata?: Partial<ContentStoreMetadata>,
  ): Promise<void>;
  putChunk(
    key: string,
    chunkIndex: number,
    buffer: ArrayBuffer | Uint8Array | Blob,
    metadata?: Partial<ContentStoreMetadata>,
  ): Promise<void>;
  markComplete(key: string): Promise<void>;
  assembleChunks(key: string): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  list(): Promise<ContentStoreListEntry[]>;
}

/** Node-specific extensions (fs streams, disk-usage query). */
export interface FilesystemContentStore extends ContentStore {
  getPath(key: string): string;
  getReadStream(key: string, range?: ChunkRange): NodeJS.ReadableStream;
  getChunkReadStream(
    key: string,
    chunkIndex: number,
    range?: ChunkRange,
  ): NodeJS.ReadableStream;
  unmarkComplete(key: string): Promise<void>;
  getSize(): Promise<number>;
}

/** Browser-specific extensions (Response-wrapped reads). */
export interface BrowserContentStore extends ContentStore {
  getResponse(key: string, range?: ChunkRange): Promise<Response | null>;
  getChunkResponse(
    key: string,
    chunkIndex: number,
    range?: ChunkRange,
  ): Promise<Response | null>;
}

// ─────────────────────────────────────────────────────────────────────


export class StoreClient {
  has(type: string, id: string | number): Promise<boolean>;
  get(type: string, id: string | number): Promise<Blob | null>;
  put(type: string, id: string | number, body: Blob | ArrayBuffer | string, contentType?: string): Promise<boolean>;
  remove(files: Array<{ type: string; id: string | number }>): Promise<{ deleted: number; total: number }>;
  list(): Promise<Array<{ id: string; type: string; size: number }>>;
}

export class DownloadManager {
  constructor(options?: { concurrency?: number; chunkSize?: number; chunksPerFile?: number; getAuthHeaders?: () => Promise<Record<string, string> | null> });
  enqueue(fileInfo: any): any;
  getTask(key: string): any;
  getProgress(): Record<string, any>;
  prioritizeLayoutFiles(mediaIds: string[]): void;
  createTaskBuilder(): LayoutTaskBuilder;
  enqueueOrderedTasks(tasks: any[]): void;
  removeCompleted(key: string): void;
  readonly running: number;
  readonly queued: number;
  clear(): void;
  queue: any;
}

export class FileDownload {
  state: string;
  wait(): Promise<Blob>;
}
export class LayoutTaskBuilder {
  constructor(queue: any);
  addFile(fileInfo: any): FileDownload;
  build(): Promise<any[]>;
}
export const BARRIER: symbol;
export class CacheManager {}
export class CacheAnalyzer {
  constructor(store: StoreClient);
}

export const cacheManager: CacheManager;

export function isUrlExpired(url: string): boolean;
export function cacheWidgetHtml(...args: any[]): any;
