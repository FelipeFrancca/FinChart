# =============================================================================
# Multi-stage Dockerfile para Finanças 360° - Node.js Edition
# Backend: Node 20 + Express + TypeScript + Prisma
# Frontend: Node 20 + React + TypeScript + Vite
# =============================================================================

# =============================================================================
# Stage 1: Build Frontend
# =============================================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json* ./

# Instala dependências (se tiver package-lock usa ci, senão install)
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY frontend/ ./

ENV VITE_API_URL=""

RUN npm run build

# =============================================================================
# Stage 2: Build Backend
# =============================================================================
FROM node:20-alpine AS backend-builder

WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json* ./

RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY backend/ ./

# Gerar Prisma Client
RUN npx prisma generate

# Instalar TypeScript global e rodar build com a config criada
RUN npm install -g typescript@5.x
COPY backend/tsconfig.build.json ./
RUN tsc -p tsconfig.build.json

# =============================================================================
# Stage 3: Production Runtime
# =============================================================================
FROM node:20-alpine AS production

RUN apk add --no-cache openssl

WORKDIR /app

# Copiar apenas package.json de produção
COPY --from=backend-builder /app/backend/package.json ./backend/

WORKDIR /app/backend

# Instalar apenas dependências de produção
RUN npm install --production

# Copiar arquivos construídos do Backend
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=backend-builder /app/backend/prisma ./prisma
COPY --from=backend-builder /app/backend/node_modules/.prisma ./node_modules/.prisma

# Copiar arquivos estáticos do Frontend
COPY --from=frontend-builder /app/frontend/dist ./public

# Criar pasta de uploads
RUN mkdir -p ./uploads

# Script de inicialização ajustado para Node
RUN printf '#!/bin/sh\nset -e\n\nif [ -z "$DATABASE_URL" ]; then\n  echo "ERROR: DATABASE_URL não definida"\n  exit 1\nfi\n\necho "Aplicando migrations..."\nnpx prisma migrate deploy\n\necho "Iniciando servidor..."\nexec node dist/index.js\n' > /app/backend/start.sh && chmod +x /app/backend/start.sh

EXPOSE 5000

ENV NODE_ENV=production PORT=5000

# Healthcheck usando node
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 CMD node -e "fetch('http://localhost:5000/health').then(r => r.status === 200 ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

USER node

CMD ["/app/backend/start.sh"]
