import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { loadServer, createUser, checkin } from "./helpers.js";

let app, q;
before(async () => ({ app, q } = await loadServer()));

const silentLog = { error: () => {} };

describe("фоновая уборка", () => {
  test("удаляет вчерашние заявки и старый аудит, не трогая свежие", async () => {
    const { startSweeper } = await import("../src/sweeper.js");
    const { me } = await createUser(app);

    q(`INSERT INTO requests (user_id, start_day, end_day, time_from, time_to, disc, pays, created_at) VALUES (?, '2000-01-01', '2000-01-02', '18:00', '22:00', 0, 0, ?)`)
      .run(me.id, Date.now());
    q(`INSERT INTO requests (user_id, start_day, end_day, time_from, time_to, disc, pays, created_at) VALUES (?, '2999-01-01', '2999-01-02', '18:00', '22:00', 0, 0, ?)`)
      .run(me.id, Date.now());
    q(`INSERT INTO audit_log (admin_id, target_id, action, created_at) VALUES (1, 1, 'old', ?)`)
      .run(Date.now() - 181 * 24 * 3600 * 1000);
    q(`INSERT INTO audit_log (admin_id, target_id, action, created_at) VALUES (1, 1, 'fresh', ?)`)
      .run(Date.now());

    const timer = startSweeper(silentLog); // первый прогон — синхронно внутри
    clearInterval(timer);

    const days = q(`SELECT start_day FROM requests WHERE user_id = ?`).all(me.id).map((r) => r.start_day);
    assert.deepEqual(days, ["2999-01-01"]);
    assert.equal(q(`SELECT COUNT(*) AS c FROM audit_log WHERE action = 'old'`).get().c, 0);
    assert.equal(q(`SELECT COUNT(*) AS c FROM audit_log WHERE action = 'fresh'`).get().c, 1);
  });

  test("переводит просроченные pending-матчи в timeout", async () => {
    const { startSweeper } = await import("../src/sweeper.js");
    const a = await createUser(app);
    const b = await createUser(app);
    checkin(q, a.me.id);
    checkin(q, b.me.id);
    const r = q(
      `INSERT INTO matches (initiator_id, opponent_id, initiator_claim, status,
         initiator_elo_before, opponent_elo_before, expires_at, created_at)
       VALUES (?, ?, 'win', 'pending', 1000, 1000, ?, ?)`
    ).run(a.me.id, b.me.id, Date.now() - 1000, Date.now());

    const timer = startSweeper(silentLog);
    clearInterval(timer);

    const m = q(`SELECT status FROM matches WHERE id = ?`).get(Number(r.lastInsertRowid));
    assert.equal(m.status, "timeout");
  });
});
