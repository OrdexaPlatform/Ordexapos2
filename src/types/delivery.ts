import { Client, License, ClientUser } from '../types';

export type DeliveryStepStatus = 'completed' | 'in_progress' | 'pending';

export interface CustomerPackageStatus {
  clientCreated: boolean;
  licenseConfigured: boolean;
  whiteLabelConfigured: boolean;
  ownerCreated: boolean;
  previewReady: boolean;
  previewReviewed: boolean;
  downloadReady: boolean;
  readyForDelivery: boolean;
}

export interface CustomerDeliverySummaryData {
  client: Client;
  license: License | null;
  owner: ClientUser | null;
  downloads: {
    portableZip: {
      name: string;
      size: string;
      url: string;
    };
    installerExe: {
      name: string;
      size: string;
      url: string;
    };
  };
  previewUrl: string;
  activationInstructions: string;
}
