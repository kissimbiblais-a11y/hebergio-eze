export type ProjectKind = 'site' | 'webapp' | 'pwa';
export type ProjectStatus = 'draft' | 'live' | 'paused';
export type UserPlan = 'free' | 'pro' | 'enterprise';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  plan: UserPlan;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface HostingProject {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  kind: ProjectKind;
  description: string;
  status: ProjectStatus;
  entryFile: string;
  fileCount: number;
  sizeBytes: number;
  deployCount: number;
  livePath: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DeploymentRecord {
  id: string;
  projectId: string;
  ownerId: string;
  version: number;
  note: string;
  fileCount: number;
  sizeBytes: number;
  status: 'live' | 'paused' | 'failed';
  createdAt?: unknown;
}

export interface DeployFile {
  path: string;
  content: string;
  encoding?: 'utf8' | 'base64';
}

export interface PublicSiteSummary {
  slug: string;
  name: string;
  kind: ProjectKind;
  description: string;
  fileCount: number;
  sizeBytes: number;
  hits: number;
  livePath: string;
  updatedAt: string;
}

export interface PaymentProviderStatus {
  configured: boolean;
  environment?: 'sandbox' | 'live';
  missingVars: string[];
  supportedOperators: string[];
}

export interface PaymentConfigStatus {
  currency: string;
  providers: {
    fedapay: PaymentProviderStatus;
    kkiapay: PaymentProviderStatus;
  };
}

export interface PaymentRequestRecord {
  id: string;
  ownerId: string;
  planId: 'pro' | 'enterprise';
  amountFcfa: number;
  provider: 'fedapay' | 'kkiapay';
  operator: 'mtn_benin' | 'moov_benin' | 'mtn_ci' | 'moov_ci' | 'mtn_tg' | 'moov_tg';
  phone: string;
  status: 'configuration_required' | 'pending_provider';
  createdAt?: unknown;
}

export type ServiceOrderId =
  | 'pro_monthly'
  | 'enterprise_monthly'
  | 'setup_domain'
  | 'pwa_seo_pack';

export type ServiceOrderStatus = 'pending_payment' | 'paid' | 'completed' | 'cancelled';

export interface ServiceOrderRecord {
  id: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  serviceId: ServiceOrderId;
  serviceLabel: string;
  amountFcfa: number;
  projectSlug: string;
  contactPhone: string;
  notes: string;
  referenceCode: string;
  status: ServiceOrderStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}
