import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";

const dbPath = process.env.DB_PATH || "./data/club.db";
mkdirSync("data", { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");

// Сброс автоинкремента чтобы ID начинались с 1000
try {
  const seq = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'users'").get();
  if (!seq) db.exec("INSERT INTO sqlite_sequence (name, seq) VALUES ('users', 999)");
  else if (seq.seq < 999) db.exec("UPDATE sqlite_sequence SET seq = 999 WHERE name = 'users'");
} catch {}

const t = Math.floor(Date.now() / 1000);
const activeUntil = t + 365 * 24 * 3600;

const users = [
  [607848091,  "admin", "Dmitriy",              "@dm232z",      1022, 7,  activeUntil],
  [678539493,  "admin", "Владислав",             "@artemuyst",   1000, 12, activeUntil],
  [1060680314, "admin", "Лёша",                 "@es3maile",    1074, 11, activeUntil],
  [6824436585, "user",  "ㅤ",                   "",             1000, 0,  activeUntil],
  [398896183,  "user",  "Yevhenii",              "@Eugene05",    1092, 11, activeUntil],
  [397086127,  "user",  "Игорь",                "@kigor_o",     1000, 12, activeUntil],
  [6750211675, "user",  "илья",                 "",             1041, 9,  activeUntil],
  [402041729,  "user",  "Leonid",               "@peleoni",     1000, 0,  activeUntil],
  [456911841,  "user",  "Вадим",                "@Rem3mberMe",  1000, 0,  activeUntil],
  [7590821576, "user",  ".",                    "@artemuystq",  1000, 0,  activeUntil],
  [6341880553, "user",  "Владислав",            "",             1000, 0,  activeUntil],
  [548037052,  "user",  "Vladimir Zavgorodniy", "@Texproff",    1039, 2,  0],
];

const stmt = db.prepare(
  `INSERT OR IGNORE INTO users (tg_id, role, name, contact, elo, matches_count, activated_until, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

let inserted = 0;
for (const [tg_id, role, name, contact, elo, matches_count, activated_until] of users) {
  const result = stmt.run(tg_id, role, name, contact, elo, matches_count, activated_until, t);
  if (result.changes > 0) inserted++;
}

console.log(`✓ Вставлено: ${inserted} из ${users.length} юзеров`);

const rows = db.prepare("SELECT id, tg_id, name, elo, role, CASE WHEN activated_until > ? THEN 'active' ELSE 'inactive' END as status FROM users ORDER BY id").all(t);
console.table(rows);
