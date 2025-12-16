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

   - Front-end (Vite): `VITE_GEMINI_API_KEY` (opcional, para IA)
   - Backend: `SECRET_KEY`, `MASTER_KEY`, `GOOGLE_CLIENT_ID`, `DATABASE_URL` (opcional para Postgres)

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

Banco local SQLite é persistido no arquivo `database.sqlite` (mapeado como volume).

## Notas de Segurança

- Variáveis do frontend agora usam prefixo `VITE_` e não expõem segredos do servidor.
- No backend, altere `SECRET_KEY` e `MASTER_KEY` em produção.
- Para Google, defina `GOOGLE_CLIENT_ID` corretamente.

## Scripts

- `npm run dev` — inicia backend e frontend juntos
- `npm run server` — inicia apenas o backend
- `npm run client` — inicia apenas o frontend
- `npm run build` — compila TypeScript e build do Vite
- `npm start` — inicia o servidor Express servindo `dist/`
