<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# SalesForce Pro

Aplicativo de força de vendas híbrido (Web/Mobile) com backend Node/Express e frontend React (Vite). Suporta operação offline via IndexedDB, sincronização de produtos/clientes/pedidos, autenticação (senha, código por e-mail simulado e Google), e integração opcional com Gemini para argumentos de venda e imagens.

## Requisitos

- Node.js 18+
- npm
- Docker (opcional para deploy)

## Configuração

1) Copie o arquivo de exemplo e preencha as variáveis:

   `cp .env.example .env`

   - Backend: `SECRET_KEY`, `MASTER_KEY`, `APP_INTEGRATION_TOKEN`, `GOOGLE_CLIENT_ID`, `DATABASE_URL` (opcional), `GEMINI_API_KEY` (para IA)

2) Instale dependências:

   `npm install`

3) Ambiente de desenvolvimento (frontend + backend):

   `npm run dev`

   - Frontend roda em `http://localhost:3000`
   - Backend (Express) roda em `http://localhost:8080`
   - O Vite está configurado com proxy para `/api` -> `localhost:8080`

4) Build de produção (gera `dist/`):

   `npm run build`

5) Executar somente backend servindo estáticos de `dist/`:

   `npm start`

## Docker

Construir e subir com Docker Compose:

```
docker compose up --build -d
```

O serviço ficará disponível em `http://localhost:8080`.

## Implantação LLFIX

Quando o frontend for compilado para o tenant LLFIX (domínio em `llfix.app.br`), fixe o backend FastAPI correto e o token esperado:

1. No `.env` de build (ou em `.env.llfix`), defina:
   - `VITE_BACKEND_URL=https://apiforce.llfix.app.br`
   - `VITE_APP_INTEGRATION_TOKEN_LLFIX=<APP_INTEGRATION_TOKEN do FastAPI>`
2. Rebuild e reinicie o frontend:
   - Com Docker: `docker compose up --build -d` (ou o equivalente no Swarm)
   - Sem Docker: `npm run build` e reinicie o serviço Node/Express que serve `dist/`
3. Limpe o cache do navegador (hard refresh ou “Clear site data”) para garantir que não fique com Service Workers antigos.

Com isso, todas as chamadas vão para `https://apiforce.llfix.app.br/api/produtos-sync?loja=000003`, evitando o 401 gerado pelo Express em `vendas.llfix.app.br`.

### Cabeçalhos obrigatórios para sincronização LLFIX

Ao consumir `/api/produtos-sync`, `/api/clientes-sync` e demais endpoints expostos no domínio `https://apiforce.llfix.app.br`, o frontend precisa combinar dois cabeçalhos:

1. `Authorization: Bearer <JWT válido>` obtido em `/auth/login` usando as chaves `JWT_SECRET`/`JWT_ALGORITHM` do tenant LLFIX.
2. `X-App-Token: qZBhHYhZ-7P_2_265zqAl5DwqE5MiahXvivJnvoeT2b5GuYP6IHcKf81nVAQZJU4_EQ` (ou o valor exato de `APP_INTEGRATION_TOKEN` definido em `.env.llfix`).

O fluxo esperado:

- Obtenha o JWT realizando `POST /auth/login` com as credenciais da API.
- Armazene o token e reutilize-o em todas as requisições de sync feitas por `fetchWithAuth`.
- Garanta que o `X-App-Token` corresponda ao valor fixo do `.env.llfix` (não é o JWT).
- No DevTools > Network, confirme que:
  - `Authorization` carrega o JWT.
  - `X-App-Token` coincide com `.env.llfix`.
  - `Host` / `Origin` apontam para `llfix`.

Essa combinação atende ao que `permissions.py` espera no backend e evita o erro `401 Token inválido`.

Persistência de dados:
- O SQLite fica em `/data/database.sqlite` dentro do container
- O diretório local `./data` é montado em `/data` (volume), garantindo persistência entre recriações

Variáveis (via `.env`):
- `DB_PATH=/data/database.sqlite` (default do compose)
- `GEMINI_API_KEY=...` (IA no backend, sem rebuild do frontend)

## Notas de Segurança

- Integração Gemini movida para o backend: configure `GEMINI_API_KEY` no servidor.
- No backend, altere `SECRET_KEY` e `MASTER_KEY` em produção.
- Para Google, defina `GOOGLE_CLIENT_ID` corretamente.

## Scripts

- `npm run dev` — inicia backend e frontend juntos
- `npm run server` — inicia apenas o backend
- `npm run client` — inicia apenas o frontend
- `npm run build` — compila TypeScript e build do Vite
- `npm start` — inicia o servidor Express servindo `dist/`
