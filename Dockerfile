# ── 构建阶段 1：依赖（全量含 devDeps，worker 需 tsx / drizzle-kit）──
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── 构建阶段 2：生产构建 ──
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 剔除本地开发密钥，避免污染构建上下文（.dockerignore 已兜底，这里双保险）
RUN rm -f .env.local .env
# 生产构建：tsc 类型门禁 + next build（失败即构建失败）
RUN npm run typecheck && npm run build

# ── 运行阶段：全量依赖（worker=tsx 运行时 / migrate=drizzle-kit，均需 devDeps）──
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# 非 root 运行（安全基线）
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

USER nextjs
EXPOSE 3000

# 默认命令（compose 中按 service 覆盖：web=next start / worker=tsx scripts/worker.ts / migrate=drizzle-kit push）
CMD ["npm", "run", "start"]
