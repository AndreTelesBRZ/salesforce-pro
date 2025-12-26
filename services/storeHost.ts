const DEFAULT_STORE_CODE = '000001';
const LLFIX_HOST = 'vendas.llfix.app.br';
const LLFIX_STORE_CODE = '000003';

export const resolveStoreCodeFromHost = (hostname?: string): string => {
  const host = String(hostname || '').trim().toLowerCase();
  if (host === LLFIX_HOST) return LLFIX_STORE_CODE;
  if (host === 'vendas.edsondosparafusos.app.br') return '000001';
  return DEFAULT_STORE_CODE;
};

export const isLlfixHost = (hostname?: string): boolean => {
  const host = String(hostname || '').trim().toLowerCase();
  return host === LLFIX_HOST;
};

export const isLlfixHostForCurrent = (): boolean => {
  if (typeof window === 'undefined') return false;
  return isLlfixHost(window.location.hostname);
};

export const getStoreCodeForCurrentHost = (): string => {
  if (typeof window === 'undefined') return DEFAULT_STORE_CODE;
  return resolveStoreCodeFromHost(window.location.hostname);
};
