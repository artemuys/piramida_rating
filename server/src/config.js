const env = process.env;

export const config = {
  port: Number(env.PORT) || 3000,
  botToken: env.BOT_TOKEN || "",
  dbPath: env.DB_PATH || "./data/club.db",
  authMaxAgeSec: Number(env.AUTH_MAX_AGE_SEC) || 86400,
  devAuth: env.DEV_AUTH === "1",
  corsOrigin: env.CORS_ORIGIN || "http://localhost:5173",
  adminTgIds: (env.ADMIN_TG_IDS || "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0),

  // Бизнес-константы
  ACTIVATION_MS: 45 * 24 * 60 * 60 * 1000, // 45 дней
  CHECKIN_MS: 6 * 60 * 60 * 1000,          // 6 часов
  MATCH_CONFIRM_MS: 30 * 1000,             // 30 секунд на подтверждение
  ELO_K: 32,
  ELO_START: 1000,
  MAX_REQUESTS_PER_USER: 6,                // заявки: 3 дня × 2 слота
  MAX_FAVORITES: 50,
  RATING_TOP: 100,
  HISTORY_LIMIT: 10,
  RECENT_OPPONENTS: 5,
};

if (!config.botToken && !config.devAuth) {
  console.error("FATAL: BOT_TOKEN не задан (или включите DEV_AUTH=1 для локальной разработки)");
  process.exit(1);
}
if (config.devAuth) {
  console.warn("!!! DEV_AUTH=1 — аутентификация Telegram ОТКЛЮЧЕНА. Только для разработки !!!");
}
