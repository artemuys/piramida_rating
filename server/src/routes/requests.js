import { q } from "../db.js";
import { config } from "../config.js";
import { ApiError, requireActivated } from "../errors.js";
import { now, dayStr } from "../util.js";

const WINDOW_DAYS = 7; // заявку можно подать на любой из ближайших 7 дней (0 = сегодня)
const TIME_RE = "^([01][0-9]|2[0-3]):[0-5][0-9]$"; // HH:MM 24ч

const createSchema = {
  body: {
    type: "object",
    required: ["startOffset", "endOffset", "timeFrom", "timeTo", "disc", "pays"],
    additionalProperties: false,
    properties: {
      startOffset: { type: "integer", minimum: 0, maximum: WINDOW_DAYS - 1 },
      endOffset: { type: "integer", minimum: 0, maximum: WINDOW_DAYS - 1 },
      timeFrom: { type: "string", pattern: TIME_RE },
      timeTo: { type: "string", pattern: TIME_RE },
      disc: { type: "integer", minimum: 0, maximum: 1 },
      pays: { type: "integer", minimum: 0, maximum: 1 },
    },
  },
};

function serializeRequest(r) {
  return {
    id: r.id,
    startDay: r.start_day,
    endDay: r.end_day,
    timeFrom: r.time_from,
    timeTo: r.time_to,
    disc: r.disc,
    pays: r.pays,
  };
}

export default async function requestsRoutes(app) {
  app.get("/requests/mine", (req) => {
    const u = requireActivated(req);
    // активные = ещё не прошедшие (конец диапазона сегодня или позже)
    const rows = q(
      `SELECT * FROM requests WHERE user_id = ? AND end_day >= ? ORDER BY start_day, time_from`
    ).all(u.id, dayStr(0));
    return { requests: rows.map(serializeRequest) };
  });

  app.post(
    "/requests",
    { schema: createSchema, config: { rateLimit: { max: 15, timeWindow: "1 minute" } } },
    (req) => {
      const u = requireActivated(req);
      if (!u.contact) throw new ApiError(403, "no_contact");
      const { startOffset, endOffset, timeFrom, timeTo, disc, pays } = req.body;

      if (endOffset < startOffset) throw new ApiError(400, "invalid_range");
      if (timeFrom >= timeTo) throw new ApiError(400, "invalid_time"); // HH:MM сравнимы лексикографически

      const count = q(`SELECT COUNT(*) AS c FROM requests WHERE user_id = ? AND end_day >= ?`)
        .get(u.id, dayStr(0)).c;
      if (count >= config.MAX_REQUESTS_PER_USER) throw new ApiError(400, "limit_reached");

      const r = q(
        `INSERT INTO requests (user_id, start_day, end_day, time_from, time_to, disc, pays, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(u.id, dayStr(startOffset), dayStr(endOffset), timeFrom, timeTo, disc, pays, now());
      return { id: Number(r.lastInsertRowid) };
    }
  );

  app.delete("/requests/:id", (req) => {
    const u = requireActivated(req);
    q(`DELETE FROM requests WHERE id = ? AND user_id = ?`).run(Number(req.params.id) || 0, u.id);
    return { ok: true };
  });

  // Лента чужих заявок, пересекающихся с окном ближайших 7 дней.
  // Контакты — только активированным (requireActivated).
  app.get("/requests/feed", (req) => {
    const u = requireActivated(req);
    const t = now();
    const today = dayStr(0);
    const windowEnd = dayStr(WINDOW_DAYS - 1);
    const rows = q(
      `SELECT r.id, r.start_day, r.end_day, r.time_from, r.time_to, r.disc, r.pays,
              p.id AS p_id, p.name, p.elo, p.elo_pyramid, p.role, p.contact
       FROM requests r
       JOIN users p ON p.id = r.user_id
       WHERE r.end_day >= ? AND r.start_day <= ? AND r.user_id != ? AND p.activated_until > ?
       ORDER BY r.start_day, r.time_from,
                CASE WHEN r.disc = 1 THEN p.elo_pyramid ELSE p.elo END DESC`
    ).all(today, windowEnd, u.id, t);
    return {
      feed: rows.map((r) => ({
        ...serializeRequest(r),
        player: {
          id: r.p_id, name: r.name,
          elo: r.disc === 'pyramid' ? r.elo_pyramid : r.elo,
          role: r.role, contact: r.contact,
        },
      })),
    };
  });
}
