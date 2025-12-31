const DEFAULT_STORE_CODE = '00001';
const EDSON_DOMAIN = 'edsondosparafusos.app.br';
const EDSON_STORE_CODE = '00001';
const EDSON_BACKEND_URL = 'https://apiforce.edsondosparafusos.app.br';
const LLFIX_DOMAIN = 'llfix.app.br';
const LLFIX_STORE_CODE = '00003';
const LLFIX_BACKEND_URL = 'https://apiforce.llfix.app.br';

const normalizeHost = (value?: string): string => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const noProto = raw.replace(/^https?:\/\//, '');
  return noProto.replace(/:\d+$/, '');
};

const matchesDomain = (host: string, domain: string): boolean => {
  if (!host) return false;
  return host === domain || host.endsWith(`.${domain}`);
};

export const resolveStoreCodeFromHost = (hostname?: string): string => {
  const host = normalizeHost(hostname);
  if (matchesDomain(host, LLFIX_DOMAIN)) return LLFIX_STORE_CODE;
  if (matchesDomain(host, EDSON_DOMAIN)) return EDSON_STORE_CODE;
  return DEFAULT_STORE_CODE;
};

export const isLlfixHost = (hostname?: string): boolean => {
  const host = normalizeHost(hostname);
  return matchesDomain(host, LLFIX_DOMAIN);
};

export const isEdsonHost = (hostname?: string): boolean => {
  const host = normalizeHost(hostname);
  return matchesDomain(host, EDSON_DOMAIN);
};

export const resolveBackendUrlFromHost = (hostname?: string): string => {
  const host = normalizeHost(hostname);
  if (matchesDomain(host, LLFIX_DOMAIN)) return LLFIX_BACKEND_URL;
  if (matchesDomain(host, EDSON_DOMAIN)) return EDSON_BACKEND_URL;
  return '';
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
  const host = window.location.hostname;
  return isLlfixHost(host) || isEdsonHost(host);
};

export const getBackendUrlForCurrentHost = (): string => {
  if (typeof window === 'undefined') return '';
  return resolveBackendUrlFromHost(window.location.hostname);
};

export const isBackendUrlLockedForCurrent = (): boolean => {
  return getBackendUrlForCurrentHost() !== '';
};

export const normalizeStoreCode = (value?: string | number | null): string => {
  const raw = String(value ?? '').replace(/\D/g, '');
  const trimmed = raw.replace(/^0+/, '');
  return trimmed === '' ? '0' : trimmed;
};

export const getStoreCodeForCurrentHost = (): string => {
  if (typeof window === 'undefined') return DEFAULT_STORE_CODE;
  return resolveStoreCodeFromHost(window.location.hostname);
};

export const getStoreCodeForApi = (): string => {
  return getStoreCodeForCurrentHost().padStart(6, '0');
};
