import { q, tx } from "./db.js";
import { sweepExpiredMatches } from "./routes/matches.js";
import { dayStr, now } from "./util.js";
import { config } from "./config.js";
import { addFeedEvent } from "./achievements.js";

export function startSweeper(log) {
  const run = () => {
    try {
      const t = now();
      sweepExpiredMatches();
      q(`DELETE FROM requests WHERE day < ?`).run(dayStr(0));
      q(`DELETE FROM audit_log WHERE created_at < ?`).run(t - 180 * 24 * 3600 * 1000);
      q(`DELETE FROM duels WHERE status != 'open' AND resolved_at < ?`).run(t - 30 * 24 * 3600 * 1000);

      // Обрезаем ленту — оставляем только FEED_KEEP последних событий
      const feedCount = q(`SELECT COUNT(*) AS c FROM feed`).get().c;
      if (feedCount > config.FEED_KEEP) {
        q(`DELETE FROM feed WHERE id IN (
             SELECT id FROM feed ORDER BY created_at ASC LIMIT ?
           )`).run(feedCount - config.FEED_KEEP);
      }

      // Истечение вызовов (дуэли старше DUEL_TTL_MS)
      q(`UPDATE duels SET status='cancelled', resolved_at=? WHERE status='open' AND created_at < ?`)
        .run(t, t - config.DUEL_TTL_MS);

      // Смена сезона: если текущий закончился — стартуем новый и делаем decay ELO
      checkSeasonRollover(t);
    } catch (e) {
      log.error({ err: e }, "sweeper failed");
    }
  };
  run();
  const timer = setInterval(run, 15_000);
  timer.unref();
  return timer;
}

function checkSeasonRollover(t) {
  const cur = q(`SELECT * FROM seasons WHERE closed = 0 OR closed IS NULL ORDER BY id DESC LIMIT 1`).get();
  // Сезон управляется вручную суперадмином — автоматически новый не открываем
  if (!cur || cur.ends_at > t) return;

  // Сезон закончился — только публикуем событие (суперадмин закроет вручную)
  const alreadyPosted = q(`SELECT 1 FROM feed WHERE type = 'season_expired' AND data LIKE ?`).get(`%"seasonId":${cur.id}%`);
  if (!alreadyPosted) {
    addFeedEvent("season_expired", null, null, { seasonId: cur.id });
  }
}
