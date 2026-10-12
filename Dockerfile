# Level Up in one container: the built React UI served by the Express API (+ its background jobs).
# Used by docker-compose.yml together with SQL Server Express and a Tailscale sidecar.

# 1) build the UI
FROM node:22-bookworm-slim AS client
WORKDIR /app/tracker/client
COPY client/package*.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
RUN npm run build

# 2) the API, serving the built UI
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app/tracker/server
COPY server/package*.json ./
# msnodesqlv8 (Windows authentication) is optional: in Docker the app logs in to SQL Server with a SQL login (tedious)
RUN npm ci --omit=dev --omit=optional --no-audit --no-fund
COPY server/ ./
COPY --from=client /app/tracker/client/dist /app/tracker/client/dist
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
# create/upgrade the schema (safe to repeat, keeps your data), then start the app
CMD ["sh", "-c", "node src/setup-db.js && exec node src/index.js"]
