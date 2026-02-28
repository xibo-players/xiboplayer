export const VERSION: string;

export class StoreClient {
  has(type: string, id: string | number): Promise<boolean>;
  get(type: string, id: string | number): Promise<Blob | null>;
  put(type: string, id: string | number, body: Blob | ArrayBuffer | string, contentType?: string): Promise<boolean>;
  remove(files: Array<{ type: string; id: string | number }>): Promise<{ deleted: number; total: number }>;
  list(): Promise<Array<{ id: string; type: string; size: number }>>;
}

export class DownloadClient {
  controller: ServiceWorker | null;
  fetchReady: boolean;
  init(): Promise<void>;
  download(payload: object | any[]): Promise<void>;
  prioritize(fileType: string, fileId: string): Promise<void>;
  prioritizeLayout(mediaIds: string[]): Promise<void>;
  getProgress(): Promise<Record<string, any>>;
  cleanup(): void;
}

export class DownloadManager {
  constructor(options?: { concurrency?: number; chunkSize?: number; maxChunksPerFile?: number });
  enqueue(fileInfo: any): any;
  prioritizeLayoutFiles(mediaIds: string[]): void;
}

export class FileDownload {}
export class LayoutTaskBuilder {}
export class CacheManager {}
export class CacheAnalyzer {
  constructor(store: StoreClient);
}

export const cacheManager: CacheManager;

export function isUrlExpired(url: string): boolean;
export function toProxyUrl(url: string): string;
export function setCmsOrigin(origin: string): void;
export function cacheWidgetHtml(...args: any[]): any;
