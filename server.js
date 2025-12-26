
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
const STORE_HOST_MAP = {
  'vendas.edsondosparafusos.app.br': 1,
  'vendas.llfix.app.br': 3
};

const normalizeHost = (value) => {
  const raw = String(value || '').split(',')[0].trim().toLowerCase();
  if (!raw) return '';
  const noProto = raw.replace(/^https?:\/\//, '');
  return noProto.replace(/:\d+$/, '');
};

const getRequestHost = (req) => {
  const forwarded = req.headers['x-forwarded-host'];
  const rawHost = Array.isArray(forwarded) ? forwarded[0] : forwarded || req.headers.host || '';
  return normalizeHost(rawHost);
};

const resolveStoreIdFromHost = (host) => STORE_HOST_MAP[host] || DEFAULT_STORE_ID;
const getStoreIdFromRequest = (req) => resolveStoreIdFromHost(getRequestHost(req));

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
            image_url TEXT
        )`);

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
            const insertProd = `INSERT INTO products (plu, name, description, price, stock, category, unit) VALUES (?, ?, ?, ?, ?, ?, ?)`;
            await db.run(insertProd, ["0002899", "PARAF FRANCES 1/4X3 ZB", "Parafuso Francês 1/4 x 3 Zincado Branco", 65.91, 100, "Fixadores", "CTO"]);
            await db.run(insertProd, ["0000001", "Martelo Unha", "Martelo de aço forjado cabo de madeira", 45.50, 20, "Ferramentas", "UN"]);
            await db.run(insertProd, ["0000002", "Chave Philips", "Chave Philips 3/16 x 4", 12.90, 50, "Ferramentas", "UN"]);
        }

        // Criar ou Atualizar Admin
        const userCount = await db.get("SELECT count(*) as count FROM users WHERE lower(email) = ?", ['admin']);
        if (!userCount || parseInt(userCount.count) === 0) {
            const hash = bcrypt.hashSync("123456", 8);
            const now = new Date().toISOString();
            // Admin recebe seller_id 000002 por padrão para testes
            await db.run("INSERT INTO users (name, email, password, created_at, seller_id) VALUES (?, ?, ?, ?, ?)", ["Administrador", "admin", hash, now, "000002"]);
            console.log("Usuário 'admin' criado (senha: 123456) com seller_id=000002");
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
            updated_at TEXT
        )`);

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

        // SIMULAÇÃO DE ENVIO DE EMAIL
        console.log(`\n============================================`);
        console.log(`[EMAIL SIMULADO] Para: ${emailLower}`);
        console.log(`[EMAIL SIMULADO] Seu código de acesso é: ${code}`);
        console.log(`============================================\n`);

        res.status(200).json({ success: true, message: 'Código enviado para o e-mail (Verifique o console do servidor).' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Erro ao processar solicitação.' });
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

// Middleware de Verificação de Token
const verifyToken = (req, res, next) => {
  const tokenHeader = req.headers['authorization'];
  if (!tokenHeader) {
      console.log('[AUTH_FAIL] Token não fornecido no header Authorization');
      return res.status(403).json({ message: 'Token não fornecido.' });
  }
  
  const token = tokenHeader.split(' ')[1];
  if (!token) {
      console.log('[AUTH_FAIL] Formato inválido de token');
      return res.status(403).json({ message: 'Formato inválido.' });
  }

  // BYPASS: Se o token for a chave mestra, permite acesso como Admin
  if (token === MASTER_KEY) {
      console.log('[AUTH_SUCCESS] Acesso via Master Key');
      req.userId = 'master-admin';
      return next();
  }

  jwt.verify(token, SECRET_KEY, (err, decoded) => {
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
    if (req.userId === 'master-admin') {
        return res.json({ id: 0, name: 'Admin Master', email: 'master@admin.com', seller_id: '' });
    }

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
      let query = "SELECT * FROM products ORDER BY name";
      let params = [];

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

// Adicionar Produto (Novo)
app.post('/api/products', verifyToken, async (req, res) => {
    const { codigo, nome, descricao_completa, preco, estoque, categoria, unidade, imagem_url } = req.body;
    
    if (!codigo || !nome || !preco) {
        return res.status(400).json({ message: 'Campos obrigatórios: codigo, nome, preco.' });
    }

    try {
        await db.run(
            `INSERT INTO products (plu, name, description, price, stock, category, unit, image_url) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [codigo, nome, descricao_completa || '', preco, estoque || 0, categoria || 'Geral', unidade || 'UN', imagem_url || '']
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
    const vendedorId = req.query.vendedor_id;
    
    // LÓGICA DE LIMITE ROBUSTA (atualizada): sem parâmetro -> sem limite (sync completo).
    // Se limit > 0, aplica paginação.
    let limit = -1; 
    if (req.query.limit !== undefined) {
        const parsed = parseInt(req.query.limit);
        if (!isNaN(parsed)) limit = parsed;
    }

    try {
        let query = "SELECT * FROM customers";
        const params = [];

        const where = ["(status IS NULL OR status != 'TEMPORARIO')"];
        if (vendedorId) {
            where.push("seller_id = ?");
            params.push(vendedorId);
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
        const query = isPostgres
            ? "SELECT * FROM customers WHERE regexp_replace(document, '[^0-9]', '', 'g') = $1 LIMIT 1"
            : "SELECT * FROM customers WHERE REPLACE(REPLACE(REPLACE(REPLACE(document, '.', ''), '-', ''), '/', ''), ' ', '') = ? LIMIT 1";
        const row = await db.get(query, [normalized]);
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
        const query = isPostgres
            ? "SELECT * FROM customers WHERE regexp_replace(document, '[^0-9]', '', 'g') = $1 LIMIT 1"
            : "SELECT * FROM customers WHERE REPLACE(REPLACE(REPLACE(REPLACE(document, '.', ''), '-', ''), '/', ''), ' ', '') = ? LIMIT 1";
        const existing = await db.get(query, [normalized]);
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
            vendedor_id || null
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
        const customer = await db.get("SELECT id, status FROM customers WHERE id = ?", [String(cliente_codigo)]);
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

// Salvar Pedido
app.post('/api/pedidos', verifyToken, async (req, res) => {
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
});

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

const renderReceiptPDF = (doc, receipt, store) => {
  const marginLeft = doc.page.margins.left;
  const marginRight = doc.page.margins.right;
  const pageWidth = doc.page.width - marginLeft - marginRight;
  const safeDate = receipt.createdAt ? new Date(receipt.createdAt) : new Date();

  doc.fontSize(16).text(store?.trade_name || 'SalesForce Pro', marginLeft, doc.y);
  if (store?.legal_name) doc.fontSize(9).text(store.legal_name);
  if (store?.document) doc.text(`CNPJ/CPF: ${store.document}`);
  const addr = [store?.street, store?.number, store?.neighborhood, store?.city && `${store.city}/${store.state}`, store?.zip]
    .filter(Boolean)
    .join(' - ');
  if (addr) doc.text(addr);
  if (store?.phone) doc.text(`Fone: ${store.phone}`);

  doc.moveDown(0.5);
  const infoY = doc.y;
  doc.fontSize(10).text(`Pedido: #${receipt.displayId || ''}`, marginLeft, infoY, { width: pageWidth, align: 'right' });
  doc.text(`Data: ${safeDate.toLocaleDateString()}`, marginLeft, infoY + 12, { width: pageWidth, align: 'right' });
  doc.moveDown(2);

  doc.fontSize(10).text(`Cliente: ${receipt.customer || ''}`);
  if (receipt.customerDoc) doc.text(`Documento: ${receipt.customerDoc}`);
  if (receipt.sellerName || receipt.sellerId) {
    doc.text(`Vendedor: ${receipt.sellerName || ''}${receipt.sellerId ? ` (${receipt.sellerId})` : ''}`);
  }
  doc.moveDown();

  // Itens (tabela)
  doc.fontSize(10).text('Itens', { underline: true });
  doc.moveDown(0.5);

  const colQty = marginLeft;
  const colUnit = marginLeft + 40;
  const colDesc = marginLeft + 70;
  const colUnitPrice = marginLeft + pageWidth - 140;
  const colTotal = marginLeft + pageWidth - 60;
  const descWidth = colUnitPrice - colDesc - 10;

  doc.fontSize(9).text('Qtd', colQty, doc.y, { width: 35 });
  doc.text('Un', colUnit, doc.y, { width: 30 });
  doc.text('Descrição', colDesc, doc.y, { width: descWidth });
  doc.text('Unit', colUnitPrice, doc.y, { width: 60, align: 'right' });
  doc.text('Total', colTotal, doc.y, { width: 60, align: 'right' });
  doc.moveDown(0.6);
  doc.moveTo(marginLeft, doc.y).lineTo(marginLeft + pageWidth, doc.y).strokeColor('#cbd5f5').stroke();
  doc.moveDown(0.4);

  doc.fontSize(9);
  (receipt.items || []).forEach((it) => {
    const rowY = doc.y;
    const quantity = Number(it.quantity || 0);
    const unitPrice = Number(it.price || 0);
    const total = quantity * unitPrice;
    const desc = String(it.name || '');
    const descHeight = doc.heightOfString(desc, { width: descWidth });
    const rowHeight = Math.max(descHeight, 12);

    doc.text(String(quantity), colQty, rowY, { width: 35 });
    doc.text(String(it.unit || ''), colUnit, rowY, { width: 30 });
    doc.text(desc, colDesc, rowY, { width: descWidth });
    doc.text(formatMoney(unitPrice), colUnitPrice, rowY, { width: 60, align: 'right' });
    doc.text(formatMoney(total), colTotal, rowY, { width: 60, align: 'right' });
    doc.y = rowY + rowHeight + 4;
  });

  doc.moveDown();
  doc.fontSize(10).text('Observações', { underline: true });
  doc.fontSize(9).text(receipt.notes || '—');

  doc.moveDown();
  doc.fontSize(10).text('Forma de Pagamento', { underline: true });
  doc.fontSize(9).text(receipt.paymentMethod || '—');
  if (receipt.paymentPlanDescription) {
    doc.text(`Plano: ${receipt.paymentPlanDescription}${receipt.paymentInstallments ? ` (${receipt.paymentInstallments}x)` : ''}`);
  }

  doc.moveDown();
  doc.fontSize(10).text('Tipo de Frete', { underline: true });
  doc.fontSize(9).text(receipt.shippingMethod || '—');

  doc.moveDown(1.2);
  doc.fontSize(12).text(`Total Geral: ${formatMoney(receipt.total)}`, { align: 'right' });
  doc.moveDown().fontSize(8).text('Emitido via SalesForce App');
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Servidor rodando em: http://localhost:${PORT}`);
  console.log(`📦 Modo Banco de Dados: ${isPostgres ? 'PostgreSQL (Remoto)' : 'SQLite (Local)'}\n`);
  // Evite logar segredos em produção
  if (process.env.NODE_ENV !== 'production') {
    const mask = (v) => (v && v.length > 8 ? `${v.slice(0,4)}…${v.slice(-4)}` : '(defina via env)');
    console.log(`🔑 Master Key (mascarada): ${mask(MASTER_KEY)}\n`);
  }
});
