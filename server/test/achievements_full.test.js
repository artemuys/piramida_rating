// Покрытие оставшихся ачивок из checkMatchAchievements, которых нет в
// achievements.test.js: veteran_*, new_peak_*, phoenix, rollercoaster,
// extrovert, headhunter, tried. Для порядко- и данно-зависимых ачивок
// вставляем подтверждённые матчи с контролируемым resolved_at и зовём
// checkMatchAchievements напрямую — быстро и без гонок по времени.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { loadServer, createUser } from "./helpers.js";

let app, q, check;
before(async () => {
  ({ app, q } = await loadServer());
  ({ checkMatchAchievements: check } = await import("../src/achievements.js"));
});

const hasAch = (userId, code) => !!q(`SELECT 1 FROM achievements WHERE user_id = ? AND code = ?`).get(userId, code);

/** Вставляет подтверждённый матч pyramid и возвращает его id. */
function insertMatch(initiator, opponent, winnerId, resolvedAt) {
  const claim = winnerId === initiator ? "win" : "lose";
  const oppClaim = winnerId === initiator ? "lose" : "win";
  const r = q(
    `INSERT INTO matches
       (initiator_id, opponent_id, initiator_claim, opponent_claim, status, winner_id, delta,
        initiator_elo_before, opponent_elo_before, discipline, expires_at, created_at, resolved_at)
     VALUES (?, ?, ?, ?, 'confirmed', ?, 10, 1000, 1000, 'pyramid', ?, ?, ?)`
  ).run(initiator, opponent, claim, oppClaim, winnerId, resolvedAt, resolvedAt, resolvedAt);
  return Number(r.lastInsertRowid);
}

describe("ачивки по счётчикам пользователя", () => {
  test("calibration + veteran_20..1000 выдаются при точном matches_count", async () => {
    const a = await createUser(app);
    const b = await createUser(app);
    for (const [n, code] of [
      [10, "p:calibration"],
      [20, "p:veteran_20"],
      [50, "p:veteran_50"],
      [100, "p:veteran_100"],
      [200, "p:veteran_200"],
      [500, "p:veteran_500"],
      [1000, "p:veteran_1000"],
    ]) {
      q(`UPDATE users SET matches_count_pyramid = ? WHERE id = ?`).run(n, a.me.id);
      check(a.me.id, b.me.id, 0, "pyramid"); // a — победитель
      assert.ok(hasAch(a.me.id, code), `${code} при matches_count=${n}`);
    }
  });

  test("new_peak_1100..1500 выдаются победителю по достигнутому elo", async () => {
    const a = await createUser(app);
    const b = await createUser(app);
    q(`UPDATE users SET elo_pyramid = 1500 WHERE id = ?`).run(a.me.id);
    check(a.me.id, b.me.id, 0, "pyramid"); // a выиграл на elo 1500
    for (const thr of [1100, 1200, 1300, 1400, 1500]) {
      assert.ok(hasAch(a.me.id, `p:new_peak_${thr}`), `new_peak_${thr}`);
    }
    // проигравший (b, elo 1000) пиков не получает
    assert.ok(!hasAch(b.me.id, "p:new_peak_1100"), "loser без пика");
  });
});

describe("ачивки по истории матчей", () => {
  test("phoenix: победа после 4 поражений подряд", async () => {
    const a = await createUser(app);
    const b = await createUser(app);
    const t0 = Date.now();
    // 4 прошлых матча, все выиграл b
    for (let i = 0; i < 4; i++) insertMatch(a.me.id, b.me.id, b.me.id, t0 + i);
    // текущий — выиграл a (исключается по id!=matchId)
    const cur = insertMatch(a.me.id, b.me.id, a.me.id, t0 + 10);
    check(a.me.id, b.me.id, cur, "pyramid");
    assert.ok(hasAch(a.me.id, "p:phoenix"), "phoenix после 4 поражений");
  });

  test("rollercoaster: чередование W/L в последних 6 матчах", async () => {
    const a = await createUser(app);
    const b = await createUser(app);
    const t0 = Date.now();
    const winners = [a, b, a, b, a, b].map((u) => u.me.id);
    let last;
    winners.forEach((w, i) => { last = insertMatch(a.me.id, b.me.id, w, t0 + i); });
    // последний выиграл b
    check(b.me.id, a.me.id, last, "pyramid");
    assert.ok(hasAch(a.me.id, "p:rollercoaster"), "американские горки для a");
    assert.ok(hasAch(b.me.id, "p:rollercoaster"), "и для b — чередование симметрично");
  });

  test("extrovert (20 уникальных) и headhunter (10 за неделю)", async () => {
    const a = await createUser(app);
    const opps = [];
    for (let i = 0; i < 20; i++) opps.push(await createUser(app));
    const t0 = Date.now();
    let last, lastOpp;
    opps.forEach((o, i) => { last = insertMatch(a.me.id, o.me.id, a.me.id, t0 - i * 1000); lastOpp = o; });
    check(a.me.id, lastOpp.me.id, last, "pyramid");
    assert.ok(hasAch(a.me.id, "p:extrovert"), "20 уникальных соперников");
    assert.ok(hasAch(a.me.id, "p:headhunter"), "10 разных за неделю");
  });

  test("tried: поражение от игрока из топ-3 (клуб ≥10)", async () => {
    const players = [];
    for (let i = 0; i < 11; i++) players.push(await createUser(app));
    const a = players[0];
    const top = players[1];
    q(`UPDATE users SET elo_pyramid = 3000 WHERE id = ?`).run(top.me.id); // гарантированно топ-1
    const cur = insertMatch(top.me.id, a.me.id, top.me.id, Date.now());
    check(top.me.id, a.me.id, cur, "pyramid"); // a проиграл топ-игроку
    assert.ok(hasAch(a.me.id, "p:tried"), "ты пытался — проигрыш топ-3");
  });
});
