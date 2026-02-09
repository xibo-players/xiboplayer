/**
 * Type declarations for core JavaScript modules
 * These modules are written in JavaScript, so we declare their types here
 */

declare module '@core/cache.js' {
  export interface CacheManager {
    init(): Promise<void>;
    getCachedFile(type: string, id: number | string): Promise<Blob | null>;
    downloadFile(file: any): Promise<void>;
    cache: Cache;
  }

  export const cacheManager: CacheManager;
}

declare module '@core/xmds.js' {
  export class XmdsClient {
    constructor(config: any);
    registerDisplay(): Promise<any>;
    requiredFiles(): Promise<any[]>;
    schedule(): Promise<any>;
    notifyStatus(status: any): Promise<void>;
    submitStats(stats: any): Promise<void>;
  }
}

declare module '@core/schedule.js' {
  export interface ScheduleManager {
    setSchedule(schedule: any): void;
    getCurrentLayouts(): string[];  // Returns ["1.xlf", "2.xlf", ...]
  }

  export const scheduleManager: ScheduleManager;
}

declare module '@core/config.js' {
  export interface PlayerConfig {
    cmsAddress: string;
    cmsKey: string;
    hardwareKey: string;
    displayName: string;
    serverMode: string;
    [key: string]: any;
  }

  export const config: PlayerConfig;
}
