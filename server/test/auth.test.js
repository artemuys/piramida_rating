import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { loadServer, req, createUser } from "./helpers.js";

const ADMIN_TG = 777_000_001;
process.env.ADMIN_TG_IDS = ` ${ADMIN_TG}, 0, -5, abc `; // мусор должен отфильтроваться

let app, q, config, verifyInitData;
before(async () => {
  ({ app, q, config } = await loadServer());
  ({ verifyInitData } = await import("../src/auth.js"));
});

/** Подписывает initData так же, как Telegram WebApp. */
function makeInitData(user, { authDate = Math.floor(Date.now() / 1000), token = "test-bot-token", tamper } = {}) {
  const params = new URLSearchParams();
  params.set("user", JSON.stringify(user));
  params.set("auth_date", String(authDate));
  params.set("query_id", "AAEtest");
  const dcs = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const hash = crypto.createHmac("sha256", secret).update(dcs).digest("hex");
  if (tamper) params.set("user", JSON.stringify({ ...user, id: 1 })); // подмена после подписи
  params.set("hash", hash);
  return params.toString();
}

describe("verifyInitData — подпись Telegram", () => {
  test("валидная подпись возвращает пользователя", () => {
    const u = verifyInitData(makeInitData({ id: 42, first_name: "Test" }));
    assert.equal(u.id, 42);
  });

  test("подмена данных после подписи отклоняется", () => {
    assert.equal(verifyInitData(makeInitData({ id: 42 }, { tamper: true })), null);
  });

  test("подпись чужим токеном бота отклоняется", () => {
    assert.equal(verifyInitData(makeInitData({ id: 42 }, { token: "another-bot" })), null);
  });

  test("просроченный auth_date отклоняется", () => {
    const old = Math.floor(Date.now() / 1000) - config.authMaxAgeSec - 60;
    assert.equal(verifyInitData(makeInitData({ id: 42 }, { authDate: old })), null);
  });

  test("мусорные значения отклоняются без исключений", () => {
    assert.equal(verifyInitData(""), null);
    assert.equal(verifyInitData(null), null);
    assert.equal(verifyInitData("hash=zzz"), null);
    assert.equal(verifyInitData("a=1&hash=" + "0".repeat(64)), null); // формально валидный hex, неверная подпись
    assert.equal(verifyInitData("x".repeat(9000)), null); // длиннее лимита 8192
  });

  test("user без целого id отклоняется", () => {
    assert.equal(verifyInitData(makeInitData({ name: "no-id" })), null);
    assert.equal(verifyInitData(makeInitData({ id: "42" })), null);
  });
});

describe("authHook", () => {
  test("без заголовков аутентификации — 401 auth_failed", async () => {
    const r = await app.inject({ method: "GET", url: "/api/me" });
    assert.equal(r.statusCode, 401);
    assert.equal(r.json().error, "auth_failed");
  });

  test("реальный путь: валидный initData аутентифицирует", async () => {
    const { me, tgId } = await createUser(app);
    const r = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { "x-telegram-init-data": makeInitData({ id: tgId, first_name: "T" }) },
    });
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().me.id, me.id);
  });

  test("аутентифицирован, но не онбордился — 401 not_onboarded", async () => {
    const r = await req(app, "GET", "/api/me", { tgId: 888_777_666 });
    assert.equal(r.statusCode, 401);
    assert.equal(r.json().error, "not_onboarded");
  });

  test("ADMIN_TG_IDS парсится с фильтрацией мусора", () => {
    assert.deepEqual(config.adminTgIds, [ADMIN_TG]);
  });

  test("онбординг tg_id из ADMIN_TG_IDS сразу даёт роль admin", async () => {
    const { me } = await createUser(app, { tgId: ADMIN_TG });
    assert.equal(me.role, "admin");
  });

  test("существующий user из списка админов продвигается при первом запросе", async () => {
    const demoted = await createUser(app);
    // имитируем добавление в список постфактум: меняем tg_id на админский? Нельзя — UNIQUE.
    // Вместо этого роняем роль уже созданного админа и проверяем повторное продвижение.
    q(`UPDATE users SET role = 'user' WHERE tg_id = ?`).run(ADMIN_TG);
    const r = await req(app, "GET", "/api/me", { tgId: ADMIN_TG });
    assert.equal(r.json().me.role, "admin");
    assert.equal(q(`SELECT role FROM users WHERE tg_id = ?`).get(ADMIN_TG).role, "admin");
    // обычный пользователь не продвигается
    const r2 = await req(app, "GET", "/api/me", { tgId: demoted.tgId });
    assert.equal(r2.json().me.role, "user");
  });
});

describe("обвязка приложения", () => {
  test("GET /health отвечает без аутентификации", async () => {
    const r = await app.inject({ method: "GET", url: "/health" });
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.json(), { ok: true });
  });

  test("security-заголовки выставлены на каждый ответ", async () => {
    const r = await app.inject({ method: "GET", url: "/health" });
    assert.equal(r.headers["x-content-type-options"], "nosniff");
    assert.equal(r.headers["x-frame-options"], "SAMEORIGIN");
    assert.equal(r.headers["referrer-policy"], "no-referrer");
    assert.match(r.headers["content-security-policy"], /default-src 'self'/);
    assert.match(r.headers["strict-transport-security"], /max-age=/);
  });

  test("POST без тела не падает с 415 (толерантный content-type parser)", async () => {
    const { tgId, me } = await createUser(app);
    q(`UPDATE users SET activated_until = ? WHERE id = ?`).run(Date.now() + 1000_000, me.id);
    const r = await app.inject({
      method: "POST",
      url: "/api/search/stop",
      headers: { "x-dev-tg-id": String(tgId), "content-type": "text/plain" },
      payload: "",
    });
    assert.equal(r.statusCode, 200);
  });

  test("превышение route-лимита — 429 rate_limited", async () => {
    // /auth/onboard: max 5/min на ключ; шлём 6 запросов с ОДНИМ ключом rate-limit
    const { tgId } = await createUser(app);
    let last;
    for (let i = 0; i < 6; i++) {
      last = await app.inject({
        method: "POST",
        url: "/api/auth/onboard",
        headers: { "x-dev-tg-id": String(tgId), "x-telegram-init-data": "shared-rate-key" },
        payload: { name: "Кто-то", contact: "@x", lang: "ru" },
      });
    }
    assert.equal(last.statusCode, 429);
    assert.equal(last.json().error, "rate_limited");
  });
});
