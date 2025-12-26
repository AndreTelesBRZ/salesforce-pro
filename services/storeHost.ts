const DEFAULT_STORE_CODE = '00001';
const EDSON_HOST = 'vendas.edsondosparafusos.app.br';
const EDSON_STORE_CODE = '00001';
const LLFIX_HOST = 'vendas.llfix.app.br';
const LLFIX_STORE_CODE = '00003';

export const resolveStoreCodeFromHost = (hostname?: string): string => {
  const host = String(hostname || '').trim().toLowerCase();
  if (host === LLFIX_HOST) return LLFIX_STORE_CODE;
  if (host === EDSON_HOST) return EDSON_STORE_CODE;
  return DEFAULT_STORE_CODE;
};

export const isLlfixHost = (hostname?: string): boolean => {
  const host = String(hostname || '').trim().toLowerCase();
  return host === LLFIX_HOST;
};

export const isEdsonHost = (hostname?: string): boolean => {
  const host = String(hostname || '').trim().toLowerCase();
  return host === EDSON_HOST;
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

export const getStoreCodeForCurrentHost = (): string => {
  if (typeof window === 'undefined') return DEFAULT_STORE_CODE;
  return resolveStoreCodeFromHost(window.location.hostname);
};
