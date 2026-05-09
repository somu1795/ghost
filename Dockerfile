FROM oven/bun:1.3 AS base
WORKDIR /app

# --- Dependencies ---
FROM base AS deps
COPY package.json bun.lock bunfig.toml ./
COPY patches ./patches
RUN bun install --frozen-lockfile --ignore-scripts

# --- Agent binary (pre-built) ---
FROM deps AS agent
COPY . .
RUN bun build --compile --target=bun-linux-x64 \
    ./agent/src/index.ts --outfile ./dist/ghost-agent

# --- Next.js build ---
FROM deps AS build
COPY . .
RUN bunx prisma generate && bun run next build

# --- Production ---
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=agent /app/dist/ghost-agent ./dist/ghost-agent

# Explicitly create storage dir for local blob replacement
RUN mkdir -p /data/ghost-storage
ENV STORAGE_DIR=/data/ghost-storage

EXPOSE 3000
CMD ["bun", "server.js"]
