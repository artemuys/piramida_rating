import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { authHook } from "./auth.js";
import { ApiError } from "./errors.js";
import usersRoutes from "./routes/users.js";
import requestsRoutes from "./routes/requests.js";
import matchesRoutes from "./routes/matches.js";
import searchRoutes from "./routes/search.js";
import adminRoutes from "./routes/admin.js";
import { startSweeper } from "./sweeper.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({
  logger: { level: "info" },
  bodyLimit: 16 * 1024, // ни один легитимный запрос не больше
  trustProxy: true,     // за nginx/Caddy
});

// Толерантность к POST без тела / с нестандартным content-type (иначе Fastify отвечает 415)
app.addContentTypeParser("*", { parseAs: "buffer" }, (req, body, done) => done(null, null));

await app.register(cors, {
  origin: config.devAuth ? [config.corsOrigin] : false, // в проде фронт отдаёт сам сервер — CORS не нужен
  allowedHeaders: ["content-type", "x-telegram-init-data", "x-dev-tg-id"],
});

await app.register(rateLimit, {
  global: true,
  max: 240,
  timeWindow: "1 minute",
  keyGenerator: (req) => req.headers["x-telegram-init-data"]?.slice(-64) || req.ip,
});

// Базовые security-заголовки
app.addHook("onSend", async (req, reply) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "SAMEORIGIN"); // Telegram открывает в webview, не во фрейме
  reply.header("Referrer-Policy", "no-referrer");
});

app.setErrorHandler((err, req, reply) => {
  if (err instanceof ApiError) {
    return reply.status(err.status).send({ error: err.code });
  }
  if (err.validation) {
    return reply.status(400).send({ error: "validation" });
  }
  if (err.statusCode === 429) {
    return reply.status(429).send({ error: "rate_limited" });
  }
  req.log.error({ err }, "unhandled error");
  return reply.status(500).send({ error: "internal" });
});

app.get("/health", { config: { rateLimit: false } }, () => ({ ok: true }));

// Все /api-маршруты — за аутентификацией Telegram
await app.register(
  async (api) => {
    api.addHook("preHandler", authHook);
    await api.register(usersRoutes);
    await api.register(requestsRoutes);
    await api.register(matchesRoutes);
    await api.register(searchRoutes);
    await api.register(adminRoutes);
  },
  { prefix: "/api" }
);

// Прод: отдаём собранный фронтенд (webapp/dist) этим же сервером
const distDir = path.resolve(__dirname, "../../webapp/dist");
if (existsSync(distDir)) {
  await app.register(fastifyStatic, { root: distDir, index: "index.html" });
  app.setNotFoundHandler((req, reply) => {
    if (req.method === "GET" && !req.url.startsWith("/api")) {
      return reply.sendFile("index.html"); // SPA fallback
    }
    reply.status(404).send({ error: "not_found" });
  });
}

startSweeper(app.log);

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
