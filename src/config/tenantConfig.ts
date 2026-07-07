import { readEnv } from './env';

export type TenantKey = 'EDSON' | 'LLFIX';

export interface TenantConfig {
  tenant: TenantKey;
  hostname: string;
  domain: string;
  storeCode: string;
  label: string;
  storeName: string;
  token: string;
  backendUrl: string;
  tokenEnvVar: string;
  mapped: true;
}

export interface UnmappedTenantConfig {
  tenant: null;
  hostname: string;
  domain: '';
  storeCode: '';
  label: '';
  storeName: '';
  token: '';
  backendUrl: '';
  tokenEnvVar: '';
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
  tokenEnvVar: 'VITE_APP_INTEGRATION_TOKEN_EDSON' | 'VITE_APP_INTEGRATION_TOKEN_LLFIX';
}

const TENANTS: TenantDefinition[] = [
  {
    tenant: 'EDSON',
    domain: 'edsondosparafusos.app.br',
    storeCode: '000001',
    label: 'Loja 01',
    storeName: 'EDSON DOS PARAFUSOS',
    backendUrl: 'https://apiforce.edsondosparafusos.app.br',
    tokenEnvVar: 'VITE_APP_INTEGRATION_TOKEN_EDSON',
  },
  {
    tenant: 'LLFIX',
    domain: 'llfix.app.br',
    storeCode: '000003',
    label: 'Loja 03',
    storeName: 'LL FIX DISTRIBUIDORA - EI',
    backendUrl: 'https://apiforce.llfix.app.br',
    tokenEnvVar: 'VITE_APP_INTEGRATION_TOKEN_LLFIX',
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
  // Allow mapping a small set of local development hosts to the EDSON tenant
  // only when explicitly enabled via `VITE_ALLOW_LOCAL_EDSON=true` in
  // local env (e.g. .env.local). This avoids loosening domain checks in
  // production and requires an explicit opt-in for local testing.
  const localAllowedHosts = ['localhost', '127.0.0.1', '10.0.0.78', '100.93.108.124'];
  const allowLocalEdson = readEnv('VITE_ALLOW_LOCAL_EDSON') === 'true';

  // Browser-side fallback: the dev helper writes `public/__local_env.js` which
  // sets `window.__ALLOW_LOCAL_EDSON` and `window.__EDSON_TOKEN`. Use these
  // only as a fallback when server-side env wasn't available.
  const browserAllow = typeof window !== 'undefined' ? (window as any).__ALLOW_LOCAL_EDSON : undefined;
  const browserToken = typeof window !== 'undefined' ? (window as any).__EDSON_TOKEN : undefined;
  const allowFromBrowser = browserAllow === true || browserAllow === 'true';
  const effectiveAllow = allowLocalEdson || allowFromBrowser;

  if (effectiveAllow && host && localAllowedHosts.includes(host)) {
    const edsonTenant = TENANTS.find((t) => t.tenant === 'EDSON');
    if (edsonTenant) {
      const edsonToken = readEnv('VITE_APP_INTEGRATION_TOKEN_EDSON') || browserToken || '';
      return {
        tenant: edsonTenant.tenant,
        hostname: host,
        domain: edsonTenant.domain,
        storeCode: edsonTenant.storeCode,
        label: edsonTenant.label,
        storeName: edsonTenant.storeName,
        tokenEnvVar: edsonTenant.tokenEnvVar,
        token: edsonToken,
        backendUrl: edsonTenant.backendUrl,
        mapped: true,
      };
    }
  }

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
      token: '',
      backendUrl: '',
      tokenEnvVar: '',
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
    tokenEnvVar: matchedTenant.tokenEnvVar,
    token: readEnv(matchedTenant.tokenEnvVar),
    backendUrl: matchedTenant.backendUrl,
    mapped: true,
  };
};

export const getTenantDiagnostics = (hostname?: string): {
  tenant: TenantResolution;
  backendConfigured: boolean;
  tokenConfigured: boolean;
  domainMapped: boolean;
  error?: string;
} => {
  const tenant = getTenantConfig(hostname);
  if (!tenant.mapped) {
    return {
      tenant,
      backendConfigured: false,
      tokenConfigured: false,
      domainMapped: false,
      error: tenant.error,
    };
  }

  if (!tenant.token) {
    return {
      tenant,
      backendConfigured: Boolean(tenant.backendUrl),
      tokenConfigured: false,
      domainMapped: true,
      error: `Token de integração não configurado para ${tenant.label} (${tenant.tokenEnvVar}).`,
    };
  }

  if (!tenant.backendUrl) {
    return {
      tenant,
      backendConfigured: false,
      tokenConfigured: true,
      domainMapped: true,
      error: `Backend não configurado para ${tenant.label}.`,
    };
  }

  return {
    tenant,
    backendConfigured: true,
    tokenConfigured: true,
    domainMapped: true,
  };
};


export interface ServerDiagnostics {
  domainMapped: boolean;
  backendConfigured: boolean;
  tokenConfigured: boolean;
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
          backendConfigured: data.mapped && !!data.backendUrl,
          tokenConfigured: data.tokenConfigured,
          tenant: data.tenant,
          storeCode: data.storeCode,
          storeName: data.storeName,
          backendUrl: data.backendUrl,
        };
        if (!data.mapped) {
          serverDiagCache.error = data.error || 'Domínio não configurado.';
        } else if (!data.tokenConfigured) {
          serverDiagCache.error = 'Token de integração não configurado no servidor para este domínio.';
        }
        return serverDiagCache;
      }
    } catch {
      // fallback below
    }
    
    // Fallback to local diagnostics
    const local = getTenantDiagnostics();
    serverDiagCache = {
      domainMapped: local.domainMapped,
      backendConfigured: local.backendConfigured,
      tokenConfigured: local.tokenConfigured,
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

// Development debug helpers: expose functions on `window` so we can inspect
// runtime env values and the resolved tenant from the browser console.
// Note: no debug helpers are left in the final code.
