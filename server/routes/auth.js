import { Router } from 'express';
import {
  requireRemoteBackendContext,
  callRemoteJson,
  extractRemoteMessage,
  resolveAuthenticatedUserPayload,
  extractProfileUser,
} from '../config.js';

export function createAuthRoutes(ctx) {
  const router = Router();
  const { verifyToken } = ctx;

  // Cadastro local desabilitado
  router.post('/api/register', async (req, res) => {
    return res.status(403).json({ message: 'Cadastro local desabilitado. Use o ERP oficial.' });
  });

  // Login remoto proxy
  router.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
      const backendUrl = resolveBackendUrlForRequest(req);
      if (!backendUrl) {
        return res.status(400).json({ message: "Configuracao de loja invalida. Backend do ERP nao identificado." });
      }

      const remoteLogin = await callRemoteJson({
        backendUrl,
        paths: ['/auth/login', '/api/login'],
        method: 'POST',
        body: { username, password },
      });

      if (!remoteLogin.response.ok) {
        const message = extractRemoteMessage(remoteLogin.data, remoteLogin.text, remoteLogin.response.status);
        return res.status(remoteLogin.response.status).json({ message });
      }

      const accessToken =
        remoteLogin.data?.token?.access_token ||
        remoteLogin.data?.access_token ||
        remoteLogin.data?.token;

      if (!accessToken) {
        return res.status(502).json({ message: 'ERP respondeu sem token de autenticação.' });
      }

      const authenticatedUser = await resolveAuthenticatedUserPayload(
        backendUrl,
        accessToken,
        remoteLogin.data?.user || remoteLogin.data,
      );
      if (!authenticatedUser.ok) {
        return res.status(authenticatedUser.status).json({ message: authenticatedUser.message });
      }

      const remoteUser = authenticatedUser.user;
      return res.status(200).json({
        token: {
          access_token: accessToken,
          token_type: remoteLogin.data?.token?.token_type || remoteLogin.data?.token_type || 'bearer',
          expires_in: remoteLogin.data?.token?.expires_in || remoteLogin.data?.expires_in || 3600,
        },
        user: {
          ...remoteUser,
          vendor_name: remoteUser.vendor_name || remoteUser.name || remoteUser.nome || remoteUser.username || String(username || '').trim(),
          vendor_code: remoteUser.vendor_code || remoteUser.seller_id || remoteUser.vendedor_codigo || '',
          loja_codigo: remoteUser.loja_codigo || remoteUser.store_code || remoteUser.lojaCodigo || remoteUser.codigo_loja || '',
        },
      });
    } catch (e) {
      console.error('[AUTH_PROXY] Falha no login remoto:', e.message);
      res.status(503).json({ message: 'API do ERP indisponível.' });
    }
  });

  // Enviar código de acesso
  router.post('/api/auth/send-code', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email é obrigatório.' });

    try {
      const context = requireRemoteBackendContext(req, res);
      if (!context) return;

      const remoteCodeRequest = await callRemoteJson({
        backendUrl: context.backendUrl,
        paths: ['/auth/send-code', '/api/auth/send-code'],
        method: 'POST',
        body: { email },
      });

      if (remoteCodeRequest.response.status === 404) {
        return res.status(404).json({ message: 'Este ambiente não suporta login por código de acesso.' });
      }

      const message = extractRemoteMessage(
        remoteCodeRequest.data,
        remoteCodeRequest.text,
        remoteCodeRequest.response.status,
      );

      return res.status(remoteCodeRequest.response.status).json({
        success: remoteCodeRequest.response.ok,
        message,
      });
    } catch (e) {
      console.error('[AUTH_PROXY] Falha ao solicitar código remoto:', e.message);
      return res.status(503).json({ message: 'API do ERP indisponível.' });
    }
  });

  // Verificar código de acesso
  router.post('/api/auth/verify-code', async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ message: 'Dados incompletos.' });

    try {
      const context = requireRemoteBackendContext(req, res);
      if (!context) return;

      const remoteVerify = await callRemoteJson({
        backendUrl: context.backendUrl,
        paths: ['/auth/verify-code', '/api/auth/verify-code'],
        method: 'POST',
        body: { email, code },
      });

      if (remoteVerify.response.status === 404) {
        return res.status(404).json({ message: 'Este ambiente não suporta login por código de acesso.' });
      }

      if (!remoteVerify.response.ok) {
        const message = extractRemoteMessage(remoteVerify.data, remoteVerify.text, remoteVerify.response.status);
        return res.status(remoteVerify.response.status).json({ message });
      }

      const accessToken =
        remoteVerify.data?.token?.access_token ||
        remoteVerify.data?.access_token ||
        remoteVerify.data?.token;

      if (!accessToken) {
        return res.status(502).json({ message: 'ERP respondeu sem token de autenticação.' });
      }

      const authenticatedUser = await resolveAuthenticatedUserPayload(
        context.backendUrl,
        accessToken,
        remoteVerify.data?.user || remoteVerify.data,
      );
      if (!authenticatedUser.ok) {
        return res.status(authenticatedUser.status).json({ message: authenticatedUser.message });
      }

      const remoteUser = authenticatedUser.user;
      return res.status(200).json({
        token: {
          access_token: accessToken,
          token_type: remoteVerify.data?.token?.token_type || remoteVerify.data?.token_type || 'bearer',
          expires_in: remoteVerify.data?.token?.expires_in || remoteVerify.data?.expires_in || 3600,
        },
        user: {
          ...remoteUser,
          vendor_name: remoteUser.vendor_name || remoteUser.name || remoteUser.nome || remoteUser.username || String(email || '').trim(),
          vendor_code: remoteUser.vendor_code || remoteUser.seller_id || remoteUser.vendedor_codigo || '',
          loja_codigo: remoteUser.loja_codigo || remoteUser.store_code || remoteUser.lojaCodigo || remoteUser.codigo_loja || '',
        },
      });
    } catch (e) {
      console.error('[AUTH_PROXY] Falha ao validar código remoto:', e.message);
      res.status(503).json({ message: 'API do ERP indisponível.' });
    }
  });

  // Autenticação com Google (indisponível)
  router.post('/api/auth/google', async (req, res) => {
    return res.status(501).json({ message: 'Login Google não disponível neste ambiente.' });
  });

  // Identificar Usuário Atual (Me)
  router.get('/api/me', verifyToken, async (req, res) => {
    try {
      if (!req.remoteUser) {
        return res.status(401).json({ message: 'Perfil remoto não carregado.' });
      }
      return res.json({ user: req.remoteUser });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Identificar Usuário Atual (Me) — rota alternativa
  router.get('/api/auth/me', verifyToken, async (req, res) => {
    try {
      if (!req.remoteUser) {
        return res.status(401).json({ message: 'Perfil remoto não carregado.' });
      }
      return res.json({ user: req.remoteUser });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  return router;
}
