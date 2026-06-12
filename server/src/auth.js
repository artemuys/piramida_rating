import crypto from "node:crypto";
import { config } from "./config.js";
import { q } from "./db.js";
import { ApiError } from "./errors.js";

/**
 * Проверка подписи Telegram WebApp initData.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * secret = HMAC_SHA256(key="WebAppData", msg=bot_token)
 * hash   = HMAC_SHA256(key=secret, msg=data_check_string)
 */
export function verifyInitData(initData) {
  if (!initData || initData.length > 8192) return null;
  let params;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return null;
  }
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(config.botToken).digest();
  const expected = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate || Date.now() / 1000 - authDate > config.authMaxAgeSec) return null;

  try {
    const user = JSON.parse(params.get("user") || "");
    if (!user || !Number.isInteger(user.id)) return null;
    return user;
  } catch {
    return null;
  }
}

// Кэш проверенных initData: подпись неизменна в течение сессии,
// нет смысла считать HMAC на каждый poll-запрос.
const authCache = new Map(); // initData -> { tgUser, exp }
const AUTH_CACHE_MAX = 3000;
const AUTH_CACHE_TTL = 5 * 60 * 1000;

function cachedVerify(initData) {
  const now = Date.now();
  const hit = authCache.get(initData);
  if (hit && hit.exp > now) return hit.tgUser;
  const tgUser = verifyInitData(initData);
  if (tgUser) {
    if (authCache.size >= AUTH_CACHE_MAX) {
      // простая эвикция: выбрасываем самую старую запись
      authCache.delete(authCache.keys().next().value);
    }
    authCache.set(initData, { tgUser, exp: now + AUTH_CACHE_TTL });
  }
  return tgUser;
}

const getUserByTg = () => q(`SELECT * FROM users WHERE tg_id = ?`);
const promoteAdmin = () => q(`UPDATE users SET role = 'admin' WHERE id = ? AND role != 'admin'`);

/** Fastify-хук: на каждый /api-запрос определяет личность и грузит пользователя из БД. */
export async function authHook(req) {
  let tgUser = null;

  if (config.devAuth && req.headers["x-dev-tg-id"]) {
    const id = Number(req.headers["x-dev-tg-id"]);
    if (Number.isInteger(id) && id > 0) tgUser = { id, first_name: "Dev" };
  }

  if (!tgUser) {
    const initData = req.headers["x-telegram-init-data"];
    if (typeof initData === "string" && initData) tgUser = cachedVerify(initData);
  }

  if (!tgUser) throw new ApiError(401, "auth_failed");

  req.tgUser = tgUser;
  req.user = getUserByTg().get(tgUser.id) || null;

  // Продвижение в админы по списку из конфига (роль хранится и проверяется только в БД)
  if (req.user && config.adminTgIds.includes(tgUser.id) && req.user.role !== "admin") {
    promoteAdmin().run(req.user.id);
    req.user.role = "admin";
  }
}
