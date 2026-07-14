import { Router } from 'express';
import { buildEtiquetaEpl, buildEtiquetaEplBuffer } from '../labels/epl.js';

const PRINT_AGENT_CONNECT_MESSAGE = 'Nao foi possivel conectar ao agente de impressao. Verifique se o PC do balcao esta ligado e conectado.';

const readAgentResponse = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
};

const postRawWithTimeout = async (url, options, timeoutMs = 5000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

export function createLabelRoutes(ctx) {
  const router = Router();
  const { verifyToken, ensureRemotePermission, getPrintAgentConfigForRequest } = ctx;

  router.post('/api/etiquetas/preview', verifyToken, (req, res) => {
    if (!ensureRemotePermission(req, res, 'can_view_sales', 'Usuario sem permissao para visualizar etiquetas.')) return;
    try {
      const epl = buildEtiquetaEpl(req.body || {});
      return res.json({ status: 'ok', epl });
    } catch (error) {
      return res.status(400).json({ status: 'error', detail: error.message || 'Falha ao gerar etiqueta.' });
    }
  });

  router.post('/api/etiquetas/imprimir', verifyToken, async (req, res) => {
    if (!ensureRemotePermission(req, res, 'can_view_sales', 'Usuario sem permissao para imprimir etiquetas.')) return;

    const config = getPrintAgentConfigForRequest ? getPrintAgentConfigForRequest(req) : { url: '', token: '' };
    if (!config.url || !config.token) {
      return res.status(503).json({
        status: 'error',
        detail: 'Agente de impressao nao configurado para esta loja.'
      });
    }

    let eplBytes;
    try {
      eplBytes = buildEtiquetaEplBuffer(req.body || {});
    } catch (error) {
      return res.status(400).json({ status: 'error', detail: error.message || 'Falha ao gerar etiqueta.' });
    }

    try {
      const response = await postRawWithTimeout(`${config.url}/imprimir`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/octet-stream'
        },
        body: eplBytes
      }, 5000);
      const agentPayload = await readAgentResponse(response);

      if (!response.ok || agentPayload.status === 'error') {
        return res.status(502).json({
          status: 'error',
          detail: agentPayload.detail || `Agente de impressao respondeu HTTP ${response.status}.`
        });
      }

      return res.json({ status: 'ok' });
    } catch (error) {
      console.warn('[LABEL_PRINT] Falha ao conectar ao agente:', error?.message || error);
      return res.status(502).json({ status: 'error', detail: PRINT_AGENT_CONNECT_MESSAGE });
    }
  });

  return router;
}
