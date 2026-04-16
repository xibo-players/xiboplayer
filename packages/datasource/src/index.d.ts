// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Pau Aliagas <linuxnow@gmail.com>
export const VERSION: string;

export interface DatasourceMeta {
  stale: boolean;
  error: Error | null;
  fetchedAt: number;
  fromFallback?: boolean;
}

export type DatasourceCallback = (value: any, meta: DatasourceMeta) => void;

export interface DatasourceSubscribeOptions {
  refreshMs?: number;
  jsonpath?: string;
  fallback?: any;
  persist?: boolean;
}

export interface DatasourceClientOptions {
  fetchImpl?: (url: string, init?: any) => Promise<Response>;
  storage?: Storage | null;
  storageKey?: string;
  defaultRefreshMs?: number;
  fetchTimeoutMs?: number;
}

export interface DatasourcePeek {
  value: any;
  fetchedAt: number;
  stale: boolean;
  error: Error | null;
}

export class DatasourceClient {
  constructor(options?: DatasourceClientOptions);
  subscribe(url: string, callback: DatasourceCallback, options?: DatasourceSubscribeOptions): () => void;
  refresh(url?: string): Promise<void>;
  peek(url: string): DatasourcePeek | undefined;
  stop(): void;
  resume(): void;
  stats(): { urls: number; subscriptions: number; stopped: boolean };
}

export type JsonPathSegment =
  | { kind: 'key'; value: string }
  | { kind: 'index'; value: number }
  | { kind: 'wildcard' };

export function parseJsonPath(path: string): JsonPathSegment[];
export function evalJsonPath(data: any, pathOrSegments: string | JsonPathSegment[]): any;

export interface WidgetPreambleOptions {
  url: string;
  jsonpath?: string;
  refreshMs?: number;
  fallback?: string | number | boolean | null;
  selector?: string;
  id?: string;
}
export function buildWidgetPreamble(options: WidgetPreambleOptions): string;

export interface HostBridge {
  destroy(): void;
  stats(): { subscribers: number };
}
export function attachHostBridge(client: DatasourceClient, targetWindow?: Window): HostBridge;

export const DATASOURCE_MSG_TYPE: string;
