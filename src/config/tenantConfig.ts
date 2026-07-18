import { readEnv } from './env';

export type TenantKey = 'EDSON' | 'LLFIX';

export interface TenantConfig {
  tenant: TenantKey;
  hostname: string;
  domain: string;
  storeCode: string;
  label: string;
  storeName: string;
  backendUrl: string;
  mapped: true;
}

export interface UnmappedTenantConfig {
  tenant: null;
  hostname: string;
  domain: '';
  storeCode: '';
  label: '';
  storeName: '';
  backendUrl: '';
  mapped: false;
  error: string;
}

export type TenantResolution = TenantConfig | UnmappedTenantConfig;

interface TenantDefinition {
  tenant: TenantKey;
  domain: string;
  storeCode: string;
  label: string;
  storeName: string;
  backendUrl: string;
}

const TENANTS: TenantDefinition[] = [
  {
    tenant: 'EDSON',
    domain: 'edsondosparafusos.app.br',
    storeCode: '000001',
    label: 'Loja 01',
    storeName: 'EDSON DOS PARAFUSOS',
    backendUrl: 'https://apiforce.edsondosparafusos.app.br',
  },
  {
    tenant: 'LLFIX',
    domain: 'llfix.app.br',
    storeCode: '000003',
    label: 'Loja 03',
    storeName: 'LL FIX DISTRIBUIDORA - EI',
    backendUrl: 'https://apiforce.llfix.app.br',
  },
];

export const normalizeHostname = (value?: string): string => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const withoutProtocol = raw.replace(/^https?:\/\//, '');
  return withoutProtocol.replace(/:\d+$/, '');
};

export const isPrivateIpv4Host = (host: string): boolean => {
  return /^(10\.\d+\.\d+\.\d+|127\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(host);
};

export const matchesTenantDomain = (host: string, domain: string): boolean => {
  if (!host) return false;
  return host === domain || host.endsWith(`.${domain}`);
};

export const isLocalDevHost = (hostname?: string): boolean => {
  const host = normalizeHostname(hostname);
  if (!host) return false;
  return host === 'localhost' || host === '0.0.0.0' || host.endsWith('.local') || isPrivateIpv4Host(host);
};

export const getSharedBackendUrl = (): string => '';

export const getTenantConfig = (hostname?: string): TenantResolution => {
  const host = normalizeHostname(
    hostname || (typeof window !== 'undefined' ? window.location.hostname : '')
  );

  const matchedTenant = TENANTS.find((tenant) => matchesTenantDomain(host, tenant.domain));

  if (!matchedTenant) {
    const hostLabel = host || '(host desconhecido)';
    return {
      tenant: null,
      hostname: host,
      domain: '',
      storeCode: '',
      label: '',
      storeName: '',
      backendUrl: '',
      mapped: false,
      error: `Domínio não configurado: ${hostLabel}.`,
    };
  }

  return {
    tenant: matchedTenant.tenant,
    hostname: host,
    domain: matchedTenant.domain,
    storeCode: matchedTenant.storeCode,
    label: matchedTenant.label,
    storeName: matchedTenant.storeName,
    backendUrl: matchedTenant.backendUrl,
    mapped: true,
  };
};

export const getTenantDiagnostics = (hostname?: string): {
  tenant: TenantResolution;
  backendConfigured: boolean;
  domainMapped: boolean;
  error?: string;
} => {
  const tenant = getTenantConfig(hostname);
  if (!tenant.mapped) {
    return {
      tenant,
      backendConfigured: false,
      domainMapped: false,
      error: tenant.error,
    };
  }

  return {
    tenant,
    backendConfigured: true,
    domainMapped: true,
  };
};


export interface ServerDiagnostics {
  domainMapped: boolean;
  backendConfigured: boolean;
  tenant: string | null;
  storeCode: string;
  storeName: string;
  backendUrl: string;
  error?: string;
}

let serverDiagCache: ServerDiagnostics | null = null;
let serverDiagPromise: Promise<ServerDiagnostics> | null = null;

export async function fetchServerDiagnostics(): Promise<ServerDiagnostics> {
  if (serverDiagPromise) return serverDiagPromise;
  
  serverDiagPromise = (async () => {
    try {
      const response = await fetch('/api/config/resolve');
      if (response.ok) {
        const data = await response.json();
        serverDiagCache = {
          domainMapped: data.mapped,
          backendConfigured: data.mapped,
          tenant: data.tenant,
          storeCode: data.storeCode,
          storeName: data.storeName,
          backendUrl: data.backendUrl,
        };
        if (!data.mapped) {
          serverDiagCache.error = data.error || 'Domínio não configurado.';
        }
        return serverDiagCache;
      }
    } catch {
    }
    
    const local = getTenantDiagnostics();
    serverDiagCache = {
      domainMapped: local.domainMapped,
      backendConfigured: local.backendConfigured,
      tenant: local.tenant.mapped ? local.tenant.tenant : null,
      storeCode: local.tenant.mapped ? local.tenant.storeCode : '',
      storeName: local.tenant.mapped ? local.tenant.storeName : '',
      backendUrl: local.tenant.mapped ? local.tenant.backendUrl : '',
      error: local.error || undefined,
    };
    return serverDiagCache;
  })();
  
  return serverDiagPromise;
}

export function getCachedServerDiagnostics(): ServerDiagnostics | null {
  return serverDiagCache;
}

export function clearServerDiagCache(): void {
  serverDiagCache = null;
  serverDiagPromise = null;
}
