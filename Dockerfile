FROM node:22-alpine AS base
RUN npm install -g pnpm@11

# ─── Install dependencies ─────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm.json ./
RUN pnpm install --frozen-lockfile

# ─── Build ───────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Dummy values satisfy Zod validation during build-time module evaluation.
# These are never used at runtime — real values come from the container env.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build \
    AUTH_SECRET=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
    GOOGLE_CLIENT_ID=build \
    GOOGLE_CLIENT_SECRET=build \
    RESEND_API_KEY=re_build \
    AUTH_EMAIL_FROM=build@example.com \
    DISCORD_BOT_TOKEN=build \
    NEXT_TELEMETRY_DISABLED=1

RUN pnpm build

# ─── Runtime ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ARG JAVA_VERSION=21

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache openjdk${JAVA_VERSION}-jre-headless git openssh-client \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/src/db/migrations ./src/db/migrations

USER nextjs
EXPOSE 3000
ENV PORT=3000 \
    HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
