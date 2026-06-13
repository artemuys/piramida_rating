-- Миграция юзеров из старой системы
-- Запуск: sqlite3 /app/data/club.db < migrate_users.sql

-- Сброс автоинкремента чтобы ID начинались с 1000
INSERT OR IGNORE INTO sqlite_sequence (name, seq) VALUES ('users', 999);
UPDATE sqlite_sequence SET seq = 999 WHERE name = 'users' AND seq < 999;

INSERT INTO users (tg_id, role, name, contact, elo, matches_count, activated_until, created_at)
VALUES
  -- is_marker=TRUE → role='admin'
  (607848091,  'admin', 'Dmitriy',             '@dm232z',      1022, 7,  strftime('%s','now') + 31536000, strftime('%s','now')),
  (678539493,  'admin', 'Владислав',            '@artemuyst',   1000, 12, strftime('%s','now') + 31536000, strftime('%s','now')),
  (1060680314, 'admin', 'Лёша',                '@es3maile',    1074, 11, strftime('%s','now') + 31536000, strftime('%s','now')),

  -- обычные активные юзеры
  (6824436585, 'user',  'ㅤ',                  '',             1000, 0,  strftime('%s','now') + 31536000, strftime('%s','now')),
  (398896183,  'user',  'Yevhenii',             '@Eugene05',    1092, 11, strftime('%s','now') + 31536000, strftime('%s','now')),
  (397086127,  'user',  'Игорь',               '@kigor_o',     1000, 12, strftime('%s','now') + 31536000, strftime('%s','now')),
  (6750211675, 'user',  'илья',                '',             1041, 9,  strftime('%s','now') + 31536000, strftime('%s','now')),
  (402041729,  'user',  'Leonid',              '@peleoni',     1000, 0,  strftime('%s','now') + 31536000, strftime('%s','now')),
  (456911841,  'user',  'Вадим',               '@Rem3mberMe',  1000, 0,  strftime('%s','now') + 31536000, strftime('%s','now')),
  (7590821576, 'user',  '.',                   '@artemuystq',  1000, 0,  strftime('%s','now') + 31536000, strftime('%s','now')),
  (6341880553, 'user',  'Владислав',           '',             1000, 0,  strftime('%s','now') + 31536000, strftime('%s','now')),

  -- последний юзер — is_active пустое, активация не выставлена
  (548037052,  'user',  'Vladimir Zavgorodniy', '@Texproff',   1039, 2,  0, strftime('%s','now'));

-- Проверка
SELECT id, tg_id, name, contact, elo, role,
       CASE WHEN activated_until > strftime('%s','now') THEN 'active' ELSE 'inactive' END AS status
FROM users
ORDER BY id;
