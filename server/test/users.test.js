import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { loadServer, req, createUser, freshTgId, checkin, setElo, activate } from "./helpers.js";

let app, q, config;
before(async () => ({ app, q, config } = await loadServer()));

/** Подтверждённый матч между A и B (оба должны быть в чекине), победитель A. */
async function playMatch(a, b) {
  const r1 = await req(app, "POST", "/api/matches/report", { tgId: a.tgId, body: { opponentId: b.me.id, result: "win" } });
  assert.equal(r1.statusCode, 200, r1.body);
  const m = r1.json().match;
  const r2 = await req(app, "POST", `/api/matches/${m.id}/respond`, { tgId: b.tgId, body: { result: "lose" } });
  assert.equal(r2.statusCode, 200, r2.body);
  return r2.json().match;
}

describe("онбординг", () => {
  test("создаёт пользователя со стартовым эло и публичным ID от 1000", async () => {
    const { me } = await createUser(app, { name: "Новичок Тестов" });
    assert.equal(me.elo, config.ELO_START);
    assert.ok(me.id >= 1000, `id = ${me.id}`);
    assert.equal(me.matchesCount, 0);
    assert.equal(me.isActivated, false);
    assert.equal(me.isCheckedIn, false);
  });

  test("повторный онбординг идемпотентен", async () => {
    const tgId = freshTgId();
    const first = await createUser(app, { tgId, name: "Первый Вариант" });
    const r = await req(app, "POST", "/api/auth/onboard", {
      tgId, body: { name: "Другое Имя", contact: "@other", lang: "en" },
    });
    assert.equal(r.json().me.id, first.me.id);
    assert.equal(r.json().me.name, "Первый Вариант"); // не перезаписан
  });

  test("имя из одних пробелов отклоняется после clean()", async () => {
    const r = await req(app, "POST", "/api/auth/onboard", {
      tgId: freshTgId(), body: { name: "  x ", contact: "@ok", lang: "ru" },
    });
    assert.equal(r.statusCode, 400); // после очистки длина < 2
  });

  test("невалидный язык отклоняется схемой", async () => {
    const r = await req(app, "POST", "/api/auth/onboard", {
      tgId: freshTgId(), body: { name: "Иван Иванов", contact: "@ok", lang: "de" },
    });
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().error, "validation");
  });
});

describe("профиль", () => {
  test("PATCH /me обновляет поля частично", async () => {
    const u = await createUser(app, { name: "Старое Имя" });
    // Имя залочено по умолчанию (name_change_allowed=0) — разблокируем, как делает админ.
    q(`UPDATE users SET name_change_allowed = 1 WHERE id = ?`).run(u.me.id);
    const r = await req(app, "PATCH", "/api/me", { tgId: u.tgId, body: { name: "Новое  Имя", prefDisc: 0 } });
    const me = r.json().me;
    assert.equal(me.name, "Новое Имя"); // двойной пробел схлопнут
    assert.equal(me.prefDisc, 0);
    assert.equal(me.contact, "@test"); // не тронут
  });

  test("PATCH /me с коротким именем — 400", async () => {
    const u = await createUser(app);
    const r = await req(app, "PATCH", "/api/me", { tgId: u.tgId, body: { name: "и" } });
    assert.equal(r.statusCode, 400);
  });

  test("place считается по числу игроков с большим эло", async () => {
    const u = await createUser(app);
    setElo(q, u.me.id, 100_000); // гарантированно №1
    const r = await req(app, "GET", "/api/me", { tgId: u.tgId });
    assert.equal(r.json().me.place, 1);
  });
});

describe("рейтинг", () => {
  test("топ отсортирован по эло и содержит моё место", async () => {
    const u = await createUser(app);
    const r = await req(app, "GET", "/api/rating", { tgId: u.tgId });
    const { top, me } = r.json();
    assert.ok(top.length >= 2);
    for (let i = 1; i < top.length; i++) {
      assert.ok(top[i - 1].elo >= top[i].elo, "топ не отсортирован");
    }
    assert.equal(me.id, u.me.id);
    assert.ok(me.place >= 1);
    // контакты в рейтинг не утекают
    assert.equal(top[0].contact, undefined);
  });
});

describe("чужой профиль и история", () => {
  test("контакт виден только активированным зрителям", async () => {
    const viewer = await createUser(app);
    const target = await createUser(app, { contact: "@target_contact" });

    const hidden = await req(app, "GET", `/api/players/${target.me.id}`, { tgId: viewer.tgId });
    assert.equal(hidden.json().player.contact, null);

    activate(q, viewer.me.id);
    const visible = await req(app, "GET", `/api/players/${target.me.id}`, { tgId: viewer.tgId });
    assert.equal(visible.json().player.contact, "@target_contact");
  });

  test("h2h и история отдают дельту со знаком зрителя", async () => {
    const a = await createUser(app);
    const b = await createUser(app);
    checkin(q, a.me.id);
    checkin(q, b.me.id);
    const m = await playMatch(a, b); // победил A, дельта 16

    const h2hForA = (await req(app, "GET", `/api/players/${b.me.id}`, { tgId: a.tgId })).json().h2h;
    assert.equal(h2hForA.length, 1);
    assert.equal(h2hForA[0].iWon, true);
    assert.equal(h2hForA[0].delta, m.delta);

    const histForB = (await req(app, "GET", "/api/history", { tgId: b.tgId })).json().matches;
    assert.equal(histForB[0].iWon, false);
    assert.equal(histForB[0].delta, -m.delta); // проигравший видит минус
    assert.equal(histForB[0].opponent.id, a.me.id);
  });

  test("recent-opponents дедуплицирует и берёт последнюю дельту", async () => {
    const a = await createUser(app);
    const b = await createUser(app);
    checkin(q, a.me.id);
    checkin(q, b.me.id);
    await playMatch(a, b);
    checkin(q, a.me.id); // продлеваем на второй матч
    checkin(q, b.me.id);
    const second = await playMatch(a, b);

    const opps = (await req(app, "GET", "/api/recent-opponents", { tgId: a.tgId })).json().opponents;
    const entries = opps.filter((o) => o.id === b.me.id);
    assert.equal(entries.length, 1); // без дублей
    assert.equal(entries[0].lastDelta, second.delta);
  });

  test("несуществующий игрок — 404, мусорный id — 400", async () => {
    const u = await createUser(app);
    assert.equal((await req(app, "GET", "/api/players/999999", { tgId: u.tgId })).statusCode, 404);
    assert.equal((await req(app, "GET", "/api/players/abc", { tgId: u.tgId })).statusCode, 400);
  });
});

describe("избранное", () => {
  test("добавление/повтор/удаление", async () => {
    const u = await createUser(app);
    const fav = await createUser(app);

    assert.equal((await req(app, "POST", `/api/favorites/${fav.me.id}`, { tgId: u.tgId })).statusCode, 200);
    assert.equal((await req(app, "POST", `/api/favorites/${fav.me.id}`, { tgId: u.tgId })).statusCode, 200); // идемпотентно

    const list = (await req(app, "GET", "/api/favorites", { tgId: u.tgId })).json().favorites;
    assert.equal(list.length, 1);
    assert.equal(list[0].id, fav.me.id);

    await req(app, "DELETE", `/api/favorites/${fav.me.id}`, { tgId: u.tgId });
    const after = (await req(app, "GET", "/api/favorites", { tgId: u.tgId })).json().favorites;
    assert.equal(after.length, 0);
  });

  test("себя и несуществующих добавить нельзя", async () => {
    const u = await createUser(app);
    assert.equal((await req(app, "POST", `/api/favorites/${u.me.id}`, { tgId: u.tgId })).statusCode, 400);
    assert.equal((await req(app, "POST", "/api/favorites/999999", { tgId: u.tgId })).statusCode, 404);
  });

  test("лимит MAX_FAVORITES соблюдается", async () => {
    const u = await createUser(app);
    const extra = await createUser(app);
    // насыпаем синтетических игроков напрямую и добиваем избранное до лимита
    const insUser = q(`INSERT INTO users (tg_id, name, created_at) VALUES (?, ?, ?)`);
    const insFav = q(`INSERT OR IGNORE INTO favorites (user_id, fav_id, created_at) VALUES (?, ?, ?)`);
    for (let i = 0; i < config.MAX_FAVORITES; i++) {
      const r = insUser.run(800_000_000 + i, `Болванчик ${i}`, Date.now());
      insFav.run(u.me.id, Number(r.lastInsertRowid), Date.now());
    }
    const r = await req(app, "POST", `/api/favorites/${extra.me.id}`, { tgId: u.tgId });
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().error, "limit_reached");
  });
});
