import { Router } from 'express';
import { db } from '../db.js';
import { ensureRemotePermission, getStoreIdForProducts } from '../config.js';

export function createProductRoutes(ctx) {
  const router = Router();
  const { verifyToken } = ctx;

  // Listar Produtos
  router.get('/api/products', verifyToken, async (req, res) => {
    if (!ensureRemotePermission(req, res, 'can_view_products', 'Usuário sem permissão para visualizar produtos.')) return;
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
  router.get('/api/produtos-sync', verifyToken, async (req, res) => {
    if (!ensureRemotePermission(req, res, 'can_view_products', 'Usuário sem permissão para visualizar produtos.')) return;
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
  router.post('/api/products', verifyToken, async (req, res) => {
      if (!ensureRemotePermission(req, res, 'can_view_products', 'Usuário sem permissão para gerenciar produtos.')) return;
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

  return router;
}
