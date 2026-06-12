import { q } from "../db.js";
import { config } from "../config.js";
import { ApiError, requireActivated } from "../errors.js";
import { now, dayStr } from "../util.js";

const createSchema = {
  body: {
    type: "object",
    required: ["dayOffset", "timeSlot", "disc", "pays"],
    additionalProperties: false,
    properties: {
      dayOffset: { type: "integer", minimum: 0, maximum: 2 },
      timeSlot: { type: "integer", minimum: 0, maximum: 1 },
      disc: { type: "integer", minimum: 0, maximum: 1 },
      pays: { type: "integer", minimum: 0, maximum: 1 },
    },
  },
};

export default async function requestsRoutes(app) {
  app.get("/requests/mine", (req) => {
    const u = requireActivated(req);
    const rows = q(
      `SELECT * FROM requests WHERE user_id = ? AND day >= ? ORDER BY day, time_slot`
    ).all(u.id, dayStr(0));
    return {
      requests: rows.map((r) => ({
        id: r.id, day: r.day, timeSlot: r.time_slot, disc: r.disc, pays: r.pays,
      })),
    };
  });

  app.post(
    "/requests",
    { schema: createSchema, config: { rateLimit: { max: 15, timeWindow: "1 minute" } } },
    (req) => {
      const u = requireActivated(req);
      if (!u.contact) throw new ApiError(403, "no_contact");
      const { dayOffset, timeSlot, disc, pays } = req.body;

      const count = q(`SELECT COUNT(*) AS c FROM requests WHERE user_id = ? AND day >= ?`)
        .get(u.id, dayStr(0)).c;
      if (count >= config.MAX_REQUESTS_PER_USER) throw new ApiError(400, "limit_reached");

      try {
        const r = q(
          `INSERT INTO requests (user_id, day, time_slot, disc, pays, created_at) VALUES (?, ?, ?, ?, ?, ?)`
        ).run(u.id, dayStr(dayOffset), timeSlot, disc, pays, now());
        return { id: Number(r.lastInsertRowid) };
      } catch (e) {
        if (String(e.message).includes("UNIQUE")) throw new ApiError(409, "duplicate_request");
        throw e;
      }
    }
  );

  app.delete("/requests/:id", (req) => {
    const u = requireActivated(req);
    q(`DELETE FROM requests WHERE id = ? AND user_id = ?`).run(Number(req.params.id) || 0, u.id);
    return { ok: true };
  });

  // Лента чужих заявок на 3 дня. Контакты — только активированным (requireActivated).
  app.get("/requests/feed", (req) => {
    const u = requireActivated(req);
    const t = now();
    const days = [dayStr(0), dayStr(1), dayStr(2)];
    const rows = q(
      `SELECT r.id, r.day, r.time_slot, r.disc, r.pays,
              p.id AS p_id, p.name, p.elo, p.role, p.contact
       FROM requests r
       JOIN users p ON p.id = r.user_id
       WHERE r.day IN (?, ?, ?) AND r.user_id != ? AND p.activated_until > ?
       ORDER BY r.day, r.time_slot, p.elo DESC`
    ).all(days[0], days[1], days[2], u.id, t);
    return {
      days,
      feed: rows.map((r) => ({
        id: r.id, day: r.day, timeSlot: r.time_slot, disc: r.disc, pays: r.pays,
        player: { id: r.p_id, name: r.name, elo: r.elo, role: r.role, contact: r.contact },
      })),
    };
  });
}
