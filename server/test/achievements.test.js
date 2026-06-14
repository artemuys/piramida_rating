import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { loadServer, req, createUser, checkin } from "./helpers.js";

let app, q;
let grantAchievement, refreshElite;
before(async () => {
  ({ app, q } = await loadServer());
  ({ grantAchievement, refreshElite } = await import("../src/achievements.js"));
});

const hasAch = (userId, code) => !!q(`SELECT 1 FROM achievements WHERE user_id = ? AND code = ?`).get(userId, code);

async function play(a, b) {
  const m = (await req(app, "POST", "/api/matches/report", { tgId: a.tgId, body: { opponentId: b.me.id, result: "win" } })).json().match;
  await req(app, "POST", `/api/matches/${m.id}/respond`, { tgId: b.tgId, body: { result: "lose" } });
}

describe("checkMatchAchievements через серию матчей", () => {
  test("10 побед A над B подряд выдают стрик/калибровку/день-сурка/свою-атмосферу", async () => {
    const a = await createUser(app);
    const b = await createUser(app);
    checkin(q, a.me.id, 24 * 3600 * 1000);
    checkin(q, b.me.id, 24 * 3600 * 1000);

    for (let i = 0; i < 10; i++) await play(a, b);

    // победитель (active_discipline=pyramid → ачивки с префиксом p:)
    assert.ok(hasAch(a.me.id, "p:on_fire_5"), "стрик 5");
    assert.ok(hasAch(a.me.id, "p:inferno_7"), "стрик 7");
    assert.ok(hasAch(a.me.id, "p:immortal_10"), "стрик 10");
    assert.ok(hasAch(a.me.id, "p:calibration"), "10 матчей");
    assert.ok(hasAch(a.me.id, "p:groundhog"), "10 побед над одним за день");
    assert.ok(hasAch(a.me.id, "p:own_atmo"), "10 матчей подряд с одним");

    // проигравший
    assert.ok(hasAch(b.me.id, "p:calibration"), "у B тоже 10 матчей");
    assert.ok(hasAch(b.me.id, "p:bad_day"), "серия поражений 6");
    assert.ok(hasAch(b.me.id, "p:main_donor"), "проиграл одному ≥4 за день");

    // непобедные ачивки не выдаются ошибочно
    assert.ok(!hasAch(a.me.id, "p:rollercoaster"), "нет чередования — не американские горки");
  });
});

describe("grantAchievement", () => {
  test("идемпотентен и расставляет префикс по дисциплине", async () => {
    const u = await createUser(app);
    assert.equal(grantAchievement(u.me.id, "calibration", "pyramid"), true);  // первый раз
    assert.equal(grantAchievement(u.me.id, "calibration", "pyramid"), false); // повтор
    assert.ok(hasAch(u.me.id, "p:calibration"));

    assert.equal(grantAchievement(u.me.id, "calibration", "pool"), true); // пул — другой код
    assert.ok(hasAch(u.me.id, "calibration"));
  });
});

describe("refreshElite", () => {
  test("меньше 10 игроков — elite снимается у всех", async () => {
    const u = await createUser(app);
    grantAchievement(u.me.id, "elite", "pyramid"); // вручную выдали p:elite
    assert.ok(hasAch(u.me.id, "p:elite"));
    refreshElite("pyramid"); // клуб < 10 игроков
    assert.ok(!hasAch(u.me.id, "p:elite"), "elite должен быть удалён при малом клубе");
  });

  test("10+ игроков — elite у топ-3 по elo_pyramid", async () => {
    const users = [];
    for (let i = 0; i < 12; i++) users.push(await createUser(app));
    // расставим уникальные рейтинги: первые три — самые высокие
    users.forEach((u, i) => q(`UPDATE users SET elo_pyramid = ? WHERE id = ?`).run(2000 - i, u.me.id));

    refreshElite("pyramid");

    const top3 = q(`SELECT id FROM users ORDER BY elo_pyramid DESC LIMIT 3`).all().map((r) => r.id);
    for (const id of top3) assert.ok(hasAch(id, "p:elite"), `топ-игрок ${id} должен иметь elite`);
    // четвёртый по рейтингу — без elite
    const fourth = q(`SELECT id FROM users ORDER BY elo_pyramid DESC LIMIT 1 OFFSET 3`).get().id;
    assert.ok(!hasAch(fourth, "p:elite"));
  });
});
