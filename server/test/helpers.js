// Общая обвязка тестов. Каждый файл *.test.js выполняется в отдельном процессе
// (поведение node --test), поэтому БД и конфиг изолированы по файлам.
// ВАЖНО: env выставляется здесь, в теле модуля, ДО динамического импорта
// src/config.js и src/db.js (они читают env при загрузке).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DEV_AUTH = "1";
process.env.BOT_TOKEN = process.env.BOT_TOKEN || "test-bot-token";
process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "club-test-")), "test.db");
delete process.env.NODE_ENV; // DEV_AUTH=1 + production = намеренный fatal в config.js

/**
 * Импортирует сервер (после возможной донастройки env в тест-файле)
 * и собирает Fastify-приложение без listen и без свипера.
 */
export async function loadServer() {
  const { buildApp } = await import("../src/app.js");
  const { db, q, tx } = await import("../src/db.js");
  const { config } = await import("../src/config.js");
  const app = await buildApp();
  return { app, db, q, tx, config };
}

/**
 * Запрос от имени пользователя Telegram (dev-auth).
 * x-telegram-init-data не участвует в аутентификации (dev-заголовок приоритетнее),
 * но является ключом rate-limit — даём каждому tg_id свою корзину,
 * чтобы тесты не упирались в лимиты.
 */
export function req(app, method, url, { tgId, body } = {}) {
  const headers = {};
  if (tgId) {
    headers["x-dev-tg-id"] = String(tgId);
    headers["x-telegram-init-data"] = `rate-key-${tgId}`;
  }
  return app.inject({ method, url, headers, ...(body !== undefined ? { payload: body } : {}) });
}

let tgSeq = 900_000_000; // не пересекается с seed-пользователями
export const freshTgId = () => ++tgSeq;

/** Уникальное имя из одних букв (имена не принимают цифры): 900000001 → "...beb". */
function nameFromId(n) {
  let s = "";
  for (let x = n; x > 0; x = Math.floor(x / 26)) s = String.fromCharCode(97 + (x % 26)) + s;
  return `Player ${s || "a"}`;
}

/** Онбордит нового пользователя, возвращает { tgId, me }. */
export async function createUser(app, overrides = {}) {
  const tgId = overrides.tgId ?? freshTgId();
  const res = await req(app, "POST", "/api/auth/onboard", {
    tgId,
    body: { name: overrides.name ?? nameFromId(tgId), contact: overrides.contact ?? "@test", lang: overrides.lang ?? "ru" },
  });
  if (res.statusCode !== 200) throw new Error(`onboard failed: ${res.statusCode} ${res.body}`);
  return { tgId, me: res.json().me };
}

/** Прямые манипуляции состоянием (то, что в проде делает админ/время). */
// Активная дисциплина — pyramid, матчи считаются по elo_pyramid; пишем в обе
// колонки, чтобы тесты не зависели от того, какую читает конкретный код.
export const setElo = (q, userId, elo) =>
  q(`UPDATE users SET elo = ?, elo_pyramid = ? WHERE id = ?`).run(elo, elo, userId);
export const checkin = (q, userId, ms = 6 * 3600 * 1000) =>
  q(`UPDATE users SET checked_in_until = ?, activated_until = ? WHERE id = ?`)
    .run(Date.now() + ms, Date.now() + ms, userId);
export const activate = (q, userId, ms = 45 * 24 * 3600 * 1000) =>
  q(`UPDATE users SET activated_until = ? WHERE id = ?`).run(Date.now() + ms, userId);
