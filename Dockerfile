FROM node:22-alpine AS webapp-build
WORKDIR /build/webapp
COPY webapp/package*.json ./
RUN npm ci
COPY webapp/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=webapp-build /build/webapp/dist /app/webapp/dist
RUN mkdir -p /data
ENV NODE_ENV=production
ENV DB_PATH=/data/club.db
EXPOSE 3000
CMD ["node", "src/index.js"]
