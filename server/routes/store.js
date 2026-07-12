import { Router } from 'express';
import { db, ensureStoreInfoRow } from '../db.js';
import { getStoreIdFromRequest, formatStoreCode } from '../config.js';

function buildStoreCatalogEntry(storeId, row = {}) {
  const code = formatStoreCode(storeId);
  return {
    id: storeId,
    codigo: code,
    lojcod: code,
    LOJCOD: code,
    nome: row.trade_name || row.legal_name || '',
    nome_fantasia: row.trade_name || '',
    razao_social: row.legal_name || '',
    cnpj_cpf: row.document || '',
    email: row.email || '',
    telefone: row.phone || '',
    logradouro: row.street || '',
    numero: row.number || '',
    bairro: row.neighborhood || '',
    cidade: row.city || '',
    estado: row.state || '',
    cep: row.zip || '',
    complemento: row.complement || '',
    trade_name: row.trade_name || '',
    legal_name: row.legal_name || '',
    document: row.document || '',
    phone: row.phone || '',
    street: row.street || '',
    neighborhood: row.neighborhood || '',
    city: row.city || '',
    state: row.state || '',
    zip: row.zip || '',
    updated_at: row.updated_at || null
  };
}

export function createStoreRoutes(ctx) {
  const router = Router();
  const { verifyToken } = ctx;

  const STORE_FIELDS = [
    'legal_name','trade_name','document','state_registration','municipal_registration','email','phone','street','number','neighborhood','city','state','zip','complement','logo_url'
  ];

  function extractStoreFields(body) {
    const data = {};
    STORE_FIELDS.forEach(k => { if (body[k] !== undefined) data[k] = body[k]; });
    data.updated_at = new Date().toISOString();
    return data;
  }

  async function updateStoreInfo(storeId, body) {
    const data = extractStoreFields(body);
    const setCols = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const params = Object.values(data);
    await db.run(`UPDATE store_info SET ${setCols} WHERE id = ?`, [...params, storeId]);
    const row = await db.get("SELECT * FROM store_info WHERE id = ?", [storeId]);
    return row;
  }

  // Dados da Loja (privado)
  router.get('/api/store', verifyToken, async (req, res) => {
    try {
      const storeId = getStoreIdFromRequest(req);
      await ensureStoreInfoRow(storeId);
      const row = await db.get("SELECT * FROM store_info WHERE id = ?", [storeId]);
      res.json(row || {});
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/api/store', verifyToken, async (req, res) => {
    try {
      const storeId = getStoreIdFromRequest(req);
      await ensureStoreInfoRow(storeId);
      const row = await updateStoreInfo(storeId, req.body);
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Dados da Loja (público) — usado pelo PWA em produção
  router.get('/api/store/public', async (req, res) => {
    try {
      const storeId = getStoreIdFromRequest(req);
      await ensureStoreInfoRow(storeId);
      const row = await db.get("SELECT * FROM store_info WHERE id = ?", [storeId]);
      res.json(row || {});
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/api/lojas', async (req, res) => {
    try {
      const storeId = getStoreIdFromRequest(req);
      await ensureStoreInfoRow(storeId);
      const row = await db.get("SELECT * FROM store_info WHERE id = ?", [storeId]);
      res.json([buildStoreCatalogEntry(storeId, row || {})]);
    } catch (e) {
      console.error('[STORE] Falha ao montar /api/lojas local:', e.message);
      res.status(500).json({ message: 'Erro ao carregar lojas.' });
    }
  });

  router.get('/api/meta/enums', async (_req, res) => {
    res.json({ data: [] });
  });

  router.put('/api/store/public', async (req, res) => {
    try {
      const storeId = getStoreIdFromRequest(req);
      await ensureStoreInfoRow(storeId);
      const row = await updateStoreInfo(storeId, req.body);
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
