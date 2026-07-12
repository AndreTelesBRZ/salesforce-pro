import sqlite3 from 'sqlite3';
import pg from 'pg';

const DB_PATH = process.env.DB_PATH || './database.sqlite';
const DEFAULT_STORE_ID = 1;

const isPostgres = !!process.env.DATABASE_URL;

class DatabaseAdapter {
    constructor() {
        if (isPostgres) {
            console.log('Conectando ao PostgreSQL...');
            this.pool = new pg.Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: { rejectUnauthorized: false }
            });
        } else {
            console.log('Conectando ao SQLite local...');
            this.sqlite = new sqlite3.Database(DB_PATH);
        }
    }

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

export const isPrivilegedUser = (userId) => userId === 'master-admin' || userId === 'integration-token';

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

export async function initDb() {
    try {
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

        try {
            await db.run("ALTER TABLE users ADD COLUMN seller_id TEXT");
            console.log("Coluna seller_id adicionada em users.");
        } catch (e) {}

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

        try { await db.run("ALTER TABLE customers ADD COLUMN seller_id TEXT"); } catch (e) {}
        try { await db.run("ALTER TABLE customers ADD COLUMN address_number TEXT"); } catch (e) {}
        try { await db.run("ALTER TABLE customers ADD COLUMN neighborhood TEXT"); } catch (e) {}
        try { await db.run("ALTER TABLE customers ADD COLUMN state TEXT"); } catch (e) {}
        try { await db.run("ALTER TABLE customers ADD COLUMN zip TEXT"); } catch (e) {}
        try { await db.run("ALTER TABLE customers ADD COLUMN status TEXT"); } catch (e) {}
        try { await db.run("ALTER TABLE customers ADD COLUMN origin TEXT"); } catch (e) {}

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

        await db.run(`CREATE TABLE IF NOT EXISTS order_items (
            id ${idType} PRIMARY KEY ${autoInc},
            order_id INTEGER,
            product_code TEXT,
            quantity REAL,
            unit_price REAL,
            FOREIGN KEY(order_id) REFERENCES orders(id)
        )`);

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

        const prodCount = await db.get("SELECT count(*) as count FROM products");
        if (prodCount && parseInt(prodCount.count) === 0) {
            console.log("Populando produtos iniciais...");
            const insertProd = `INSERT INTO products (plu, name, description, price, stock, category, unit, store_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
            await db.run(insertProd, ["0002899", "PARAF FRANCES 1/4X3 ZB", "Parafuso Francês 1/4 x 3 Zincado Branco", 65.91, 100, "Fixadores", "CTO", DEFAULT_STORE_ID]);
            await db.run(insertProd, ["0000001", "Martelo Unha", "Martelo de aço forjado cabo de madeira", 45.50, 20, "Ferramentas", "UN", DEFAULT_STORE_ID]);
            await db.run(insertProd, ["0000002", "Chave Philips", "Chave Philips 3/16 x 4", 12.90, 50, "Ferramentas", "UN", DEFAULT_STORE_ID]);
        }

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

        try { await db.run("UPDATE customers SET status = 'NORMAL' WHERE status IS NULL"); } catch (e) {}

        const planCount = await db.get("SELECT count(*) as count FROM payment_plans");
        if (planCount && parseInt(planCount.count) === 0) {
            await db.run(
                "INSERT INTO payment_plans (code, description, installments, days_between_installments, min_value) VALUES (?, ?, ?, ?, ?)",
                ["01", "A VISTA", 1, 0, 0]
            );
        }

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

        try {
            for (const storeId of [1, 3]) {
                await ensureStoreInfoRow(storeId);
            }
        } catch (e) {}

    } catch (e) {
        console.error("Erro na migração de DB:", e);
    }
}

export const normalizeDocument = (value) => String(value || '').replace(/\D/g, '');

export const isValidCnpj = (value) => {
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

export const mapCustomerPayload = (c) => ({
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

export const buildSefazMock = (cnpj) => {
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

export { db, isPostgres, ensureStoreInfoRow };
