import { OAuth2Client } from 'google-auth-library';
import { GoogleGenAI } from '@google/genai';
import nodemailer from 'nodemailer';

// ── Configuration Constants ──────────────────────────────────────────────────

export const SECRET_KEY = process.env.SECRET_KEY || 'super-secret-key-change-this-in-production';
export const MASTER_KEY = process.env.MASTER_KEY || 'salesforce-pro-token';
export const APP_INTEGRATION_TOKEN = process.env.APP_INTEGRATION_TOKEN || process.env.VITE_APP_INTEGRATION_TOKEN || '';
export const APP_INTEGRATION_TOKEN_EDSON = process.env.APP_INTEGRATION_TOKEN_EDSON || process.env.VITE_APP_INTEGRATION_TOKEN_EDSON || '';
export const APP_INTEGRATION_TOKEN_LLFIX = process.env.APP_INTEGRATION_TOKEN_LLFIX || process.env.VITE_APP_INTEGRATION_TOKEN_LLFIX || '';

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'SEU_CLIENT_ID_AQUI.apps.googleusercontent.com';
export const DB_PATH = process.env.DB_PATH || './database.sqlite';
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// E-mail/SMTP — configuração global (fallback)
export const SMTP_ADDRESS  = process.env.SMTP_ADDRESS || process.env.SMTP_HOST || '';
export const SMTP_PORT     = parseInt(process.env.SMTP_PORT || '587');
export const SMTP_SECURE   = process.env.SMTP_SECURE === 'true' || parseInt(process.env.SMTP_PORT || '587') === 465;
export const SMTP_USERNAME = process.env.SMTP_USERNAME || process.env.SMTP_USER || '';
export const SMTP_PASSWORD = process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '';
export const MAILER_FROM   = process.env.MAILER_SENDER_EMAIL || process.env.SMTP_FROM || 'SalesForce <no-reply@salesforce.pro>';

// E-mail/SMTP — por tenant (prioridade sobre o global)
export const EDSON_SMTP_HOST   = process.env.EDSON_SMTP_HOST   || SMTP_ADDRESS;
export const EDSON_SMTP_PORT   = parseInt(process.env.EDSON_SMTP_PORT   || String(SMTP_PORT));
export const EDSON_SMTP_SECURE = process.env.EDSON_SMTP_SECURE === 'true' || EDSON_SMTP_PORT === 465;
export const EDSON_SMTP_USER   = process.env.EDSON_SMTP_USER   || SMTP_USERNAME;
export const EDSON_SMTP_PASS   = process.env.EDSON_SMTP_PASS   || SMTP_PASSWORD;
export const EDSON_SMTP_FROM   = process.env.EDSON_SMTP_FROM   || MAILER_FROM;

export const LLFIX_SMTP_HOST   = process.env.LLFIX_SMTP_HOST   || SMTP_ADDRESS;
export const LLFIX_SMTP_PORT   = parseInt(process.env.LLFIX_SMTP_PORT   || String(SMTP_PORT));
export const LLFIX_SMTP_SECURE = process.env.LLFIX_SMTP_SECURE === 'true' || LLFIX_SMTP_PORT === 465;
export const LLFIX_SMTP_USER   = process.env.LLFIX_SMTP_USER   || SMTP_USERNAME;
export const LLFIX_SMTP_PASS   = process.env.LLFIX_SMTP_PASS   || SMTP_PASSWORD;
export const LLFIX_SMTP_FROM   = process.env.LLFIX_SMTP_FROM   || MAILER_FROM;

export const DEFAULT_STORE_ID = 1;
export const EDSON_DOMAIN = 'edsondosparafusos.app.br';
export const LLFIX_DOMAIN = 'llfix.app.br';
export const STORE_DOMAIN_MAP = {
  [EDSON_DOMAIN]: 1,
  [LLFIX_DOMAIN]: 3
};
export const EDSON_BACKEND_URL = 'https://apiforce.edsondosparafusos.app.br';
export const LLFIX_BACKEND_URL = 'https://apiforce.llfix.app.br';
export const SUPPORTED_REMOTE_BACKENDS = [EDSON_BACKEND_URL, LLFIX_BACKEND_URL];

// ── Helper Functions ─────────────────────────────────────────────────────────

export const normalizeHost = (value) => {
  const raw = String(value || '').split(',')[0].trim().toLowerCase();
  if (!raw) return '';
  const noProto = raw.replace(/^https?:\/\//, '');
  return noProto.replace(/:\d+$/, '');
};

export const normalizeBackendUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '').replace(/\/api\/?$/i, '');
};

export const matchesDomain = (host, domain) => {
  if (!host) return false;
  return host === domain || host.endsWith(`.${domain}`);
};

export const getRequestHost = (req) => {
  const forwarded = req.headers['x-forwarded-host'];
  const rawHost = Array.isArray(forwarded) ? forwarded[0] : forwarded || req.headers.host || '';
  return normalizeHost(rawHost);
};

export const getRequestedBackendUrl = (req) => {
  const hinted = normalizeBackendUrl(req.headers['x-backend-url']);
  if (hinted && SUPPORTED_REMOTE_BACKENDS.includes(hinted)) {
    return hinted;
  }
  const host = getRequestHost(req);
  if (matchesDomain(host, LLFIX_DOMAIN)) return LLFIX_BACKEND_URL;
  if (matchesDomain(host, EDSON_DOMAIN)) return EDSON_BACKEND_URL;
  return '';
};

export const resolveBackendUrlForRequest = (req) => {
  return getRequestedBackendUrl(req) || ;
};

export const resolveStoreIdFromHost = (host) => {
  if (matchesDomain(host, LLFIX_DOMAIN)) return STORE_DOMAIN_MAP[LLFIX_DOMAIN];
  if (matchesDomain(host, EDSON_DOMAIN)) return STORE_DOMAIN_MAP[EDSON_DOMAIN];
  return DEFAULT_STORE_ID;
};

export const formatStoreCode = (value) => String(value || DEFAULT_STORE_ID).trim().padStart(6, '0');

export const resolveIntegrationTokensForHost = (host) => {
  const normalized = normalizeHost(host);
  const tokens = [];
  if (APP_INTEGRATION_TOKEN) tokens.push(APP_INTEGRATION_TOKEN);
  if (matchesDomain(normalized, LLFIX_DOMAIN) && APP_INTEGRATION_TOKEN_LLFIX) {
    tokens.push(APP_INTEGRATION_TOKEN_LLFIX);
  }
  if (matchesDomain(normalized, EDSON_DOMAIN) && APP_INTEGRATION_TOKEN_EDSON) {
    tokens.push(APP_INTEGRATION_TOKEN_EDSON);
  }
  return tokens;
};

export const resolveIntegrationTokenForBackend = (backendUrl) => {
  const host = normalizeHost(backendUrl);
  if (matchesDomain(host, LLFIX_DOMAIN)) {
    return APP_INTEGRATION_TOKEN_LLFIX || APP_INTEGRATION_TOKEN || '';
  }
  if (matchesDomain(host, EDSON_DOMAIN)) {
    return APP_INTEGRATION_TOKEN_EDSON || APP_INTEGRATION_TOKEN || '';
  }
  return APP_INTEGRATION_TOKEN || '';
};

export const resolveExpectedStoreCodeForBackend = (backendUrl) => {
  const host = normalizeHost(backendUrl);
  if (matchesDomain(host, LLFIX_DOMAIN)) return '000003';
  if (matchesDomain(host, EDSON_DOMAIN)) return '000001';
  return '';
};

export const isStoreHostLocked = (host) => matchesDomain(host, EDSON_DOMAIN) || matchesDomain(host, LLFIX_DOMAIN);

export const getStoreIdFromRequest = (req) => resolveStoreIdFromHost(getRequestHost(req));

export const getStoreIdForProducts = (req) => {
  const host = getRequestHost(req);
  if (isStoreHostLocked(host)) return resolveStoreIdFromHost(host);
  const raw = String(req.query.loja || '').trim();
  if (raw) {
    const parsed = parseInt(raw, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return DEFAULT_STORE_ID;
};

// ── Google OAuth Client ──────────────────────────────────────────────────────

export const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// ── Gemini AI Setup ──────────────────────────────────────────────────────────

export let genAI = null;
if (GEMINI_API_KEY) {
  try {
    genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  } catch (e) {
    console.warn('[AI] Falha ao inicializar GoogleGenAI:', e.message);
  }
}

// ── Mailer Setup ─────────────────────────────────────────────────────────────

export const createMailer = (host, port, secure, user, pass) => {
  if (!host || !user || !pass) return null;
  try {
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      tls: { rejectUnauthorized: false }
    });
  } catch (e) {
    console.warn('[MAILER] Falha ao criar transporte SMTP:', e.message);
    return null;
  }
};

// Mailers por tenant
export const mailerEdson = createMailer(EDSON_SMTP_HOST, EDSON_SMTP_PORT, EDSON_SMTP_SECURE, EDSON_SMTP_USER, EDSON_SMTP_PASS);
export const mailerLlfix = createMailer(LLFIX_SMTP_HOST, LLFIX_SMTP_PORT, LLFIX_SMTP_SECURE, LLFIX_SMTP_USER, LLFIX_SMTP_PASS);
// Mailer global (fallback)
export const mailer = mailerEdson || mailerLlfix || createMailer(SMTP_ADDRESS, SMTP_PORT, SMTP_SECURE, SMTP_USERNAME, SMTP_PASSWORD);

if (mailerEdson) console.log('[MAILER] Transporte EDSON inicializado:', EDSON_SMTP_HOST);
if (mailerLlfix) console.log('[MAILER] Transporte LLFIX inicializado:', LLFIX_SMTP_HOST);
if (!mailerEdson && !mailerLlfix && mailer) console.log('[MAILER] Transporte global inicializado:', SMTP_ADDRESS);
if (!mailer) console.warn('[MAILER] Nenhum transporte SMTP configurado — modo simulado ativo.');

export const getMailerForRequest = (req) => {
  const host = getRequestHost(req);
  if (matchesDomain(host, EDSON_DOMAIN) && mailerEdson) {
    return { transport: mailerEdson, from: EDSON_SMTP_FROM };
  }
  if (matchesDomain(host, LLFIX_DOMAIN) && mailerLlfix) {
    return { transport: mailerLlfix, from: LLFIX_SMTP_FROM };
  }
  // Fallback global
  return mailer ? { transport: mailer, from: MAILER_FROM } : null;
};

// ── Remote API Helpers ───────────────────────────────────────────────────────

export const parseRemoteJson = async (response) => {
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { text, data };
};

export const extractRemoteMessage = (payload, fallbackText, status) => {
  const candidate =
    payload?.message ||
    payload?.detail ||
    payload?.error ||
    payload?.errors?.[0]?.message ||
    payload?.non_field_errors?.[0];
  const message = String(candidate || fallbackText || '').trim();
  if (message) return message;
  if (status === 401) return 'Credenciais inválidas.';
  if (status === 403) return 'Token de integração inválido.';
  if (status === 404) return 'Endpoint de autenticação não encontrado.';
  return 'Falha ao autenticar no ERP.';
};

export const buildRemoteAuthHeaders = (backendUrl, extraHeaders = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extraHeaders
  };
  const integrationToken = resolveIntegrationTokenForBackend(backendUrl);
  if (integrationToken) {
    headers['X-App-Token'] = integrationToken;
  }
  return headers;
};

export const requireRemoteBackendContext = (req, res) => {
  const backendUrl = getRequestedBackendUrl(req);
  if (!backendUrl) {
    if (res.headersSent) return null;
    res.status(400).json({ message: 'Configuração de loja inválida. Backend do ERP não identificado.' });
    return null;
  }
  const hintedAppToken = getHeaderValue(req.headers['x-app-token']);
  const integrationToken = resolveIntegrationTokenForBackend(backendUrl) || hintedAppToken;
  if (!integrationToken) {
    if (res.headersSent) return null;
    res.status(400).json({ message: 'Token de integração inválido ou não configurado para esta loja.' });
    return null;
  }
  return { backendUrl, integrationToken };
};

const fetchWithRetry = async (url, options, retries = 1, delayMs = 1000) => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      if (attempt === retries) throw error;
      console.warn(`[ERP_PROXY] Tentativa ${attempt + 1} falhou para ${url}: ${error.message}. Retry em ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
};

export const callRemoteJson = async ({ backendUrl, paths, method = 'GET', body = null, headers = {} }) => {
  if (typeof fetch !== 'function') {
    throw new Error('Fetch indisponível no backend local.');
  }

  let lastResult = null;
  let lastError = null;

  for (const path of paths) {
    const url = `${backendUrl}${path}`;
    try {
      console.log(`[ERP_PROXY] ${method} ${url}`);
      const response = await fetchWithRetry(url, {
        method,
        headers: buildRemoteAuthHeaders(backendUrl, headers),
        body: body === null ? undefined : JSON.stringify(body)
      });
      const parsed = await parseRemoteJson(response);
      lastResult = { url, response, ...parsed };
      if (response.status !== 404) {
        return lastResult;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastResult) return lastResult;
  throw lastError || new Error('API do ERP indisponível.');
};

export const fetchRemoteProfile = async (backendUrl, bearerToken) => {
  const endpoints = ['/api/me', '/api/auth/me'];
  for (const path of endpoints) {
    const url = `${backendUrl}${path}`;
    console.log(`[ERP_PROXY] GET ${url}`);
    const response = await fetch(url, {
      method: 'GET',
      headers: buildRemoteAuthHeaders(backendUrl, {
        Authorization: `Bearer ${bearerToken}`
      })
    });
    const parsed = await parseRemoteJson(response);
    if (response.ok) {
      return { url, response, ...parsed };
    }
    if (response.status !== 404) {
      return { url, response, ...parsed };
    }
  }
  return null;
};

export const extractProfileUser = (payload) => payload?.user || payload || {};

export const extractProfileStoreCode = (payload) => {
  const profile = extractProfileUser(payload);
  return String(
    profile.loja_codigo ||
    profile.store_code ||
    profile.lojaCodigo ||
    profile.codigo_loja ||
    profile.loja ||
    ''
  ).trim();
};

export const validateProfileAgainstBackend = (backendUrl, payload) => {
  const expectedStoreCode = resolveExpectedStoreCodeForBackend(backendUrl);
  if (!expectedStoreCode) {
    return { valid: true };
  }
  const returnedStoreCode = extractProfileStoreCode(payload);
  if (!returnedStoreCode) {
    return { valid: false, message: 'Usuário autenticado sem loja vinculada retornada pelo ERP.' };
  }
  if (formatStoreCode(returnedStoreCode) !== expectedStoreCode) {
    return { valid: false, message: 'Usuário sem acesso à loja selecionada.' };
  }
  return { valid: true };
};

export const resolveAuthenticatedUserPayload = async (backendUrl, accessToken, fallbackPayload = null) => {
  const profileResponse = await fetchRemoteProfile(backendUrl, accessToken);
  if (profileResponse?.response?.ok) {
    const storeValidation = validateProfileAgainstBackend(backendUrl, profileResponse.data);
    if (!storeValidation.valid) {
      return { ok: false, status: 403, message: storeValidation.message };
    }
    return { ok: true, user: extractProfileUser(profileResponse.data) };
  }

  const fallbackUser = extractProfileUser(fallbackPayload);
  if (fallbackUser && Object.keys(fallbackUser).length > 0) {
    const storeValidation = validateProfileAgainstBackend(backendUrl, fallbackUser);
    if (!storeValidation.valid) {
      return { ok: false, status: 403, message: storeValidation.message };
    }
    return { ok: true, user: fallbackUser };
  }

  const message = profileResponse
    ? extractRemoteMessage(profileResponse.data, profileResponse.text, profileResponse.response.status)
    : 'Não foi possível confirmar o usuário autenticado no ERP.';
  return { ok: false, status: 502, message };
};

// ── Auth Helpers ─────────────────────────────────────────────────────────────

export const getHeaderValue = (value) => {
  if (!value) return '';
  return Array.isArray(value) ? String(value[0] || '').trim() : String(value).trim();
};

export const parseAuthHeader = (value) => {
  const raw = getHeaderValue(value);
  if (!raw) return { token: '', invalid: false };
  const parts = raw.split(/\s+/);
  if (parts.length === 1) return { token: parts[0], invalid: false };
  if (parts.length === 2 && /^Bearer$/i.test(parts[0])) return { token: parts[1], invalid: false };
  return { token: '', invalid: true };
};

export const isIntegrationTokenForRequest = (req, token) => {
  if (!token) return false;
  if (token === MASTER_KEY) return true;
  const allowed = resolveIntegrationTokensForHost(getRequestHost(req));
  if (allowed.length === 0) return false;
  return allowed.includes(token);
};

export const getRemoteUserFromRequest = (req) => req.remoteUser || null;

export const getRemotePermissions = (req) => {
  const user = getRemoteUserFromRequest(req);
  return user?.permissions || {};
};

export const hasRemotePermission = (req, permissionKey) => {
  const user = getRemoteUserFromRequest(req);
  if (!user || !permissionKey) return false;
  if (user[permissionKey] === true) return true;
  return getRemotePermissions(req)[permissionKey] === true;
};

export const ensureRemotePermission = (req, res, permissionKey, message) => {
  if (hasRemotePermission(req, permissionKey)) return true;
  res.status(403).json({ message: message || 'Usuário sem permissão para esta ação.' });
  return false;
};

export const resolveSellerIdForRequest = async (req) => {
    if (req.sellerId !== undefined) return req.sellerId;
    if (req.remoteUser) {
        const remoteSellerId = String(
            req.remoteUser.vendor_code ||
            req.remoteUser.seller_id ||
            req.remoteUser.vendedor_codigo ||
            req.remoteUser.codigo_vendedor ||
            ''
        ).trim();
        req.sellerId = remoteSellerId || null;
        return req.sellerId;
    }
    req.sellerId = null;
    return null;
};

export const isPrivilegedUser = (userId) => userId === 'master-admin' || userId === 'integration-token';
