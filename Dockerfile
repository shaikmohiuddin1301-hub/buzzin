# BuildTogether — production image for hosts with a persistent disk.
#
# This build stores its data in SQLite plus a local media folder, so it needs a real
# filesystem that survives restarts. That rules out serverless platforms (Netlify, Vercel
# Functions); it does not rule out containers with a mounted volume (Fly.io, Render,
# Railway, ECS, any VPS).
#
#   docker build -t buildtogether .
#   docker run -p 3000:3000 \
#     -e SESSION_SECRET=... -e NEXT_PUBLIC_APP_URL=https://your.domain \
#     -v buildtogether-data:/app/data -v buildtogether-media:/app/storage \
#     buildtogether
#
# Migrations run on start; they are idempotent and safe to run on every boot.

FROM node:20-bookworm-slim AS build
WORKDIR /app

# better-sqlite3 ships prebuilt binaries; these are only needed if the prebuilt download
# is unavailable and npm has to compile from source.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    DATABASE_PATH=/app/data/buildtogether.db \
    STORAGE_LOCAL_DIR=/app/storage

# Runtime needs the full dependency tree: `tsx` applies migrations from TypeScript source.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/db ./db
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts

RUN mkdir -p /app/data /app/storage && chown -R node:node /app
USER node

EXPOSE 3000

# No curl in the slim image: probe with Node's own fetch.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "npm run db:migrate && npm run db:seed:first-boot && exec npm start"]
