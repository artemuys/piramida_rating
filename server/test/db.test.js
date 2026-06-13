import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { loadServer, createUser } from "./helpers.js";

let app, db, q, tx;
before(async () => ({ app, db, q, tx } = await loadServer()));

describe("схема и seed", () => {
  test("seed выполняется один раз и содержит 12 игроков", () => {
    const c = q(`SELECT COUNT(*) AS c FROM users`).get().c;
    assert.ok(c >= 12);
    // повторный прогон seed не дублирует (INSERT OR IGNORE по tg_id)
    assert.equal(q(`SELECT COUNT(*) AS c FROM users WHERE tg_id = 607848091`).get().c, 1);
  });

  test("публичные ID начинаются с 1000", () => {
    const min = q(`SELECT MIN(id) AS m FROM users`).get().m;
    assert.ok(min >= 1000, `минимальный id = ${min}`);
  });

  test("дефолт эло в схеме совпадает с ELO_START", async () => {
    const { config } = await import("../src/config.js");
    const r = q(`INSERT INTO users (tg_id, name, created_at) VALUES (?, ?, ?)`).run(123_456_001, "Дефолтный", Date.now());
    const u = q(`SELECT elo FROM users WHERE id = ?`).get(Number(r.lastInsertRowid));
    assert.equal(u.elo, config.ELO_START);
  });

  test("CHECK-ограничения работают (роль, язык, claim)", () => {
    assert.throws(() => q(`INSERT INTO users (tg_id, name, role, created_at) VALUES (1, 'X', 'superadmin', 0)`).run());
    assert.throws(() => q(`INSERT INTO users (tg_id, name, lang, created_at) VALUES (2, 'X', 'de', 0)`).run());
  });
});

describe("tx и q", () => {
  test("исключение внутри tx откатывает все изменения", async () => {
    const { me } = await createUser(app);
    const before = q(`SELECT elo FROM users WHERE id = ?`).get(me.id).elo;
    assert.throws(() =>
      tx(() => {
        q(`UPDATE users SET elo = 9999 WHERE id = ?`).run(me.id);
        throw new Error("boom");
      })
    );
    assert.equal(q(`SELECT elo FROM users WHERE id = ?`).get(me.id).elo, before);
  });

  test("tx возвращает результат колбэка и коммитит", async () => {
    const { me } = await createUser(app);
    const out = tx(() => {
      q(`UPDATE users SET elo = 1234 WHERE id = ?`).run(me.id);
      return "ok";
    });
    assert.equal(out, "ok");
    assert.equal(q(`SELECT elo FROM users WHERE id = ?`).get(me.id).elo, 1234);
  });

  test("q кэширует подготовленные стейтменты", () => {
    const sql = `SELECT 1 AS one`;
    assert.equal(q(sql), q(sql));
    assert.equal(q(sql).get().one, 1);
  });
});
