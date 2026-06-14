import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { loadServer, req, createUser, checkin, setElo } from "./helpers.js";

const SUPER_TG = 555_000_555;
process.env.ADMIN_TG_IDS = String(SUPER_TG);

let app, q, sup;
before(async () => {
  ({ app, q } = await loadServer());
  sup = await createUser(app, { tgId: SUPER_TG, name: "Супер Админ" });
  q(`UPDATE users SET role = 'admin', is_super = 1 WHERE id = ?`).run(sup.me.id);
});

const asSuper = (method, url, body) => req(app, method, url, { tgId: SUPER_TG, ...(body !== undefined ? { body } : {}) });

async function play(a, b) {
  const m = (await req(app, "POST", "/api/matches/report", { tgId: a.tgId, body: { opponentId: b.me.id, result: "win" } })).json().match;
  await req(app, "POST", `/api/matches/${m.id}/respond`, { tgId: b.tgId, body: { result: "lose" } });
  return m.id;
}

describe("доступ суперадмина", () => {
  test("обычный админ (не super) получает 403 на super-роуте", async () => {
    const admin = await createUser(app);
    q(`UPDATE users SET role = 'admin' WHERE id = ?`).run(admin.me.id); // админ, но не super
    const r = await req(app, "GET", "/api/admin/stats", { tgId: admin.tgId });
    assert.equal(r.statusCode, 403);
  });
});

describe("объявления", () => {
  test("создать → видно в announce-all → toggle → delete", async () => {
    assert.equal((await asSuper("POST", "/api/admin/announce", { text: "  Привет  клуб  " })).statusCode, 200);
    let list = (await asSuper("GET", "/api/admin/announce-all")).json().announcements;
    const ann = list.find((a) => a.text === "Привет клуб");
    assert.ok(ann, "объявление создано (пробелы схлопнуты)");
    assert.equal(ann.active, true);

    const tg = await asSuper("POST", `/api/admin/announce/${ann.id}/toggle`);
    assert.equal(tg.json().active, false);

    await asSuper("DELETE", `/api/admin/announce/${ann.id}`);
    list = (await asSuper("GET", "/api/admin/announce-all")).json().announcements;
    assert.ok(!list.some((a) => a.id === ann.id));
  });

  test("toggle несуществующего — 404", async () => {
    assert.equal((await asSuper("POST", "/api/admin/announce/999999/toggle")).statusCode, 404);
  });
});

describe("сезоны", () => {
  test("открыть, повторно нельзя, изменить дату, закрыть с наградой и сбросом", async () => {
    const a = await createUser(app);
    const b = await createUser(app);
    checkin(q, a.me.id);
    checkin(q, b.me.id);
    setElo(q, a.me.id, 1400); // a будет в топе пирамиды
    await play(a, b); // a ещё выше + есть подтверждённый матч

    const open = await asSuper("POST", "/api/admin/seasons", { durationDays: 30 });
    assert.equal(open.statusCode, 200);
    const seasonId = open.json().id;

    // повторное открытие — 400
    assert.equal((await asSuper("POST", "/api/admin/seasons", { durationDays: 10 })).json().error, "season_already_open");

    // правка даты
    assert.equal((await asSuper("PATCH", `/api/admin/seasons/${seasonId}`, { endsAt: 99_999_999_999 })).statusCode, 200);

    // закрытие
    assert.equal((await asSuper("POST", `/api/admin/seasons/${seasonId}/close`)).statusCode, 200);
    // повторное закрытие — 400
    assert.equal((await asSuper("POST", `/api/admin/seasons/${seasonId}/close`)).json().error, "already_closed");

    // топ-1 пирамиды (a) получил season_master с префиксом p:
    assert.ok(q(`SELECT 1 FROM achievements WHERE user_id = ? AND code = ?`).get(a.me.id, `p:season_master_${seasonId}`));
    // ELO сброшено к ~1000 с 30% переноса превышения
    const aAfter = q(`SELECT elo_pyramid, matches_count_pyramid FROM users WHERE id = ?`).get(a.me.id);
    assert.ok(aAfter.elo_pyramid < 1400 && aAfter.elo_pyramid >= 1000);
    assert.equal(aAfter.matches_count_pyramid, 0); // статистика обнулена
  });
});

describe("аудит и статистика", () => {
  test("audit-журнал отдаёт записи действий", async () => {
    const u = await createUser(app);
    await asSuper("POST", `/api/admin/users/${u.me.id}/activate`);
    const { entries } = (await asSuper("GET", "/api/admin/audit")).json();
    assert.ok(entries.length > 0);
    assert.ok(entries.every((e) => "action" in e && "createdAt" in e));
  });

  test("stats считает игроков и матчи", async () => {
    const s = (await asSuper("GET", "/api/admin/stats")).json();
    for (const k of ["total", "activated", "banned", "searching", "matchesToday", "matchesTotal"]) {
      assert.equal(typeof s[k], "number", `поле ${k}`);
    }
    assert.ok(s.total >= 1);
  });
});

describe("ручные правки игрока", () => {
  test("grant-achievement: успех, повтор 400, неизвестный игрок 404", async () => {
    const u = await createUser(app);
    assert.equal((await asSuper("POST", "/api/admin/grant-achievement", { userId: u.me.id, code: "p:phoenix" })).statusCode, 200);
    assert.equal((await asSuper("POST", "/api/admin/grant-achievement", { userId: u.me.id, code: "p:phoenix" })).json().error, "already_has");
    assert.equal((await asSuper("POST", "/api/admin/grant-achievement", { userId: 999999, code: "p:phoenix" })).statusCode, 404);
  });

  test("set-elo пишет в нужную дисциплину", async () => {
    const u = await createUser(app);
    await asSuper("POST", `/api/admin/users/${u.me.id}/set-elo`, { elo: 1333, discipline: "pyramid" });
    assert.equal(q(`SELECT elo_pyramid FROM users WHERE id = ?`).get(u.me.id).elo_pyramid, 1333);
    await asSuper("POST", `/api/admin/users/${u.me.id}/set-elo`, { elo: 1222, discipline: "pool" });
    assert.equal(q(`SELECT elo FROM users WHERE id = ?`).get(u.me.id).elo, 1222);
  });

  test("grant-name-change разблокирует, set-name меняет и снова лочит", async () => {
    const u = await createUser(app);
    await asSuper("POST", `/api/admin/users/${u.me.id}/grant-name-change`);
    assert.equal(q(`SELECT name_change_allowed FROM users WHERE id = ?`).get(u.me.id).name_change_allowed, 1);

    await asSuper("POST", `/api/admin/users/${u.me.id}/set-name`, { name: "Новое Имя" });
    const row = q(`SELECT name, name_change_allowed FROM users WHERE id = ?`).get(u.me.id);
    assert.equal(row.name, "Новое Имя");
    assert.equal(row.name_change_allowed, 0);
  });

  test("change-id переносит игрока и связи; same_id/id_taken — 400", async () => {
    const u = await createUser(app);
    const newId = 4242;
    assert.equal((await asSuper("POST", `/api/admin/users/${u.me.id}/change-id`, { newId })).statusCode, 200);
    assert.ok(q(`SELECT 1 FROM users WHERE id = ?`).get(newId));
    assert.ok(!q(`SELECT 1 FROM users WHERE id = ?`).get(u.me.id));

    assert.equal((await asSuper("POST", `/api/admin/users/${newId}/change-id`, { newId })).json().error, "same_id");
    assert.equal((await asSuper("POST", `/api/admin/users/${newId}/change-id`, { newId: sup.me.id })).json().error, "id_taken");
  });

  test("reset-stats обнуляет статистику", async () => {
    const u = await createUser(app);
    setElo(q, u.me.id, 1500);
    await asSuper("POST", `/api/admin/users/${u.me.id}/reset-stats`);
    const row = q(`SELECT elo, elo_pyramid, matches_count_pyramid FROM users WHERE id = ?`).get(u.me.id);
    assert.equal(row.elo, 1000);
    assert.equal(row.elo_pyramid, 1000);
    assert.equal(row.matches_count_pyramid, 0);
  });
});

describe("удаление игрока и матчи", () => {
  test("delete откатывает ELO сопернику и чистит связи", async () => {
    const a = await createUser(app);
    const b = await createUser(app);
    checkin(q, a.me.id);
    checkin(q, b.me.id);
    await play(a, b); // a:1016 b:984 (pyramid)
    assert.equal(q(`SELECT elo_pyramid FROM users WHERE id = ?`).get(b.me.id).elo_pyramid, 984);

    assert.equal((await asSuper("DELETE", `/api/admin/users/${a.me.id}`)).statusCode, 200);
    assert.ok(!q(`SELECT 1 FROM users WHERE id = ?`).get(a.me.id));
    // сопернику вернули забранные 16
    assert.equal(q(`SELECT elo_pyramid FROM users WHERE id = ?`).get(b.me.id).elo_pyramid, 1000);
  });

  test("нельзя удалить себя и супера", async () => {
    assert.equal((await asSuper("DELETE", `/api/admin/users/${sup.me.id}`)).json().error, "self_action");
    const other = await createUser(app);
    q(`UPDATE users SET is_super = 1 WHERE id = ?`).run(other.me.id);
    assert.equal((await asSuper("DELETE", `/api/admin/users/${other.me.id}`)).json().error, "cannot_delete_super");
  });

  test("conflicts и matches отдают списки; cancel откатывает подтверждённый матч", async () => {
    const a = await createUser(app);
    const b = await createUser(app);
    checkin(q, a.me.id);
    checkin(q, b.me.id);
    const mid = await play(a, b);

    const matches = (await asSuper("GET", `/api/admin/matches?q=${a.me.id}`)).json().matches;
    assert.ok(matches.some((m) => m.id === mid));
    assert.ok(Array.isArray((await asSuper("GET", "/api/admin/conflicts")).json().conflicts));

    assert.equal((await asSuper("POST", `/api/admin/matches/${mid}/cancel`)).statusCode, 200);
    assert.equal(q(`SELECT status FROM matches WHERE id = ?`).get(mid).status, "cancelled");
    // ELO откатилось: победитель -16, проигравший +16 → оба 1000
    assert.equal(q(`SELECT elo_pyramid FROM users WHERE id = ?`).get(a.me.id).elo_pyramid, 1000);
    assert.equal(q(`SELECT elo_pyramid FROM users WHERE id = ?`).get(b.me.id).elo_pyramid, 1000);
    // повторная отмена — 400
    assert.equal((await asSuper("POST", `/api/admin/matches/${mid}/cancel`)).json().error, "already_cancelled");
  });

  test("ban/unban и promote/demote меняют флаги", async () => {
    const u = await createUser(app);
    await asSuper("POST", `/api/admin/users/${u.me.id}/ban`);
    assert.equal(q(`SELECT banned FROM users WHERE id = ?`).get(u.me.id).banned, 1);
    await asSuper("POST", `/api/admin/users/${u.me.id}/unban`);
    assert.equal(q(`SELECT banned FROM users WHERE id = ?`).get(u.me.id).banned, 0);

    await asSuper("POST", `/api/admin/users/${u.me.id}/promote`);
    assert.equal(q(`SELECT role FROM users WHERE id = ?`).get(u.me.id).role, "admin");
    await asSuper("POST", `/api/admin/users/${u.me.id}/demote`);
    assert.equal(q(`SELECT role FROM users WHERE id = ?`).get(u.me.id).role, "user");
  });
});
