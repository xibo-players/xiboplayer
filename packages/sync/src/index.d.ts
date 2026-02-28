export const VERSION: string;

export interface SyncConfig {
  syncGroup: string;
  syncPublisherPort: number;
  syncSwitchDelay: number;
  syncVideoPauseDelay: number;
  isLead: boolean;
}

export class SyncManager {
  constructor(config: SyncConfig, displayId: string);
  config: SyncConfig;
  isLead: boolean;

  start(): void;
  stop(): void;
  requestLayoutChange(layoutId: number, showDelay?: number): void;
  notifyLayoutReady(layoutId: number): void;
  onLayoutShow(callback: (layoutId: number) => void): void;
  onLayoutChange(callback: (layoutId: number) => void): void;
}
