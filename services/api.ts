
import { Product, Order, AppConfig, Customer, CartItem, PaymentPlan } from '../types';
import { dbService } from './db';
import { getStoreCodeForCurrentHost, isLlfixHostForCurrent } from './storeHost';

// Cliente Coringa (Consumidor Final)
const WALK_IN_CUSTOMER: Customer = {
  id: '0',
  name: 'Consumidor Final',
  fantasyName: 'Venda de Balcão',
  document: '000.000.000-00',
  type: 'NORMAL',
  address: 'Balcão / Loja',
  addressNumber: '',
  neighborhood: '',
  city: '',
  state: '',
  zipCode: '',
  phone: '',
  email: '',
  origin: '',
  sellerId: '',
  sellerName: 'Loja',
  lastSaleDate: '',
  lastSaleValue: 0
};

export interface LogEntry {
    timestamp: string;
    message: string;
    type: 'info' | 'error' | 'warning' | 'success';
}

class ApiService {
  private config: AppConfig;
  private token: string | null = null;
  private isInitialized: boolean = false;
  private logs: LogEntry[] = [];
  
  // Decodifica o token JWT e tenta extrair nome/código do vendedor
  private decodeToken(token: string): { name?: string; sellerId?: string } {
      try {
          const parts = token.split('.');
          if (parts.length < 2) return {};
          const payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
          // Vários backends: user.vendor_name / vendor_code ou campos diretos
          const user = payload.user || payload;
          const name =
            user.vendor_name ||
            user.name ||
            user.nome ||
            user.username ||
            user.user_name ||
            user.preferred_username ||
            user.email ||
            user.login;
          const sellerId =
            user.vendor_code ||
            user.seller_id ||
            user.sellerId ||
            user.vendedor_codigo ||
            user.codigo_vendedor ||
            user.vendedor_id ||
            user.vendorId;
          return { name, sellerId };
      } catch { return {}; }
  }

  constructor() {
    // Configuração padrão: URL vazia significa "Usar o mesmo endereço do site" (Relativo)
    this.config = {
        backendUrl: '', 
        apiToken: '',
        useMockData: false,
        theme: 'system'
    };

    // Permite definir um backend padrão via variável de build do Vite
    try {
      const viteBackend = (import.meta as any)?.env?.VITE_BACKEND_URL;
      if (viteBackend && typeof viteBackend === 'string' && viteBackend.trim() !== '') {
        this.config.backendUrl = viteBackend.trim();
      }
    } catch {}

    const savedConfig = localStorage.getItem('appConfig');
    if (savedConfig) {
      try {
          const parsed = JSON.parse(savedConfig);
          this.config = { ...this.config, ...parsed };
      } catch(e) {}
    }
    
    this.token = localStorage.getItem('authToken');
    // PRE-POPULA nome/código a partir do token salvo (melhora experiência offline)
    if (this.token) {
        const info = this.decodeToken(this.token);
        if (info.name && !localStorage.getItem('username')) localStorage.setItem('username', info.name);
        if (info.sellerId && !localStorage.getItem('sellerId')) localStorage.setItem('sellerId', String(info.sellerId));
    }
    this.addLog('Sistema iniciado.', 'info');
  }

  // --- SISTEMA DE LOGS ---
  
  public addLog(message: string, type: 'info' | 'error' | 'warning' | 'success' = 'info') {
      const entry: LogEntry = {
          timestamp: new Date().toLocaleTimeString(),
          message,
          type
      };
      this.logs = [entry, ...this.logs].slice(0, 50);
      const style = type === 'error' ? 'color: red' : type === 'success' ? 'color: green' : 'color: blue';
      console.log(`%c[API] ${message}`, style);
  }

  public getLogs(): LogEntry[] {
      return this.logs;
  }
  
  public clearLogs() {
      this.logs = [];
      this.addLog('Logs limpos.', 'info');
  }

  // Inicialização
  async initializeConfig(): Promise<void> {
      try {
          await dbService.init();
          const dbConfig = await dbService.getSettings();
          
          if (dbConfig) {
              this.config = { ...this.config, ...dbConfig };
              localStorage.setItem('appConfig', JSON.stringify(this.config));
          } else if (localStorage.getItem('appConfig')) {
              await dbService.saveSettings(this.config);
          }
      } catch (e: any) {
          this.addLog(`Erro init config: ${e.message}`, 'error');
      } finally {
          this.isInitialized = true;
      }
  }

  getConfig(): AppConfig {
    return this.config;
  }

  async saveConfig(newConfig: AppConfig) {
    this.config = newConfig;
    this.addLog('Configurações salvas.', 'info');
    localStorage.setItem('appConfig', JSON.stringify(newConfig));
    try {
        await dbService.saveSettings(newConfig);
    } catch (e) {}
  }

  async resetToLocalMode() {
      this.config.backendUrl = '';
      this.config.useMockData = false;
      await this.saveConfig(this.config);
      this.addLog('Forçado modo local.', 'success');
  }

  isAuthenticated(): boolean {
    const hasToken = !!this.token || (!!this.config.apiToken && !this.config.useMockData);
    const hasUser = !!localStorage.getItem('username');
    return hasToken && hasUser;
  }

  // Busca dados atualizados do perfil no servidor
  async fetchProfile(): Promise<{name: string, seller_id?: string} | null> {
      const endpoints = [
          '/api/me',
          '/me',
          '/api/user/me',
          '/api/usuario/me',
          '/api/usuarios/me',
          '/api/profile',
          '/api/auth/me',
          '/api/usuario/logado',
          '/api/usuarios/logado'
      ];
      let lastError: any = null;

      for (const ep of endpoints) {
          try {
              const res = await this.fetchWithAuth(ep);
              if (!res.ok) continue;
              const contentType = res.headers.get('content-type') || '';
              if (!contentType.includes('application/json')) {
                  this.addLog('Perfil: resposta não é JSON.', 'warning');
                  continue;
              }
              const data = await res.json();
              const profile = data.user || data; 
              const name =
                profile.vendor_name ||
                profile.name ||
                profile.nome ||
                profile.username ||
                profile.user_name ||
                profile.usuario ||
                profile.email;
              const sellerId =
                profile.vendor_code ||
                profile.seller_id ||
                profile.sellerId ||
                profile.codigo_vendedor ||
                profile.vendedor_codigo ||
                profile.vendedor_id;

              if (name) {
                  this.addLog(`Perfil identificado: ${name}`, 'success');
                  localStorage.setItem('username', name);
                  if (sellerId) localStorage.setItem('sellerId', String(sellerId));
                  return { name, seller_id: sellerId };
              }
          } catch (e: any) {
              lastError = e;
          }
      }

      const tokenToDecode = this.token || this.config.apiToken;
      if (tokenToDecode) {
          const decoded = this.decodeToken(tokenToDecode);
          if (decoded.name) {
              localStorage.setItem('username', decoded.name);
              if (decoded.sellerId) localStorage.setItem('sellerId', String(decoded.sellerId));
              return { name: decoded.name, seller_id: decoded.sellerId };
          }
      }

      if (lastError?.message) {
          this.addLog(`Erro ao buscar perfil: ${lastError.message}`, 'warning');
      }
      return null;
  }

  // Importa dados de loja do ERP e grava no Node local (/api/store) se possível
  private async ensureStoreFromERP(): Promise<void> {
      if (this.config.useMockData) return;
      try {
          const r = await this.fetchWithAuth('/api/lojas');
          if (!r.ok) return;
          const ct = r.headers.get('content-type') || '';
          if (!ct.includes('application/json')) {
              this.addLog('ERP /api/lojas não retornou JSON.', 'warning');
              return;
          }
          const payload = await r.json();
          const data = Array.isArray(payload) ? payload : (payload.data || []);
          if (!data || data.length === 0) return;
          const targetStoreCode = getStoreCodeForCurrentHost();
          const loja = data.find((l:any)=> String(l.LOJCOD || l.lojcod || l.codigo || '').padStart(6,'0') === targetStoreCode) || data[0];
          if (!loja) return;
          const pick = (obj:any, keys:string[]) => { for (const k of keys) if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== '') return String(obj[k]); return ''; };
          const findBy = (obj:any, regex:RegExp) => { for (const k of Object.keys(obj)) if (regex.test(k)) return String(obj[k]); return ''; };
          const mapped = {
              legal_name: pick(loja, ['AGEEMP','RAZAO','RAZAO_SOCIAL','NOME_RAZAO','EMPRESA','Razao Social','Razão Social']),
              trade_name: pick(loja, ['AGEFAN','FANTASIA','NOME_FANTASIA','Nome Fantasia']),
              document: pick(loja, ['AGECGC','CNPJ','CPF_CNPJ','CGC','CNPJ/CPF']),
              municipal_registration: pick(loja, ['INSC_MUN','INSC_MUNICIPAL','Insc. Mun.']),
              email: pick(loja, ['AGEMAIL','EMAIL','E-mail']) || findBy(loja, /email/i),
              // Ignora AGETEL2 e AGECPL conforme solicitado
              phone: pick(loja, ['AGETEL','AGETELE','AGETEL1','AGETELF','AGETELEFONE','AGECELP','CELULAR','TELEFONE','Telefone']) || findBy(loja, /(tel|fone|cel)/i),
              street: pick(loja, ['AGEEND','ENDERECO','LOGRADOURO','RUA','Endereco','Endereço']),
              number: pick(loja, ['AGEBNU','NUMERO','NRO','NUM','Numero']),
              neighborhood: pick(loja, ['AGEBAI','BAIRRO','Bairro']),
              city: pick(loja, ['AGECIDADE','AGECID','CIDADE','MUNICIPIO','Cidade']),
              state: pick(loja, ['AGEEST','UF','ESTADO','Estado']),
              zip: pick(loja, ['AGECEP','CEP'])
          };
          await this.fetchLocal('/api/store/public', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mapped) });
          this.addLog('Dados da loja importados automaticamente.', 'success');
      } catch {}
  }

  /**
   * Valida a sessão. AGORA ACEITA TOKEN DE INTEGRAÇÃO COMO LOGIN VÁLIDO.
   * Modificado para aceitar Offline se o token estiver configurado.
   */
  async validateSession(): Promise<boolean> {
      // 1. Mock Data sempre passa
      if (this.config.useMockData) return true;

      // 2. Se já tem token de usuário (Login Normal), valida ele
      if (this.token) {
           const result = await this.testConnection(this.config.backendUrl);
           // Se sucesso OU erro de rede (offline), mantemos a sessão
           if (result.success || result.message !== 'Token Inválido') {
               // Tenta atualizar perfil em background se estiver online
               if (result.success) this.fetchProfile();
               return true; 
           }
           // Apenas se o servidor disser explicitamente que é inválido (401), limpamos
           this.token = null;
           localStorage.removeItem('authToken');
      }

      // 3. Fallback: Login via Token de Configuração (Modo Terminal)
      if (this.config.apiToken) {
          const result = await this.testConnection(this.config.backendUrl);
          
          // CRÍTICO: Se tiver sucesso OU se estiver offline (mas não rejeitado), liberamos o acesso.
          // Isso garante que o app abra mesmo sem internet se já foi configurado.
          if (result.success || result.message !== 'Token Inválido') {
              // "Loga" automaticamente usando o token da config
              this.token = this.config.apiToken;
              localStorage.setItem('authToken', this.token);

              // Sempre tenta buscar perfil e loja (mesmo offline tentamos decode)
              let prof = await this.fetchProfile();
              if (!prof) {
                 const decoded = this.decodeToken(this.token);
                 if (decoded.name) localStorage.setItem('username', decoded.name);
                 if (decoded.sellerId) localStorage.setItem('sellerId', String(decoded.sellerId));
              }
              await this.ensureStoreFromERP();

              if (!localStorage.getItem('username')) localStorage.setItem('username', 'Terminal Vinculado');
              this.addLog(result.success ? 'Sessão validada via Token.' : 'Sessão offline com Token.', result.success ? 'success' : 'warning');
              return true;
          } else {
              this.addLog('Token de Integração rejeitado pelo servidor (401).', 'error');
          }
      }

      this.addLog('Nenhuma sessão válida encontrada.', 'warning');
      return false;
  }

  /**
   * Tenta forçar o login usando o token de configuração
   */
  async loginViaSettingsToken(): Promise<{ success: boolean; message?: string }> {
      if (!this.config.apiToken) {
          return { success: false, message: 'Configure o Token primeiro.' };
      }

      const result = await this.testConnection(this.config.backendUrl);
      
      if (result.success) {
          this.token = this.config.apiToken;
          localStorage.setItem('authToken', this.token);

          // Tenta pegar o nome real do dono do token
          const profile = await this.fetchProfile();
          let userName = profile?.name;
          if (!userName) {
              const decoded = this.decodeToken(this.token);
              if (decoded.name) localStorage.setItem('username', decoded.name);
              if (decoded.sellerId) localStorage.setItem('sellerId', String(decoded.sellerId));
              userName = decoded.name || 'Terminal Vinculado';
          }
          
          this.addLog(`Login forçado: ${userName}`, 'success');
          return { success: true };
      } else {
          return { success: false, message: 'O Token salvo nas configurações foi rejeitado pelo servidor.' };
      }
  }

  getUsername(): string {
    return localStorage.getItem('username') || 'Vendedor';
  }
  
  // Recupera o ID do vendedor salvo no login
  getSellerId(): string | null {
      return localStorage.getItem('sellerId');
  }

  private getBaseUrl(): string {
      if (this.config.backendUrl && this.config.backendUrl.trim() !== '') {
          return this.config.backendUrl.trim().replace(/\/$/, "");
      }
      return ''; 
  }

  private shouldUseLlfixProductsEndpoint(): boolean {
      return isLlfixHostForCurrent();
  }

  private buildProductsEndpoint(params: { page?: number; limit?: number; includeSeller?: boolean } = {}): string {
      const { page, limit, includeSeller } = params;
      if (this.shouldUseLlfixProductsEndpoint()) {
          const query = new URLSearchParams();
          query.set('loja', getStoreCodeForCurrentHost());
          if (page !== undefined) query.set('page', String(page));
          if (limit !== undefined && limit >= 0) query.set('limit', String(limit));
          return `/api/produtos-sync/?${query.toString()}`;
      }

      const query = new URLSearchParams();
      if (page !== undefined) query.set('page', String(page));
      if (limit !== undefined) query.set('limit', String(limit));
      if (includeSeller) {
          const seller = this.getSellerId();
          if (seller) query.set('vendedor_id', seller);
      }
      const queryString = query.toString();
      return `/api/products${queryString ? `?${queryString}` : ''}`;
  }

  private normalizeSellerId(value?: string | number | null): string {
      if (value === null || value === undefined) return '';
      const raw = String(value).trim();
      return raw;
  }

  private isSameSeller(a?: string | number | null, b?: string | number | null): boolean {
      const left = this.normalizeSellerId(a);
      const right = this.normalizeSellerId(b);
      if (!left || !right) return false;
      if (left === right) return true;
      const leftNorm = left.replace(/^0+/, '');
      const rightNorm = right.replace(/^0+/, '');
      if (!leftNorm || !rightNorm) return false;
      if (leftNorm === rightNorm) return true;
      return leftNorm.padStart(6, '0') === rightNorm.padStart(6, '0');
  }

  private resolveImageUrl(value?: string): string | undefined {
      if (!value) return undefined;
      const raw = String(value).trim();
      if (!raw) return undefined;
      if (raw.startsWith('data:')) return raw;
      if (/^https?:\/\//i.test(raw)) return raw;
      const baseUrl = this.getBaseUrl();
      if (baseUrl) {
          if (raw.startsWith('/')) return `${baseUrl}${raw}`;
          return `${baseUrl}/${raw}`;
      }
      return raw;
  }

  private getAuthHeaders() {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };
    const tokenToUse = this.token || this.config.apiToken;
    
    if (tokenToUse) {
        headers['Authorization'] = `Bearer ${tokenToUse}`;
    }
    return headers;
  }

  // Força requisição ao mesmo host do app (ignora backendUrl) — útil para /api/store e geração de PDF
  async fetchLocal(endpoint: string, options: RequestInit = {}): Promise<Response> {
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) } as any;
      return fetch(cleanEndpoint, { ...options, headers });
  }

  async fetchWithAuth(endpoint: string, options: RequestInit = {}): Promise<Response> {
      // exportado para uso em outros componentes (ex.: Settings -> importação da API externa)
      // mantendo método public via class - já é público, mas adiciono comentário para indicar intenção
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      const baseUrl = this.getBaseUrl();
      const hasRemoteConfig = baseUrl !== '';
      
      const doFetch = async (url: string) => {
           // Timeout Controller: Aborta se passar de 10s
           const controller = new AbortController();
           const id = setTimeout(() => controller.abort(), 10000); // 10s timeout
           
           try {
               const response = await fetch(url, { 
                  ...options, 
                  signal: controller.signal,
                  headers: { ...this.getAuthHeaders(), ...options.headers } 
               });
               clearTimeout(id);
               return response;
           } catch(e) {
               clearTimeout(id);
               throw e;
           }
      };

      const check401 = (res: Response) => {
           if (res.status === 401 && this.token) {
              this.addLog(`Sessão expirada.`, 'warning');
              this.token = null;
              localStorage.removeItem('authToken');
          }
          return res;
      };

      try {
          if (hasRemoteConfig) {
              const fullUrl = `${baseUrl}${cleanEndpoint}`;
              this.addLog(`Req: ${fullUrl}`, 'info');
              
              try {
                  const response = await doFetch(fullUrl);
                  if (response.ok || response.status === 401 || response.status === 400 || response.status === 500) {
                      return check401(response);
                  }
                  throw new Error(`Remote status ${response.status}`);
              } catch (remoteError: any) {
                  if (remoteError.name === 'AbortError') {
                      this.addLog(`Timeout: O servidor demorou muito para responder.`, 'error');
                      throw new Error('Timeout: Servidor lento ou indisponível.');
                  }
                  this.addLog(`Remoto falhou (${remoteError.message}), tentando Local...`, 'warning');
              }
          }

          const localResponse = await doFetch(cleanEndpoint);
          return check401(localResponse);

      } catch (error: any) {
          const msg = error.name === 'AbortError' ? 'Timeout: Conexão lenta.' : error.message;
          this.addLog(`Erro fatal na requisição: ${msg}`, 'error');
          throw error;
      }
  }

  private mapNetworkError(error: any): string {
      const msg = error.message || '';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
          return 'Falha na conexão. Verifique se o servidor (server.js) está rodando.';
      }
      if (msg.includes('Timeout')) {
          return 'Tempo esgotado. O servidor demorou para responder.';
      }
      return 'Erro de conexão.';
  }

  // --- AUTENTICAÇÃO ---

  async login(username: string, password: string): Promise<{ success: boolean; message?: string }> {
    const payload = { username, password };
    
    try {
      const baseUrl = this.getBaseUrl();
      const endpoint = '/api/login';
      
      let response: Response;

      try {
          if (baseUrl) {
               response = await fetch(`${baseUrl}${endpoint}`, {
                   method: 'POST',
                   headers: { 'Content-Type': 'application/json' },
                   body: JSON.stringify(payload)
               });
               if (!response.ok) throw new Error('Remote failed');
          } else {
               throw new Error('No remote');
          }
      } catch (e) {
          response = await fetch(endpoint, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify(payload)
          });
      }

      const data = await response.json();

      if (response.ok) {
          // ===================================================================
          //  SUPORTE A API DE PRODUÇÃO: { token: {...}, user: { vendor_code... } }
          // ===================================================================
          
          let accessToken = '';
          let displayName = '';
          let sellerId = '';

          // Caso 1: Estrutura Aninhada (API Produção)
          if (data.token && data.token.access_token) {
             accessToken = data.token.access_token;
             
             // Extrair Vendor Name e Vendor Code
             if (data.user) {
                 displayName = data.user.vendor_name || data.user.username || username;
                 sellerId = data.user.vendor_code || '';
             }
          } 
          // Caso 2: Estrutura Plana (API Legada / Local antiga)
          else if (data.token) {
             accessToken = data.token;
             displayName = data.name || username;
             sellerId = data.sellerId || '';
          }

          if (accessToken) {
              this.token = accessToken;
              this.addLog(`Login Sucesso: ${displayName} [${sellerId}]`, 'success');
              
              localStorage.setItem('authToken', this.token);
              localStorage.setItem('username', displayName);
              
              if (sellerId) {
                  localStorage.setItem('sellerId', sellerId);
              } else {
                  localStorage.removeItem('sellerId');
              }
              
              return { success: true };
          }
      }
      
      return { success: false, message: data.message || 'Credenciais inválidas.' };
    } catch (error: any) {
      return { success: false, message: this.mapNetworkError(error) };
    }
  }

  async sendAccessCode(email: string): Promise<{ success: boolean; message?: string }> {
      const baseUrl = this.getBaseUrl();
      const endpoint = '/api/auth/send-code';
      
      try {
          let response: Response;
          try {
              if (baseUrl) {
                  response = await fetch(`${baseUrl}${endpoint}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email })
                  });
                  if (!response.ok && response.status !== 404) throw new Error('Remote failed');
              } else {
                  throw new Error('No remote');
              }
          } catch {
              response = await fetch(endpoint, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email })
              });
          }

          const data = await response.json();
          return { success: response.ok, message: data.message };
      } catch (error: any) {
          return { success: false, message: this.mapNetworkError(error) };
      }
  }

  async loginWithAccessCode(email: string, code: string): Promise<{ success: boolean; message?: string }> {
      const baseUrl = this.getBaseUrl();
      const endpoint = '/api/auth/verify-code';
      
      try {
          let response: Response;
          try {
              if (baseUrl) {
                  response = await fetch(`${baseUrl}${endpoint}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email, code })
                  });
                  if (!response.ok) throw new Error('Remote failed');
              } else {
                  throw new Error('No remote');
              }
          } catch {
              response = await fetch(endpoint, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email, code })
              });
          }

          const data = await response.json();
          
          if (response.ok) {
              // Lógica de Parsing igual ao Login normal
              let accessToken = '';
              let displayName = '';
              let sellerId = '';

              if (data.token && data.token.access_token) {
                 accessToken = data.token.access_token;
                 if (data.user) {
                     displayName = data.user.vendor_name || data.user.username || email;
                     sellerId = data.user.vendor_code || '';
                 }
              } else if (data.token) {
                 accessToken = data.token;
                 displayName = data.name || email;
                 sellerId = data.sellerId || '';
              }

              if (accessToken) {
                  this.token = accessToken;
                  localStorage.setItem('authToken', this.token || '');
                  localStorage.setItem('username', displayName);
                  if (sellerId) localStorage.setItem('sellerId', sellerId);
                  
                  this.addLog(`Login com código: ${email}`, 'success');
                  return { success: true };
              }
          }

          return { success: false, message: data.message || 'Código inválido.' };
      } catch (error: any) {
          return { success: false, message: this.mapNetworkError(error) };
      }
  }

  async loginWithGoogle(credential: string): Promise<{ success: boolean; message?: string }> {
    // Enviamos o payload padrão, sem clientId customizado
    const payload = { credential };
    const baseUrl = this.getBaseUrl();
    const endpoint = '/api/auth/google';

    try {
        let response: Response;
        try {
            if (baseUrl) {
                 response = await fetch(`${baseUrl}${endpoint}`, {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify(payload)
                 });
                 if (!response.ok) throw new Error('Remote failed');
            } else {
                 throw new Error('No remote');
            }
        } catch (e) {
            // Fallback para local
            response = await fetch(endpoint, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify(payload)
            });
        }

        const data = await response.json();

        if (response.ok) {
            this.token = data.token;
            if (this.token) {
                const userName = data.name || 'Usuário Google';
                this.addLog(`Login Google sucesso: ${userName}`, 'success');
                localStorage.setItem('authToken', this.token);
                localStorage.setItem('username', userName);
                
                // SALVA SELLER ID SE RETORNADO
                if (data.sellerId) {
                    localStorage.setItem('sellerId', data.sellerId);
                } else {
                    localStorage.removeItem('sellerId');
                }
              
                return { success: true };
            }
        }
        return { success: false, message: data.message || 'Falha no login com Google.' };

    } catch (error: any) {
        return { success: false, message: this.mapNetworkError(error) };
    }
  }

  async register(name: string, email: string, password: string): Promise<{ success: boolean; message?: string }> {
      const payload = { name, email, password };
      const endpoint = '/api/register';
      const baseUrl = this.getBaseUrl();

      try {
          let response: Response;
          try {
              if (baseUrl) {
                  response = await fetch(`${baseUrl}${endpoint}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload)
                  });
                  if (!response.ok) throw new Error('Remote failed');
              } else {
                  throw new Error('No remote');
              }
          } catch {
              response = await fetch(endpoint, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload)
              });
          }

          const data = await response.json();
          
          if (response.ok) {
              this.token = data.token;
              localStorage.setItem('authToken', this.token || '');
              localStorage.setItem('username', email);
              if (data.sellerId) {
                 localStorage.setItem('sellerId', data.sellerId);
              }
              this.addLog(`Novo usuário registrado: ${email}`, 'success');
              return { success: true };
          }
          
          return { success: false, message: data.message || 'Erro ao registrar.' };
      } catch (error: any) {
          return { success: false, message: this.mapNetworkError(error) };
      }
  }
  
  logout() {
    this.token = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('username');
    localStorage.removeItem('sellerId');
  }

  async testConnection(url: string): Promise<{ success: boolean; message: string }> {
      const targetUrl = url.trim() ? url.trim().replace(/\/$/, "") : '';
      // Preferimos /api/me para validar permissão do token, pois alguns backends
      // exigem vendedor_id nas rotas de produtos e retornam 403.
      const meEndpoint = targetUrl ? `${targetUrl}/api/me` : `/api/me`;
      const productEndpoint = this.buildProductsEndpoint({ limit: 1, includeSeller: true });
      const endpoint = targetUrl ? `${targetUrl}${productEndpoint}` : productEndpoint;
      
      this.addLog(`Testando: ${meEndpoint} ou ${endpoint}`, 'info');
      
      try {
        // 1) Tenta /api/me
        let response = await fetch(meEndpoint, {
          method: 'GET',
          headers: { ...this.getAuthHeaders() }
        });

        if (response.ok) return { success: true, message: 'Conectado!' };
        
        // 2) Fallback para produtos (com vendedor_id se houver)
        response = await fetch(endpoint, {
          method: 'GET',
          headers: { ...this.getAuthHeaders() }
        });
        
        if (response.ok) return { success: true, message: 'Conectado!' };
        if (response.status === 401) return { success: false, message: 'Token Inválido' };
        
        return { success: false, message: `Erro HTTP ${response.status}` };
      } catch (e: any) {
        const rawMessage = typeof e?.message === 'string' && e.message.trim() ? e.message.trim() : 'Erro desconhecido';
        const friendlyDetail = rawMessage.includes('Failed to fetch') || rawMessage.includes('NetworkError')
          ? 'Falha no fetch (possível CORS ou servidor indisponível).'
          : rawMessage;
        this.addLog(`Teste de conexão falhou: ${friendlyDetail}`, 'error');
        return { success: false, message: `Sem conexão. ${friendlyDetail}` };
      }
  }

  // --- PEDIDOS ---

  async submitOrder(order: Order): Promise<{ success: boolean, message?: string }> {
    // Validação de Token antes de enviar
    const currentToken = this.token || this.config.apiToken;
    if (!currentToken) {
         this.addLog('ERRO: Tentativa de envio sem token autenticado.', 'error');
         return { success: false, message: 'Token não configurado.' };
    }

    try {
      let planCode = order.paymentPlanCode;
      let planDescription = order.paymentPlanDescription;
      let planInstallments = order.paymentInstallments;
      let planDaysBetween = order.paymentDaysBetween;
      let planMinValue = order.paymentMinValue;

      if (!planCode && order.customerId) {
          try {
              const plans = await this.getPaymentPlansForCustomer(order.customerId);
              if (plans.length > 0) {
                  const fallback = plans[0];
                  planCode = fallback.code;
                  planDescription = fallback.description;
                  planInstallments = fallback.installments;
                  planDaysBetween = fallback.daysBetweenInstallments;
                  planMinValue = fallback.minValue;
                  order.paymentPlanCode = planCode;
                  order.paymentPlanDescription = planDescription;
                  order.paymentInstallments = planInstallments;
                  order.paymentDaysBetween = planDaysBetween;
                  order.paymentMinValue = planMinValue;
              }
          } catch {}
      }

      if (!planCode) {
          planCode = '';
          planDescription = '';
          planInstallments = 1;
          planDaysBetween = 0;
          planMinValue = 0;
      }

      const extraNotes = [
        order.notes || '',
        order.paymentMethod ? `Pagamento: ${order.paymentMethod}` : '',
        order.shippingMethod ? `Frete: ${order.shippingMethod}` : ''
      ].filter(Boolean).join(' | ');

      const backendOrder: Record<string, any> = {
        data_criacao: order.createdAt,
        total: order.total,
        cliente_id: order.customerId, 
        cliente_tipo: order.customerType || 'NORMAL',
        plano_pagamento_codigo: planCode || '',
        plano_pagamento_descricao: planDescription || '',
        parcelas: planInstallments || 1,
        dias_entre_parcelas: planDaysBetween || 0,
        valor_minimo: planMinValue || 0,
        observacao: extraNotes,
        vendedor_id: order.sellerId || this.getSellerId() || '',
        vendedor_nome: order.sellerName || this.getUsername() || '',
        itens: order.items.map(item => ({ 
            codigo_produto: item.id,
            quantidade: item.quantity, 
            valor_unitario: item.price 
        }))
      };

      if (!this.getBaseUrl()) {
        backendOrder.payment_method = order.paymentMethod || '';
        backendOrder.shipping_method = order.shippingMethod || '';
      }
      
      this.addLog(`Enviando Pedido #${order.displayId} (Itens: ${order.items.length})`, 'info');
      
      const response = await this.fetchWithAuth(`/api/pedidos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backendOrder)
      });

      if (!response.ok) {
          const txt = await response.text();
          this.addLog(`Erro Servidor (${response.status}): ${txt}`, 'error');
          try {
             const json = JSON.parse(txt);
             return { success: false, message: json.message || `Erro ${response.status}` };
          } catch(e) {
             return { success: false, message: `Erro ${response.status}: ${txt.substring(0, 50)}...` };
          }
      }

      this.addLog(`Pedido ${order.displayId} enviado com sucesso!`, 'success');
      // Atualiza status de negócio e salva localmente para refletir no histórico
      try {
          order.businessStatus = 'pre_venda';
          const data = await response.clone().json().catch(()=>({}));
          if (data && (data.orderId || data.id)) order.remoteId = data.orderId || data.id;
          await dbService.saveOrder(order);
      } catch {}
      return { success: true };
    } catch (error: any) { 
        this.addLog(`Falha envio #${order.displayId}: ${error.message}`, 'error');
        return { success: false, message: error.message }; 
    }
  }

  async getOrderHistory(): Promise<Order[]> {
       return [];
  }

  // Atualiza status de negócio no servidor (se exposto) e reflete local
  async updateOrderBusinessStatus(order: Order, next: Order['businessStatus']): Promise<{ success: boolean; message?: string }> {
    try {
      const remoteId = order.remoteId || order.displayId || order.id;
      // tenta atualizar servidor; se falhar, mantém apenas local
      try {
        await this.fetchWithAuth(`/api/pedidos/${remoteId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: next })
        });
      } catch {}
      order.businessStatus = next;
      await dbService.saveOrder(order);
      return { success: true };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }

  // --- PRODUTOS ---

  async createProduct(product: Partial<Product>): Promise<{ success: boolean, message?: string }> {
      try {
          const payload = {
              codigo: product.id,
              nome: product.name,
              descricao_completa: product.description,
              preco: product.price,
              estoque: product.stock,
              categoria: product.category,
              unidade: product.unit,
              imagem_url: product.imageUrl
          };

          const response = await this.fetchWithAuth('/api/products', {
              method: 'POST',
              body: JSON.stringify(payload)
          });

          const data = await response.json();
          if (response.ok) {
              return { success: true };
          }
          return { success: false, message: data.message || 'Erro ao criar produto' };
      } catch (e: any) {
          return { success: false, message: e.message };
      }
  }

  async getProducts(page: number = 1, limit: number = 50, searchTerm: string = '', category: string = 'Todas'): Promise<Product[]> {
    try {
      const count = await dbService.countProducts();
      if (count > 0) {
        const result = await dbService.searchProducts(page, limit, searchTerm, category);
        if (result.products.length > 0 || searchTerm !== '') return result.products;
      }
      // Sem produtos locais; se estiver em modo demonstração, cria um catálogo base
      if (this.config.useMockData && (count === 0)) {
         const demo: Product[] = [
            { id:'IP14-128', name:'iPhone 14 128GB', description:'Smartphone Apple iPhone 14 128GB', price:4999, category:'Smartphone', stock:25, unit:'un' },
            { id:'S23U-256', name:'Samsung Galaxy S23 Ultra 256GB', description:'Top de linha Samsung com S-Pen', price:5499, category:'Smartphone', stock:12, unit:'un' },
            { id:'MAC-13M2', name:'MacBook Air 13" M2 8GB/256GB', description:'Notebook Apple M2', price:8999, category:'Notebook', stock:8, unit:'un' },
            { id:'NOTE-I7', name:'Notebook i7 16GB/512GB', description:'Windows 11, SSD 512GB, 16GB RAM', price:4399, category:'Notebook', stock:14, unit:'un' },
            { id:'TV-65OLED', name:'Smart TV 65" OLED 4K', description:'Dolby Vision/Atmos', price:6999, category:'TV', stock:6, unit:'un' },
            { id:'FONE-ANC', name:'Fone Bluetooth com ANC', description:'Cancelamento ativo de ruído', price:699, category:'Acessórios', stock:40, unit:'un' }
         ];
         await dbService.bulkAddProducts(demo);
         const seeded = await dbService.searchProducts(page, limit, searchTerm, category);
         if (seeded.products.length > 0) return seeded.products;
      }
    } catch (e) {}

    return this.fetchProductsFromNetwork(page, limit);
  }

  private async fetchProductsFromNetwork(page: number, limit: number): Promise<Product[]> {
    try {
      const response = await this.fetchWithAuth(this.buildProductsEndpoint({ page, limit, includeSeller: true }));
      if (!response.ok) return [];
      
      const data = await response.json();
      const list = Array.isArray(data) ? data : (data.data || []);
      
      return list.map((item: any) => this.mapProduct(item));
    } catch (error) {
      return [];
    }
  }

  async syncFullCatalog(onProgress: (current: number, total: number | null) => void): Promise<{ success: boolean, count: number, message?: string }> {
    try {
        // CORREÇÃO: limit=-1 garante que o backend envie todos os produtos sem paginação
        const response = await this.fetchWithAuth(this.buildProductsEndpoint({ limit: -1, includeSeller: true }));
        
        if (!response.ok) throw new Error(`Erro ${response.status}`);
        
        const data = await response.json();
        const list = Array.isArray(data) ? data : (data.data || []);
        
        await dbService.clearProducts();
        const mapped = list.map((i: any) => this.mapProduct(i));
        await dbService.bulkAddProducts(mapped);
        
        onProgress(mapped.length, mapped.length);
        return { success: true, count: mapped.length };
    } catch (e: any) {
        this.addLog(`Erro sync: ${e.message}`, 'error');
        return { success: false, count: 0, message: e.message };
    }
  }

  private mapProduct(item: any): Product {
      let rawPrice = item.preco_promocao1 || item.preco || item.price || 0;
      if (typeof rawPrice === 'string') rawPrice = parseFloat(rawPrice.replace(',', '.'));

      // Ajuste solicitado: Nome do produto recebe a descrição completa
      const productName = item.descricao_completa || item.nome || item.name || 'Produto';

      return {
        id: String(item.plu || item.codigo || item.id),
        name: productName,
        // Evita duplicação se a descrição for igual ao nome
        description: (item.descricao_completa && item.descricao_completa !== productName) ? item.descricao_completa : (item.description || ''),
        price: Number(rawPrice) || 0,
        category: item.categoria || item.category || 'Geral',
        // AJUSTE: Prioriza estoque_disponivel
        stock: Number(item.estoque_disponivel ?? item.estoque ?? item.stock ?? 0),
        unit: item.unidade || item.unit || 'un',
        imageUrl: this.resolveImageUrl(item.imagem_url || item.image_url || item.imagemUrl || item.imageUrl)
      };
  }

  // --- CLIENTES ---

  async getCustomers(): Promise<Customer[]> {
      const currentSellerId = this.getSellerId();
      
      try {
         // Se configuração exigir, ignora cache local e busca sempre do backend
         if (!this.config.alwaysFetchCustomers) {
            let local = await dbService.getLocalCustomers();
            // Filtro estrito: se houver vendedor logado, lista SOMENTE clientes vinculados a ele
          if (currentSellerId) {
                local = local.filter(c => this.isSameSeller(c.sellerId, currentSellerId));
            }
            local = local.filter(c => c.type !== 'TEMPORARIO');
            if (local.length > 0) return [WALK_IN_CUSTOMER, ...local];
         }

         // Se estiver em Mock e não houver clientes locais, cria uma base de demonstração
         if (this.config.useMockData) {
            const demoClients: Customer[] = [
                { id:'C100', name:'Rede Varejista Alfa', fantasyName:'Alfa Supermercados', document:'12.345.678/0001-90', address:'Av. Brasil', addressNumber:'1000', neighborhood:'Centro', city:'Fortaleza', state:'CE', zipCode:'60000-000', phone:'(85) 3333-0001', email:'compras@alfa.com', sellerId: currentSellerId || '' },
                { id:'C200', name:'Clínica Saúde Vida', fantasyName:'Saúde Vida', document:'11.222.333/0001-55', address:'Rua das Flores', addressNumber:'200', neighborhood:'Jardins', city:'Fortaleza', state:'CE', zipCode:'60111-111', phone:'(85) 98888-7777', email:'contato@saudevida.com', sellerId: currentSellerId || '' },
                { id:'C300', name:'Serviços Beta Ltda', fantasyName:'Beta Serviços', document:'22.333.444/0001-77', address:'Av. Independência', addressNumber:'300', neighborhood:'Aldeota', city:'Fortaleza', state:'CE', zipCode:'60123-000', phone:'(85) 99999-6666', email:'financeiro@betaservicos.com', sellerId: currentSellerId || '' }
            ];
            await dbService.bulkAddCustomers(demoClients);
            return [WALK_IN_CUSTOMER, ...demoClients];
         }

         // FALLBACK: Aumenta limite de visualização direta se não sincronizado
         // limit=-1 para garantir que traga tudo se a sincronização falhou antes
         let queryParams = `limit=-1`; 
         
         if (currentSellerId) {
            queryParams += `&vendedor_id=${encodeURIComponent(currentSellerId)}`;
         }

         const res = await this.fetchWithAuth(`/api/clientes?${queryParams}`);
         if (res.ok) {
             const data = await res.json();
             const list = Array.isArray(data) ? data : data.data || [];
             const mapped = list
                 .filter((item: any) => item?.type !== 'TEMPORARIO')
                 .map((item: any) => this.mapCustomer(item));
             const filtered = currentSellerId
                 ? mapped.filter((c: Customer) => this.isSameSeller(c.sellerId, currentSellerId))
                 : mapped;
             return [WALK_IN_CUSTOMER, ...filtered];
         }
      } catch(e) {}
      
      return [WALK_IN_CUSTOMER];
  }

  async getCustomerByCnpj(cnpj: string): Promise<Customer | null> {
      const res = await this.fetchWithAuth(`/api/clientes/cnpj/${encodeURIComponent(cnpj)}`);
      if (res.status === 404) return null;
      if (!res.ok) {
          const msg = await res.text();
          try {
              const data = JSON.parse(msg);
              throw new Error(data.message || 'Erro ao consultar cliente.');
          } catch (e) {
              throw new Error(msg || 'Erro ao consultar cliente.');
          }
      }
      const data = await res.json();
      return this.mapCustomer(data);
  }

  async lookupSefazByCnpj(cnpj: string): Promise<{ razaoSocial: string; nomeFantasia: string; situacao: string; endereco: string; uf: string; municipio: string }> {
      const res = await this.fetchWithAuth(`/api/externo/sefaz/cnpj/${encodeURIComponent(cnpj)}`);
      if (!res.ok) {
          const msg = await res.text();
          try {
              const data = JSON.parse(msg);
              throw new Error(data.message || 'Falha na consulta SEFAZ.');
          } catch (e) {
              throw new Error(msg || 'Falha na consulta SEFAZ.');
          }
      }
      const data = await res.json();
      return {
          razaoSocial: data.razao_social || data.razaoSocial || '',
          nomeFantasia: data.nome_fantasia || data.nomeFantasia || '',
          situacao: data.situacao_cadastral || data.situacao || '',
          endereco: data.endereco || '',
          uf: data.uf || '',
          municipio: data.municipio || ''
      };
  }

  async createTempCustomer(payload: { cnpj: string; razaoSocial: string; nomeFantasia: string; endereco: string; uf: string; municipio: string; vendedorId?: string | null }): Promise<Customer> {
      const res = await this.fetchWithAuth(`/api/clientes/temp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              cnpj: payload.cnpj,
              razao_social: payload.razaoSocial,
              nome_fantasia: payload.nomeFantasia,
              endereco: payload.endereco,
              uf: payload.uf,
              municipio: payload.municipio,
              vendedor_id: payload.vendedorId || undefined
          })
      });
      if (!res.ok) {
          const msg = await res.text();
          try {
              const data = JSON.parse(msg);
              throw new Error(data.message || 'Erro ao criar cliente temporario.');
          } catch (e) {
              throw new Error(msg || 'Erro ao criar cliente temporario.');
          }
      }
      const data = await res.json();
      return this.mapCustomer(data);
  }

  async getPaymentPlansForCustomer(customerId: string): Promise<PaymentPlan[]> {
      const res = await this.fetchWithAuth(`/api/planos-pagamento-cliente/${encodeURIComponent(customerId)}`);
      if (res.status === 404) return [];
      if (!res.ok) {
          const msg = await res.text();
          try {
              const data = JSON.parse(msg);
              throw new Error(data.message || 'Erro ao buscar planos de pagamento.');
          } catch (e) {
              throw new Error(msg || 'Erro ao buscar planos de pagamento.');
          }
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.data || []);
      return list.map((p: any) => ({
          code: String(p.plano_codigo || p.codigo || p.code),
          description: p.plano_descricao || p.descricao || p.description || '',
          installments: Number(p.parcelas ?? p.installments ?? 1),
          daysBetweenInstallments: Number(p.dias_entre_parcelas ?? p.days_between_installments ?? 0),
          minValue: Number(p.valor_minimo ?? p.min_value ?? 0)
      }));
  }

  async syncCustomers(onProgress: (c: number) => void): Promise<{ success: boolean, count: number, message?: string }> {
     try {
        // CORREÇÃO: limit=-1 indica para o backend mandar tudo (sem paginação).
        let queryParams = `limit=-1`; 
        
        // RECUPERA SELLER ID DO LOGIN
        const savedSellerId = this.getSellerId();
        if (savedSellerId) {
            queryParams += `&vendedor_id=${encodeURIComponent(savedSellerId)}`;
        }
        
        const response = await this.fetchWithAuth(`/api/clientes?${queryParams}`);
        if (!response.ok) throw new Error(`Erro ${response.status}`);
        
        const data = await response.json();
        const list = Array.isArray(data) ? data : (data.data || []);
        
        await dbService.clearCustomers();
        const mapped = list.map((c: any) => this.mapCustomer(c));
        const filtered = savedSellerId
            ? mapped.filter((c: Customer) => this.isSameSeller(c.sellerId, savedSellerId))
            : mapped;
        await dbService.bulkAddCustomers(filtered);
        
        onProgress(filtered.length);
        return { success: true, count: filtered.length };
    } catch (e: any) {
        return { success: false, count: 0, message: e.message };
    }
  }

  private mapCustomer(c: any): Customer {
      // Mapeia vendor_code ou vendedor_codigo ou seller_id
      return {
          id: String(c.cliente_codigo || c.id || c.codigo),
          name: c.cliente_razao_social || c.nome || c.name || 'Cliente',
          fantasyName: c.cliente_nome_fantasia || c.fantasy_name || c.nome_fantasia || '',
          document: c.cliente_cnpj_cpf || c.documento || c.document || '',
          type: c.cliente_tipo || (c.cliente_status === 'TEMPORARIO' || c.status === 'TEMPORARIO' ? 'TEMPORARIO' : 'NORMAL'),
          origin: c.cliente_origem || c.origin || '',
          
          address: c.cliente_endereco || c.endereco || c.address || '',
          addressNumber: c.cliente_numero || '',
          neighborhood: c.cliente_bairro || '',
          city: c.cliente_cidade || c.cidade || c.city || '',
          state: c.cliente_uf || '',
          zipCode: c.cliente_cep || '',
          
          phone: c.cliente_telefone1 || c.telefone || c.phone || '',
          email: c.cliente_email || '',

          // Novos Campos de Vendas
          sellerName: c.vendedor_nome || c.seller_name || '',
          sellerId: c.vendor_code || c.vendedor_codigo || c.seller_id || c.vendedor_id || c.vendedorId || c.sellerId || '',
          lastSaleDate: c.ultima_venda_data || '',
          lastSaleValue: Number(c.ultima_venda_valor) || 0
      };
  }
}

export const apiService = new ApiService();
