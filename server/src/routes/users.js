import { q } from "../db.js";
import { config } from "../config.js";
import { ApiError, requireUser } from "../errors.js";
import { clean, now, publicUser } from "../util.js";

function serializeMe(u) {
  const t = now();
  const place = q(`SELECT COUNT(*) + 1 AS p FROM users WHERE elo > ?`).get(u.elo).p;
  const favoritesCount = q(`SELECT COUNT(*) AS c FROM favorites WHERE user_id = ?`).get(u.id).c;
  return {
    id: u.id,
    name: u.name,
    contact: u.contact,
    lang: u.lang,
    role: u.role,
    prefDisc: u.pref_disc,
    prefPays: u.pref_pays,
    elo: u.elo,
    matchesCount: u.matches_count,
    winsCount: u.wins_count,
    place,
    favoritesCount,
    isActivated: u.activated_until > t,
    activatedUntil: u.activated_until,
    isCheckedIn: u.checked_in_until > t,
    checkedInUntil: u.checked_in_until,
    searching:
      u.search_until > t
        ? { until: u.search_until, startedAt: u.search_started, disc: u.search_disc, pays: u.search_pays }
        : null,
    serverNow: t,
  };
}

const onboardSchema = {
  body: {
    type: "object",
    required: ["name", "contact", "lang"],
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 80 },
      contact: { type: "string", minLength: 1, maxLength: 120 },
      lang: { type: "string", enum: ["en", "pl", "uk", "ru"] },
      prefDisc: { type: "integer", minimum: 0, maximum: 2 },
      prefPays: { type: "integer", minimum: 0, maximum: 1 },
    },
  },
};

const patchMeSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 80 },
      contact: { type: "string", maxLength: 120 },
      lang: { type: "string", enum: ["en", "pl", "uk", "ru"] },
      prefDisc: { type: "integer", minimum: 0, maximum: 2 },
      prefPays: { type: "integer", minimum: 0, maximum: 1 },
    },
  },
};

let ratingCache = { at: 0, data: null };

export default async function usersRoutes(app) {
  // ── Онбординг ──────────────────────────────────────────────
  app.post("/auth/onboard", { schema: onboardSchema, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, (req) => {
    if (req.user) return { me: serializeMe(req.user) }; // идемпотентность: повторный вызов не дублирует

    const name = clean(req.body.name, 40);
    const contact = clean(req.body.contact, 60);
    if (name.length < 2) throw new ApiError(400, "validation");
    if (contact.length < 2) throw new ApiError(400, "validation");

    const role = config.adminTgIds.includes(req.tgUser.id) ? "admin" : "user";
    const r = q(
      `INSERT INTO users (tg_id, role, name, contact, lang, pref_disc, pref_pays, elo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      req.tgUser.id, role, name, contact, req.body.lang,
      req.body.prefDisc ?? 2, req.body.prefPays ?? 0, config.ELO_START, now()
    );
    const me = q(`SELECT * FROM users WHERE id = ?`).get(Number(r.lastInsertRowid));
    return { me: serializeMe(me) };
  });

  // ── Мой профиль ────────────────────────────────────────────
  app.get("/me", (req) => ({ me: serializeMe(requireUser(req)) }));

  app.patch("/me", { schema: patchMeSchema }, (req) => {
    const u = requireUser(req);
    const name = req.body.name !== undefined ? clean(req.body.name, 40) : u.name;
    const contact = req.body.contact !== undefined ? clean(req.body.contact, 60) : u.contact;
    if (name.length < 2) throw new ApiError(400, "validation");
    q(`UPDATE users SET name = ?, contact = ?, lang = ?, pref_disc = ?, pref_pays = ? WHERE id = ?`).run(
      name, contact,
      req.body.lang ?? u.lang,
      req.body.prefDisc ?? u.pref_disc,
      req.body.prefPays ?? u.pref_pays,
      u.id
    );
    return { me: serializeMe(q(`SELECT * FROM users WHERE id = ?`).get(u.id)) };
  });

  // ── Рейтинг клуба (кэш 5 секунд — при 300 онлайн это важно) ─
  app.get("/rating", (req) => {
    const u = requireUser(req);
    const t = now();
    if (!ratingCache.data || t - ratingCache.at > 5000) {
      ratingCache = {
        at: t,
        data: q(
          `SELECT id, name, elo, role, matches_count, wins_count
           FROM users ORDER BY elo DESC, matches_count DESC, id ASC LIMIT ?`
        ).all(config.RATING_TOP),
      };
    }
    const place = q(`SELECT COUNT(*) + 1 AS p FROM users WHERE elo > ?`).get(u.elo).p;
    return {
      top: ratingCache.data.map((r) => ({
        id: r.id, name: r.name, elo: r.elo, role: r.role,
      })),
      me: { id: u.id, name: u.name, elo: u.elo, place, role: u.role },
    };
  });

  // ── Чужой профиль ──────────────────────────────────────────
  app.get("/players/:id", (req) => {
    const u = requireUser(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "validation");
    const p = q(`SELECT * FROM users WHERE id = ?`).get(id);
    if (!p) throw new ApiError(404, "player_not_found");

    const isFavorite = !!q(`SELECT 1 FROM favorites WHERE user_id = ? AND fav_id = ?`).get(u.id, id);
    const h2h = q(
      `SELECT * FROM matches
       WHERE status = 'confirmed'
         AND ((initiator_id = ? AND opponent_id = ?) OR (initiator_id = ? AND opponent_id = ?))
       ORDER BY resolved_at DESC LIMIT ?`
    ).all(u.id, id, id, u.id, config.HISTORY_LIMIT);

    return {
      player: {
        ...publicUser(p),
        // контакты видны только активированным участникам клуба
        contact: u.activated_until > now() ? p.contact : null,
      },
      isFavorite,
      h2h: h2h.map((m) => {
        const iWon = m.winner_id === u.id;
        return { id: m.id, date: m.resolved_at, iWon, delta: iWon ? m.delta : -m.delta };
      }),
    };
  });

  // ── История моих матчей ────────────────────────────────────
  app.get("/history", (req) => {
    const u = requireUser(req);
    const rows = q(
      `SELECT m.*, w.id AS o_id, w.name AS o_name, w.elo AS o_elo, w.role AS o_role
       FROM matches m
       JOIN users w ON w.id = CASE WHEN m.initiator_id = ? THEN m.opponent_id ELSE m.initiator_id END
       WHERE m.status = 'confirmed' AND (m.initiator_id = ? OR m.opponent_id = ?)
       ORDER BY m.resolved_at DESC LIMIT ?`
    ).all(u.id, u.id, u.id, config.HISTORY_LIMIT);
    return {
      matches: rows.map((m) => {
        const iWon = m.winner_id === u.id;
        return {
          id: m.id,
          date: m.resolved_at,
          iWon,
          delta: iWon ? m.delta : -m.delta,
          opponent: { id: m.o_id, name: m.o_name, elo: m.o_elo, role: m.o_role },
        };
      }),
    };
  });

  // ── 5 последних соперников (быстрый выбор на экране результата) ─
  app.get("/recent-opponents", (req) => {
    const u = requireUser(req);
    const rows = q(
      `SELECT m.winner_id, m.delta, m.resolved_at,
              o.id AS o_id, o.name AS o_name, o.elo AS o_elo, o.role AS o_role
       FROM matches m
       JOIN users o ON o.id = CASE WHEN m.initiator_id = ? THEN m.opponent_id ELSE m.initiator_id END
       WHERE m.status = 'confirmed' AND (m.initiator_id = ? OR m.opponent_id = ?)
       ORDER BY m.resolved_at DESC LIMIT 30`
    ).all(u.id, u.id, u.id);
    const seen = new Set();
    const result = [];
    for (const m of rows) {
      if (seen.has(m.o_id)) continue;
      seen.add(m.o_id);
      const iWon = m.winner_id === u.id;
      result.push({
        id: m.o_id, name: m.o_name, elo: m.o_elo, role: m.o_role,
        lastDelta: iWon ? m.delta : -m.delta,
      });
      if (result.length >= config.RECENT_OPPONENTS) break;
    }
    return { opponents: result };
  });

  // ── Избранное ──────────────────────────────────────────────
  app.get("/favorites", (req) => {
    const u = requireUser(req);
    const rows = q(
      `SELECT p.id, p.name, p.elo, p.role FROM favorites f
       JOIN users p ON p.id = f.fav_id WHERE f.user_id = ? ORDER BY f.created_at DESC`
    ).all(u.id);
    return { favorites: rows };
  });

  app.post("/favorites/:id", (req) => {
    const u = requireUser(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0 || id === u.id) throw new ApiError(400, "validation");
    if (!q(`SELECT 1 FROM users WHERE id = ?`).get(id)) throw new ApiError(404, "player_not_found");
    const count = q(`SELECT COUNT(*) AS c FROM favorites WHERE user_id = ?`).get(u.id).c;
    if (count >= config.MAX_FAVORITES) throw new ApiError(400, "limit_reached");
    q(`INSERT OR IGNORE INTO favorites (user_id, fav_id, created_at) VALUES (?, ?, ?)`).run(u.id, id, now());
    return { ok: true };
  });

  app.delete("/favorites/:id", (req) => {
    const u = requireUser(req);
    q(`DELETE FROM favorites WHERE user_id = ? AND fav_id = ?`).run(u.id, Number(req.params.id) || 0);
    return { ok: true };
  });
}
