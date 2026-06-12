import { q, tx } from "../db.js";
import { config } from "../config.js";
import { ApiError, requireAdmin } from "../errors.js";
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

  // Деактивация: сгорают активация и чекин, удаляются заявки, снимается поиск,
  // отменяются незавершённые матчи
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
}
