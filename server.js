
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

import { db, isPostgres, initDb } from './server/db.js';
import {
  MASTER_KEY,
  APP_INTEGRATION_TOKEN,
  APP_INTEGRATION_TOKEN_EDSON,
  APP_INTEGRATION_TOKEN_LLFIX,
  getRequestHost,
  matchesDomain,
  requireRemoteBackendContext,
  callRemoteJson,
  extractRemoteMessage,
  fetchRemoteProfile,
  extractProfileUser,
  extractProfileStoreCode,
  validateProfileAgainstBackend,
  resolveAuthenticatedUserPayload,
  getHeaderValue,
  parseAuthHeader,
  isIntegrationTokenForRequest,
  resolveIntegrationTokensForHost,
  buildRemoteAuthHeaders,
  getMailerForRequest,
  mailer,
  MAILER_FROM,
  genAI,
  GEMINI_API_KEY,
} from './server/config.js';

import { createAuthRoutes } from './server/routes/auth.js';
import { createProductRoutes } from './server/routes/products.js';
import { createCustomerRoutes } from './server/routes/customers.js';
import { createOrderRoutes } from './server/routes/orders.js';
import { createStoreRoutes } from './server/routes/store.js';
import { createAIRoutes } from './server/routes/ai.js';
import { createPDFRoutes } from './server/routes/pdf.js';
import { createMiscRoutes, createERPProxy } from './server/routes/misc.js';

const app = express();
const PORT = process.env.PORT || 8080;

<<<<<<< HEAD
=======
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'SEU_CLIENT_ID_AQUI.apps.googleusercontent.com';
const DB_PATH = process.env.DB_PATH || './database.sqlite';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
// E-mail/SMTP — configuração global (fallback)
const SMTP_ADDRESS  = process.env.SMTP_ADDRESS || process.env.SMTP_HOST || '';
const SMTP_PORT     = parseInt(process.env.SMTP_PORT || '587');
const SMTP_SECURE   = process.env.SMTP_SECURE === 'true' || parseInt(process.env.SMTP_PORT || '587') === 465;
const SMTP_USERNAME = process.env.SMTP_USERNAME || process.env.SMTP_USER || '';
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '';
const MAILER_FROM   = process.env.MAILER_SENDER_EMAIL || process.env.SMTP_FROM || 'SalesForce <no-reply@salesforce.pro>';

// E-mail/SMTP — por tenant (prioridade sobre o global)
const EDSON_SMTP_HOST   = process.env.EDSON_SMTP_HOST   || SMTP_ADDRESS;
const EDSON_SMTP_PORT   = parseInt(process.env.EDSON_SMTP_PORT   || String(SMTP_PORT));
const EDSON_SMTP_SECURE = process.env.EDSON_SMTP_SECURE === 'true' || EDSON_SMTP_PORT === 465;
const EDSON_SMTP_USER   = process.env.EDSON_SMTP_USER   || SMTP_USERNAME;
const EDSON_SMTP_PASS   = process.env.EDSON_SMTP_PASS   || SMTP_PASSWORD;
const EDSON_SMTP_FROM   = process.env.EDSON_SMTP_FROM   || MAILER_FROM;

const LLFIX_SMTP_HOST   = process.env.LLFIX_SMTP_HOST   || SMTP_ADDRESS;
const LLFIX_SMTP_PORT   = parseInt(process.env.LLFIX_SMTP_PORT   || String(SMTP_PORT));
const LLFIX_SMTP_SECURE = process.env.LLFIX_SMTP_SECURE === 'true' || LLFIX_SMTP_PORT === 465;
const LLFIX_SMTP_USER   = process.env.LLFIX_SMTP_USER   || SMTP_USERNAME;
const LLFIX_SMTP_PASS   = process.env.LLFIX_SMTP_PASS   || SMTP_PASSWORD;
const LLFIX_SMTP_FROM   = process.env.LLFIX_SMTP_FROM   || MAILER_FROM;

const DEFAULT_STORE_ID = 1;
const EDSON_DOMAIN = 'edsondosparafusos.app.br';
const LLFIX_DOMAIN = 'llfix.app.br';
const STORE_DOMAIN_MAP = {
  [EDSON_DOMAIN]: 1,
  [LLFIX_DOMAIN]: 3
};
const EDSON_BACKEND_URL = 'https://apiforce.edsondosparafusos.app.br';
const LLFIX_BACKEND_URL = 'https://apiforce.llfix.app.br';
const SUPPORTED_REMOTE_BACKENDS = [EDSON_BACKEND_URL, LLFIX_BACKEND_URL];
const DEV_TENANT = (process.env.TENANT || '').toUpperCase().trim();

const normalizeHost = (value) => {
  const raw = String(value || '').split(',')[0].trim().toLowerCase();
  if (!raw) return '';
  const noProto = raw.replace(/^https?:\/\//, '');
  return noProto.replace(/:\d+$/, '');
};

const normalizeBackendUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '').replace(/\/api\/?$/i, '');
};

const matchesDomain = (host, domain) => {
  if (!host) return false;
  return host === domain || host.endsWith(`.${domain}`);
};

const getRequestHost = (req) => {
  const forwarded = req.headers['x-forwarded-host'];
  const rawHost = Array.isArray(forwarded) ? forwarded[0] : forwarded || req.headers.host || '';
  return normalizeHost(rawHost);
};

const getRequestedBackendUrl = (req) => {
  const hinted = normalizeBackendUrl(req.headers['x-backend-url']);
  if (hinted && SUPPORTED_REMOTE_BACKENDS.includes(hinted)) {
    return hinted;
  }
  const host = getRequestHost(req);
  if (matchesDomain(host, LLFIX_DOMAIN)) return LLFIX_BACKEND_URL;
  if (matchesDomain(host, EDSON_DOMAIN)) return EDSON_BACKEND_URL;
  return '';
};

const resolveStoreIdFromHost = (host) => {
  if (matchesDomain(host, LLFIX_DOMAIN)) return STORE_DOMAIN_MAP[LLFIX_DOMAIN];
  if (matchesDomain(host, EDSON_DOMAIN)) return STORE_DOMAIN_MAP[EDSON_DOMAIN];
  if (DEV_TENANT === EDSON) return 1;
  if (DEV_TENANT === LLFIX) return 3;
  return DEFAULT_STORE_ID;
};
const formatStoreCode = (value) => String(value || DEFAULT_STORE_ID).trim().padStart(6, '0');
const resolveIntegrationTokensForHost = (host) => {
  const normalized = normalizeHost(host);
  const tokens = [];
  if (APP_INTEGRATION_TOKEN) tokens.push(APP_INTEGRATION_TOKEN);
  if (matchesDomain(normalized, LLFIX_DOMAIN) && APP_INTEGRATION_TOKEN_LLFIX) {
    tokens.push(APP_INTEGRATION_TOKEN_LLFIX);
  }
  if (matchesDomain(normalized, EDSON_DOMAIN) && APP_INTEGRATION_TOKEN_EDSON) {
    tokens.push(APP_INTEGRATION_TOKEN_EDSON);
  }
  if (tokens.length === 0 && DEV_TENANT) {
    if (DEV_TENANT === EDSON && APP_INTEGRATION_TOKEN_EDSON) tokens.push(APP_INTEGRATION_TOKEN_EDSON);
    if (DEV_TENANT === LLFIX && APP_INTEGRATION_TOKEN_LLFIX) tokens.push(APP_INTEGRATION_TOKEN_LLFIX);
    if (tokens.length === 0 && APP_INTEGRATION_TOKEN) tokens.push(APP_INTEGRATION_TOKEN);
  }
  return tokens;
};

const resolveIntegrationTokenForBackend = (backendUrl) => {
  const host = normalizeHost(backendUrl);
  if (matchesDomain(host, LLFIX_DOMAIN)) {
    return APP_INTEGRATION_TOKEN_LLFIX || APP_INTEGRATION_TOKEN || '';
  }
  if (matchesDomain(host, EDSON_DOMAIN)) {
    return APP_INTEGRATION_TOKEN_EDSON || APP_INTEGRATION_TOKEN || '';
  }
  return APP_INTEGRATION_TOKEN || '';
};

const resolveExpectedStoreCodeForBackend = (backendUrl) => {
  const host = normalizeHost(backendUrl);
  if (matchesDomain(host, LLFIX_DOMAIN)) return '000003';
  if (matchesDomain(host, EDSON_DOMAIN)) return '000001';
  return '';
};
const isStoreHostLocked = (host) => matchesDomain(host, EDSON_DOMAIN) || matchesDomain(host, LLFIX_DOMAIN);
const getStoreIdFromRequest = (req) => resolveStoreIdFromHost(getRequestHost(req));
const getStoreIdForProducts = (req) => {
  const host = getRequestHost(req);
  if (isStoreHostLocked(host)) return resolveStoreIdFromHost(host);
  const raw = String(req.query.loja || '').trim();
  if (raw) {
    const parsed = parseInt(raw, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return DEFAULT_STORE_ID;
};

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
let genAI = null;
if (GEMINI_API_KEY) {
  try {
    genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  } catch (e) {
    console.warn('[AI] Falha ao inicializar GoogleGenAI:', e.message);
  }
}

// Cria um transporte nodemailer para um conjunto de credenciais SMTP
const createMailer = (host, port, secure, user, pass) => {
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
const mailerEdson = createMailer(EDSON_SMTP_HOST, EDSON_SMTP_PORT, EDSON_SMTP_SECURE, EDSON_SMTP_USER, EDSON_SMTP_PASS);
const mailerLlfix = createMailer(LLFIX_SMTP_HOST, LLFIX_SMTP_PORT, LLFIX_SMTP_SECURE, LLFIX_SMTP_USER, LLFIX_SMTP_PASS);
// Mailer global (fallback)
const mailer      = mailerEdson || mailerLlfix || createMailer(SMTP_ADDRESS, SMTP_PORT, SMTP_SECURE, SMTP_USERNAME, SMTP_PASSWORD);

const getRemoteUserFromRequest = (req) => req.remoteUser || null;

const getRemotePermissions = (req) => {
  const user = getRemoteUserFromRequest(req);
  return user?.permissions || {};
};

const hasRemotePermission = (req, permissionKey) => {
  const user = getRemoteUserFromRequest(req);
  if (!user || !permissionKey) return false;
  if (user[permissionKey] === true) return true;
  return getRemotePermissions(req)[permissionKey] === true;
};

const ensureRemotePermission = (req, res, permissionKey, message) => {
  if (hasRemotePermission(req, permissionKey)) return true;
  res.status(403).json({ message: message || 'Usuário sem permissão para esta ação.' });
  return false;
};

if (mailerEdson) console.log('[MAILER] Transporte EDSON inicializado:', EDSON_SMTP_HOST);
if (mailerLlfix) console.log('[MAILER] Transporte LLFIX inicializado:', LLFIX_SMTP_HOST);
if (!mailerEdson && !mailerLlfix && mailer) console.log('[MAILER] Transporte global inicializado:', SMTP_ADDRESS);
if (!mailer) console.warn('[MAILER] Nenhum transporte SMTP configurado — modo simulado ativo.');

// Retorna o mailer e o from corretos para o domínio da requisição
const getMailerForRequest = (req) => {
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

const parseRemoteJson = async (response) => {
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { text, data };
};

const extractRemoteMessage = (payload, fallbackText, status) => {
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

const buildRemoteAuthHeaders = (backendUrl, extraHeaders = {}) => {
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

const requireRemoteBackendContext = (req, res) => {
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

const callRemoteJson = async ({ backendUrl, paths, method = 'GET', body = null, headers = {} }) => {
  if (typeof fetch !== 'function') {
    throw new Error('Fetch indisponível no backend local.');
  }

  let lastResult = null;
  let lastError = null;

  for (const path of paths) {
    const url = `${backendUrl}${path}`;
    try {
      console.log(`[ERP_PROXY] ${method} ${url}`);
      const response = await fetch(url, {
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

const fetchRemoteProfile = async (backendUrl, bearerToken) => {
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

const extractProfileUser = (payload) => payload?.user || payload || {};

const extractProfileStoreCode = (payload) => {
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

const validateProfileAgainstBackend = (backendUrl, payload) => {
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

const resolveAuthenticatedUserPayload = async (backendUrl, accessToken, fallbackPayload = null) => {
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

// Middleware
>>>>>>> ffd1865 (Reversão build)
app.use(cors());
app.use(bodyParser.json());

app.use((req, res, next) => {
    console.log(`[SERVER] ${req.method} ${req.url}`);
    next();
});

<<<<<<< HEAD
=======
// --- CAMADA DE ABSTRAÇÃO DE BANCO DE DADOS (SQLite ou PostgreSQL) ---
const isPostgres = !!process.env.DATABASE_URL;

class DatabaseAdapter {
    constructor() {
        if (isPostgres) {
            console.log('Conectando ao PostgreSQL...');
            this.pool = new pg.Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: { rejectUnauthorized: false } // Necessário para muitos provedores cloud
            });
        } else {
            console.log('Conectando ao SQLite local...');
            this.sqlite = new sqlite3.Database(DB_PATH);
        }
    }

    // Helper para converter query de ? (SQLite) para $1, $2 (Postgres)
    prepareQuery(sql) {
        if (!isPostgres) return sql;
        let i = 1;
        return sql.replace(/\?/g, () => `$${i++}`);
    }

    query(sql, params = []) {
        return new Promise((resolve, reject) => {
            if (isPostgres) {
                this.pool.query(this.prepareQuery(sql), params, (err, res) => {
                    if (err) return reject(err);
                    resolve(res.rows);
                });
            } else {
                this.sqlite.all(sql, params, (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows);
                });
            }
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            if (isPostgres) {
                this.pool.query(this.prepareQuery(sql), params, (err, res) => {
                    if (err) return reject(err);
                    resolve(res.rows[0]);
                });
            } else {
                this.sqlite.get(sql, params, (err, row) => {
                    if (err) return reject(err);
                    resolve(row);
                });
            }
        });
    }

    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            if (isPostgres) {
                this.pool.query(this.prepareQuery(sql), params, (err, res) => {
                    if (err) return reject(err);
                    // No PG, retornamos rowCount ou o insertId se usarmos RETURNING
                    resolve({ lastID: res.rows[0]?.id || 0, changes: res.rowCount });
                });
            } else {
                this.sqlite.run(sql, params, function(err) {
                    if (err) return reject(err);
                    resolve({ lastID: this.lastID, changes: this.changes });
                });
            }
        });
    }
}

const db = new DatabaseAdapter();

const isPrivilegedUser = (userId) => userId === 'master-admin' || userId === 'integration-token';

const resolveSellerIdForRequest = async (req) => {
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

const ensureStoreInfoRow = async (storeId) => {
    try {
        const existing = await db.get("SELECT id FROM store_info WHERE id = ?", [storeId]);
        if (!existing) {
            await db.run(
                `INSERT INTO store_info (id, legal_name, trade_name, document, email, phone, street, number, neighborhood, city, state, zip, updated_at) VALUES (?, '', '', '', '', '', '', '', '', '', '', '', ?)`,
                [storeId, new Date().toISOString()]
            );
        }
    } catch (e) {}
};

async function initDb() {
    try {
        // Tabela de Usuários
        const idType = isPostgres ? 'SERIAL' : 'INTEGER';
        const autoInc = isPostgres ? '' : 'AUTOINCREMENT';
        
        await db.run(`CREATE TABLE IF NOT EXISTS users (
            id ${idType} PRIMARY KEY ${autoInc},
            name TEXT,
            email TEXT UNIQUE,
            password TEXT,
            created_at TEXT,
            seller_id TEXT 
        )`);

        // Compatibilidade legada: manter seller_id sem usar a tabela para autenticação.
        try {
            await db.run("ALTER TABLE users ADD COLUMN seller_id TEXT");
            console.log("Coluna seller_id adicionada em users.");
        } catch (e) {}

        // Tabela de Produtos
        await db.run(`CREATE TABLE IF NOT EXISTS products (
            id ${idType} PRIMARY KEY ${autoInc},
            plu TEXT UNIQUE,
            name TEXT,
            description TEXT,
            price REAL,
            stock INTEGER,
            category TEXT,
            unit TEXT,
            image_url TEXT,
            store_id INTEGER
        )`);
        try { await db.run("ALTER TABLE products ADD COLUMN store_id INTEGER"); } catch (e) {}

        // Tabela de Clientes
        await db.run(`CREATE TABLE IF NOT EXISTS customers (
            id ${idType} PRIMARY KEY ${autoInc},
            name TEXT,
            fantasy_name TEXT,
            document TEXT,
            address TEXT,
            address_number TEXT,
            neighborhood TEXT,
            phone TEXT,
            city TEXT,
            state TEXT,
            zip TEXT,
            status TEXT,
            origin TEXT,
            seller_id TEXT
        )`);

        // Migração: adicionar seller_id se não existir
        try {
            await db.run("ALTER TABLE customers ADD COLUMN seller_id TEXT");
        } catch (e) {}
        try { await db.run("ALTER TABLE customers ADD COLUMN address_number TEXT"); } catch (e) {}
        try { await db.run("ALTER TABLE customers ADD COLUMN neighborhood TEXT"); } catch (e) {}
        try { await db.run("ALTER TABLE customers ADD COLUMN state TEXT"); } catch (e) {}
        try { await db.run("ALTER TABLE customers ADD COLUMN zip TEXT"); } catch (e) {}
        try { await db.run("ALTER TABLE customers ADD COLUMN status TEXT"); } catch (e) {}
        try { await db.run("ALTER TABLE customers ADD COLUMN origin TEXT"); } catch (e) {}

        // Tabela de Pedidos
        await db.run(`CREATE TABLE IF NOT EXISTS orders (
            id ${idType} PRIMARY KEY ${autoInc},
            customer_id TEXT, 
            customer_type TEXT,
            total REAL,
            status TEXT,
            created_at TEXT,
            seller_id TEXT,
            seller_name TEXT,
            notes TEXT,
            payment_plan_code TEXT,
            payment_plan_description TEXT,
            payment_installments INTEGER,
            payment_days_between INTEGER,
            payment_min_value REAL,
            payment_method TEXT,
            shipping_method TEXT
        )`);

        // Migração: adicionar campos de vendedor/observações em orders (caso já exista)
        try { await db.run("ALTER TABLE orders ADD COLUMN seller_id TEXT"); } catch (e) {}
        try { await db.run("ALTER TABLE orders ADD COLUMN seller_name TEXT"); } catch (e) {}
        try { await db.run("ALTER TABLE orders ADD COLUMN notes TEXT"); } catch (e) {}
        try { await db.run("ALTER TABLE orders ADD COLUMN customer_type TEXT"); } catch (e) {}
        try { await db.run("ALTER TABLE orders ADD COLUMN payment_plan_code TEXT"); } catch (e) {}
        try { await db.run("ALTER TABLE orders ADD COLUMN payment_plan_description TEXT"); } catch (e) {}
        try { await db.run("ALTER TABLE orders ADD COLUMN payment_installments INTEGER"); } catch (e) {}
        try { await db.run("ALTER TABLE orders ADD COLUMN payment_days_between INTEGER"); } catch (e) {}
        try { await db.run("ALTER TABLE orders ADD COLUMN payment_min_value REAL"); } catch (e) {}
        try { await db.run("ALTER TABLE orders ADD COLUMN payment_method TEXT"); } catch (e) {}
        try { await db.run("ALTER TABLE orders ADD COLUMN shipping_method TEXT"); } catch (e) {}

        // Tabela de Itens do Pedido
        await db.run(`CREATE TABLE IF NOT EXISTS order_items (
            id ${idType} PRIMARY KEY ${autoInc},
            order_id INTEGER,
            product_code TEXT,
            quantity REAL,
            unit_price REAL,
            FOREIGN KEY(order_id) REFERENCES orders(id)
        )`);

        // Tabelas de Planos de Pagamento
        await db.run(`CREATE TABLE IF NOT EXISTS payment_plans (
            code TEXT PRIMARY KEY,
            description TEXT,
            installments INTEGER,
            days_between_installments INTEGER,
            min_value REAL
        )`);

        await db.run(`CREATE TABLE IF NOT EXISTS customer_payment_plans (
            id ${idType} PRIMARY KEY ${autoInc},
            customer_id TEXT,
            plan_code TEXT,
            FOREIGN KEY(plan_code) REFERENCES payment_plans(code)
        )`);

        // Seed Inicial
        const prodCount = await db.get("SELECT count(*) as count FROM products");
        if (prodCount && parseInt(prodCount.count) === 0) {
            console.log("Populando produtos iniciais...");
            const insertProd = `INSERT INTO products (plu, name, description, price, stock, category, unit, store_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
            await db.run(insertProd, ["0002899", "PARAF FRANCES 1/4X3 ZB", "Parafuso Francês 1/4 x 3 Zincado Branco", 65.91, 100, "Fixadores", "CTO", DEFAULT_STORE_ID]);
            await db.run(insertProd, ["0000001", "Martelo Unha", "Martelo de aço forjado cabo de madeira", 45.50, 20, "Ferramentas", "UN", DEFAULT_STORE_ID]);
            await db.run(insertProd, ["0000002", "Chave Philips", "Chave Philips 3/16 x 4", 12.90, 50, "Ferramentas", "UN", DEFAULT_STORE_ID]);
        }

        // Garante existência do Cliente Balcão (ID 0)
        const custCount = await db.get("SELECT count(*) as count FROM customers");
        if (custCount && parseInt(custCount.count) === 0) {
             const insertCust = `INSERT INTO customers (id, name, fantasy_name, document) VALUES (?, ?, ?, ?)`;
             try {
                if (isPostgres) {
                    await db.run(`INSERT INTO customers (name, fantasy_name, document) VALUES (?, ?, ?)`, ["Consumidor Final", "Venda Balcão", "000.000.000-00"]);
                } else {
                    await db.run(insertCust, [0, "Consumidor Final", "Venda Balcão", "000.000.000-00"]);
                }
                console.log("Cliente Consumidor Final criado.");
             } catch(e) { console.log("Info: Cliente padrão não criado"); }
        }

        // Normaliza status de clientes existentes
        try { await db.run("UPDATE customers SET status = 'NORMAL' WHERE status IS NULL"); } catch (e) {}

        // Seed de Plano de Pagamento padrão
        const planCount = await db.get("SELECT count(*) as count FROM payment_plans");
        if (planCount && parseInt(planCount.count) === 0) {
            await db.run(
                "INSERT INTO payment_plans (code, description, installments, days_between_installments, min_value) VALUES (?, ?, ?, ?, ?)",
                ["01", "A VISTA", 1, 0, 0]
            );
        }

        // Se não houver vínculos, cria padrão para clientes existentes
        const planLinkCount = await db.get("SELECT count(*) as count FROM customer_payment_plans");
        if (planLinkCount && parseInt(planLinkCount.count) === 0) {
            const existingCustomers = await db.query("SELECT id, status FROM customers");
            for (const cust of existingCustomers) {
                if (cust.status === 'TEMPORARIO') continue;
                await db.run(
                    "INSERT INTO customer_payment_plans (customer_id, plan_code) VALUES (?, ?)",
                    [String(cust.id), "01"]
                );
            }
        }

        // Tabela de Dados da Loja (Store Info)
        await db.run(`CREATE TABLE IF NOT EXISTS store_info (
            id INTEGER PRIMARY KEY ${autoInc},
            legal_name TEXT,
            trade_name TEXT,
            document TEXT,
            state_registration TEXT,
            municipal_registration TEXT,
            email TEXT,
            phone TEXT,
            street TEXT,
            number TEXT,
            neighborhood TEXT,
            city TEXT,
            state TEXT,
            zip TEXT,
            complement TEXT,
            logo_url TEXT,
            updated_at TEXT
        )`);
        try {
            await db.run("ALTER TABLE store_info ADD COLUMN logo_url TEXT");
        } catch (e) {}

        // Garante registros por loja (00001 e 00003)
        try {
            for (const storeId of [1, 3]) {
                await ensureStoreInfoRow(storeId);
            }
        } catch (e) {}

    } catch (e) {
        console.error("Erro na migração de DB:", e);
    }
}

initDb();

const normalizeDocument = (value) => String(value || '').replace(/\D/g, '');

const isValidCnpj = (value) => {
    const cnpj = normalizeDocument(value);
    if (cnpj.length !== 14) return false;
    if (/^(\d)\1{13}$/.test(cnpj)) return false;

    const calcDigit = (base) => {
        let sum = 0;
        let pos = base.length - 7;
        for (let i = 0; i < base.length; i++) {
            sum += parseInt(base.charAt(i), 10) * pos--;
            if (pos < 2) pos = 9;
        }
        const mod = sum % 11;
        return mod < 2 ? 0 : 11 - mod;
    };

    const base12 = cnpj.substring(0, 12);
    const digit13 = calcDigit(base12);
    if (digit13 !== parseInt(cnpj.charAt(12), 10)) return false;

    const base13 = cnpj.substring(0, 13);
    const digit14 = calcDigit(base13);
    return digit14 === parseInt(cnpj.charAt(13), 10);
};

const mapCustomerPayload = (c) => ({
    cliente_codigo: c.id,
    cliente_razao_social: c.name,
    cliente_nome_fantasia: c.fantasy_name,
    cliente_cnpj_cpf: c.document,
    cliente_endereco: c.address,
    cliente_numero: c.address_number || '',
    cliente_bairro: c.neighborhood || '',
    cliente_cidade: c.city,
    cliente_uf: c.state || '',
    cliente_cep: c.zip || '',
    cliente_telefone1: c.phone || '',
    cliente_email: '',
    vendedor_nome: '',
    vendedor_codigo: c.seller_id || '',
    cliente_status: c.status || 'NORMAL',
    cliente_tipo: c.status === 'TEMPORARIO' ? 'TEMPORARIO' : 'NORMAL',
    cliente_origem: c.origin || ''
});

const buildSefazMock = (cnpj) => {
    const normalized = normalizeDocument(cnpj);
    return {
        razao_social: `Empresa ${normalized}`,
        nome_fantasia: `Fantasia ${normalized.slice(-4)}`,
        situacao_cadastral: 'ATIVA',
        endereco: 'Rua das Flores, 100',
        uf: 'SP',
        municipio: 'Sao Paulo'
    };
};

// --- ROTAS DE AUTENTICAÇÃO ---
// Healthcheck simples para orquestradores (Portainer/Swarm)
app.get('/health', async (req, res) => {
    try {
        const row = await db.get(isPostgres ? 'SELECT 1 as ok' : 'SELECT 1 as ok');
        if (row && (row.ok === 1 || row.ok === '1')) {
            return res.status(200).json({ status: 'ok', db: isPostgres ? 'postgres' : 'sqlite' });
        }
        return res.status(200).json({ status: 'ok', db: isPostgres ? 'postgres' : 'sqlite' });
    } catch (e) {
        return res.status(500).json({ status: 'error', error: e.message });
    }
});


app.get('/api/config/resolve', (req, res) => {
  const host = getRequestHost(req);
  const isEdson = matchesDomain(host, 'edsondosparafusos.app.br');
  const isLlfix = matchesDomain(host, 'llfix.app.br');

  if (!isEdson && !isLlfix && !DEV_TENANT) {
    const label = host || '(desconhecido)';
    return res.status(200).json({
      tenant: null,
      hostname: host,
      domain: '',
      storeCode: '',
      storeName: '',
      backendUrl: '',
      tokenConfigured: false,
      mapped: false,
      error: 'Dominio nao configurado: ' + label + '.'
    });
  }

  const tenant = isEdson ? 'EDSON' : isLlfix ? 'LLFIX' : DEV_TENANT;
  const domain = isEdson ? 'edsondosparafusos.app.br' : isLlfix ? 'llfix.app.br' : (DEV_TENANT === 'EDSON' ? 'edsondosparafusos.app.br' : 'llfix.app.br');
  const storeCode = isEdson ? '000001' : isLlfix ? '000003' : (DEV_TENANT === 'EDSON' ? '000001' : '000003');
  const storeName = isEdson ? 'EDSON DOS PARAFUSOS' : isLlfix ? 'LL FIX DISTRIBUIDORA - EI' : (DEV_TENANT === 'EDSON' ? 'EDSON DOS PARAFUSOS' : 'LL FIX DISTRIBUIDORA - EI');
  const backendUrl = isEdson ? EDSON_BACKEND_URL : isLlfix ? LLFIX_BACKEND_URL : (DEV_TENANT === 'EDSON' ? EDSON_BACKEND_URL : LLFIX_BACKEND_URL);
  const remoteToken = isEdson ? APP_INTEGRATION_TOKEN_EDSON : isLlfix ? APP_INTEGRATION_TOKEN_LLFIX : APP_INTEGRATION_TOKEN;
  const tokenConfigured = !!(remoteToken && remoteToken.trim().length > 0);

  return res.status(200).json({
    tenant,
    hostname: host,
    domain,
    storeCode,
    storeName,
    backendUrl,
    tokenConfigured,
    mapped: true,
  });
});

app.get('/api/integration/validate', async (req, res) => {
  try {
      const context = requireRemoteBackendContext(req, res);
      if (!context) return;

      const remoteValidation = await callRemoteJson({
          backendUrl: context.backendUrl,
          paths: ['/api/integration/validate'],
          method: 'GET'
      });

      if (!remoteValidation.response.ok) {
          const message = extractRemoteMessage(remoteValidation.data, remoteValidation.text, remoteValidation.response.status);
          return res.status(remoteValidation.response.status).json({ message });
      }

      return res.status(200).json({
          ...(remoteValidation.data || {}),
          validated_via: 'local-server',
          backend_url: context.backendUrl
      });
  } catch (e) {
      console.error('[AUTH_PROXY] Falha ao validar integração remota:', e.message);
      if (res.headersSent) return;
    return res.status(503).json({ message: 'API do ERP indisponível' });
  }
});

app.post('/api/register', async (req, res) => {
  return res.status(403).json({ message: 'Cadastro local desabilitado. Use o ERP oficial.' });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
      const context = requireRemoteBackendContext(req, res);
      if (!context) return;

      const remoteLogin = await callRemoteJson({
          backendUrl: context.backendUrl,
          paths: ['/auth/login', '/api/login'],
          method: 'POST',
          body: { username, password }
      });

      if (!remoteLogin.response.ok) {
          const message = extractRemoteMessage(remoteLogin.data, remoteLogin.text, remoteLogin.response.status);
          return res.status(remoteLogin.response.status).json({ message });
      }

      const accessToken =
          remoteLogin.data?.token?.access_token ||
          remoteLogin.data?.access_token ||
          remoteLogin.data?.token;

      if (!accessToken) {
          return res.status(502).json({ message: 'ERP respondeu sem token de autenticação.' });
      }

      const authenticatedUser = await resolveAuthenticatedUserPayload(
          context.backendUrl,
          accessToken,
          remoteLogin.data?.user || remoteLogin.data
      );
      if (!authenticatedUser.ok) {
          return res.status(authenticatedUser.status).json({ message: authenticatedUser.message });
      }

      const remoteUser = authenticatedUser.user;
      return res.status(200).json({
          token: {
              access_token: accessToken,
              token_type: remoteLogin.data?.token?.token_type || remoteLogin.data?.token_type || 'bearer',
              expires_in: remoteLogin.data?.token?.expires_in || remoteLogin.data?.expires_in || 3600
          },
          user: {
              ...remoteUser,
              vendor_name: remoteUser.vendor_name || remoteUser.name || remoteUser.nome || remoteUser.username || String(username || '').trim(),
              vendor_code: remoteUser.vendor_code || remoteUser.seller_id || remoteUser.vendedor_codigo || '',
              loja_codigo: remoteUser.loja_codigo || remoteUser.store_code || remoteUser.lojaCodigo || remoteUser.codigo_loja || ''
          }
      });
  } catch (e) {
      console.error('[AUTH_PROXY] Falha no login remoto:', e.message);
      res.status(503).json({ message: 'API do ERP indisponível.' });
  }
});

app.post('/api/auth/send-code', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email é obrigatório.' });

    try {
        const context = requireRemoteBackendContext(req, res);
        if (!context) return;

        const remoteCodeRequest = await callRemoteJson({
            backendUrl: context.backendUrl,
            paths: ['/auth/send-code', '/api/auth/send-code'],
            method: 'POST',
            body: { email }
        });

        if (remoteCodeRequest.response.status === 404) {
            return res.status(404).json({ message: 'Este ambiente não suporta login por código de acesso.' });
        }

        const message = extractRemoteMessage(
            remoteCodeRequest.data,
            remoteCodeRequest.text,
            remoteCodeRequest.response.status
        );

        return res.status(remoteCodeRequest.response.status).json({
            success: remoteCodeRequest.response.ok,
            message
        });
    } catch (e) {
        console.error('[AUTH_PROXY] Falha ao solicitar código remoto:', e.message);
        return res.status(503).json({ message: 'API do ERP indisponível.' });
    }
});

// Verificar código de acesso
app.post('/api/auth/verify-code', async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ message: 'Dados incompletos.' });

    try {
        const context = requireRemoteBackendContext(req, res);
        if (!context) return;

        const remoteVerify = await callRemoteJson({
            backendUrl: context.backendUrl,
            paths: ['/auth/verify-code', '/api/auth/verify-code'],
            method: 'POST',
            body: { email, code }
        });

        if (remoteVerify.response.status === 404) {
            return res.status(404).json({ message: 'Este ambiente não suporta login por código de acesso.' });
        }

        if (!remoteVerify.response.ok) {
            const message = extractRemoteMessage(remoteVerify.data, remoteVerify.text, remoteVerify.response.status);
            return res.status(remoteVerify.response.status).json({ message });
        }

        const accessToken =
            remoteVerify.data?.token?.access_token ||
            remoteVerify.data?.access_token ||
            remoteVerify.data?.token;

        if (!accessToken) {
            return res.status(502).json({ message: 'ERP respondeu sem token de autenticação.' });
        }

        const authenticatedUser = await resolveAuthenticatedUserPayload(
            context.backendUrl,
            accessToken,
            remoteVerify.data?.user || remoteVerify.data
        );
        if (!authenticatedUser.ok) {
            return res.status(authenticatedUser.status).json({ message: authenticatedUser.message });
        }

        const remoteUser = authenticatedUser.user;
        return res.status(200).json({
            token: {
                access_token: accessToken,
                token_type: remoteVerify.data?.token?.token_type || remoteVerify.data?.token_type || 'bearer',
                expires_in: remoteVerify.data?.token?.expires_in || remoteVerify.data?.expires_in || 3600
            },
            user: {
                ...remoteUser,
                vendor_name: remoteUser.vendor_name || remoteUser.name || remoteUser.nome || remoteUser.username || String(email || '').trim(),
                vendor_code: remoteUser.vendor_code || remoteUser.seller_id || remoteUser.vendedor_codigo || '',
                loja_codigo: remoteUser.loja_codigo || remoteUser.store_code || remoteUser.lojaCodigo || remoteUser.codigo_loja || ''
            }
        });

    } catch (e) {
        console.error('[AUTH_PROXY] Falha ao validar código remoto:', e.message);
        res.status(503).json({ message: 'API do ERP indisponível.' });
    }
});

// Autenticação com Google
app.post('/api/auth/google', async (req, res) => {
    return res.status(501).json({ message: 'Login Google não disponível neste ambiente.' });
});

const getHeaderValue = (value) => {
  if (!value) return '';
  return Array.isArray(value) ? String(value[0] || '').trim() : String(value).trim();
};

const parseAuthHeader = (value) => {
  const raw = getHeaderValue(value);
  if (!raw) return { token: '', invalid: false };
  const parts = raw.split(/\s+/);
  if (parts.length === 1) return { token: parts[0], invalid: false };
  if (parts.length === 2 && /^Bearer$/i.test(parts[0])) return { token: parts[1], invalid: false };
  return { token: '', invalid: true };
};

const isIntegrationTokenForRequest = (req, token) => {
  if (!token) return false;
  if (token === MASTER_KEY) return true;
  const allowed = resolveIntegrationTokensForHost(getRequestHost(req));
  if (allowed.length === 0) return false;
  return allowed.includes(token);
};

// Middleware de Verificação de Token
>>>>>>> ffd1865 (Reversão build)
const verifyToken = async (req, res, next) => {
  const authInfo = parseAuthHeader(req.headers['authorization']);
  const appToken = getHeaderValue(req.headers['x-app-token']);

  if (!authInfo.token && !appToken) {
      console.log('[AUTH_FAIL] Token não fornecido nos headers Authorization/X-App-Token');
      return res.status(403).json({ message: 'Token não fornecido.' });
  }

  if (authInfo.invalid) {
      console.log('[AUTH_FAIL] Formato inválido de token');
      return res.status(403).json({ message: 'Formato inválido.' });
  }

  if (!authInfo.token && appToken) {
      console.log('[AUTH_FAIL] X-App-Token não autoriza sessão de usuário');
      return res.status(401).json({ message: 'Token de integração não autentica usuário.' });
  }

  if (!authInfo.token) {
      console.log('[AUTH_FAIL] Token não fornecido no header Authorization');
      return res.status(403).json({ message: 'Token não fornecido.' });
  }

  try {
      const context = requireRemoteBackendContext(req, res);
      if (!context) return;
      const profileResponse = await fetchRemoteProfile(context.backendUrl, authInfo.token);
      if (!profileResponse || !profileResponse.response.ok) {
          const message = profileResponse
            ? extractRemoteMessage(profileResponse.data, profileResponse.text, profileResponse.response.status)
            : 'Token inválido.';
          console.log('[AUTH_FAIL] Token remoto rejeitado:', message);
          return res.status(401).json({ message: 'Token inválido.' });
      }
      const storeValidation = validateProfileAgainstBackend(context.backendUrl, profileResponse.data);
      if (!storeValidation.valid) {
          return res.status(403).json({ message: storeValidation.message });
      }
      const remoteUser = extractProfileUser(profileResponse.data);
      req.remoteUser = remoteUser;
      req.userId = remoteUser.id || remoteUser.vendor_code || remoteUser.username || null;
      req.jwtPayload = remoteUser;
      return next();
  } catch (remoteError) {
      console.log('[AUTH_FAIL] Token remoto inválido ou ERP indisponível:', remoteError.message);
      return res.status(401).json({ message: 'Token inválido.' });
  }
};

const ctx = {
  db,
  isPostgres,
  verifyToken,
  mailer,
  MAILER_FROM,
  genAI,
  GEMINI_API_KEY,
  requireRemoteBackendContext,
  callRemoteJson,
  extractRemoteMessage,
  fetchRemoteProfile,
  extractProfileUser,
  getHeaderValue,
  buildRemoteAuthHeaders,
  getRequestHost,
  matchesDomain,
  APP_INTEGRATION_TOKEN_EDSON,
  APP_INTEGRATION_TOKEN_LLFIX,
  APP_INTEGRATION_TOKEN,
};

app.use(createMiscRoutes(ctx));
app.use(createAuthRoutes(ctx));
app.use(createProductRoutes(ctx));
app.use(createCustomerRoutes(ctx));
app.use(createOrderRoutes(ctx));
app.use(createStoreRoutes(ctx));
app.use(createAIRoutes(ctx));
app.use(createPDFRoutes(ctx));
app.use('/api', createERPProxy(ctx));

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distPath = join(__dirname, 'dist');

if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
        res.sendFile(join(distPath, 'index.html'));
    });
}

const HOST = process.env.HOST || '127.0.0.1';

initDb().then(() => {
  app.listen(PORT, HOST, () => {
    console.log(`\n🚀 Servidor rodando em: http://localhost:${PORT}`);
    console.log(`📦 Modo Banco de Dados: ${isPostgres ? 'PostgreSQL (Remoto)' : 'SQLite (Local)'}\n`);
    if (process.env.NODE_ENV !== 'production') {
      const mask = (v) => (v && v.length > 8 ? `${v.slice(0,4)}…${v.slice(-4)}` : '(defina via env)');
      console.log(`🔑 Master Key (mascarada): ${mask(MASTER_KEY)}\n`);
      const integrationTokens = [
        { label: 'App Integration Token', value: APP_INTEGRATION_TOKEN },
        { label: 'App Integration Token EDSON', value: APP_INTEGRATION_TOKEN_EDSON },
        { label: 'App Integration Token LLFIX', value: APP_INTEGRATION_TOKEN_LLFIX }
      ];
      integrationTokens.forEach((entry) => {
        if (entry.value) {
          console.log(`🔐 ${entry.label} (mascarado): ${mask(entry.value)}\n`);
        }
      });
    }
  });
}).catch(err => {
  console.error('❌ Falha ao inicializar o banco de dados:', err);
  process.exit(1);
});
