import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config } from "./config.js";

const dbFile = resolve(config.dbPath);
mkdirSync(dirname(dbFile), { recursive: true });

export const db = new DatabaseSync(dbFile);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id            INTEGER NOT NULL UNIQUE,
  role             TEXT    NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  name             TEXT    NOT NULL,
  contact          TEXT    NOT NULL DEFAULT '',
  lang             TEXT    NOT NULL DEFAULT 'ru' CHECK (lang IN ('en','pl','uk','ru')),
  pref_disc        INTEGER NOT NULL DEFAULT 2 CHECK (pref_disc BETWEEN 0 AND 2),
  pref_pays        INTEGER NOT NULL DEFAULT 0 CHECK (pref_pays BETWEEN 0 AND 1),
  elo              INTEGER NOT NULL DEFAULT 1000,
  matches_count    INTEGER NOT NULL DEFAULT 0,
  wins_count       INTEGER NOT NULL DEFAULT 0,
  activated_until  INTEGER NOT NULL DEFAULT 0,
  checked_in_until INTEGER NOT NULL DEFAULT 0,
  search_until     INTEGER NOT NULL DEFAULT 0,
  search_started   INTEGER NOT NULL DEFAULT 0,
  search_disc      INTEGER NOT NULL DEFAULT 2,
  search_pays      INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_elo ON users(elo DESC);
CREATE INDEX IF NOT EXISTS idx_users_search ON users(search_until);

CREATE TABLE IF NOT EXISTS requests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day        TEXT    NOT NULL,
  time_slot  INTEGER NOT NULL CHECK (time_slot IN (0,1)),
  disc       INTEGER NOT NULL CHECK (disc IN (0,1)),
  pays       INTEGER NOT NULL CHECK (pays IN (0,1)),
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, day, time_slot)
);
CREATE INDEX IF NOT EXISTS idx_requests_day ON requests(day);

CREATE TABLE IF NOT EXISTS matches (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  initiator_id         INTEGER NOT NULL REFERENCES users(id),
  opponent_id          INTEGER NOT NULL REFERENCES users(id),
  initiator_claim      TEXT    NOT NULL CHECK (initiator_claim IN ('win','lose')),
  opponent_claim       TEXT             CHECK (opponent_claim IN ('win','lose')),
  status               TEXT    NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','confirmed','conflict','timeout','cancelled')),
  winner_id            INTEGER,
  delta                INTEGER,
  initiator_elo_before INTEGER NOT NULL,
  initiator_elo_after  INTEGER,
  opponent_elo_before  INTEGER NOT NULL,
  opponent_elo_after   INTEGER,
  initiator_ack        INTEGER NOT NULL DEFAULT 0,
  opponent_ack         INTEGER NOT NULL DEFAULT 0,
  expires_at           INTEGER NOT NULL,
  created_at           INTEGER NOT NULL,
  resolved_at          INTEGER
);
CREATE INDEX IF NOT EXISTS idx_matches_pending ON matches(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_matches_init ON matches(initiator_id, status, resolved_at);
CREATE INDEX IF NOT EXISTS idx_matches_opp  ON matches(opponent_id, status, resolved_at);

CREATE TABLE IF NOT EXISTS favorites (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fav_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, fav_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id   INTEGER NOT NULL,
  target_id  INTEGER,
  action     TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS duels (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  challenger_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opponent_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message       TEXT    NOT NULL DEFAULT '',
  status        TEXT    NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','cancelled','declined','accepted')),
  created_at    INTEGER NOT NULL,
  resolved_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_duels_opp  ON duels(opponent_id, status);
CREATE INDEX IF NOT EXISTS idx_duels_chal ON duels(challenger_id, status);

CREATE TABLE IF NOT EXISTS achievements (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code      TEXT    NOT NULL,
  earned_at INTEGER NOT NULL,
  seen      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, code)
);

CREATE TABLE IF NOT EXISTS feed (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT    NOT NULL,
  actor_id   INTEGER,
  target_id  INTEGER,
  data       TEXT    NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feed_created ON feed(created_at DESC);

CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id  INTEGER NOT NULL,
  text       TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS seasons (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  ends_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
`);

// ── Миграции существующей таблицы users (ALTER TABLE идемпотентен через try) ──
for (const col of [
  `ALTER TABLE users ADD COLUMN xp INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN streak INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN best_streak INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN peak_elo INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN is_super INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN contact_type TEXT NOT NULL DEFAULT 'telegram'`,
  `ALTER TABLE users ADD COLUMN name_change_allowed INTEGER NOT NULL DEFAULT 0`,
  // Дисциплина и статистика пирамиды (пул = существующие колонки)
  `ALTER TABLE users ADD COLUMN active_discipline TEXT NOT NULL DEFAULT 'pool'`,
  `ALTER TABLE users ADD COLUMN elo_pyramid INTEGER NOT NULL DEFAULT 1000`,
  `ALTER TABLE users ADD COLUMN matches_count_pyramid INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN wins_count_pyramid INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN xp_pyramid INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN streak_pyramid INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN best_streak_pyramid INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN peak_elo_pyramid INTEGER NOT NULL DEFAULT 0`,
]) {
  try { db.exec(col); } catch { /* колонка уже есть */ }
}

// ── Миграции matches: дисциплина матча ─────────────────────────────────────
for (const col of [
  `ALTER TABLE matches ADD COLUMN discipline TEXT NOT NULL DEFAULT 'pool'`,
]) {
  try { db.exec(col); } catch { /* колонка уже есть */ }
}

// ── Миграции feed: дисциплина события ──────────────────────────────────────
for (const col of [
  `ALTER TABLE feed ADD COLUMN discipline TEXT NOT NULL DEFAULT 'pool'`,
]) {
  try { db.exec(col); } catch { /* колонка уже есть */ }
}

// ── Миграции announcements ──────────────────────────────────────────────────
for (const col of [
  `ALTER TABLE announcements ADD COLUMN active INTEGER NOT NULL DEFAULT 1`,
]) {
  try { db.exec(col); } catch { /* колонка уже есть */ }
}

// ── Миграции seasons ────────────────────────────────────────────────────────
for (const col of [
  `ALTER TABLE seasons ADD COLUMN closed INTEGER NOT NULL DEFAULT 0`,
]) {
  try { db.exec(col); } catch { /* колонка уже есть */ }
}

// Публичные ID игроков начинаются с 1000 (4 цифры — удобно диктовать у стола)
try {
  const seq = db.prepare(`SELECT seq FROM sqlite_sequence WHERE name = 'users'`).get();
  if (!seq) db.exec(`INSERT INTO sqlite_sequence (name, seq) VALUES ('users', 999)`);
} catch {
  /* sqlite_sequence ещё не создана — появится после первой вставки, ID начнутся с 1; не критично */
}


// ── Одноразовый бэкфилл новых полей из истории матчей (маркер в meta) ──
{
  const done = db.prepare(`SELECT v FROM meta WHERE k = 'backfill_v1'`).get();
  if (!done) {
    const t = Math.floor(Date.now());
    db.exec("BEGIN IMMEDIATE");
    try {
      // XP: победа = 20, поражение = 10 (та же формула, что в начислении)
      db.exec(`UPDATE users SET xp = wins_count * 20 + (matches_count - wins_count) * 10 WHERE xp = 0`);
      // Пик Эло: максимум из текущего, стартового и исторических значений после матчей
      const users = db.prepare(`SELECT id, elo FROM users`).all();
      const hist = db.prepare(
        `SELECT MAX(CASE WHEN initiator_id = ? THEN initiator_elo_after ELSE opponent_elo_after END) AS m
         FROM matches WHERE status = 'confirmed' AND (initiator_id = ? OR opponent_id = ?)`
      );
      const last = db.prepare(
        `SELECT winner_id FROM matches WHERE status = 'confirmed' AND (initiator_id = ? OR opponent_id = ?)
         ORDER BY resolved_at DESC`
      );
      const upd = db.prepare(`UPDATE users SET peak_elo = ?, streak = ?, best_streak = ? WHERE id = ?`);
      for (const u of users) {
        const peak = Math.max(u.elo, 1000, hist.get(u.id, u.id, u.id)?.m ?? 0);
        const rows = last.all(u.id, u.id);
        let streak = 0;
        for (const r of rows) {
          const won = r.winner_id === u.id;
          if (streak === 0) streak = won ? 1 : -1;
          else if (won && streak > 0) streak++;
          else if (!won && streak < 0) streak--;
          else break;
        }
        let best = 0, run = 0;
        for (let i = rows.length - 1; i >= 0; i--) {
          run = rows[i].winner_id === u.id ? run + 1 : 0;
          if (run > best) best = run;
        }
        upd.run(peak, streak, best, u.id);
      }
      db.prepare(`INSERT INTO meta (k, v) VALUES ('backfill_v1', ?)`).run(String(t));
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}

// ── Сезон: гарантируем существование активного сезона (3 месяца) ──
{
  const SEASON_MS = 90 * 24 * 3600 * 1000;
  const cur = db.prepare(`SELECT * FROM seasons ORDER BY id DESC LIMIT 1`).get();
  if (!cur) {
    const t = Date.now();
    db.prepare(`INSERT INTO seasons (started_at, ends_at) VALUES (?, ?)`).run(t, t + SEASON_MS);
  }
}

// Синхронная транзакция: node:sqlite + единственный поток Node = отсутствие гонок.
export function tx(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

const stmtCache = new Map();
export function q(sql) {
  let s = stmtCache.get(sql);
  if (!s) {
    s = db.prepare(sql);
    stmtCache.set(sql, s);
  }
  return s;
}
