import { Router } from 'express';
import { ensureRemotePermission } from '../config.js';
import {
  db,
  isPostgres,
  normalizeDocument,
  isValidCnpj,
  mapCustomerPayload,
  buildSefazMock,
  isPrivilegedUser,
  resolveSellerIdForRequest
} from '../db.js';

export function createCustomerRoutes(ctx) {
  const router = Router();

  const {
    db,
    isPostgres,
    verifyToken,
    ensureRemotePermission,
    resolveSellerIdForRequest,
    isPrivilegedUser,
    normalizeDocument,
    isValidCnpj,
    mapCustomerPayload,
    buildSefazMock
  } = ctx;

  // Listar Clientes
  router.get('/api/clientes', verifyToken, async (req, res) => {
    if (!ensureRemotePermission(req, res, 'can_view_clients', 'Usuário sem permissão para visualizar clientes.')) return;
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
  router.get('/api/clientes/cnpj/:cnpj', verifyToken, async (req, res) => {
    if (!ensureRemotePermission(req, res, 'can_view_clients', 'Usuário sem permissão para visualizar clientes.')) return;
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
  router.get('/api/externo/sefaz/cnpj/:cnpj', verifyToken, async (req, res) => {
    if (!ensureRemotePermission(req, res, 'can_view_clients', 'Usuário sem permissão para consultar clientes.')) return;
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
  router.post('/api/clientes/temp', verifyToken, async (req, res) => {
    if (!ensureRemotePermission(req, res, 'can_view_clients', 'Usuário sem permissão para cadastrar clientes.')) return;
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
  router.get('/api/planos-pagamento-cliente/:cliente_codigo', verifyToken, async (req, res) => {
    if (!ensureRemotePermission(req, res, 'can_view_sales', 'Usuário sem permissão para consultar condições de venda.')) return;
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

  return router;
}
