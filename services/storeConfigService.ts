import { getTenantConfig } from '../src/config/tenantConfig';

export interface ResolvedTenantConfig {
  tenant: string | null;
  hostname: string;
  domain: string;
  storeCode: string;
  storeName: string;
  backendUrl: string;
  tokenConfigured: boolean;
  mapped: boolean;
  error?: string;
}

let cachedResolved: ResolvedTenantConfig | null = null;

export async function resolveTenantConfig(): Promise<ResolvedTenantConfig> {
  try {
    const response = await fetch('/api/config/resolve');
    if (response.ok) {
      const data: ResolvedTenantConfig = await response.json();
      cachedResolved = data;
      return data;
    }
  } catch {
    // fallback to local tenantConfig
  }

  const tenant = getTenantConfig();
  if (tenant.mapped) {
    cachedResolved = {
      tenant: tenant.tenant,
      hostname: tenant.hostname,
      domain: tenant.domain,
      storeCode: tenant.storeCode,
      storeName: tenant.storeName,
      backendUrl: tenant.backendUrl,
      tokenConfigured: false,
      mapped: true,
    };
  } else {
    cachedResolved = {
      tenant: null,
      hostname: tenant.hostname,
      domain: '',
      storeCode: '',
      storeName: '',
      backendUrl: '',
      tokenConfigured: false,
      mapped: false,
      error: tenant.error,
    };
  }
  return cachedResolved;
}

export function getResolvedConfig(): ResolvedTenantConfig | null {
  return cachedResolved;
}

export function clearResolvedConfig(): void {
  cachedResolved = null;
}
