import { q, tx, db } from "../db.js";
import { config } from "../config.js";
import { ApiError, requireAdmin, requireSuperAdmin } from "../errors.js";
import { now, clean } from "../util.js";

function audit(adminId, targetId, action) {
  q(`INSERT INTO audit_log (admin_id, target_id, action, created_at) VALUES (?, ?, ?, ?)`)
    .run(adminId, targetId, action, now());
}

function adminUserRow(u, t = now()) {
  return {
    id: u.id,
    name: u.name,
    contact: u.contact,
    elo: u.elo,
    role: u.role,
    isSuper: !!u.is_super,
    banned: !!u.banned,
    matchesCount: u.matches_count,
    winsCount: u.wins_count,
    isActivated: u.activated_until > t,
    activatedUntil: u.activated_until,
    isCheckedIn: u.checked_in_until > t,
    checkedInUntil: u.checked_in_until,
    createdAt: u.created_at,
  };
}

function getTarget(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "validation");
  const u = q(`SELECT * FROM users WHERE id = ?`).get(id);
  if (!u) throw new ApiError(404, "player_not_found");
  return u;
}

export default async function adminRoutes(app) {
  app.addHook("preHandler", async (req) => { requireAdmin(req); });

  // Список / поиск по ID или имени
  app.get("/admin/users", (req) => {
    const query = clean(req.query?.q ?? "", 40);
    let rows;
    if (/^\d+$/.test(query)) {
      rows = q(`SELECT * FROM users WHERE id = ? LIMIT 1`).all(Number(query));
    } else if (query) {
      rows = q(`SELECT * FROM users WHERE name LIKE ? ORDER BY name LIMIT 50`).all(`%${query}%`);
    } else {
      rows = q(`SELECT * FROM users ORDER BY checked_in_until DESC, name ASC LIMIT 200`).all();
    }
    const t = now();
    return { users: rows.map((u) => adminUserRow(u, t)) };
  });

  app.get("/admin/users/:id", (req) => {
    const u = getTarget(req);
    const recent = q(
      `SELECT m.*, i.name AS i_name, o.name AS o_name FROM matches m
       JOIN users i ON i.id = m.initiator_id JOIN users o ON o.id = m.opponent_id
       WHERE m.initiator_id = ? OR m.opponent_id = ?
       ORDER BY m.created_at DESC LIMIT 10`
    ).all(u.id, u.id);
    return {
      user: adminUserRow(u),
      recentMatches: recent.map((m) => {
        const isInit = m.initiator_id === u.id;
        const won = m.winner_id === u.id;
        return {
          id: m.id,
          status: m.status,
          date: m.resolved_at || m.created_at,
          opponentName: isInit ? m.o_name : m.i_name,
          won: m.status === "confirmed" ? won : null,
          delta: m.status === "confirmed" ? (won ? m.delta : -m.delta) : null,
        };
      }),
    };
  });

  // Чекин: 6 часов на результаты + автопродление активации на 45 дней
  app.post("/admin/users/:id/checkin", (req) => {
    const target = getTarget(req);
    const t = now();
    q(`UPDATE users SET checked_in_until = ?, activated_until = ? WHERE id = ?`)
      .run(t + config.CHECKIN_MS, t + config.ACTIVATION_MS, target.id);
    audit(req.user.id, target.id, "checkin");
    return { ok: true, checkedInUntil: t + config.CHECKIN_MS, activatedUntil: t + config.ACTIVATION_MS };
  });

  app.post("/admin/users/:id/activate", (req) => {
    const target = getTarget(req);
    const t = now();
    q(`UPDATE users SET activated_until = ? WHERE id = ?`).run(t + config.ACTIVATION_MS, target.id);
    audit(req.user.id, target.id, "activate");
    return { ok: true, activatedUntil: t + config.ACTIVATION_MS };
  });

  // Деактивация
  app.post("/admin/users/:id/deactivate", (req) => {
    const target = getTarget(req);
    if (target.id === req.user.id) throw new ApiError(400, "self_action");
    tx(() => {
      const t = now();
      q(`UPDATE users SET activated_until = 0, checked_in_until = 0, search_until = 0 WHERE id = ?`)
        .run(target.id);
      q(`DELETE FROM requests WHERE user_id = ?`).run(target.id);
      q(
        `UPDATE matches SET status = 'cancelled', resolved_at = ?, initiator_ack = 0, opponent_ack = 0
         WHERE status = 'pending' AND (initiator_id = ? OR opponent_id = ?)`
      ).run(t, target.id, target.id);
      audit(req.user.id, target.id, "deactivate");
    });
    return { ok: true };
  });

  // ── Суперадмин: бан / разбан ──────────────────────────────
  app.post("/admin/users/:id/ban", (req) => {
    requireSuperAdmin(req);
    const target = getTarget(req);
    if (target.id === req.user.id) throw new ApiError(400, "self_action");
    q(`UPDATE users SET banned = 1, activated_until = 0, checked_in_until = 0, search_until = 0 WHERE id = ?`)
      .run(target.id);
    audit(req.user.id, target.id, "ban");
    return { ok: true };
  });

  app.post("/admin/users/:id/unban", (req) => {
    requireSuperAdmin(req);
    const target = getTarget(req);
    q(`UPDATE users SET banned = 0 WHERE id = ?`).run(target.id);
    audit(req.user.id, target.id, "unban");
    return { ok: true };
  });

  // ── Суперадмин: управление ролями ────────────────────────
  app.post("/admin/users/:id/promote", (req) => {
    requireSuperAdmin(req);
    const target = getTarget(req);
    q(`UPDATE users SET role = 'admin' WHERE id = ?`).run(target.id);
    audit(req.user.id, target.id, "promote_admin");
    return { ok: true };
  });

  app.post("/admin/users/:id/demote", (req) => {
    requireSuperAdmin(req);
    const target = getTarget(req);
    if (target.id === req.user.id) throw new ApiError(400, "self_action");
    q(`UPDATE users SET role = 'user', is_super = 0 WHERE id = ?`).run(target.id);
    audit(req.user.id, target.id, "demote_admin");
    return { ok: true };
  });

  // ── Клубные объявления (суперадмин) ──────────────────────
  const announceSchema = {
    body: {
      type: "object",
      required: ["text"],
      additionalProperties: false,
      properties: { text: { type: "string", minLength: 1, maxLength: 1000 } },
    },
  };

  app.get("/admin/announce-all", (req) => {
    requireSuperAdmin(req);
    const rows = q(
      `SELECT an.*, u.name AS author_name
       FROM announcements an JOIN users u ON u.id = an.author_id
       ORDER BY an.created_at DESC LIMIT 50`
    ).all();
    return {
      announcements: rows.map(r => ({
        id: r.id,
        text: r.text,
        authorName: r.author_name,
        createdAt: r.created_at,
        active: !!r.active,
      })),
    };
  });

  app.post("/admin/announce", { schema: announceSchema }, (req) => {
    requireSuperAdmin(req);
    const text = clean(req.body.text, 1000);
    if (text.length < 1) throw new ApiError(400, "validation");
    q(`INSERT INTO announcements (author_id, text, created_at) VALUES (?, ?, ?)`)
      .run(req.user.id, text, now());
    return { ok: true };
  });

  app.delete("/admin/announce/:id", (req) => {
    requireSuperAdmin(req);
    const id = Number(req.params.id) || 0;
    q(`DELETE FROM announcements WHERE id = ?`).run(id);
    return { ok: true };
  });

  app.post("/admin/announce/:id/toggle", (req) => {
    requireSuperAdmin(req);
    const id = Number(req.params.id) || 0;
    const row = q(`SELECT active FROM announcements WHERE id = ?`).get(id);
    if (!row) throw new ApiError(404, "not_found");
    q(`UPDATE announcements SET active = ? WHERE id = ?`).run(row.active ? 0 : 1, id);
    return { ok: true, active: !row.active };
  });

  // ── Суперадмин: управление сезонами ──────────────────────
  app.get("/admin/seasons", (req) => {
    requireSuperAdmin(req);
    const rows = q(`SELECT * FROM seasons ORDER BY id DESC LIMIT 20`).all();
    return { seasons: rows.map(s => ({ id: s.id, startedAt: s.started_at, endsAt: s.ends_at, closed: !!s.closed })) };
  });

  const seasonSchema = {
    body: {
      type: "object",
      required: ["durationDays"],
      additionalProperties: false,
      properties: { durationDays: { type: "integer", minimum: 1, maximum: 730 } },
    },
  };

  app.post("/admin/seasons", { schema: seasonSchema }, (req) => {
    requireSuperAdmin(req);
    const open = q(`SELECT id FROM seasons WHERE closed = 0 OR closed IS NULL ORDER BY id DESC LIMIT 1`).get();
    if (open) throw new ApiError(400, "season_already_open");
    const t = now();
    const endsAt = t + req.body.durationDays * 24 * 3600 * 1000;
    const r = q(`INSERT INTO seasons (started_at, ends_at, closed) VALUES (?, ?, 0)`).run(t, endsAt);
    audit(req.user.id, null, `season_open:${r.lastInsertRowid}`);
    return { ok: true, id: Number(r.lastInsertRowid), endsAt };
  });

  app.post("/admin/seasons/:id/close", (req) => {
    requireSuperAdmin(req);
    const seasonId = Number(req.params.id) || 0;
    const season = q(`SELECT * FROM seasons WHERE id = ?`).get(seasonId);
    if (!season) throw new ApiError(404, "not_found");
    if (season.closed) throw new ApiError(400, "already_closed");

    tx(() => {
      // Закрыть сезон
      q(`UPDATE seasons SET closed = 1, ends_at = ? WHERE id = ?`).run(now(), seasonId);

      // Топ-3 получают достижение season_master_N — отдельно для каждой дисциплины
      const grantSeasonMaster = (users, discipline) => {
        const prefix = discipline === 'pyramid' ? 'p:' : '';
        const code = `${prefix}season_master_${seasonId}`;
        for (const u of users) {
          const result = q(`INSERT OR IGNORE INTO achievements (user_id, code, earned_at, seen) VALUES (?, ?, ?, 0)`)
            .run(u.id, code, now());
          if (result.changes > 0) {
            q(`INSERT INTO feed (type, actor_id, target_id, data, discipline, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
              "achievement", u.id, null, JSON.stringify({ code, name: u.name }), discipline, now()
            );
          }
        }
      };
      const top3Pool    = q(`SELECT id, name FROM users WHERE banned = 0 ORDER BY elo DESC LIMIT 3`).all();
      const top3Pyramid = q(`SELECT id, name FROM users WHERE banned = 0 ORDER BY elo_pyramid DESC LIMIT 3`).all();
      grantSeasonMaster(top3Pool,    'pool');
      grantSeasonMaster(top3Pyramid, 'pyramid');

      // Сброс ELO с частичным сохранением (30% от превышения над 1000) — обе дисциплины
      const ELO_START = 1000;
      const CARRY = 0.3;
      const users = q(`SELECT id, elo, elo_pyramid FROM users`).all();
      for (const u of users) {
        const newElo = Math.round(ELO_START + Math.max(0, u.elo - ELO_START) * CARRY);
        const newEloPyr = Math.round(ELO_START + Math.max(0, (u.elo_pyramid ?? 1000) - ELO_START) * CARRY);
        q(`UPDATE users SET
            elo = ?, peak_elo = ?, matches_count = 0, wins_count = 0, streak = 0, xp = 0,
            elo_pyramid = ?, peak_elo_pyramid = ?, matches_count_pyramid = 0, wins_count_pyramid = 0,
            streak_pyramid = 0, xp_pyramid = 0
           WHERE id = ?`)
          .run(newElo, newElo, newEloPyr, newEloPyr, u.id);
      }

      audit(req.user.id, null, `season_close:${seasonId}`);
    });

    return { ok: true };
  });

  // Изменить дату окончания сезона
  const updateSeasonSchema = {
    body: {
      type: "object",
      required: ["endsAt"],
      additionalProperties: false,
      properties: { endsAt: { type: "integer" } },
    },
  };

  app.patch("/admin/seasons/:id", { schema: updateSeasonSchema }, (req) => {
    requireSuperAdmin(req);
    const seasonId = Number(req.params.id) || 0;
    const season = q(`SELECT * FROM seasons WHERE id = ?`).get(seasonId);
    if (!season) throw new ApiError(404, "not_found");
    if (season.closed) throw new ApiError(400, "already_closed");
    if (req.body.endsAt <= now()) throw new ApiError(400, "ends_at_must_be_future");
    q(`UPDATE seasons SET ends_at = ? WHERE id = ?`).run(req.body.endsAt, seasonId);
    audit(req.user.id, null, `season_update:${seasonId}`);
    return { ok: true };
  });

  // ── Суперадмин: журнал аудита ─────────────────────────────
  app.get("/admin/audit", (req) => {
    requireSuperAdmin(req);
    const rows = q(
      `SELECT al.*, a.name AS admin_name, t.name AS target_name
       FROM audit_log al
       LEFT JOIN users a ON a.id = al.admin_id
       LEFT JOIN users t ON t.id = al.target_id
       ORDER BY al.created_at DESC LIMIT 100`
    ).all();
    return {
      entries: rows.map(r => ({
        id: r.id,
        adminName: r.admin_name,
        targetName: r.target_name,
        action: r.action,
        createdAt: r.created_at,
      })),
    };
  });

  // ── Суперадмин: статистика клуба ─────────────────────────
  app.get("/admin/stats", (req) => {
    requireSuperAdmin(req);
    const total = q(`SELECT COUNT(*) AS c FROM users`).get().c;
    const activated = q(`SELECT COUNT(*) AS c FROM users WHERE activated_until > ?`).get(now()).c;
    const banned = q(`SELECT COUNT(*) AS c FROM users WHERE banned = 1`).get().c;
    const searching = q(`SELECT COUNT(*) AS c FROM users WHERE search_until > ?`).get(now()).c;
    const matchesToday = q(`SELECT COUNT(*) AS c FROM matches WHERE status = 'confirmed' AND resolved_at >= ?`).get(new Date().setHours(0,0,0,0)).c;
    const matchesTotal = q(`SELECT COUNT(*) AS c FROM matches WHERE status = 'confirmed'`).get().c;
    const currentSeason = q(`SELECT * FROM seasons WHERE closed = 0 OR closed IS NULL ORDER BY id DESC LIMIT 1`).get();
    return { total, activated, banned, searching, matchesToday, matchesTotal, currentSeason: currentSeason ? { id: currentSeason.id, startedAt: currentSeason.started_at, endsAt: currentSeason.ends_at } : null };
  });

  // ── Суперадмин: ручное выдача достижения ─────────────────
  const grantAchSchema = {
    body: {
      type: "object",
      required: ["userId", "code"],
      additionalProperties: false,
      properties: {
        userId: { type: "integer" },
        code: { type: "string", minLength: 1, maxLength: 60 },
      },
    },
  };

  app.post("/admin/grant-achievement", { schema: grantAchSchema }, (req) => {
    requireSuperAdmin(req);
    const { userId, code } = req.body;
    const u = q(`SELECT * FROM users WHERE id = ?`).get(userId);
    if (!u) throw new ApiError(404, "player_not_found");
    const result = q(`INSERT OR IGNORE INTO achievements (user_id, code, earned_at, seen) VALUES (?, ?, ?, 0)`)
      .run(userId, code, now());
    if (result.changes === 0) throw new ApiError(400, "already_has");
    audit(req.user.id, userId, `grant_ach:${code}`);
    return { ok: true };
  });

  // ── Суперадмин: ручная правка ELO ───────────────────────
  const setEloSchema = {
    body: {
      type: "object",
      required: ["elo"],
      additionalProperties: false,
      properties: {
        elo: { type: "integer", minimum: 0, maximum: 9999 },
        discipline: { type: "string", enum: ["pool", "pyramid"] },
      },
    },
  };

  app.post("/admin/users/:id/set-elo", { schema: setEloSchema }, (req) => {
    requireSuperAdmin(req);
    const target = getTarget(req);
    const { elo, discipline = "pool" } = req.body;
    if (discipline === "pyramid") {
      q(`UPDATE users SET elo_pyramid = ?, peak_elo_pyramid = MAX(peak_elo_pyramid, ?) WHERE id = ?`).run(elo, elo, target.id);
    } else {
      q(`UPDATE users SET elo = ?, peak_elo = MAX(peak_elo, ?) WHERE id = ?`).run(elo, elo, target.id);
    }
    audit(req.user.id, target.id, `set_elo:${discipline}:${elo}`);
    return { ok: true };
  });

  // ── Суперадмин: выдать одноразовое изменение имени ───────
  app.post("/admin/users/:id/grant-name-change", (req) => {
    requireSuperAdmin(req);
    const target = getTarget(req);
    q(`UPDATE users SET name_change_allowed = 1 WHERE id = ?`).run(target.id);
    audit(req.user.id, target.id, "grant_name_change");
    return { ok: true };
  });

  // ── Суперадмин: принудительно сменить имя ────────────────
  const setNameSchema = {
    body: {
      type: "object",
      required: ["name"],
      additionalProperties: false,
      properties: { name: { type: "string", minLength: 2, maxLength: 40 } },
    },
  };

  app.post("/admin/users/:id/set-name", { schema: setNameSchema }, (req) => {
    requireSuperAdmin(req);
    const target = getTarget(req);
    const name = clean(req.body.name, 40);
    if (name.length < 2) throw new ApiError(400, "validation");
    q(`UPDATE users SET name = ?, name_change_allowed = 0 WHERE id = ?`).run(name, target.id);
    audit(req.user.id, target.id, `set_name:${name}`);
    return { ok: true };
  });

  // ── Суперадмин: сменить ID игрока ────────────────────────
  const changeIdSchema = {
    body: {
      type: "object",
      required: ["newId"],
      additionalProperties: false,
      properties: { newId: { type: "integer", minimum: 1 } },
    },
  };

  app.post("/admin/users/:id/change-id", { schema: changeIdSchema }, (req) => {
    requireSuperAdmin(req);
    const target = getTarget(req);
    const newId = Number(req.body.newId);
    if (newId === target.id) throw new ApiError(400, "same_id");
    const exists = q(`SELECT 1 FROM users WHERE id = ?`).get(newId);
    if (exists) throw new ApiError(400, "id_taken");

    db.exec("PRAGMA foreign_keys = OFF");
    try {
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare(`UPDATE users SET id = ? WHERE id = ?`).run(newId, target.id);
        for (const [tbl, col] of [
          ["matches", "initiator_id"], ["matches", "opponent_id"], ["matches", "winner_id"],
          ["favorites", "user_id"], ["favorites", "fav_id"],
          ["duels", "challenger_id"], ["duels", "opponent_id"],
          ["achievements", "user_id"],
          ["feed", "actor_id"], ["feed", "target_id"],
          ["requests", "user_id"],
          ["audit_log", "admin_id"], ["audit_log", "target_id"],
        ]) {
          db.prepare(`UPDATE ${tbl} SET ${col} = ? WHERE ${col} = ?`).run(newId, target.id);
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    } finally {
      db.exec("PRAGMA foreign_keys = ON");
    }
    audit(req.user.id, newId, `change_id:${target.id}->${newId}`);
    return { ok: true };
  });

  // ── Суперадмин: сброс статистики игрока ──────────────────
  app.post("/admin/users/:id/reset-stats", (req) => {
    requireSuperAdmin(req);
    const target = getTarget(req);
    const ELO_START = 1000;
    q(`UPDATE users SET
        elo = ?, peak_elo = ?, matches_count = 0, wins_count = 0, streak = 0, best_streak = 0, xp = 0,
        elo_pyramid = ?, peak_elo_pyramid = ?, matches_count_pyramid = 0, wins_count_pyramid = 0,
        streak_pyramid = 0, best_streak_pyramid = 0, xp_pyramid = 0
       WHERE id = ?`)
      .run(ELO_START, ELO_START, ELO_START, ELO_START, target.id);
    audit(req.user.id, target.id, "reset_stats");
    return { ok: true };
  });

  // ── Суперадмин: удалить игрока ────────────────────────────
  app.delete("/admin/users/:id", (req) => {
    requireSuperAdmin(req);
    const target = getTarget(req);
    if (target.id === req.user.id) throw new ApiError(400, "self_action");
    if (target.is_super) throw new ApiError(400, "cannot_delete_super");
    tx(() => {
      // Откатить ЭЛО противникам за подтверждённые матчи
      const confirmed = q(
        `SELECT * FROM matches WHERE status = 'confirmed' AND (initiator_id = ? OR opponent_id = ?)`
      ).all(target.id, target.id);
      for (const m of confirmed) {
        if (!m.winner_id || !m.delta) continue;
        const isPyramid = m.discipline === "pyramid";
        const oppId = m.initiator_id === target.id ? m.opponent_id : m.initiator_id;
        if (isPyramid) {
          if (m.winner_id === target.id) {
            // удаляемый выиграл пирамиду — у противника (loserId=oppId) забрали elo_pyramid, возвращаем
            q(`UPDATE users SET elo_pyramid = elo_pyramid + ?, matches_count_pyramid = MAX(0, matches_count_pyramid - 1) WHERE id = ?`)
              .run(m.delta, oppId);
          } else {
            // удаляемый проиграл пирамиду — у победителя (oppId) добавили elo_pyramid, забираем
            q(`UPDATE users SET elo_pyramid = MAX(0, elo_pyramid - ?), wins_count_pyramid = MAX(0, wins_count_pyramid - 1), matches_count_pyramid = MAX(0, matches_count_pyramid - 1) WHERE id = ?`)
              .run(m.delta, oppId);
          }
        } else {
          if (m.winner_id === target.id) {
            // удаляемый выиграл пул — у противника (oppId) забрали elo, возвращаем
            q(`UPDATE users SET elo = elo + ?, matches_count = MAX(0, matches_count - 1) WHERE id = ?`)
              .run(m.delta, oppId);
          } else {
            // удаляемый проиграл пул — у победителя (oppId) добавили elo, забираем
            q(`UPDATE users SET elo = MAX(0, elo - ?), wins_count = MAX(0, wins_count - 1), matches_count = MAX(0, matches_count - 1) WHERE id = ?`)
              .run(m.delta, oppId);
          }
        }
      }
      // Удалить все матчи (FK без CASCADE)
      q(`DELETE FROM matches WHERE initiator_id = ? OR opponent_id = ?`).run(target.id, target.id);
      q(`DELETE FROM requests WHERE user_id = ?`).run(target.id);
      q(`DELETE FROM favorites WHERE user_id = ? OR fav_id = ?`).run(target.id, target.id);
      q(`DELETE FROM duels WHERE challenger_id = ? OR opponent_id = ?`).run(target.id, target.id);
      q(`DELETE FROM achievements WHERE user_id = ?`).run(target.id);
      q(`DELETE FROM feed WHERE actor_id = ? OR target_id = ?`).run(target.id, target.id);
      q(`DELETE FROM users WHERE id = ?`).run(target.id);
      audit(req.user.id, null, `delete_user:${target.id}:${target.name}`);
    });
    return { ok: true };
  });

  // ── Суперадмин: конфликтные матчи ────────────────────────
  app.get("/admin/conflicts", (req) => {
    requireSuperAdmin(req);
    const rows = q(
      `SELECT m.*, i.name AS i_name, o.name AS o_name
       FROM matches m
       JOIN users i ON i.id = m.initiator_id
       JOIN users o ON o.id = m.opponent_id
       WHERE m.status = 'conflict'
       ORDER BY m.created_at DESC LIMIT 50`
    ).all();
    return {
      conflicts: rows.map(m => ({
        id: m.id,
        initiatorId: m.initiator_id, initiatorName: m.i_name, initiatorClaim: m.initiator_claim,
        opponentId: m.opponent_id, opponentName: m.o_name, opponentClaim: m.opponent_claim,
        createdAt: m.created_at,
      })),
    };
  });

  // ── Суперадмин: список матчей ─────────────────────────────
  app.get("/admin/matches", (req) => {
    requireSuperAdmin(req);
    const query = clean(req.query?.q ?? "", 40);
    let rows;
    if (/^\d+$/.test(query)) {
      rows = q(
        `SELECT m.*, i.name AS i_name, o.name AS o_name
         FROM matches m
         JOIN users i ON i.id = m.initiator_id
         JOIN users o ON o.id = m.opponent_id
         WHERE m.id = ? OR m.initiator_id = ? OR m.opponent_id = ?
         ORDER BY m.created_at DESC LIMIT 50`
      ).all(Number(query), Number(query), Number(query));
    } else {
      rows = q(
        `SELECT m.*, i.name AS i_name, o.name AS o_name
         FROM matches m
         JOIN users i ON i.id = m.initiator_id
         JOIN users o ON o.id = m.opponent_id
         ORDER BY m.created_at DESC LIMIT 80`
      ).all();
    }
    return {
      matches: rows.map(m => ({
        id: m.id, status: m.status,
        initiatorId: m.initiator_id, initiatorName: m.i_name,
        opponentId: m.opponent_id, opponentName: m.o_name,
        winnerId: m.winner_id, delta: m.delta,
        createdAt: m.created_at, resolvedAt: m.resolved_at,
      })),
    };
  });

  // ── Суперадмин: отмена/аннулирование матча ───────────────
  app.post("/admin/matches/:id/cancel", (req) => {
    requireSuperAdmin(req);
    const matchId = Number(req.params.id) || 0;
    const match = q(`SELECT * FROM matches WHERE id = ?`).get(matchId);
    if (!match) throw new ApiError(404, "not_found");
    if (match.status === "cancelled") throw new ApiError(400, "already_cancelled");

    tx(() => {
      if (match.status === "confirmed" && match.winner_id && match.delta) {
        const loserId = match.winner_id === match.initiator_id ? match.opponent_id : match.initiator_id;
        const isPyramid = match.discipline === "pyramid";
        if (isPyramid) {
          q(`UPDATE users SET elo_pyramid = MAX(0, elo_pyramid - ?), wins_count_pyramid = MAX(0, wins_count_pyramid - 1), matches_count_pyramid = MAX(0, matches_count_pyramid - 1) WHERE id = ?`)
            .run(match.delta, match.winner_id);
          q(`UPDATE users SET elo_pyramid = elo_pyramid + ?, matches_count_pyramid = MAX(0, matches_count_pyramid - 1) WHERE id = ?`)
            .run(match.delta, loserId);
        } else {
          q(`UPDATE users SET elo = MAX(0, elo - ?), wins_count = MAX(0, wins_count - 1), matches_count = MAX(0, matches_count - 1) WHERE id = ?`)
            .run(match.delta, match.winner_id);
          q(`UPDATE users SET elo = elo + ?, matches_count = MAX(0, matches_count - 1) WHERE id = ?`)
            .run(match.delta, loserId);
        }
      }
      q(`UPDATE matches SET status = 'cancelled', resolved_at = ? WHERE id = ?`).run(now(), matchId);
      audit(req.user.id, null, `cancel_match:${matchId}:was_${match.status}`);
    });
    return { ok: true };
  });

}
