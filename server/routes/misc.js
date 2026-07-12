import { Router } from 'express';
import {
  APP_INTEGRATION_TOKEN,
  APP_INTEGRATION_TOKEN_EDSON,
  APP_INTEGRATION_TOKEN_LLFIX,
  getRequestHost,
  matchesDomain,
  requireRemoteBackendContext,
  callRemoteJson,
  extractRemoteMessage,
  buildRemoteAuthHeaders,
  getHeaderValue,
  MAILER_FROM,
} from '../config.js';
import { db, isPostgres } from '../db.js';

const LOCAL_API_PATHS = [
  '/api/config/resolve',
  '/api/recibo/pdf/public',
  '/api/recibo/pdf',
  '/api/catalogo-produtos/pdf',
  '/api/store/public',
];

export function createMiscRoutes(ctx) {
  const router = Router();
  const { verifyToken, mailer } = ctx;

  // --- Healthcheck simples para orquestradores (Portainer/Swarm) ---
  router.get('/health', async (req, res) => {
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

  // --- Resolve tenant config from hostname ---
  router.get('/api/config/resolve', (req, res) => {
    const host = getRequestHost(req);
    const isEdson = matchesDomain(host, 'edsondosparafusos.app.br');
    const isLlfix = matchesDomain(host, 'llfix.app.br');

    if (!isEdson && !isLlfix) {
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
        error: 'Domínio não configurado: ' + label + '.'
      });
    }

    const tenant = isEdson ? 'EDSON' : 'LLFIX';
    const domain = isEdson ? 'edsondosparafusos.app.br' : 'llfix.app.br';
    const storeCode = isEdson ? '000001' : '000003';
    const storeName = isEdson ? 'EDSON DOS PARAFUSOS' : 'LL FIX DISTRIBUIDORA - EI';
    const backendUrl = isEdson ? 'https://apiforce.edsondosparafusos.app.br' : 'https://apiforce.llfix.app.br';
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

  // --- Validate ERP integration ---
  router.get('/api/integration/validate', async (req, res) => {
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

  // --- Send email via SMTP ---
  router.post('/api/sendmail', verifyToken, async (req, res) => {
    if (!mailer) return res.status(400).json({ message: 'Mailer não configurado.' });
    const { to, subject, text, html, attachments } = req.body || {};
    if (!to || !subject) return res.status(400).json({ message: 'Parâmetros inválidos.' });
    try {
      const opts = { from: MAILER_FROM, to, subject, text, html };
      if (attachments && Array.isArray(attachments)) {
        opts.attachments = attachments.map(a => ({
          filename: a.filename,
          content: a.content,
          encoding: a.encoding || 'base64'
        }));
      }
      const info = await mailer.sendMail(opts);
      res.json({ success: true, id: info.messageId });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  });

  return router;
}

export function createERPProxy(ctx) {
  const { requireRemoteBackendContext, buildRemoteAuthHeaders, getHeaderValue } = ctx;

  return async function erpProxyMiddleware(req, res, next) {
    if (LOCAL_API_PATHS.some(p => req.path.startsWith(p))) return next();
    if (res.headersSent) return next();
    try {
      const context = requireRemoteBackendContext(req, res);
      if (!context) return;

      const targetUrl = `${context.backendUrl}${req.originalUrl}`;
      const forwardedHeaders = buildRemoteAuthHeaders(context.backendUrl, {});
      const authHeader = getHeaderValue(req.headers['authorization']);
      if (authHeader) {
        forwardedHeaders.Authorization = authHeader.startsWith('Bearer ') ? authHeader : `Bearer ${authHeader}`;
      }
      const acceptHeader = getHeaderValue(req.headers['accept']);
      if (acceptHeader) {
        forwardedHeaders.Accept = acceptHeader;
      }

      console.log(`[ERP_PROXY] ${req.method} ${targetUrl}`);
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: forwardedHeaders,
        body: ['GET', 'HEAD'].includes(req.method.toUpperCase()) ? undefined : JSON.stringify(req.body || {})
      });

      const text = await response.text();
      const contentType = response.headers.get('content-type');
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }
      return res.status(response.status).send(text);
    } catch (error) {
      console.error('[ERP_PROXY] Falha no proxy genérico:', error.message);
      if (res.headersSent) return;
      return res.status(503).json({ message: 'API do ERP indisponível' });
    }
  };
}
