import { q, tx } from "../db.js";
import { config } from "../config.js";
import { ApiError, requireUser, requireCheckedIn } from "../errors.js";
import { now, eloDelta, serializeMatch } from "../util.js";
import { checkMatchAchievements, addFeedEvent, refreshElite } from "../achievements.js";

/** Просроченные pending-матчи → timeout. Вызывается лениво перед каждой операцией. */
export function sweepExpiredMatches(t = now()) {
  q(
    `UPDATE matches
     SET status = 'timeout', resolved_at = ?, initiator_ack = 0, opponent_ack = 1
     WHERE status = 'pending' AND expires_at < ?`
  ).run(t, t);
}

const pendingFor = (userId) =>
  q(`SELECT * FROM matches WHERE status = 'pending' AND (initiator_id = ? OR opponent_id = ?) LIMIT 1`).get(
    userId, userId
  );

function withUsers(m) {
  const init = q(`SELECT id, name, elo, role FROM users WHERE id = ?`).get(m.initiator_id);
  const opp = q(`SELECT id, name, elo, role FROM users WHERE id = ?`).get(m.opponent_id);
  return { m, init, opp };
}

function matchPayload(m, viewerId) {
  const { init, opp } = withUsers(m);
  const s = serializeMatch(m, viewerId);
  s.opponentUser = m.initiator_id === viewerId ? opp : init;
  return s;
}

const reportSchema = {
  body: {
    type: "object",
    required: ["opponentId", "result"],
    additionalProperties: false,
    properties: {
      opponentId: { type: "integer", minimum: 1 },
      result: { type: "string", enum: ["win", "lose"] },
    },
  },
};

const respondSchema = {
  body: {
    type: "object",
    required: ["result"],
    additionalProperties: false,
    properties: { result: { type: "string", enum: ["win", "lose"] } },
  },
};

export default async function matchesRoutes(app) {
  // ── Игрок А заявляет результат ─────────────────────────────
  app.post(
    "/matches/report",
    { schema: reportSchema, config: { rateLimit: { max: 12, timeWindow: "1 minute" } } },
    (req) => {
      const u = requireCheckedIn(req); // только при активном 6-часовом чекине
      const { opponentId, result } = req.body;
      if (opponentId === u.id) throw new ApiError(400, "self_match");

      return tx(() => {
        const t = now();
        sweepExpiredMatches(t);

        const opp = q(`SELECT * FROM users WHERE id = ?`).get(opponentId);
        if (!opp) throw new ApiError(404, "player_not_found");
        if (opp.checked_in_until <= t) throw new ApiError(409, "opponent_not_checked_in");
        if (pendingFor(u.id)) throw new ApiError(409, "you_busy");
        if (pendingFor(opp.id)) throw new ApiError(409, "opponent_busy");

        const r = q(
          `INSERT INTO matches
             (initiator_id, opponent_id, initiator_claim, status,
              initiator_elo_before, opponent_elo_before, expires_at, created_at)
           VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`
        ).run(u.id, opp.id, result, u.elo, opp.elo, t + config.MATCH_CONFIRM_MS, t);

        const m = q(`SELECT * FROM matches WHERE id = ?`).get(Number(r.lastInsertRowid));
        return { match: matchPayload(m, u.id) };
      });
    }
  );

  // ── Игрок Б отвечает (зеркальное подтверждение) ────────────
  app.post("/matches/:id/respond", { schema: respondSchema }, (req) => {
    const u = requireCheckedIn(req);
    const id = Number(req.params.id);
    const claim = req.body.result;

    // Транзакция: только запись в БД
    const txResult = tx(() => {
      const t = now();
      const m = q(`SELECT * FROM matches WHERE id = ?`).get(id);
      if (!m || m.opponent_id !== u.id) throw new ApiError(404, "match_not_found");

      if (m.status !== "pending") return { match: matchPayload(m, u.id), confirmed: false };

      if (m.expires_at < t) {
        q(`UPDATE matches SET status = 'timeout', resolved_at = ?, initiator_ack = 0, opponent_ack = 1 WHERE id = ?`)
          .run(t, id);
        return { match: matchPayload(q(`SELECT * FROM matches WHERE id = ?`).get(id), u.id), confirmed: false };
      }

      const mirror = m.initiator_claim !== claim;

      if (!mirror) {
        q(
          `UPDATE matches SET status = 'conflict', opponent_claim = ?, resolved_at = ?,
             initiator_ack = 0, opponent_ack = 1 WHERE id = ?`
        ).run(claim, t, id);
        return { match: matchPayload(q(`SELECT * FROM matches WHERE id = ?`).get(id), u.id), confirmed: false };
      }

      // Подтверждено
      const init = q(`SELECT * FROM users WHERE id = ?`).get(m.initiator_id);
      const opp  = q(`SELECT * FROM users WHERE id = ?`).get(m.opponent_id);
      const initiatorWon = m.initiator_claim === "win";
      const winner = initiatorWon ? init : opp;
      const loser  = initiatorWon ? opp  : init;
      const d = eloDelta(winner.elo, loser.elo);

      const newWinnerElo = winner.elo + d;
      const newLoserElo  = Math.max(0, loser.elo - d);
      const winnerStreak = winner.streak > 0 ? winner.streak + 1 : 1;
      const loserStreak  = loser.streak  < 0 ? loser.streak - 1  : -1;

      q(`UPDATE users SET elo=?, matches_count=matches_count+1, wins_count=wins_count+1,
           xp=xp+?, streak=?, best_streak=MAX(best_streak,?), peak_elo=MAX(peak_elo,?) WHERE id=?`)
        .run(newWinnerElo, config.XP_WIN, winnerStreak, winnerStreak, newWinnerElo, winner.id);

      q(`UPDATE users SET elo=?, matches_count=matches_count+1, xp=xp+?, streak=? WHERE id=?`)
        .run(newLoserElo, config.XP_LOSS, loserStreak, loser.id);

      q(`UPDATE matches SET status='confirmed', opponent_claim=?, winner_id=?, delta=?,
           initiator_elo_before=?, initiator_elo_after=?,
           opponent_elo_before=?, opponent_elo_after=?,
           resolved_at=?, initiator_ack=0, opponent_ack=1 WHERE id=?`)
        .run(
          claim, winner.id, d,
          init.elo, initiatorWon ? newWinnerElo : newLoserElo,
          opp.elo,  initiatorWon ? newLoserElo  : newWinnerElo,
          t, id
        );

      addFeedEvent("match_win", winner.id, loser.id, {
        winnerId: winner.id, loserId: loser.id,
        winnerName: winner.name, loserName: loser.name, delta: d,
      });

      return {
        match: matchPayload(q(`SELECT * FROM matches WHERE id = ?`).get(id), u.id),
        confirmed: true,
        winnerId: winner.id,
        loserId: loser.id,
        matchId: id,
      };
    });

    // Ачивки — вне транзакции (чистые чтения + отдельные INSERT OR IGNORE)
    if (txResult.confirmed) {
      try {
        checkMatchAchievements(txResult.winnerId, txResult.loserId, txResult.matchId);
      } catch { /* не роняем запрос из-за ачивок */ }
    }

    return { match: txResult.match };
  });

  // ── Инициатор отменяет ожидание ────────────────────────────
  app.post("/matches/:id/cancel", (req) => {
    const u = requireUser(req);
    const id = Number(req.params.id);
    return tx(() => {
      const m = q(`SELECT * FROM matches WHERE id = ?`).get(id);
      if (!m || m.initiator_id !== u.id) throw new ApiError(404, "match_not_found");
      if (m.status === "pending") {
        q(`UPDATE matches SET status = 'cancelled', resolved_at = ?, initiator_ack = 1, opponent_ack = 1 WHERE id = ?`)
          .run(now(), id);
      }
      return { ok: true };
    });
  });

  // ── Подтверждение «я увидел итог» (закрытие модалки) ───────
  app.post("/matches/:id/ack", (req) => {
    const u = requireUser(req);
    const id = Number(req.params.id);
    q(`UPDATE matches SET initiator_ack = 1 WHERE id = ? AND initiator_id = ?`).run(id, u.id);
    q(`UPDATE matches SET opponent_ack = 1 WHERE id = ? AND opponent_id = ?`).run(id, u.id);
    return { ok: true };
  });

  // ── Поллинг: входящие/исходящие/непросмотренные итоги ──────
  app.get("/matches/active", (req) => {
    const u = requireUser(req);
    const t = now();
    sweepExpiredMatches(t);

    const incoming = q(
      `SELECT * FROM matches WHERE status = 'pending' AND opponent_id = ? LIMIT 1`
    ).get(u.id);
    const outgoing = q(
      `SELECT * FROM matches WHERE status = 'pending' AND initiator_id = ? LIMIT 1`
    ).get(u.id);
    const unseen = q(
      `SELECT * FROM matches
       WHERE status != 'pending' AND resolved_at > ?
         AND ((initiator_id = ? AND initiator_ack = 0) OR (opponent_id = ? AND opponent_ack = 0))
       ORDER BY resolved_at ASC LIMIT 1`
    ).get(t - 24 * 3600 * 1000, u.id, u.id);

    return {
      now: t,
      incoming: incoming ? matchPayload(incoming, u.id) : null,
      outgoing: outgoing ? matchPayload(outgoing, u.id) : null,
      unseen: unseen ? matchPayload(unseen, u.id) : null,
    };
  });
}
