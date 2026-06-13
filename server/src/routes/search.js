import { q } from "../db.js";
import { ApiError, requireActivated } from "../errors.js";
import { now, endOfToday } from "../util.js";

const startSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: {
      disc: { type: "integer", minimum: 0, maximum: 2 },
      pays: { type: "integer", minimum: 0, maximum: 1 },
    },
  },
};

export default async function searchRoutes(app) {
  // Встать в поиск на сегодня (до полуночи по времени клуба)
  app.post("/search/start", { schema: startSchema }, (req) => {
    const u = requireActivated(req);
    if (!u.contact) throw new ApiError(403, "no_contact");
    q(
      `UPDATE users SET search_until = ?, search_started = ?, search_disc = ?, search_pays = ? WHERE id = ?`
    ).run(endOfToday(), now(), req.body?.disc ?? u.pref_disc, req.body?.pays ?? u.pref_pays, u.id);
    return { ok: true, until: endOfToday() };
  });

  app.post("/search/stop", (req) => {
    const u = requireActivated(req);
    q(`UPDATE users SET search_until = 0 WHERE id = ?`).run(u.id);
    return { ok: true };
  });

  // Кто сейчас в поиске (контакты — только активированным)
  app.get("/search/list", (req) => {
    const u = requireActivated(req);
    const t = now();
    const rows = q(
      `SELECT id, name, elo, role, contact, contact_type, search_disc, search_pays, search_started
       FROM users WHERE search_until > ? AND id != ? ORDER BY search_started ASC LIMIT 100`
    ).all(t, u.id);
    return {
      players: rows.map((r) => ({
        id: r.id, name: r.name, elo: r.elo, role: r.role, contact: r.contact,
        contactType: r.contact_type ?? "telegram",
        disc: r.search_disc, pays: r.search_pays, startedAt: r.search_started,
      })),
    };
  });
}
