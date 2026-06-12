# ── build webapp ──────────────────────────────────────────────
FROM node:24-alpine AS webapp
WORKDIR /build/webapp
COPY webapp/package*.json ./
RUN npm ci
COPY webapp/ ./
RUN npm run build

# ── production server ──────────────────────────────────────────
FROM node:24-alpine AS server
WORKDIR /app

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/ ./
COPY --from=webapp /build/webapp/dist ./webapp/dist

RUN mkdir -p /data

EXPOSE 3000
ENV PORT=3000
ENV DB_PATH=/data/club.db

CMD ["node", "src/index.js"]
