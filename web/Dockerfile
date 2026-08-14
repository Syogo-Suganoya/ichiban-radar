# Cloud Run 用のイメージ。手順は docs/9_デプロイ手順書.md。
#
# ★ standalone 出力を前提にしている（next.config.ts の output）。
#   node_modules を丸ごと入れず、実行に必要なものだけが .next/standalone に入る。

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# ⚠️ NEXT_PUBLIC_* はビルド時にバンドルへ焼き込まれる。
#    Cloud Run の環境変数に後から入れても反映されないため、ここで渡す。
ARG NEXT_PUBLIC_MAPTILER_KEY
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_SITE_URL
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# root で動かさない
USER node
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
