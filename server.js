
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

// Configuração Básica
const app = express();
const PORT = process.env.PORT || 8080; 
const SECRET_KEY = process.env.SECRET_KEY || 'super-secret-key-change-this-in-production';
// Master Key para acesso facilitado (Bypass de JWT)
const MASTER_KEY = process.env.MASTER_KEY || 'salesforce-pro-token';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'SEU_CLIENT_ID_AQUI.apps.googleusercontent.com';
const DB_PATH = process.env.DB_PATH || './database.sqlite';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
let genAI = null;
if (GEMINI_API_KEY) {
  try {
    genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  } catch (e) {
    console.warn('[AI] Falha ao inicializar GoogleGenAI:', e.message);
  }
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
            phone TEXT,
            city TEXT,
            seller_id TEXT 
        )`);

        // Migração: adicionar seller_id se não existir
        try {
            await db.run("ALTER TABLE customers ADD COLUMN seller_id TEXT");
        } catch (e) {}

        // Tabela de Pedidos
        await db.run(`CREATE TABLE IF NOT EXISTS orders (
            id ${idType} PRIMARY KEY ${autoInc},
            customer_id TEXT, 
            total REAL,
            status TEXT,
            created_at TEXT
        )`);

        // Tabela de Itens do Pedido
        await db.run(`CREATE TABLE IF NOT EXISTS order_items (
            id ${idType} PRIMARY KEY ${autoInc},
            order_id INTEGER,
            product_code TEXT,
            quantity REAL,
            unit_price REAL,
            FOREIGN KEY(order_id) REFERENCES orders(id)
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

    } catch (e) {
        console.error("Erro na migração de DB:", e);
    }
}

initDb();

// --- ROTAS DE AUTENTICAÇÃO ---

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
  // LÓGICA DE LIMITE ROBUSTA:
  // Se limit não for enviado, assume 50 (paginação padrão).
  // Se limit for enviado e for <= 0, assume SEM LIMITES (Sync).
  
  let limit = 50; 
  if (req.query.limit) {
      const parsed = parseInt(req.query.limit);
      if (!isNaN(parsed)) limit = parsed;
  }
  
  const page = parseInt(req.query.page) || 1;
  const offset = (page - 1) * limit;

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
    
    // LÓGICA DE LIMITE ROBUSTA:
    // Se limit não for enviado, assume 50 (paginação padrão para não travar).
    // Se limit for <= 0 (ex: -1), remove limites.
    let limit = 50; 
    if (req.query.limit) {
        const parsed = parseInt(req.query.limit);
        if (!isNaN(parsed)) limit = parsed;
    }

    try {
        let query = "SELECT * FROM customers";
        const params = [];

        // Filtra por vendedor se fornecido
        if (vendedorId) {
            query += " WHERE seller_id = ?";
            params.push(vendedorId);
        }
        
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
            cliente_codigo: c.id,
            cliente_razao_social: c.name,
            cliente_nome_fantasia: c.fantasy_name,
            cliente_cnpj_cpf: c.document,
            cliente_endereco: c.address,
            cliente_numero: 'S/N', // Mock
            cliente_bairro: 'Centro', // Mock
            cliente_cidade: c.city,
            cliente_uf: 'UF', // Mock
            cliente_cep: '00000-000', // Mock
            cliente_telefone1: c.phone,
            cliente_email: '',
            // MOCKS PARA OS NOVOS CAMPOS
            vendedor_nome: 'ANDRE', // Mock fixo para teste
            vendedor_codigo: c.seller_id || '',
            ultima_venda_data: new Date().toISOString().split('T')[0],
            ultima_venda_valor: 150.00
        }));
        res.json(mapped);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Salvar Pedido
app.post('/api/pedidos', verifyToken, async (req, res) => {
  const { cliente_id, total, data_criacao, itens } = req.body;

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

  try {
      // Nota: customer_id agora é TEXT no CREATE TABLE para aceitar UUIDs do frontend
      const orderRes = isPostgres 
        ? await db.run("INSERT INTO orders (customer_id, total, status, created_at) VALUES (?, ?, ?, ?) RETURNING id", [String(cliente_id), total, 'confirmed', data_criacao])
        : await db.run("INSERT INTO orders (customer_id, total, status, created_at) VALUES (?, ?, ?, ?)", [String(cliente_id), total, 'confirmed', data_criacao]);
      
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
  console.log(`🔑 Master Key Ativa: ${MASTER_KEY} (Use isso no campo Token de Integração se tiver problemas)\n`);
});
