# Stage 1: build and dependencies
FROM node:22-alpine AS builder

WORKDIR /app

ARG PNPM_VERSION=10.30.3

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY package.json pnpm-lock.yaml .npmrc ./
COPY prisma ./prisma/

RUN pnpm install --frozen-lockfile

COPY tsconfig.json prisma.config.ts ./
COPY types ./types/
COPY utils ./utils/
COPY middlewares ./middlewares/
COPY controllers ./controllers/
COPY routers ./routers/
COPY services ./services/
COPY workers ./workers/
COPY scripts ./scripts/
COPY app.ts index.ts chatWorker.ts ./

RUN DATABASE_URL=postgresql://ragchat:ragchat@postgres:5432/ragchat pnpm prisma generate && pnpm run build
RUN pnpm prune --prod

# Stage 2: minimal production runtime
FROM node:22-alpine AS runner

WORKDIR /app

ARG PNPM_VERSION=10.30.3
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/generated ./dist/generated
COPY --from=builder /app/prisma ./prisma

EXPOSE 8000

CMD ["node", "dist/index.js"]
