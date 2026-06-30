import { getTenantConfig, getTenantDiagnostics, isLocalDevHost, matchesTenantDomain, normalizeHostname } from '../src/config/tenantConfig';

const EDSON_DOMAIN = 'edsondosparafusos.app.br';
const LLFIX_DOMAIN = 'llfix.app.br';

export const ALLOWED_REMOTE_BACKEND_URLS = [
  'https://apiforce.edsondosparafusos.app.br',
  'https://apiforce.llfix.app.br',
];

export const resolveStoreCodeFromHost = (hostname?: string): string => {
  const tenant = getTenantConfig(hostname);
  return tenant.mapped ? tenant.storeCode : '';
};

export const isLlfixHost = (hostname?: string): boolean => {
  return matchesTenantDomain(normalizeHostname(hostname), LLFIX_DOMAIN);
};

export const isEdsonHost = (hostname?: string): boolean => {
  return matchesTenantDomain(normalizeHostname(hostname), EDSON_DOMAIN);
};

export const resolveBackendUrlFromHost = (hostname?: string): string => {
  const tenant = getTenantConfig(hostname);
  return tenant.mapped ? tenant.backendUrl : '';
};

export const isAllowedRemoteBackendUrl = (value?: string): boolean => {
  const normalized = String(value || '').trim().replace(/\/+$/, '').replace(/\/api\/?$/i, '');
  return ALLOWED_REMOTE_BACKEND_URLS.includes(normalized);
};

export const resolveIntegrationTokenFromHost = (hostname?: string): string => {
  const tenant = getTenantConfig(hostname);
  return tenant.mapped ? tenant.token : '';
};

export const isLlfixHostForCurrent = (): boolean => {
  if (typeof window === 'undefined') return false;
  return isLlfixHost(window.location.hostname);
};

export const isEdsonHostForCurrent = (): boolean => {
  if (typeof window === 'undefined') return false;
  return isEdsonHost(window.location.hostname);
};

export const isStoreSelectionLockedForCurrent = (): boolean => {
  if (typeof window === 'undefined') return false;
  return getTenantConfig(window.location.hostname).mapped;
};

export const getBackendUrlForCurrentHost = (): string => {
  if (typeof window === 'undefined') return '';
  return resolveBackendUrlFromHost(window.location.hostname);
};

export const getIntegrationTokenForCurrentHost = (): string => {
  if (typeof window === 'undefined') return '';
  return resolveIntegrationTokenFromHost(window.location.hostname);
};

export const isBackendUrlLockedForCurrent = (): boolean => {
  if (typeof window === 'undefined') return false;
  const tenant = getTenantConfig(window.location.hostname);
  return tenant.mapped && Boolean(tenant.backendUrl);
};

export const isLocalDevHostForCurrent = (): boolean => {
  if (typeof window === 'undefined') return false;
  return isLocalDevHost(window.location.hostname);
};

export const normalizeStoreCode = (value?: string | number | null): string => {
  const raw = String(value ?? '').replace(/\D/g, '');
  const trimmed = raw.replace(/^0+/, '');
  return trimmed === '' ? '0' : trimmed;
};

export const getStoreCodeForCurrentHost = (): string => {
  if (typeof window === 'undefined') return '';
  return resolveStoreCodeFromHost(window.location.hostname);
};

export const getStoreCodeForApi = (): string => {
  const storeCode = getStoreCodeForCurrentHost();
  return storeCode ? storeCode.padStart(6, '0') : '';
};

export interface TenantConfig {
  tenant: 'EDSON' | 'LLFIX' | null;
  storeCode: string;
  apiBaseUrl: string;
  storeName: string;
}

export const resolveTenantFromHost = (hostname?: string): TenantConfig => {
  const tenant = getTenantConfig(hostname);
  return {
    tenant: tenant.mapped ? tenant.tenant : null,
    storeCode: tenant.mapped ? tenant.storeCode : '',
    apiBaseUrl: tenant.mapped ? tenant.backendUrl : '',
    storeName: tenant.mapped ? tenant.storeName : '',
  };
};

export const getTenantStatusForCurrentHost = () => {
  if (typeof window === 'undefined') {
    return getTenantDiagnostics('');
  }
  return getTenantDiagnostics(window.location.hostname);
};
