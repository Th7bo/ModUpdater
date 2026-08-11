FROM node:22-alpine AS base
RUN npm install -g pnpm@11

# ─── Install dependencies ─────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm.json .npmrc ./
RUN pnpm install --frozen-lockfile --ignore-scripts && pnpm rebuild

# ─── Build ───────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Dummy values satisfy Zod validation during build-time module evaluation.
# These are never used at runtime — real values come from the container env.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build \
    AUTH_SECRET=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
    DISCORD_CLIENT_ID=build \
    DISCORD_CLIENT_SECRET=build \
    DISCORD_BOT_TOKEN=build \
    ARTIFACTS_DIR=/app/data/artifacts \
    BASE_URL=http://localhost:3000 \
    NEXT_TELEMETRY_DISABLED=1

RUN pnpm build

# ─── Runtime ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

# Enable edge community repo for JDK 25 and install multiple JDK versions
RUN echo "https://dl-cdn.alpinelinux.org/alpine/edge/community" >> /etc/apk/repositories \
    && apk add --no-cache openjdk21-jdk openjdk25-jdk git openssh-client

# JDK paths for per-repo selection
ENV JAVA_HOME_21=/usr/lib/jvm/java-21-openjdk \
    JAVA_HOME_25=/usr/lib/jvm/java-25-openjdk \
    JAVA_HOME=/usr/lib/jvm/java-21-openjdk

# Copy built app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Static assets. `output: 'standalone'` does not bundle public/, so without this
# every file in it 404s — including the /install bootstrap scripts.
COPY --from=builder /app/public ./public

# Copy files needed for drizzle-kit push
COPY --from=builder /app/package.json ./
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/src/db ./src/db

# Maintenance scripts. They have to run here rather than on a laptop: the
# artifacts volume is only mounted inside this container, so running them
# elsewhere finds the database but none of the JARs.
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src/builder ./src/builder
COPY --from=builder /app/src/config ./src/config
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
ENV PORT=3000 \
    HOSTNAME=0.0.0.0

# Run schema push then start server
CMD ["sh", "-c", "node node_modules/drizzle-kit/bin.cjs push && node server.js"]
