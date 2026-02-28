export const VERSION: string;

export class RestClient {
  constructor(config: any);
  config: any;
  schemaVersion: number;

  registerDisplay(): Promise<any>;
  getSchedule(): Promise<any>;
  getRequiredFiles(): Promise<any>;
  getFile(fileId: number, fileType: string): Promise<any>;
  notifyStatus(status: any): Promise<any>;
  submitStats(statsXml: string, hardwareKey?: string): Promise<boolean>;
  submitLog(logsXml: string, hardwareKey?: string): Promise<boolean>;
  reportFaults(faultsJson: string): Promise<boolean>;
  mediaInventory(inventoryXml: string): Promise<boolean>;
  submitGeoLocation?(data: any): Promise<void>;
}

export class XmdsClient {
  constructor(config: any);
  config: any;

  registerDisplay(): Promise<any>;
  getSchedule(): Promise<any>;
  getRequiredFiles(): Promise<any>;
  getFile(fileId: number, fileType: string): Promise<any>;
  notifyStatus(status: any): Promise<any>;
  submitStats(statsXml: string, hardwareKey?: string): Promise<boolean>;
  submitLog(logsXml: string, hardwareKey?: string): Promise<boolean>;
  reportFaults(faultsJson: string): Promise<boolean>;
  mediaInventory(inventoryXml: string): Promise<boolean>;
}

export function parseScheduleResponse(data: any): any;
