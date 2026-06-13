import { q } from "../db.js";
import { requireUser } from "../errors.js";
import { now } from "../util.js";

function enrichAch(r) {
  const entry = { code: r.code, earnedAt: r.earned_at, seen: r.seen };
  const m = r.code.match(/^season_master_(\d+)$/);
  if (m) {
    const season = q(`SELECT started_at, ends_at FROM seasons WHERE id = ?`).get(Number(m[1]));
    if (season) { entry.seasonStartedAt = season.started_at; entry.seasonEndsAt = season.ends_at; }
  }
  return entry;
}

export default async function recordsRoutes(app) {
  // GET /achievements/me — мои ачивки
  app.get("/achievements/me", (req) => {
    const u = requireUser(req);
    const rows = q(`SELECT code, earned_at, seen FROM achievements WHERE user_id = ? ORDER BY earned_at DESC`).all(u.id);
    // Помечаем все просмотренными
    q(`UPDATE achievements SET seen = 1 WHERE user_id = ? AND seen = 0`).run(u.id);
    return { achievements: rows.map(r => enrichAch(r)) };
  });

  // GET /achievements/:id — ачивки другого игрока
  app.get("/achievements/:id", (req) => {
    requireUser(req);
    const id = Number(req.params.id) || 0;
    const rows = q(`SELECT code, earned_at FROM achievements WHERE user_id = ? ORDER BY earned_at DESC`).all(id);
    return { achievements: rows.map(r => enrichAch(r)) };
  });

  // GET /records — клубные рекорды
  app.get("/records", (req) => {
    requireUser(req);
    const t = now();
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const weekDay = new Date().getDay();
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - ((weekDay + 6) % 7)); // понедельник
    weekStart.setHours(0, 0, 0, 0);

    // 🔥 Самая длинная серия побед
    const bestStreak = q(
      `SELECT id, name, best_streak FROM users ORDER BY best_streak DESC LIMIT 1`
    ).get();

    // 👑 Исторический пик рейтинга
    const peakElo = q(
      `SELECT id, name, peak_elo FROM users ORDER BY peak_elo DESC LIMIT 1`
    ).get();

    // 💼 Главный ветеран
    const veteran = q(
      `SELECT id, name, matches_count FROM users ORDER BY matches_count DESC LIMIT 1`
    ).get();

    // 🤝 Самое частое противостояние
    const derby = q(
      `SELECT MIN(initiator_id, opponent_id) AS a, MAX(initiator_id, opponent_id) AS b, COUNT(*) AS c
       FROM matches WHERE status='confirmed'
       GROUP BY a, b ORDER BY c DESC LIMIT 1`
    ).get();
    let derbyRecord = null;
    if (derby) {
      const ua = q(`SELECT id, name FROM users WHERE id = ?`).get(derby.a);
      const ub = q(`SELECT id, name FROM users WHERE id = ?`).get(derby.b);
      if (ua && ub) derbyRecord = { playerA: { id: ua.id, name: ua.name }, playerB: { id: ub.id, name: ub.name }, count: derby.c };
    }

    // ⚡ Текущий месяц
    const monthMs = monthStart.getTime();

    const monthMatches = q(
      `SELECT CASE WHEN initiator_id = sub.uid THEN initiator_id ELSE opponent_id END AS uid,
              COUNT(*) AS c
       FROM matches,
         (SELECT id AS uid FROM users) sub
       WHERE status='confirmed' AND resolved_at>=? AND (initiator_id=sub.uid OR opponent_id=sub.uid)
       GROUP BY sub.uid ORDER BY c DESC LIMIT 1`
    ).get(monthMs);
    // Simpler query:
    const monthMost = q(
      `SELECT uid, COUNT(*) AS c FROM (
         SELECT initiator_id AS uid FROM matches WHERE status='confirmed' AND resolved_at>=?
         UNION ALL
         SELECT opponent_id AS uid FROM matches WHERE status='confirmed' AND resolved_at>=?
       ) GROUP BY uid ORDER BY c DESC LIMIT 1`
    ).get(monthMs, monthMs);
    let monthMostPlayer = null;
    if (monthMost) {
      const pu = q(`SELECT id, name FROM users WHERE id = ?`).get(monthMost.uid);
      if (pu) monthMostPlayer = { id: pu.id, name: pu.name, count: monthMost.c };
    }

    // 📈 Гроза месяца (топ рост Эло за месяц)
    const monthGain = q(
      `SELECT uid, SUM(delta_val) AS total_gain FROM (
         SELECT initiator_id AS uid,
           CASE WHEN winner_id = initiator_id THEN delta ELSE -delta END AS delta_val
         FROM matches WHERE status='confirmed' AND resolved_at>=?
         UNION ALL
         SELECT opponent_id AS uid,
           CASE WHEN winner_id = opponent_id THEN delta ELSE -delta END AS delta_val
         FROM matches WHERE status='confirmed' AND resolved_at>=?
       ) GROUP BY uid ORDER BY total_gain DESC LIMIT 1`
    ).get(monthMs, monthMs);
    let monthGainer = null;
    if (monthGain && monthGain.total_gain > 0) {
      const pu = q(`SELECT id, name FROM users WHERE id = ?`).get(monthGain.uid);
      if (pu) monthGainer = { id: pu.id, name: pu.name, gain: monthGain.total_gain };
    }

    // 📉 Главный донор месяца
    const monthDonor = q(
      `SELECT uid, SUM(delta_val) AS total_loss FROM (
         SELECT initiator_id AS uid,
           CASE WHEN winner_id = initiator_id THEN delta ELSE -delta END AS delta_val
         FROM matches WHERE status='confirmed' AND resolved_at>=?
         UNION ALL
         SELECT opponent_id AS uid,
           CASE WHEN winner_id = opponent_id THEN delta ELSE -delta END AS delta_val
         FROM matches WHERE status='confirmed' AND resolved_at>=?
       ) GROUP BY uid ORDER BY total_loss ASC LIMIT 1`
    ).get(monthMs, monthMs);
    let monthDonorPlayer = null;
    if (monthDonor && monthDonor.total_loss < 0) {
      const pu = q(`SELECT id, name FROM users WHERE id = ?`).get(monthDonor.uid);
      if (pu) monthDonorPlayer = { id: pu.id, name: pu.name, loss: monthDonor.total_loss };
    }

    // ⚔️ Охотник за головами месяца
    const monthHunter = q(
      `SELECT uid, COUNT(DISTINCT opp) AS uniq FROM (
         SELECT initiator_id AS uid, opponent_id AS opp FROM matches WHERE status='confirmed' AND resolved_at>=?
         UNION ALL
         SELECT opponent_id AS uid, initiator_id AS opp FROM matches WHERE status='confirmed' AND resolved_at>=?
       ) GROUP BY uid ORDER BY uniq DESC LIMIT 1`
    ).get(monthMs, monthMs);
    let monthHunterPlayer = null;
    if (monthHunter) {
      const pu = q(`SELECT id, name FROM users WHERE id = ?`).get(monthHunter.uid);
      if (pu) monthHunterPlayer = { id: pu.id, name: pu.name, count: monthHunter.uniq };
    }

    // 🚀 Неделя
    const weekMs = weekStart.getTime();

    const weekGain = q(
      `SELECT uid, SUM(delta_val) AS gain FROM (
         SELECT initiator_id AS uid,
           CASE WHEN winner_id = initiator_id THEN delta ELSE -delta END AS delta_val
         FROM matches WHERE status='confirmed' AND resolved_at>=?
         UNION ALL
         SELECT opponent_id AS uid,
           CASE WHEN winner_id = opponent_id THEN delta ELSE -delta END AS delta_val
         FROM matches WHERE status='confirmed' AND resolved_at>=?
       ) GROUP BY uid ORDER BY gain DESC LIMIT 1`
    ).get(weekMs, weekMs);
    let weekGainer = null;
    if (weekGain && weekGain.gain > 0) {
      const pu = q(`SELECT id, name FROM users WHERE id = ?`).get(weekGain.uid);
      if (pu) weekGainer = { id: pu.id, name: pu.name, gain: weekGain.gain };
    }

    const weekMarathon = q(
      `SELECT uid, COUNT(*) AS c FROM (
         SELECT initiator_id AS uid FROM matches WHERE status='confirmed' AND resolved_at>=?
         UNION ALL
         SELECT opponent_id AS uid FROM matches WHERE status='confirmed' AND resolved_at>=?
       ) GROUP BY uid ORDER BY c DESC LIMIT 1`
    ).get(weekMs, weekMs);
    let weekMarathonPlayer = null;
    if (weekMarathon) {
      const pu = q(`SELECT id, name FROM users WHERE id = ?`).get(weekMarathon.uid);
      if (pu) weekMarathonPlayer = { id: pu.id, name: pu.name, count: weekMarathon.c };
    }

    // 🦖 Непобедимый босс (winrate, мин 20 матчей)
    const boss = q(
      `SELECT id, name, matches_count, wins_count,
              CAST(wins_count AS REAL) / matches_count AS wr
       FROM users WHERE matches_count >= 20
       ORDER BY wr DESC LIMIT 1`
    ).get();
    let bossPlayer = null;
    if (boss) {
      bossPlayer = { id: boss.id, name: boss.name, winRate: Math.round(boss.wr * 100) };
    }

    // 🏹 Главный апсет (самая большая разница ELO в пользу слабого)
    const upset = q(
      `SELECT m.id, m.delta, m.winner_id, m.initiator_id, m.opponent_id,
              m.initiator_elo_before, m.opponent_elo_before,
              wi.name AS w_name, lo.name AS l_name,
              ABS(m.initiator_elo_before - m.opponent_elo_before) AS diff
       FROM matches m
       JOIN users wi ON wi.id = m.winner_id
       JOIN users lo ON lo.id = CASE WHEN m.winner_id = m.initiator_id THEN m.opponent_id ELSE m.initiator_id END
       WHERE m.status = 'confirmed'
         AND ((m.winner_id = m.initiator_id AND m.initiator_elo_before < m.opponent_elo_before)
           OR (m.winner_id = m.opponent_id AND m.opponent_elo_before < m.initiator_elo_before))
       ORDER BY diff DESC LIMIT 1`
    ).get();
    let upsetRecord = null;
    if (upset) {
      const loserElo = upset.winner_id === upset.initiator_id ? upset.opponent_elo_before : upset.initiator_elo_before;
      const winnerElo = upset.winner_id === upset.initiator_id ? upset.initiator_elo_before : upset.opponent_elo_before;
      const loserId = upset.winner_id === upset.initiator_id ? upset.opponent_id : upset.initiator_id;
      upsetRecord = {
        winnerId: upset.winner_id,
        loserId,
        winnerName: upset.w_name,
        loserName: upset.l_name,
        diff: loserElo - winnerElo,
      };
    }

    return {
      allTime: {
        bestStreak: bestStreak ? { id: bestStreak.id, name: bestStreak.name, count: bestStreak.best_streak } : null,
        peakElo: peakElo ? { id: peakElo.id, name: peakElo.name, elo: peakElo.peak_elo } : null,
        veteran: veteran ? { id: veteran.id, name: veteran.name, count: veteran.matches_count } : null,
        derby: derbyRecord,
        boss: bossPlayer,
        upset: upsetRecord,
      },
      monthly: {
        mostMatches: monthMostPlayer,
        topGainer: monthGainer,
        topDonor: monthDonorPlayer,
        topHunter: monthHunterPlayer,
      },
      weekly: {
        topGainer: weekGainer,
        marathon: weekMarathonPlayer,
      },
    };
  });
}
