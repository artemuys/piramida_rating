// Регрессия на падение прода: db.js импортируется на СУЩЕСТВУЮЩЕЙ старой БД
// (requests с day/time_slot). Раньше индекс по end_day создавался до миграции
// и валил импорт → сервер не стартовал (healthcheck не проходил).
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Готовим старую БД ДО импорта src/config.js и src/db.js (они читают env при загрузке).
const dbPath = path.join(mkdtempSync(path.join(tmpdir(), "club-mig-")), "old.db");
process.env.DEV_AUTH = "1";
process.env.BOT_TOKEN = process.env.BOT_TOKEN || "test-bot-token";
process.env.DB_PATH = dbPath;
delete process.env.NODE_ENV;

{
  const seed = new DatabaseSync(dbPath);
  seed.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tg_id INTEGER NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'user',
      name TEXT NOT NULL,
      contact TEXT NOT NULL DEFAULT '',
      lang TEXT NOT NULL DEFAULT 'ru',
      pref_disc INTEGER NOT NULL DEFAULT 2,
      pref_pays INTEGER NOT NULL DEFAULT 0,
      elo INTEGER NOT NULL DEFAULT 1000,
      matches_count INTEGER NOT NULL DEFAULT 0,
      wins_count INTEGER NOT NULL DEFAULT 0,
      activated_until INTEGER NOT NULL DEFAULT 0,
      checked_in_until INTEGER NOT NULL DEFAULT 0,
      search_until INTEGER NOT NULL DEFAULT 0,
      search_started INTEGER NOT NULL DEFAULT 0,
      search_disc INTEGER NOT NULL DEFAULT 2,
      search_pays INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      time_slot INTEGER NOT NULL CHECK (time_slot IN (0,1)),
      disc INTEGER NOT NULL,
      pays INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (user_id, day, time_slot)
    );
  `);
  seed.prepare(`INSERT INTO users (id, tg_id, name, created_at) VALUES (1000, 1, 'A', 0)`).run();
  seed.prepare(`INSERT INTO requests (user_id, day, time_slot, disc, pays, created_at) VALUES (1000, '2030-01-01', 0, 1, 0, 0)`).run();
  seed.prepare(`INSERT INTO requests (user_id, day, time_slot, disc, pays, created_at) VALUES (1000, '2030-01-02', 1, 0, 1, 0)`).run();
  seed.close();
}

let db, q;
before(async () => {
  // Импорт не должен бросать на старой БД (именно это валило прод).
  ({ db, q } = await import("../src/db.js"));
});

describe("миграция requests: старая схема → диапазоны", () => {
  test("импорт db.js на старой БД проходит и таблица в новой схеме", () => {
    const cols = db.prepare(`PRAGMA table_info(requests)`).all().map((c) => c.name);
    for (const c of ["start_day", "end_day", "time_from", "time_to"]) assert.ok(cols.includes(c), `нет колонки ${c}`);
    assert.ok(!cols.includes("time_slot"), "старая колонка time_slot осталась");
  });

  test("данные перенесены: day→диапазон, слот→время", () => {
    const rows = q(`SELECT * FROM requests ORDER BY start_day`).all();
    assert.equal(rows.length, 2);
    // слот 0 → 00:00–17:00
    assert.deepEqual(
      { s: rows[0].start_day, e: rows[0].end_day, f: rows[0].time_from, t: rows[0].time_to },
      { s: "2030-01-01", e: "2030-01-01", f: "00:00", t: "17:00" }
    );
    // слот 1 → 17:00–23:59
    assert.deepEqual(
      { f: rows[1].time_from, t: rows[1].time_to },
      { f: "17:00", t: "23:59" }
    );
  });

  test("индекс idx_requests_end создан", () => {
    const idx = db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_requests_end'`).get();
    assert.ok(idx, "индекс по end_day отсутствует");
  });
});
