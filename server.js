
import express from 'express';
import sqlite3 from 'sqlite3';
import pg from 'pg';
import cors from 'cors';
import bodyParser from 'body-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { OAuth2Client } from 'google-auth-library';
import { GoogleGenAI } from '@google/genai';
import PDFDocument from 'pdfkit';
import nodemailer from 'nodemailer';

// Configuração Básica
const app = express();
const PORT = process.env.PORT || 8080; 
const SECRET_KEY = process.env.SECRET_KEY || 'super-secret-key-change-this-in-production';
// Master Key para acesso facilitado (Bypass de JWT)
const MASTER_KEY = process.env.MASTER_KEY || 'salesforce-pro-token';
const APP_INTEGRATION_TOKEN = process.env.APP_INTEGRATION_TOKEN || '';
const APP_INTEGRATION_TOKEN_EDSON = process.env.APP_INTEGRATION_TOKEN_EDSON || '';
const APP_INTEGRATION_TOKEN_LLFIX = process.env.APP_INTEGRATION_TOKEN_LLFIX || '';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'SEU_CLIENT_ID_AQUI.apps.googleusercontent.com';
const DB_PATH = process.env.DB_PATH || './database.sqlite';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
// E-mail/SMTP
const SMTP_ADDRESS  = process.env.SMTP_ADDRESS || '';
const SMTP_PORT     = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USERNAME = process.env.SMTP_USERNAME || '';
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || '';
const SMTP_TLS      = (process.env.SMTP_ENABLE_STARTTLS_AUTO || 'true') === 'true';
const MAILER_FROM   = process.env.MAILER_SENDER_EMAIL || 'SalesForce <no-reply@salesforce.pro>';

const DEFAULT_STORE_ID = 1;
const EDSON_DOMAIN = 'edsondosparafusos.app.br';
const LLFIX_DOMAIN = 'llfix.app.br';
const STORE_DOMAIN_MAP = {
  [EDSON_DOMAIN]: 1,
  [LLFIX_DOMAIN]: 3
};

const normalizeHost = (value) => {
  const raw = String(value || '').split(',')[0].trim().toLowerCase();
  if (!raw) return '';
  const noProto = raw.replace(/^https?:\/\//, '');
  return noProto.replace(/:\d+$/, '');
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

const resolveStoreIdFromHost = (host) => {
  if (matchesDomain(host, LLFIX_DOMAIN)) return STORE_DOMAIN_MAP[LLFIX_DOMAIN];
  if (matchesDomain(host, EDSON_DOMAIN)) return STORE_DOMAIN_MAP[EDSON_DOMAIN];
  return DEFAULT_STORE_ID;
};
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
  return tokens;
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

// Transport opcional do nodemailer (só se variáveis estiverem definidas)
let mailer = null;
try {
  if (SMTP_ADDRESS && SMTP_USERNAME && SMTP_PASSWORD) {
    mailer = nodemailer.createTransport({
      host: SMTP_ADDRESS,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USERNAME, pass: SMTP_PASSWORD },
      tls: { rejectUnauthorized: false }
    });
  }
} catch (e) {
  console.warn('[MAILER] Falha ao inicializar transporte SMTP:', e.message);
}

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Middleware de Log
app.use((req, res, next) => {
    console.log(`[SERVER] ${req.method} ${req.url}`);
    next();
});

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
    if (!req.userId || isPrivilegedUser(req.userId)) {
        req.sellerId = null;
        return null;
    }
    try {
        const user = await db.get("SELECT seller_id FROM users WHERE id = ?", [req.userId]);
        const sellerId = user && user.seller_id ? String(user.seller_id) : null;
        req.sellerId = sellerId;
        return sellerId;
    } catch (e) {
        req.sellerId = null;
        return null;
    }
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

        // Migração para adicionar colunas de código de acesso se não existirem
        try {
            await db.run("ALTER TABLE users ADD COLUMN auth_code TEXT");
            await db.run("ALTER TABLE users ADD COLUMN auth_code_expires TEXT");
        } catch (e) {}

        // Migração para adicionar seller_id
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

        const allowDefaultAdmin = process.env.ALLOW_LOCAL_DEFAULT_ADMIN === '1' || process.env.NODE_ENV !== 'production';
        if (allowDefaultAdmin) {
            const userCount = await db.get("SELECT count(*) as count FROM users WHERE lower(email) = ?", ['admin']);
            if (!userCount || parseInt(userCount.count) === 0) {
                const hash = bcrypt.hashSync("123456", 8);
                const now = new Date().toISOString();
                await db.run("INSERT INTO users (name, email, password, created_at, seller_id) VALUES (?, ?, ?, ?, ?)", ["Administrador", "admin", hash, now, "000002"]);
                console.log("Usuário 'admin' criado para ambiente local controlado.");
            }
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

app.post('/api/register', async (req, res) => {
  const { name, email, password, seller_id } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email e senha são obrigatórios.' });
  
  const emailLower = email.toLowerCase();

  try {
      const hashedPassword = bcrypt.hashSync(password, 8);
      const createdAt = new Date().toISOString();
      // Permite definir seller_id no registro ou deixa null
      const result = await db.run(
          "INSERT INTO users (name, email, password, created_at, seller_id) VALUES (?, ?, ?, ?, ?)", 
          [name, emailLower, hashedPassword, createdAt, seller_id || null]
      );
      
      const userId = isPostgres ? result.lastID : result.lastID; // Adapter handles normalization if needed
      // Token válido por 10 anos (3650 dias)
      const token = jwt.sign({ id: userId }, SECRET_KEY, { expiresIn: '3650d' });
      res.status(201).json({ success: true, token, id: userId, sellerId: seller_id || null });
  } catch (err) {
      if (err.message && err.message.includes('UNIQUE')) {
         return res.status(400).json({ message: 'Email já cadastrado.' });
      }
      res.status(500).json({ message: 'Erro ao criar usuário.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const usernameLower = username.toLowerCase();
  
  try {
      const user = await db.get("SELECT * FROM users WHERE lower(email) = ?", [usernameLower]);
      if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' });

      // Se o usuário foi criado via Google, ele pode não ter senha
      if (!user.password && password) {
          return res.status(401).json({ message: 'Faça login com Google.' });
      }

      const passwordIsValid = bcrypt.compareSync(password, user.password);
      if (!passwordIsValid) return res.status(401).json({ message: 'Senha inválida.' });

      // Token válido por 10 anos (3650 dias)
      const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '3650d' });
      
      // NOVA ESTRUTURA PARA PARIDADE COM API DE PRODUÇÃO
      res.status(200).json({
          token: {
              access_token: token,
              token_type: "bearer",
              expires_in: 3600
          },
          user: {
              id: user.id,
              username: user.email,
              is_active: true,
              created_at: user.created_at,
              updated_at: user.created_at,
              vendor_code: user.seller_id || "000000",
              vendor_name: user.name
          }
      });
  } catch (e) {
      console.log(e);
      res.status(500).json({ message: 'Erro interno.' });
  }
});

// Enviar código de acesso
app.post('/api/auth/send-code', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email é obrigatório.' });
    
    const emailLower = email.toLowerCase();

    try {
        const user = await db.get("SELECT * FROM users WHERE lower(email) = ?", [emailLower]);
        if (!user) return res.status(404).json({ message: 'E-mail não cadastrado.' });

        // Gera código de 6 dígitos
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        // Expira em 10 minutos (tempo para digitar o código)
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        await db.run("UPDATE users SET auth_code = ?, auth_code_expires = ? WHERE id = ?", [code, expiresAt, user.id]);

        if (mailer) {
            const subject = 'Seu codigo de acesso - SalesForce Pro';
            const text = `Seu codigo de acesso e ${code}. Ele expira em 10 minutos.`;
            const html = `
                <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1f2937;">
                    <h2 style="margin-bottom: 8px;">SalesForce Pro</h2>
                    <p>Seu codigo de acesso e:</p>
                    <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px; margin: 16px 0;">${code}</p>
                    <p>Esse codigo expira em 10 minutos.</p>
                    <p>Se voce nao solicitou esse acesso, ignore este e-mail.</p>
                </div>
            `;

            await mailer.sendMail({
                from: MAILER_FROM,
                to: emailLower,
                subject,
                text,
                html
            });

            return res.status(200).json({ success: true, message: 'Codigo enviado para o e-mail.' });
        }

        console.log(`
============================================`);
        console.log(`[EMAIL SIMULADO] Para: ${emailLower}`);
        console.log(`[EMAIL SIMULADO] Seu codigo de acesso e: ${code}`);
        console.log(`============================================
`);

        return res.status(200).json({ success: true, message: 'Codigo gerado. Mailer nao configurado; verifique o console do servidor.' });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ message: 'Erro ao processar solicitação.' });
    }
});

// Verificar código de acesso
app.post('/api/auth/verify-code', async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ message: 'Dados incompletos.' });

    const emailLower = email.toLowerCase();

    try {
        const user = await db.get("SELECT * FROM users WHERE lower(email) = ?", [emailLower]);
        if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' });

        if (!user.auth_code || user.auth_code !== code) {
            return res.status(401).json({ message: 'Código inválido.' });
        }

        const now = new Date();
        const expires = new Date(user.auth_code_expires);

        if (now > expires) {
            return res.status(401).json({ message: 'Código expirado. Solicite um novo.' });
        }

        // Limpa o código após uso
        await db.run("UPDATE users SET auth_code = NULL, auth_code_expires = NULL WHERE id = ?", [user.id]);

        // Token válido por 10 anos (3650 dias)
        const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '3650d' });
        
        // NOVA ESTRUTURA PARA PARIDADE
        res.status(200).json({
            token: {
                access_token: token,
                token_type: "bearer",
                expires_in: 3600
            },
            user: {
                id: user.id,
                username: user.email,
                is_active: true,
                created_at: user.created_at,
                updated_at: user.created_at,
                vendor_code: user.seller_id || "000000",
                vendor_name: user.name
            }
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Erro interno.' });
    }
});

// Autenticação com Google
app.post('/api/auth/google', async (req, res) => {
    const { credential, clientId } = req.body;
    
    try {
        // Se o cliente enviar o clientId, usamos para validar o audience.
        // Isso permite que o app tenha o ID configurável.
        const audience = clientId || GOOGLE_CLIENT_ID;

        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: audience,
        });
        const payload = ticket.getPayload();
        const { email, name, sub } = payload; // sub é o google id
        const emailLower = email.toLowerCase();

        let user = await db.get("SELECT * FROM users WHERE lower(email) = ?", [emailLower]);

        let userId;
        let sellerId = null;

        if (!user) {
            // Cria usuário se não existir
            const createdAt = new Date().toISOString();
            // Senha vazia ou string especial para indicar Google Auth
            const result = await db.run(
                "INSERT INTO users (name, email, password, created_at, seller_id) VALUES (?, ?, ?, ?, ?)", 
                [name, emailLower, `GOOGLE_AUTH_${sub}`, createdAt, null]
            );
            userId = isPostgres ? result.lastID : result.lastID;
        } else {
            userId = user.id;
            sellerId = user.seller_id;
        }

        // Token válido por 10 anos (3650 dias)
        const token = jwt.sign({ id: userId }, SECRET_KEY, { expiresIn: '3650d' });
        res.status(200).json({ success: true, token, name: name, sellerId });

    } catch (e) {
        console.error(e);
        res.status(400).json({ message: 'Falha na autenticação Google.' });
    }
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
const verifyToken = (req, res, next) => {
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

  jwt.verify(authInfo.token, SECRET_KEY, (err, decoded) => {
    if (err) {
        console.log('[AUTH_FAIL] Token JWT inválido ou expirado:', err.message);
        return res.status(401).json({ message: 'Token inválido.' });
    }
    req.userId = decoded.id;
    next();
  });
};

// --- ROTAS DA API ---

// Identificar Usuário Atual (Me)
app.get('/api/me', verifyToken, async (req, res) => {
    try {
        const user = await db.get("SELECT id, name, email, seller_id FROM users WHERE id = ?", [req.userId]);
        if (user) {
            // RETORNA FORMATO COMPATÍVEL COM O APP (User Object)
            res.json({
                user: {
                    id: user.id,
                    vendor_name: user.name,
                    username: user.email,
                    vendor_code: user.seller_id
                }
            });
        } else {
            res.status(404).json({ message: 'Usuário não encontrado.' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Listar Produtos
app.get('/api/products', verifyToken, async (req, res) => {
  // LÓGICA DE LIMITE ROBUSTA (atualizada):
  // Se limit não for enviado, NÃO aplicamos paginação (retorna tudo — útil para sync).
  // Se limit for enviado e > 0, aplicamos paginação normal.
  let limit = -1;
  if (req.query.limit !== undefined) {
      const parsed = parseInt(req.query.limit);
      if (!isNaN(parsed)) limit = parsed;
  }
  const page = parseInt(req.query.page) || 1;
  const offset = limit > 0 ? (page - 1) * limit : 0;

  try {
      const storeId = getStoreIdForProducts(req);
      let query = "SELECT * FROM products WHERE (store_id = ? OR store_id IS NULL) ORDER BY name";
      let params = [storeId];

      // Apenas adiciona paginação se limit for positivo.
      // Se limit for -1 ou 0, retorna tudo.
      if (limit > 0) {
          query += " LIMIT ? OFFSET ?";
          params.push(limit, offset);
      } else {
          console.log('[SERVER] Retornando produtos sem limites (Sync)');
      }

      const rows = await db.query(query, params);
      const mapped = rows.map(p => ({
         codigo: p.plu, 
         id: p.plu,
         plu: p.plu,
         descricao_completa: p.description, 
         nome: p.name,
         preco: p.price,
         estoque: p.stock,
         estoque_disponivel: p.stock, // Simula campo da API real
         unidade: p.unit,
         categoria: p.category,
         imagem_url: p.image_url
      }));
      res.json(mapped);
  } catch (e) {
      res.status(500).json({ error: e.message });
  }
});

// Listar Produtos (compatibilidade LLFIX /api/produtos-sync)
app.get('/api/produtos-sync', verifyToken, async (req, res) => {
  // Reaproveita a mesma logica de /api/products (ignora loja)
  let limit = -1;
  if (req.query.limit !== undefined) {
      const parsed = parseInt(req.query.limit);
      if (!isNaN(parsed)) limit = parsed;
  }
  const page = parseInt(req.query.page) || 1;
  const offset = limit > 0 ? (page - 1) * limit : 0;

  try {
      const storeId = getStoreIdForProducts(req);
      let query = "SELECT * FROM products WHERE (store_id = ? OR store_id IS NULL) ORDER BY name";
      let params = [storeId];

      if (limit > 0) {
          query += " LIMIT ? OFFSET ?";
          params.push(limit, offset);
      } else {
          console.log('[SERVER] Retornando produtos sem limites (Sync)');
      }

      const rows = await db.query(query, params);
      const mapped = rows.map(p => ({
         codigo: p.plu, 
         id: p.plu,
         plu: p.plu,
         descricao_completa: p.description, 
         nome: p.name,
         preco: p.price,
         estoque: p.stock,
         estoque_disponivel: p.stock,
         unidade: p.unit,
         categoria: p.category,
         imagem_url: p.image_url
      }));
      res.json(mapped);
  } catch (e) {
      res.status(500).json({ error: e.message });
  }
});

// Adicionar Produto (Novo)
app.post('/api/products', verifyToken, async (req, res) => {
    const { codigo, nome, descricao_completa, preco, estoque, categoria, unidade, imagem_url } = req.body;
    
    if (!codigo || !nome || !preco) {
        return res.status(400).json({ message: 'Campos obrigatórios: codigo, nome, preco.' });
    }

    try {
        const storeId = getStoreIdForProducts(req);
        await db.run(
            `INSERT INTO products (plu, name, description, price, stock, category, unit, image_url, store_id) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [codigo, nome, descricao_completa || '', preco, estoque || 0, categoria || 'Geral', unidade || 'UN', imagem_url || '', storeId]
        );
        res.status(201).json({ success: true, message: 'Produto cadastrado.' });
    } catch (e) {
        if (e.message.includes('UNIQUE')) {
            return res.status(400).json({ message: 'Código de produto já existe.' });
        }
        res.status(500).json({ message: e.message });
    }
});

// Listar Clientes
app.get('/api/clientes', verifyToken, async (req, res) => {
    // LÓGICA DE LIMITE ROBUSTA (atualizada): sem parâmetro -> sem limite (sync completo).
    // Se limit > 0, aplica paginação.
    let limit = -1; 
    if (req.query.limit !== undefined) {
        const parsed = parseInt(req.query.limit);
        if (!isNaN(parsed)) limit = parsed;
    }

    try {
        const sellerId = await resolveSellerIdForRequest(req);
        const privileged = isPrivilegedUser(req.userId);
        if (!sellerId && !privileged) {
            return res.status(403).json({ message: 'Usuário sem vendedor vinculado.' });
        }

        let query = "SELECT * FROM customers";
        const params = [];

        const where = ["(status IS NULL OR status != 'TEMPORARIO')"];
        if (sellerId && !privileged) {
            where.push("seller_id = ?");
            params.push(sellerId);
        }
        if (where.length > 0) query += ` WHERE ${where.join(' AND ')}`;
        
        query += " ORDER BY name";

        // Aplica limite se for positivo
        if (limit > 0) {
             query += " LIMIT ?";
             params.push(limit);
        } else {
             console.log(`[SERVER] Retornando TODOS os clientes (Limit: ${limit})`);
        }

        const rows = await db.query(query, params);
        const mapped = rows.map(c => ({
            ...mapCustomerPayload(c),
            ultima_venda_data: new Date().toISOString().split('T')[0],
            ultima_venda_valor: 150.00
        }));
        res.json(mapped);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Buscar Cliente por CNPJ
app.get('/api/clientes/cnpj/:cnpj', verifyToken, async (req, res) => {
    const raw = req.params.cnpj || '';
    if (!isValidCnpj(raw)) {
        return res.status(400).json({ message: 'CNPJ inválido.' });
    }

    const normalized = normalizeDocument(raw);
    try {
        const sellerId = await resolveSellerIdForRequest(req);
        const privileged = isPrivilegedUser(req.userId);
        if (!sellerId && !privileged) {
            return res.status(403).json({ message: 'Usuário sem vendedor vinculado.' });
        }

        let query = isPostgres
            ? "SELECT * FROM customers WHERE regexp_replace(document, '[^0-9]', '', 'g') = ?"
            : "SELECT * FROM customers WHERE REPLACE(REPLACE(REPLACE(REPLACE(document, '.', ''), '-', ''), '/', ''), ' ', '') = ?";
        const params = [normalized];
        if (sellerId && !privileged) {
            query += " AND seller_id = ?";
            params.push(sellerId);
        }
        query += " LIMIT 1";
        const row = await db.get(query, params);
        if (!row) return res.status(404).json({ message: 'Cliente não encontrado.' });
        return res.json(mapCustomerPayload(row));
    } catch (e) {
        return res.status(500).json({ message: e.message });
    }
});

// Consulta SEFAZ (proxy interno)
app.get('/api/externo/sefaz/cnpj/:cnpj', verifyToken, async (req, res) => {
    const raw = req.params.cnpj || '';
    if (!isValidCnpj(raw)) {
        return res.status(400).json({ message: 'CNPJ inválido.' });
    }
    if (process.env.SEFAZ_DISABLED === 'true') {
        return res.status(503).json({ message: 'SEFAZ indisponível.' });
    }
    const payload = buildSefazMock(raw);
    return res.json(payload);
});

// Criar Cliente Temporário
app.post('/api/clientes/temp', verifyToken, async (req, res) => {
    const {
        cnpj,
        razao_social,
        nome_fantasia,
        endereco,
        uf,
        municipio,
        vendedor_id
    } = req.body || {};

    if (!isValidCnpj(cnpj)) {
        return res.status(400).json({ message: 'CNPJ inválido.' });
    }
    if (!razao_social || !endereco || !uf || !municipio) {
        return res.status(400).json({ message: 'Dados insuficientes para cadastro temporário.' });
    }

    const normalized = normalizeDocument(cnpj);
    try {
        const sellerId = await resolveSellerIdForRequest(req);
        const privileged = isPrivilegedUser(req.userId);
        if (!sellerId && !privileged) {
            return res.status(403).json({ message: 'Usuário sem vendedor vinculado.' });
        }

        const effectiveSellerId = privileged ? (vendedor_id || sellerId) : sellerId;

        let query = isPostgres
            ? "SELECT * FROM customers WHERE regexp_replace(document, '[^0-9]', '', 'g') = ?"
            : "SELECT * FROM customers WHERE REPLACE(REPLACE(REPLACE(REPLACE(document, '.', ''), '-', ''), '/', ''), ' ', '') = ?";
        const params = [normalized];
        if (effectiveSellerId) {
            query += " AND seller_id = ?";
            params.push(effectiveSellerId);
        }
        query += " LIMIT 1";
        const existing = await db.get(query, params);
        if (existing) {
            return res.json(mapCustomerPayload(existing));
        }

        const insert = isPostgres
            ? "INSERT INTO customers (name, fantasy_name, document, address, city, state, status, origin, seller_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id"
            : "INSERT INTO customers (name, fantasy_name, document, address, city, state, status, origin, seller_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
        const result = await db.run(insert, [
            razao_social,
            nome_fantasia || razao_social,
            normalized,
            endereco,
            municipio,
            uf,
            'TEMPORARIO',
            'SEFAZ',
            effectiveSellerId || null
        ]);

        const newId = result.lastID;
        const row = await db.get("SELECT * FROM customers WHERE id = ?", [newId]);

        // Garante plano padrão para temporário
        if (row) {
            const link = await db.get(
                "SELECT id FROM customer_payment_plans WHERE customer_id = ? LIMIT 1",
                [String(row.id)]
            );
            if (!link) {
                await db.run(
                    "INSERT INTO customer_payment_plans (customer_id, plan_code) VALUES (?, ?)",
                    [String(row.id), "01"]
                );
            }
        }

        return res.status(201).json(mapCustomerPayload(row));
    } catch (e) {
        return res.status(500).json({ message: e.message });
    }
});

// Planos de Pagamento por Cliente
app.get('/api/planos-pagamento-cliente/:cliente_codigo', verifyToken, async (req, res) => {
    const { cliente_codigo } = req.params;
    if (!cliente_codigo) return res.status(400).json({ message: 'Cliente obrigatório.' });

    try {
        const sellerId = await resolveSellerIdForRequest(req);
        const privileged = isPrivilegedUser(req.userId);
        if (!sellerId && !privileged) {
            return res.status(403).json({ message: 'Usuário sem vendedor vinculado.' });
        }

        const customerQuery = privileged
            ? "SELECT id, status FROM customers WHERE id = ?"
            : "SELECT id, status FROM customers WHERE id = ? AND seller_id = ?";
        const customerParams = privileged
            ? [String(cliente_codigo)]
            : [String(cliente_codigo), sellerId];
        const customer = await db.get(customerQuery, customerParams);
        if (!customer) return res.status(404).json({ message: 'Cliente não encontrado.' });

        const plans = await db.query(
            `SELECT p.code as plano_codigo, p.description as plano_descricao,
                    p.installments as parcelas, p.days_between_installments as dias_entre_parcelas,
                    p.min_value as valor_minimo
             FROM customer_payment_plans cpp
             JOIN payment_plans p ON p.code = cpp.plan_code
             WHERE cpp.customer_id = ?`,
            [String(cliente_codigo)]
        );

        if (plans.length === 0 && customer.status === 'TEMPORARIO') {
            const fallback = await db.get(
                "SELECT code as plano_codigo, description as plano_descricao, installments as parcelas, days_between_installments as dias_entre_parcelas, min_value as valor_minimo FROM payment_plans WHERE code = ?",
                ["01"]
            );
            if (fallback) return res.json([fallback]);
        }

        return res.json(plans);
    } catch (e) {
        return res.status(500).json({ message: e.message });
    }
});

const handleSaveOrder = async (req, res) => {
  const {
      cliente_id,
      total,
      data_criacao,
      itens,
      observacao,
      vendedor_id,
      vendedor_nome,
      cliente_tipo,
      plano_pagamento_codigo,
      plano_pagamento_descricao,
      parcelas,
      dias_entre_parcelas,
      valor_minimo,
      payment_method,
      shipping_method
  } = req.body;

  // DEBUG: Log do payload recebido
  console.log(`\n[ORDER_DEBUG] Novo pedido recebido de UserID: ${req.userId}`);
  // Truncate para não poluir demais
  console.log(`[ORDER_DEBUG] Payload:`, JSON.stringify(req.body).substring(0, 500)); 

  // Fix: cliente_id === 0 (número) poderia ser tratado como false
  if (cliente_id === undefined || cliente_id === null) {
      console.log('[ORDER_DEBUG] Erro: cliente_id ausente.');
      return res.status(400).json({ message: 'ID do cliente obrigatório.' });
  }

  if (!itens || itens.length === 0) {
      console.log('[ORDER_DEBUG] Erro: Pedido sem itens.');
      return res.status(400).json({ message: 'Sem itens.' });
  }

  const planCode = plano_pagamento_codigo || '';
  const planDescription = plano_pagamento_descricao || '';
  const planInstallments = parcelas || 1;
  const planDays = dias_entre_parcelas || 0;
  const planMin = valor_minimo || 0;

  try {
      // Nota: customer_id agora é TEXT no CREATE TABLE para aceitar UUIDs do frontend
      const orderRes = isPostgres 
        ? await db.run(
            "INSERT INTO orders (customer_id, customer_type, total, status, created_at, seller_id, seller_name, notes, payment_plan_code, payment_plan_description, payment_installments, payment_days_between, payment_min_value, payment_method, shipping_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
            [String(cliente_id), cliente_tipo || 'NORMAL', total, 'confirmed', data_criacao, vendedor_id || null, vendedor_nome || null, observacao || null, planCode, planDescription, planInstallments, planDays, planMin, payment_method || null, shipping_method || null]
          )
        : await db.run(
            "INSERT INTO orders (customer_id, customer_type, total, status, created_at, seller_id, seller_name, notes, payment_plan_code, payment_plan_description, payment_installments, payment_days_between, payment_min_value, payment_method, shipping_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [String(cliente_id), cliente_tipo || 'NORMAL', total, 'confirmed', data_criacao, vendedor_id || null, vendedor_nome || null, observacao || null, planCode, planDescription, planInstallments, planDays, planMin, payment_method || null, shipping_method || null]
          );
      
      const orderId = orderRes.lastID; // No PG adaptado, lastID pega o id retornado
      console.log(`[ORDER_DEBUG] Pedido criado com ID: ${orderId}`);

      for (const item of itens) {
          await db.run(
              "INSERT INTO order_items (order_id, product_code, quantity, unit_price) VALUES (?, ?, ?, ?)",
              [orderId, item.codigo_produto, item.quantidade, item.valor_unitario]
          );
      }
      
      console.log(`[ORDER_DEBUG] Itens inseridos com sucesso.`);
      res.status(201).json({ success: true, orderId, message: 'Pedido gravado.' });
  } catch (e) {
      console.error('[ORDER_ERROR] Erro ao gravar pedido:', e);
      res.status(500).json({ message: `Erro Interno: ${e.message}` });
  }
};

// Salvar Pedido
app.post('/api/pedidos', verifyToken, handleSaveOrder);
app.post('/api/pedidos-venda', verifyToken, handleSaveOrder);

// Atualizar status de negócio do pedido no servidor (mock / exemplo)
// PUT /api/pedidos/:id/status  body: { status: 'pre_venda' | 'separacao' | 'faturado' | 'entregue' | 'cancelado' }
app.put('/api/pedidos/:id/status', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};
  if (!status) return res.status(400).json({ message: 'status é obrigatório.' });
  try {
    // Nesta base exemplo, não persistimos pedidos; retornamos sucesso para o app refletir localmente
    res.json({ success: true, id, status });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Dados da Loja (privado)
app.get('/api/store', verifyToken, async (req, res) => {
  try {
    const storeId = getStoreIdFromRequest(req);
    await ensureStoreInfoRow(storeId);
    const row = await db.get("SELECT * FROM store_info WHERE id = ?", [storeId]);
    res.json(row || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/store', verifyToken, async (req, res) => {
  const fields = [
    'legal_name','trade_name','document','state_registration','municipal_registration','email','phone','street','number','neighborhood','city','state','zip','complement'
  ];
  const data = {};
  fields.forEach(k => { if (req.body[k] !== undefined) data[k] = req.body[k]; });
  data.updated_at = new Date().toISOString();
  
  try {
    const storeId = getStoreIdFromRequest(req);
    await ensureStoreInfoRow(storeId);
    // Monta SET dinâmico
    const setCols = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const params = Object.values(data);
    await db.run(`UPDATE store_info SET ${setCols} WHERE id = ?`, [...params, storeId]);
    const row = await db.get("SELECT * FROM store_info WHERE id = ?", [storeId]);
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Dados da Loja (público) — usado pelo PWA em produção
app.get('/api/store/public', async (req, res) => {
  try {
    const storeId = getStoreIdFromRequest(req);
    await ensureStoreInfoRow(storeId);
    const row = await db.get("SELECT * FROM store_info WHERE id = ?", [storeId]);
    res.json(row || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/store/public', async (req, res) => {
  const fields = [
    'legal_name','trade_name','document','state_registration','municipal_registration','email','phone','street','number','neighborhood','city','state','zip','complement'
  ];
  const data = {};
  fields.forEach(k => { if (req.body[k] !== undefined) data[k] = req.body[k]; });
  data.updated_at = new Date().toISOString();

  try {
    const storeId = getStoreIdFromRequest(req);
    await ensureStoreInfoRow(storeId);
    const setCols = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const params = Object.values(data);
    await db.run(`UPDATE store_info SET ${setCols} WHERE id = ?`, [...params, storeId]);
    const row = await db.get("SELECT * FROM store_info WHERE id = ?", [storeId]);
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- IA (Gemini) no Backend ---
app.post('/api/ai/pitch', verifyToken, async (req, res) => {
  try {
    if (!GEMINI_API_KEY || !genAI) {
      return res.status(400).json({ message: 'GEMINI_API_KEY não configurada no servidor.' });
    }
    const { product } = req.body || {};
    if (!product || !product.name) {
      return res.status(400).json({ message: 'Produto inválido.' });
    }

    const prompt = `Atue como um vendedor experiente e persuasivo.\n` +
      `Escreva um argumento de vendas curto (máximo 3 frases) e impactante para o seguinte produto:\n` +
      `Nome: ${product.name}\n` +
      `Categoria: ${product.category || ''}\n` +
      `Preço: R$ ${product.price ?? ''}\n` +
      `Descrição técnica: ${product.description || ''}\n` +
      `Foque nos benefícios para o cliente. Use tom profissional mas entusiasmado.`;

    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = response?.text || null;
    if (!text) return res.status(500).json({ message: 'Não foi possível gerar o argumento de vendas.' });
    return res.json({ text });
  } catch (e) {
    console.error('[AI] Erro pitch:', e);
    return res.status(500).json({ message: 'Erro ao gerar argumento de vendas.' });
  }
});

const formatMoney = (value) => `R$ ${Number(value || 0).toFixed(2)}`;
const formatDatePtBr = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return date.toLocaleDateString('pt-BR');
  }
};
const formatDateTimePtBr = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return date.toLocaleString('pt-BR');
  }
};

const renderReceiptPDF = (doc, receipt, store) => {
  const marginLeft = doc.page.margins.left;
  const marginTop = doc.page.margins.top;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const dateLabel = formatDatePtBr(receipt.createdAt);
  const total = Number(receipt.total || 0);
  const items = Array.isArray(receipt.items) ? receipt.items : [];
  const paymentPlan = receipt.paymentPlanDescription
    ? `Plano: ${receipt.paymentPlanDescription}${receipt.paymentInstallments ? ` (${receipt.paymentInstallments}x)` : ''}`
    : null;

  const formatDisplayLabel = (value, fallback = '—') => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return fallback;

    const dictionary = {
      pix: 'PIX',
      dinheiro: 'Dinheiro',
      cartao: 'Cartão',
      boleto: 'Boleto',
      retirada: 'Retirada',
      entrega_propria: 'Entrega Própria',
      transportadora: 'Transportadora',
      sem_frete: 'Sem frete',
      fob: 'Retirada',
      cif: 'Entrega'
    };

    if (dictionary[normalized]) return dictionary[normalized];

    return normalized
      .split(/[ _-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };

  const paymentMethodLabel = formatDisplayLabel(receipt.paymentMethod);
  const shippingMethodLabel = formatDisplayLabel(receipt.shippingMethod);

  const drawBox = (x, y, width, height, options = {}) => {
    const { fill = null, stroke = '#d7dee7', radius = 10, lineWidth = 1 } = options;
    doc.save();
    doc.lineWidth(lineWidth);
    doc.roundedRect(x, y, width, height, radius);
    if (fill) {
      doc.fillAndStroke(fill, stroke);
    } else {
      doc.strokeColor(stroke).stroke();
    }
    doc.restore();
  };

  const writeLabel = (label, x, y, width, align = 'left', color = '#64748b') => {
    doc.fillColor(color).font('Helvetica-Bold').fontSize(8).text(label.toUpperCase(), x, y, { width, align });
  };

  const metaTop = marginTop;
  const metaHeight = 128;
  const orderCardWidth = 150;
  const companyWidth = pageWidth - orderCardWidth - 16;

  drawBox(marginLeft, metaTop, pageWidth, metaHeight, { fill: '#f8fafc', stroke: '#d7dee7', radius: 14 });

  let logoOffset = 0;
  if (store?.logo_url) {
    try {
      doc.image(store.logo_url, marginLeft + 16, metaTop + 16, { fit: [54, 54], align: 'center', valign: 'center' });
      drawBox(marginLeft + 12, metaTop + 12, 62, 62, { stroke: '#d7dee7', radius: 12 });
      logoOffset = 72;
    } catch {}
  }

  const companyX = marginLeft + 18 + logoOffset;
  const companyY = metaTop + 16;
  const companyTextWidth = companyWidth - logoOffset - 10;
  const companyBottomLimit = metaTop + metaHeight - 14;

  writeLabel('Comprovante de Pedido', companyX, companyY, companyTextWidth);
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(18).text(store?.trade_name || 'SalesForce Pro', companyX, companyY + 14, { width: companyTextWidth, lineBreak: false });

  let companyCursorY = companyY + 40;
  doc.fillColor('#475569').font('Helvetica').fontSize(9.5).text(store?.legal_name || 'Documento comercial de pedido', companyX, companyCursorY, { width: companyTextWidth, lineBreak: false });
  companyCursorY += 16;

  if (store?.document) {
    doc.fontSize(8.5).text(`CNPJ/CPF: ${store.document}`, companyX, companyCursorY, { width: companyTextWidth, lineBreak: false });
    companyCursorY += 12;
  }

  const addr = [store?.street, store?.number, store?.neighborhood, store?.city && `${store.city}/${store.state}`, store?.zip]
    .filter(Boolean)
    .join(' - ');

  if (addr) {
    const addressOptions = { width: companyTextWidth, lineGap: -1 };
    const addrHeight = doc.fontSize(7.8).heightOfString(addr, addressOptions);
    doc.text(addr, companyX, companyCursorY, addressOptions);
    companyCursorY += addrHeight + 4;
  }

  const contactLine = [store?.phone ? `Fone: ${store.phone}` : null, store?.email || null]
    .filter(Boolean)
    .join('  •  ');

  if (contactLine && companyCursorY < companyBottomLimit) {
    doc.fontSize(7.8).text(contactLine, companyX, Math.min(companyCursorY, companyBottomLimit - 8), {
      width: companyTextWidth,
      lineBreak: false,
      ellipsis: true
    });
  }

  const orderX = marginLeft + pageWidth - orderCardWidth - 16;
  const orderY = metaTop + 16;
  drawBox(orderX, orderY, orderCardWidth, 80, { fill: '#ffffff', stroke: '#d7dee7', radius: 12 });
  writeLabel('Pedido', orderX + 12, orderY + 10, orderCardWidth - 24);
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(18).text(`#${receipt.displayId || ''}`, orderX + 12, orderY + 26, { width: orderCardWidth - 24 });
  doc.save();
  doc.moveTo(orderX + 12, orderY + 50).lineTo(orderX + orderCardWidth - 12, orderY + 50).strokeColor('#e2e8f0').lineWidth(1).stroke();
  doc.restore();
  writeLabel('Data de Emissão', orderX + 12, orderY + 58, orderCardWidth - 24);
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text(dateLabel, orderX + 12, orderY + 70, { width: orderCardWidth - 24 });

  const infoTop = metaTop + metaHeight + 16;
  const gap = 12;
  const sellerWidth = 160;
  const customerWidth = pageWidth - sellerWidth - gap;
  const infoHeight = 72;

  drawBox(marginLeft, infoTop, customerWidth, infoHeight, { stroke: '#d7dee7', radius: 12 });
  writeLabel('Cliente', marginLeft + 14, infoTop + 12, customerWidth - 28);
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text(receipt.customer || '—', marginLeft + 14, infoTop + 28, { width: customerWidth - 28 });
  doc.fillColor('#475569').font('Helvetica').fontSize(9).text(`Doc: ${receipt.customerDoc || 'N/A'}`, marginLeft + 14, infoTop + 50, { width: customerWidth - 28 });

  const sellerX = marginLeft + customerWidth + gap;
  drawBox(sellerX, infoTop, sellerWidth, infoHeight, { stroke: '#d7dee7', radius: 12 });
  writeLabel('Vendedor', sellerX + 14, infoTop + 12, sellerWidth - 28);
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text(receipt.sellerName || '—', sellerX + 14, infoTop + 28, { width: sellerWidth - 28 });
  doc.fillColor('#475569').font('Helvetica').fontSize(9).text(`Matrícula: ${receipt.sellerId || '—'}`, sellerX + 14, infoTop + 50, { width: sellerWidth - 28 });

  const tableTop = infoTop + infoHeight + 18;
  const tableHeaderHeight = 34;
  const colQty = marginLeft + 14;
  const colUnit = marginLeft + 60;
  const colDesc = marginLeft + 102;
  const colUnitPrice = marginLeft + pageWidth - 150;
  const colTotal = marginLeft + pageWidth - 82;
  const descWidth = colUnitPrice - colDesc - 12;

  drawBox(marginLeft, tableTop, pageWidth, tableHeaderHeight, { fill: '#f1f5f9', stroke: '#d7dee7', radius: 12 });
  writeLabel('Itens do Pedido', marginLeft + 14, tableTop + 8, 180);
  doc.fillColor('#334155').font('Helvetica-Bold').fontSize(9).text(`${items.length} item(ns)`, marginLeft + 14, tableTop + 18, { width: 180 });
  doc.fillColor('#64748b').font('Helvetica').fontSize(8.5).text('Valores em reais', marginLeft, tableTop + 13, { width: pageWidth - 14, align: 'right' });

  const headerY = tableTop + tableHeaderHeight + 8;
  doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8.5);
  doc.text('Qtd', colQty, headerY, { width: 34 });
  doc.text('Un', colUnit, headerY, { width: 28 });
  doc.text('Descrição', colDesc, headerY, { width: descWidth });
  doc.text('Unit.', colUnitPrice, headerY, { width: 58, align: 'right' });
  doc.text('Total', colTotal, headerY, { width: 58, align: 'right' });
  doc.save();
  doc.moveTo(marginLeft, headerY + 14).lineTo(marginLeft + pageWidth, headerY + 14).strokeColor('#d7dee7').lineWidth(1).stroke();
  doc.restore();

  let cursorY = headerY + 22;
  items.forEach((it, index) => {
    const quantity = Number(it.quantity || 0);
    const unitPrice = Number(it.price || 0);
    const lineTotal = quantity * unitPrice;
    const title = String(it.name || '');
    const detail = String(it.description || it.id || '');
    const descHeight = doc.heightOfString(title, { width: descWidth }) + doc.heightOfString(detail, { width: descWidth });
    const rowHeight = Math.max(26, descHeight + 6);

    if (index % 2 === 0) {
      doc.save();
      doc.roundedRect(marginLeft + 4, cursorY - 4, pageWidth - 8, rowHeight + 4, 8).fill('#fcfdff');
      doc.restore();
    }

    doc.fillColor('#334155').font('Helvetica').fontSize(9).text(String(quantity), colQty, cursorY, { width: 34 });
    doc.text(String(it.unit || ''), colUnit, cursorY, { width: 28 });
    doc.fillColor('#0f172a').font('Helvetica-Bold').text(title, colDesc, cursorY, { width: descWidth });
    doc.fillColor('#64748b').font('Helvetica').fontSize(8).text(detail, colDesc, cursorY + 12, { width: descWidth });
    doc.fillColor('#334155').font('Helvetica').fontSize(9).text(formatMoney(unitPrice), colUnitPrice, cursorY, { width: 58, align: 'right' });
    doc.font('Helvetica-Bold').text(formatMoney(lineTotal), colTotal, cursorY, { width: 58, align: 'right' });

    cursorY += rowHeight + 8;
  });

  const lowerTop = cursorY + 12;
  const notesWidth = pageWidth - 200 - gap;
  const sideCardWidth = 200;
  const notesHeight = 116;

  drawBox(marginLeft, lowerTop, notesWidth, notesHeight, { stroke: '#d7dee7', radius: 12 });
  writeLabel('Observações', marginLeft + 14, lowerTop + 12, notesWidth - 28);
  doc.fillColor('#334155').font('Helvetica').fontSize(9.5).text(receipt.notes || 'Nenhuma observação informada.', marginLeft + 14, lowerTop + 30, {
    width: notesWidth - 28,
    height: notesHeight - 44
  });

  const summaryX = marginLeft + notesWidth + gap;
  drawBox(summaryX, lowerTop, sideCardWidth, notesHeight, { fill: '#0f172a', stroke: '#0f172a', radius: 12 });
  doc.fillColor('#cbd5e1').font('Helvetica-Bold').fontSize(7.6).text('RESUMO FINANCEIRO', summaryX + 14, lowerTop + 14, { width: sideCardWidth - 28 });
  const summaryLabelWidth = 82;
  const summaryValueX = summaryX + 14 + summaryLabelWidth;
  const summaryValueWidth = sideCardWidth - 28 - summaryLabelWidth;
  doc.fillColor('#cbd5e1').font('Helvetica').fontSize(8.3).text('Itens', summaryX + 14, lowerTop + 34, { width: summaryLabelWidth });
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.8).text(String(items.length), summaryValueX, lowerTop + 34, { width: summaryValueWidth, align: 'right' });
  doc.fillColor('#cbd5e1').font('Helvetica').fontSize(8.3).text('Pagamento', summaryX + 14, lowerTop + 54, { width: summaryLabelWidth });
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.8).text(paymentMethodLabel, summaryValueX, lowerTop + 54, { width: summaryValueWidth, align: 'right' });
  doc.save();
  doc.moveTo(summaryX + 14, lowerTop + 76).lineTo(summaryX + sideCardWidth - 14, lowerTop + 76).strokeColor('#334155').lineWidth(1).stroke();
  doc.restore();
  doc.fillColor('#cbd5e1').font('Helvetica-Bold').fontSize(7.8).text('TOTAL GERAL', summaryX + 14, lowerTop + 84, { width: sideCardWidth - 28 });
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12.5).text(formatMoney(total), summaryX + 14, lowerTop + 98, {
    width: sideCardWidth - 28,
    align: 'right'
  });

  const paymentTop = lowerTop + notesHeight + 16;
  const paymentWidth = (pageWidth - gap) / 2;
  const paymentHeight = 72;

  drawBox(marginLeft, paymentTop, paymentWidth, paymentHeight, { stroke: '#d7dee7', radius: 12 });
  writeLabel('Forma de Pagamento', marginLeft + 14, paymentTop + 12, paymentWidth - 28);
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text(paymentMethodLabel, marginLeft + 14, paymentTop + 30, { width: paymentWidth - 28 });
  if (paymentPlan) {
    doc.fillColor('#64748b').font('Helvetica').fontSize(8.5).text(paymentPlan, marginLeft + 14, paymentTop + 46, { width: paymentWidth - 28 });
  }

  const shippingX = marginLeft + paymentWidth + gap;
  drawBox(shippingX, paymentTop, paymentWidth, paymentHeight, { stroke: '#d7dee7', radius: 12 });
  writeLabel('Tipo de Frete', shippingX + 14, paymentTop + 12, paymentWidth - 28);
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text(shippingMethodLabel, shippingX + 14, paymentTop + 30, { width: paymentWidth - 28 });

  const footerY = paymentTop + paymentHeight + 26;
  doc.save();
  doc.moveTo(marginLeft, footerY).lineTo(marginLeft + pageWidth, footerY).dash(3, { space: 3 }).strokeColor('#cbd5e1').lineWidth(1).stroke();
  doc.undash();
  doc.restore();
  doc.fillColor('#94a3b8').font('Helvetica').fontSize(8.5).text('Emitido via SalesForce App', marginLeft, footerY + 12, { width: pageWidth, align: 'center' });
  doc.text(formatDateTimePtBr(), marginLeft, footerY + 24, { width: pageWidth, align: 'center' });
};

const renderProductCatalogPDF = (doc, payload = {}) => {
  const products = Array.isArray(payload.products) ? payload.products : [];
  const searchTerm = String(payload.searchTerm || '').trim();
  const selectedCategory = String(payload.category || 'Todas').trim() || 'Todas';
  const generatedAt = formatDateTimePtBr(new Date().toISOString());
  const marginLeft = doc.page.margins.left;
  const marginTop = doc.page.margins.top;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const contentBottom = doc.page.height - doc.page.margins.bottom;
  const colCode = marginLeft + 14;
  const colDesc = marginLeft + 110;
  const colMeta = marginLeft + pageWidth - 180;
  const colPrice = marginLeft + pageWidth - 84;
  const descWidth = colMeta - colDesc - 12;
  let pageNumber = 0;
  let cursorY = marginTop;

  const grouped = products.reduce((acc, product) => {
    const categoryName = String(product.category || 'Sem categoria').trim() || 'Sem categoria';
    if (!acc.has(categoryName)) acc.set(categoryName, []);
    acc.get(categoryName).push(product);
    return acc;
  }, new Map());

  const drawPageHeader = () => {
    doc.save();
    doc.roundedRect(marginLeft, marginTop, pageWidth, 78, 14).fill('#f8fafc');
    doc.restore();

    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(20).text('Catálogo de Produtos', marginLeft + 18, marginTop + 16, {
      width: pageWidth - 36
    });
    doc.fillColor('#475569').font('Helvetica').fontSize(9.5).text(
      `Gerado em ${generatedAt}`,
      marginLeft + 18,
      marginTop + 42,
      { width: pageWidth - 36 }
    );

    const filterSummary = [
      searchTerm ? `Busca: "${searchTerm}"` : 'Busca: todas',
      selectedCategory && selectedCategory.toLowerCase() !== 'todas' ? `Categoria: ${selectedCategory}` : 'Categoria: todas',
      `Produtos: ${products.length}`
    ].join('  •  ');

    doc.fillColor('#64748b').font('Helvetica').fontSize(8.5).text(
      filterSummary,
      marginLeft + 18,
      marginTop + 56,
      { width: pageWidth - 96 }
    );

    doc.fillColor('#94a3b8').font('Helvetica-Bold').fontSize(8).text(
      `Pág. ${pageNumber}`,
      marginLeft,
      marginTop + 58,
      { width: pageWidth - 18, align: 'right' }
    );

    return marginTop + 98;
  };

  const startPage = () => {
    if (pageNumber > 0) doc.addPage();
    pageNumber += 1;
    cursorY = drawPageHeader();
  };

  const ensureSpace = (requiredHeight) => {
    if (cursorY + requiredHeight <= contentBottom - 24) return;
    startPage();
  };

  const drawCategoryHeader = (categoryName, itemCount) => {
    ensureSpace(34);
    doc.save();
    doc.roundedRect(marginLeft, cursorY, pageWidth, 24, 10).fill('#dbeafe');
    doc.restore();
    doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(11).text(categoryName, marginLeft + 12, cursorY + 7, {
      width: pageWidth - 140
    });
    doc.fillColor('#1d4ed8').font('Helvetica-Bold').fontSize(8.5).text(
      `${itemCount} item(ns)`,
      marginLeft,
      cursorY + 8,
      { width: pageWidth - 12, align: 'right' }
    );
    cursorY += 32;
  };

  const drawProductRow = (product, index) => {
    const code = String(product.id || product.plu || product.code || '-');
    const title = String(product.name || 'Produto');
    const detailParts = [
      product.description ? String(product.description) : null,
      product.unit ? `Unidade: ${product.unit}` : null,
      Number.isFinite(Number(product.stock)) ? `Estoque: ${Number(product.stock)}` : null
    ].filter(Boolean);
    const detail = detailParts.join('  •  ');
    const titleHeight = doc.heightOfString(title, { width: descWidth });
    const detailHeight = detail ? doc.heightOfString(detail, { width: descWidth }) : 0;
    const rowHeight = Math.max(38, titleHeight + detailHeight + 14);

    ensureSpace(rowHeight + 8);

    if (index % 2 === 0) {
      doc.save();
      doc.roundedRect(marginLeft + 4, cursorY - 2, pageWidth - 8, rowHeight, 8).fill('#fcfdff');
      doc.restore();
    }

    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8.5).text(code, colCode, cursorY + 4, { width: 86 });
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text(title, colDesc, cursorY + 4, { width: descWidth });
    if (detail) {
      doc.fillColor('#64748b').font('Helvetica').fontSize(8).text(detail, colDesc, cursorY + 18, { width: descWidth });
    }
    doc.fillColor('#334155').font('Helvetica').fontSize(8.5).text(
      `SKU ${code}`,
      colMeta,
      cursorY + 4,
      { width: 72, align: 'right' }
    );
    doc.font('Helvetica-Bold').fontSize(10).text(
      formatMoney(product.price),
      colPrice,
      cursorY + 4,
      { width: 70, align: 'right' }
    );

    cursorY += rowHeight + 8;
  };

  startPage();

  if (products.length === 0) {
    doc.fillColor('#64748b').font('Helvetica').fontSize(11).text(
      'Nenhum produto encontrado para os filtros informados.',
      marginLeft,
      cursorY + 16,
      { width: pageWidth, align: 'center' }
    );
    return;
  }

  Array.from(grouped.entries())
    .sort((left, right) => left[0].localeCompare(right[0], 'pt-BR'))
    .forEach(([categoryName, items]) => {
      drawCategoryHeader(categoryName, items.length);
      items.forEach((product, index) => drawProductRow(product, index));
      cursorY += 6;
    });
};
// --- GERAR PDF DE RECIBO (SERVER-SIDE) ---
// POST /api/recibo/pdf  -> Body: { id, displayId, customer, items:[{name,quantity,unit,price}], total, store? }
app.post('/api/recibo/pdf', verifyToken, async (req, res) => {
  try {
    const receipt = req.body || {};
    const storeId = getStoreIdFromRequest(req);

    // Busca store_info para cabeçalho caso não venha no body
    let store = receipt.store;
    if (!store) {
      try {
        await ensureStoreInfoRow(storeId);
        store = await db.get("SELECT * FROM store_info WHERE id = ?", [storeId]);
      } catch {}
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=pedido-${receipt.displayId || 'recibo'}.pdf`);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);
    renderReceiptPDF(doc, receipt, store);
    doc.end();

  } catch (e) {
    console.error('[PDF_ERROR]', e);
    res.status(500).json({ message: 'Falha ao gerar PDF.' });
  }
});

// PDF público para uso direto no PWA (sem auth)
app.post('/api/recibo/pdf/public', async (req, res) => {
  try {
    const receipt = req.body || {};
    const storeId = getStoreIdFromRequest(req);
    let store = receipt.store;
    if (!store) {
      try {
        await ensureStoreInfoRow(storeId);
        store = await db.get("SELECT * FROM store_info WHERE id = ?", [storeId]);
      } catch {}
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=pedido-${receipt.displayId || 'recibo'}.pdf`);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);
    renderReceiptPDF(doc, receipt, store);
    doc.end();
  } catch (e) {
    console.error('[PDF_PUBLIC_ERROR]', e);
    res.status(500).json({ message: 'Falha ao gerar PDF.' });
  }
});

app.get('/api/catalogo-produtos/pdf', verifyToken, async (req, res) => {
  try {
    const storeId = getStoreIdForProducts(req);
    const searchTerm = String(req.query.search || '').trim();
    const category = String(req.query.category || '').trim();
    let query = `
      SELECT plu, name, description, price, stock, category, unit
      FROM products
      WHERE (store_id = ? OR store_id IS NULL)
    `;
    const params = [storeId];

    if (searchTerm) {
      const normalizedSearch = `%${searchTerm.toLowerCase()}%`;
      query += ` AND (
        LOWER(COALESCE(plu, '')) LIKE ?
        OR LOWER(COALESCE(name, '')) LIKE ?
        OR LOWER(COALESCE(description, '')) LIKE ?
      )`;
      params.push(normalizedSearch, normalizedSearch, normalizedSearch);
    }

    if (category && category.toLowerCase() !== 'todas') {
      query += ` AND LOWER(COALESCE(category, '')) = ?`;
      params.push(category.toLowerCase());
    }

    query += ` ORDER BY category COLLATE NOCASE ASC, name COLLATE NOCASE ASC`;

    const rows = await db.query(query, params);
    const products = rows.map((product) => ({
      id: product.plu,
      name: product.name,
      description: product.description,
      price: Number(product.price || 0),
      stock: Number(product.stock || 0),
      category: product.category || 'Sem categoria',
      unit: product.unit || 'UN'
    }));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="catalogo-produtos.pdf"');

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);
    renderProductCatalogPDF(doc, { products, searchTerm, category });
    doc.end();
  } catch (e) {
    console.error('[PRODUCT_CATALOG_PDF_ERROR]', e);
    res.status(500).json({ message: 'Falha ao gerar catálogo em PDF.' });
  }
});
// Endpoint genérico para teste de envio de e-mail
app.post('/api/sendmail', verifyToken, async (req, res) => {
  if (!mailer) return res.status(400).json({ message: 'Mailer não configurado.' });
  const { to, subject, text, html, attachments } = req.body || {};
  if (!to || !subject) return res.status(400).json({ message: 'Parâmetros inválidos.' });
  try {
    const opts = { from: MAILER_FROM, to, subject, text, html };
    if (attachments && Array.isArray(attachments)) {
      // attachments: [{ filename, content (base64), encoding: 'base64' }]
      opts.attachments = attachments.map(a => ({ filename: a.filename, content: a.content, encoding: a.encoding || 'base64' }));
    }
    const info = await mailer.sendMail(opts);
    res.json({ success: true, id: info.messageId });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});


app.post('/api/ai/image', verifyToken, async (req, res) => {
  try {
    if (!GEMINI_API_KEY || !genAI) {
      return res.status(400).json({ message: 'GEMINI_API_KEY não configurada no servidor.' });
    }
    const { product } = req.body || {};
    if (!product || !product.name) {
      return res.status(400).json({ message: 'Produto inválido.' });
    }

    const prompt = `Professional product photography of ${product.name}, ${product.description || ''}. ` +
      `High quality, 4k, realistic, studio lighting, white background, commercial photography.`;

    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: prompt }] },
    });

    let dataUrl = null;
    const candidates = response?.candidates || [];
    if (candidates[0]?.content?.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          dataUrl = `data:${mime};base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (!dataUrl) return res.status(500).json({ message: 'Não foi possível gerar a imagem.' });
    return res.json({ imageDataUrl: dataUrl });
  } catch (e) {
    console.error('[AI] Erro image:', e);
    return res.status(500).json({ message: 'Erro ao gerar imagem.' });
  }
});

// --- SERVIR FRONTEND ---
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

app.listen(PORT, HOST, () => {
  console.log(`\n🚀 Servidor rodando em: http://localhost:${PORT}`);
  console.log(`📦 Modo Banco de Dados: ${isPostgres ? 'PostgreSQL (Remoto)' : 'SQLite (Local)'}\n`);
  // Evite logar segredos em produção
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
