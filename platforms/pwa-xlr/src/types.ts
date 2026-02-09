/**
 * Type definitions for PWA-XLR Player
 */

/**
 * XLR Input Layout Type (from XLR library)
 */
export interface InputLayoutType {
  layoutId: number;
  path?: string;
  shortPath?: string;
  index?: number;
  response: any; // XLF XML content (string or Element)
  duration?: number;
  getXlf?(): string; // Optional function to get XLF content
}

/**
 * Layout file metadata from schedule
 */
export interface LayoutMetadata {
  layoutId: number;
  file: string;
  duration?: number;
  fromDt?: number;
  toDt?: number;
}

/**
 * Cache manager interface (from @core/cache.js)
 */
export interface CacheManager {
  init(): Promise<void>;
  getCachedFile(type: string, id: number | string): Promise<Blob | null>;
  downloadFile(file: any): Promise<void>;
  cache: Cache;
}

/**
 * XMDS client interface (from @core/xmds.js)
 */
export interface XmdsClient {
  registerDisplay(): Promise<any>;
  requiredFiles(): Promise<any[]>;
  schedule(): Promise<any>;
  notifyStatus(status: any): Promise<void>;
  submitStats(stats: any): Promise<void>;
}

/**
 * Schedule manager interface (from @core/schedule.js)
 */
export interface ScheduleManager {
  setSchedule(schedule: any): void;
  getCurrentLayouts(): string[];
  getCurrentLayoutObjects(): any[];
}

/**
 * Config interface (from @core/config.js)
 */
export interface PlayerConfig {
  cmsAddress: string;
  cmsKey: string;
  hardwareKey: string;
  displayName: string;
  serverMode: string;
  [key: string]: any;
}

/**
 * XLR Options (simplified - actual type imported from XLR)
 * We'll use the OptionsType from @xibosignage/xibo-layout-renderer
 */
export interface XlrOptions {
  xlfUrl: string;
  getResourceUrl: string;
  layoutBackgroundDownloadUrl: string;
  layoutPreviewUrl: string;
  libraryDownloadUrl: string;
  loaderUrl: string;
  idCounter: number;
  inPreview: boolean;
  appHost?: string | null;
  platform: any; // ConsumerPlatform enum from XLR
  config?: {
    cmsUrl: string | null;
    schemaVersion: number;
    cmsKey: string | null;
    hardwareKey: string | null;
  };
  previewTranslations?: {
    [k: string]: any;
  };
  icons?: {
    splashScreen: string;
    logo: string;
  };
}

/**
 * XLR Instance Interface (simplified)
 */
export interface IXlr {
  init(): Promise<void>;
  on(event: string, callback: (...args: any[]) => void): void;
  updateScheduleLayouts(layouts: any[]): Promise<void>;
  emitter: {
    emit(event: string, ...args: any[]): void;
  };
  currentLayoutId?: number;
}
