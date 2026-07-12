import { Router } from 'express';
import { db, isPostgres } from '../db.js';

export function createOrderRoutes(ctx) {
  const router = Router();
  const { verifyToken, ensureRemotePermission } = ctx;

  const handleSaveOrder = async (req, res) => {
    if (!ensureRemotePermission(req, res, 'can_create_sales', 'Usuário sem permissão para criar pedidos.')) return;
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

    console.log(`\n[ORDER_DEBUG] Novo pedido recebido de UserID: ${req.userId}`);
    console.log(`[ORDER_DEBUG] Payload:`, JSON.stringify(req.body).substring(0, 500));

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
        const orderRes = isPostgres
          ? await db.run(
              "INSERT INTO orders (customer_id, customer_type, total, status, created_at, seller_id, seller_name, notes, payment_plan_code, payment_plan_description, payment_installments, payment_days_between, payment_min_value, payment_method, shipping_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
              [String(cliente_id), cliente_tipo || 'NORMAL', total, 'confirmed', data_criacao, vendedor_id || null, vendedor_nome || null, observacao || null, planCode, planDescription, planInstallments, planDays, planMin, payment_method || null, shipping_method || null]
            )
          : await db.run(
              "INSERT INTO orders (customer_id, customer_type, total, status, created_at, seller_id, seller_name, notes, payment_plan_code, payment_plan_description, payment_installments, payment_days_between, payment_min_value, payment_method, shipping_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              [String(cliente_id), cliente_tipo || 'NORMAL', total, 'confirmed', data_criacao, vendedor_id || null, vendedor_nome || null, observacao || null, planCode, planDescription, planInstallments, planDays, planMin, payment_method || null, shipping_method || null]
            );

        const orderId = orderRes.lastID;
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

  router.post('/api/pedidos', verifyToken, handleSaveOrder);
  router.post('/api/pedidos-venda', verifyToken, handleSaveOrder);

  router.put('/api/pedidos/:id/status', verifyToken, async (req, res) => {
    if (!ensureRemotePermission(req, res, 'can_edit_sales', 'Usuário sem permissão para editar pedidos.')) return;
    const { id } = req.params;
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ message: 'status é obrigatório.' });
    try {
      res.json({ success: true, id, status });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  });

  return router;
}
