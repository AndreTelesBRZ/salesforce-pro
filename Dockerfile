# Multi-stage build: build Vite app, run Node server to serve API and static files

FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* .npmrc* ./
RUN npm ci || npm install
COPY . .
ARG VITE_GEMINI_API_KEY
ARG VITE_BACKEND_URL
ENV VITE_GEMINI_API_KEY=$VITE_GEMINI_API_KEY
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/dist ./dist
# Create a data directory for DB volume
RUN mkdir -p /data && chown -R node:node /data
VOLUME ["/data"]
RUN npm install --omit=dev && npm cache clean --force
EXPOSE 8080
CMD ["node", "server.js"]
