import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { loadServer, req, createUser, checkin, activate } from "./helpers.js";

const ADMIN_TG = 777_000_777;
process.env.ADMIN_TG_IDS = String(ADMIN_TG);

let app, q, config, admin;
before(async () => {
  ({ app, q, config } = await loadServer());
  admin = await createUser(app, { tgId: ADMIN_TG, name: "Главный Админ" });
  assert.equal(admin.me.role, "admin");
});

describe("доступ", () => {
  test("не-админу все /admin-роуты запрещены", async () => {
    const u = await createUser(app);
    for (const [method, url] of [
      ["GET", "/api/admin/users"],
      ["GET", `/api/admin/users/${admin.me.id}`],
      ["POST", `/api/admin/users/${u.me.id}/checkin`],
      ["POST", `/api/admin/users/${u.me.id}/activate`],
      ["POST", `/api/admin/users/${u.me.id}/deactivate`],
    ]) {
      const r = await req(app, method, url, { tgId: u.tgId });
      assert.equal(r.statusCode, 403, `${method} ${url}`);
      assert.equal(r.json().error, "forbidden");
    }
  });
});

describe("список и карточка", () => {
  test("поиск по числу — точный ID, по строке — LIKE по имени", async () => {
    const u = await createUser(app, { name: "Уникальнейший Игрок" });

    const byId = (await req(app, "GET", `/api/admin/users?q=${u.me.id}`, { tgId: ADMIN_TG })).json().users;
    assert.equal(byId.length, 1);
    assert.equal(byId[0].id, u.me.id);
    assert.equal(byId[0].contact, "@test"); // админ видит контакт

    const byName = (await req(app, "GET", "/api/admin/users?q=Уникальнейший", { tgId: ADMIN_TG })).json().users;
    assert.ok(byName.some((x) => x.id === u.me.id));

    const all = (await req(app, "GET", "/api/admin/users", { tgId: ADMIN_TG })).json().users;
    assert.ok(all.length >= 2);
  });

  test("карточка содержит последние матчи с дельтой со знаком игрока", async () => {
    const a = await createUser(app);
    const b = await createUser(app);
    checkin(q, a.me.id);
    checkin(q, b.me.id);
    const m = (await req(app, "POST", "/api/matches/report", { tgId: a.tgId, body: { opponentId: b.me.id, result: "win" } })).json().match;
    await req(app, "POST", `/api/matches/${m.id}/respond`, { tgId: b.tgId, body: { result: "lose" } });

    const card = (await req(app, "GET", `/api/admin/users/${b.me.id}`, { tgId: ADMIN_TG })).json();
    assert.equal(card.user.id, b.me.id);
    const rm = card.recentMatches.find((x) => x.id === m.id);
    assert.equal(rm.won, false);
    assert.equal(rm.delta, -16); // проигравший — минус
    assert.equal(rm.opponentName, a.me.name);
  });

  test("мусорный/несуществующий id — 400/404", async () => {
    assert.equal((await req(app, "GET", "/api/admin/users/abc", { tgId: ADMIN_TG })).statusCode, 400);
    assert.equal((await req(app, "GET", "/api/admin/users/999999", { tgId: ADMIN_TG })).statusCode, 404);
  });
});

describe("чекин / активация / деактивация", () => {
  test("чекин даёт 6 часов и продлевает активацию на 45 дней + пишет аудит", async () => {
    const u = await createUser(app);
    const t0 = Date.now();
    const r = await req(app, "POST", `/api/admin/users/${u.me.id}/checkin`, { tgId: ADMIN_TG });
    const { checkedInUntil, activatedUntil } = r.json();
    assert.ok(Math.abs(checkedInUntil - (t0 + config.CHECKIN_MS)) < 5000);
    assert.ok(Math.abs(activatedUntil - (t0 + config.ACTIVATION_MS)) < 5000);

    const me = (await req(app, "GET", "/api/me", { tgId: u.tgId })).json().me;
    assert.equal(me.isCheckedIn, true);
    assert.equal(me.isActivated, true);

    const log = q(`SELECT * FROM audit_log WHERE target_id = ? AND action = 'checkin'`).all(u.me.id);
    assert.equal(log.length, 1);
    assert.equal(log[0].admin_id, admin.me.id);
  });

  test("activate продлевает только активацию", async () => {
    const u = await createUser(app);
    await req(app, "POST", `/api/admin/users/${u.me.id}/activate`, { tgId: ADMIN_TG });
    const me = (await req(app, "GET", "/api/me", { tgId: u.tgId })).json().me;
    assert.equal(me.isActivated, true);
    assert.equal(me.isCheckedIn, false);
  });

  test("deactivate гасит статусы, удаляет заявки, снимает поиск и отменяет pending-матчи", async () => {
    const u = await createUser(app);
    const opp = await createUser(app);
    activate(q, u.me.id);
    checkin(q, u.me.id);
    checkin(q, opp.me.id);
    await req(app, "POST", "/api/requests", { tgId: u.tgId, body: { dayOffset: 1, timeSlot: 0, disc: 0, pays: 0 } });
    await req(app, "POST", "/api/search/start", { tgId: u.tgId, body: {} });
    const m = (await req(app, "POST", "/api/matches/report", { tgId: u.tgId, body: { opponentId: opp.me.id, result: "win" } })).json().match;

    const r = await req(app, "POST", `/api/admin/users/${u.me.id}/deactivate`, { tgId: ADMIN_TG });
    assert.equal(r.statusCode, 200);

    const row = q(`SELECT * FROM users WHERE id = ?`).get(u.me.id);
    assert.equal(row.activated_until, 0);
    assert.equal(row.checked_in_until, 0);
    assert.equal(row.search_until, 0);
    assert.equal(q(`SELECT COUNT(*) AS c FROM requests WHERE user_id = ?`).get(u.me.id).c, 0);
    assert.equal(q(`SELECT status FROM matches WHERE id = ?`).get(m.id).status, "cancelled");
  });

  test("админ не может деактивировать сам себя", async () => {
    const r = await req(app, "POST", `/api/admin/users/${admin.me.id}/deactivate`, { tgId: ADMIN_TG });
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().error, "self_action");
  });
});
