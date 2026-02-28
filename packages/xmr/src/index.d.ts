export const VERSION: string;

export class XmrWrapper {
  constructor(config: any, player: any);
  config: any;
  player: any;
  connected: boolean;

  start(xmrUrl: string, cmsKey: string): Promise<boolean>;
  stop(): void;
}
