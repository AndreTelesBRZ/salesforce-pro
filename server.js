
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

import { db, isPostgres, initDb } from './server/db.js';
import {
  MASTER_KEY,
  APP_INTEGRATION_TOKEN,
  APP_INTEGRATION_TOKEN_EDSON,
  APP_INTEGRATION_TOKEN_LLFIX,
  getRequestHost,
  matchesDomain,
  requireRemoteBackendContext,
  callRemoteJson,
  extractRemoteMessage,
  fetchRemoteProfile,
  extractProfileUser,
  extractProfileStoreCode,
  validateProfileAgainstBackend,
  resolveAuthenticatedUserPayload,
  getHeaderValue,
  parseAuthHeader,
  isIntegrationTokenForRequest,
  resolveIntegrationTokensForHost,
  buildRemoteAuthHeaders,
  getMailerForRequest,
  mailer,
  MAILER_FROM,
  genAI,
  GEMINI_API_KEY,
} from './server/config.js';

import { createAuthRoutes } from './server/routes/auth.js';
import { createProductRoutes } from './server/routes/products.js';
import { createCustomerRoutes } from './server/routes/customers.js';
import { createOrderRoutes } from './server/routes/orders.js';
import { createStoreRoutes } from './server/routes/store.js';
import { createAIRoutes } from './server/routes/ai.js';
import { createPDFRoutes } from './server/routes/pdf.js';
import { createMiscRoutes, createERPProxy } from './server/routes/misc.js';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(bodyParser.json());

app.use((req, res, next) => {
    console.log(`[SERVER] ${req.method} ${req.url}`);
    next();
});

const verifyToken = async (req, res, next) => {
  const authInfo = parseAuthHeader(req.headers['authorization']);
  const appToken = getHeaderValue(req.headers['x-app-token']);

  if (!authInfo.token && !appToken) {
      console.log('[AUTH_FAIL] Token não fornecido nos headers Authorization/X-App-Token');
      return res.status(403).json({ message: 'Token não fornecido.' });
  }

  if (authInfo.invalid) {
      console.log('[AUTH_FAIL] Formato inválido de token');
      return res.status(403).json({ message: 'Formato inválido.' });
  }

  if (!authInfo.token && appToken) {
      console.log('[AUTH_FAIL] X-App-Token não autoriza sessão de usuário');
      return res.status(401).json({ message: 'Token de integração não autentica usuário.' });
  }

  if (!authInfo.token) {
      console.log('[AUTH_FAIL] Token não fornecido no header Authorization');
      return res.status(403).json({ message: 'Token não fornecido.' });
  }

  try {
      const context = requireRemoteBackendContext(req, res);
      if (!context) return;
      const profileResponse = await fetchRemoteProfile(context.backendUrl, authInfo.token);
      if (!profileResponse || !profileResponse.response.ok) {
          const message = profileResponse
            ? extractRemoteMessage(profileResponse.data, profileResponse.text, profileResponse.response.status)
            : 'Token inválido.';
          console.log('[AUTH_FAIL] Token remoto rejeitado:', message);
          return res.status(401).json({ message: 'Token inválido.' });
      }
      const storeValidation = validateProfileAgainstBackend(context.backendUrl, profileResponse.data);
      if (!storeValidation.valid) {
          return res.status(403).json({ message: storeValidation.message });
      }
      const remoteUser = extractProfileUser(profileResponse.data);
      req.remoteUser = remoteUser;
      req.userId = remoteUser.id || remoteUser.vendor_code || remoteUser.username || null;
      req.jwtPayload = remoteUser;
      return next();
  } catch (remoteError) {
      console.log('[AUTH_FAIL] Token remoto inválido ou ERP indisponível:', remoteError.message);
      return res.status(401).json({ message: 'Token inválido.' });
  }
};

const ctx = {
  db,
  isPostgres,
  verifyToken,
  mailer,
  MAILER_FROM,
  genAI,
  GEMINI_API_KEY,
  requireRemoteBackendContext,
  callRemoteJson,
  extractRemoteMessage,
  fetchRemoteProfile,
  extractProfileUser,
  getHeaderValue,
  buildRemoteAuthHeaders,
  getRequestHost,
  matchesDomain,
  APP_INTEGRATION_TOKEN_EDSON,
  APP_INTEGRATION_TOKEN_LLFIX,
  APP_INTEGRATION_TOKEN,
};

app.use(createMiscRoutes(ctx));
app.use(createAuthRoutes(ctx));
app.use(createProductRoutes(ctx));
app.use(createCustomerRoutes(ctx));
app.use(createOrderRoutes(ctx));
app.use(createStoreRoutes(ctx));
app.use(createAIRoutes(ctx));
app.use(createPDFRoutes(ctx));
app.use('/api', createERPProxy(ctx));

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distPath = join(__dirname, 'dist');

if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
        res.sendFile(join(distPath, 'index.html'));
    });
}

const HOST = process.env.HOST || '127.0.0.1';

initDb().then(() => {
  app.listen(PORT, HOST, () => {
    console.log(`\n🚀 Servidor rodando em: http://localhost:${PORT}`);
    console.log(`📦 Modo Banco de Dados: ${isPostgres ? 'PostgreSQL (Remoto)' : 'SQLite (Local)'}\n`);
    if (process.env.NODE_ENV !== 'production') {
      const mask = (v) => (v && v.length > 8 ? `${v.slice(0,4)}…${v.slice(-4)}` : '(defina via env)');
      console.log(`🔑 Master Key (mascarada): ${mask(MASTER_KEY)}\n`);
      const integrationTokens = [
        { label: 'App Integration Token', value: APP_INTEGRATION_TOKEN },
        { label: 'App Integration Token EDSON', value: APP_INTEGRATION_TOKEN_EDSON },
        { label: 'App Integration Token LLFIX', value: APP_INTEGRATION_TOKEN_LLFIX }
      ];
      integrationTokens.forEach((entry) => {
        if (entry.value) {
          console.log(`🔐 ${entry.label} (mascarado): ${mask(entry.value)}\n`);
        }
      });
    }
  });
}).catch(err => {
  console.error('❌ Falha ao inicializar o banco de dados:', err);
  process.exit(1);
});
