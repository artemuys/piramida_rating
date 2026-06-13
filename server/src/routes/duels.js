import { q, tx } from "../db.js";
import { config } from "../config.js";
import { ApiError, requireUser } from "../errors.js";
import { now, clean } from "../util.js";

const createSchema = {
  body: {
    type: "object",
    required: ["opponentId"],
    additionalProperties: false,
    properties: {
      opponentId: { type: "integer", minimum: 1 },
      message: { type: "string", maxLength: 200 },
    },
  },
};

function serializeDuel(d, viewerId) {
  return {
    id: d.id,
    challengerId: d.challenger_id,
    opponentId: d.opponent_id,
    message: d.message,
    status: d.status,
    createdAt: d.created_at,
  };
}

export default async function duelsRoutes(app) {
  // GET /duels — входящие + исходящие
  app.get("/duels", (req) => {
    const u = requireUser(req);
    const t = now();
    const cutoff = t - config.DUEL_TTL_MS;

    const incoming = q(
      `SELECT d.*, c.name AS c_name, c.elo AS c_elo, c.contact AS c_contact
       FROM duels d JOIN users c ON c.id = d.challenger_id
       WHERE d.opponent_id = ? AND d.status = 'open' AND d.created_at >= ?
       ORDER BY d.created_at DESC`
    ).all(u.id, cutoff);

    const outgoing = q(
      `SELECT d.*, o.name AS o_name, o.elo AS o_elo
       FROM duels d JOIN users o ON o.id = d.opponent_id
       WHERE d.challenger_id = ? AND d.status = 'open' AND d.created_at >= ?
       ORDER BY d.created_at DESC`
    ).all(u.id, cutoff);

    return {
      incoming: incoming.map(d => ({
        id: d.id,
        challenger: { id: d.challenger_id, name: d.c_name, elo: d.c_elo, contact: d.c_contact },
        message: d.message,
        status: d.status,
        createdAt: d.created_at,
      })),
      outgoing: outgoing.map(d => ({
        id: d.id,
        opponent: { id: d.opponent_id, name: d.o_name, elo: d.o_elo },
        message: d.message,
        status: d.status,
        createdAt: d.created_at,
      })),
    };
  });

  // POST /duels — бросить вызов
  app.post(
    "/duels",
    { schema: createSchema, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    (req) => {
      const u = requireUser(req);
      const { opponentId, message = "" } = req.body;

      if (opponentId === u.id) throw new ApiError(400, "self_match");
      const opp = q(`SELECT * FROM users WHERE id = ?`).get(opponentId);
      if (!opp) throw new ApiError(404, "player_not_found");

      const existing = q(
        `SELECT 1 FROM duels WHERE challenger_id = ? AND opponent_id = ? AND status = 'open'`
      ).get(u.id, opponentId);
      if (existing) throw new ApiError(409, "duel_exists");

      const msg = clean(message, config.DUEL_MSG_MAX);
      const r = q(
        `INSERT INTO duels (challenger_id, opponent_id, message, status, created_at)
         VALUES (?, ?, ?, 'open', ?)`
      ).run(u.id, opponentId, msg, now());

      return { id: Number(r.lastInsertRowid) };
    }
  );

  // POST /duels/:id/cancel — отменить свой вызов
  app.post("/duels/:id/cancel", (req) => {
    const u = requireUser(req);
    const id = Number(req.params.id) || 0;
    return tx(() => {
      const d = q(`SELECT * FROM duels WHERE id = ?`).get(id);
      if (!d || d.challenger_id !== u.id) throw new ApiError(404, "not_found");
      if (d.status !== "open") throw new ApiError(409, "already_resolved");
      q(`UPDATE duels SET status='cancelled', resolved_at=? WHERE id=?`).run(now(), id);
      return { ok: true };
    });
  });

  // POST /duels/:id/decline — отклонить входящий
  app.post("/duels/:id/decline", (req) => {
    const u = requireUser(req);
    const id = Number(req.params.id) || 0;
    return tx(() => {
      const d = q(`SELECT * FROM duels WHERE id = ?`).get(id);
      if (!d || d.opponent_id !== u.id) throw new ApiError(404, "not_found");
      if (d.status !== "open") throw new ApiError(409, "already_resolved");
      q(`UPDATE duels SET status='declined', resolved_at=? WHERE id=?`).run(now(), id);
      return { ok: true };
    });
  });
}
