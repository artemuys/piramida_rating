import { q } from "./db.js";
import { sweepExpiredMatches } from "./routes/matches.js";
import { dayStr } from "./util.js";

/**
 * Фоновая уборка. Истечение активации/чекина/поиска не требует записи —
 * эти статусы вычисляются от timestamp'ов при чтении.
 */
export function startSweeper(log) {
  const run = () => {
    try {
      sweepExpiredMatches();
      q(`DELETE FROM requests WHERE day < ?`).run(dayStr(0));
      q(`DELETE FROM audit_log WHERE created_at < ?`).run(Date.now() - 180 * 24 * 3600 * 1000);
    } catch (e) {
      log.error({ err: e }, "sweeper failed");
    }
  };
  run();
  const timer = setInterval(run, 15_000);
  timer.unref();
  return timer;
}
