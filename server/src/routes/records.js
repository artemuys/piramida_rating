import { q } from "../db.js";
import { requireUser } from "../errors.js";
import { now } from "../util.js";

function buildSeasonMap(rows) {
  const ids = [...new Set(
    rows.map(r => { const m = r.code.match(/^(?:p:)?season_master_(\d+)$/); return m ? Number(m[1]) : null; })
        .filter(id => id !== null)
  )];
  if (!ids.length) return {};
  const seasons = q(`SELECT id, started_at, ends_at FROM seasons WHERE id IN (${ids.map(() => "?").join(",")})`)
    .all(...ids);
  return Object.fromEntries(seasons.map(s => [s.id, s]));
}

function enrichAch(r, seasonMap = {}) {
  const entry = { code: r.code, earnedAt: r.earned_at, seen: r.seen };
  const m = r.code.match(/^(?:p:)?season_master_(\d+)$/);
  if (m) {
    const season = seasonMap[Number(m[1])];
    if (season) { entry.seasonStartedAt = season.started_at; entry.seasonEndsAt = season.ends_at; }
  }
  return entry;
}

export default async function recordsRoutes(app) {
  // GET /achievements/me — мои ачивки (по дисциплине)
  app.get("/achievements/me", (req) => {
    const u = requireUser(req);
    const disc = u.active_discipline ?? 'pool';
    const isPyramid = disc === 'pyramid';
    const rows = isPyramid
      ? q(`SELECT code, earned_at, seen FROM achievements WHERE user_id = ? AND code LIKE 'p:%' ORDER BY earned_at DESC`).all(u.id)
      : q(`SELECT code, earned_at, seen FROM achievements WHERE user_id = ? AND code NOT LIKE 'p:%' ORDER BY earned_at DESC`).all(u.id);
    // Помечаем просмотренными только текущей дисциплины
    if (isPyramid) {
      q(`UPDATE achievements SET seen = 1 WHERE user_id = ? AND seen = 0 AND code LIKE 'p:%'`).run(u.id);
    } else {
      q(`UPDATE achievements SET seen = 1 WHERE user_id = ? AND seen = 0 AND code NOT LIKE 'p:%'`).run(u.id);
    }
    const seasonMap = buildSeasonMap(rows);
    return { achievements: rows.map(r => enrichAch(r, seasonMap)) };
  });

  // GET /achievements/:id — ачивки другого игрока (по дисциплине зрителя)
  app.get("/achievements/:id", (req) => {
    const u = requireUser(req);
    const disc = u.active_discipline ?? 'pool';
    const isPyramid = disc === 'pyramid';
    const id = Number(req.params.id) || 0;
    const rows = isPyramid
      ? q(`SELECT code, earned_at FROM achievements WHERE user_id = ? AND code LIKE 'p:%' ORDER BY earned_at DESC`).all(id)
      : q(`SELECT code, earned_at FROM achievements WHERE user_id = ? AND code NOT LIKE 'p:%' ORDER BY earned_at DESC`).all(id);
    const seasonMap = buildSeasonMap(rows);
    return { achievements: rows.map(r => enrichAch(r, seasonMap)) };
  });

  // GET /records — клубные рекорды
  app.get("/records", (req) => {
    const u = requireUser(req);
    const disc = u.active_discipline ?? 'pool';
    const isPyramid = disc === 'pyramid';
    const streakCol   = isPyramid ? 'best_streak_pyramid'  : 'best_streak';
    const peakEloCol  = isPyramid ? 'peak_elo_pyramid'     : 'peak_elo';
    const matchesCol  = isPyramid ? 'matches_count_pyramid': 'matches_count';
    const winsCol     = isPyramid ? 'wins_count_pyramid'   : 'wins_count';
    const eloCol      = isPyramid ? 'elo_pyramid'          : 'elo';

    const t = now();
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const weekDay = new Date().getDay();
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - ((weekDay + 6) % 7)); // понедельник
    weekStart.setHours(0, 0, 0, 0);

    // 🔥 Самая длинная серия побед
    const bestStreak = q(
      `SELECT id, name, ${streakCol} AS best_streak FROM users ORDER BY ${streakCol} DESC LIMIT 1`
    ).get();

    // 👑 Исторический пик рейтинга
    const peakElo = q(
      `SELECT id, name, ${peakEloCol} AS peak_elo FROM users ORDER BY ${peakEloCol} DESC LIMIT 1`
    ).get();

    // 💼 Главный ветеран
    const veteran = q(
      `SELECT id, name, ${matchesCol} AS matches_count FROM users ORDER BY ${matchesCol} DESC LIMIT 1`
    ).get();

    // 🤝 Самое частое противостояние
    const derby = q(
      `SELECT MIN(initiator_id, opponent_id) AS a, MAX(initiator_id, opponent_id) AS b, COUNT(*) AS c
       FROM matches WHERE status='confirmed' AND discipline=?
       GROUP BY a, b ORDER BY c DESC LIMIT 1`
    ).get(disc);
    let derbyRecord = null;
    if (derby) {
      const ua = q(`SELECT id, name FROM users WHERE id = ?`).get(derby.a);
      const ub = q(`SELECT id, name FROM users WHERE id = ?`).get(derby.b);
      if (ua && ub) derbyRecord = { playerA: { id: ua.id, name: ua.name }, playerB: { id: ub.id, name: ub.name }, count: derby.c };
    }

    // ⚡ Текущий месяц
    const monthMs = monthStart.getTime();

    const monthMost = q(
      `SELECT uid, COUNT(*) AS c FROM (
         SELECT initiator_id AS uid FROM matches WHERE status='confirmed' AND discipline=? AND resolved_at>=?
         UNION ALL
         SELECT opponent_id AS uid FROM matches WHERE status='confirmed' AND discipline=? AND resolved_at>=?
       ) GROUP BY uid ORDER BY c DESC LIMIT 1`
    ).get(disc, monthMs, disc, monthMs);
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
         FROM matches WHERE status='confirmed' AND discipline=? AND resolved_at>=?
         UNION ALL
         SELECT opponent_id AS uid,
           CASE WHEN winner_id = opponent_id THEN delta ELSE -delta END AS delta_val
         FROM matches WHERE status='confirmed' AND discipline=? AND resolved_at>=?
       ) GROUP BY uid ORDER BY total_gain DESC LIMIT 1`
    ).get(disc, monthMs, disc, monthMs);
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
         FROM matches WHERE status='confirmed' AND discipline=? AND resolved_at>=?
         UNION ALL
         SELECT opponent_id AS uid,
           CASE WHEN winner_id = opponent_id THEN delta ELSE -delta END AS delta_val
         FROM matches WHERE status='confirmed' AND discipline=? AND resolved_at>=?
       ) GROUP BY uid ORDER BY total_loss ASC LIMIT 1`
    ).get(disc, monthMs, disc, monthMs);
    let monthDonorPlayer = null;
    if (monthDonor && monthDonor.total_loss < 0) {
      const pu = q(`SELECT id, name FROM users WHERE id = ?`).get(monthDonor.uid);
      if (pu) monthDonorPlayer = { id: pu.id, name: pu.name, loss: monthDonor.total_loss };
    }

    // ⚔️ Охотник за головами месяца
    const monthHunter = q(
      `SELECT uid, COUNT(DISTINCT opp) AS uniq FROM (
         SELECT initiator_id AS uid, opponent_id AS opp FROM matches WHERE status='confirmed' AND discipline=? AND resolved_at>=?
         UNION ALL
         SELECT opponent_id AS uid, initiator_id AS opp FROM matches WHERE status='confirmed' AND discipline=? AND resolved_at>=?
       ) GROUP BY uid ORDER BY uniq DESC LIMIT 1`
    ).get(disc, monthMs, disc, monthMs);
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
         FROM matches WHERE status='confirmed' AND discipline=? AND resolved_at>=?
         UNION ALL
         SELECT opponent_id AS uid,
           CASE WHEN winner_id = opponent_id THEN delta ELSE -delta END AS delta_val
         FROM matches WHERE status='confirmed' AND discipline=? AND resolved_at>=?
       ) GROUP BY uid ORDER BY gain DESC LIMIT 1`
    ).get(disc, weekMs, disc, weekMs);
    let weekGainer = null;
    if (weekGain && weekGain.gain > 0) {
      const pu = q(`SELECT id, name FROM users WHERE id = ?`).get(weekGain.uid);
      if (pu) weekGainer = { id: pu.id, name: pu.name, gain: weekGain.gain };
    }

    const weekMarathon = q(
      `SELECT uid, COUNT(*) AS c FROM (
         SELECT initiator_id AS uid FROM matches WHERE status='confirmed' AND discipline=? AND resolved_at>=?
         UNION ALL
         SELECT opponent_id AS uid FROM matches WHERE status='confirmed' AND discipline=? AND resolved_at>=?
       ) GROUP BY uid ORDER BY c DESC LIMIT 1`
    ).get(disc, weekMs, disc, weekMs);
    let weekMarathonPlayer = null;
    if (weekMarathon) {
      const pu = q(`SELECT id, name FROM users WHERE id = ?`).get(weekMarathon.uid);
      if (pu) weekMarathonPlayer = { id: pu.id, name: pu.name, count: weekMarathon.c };
    }

    // 🦖 Непобедимый босс (winrate, мин 20 матчей)
    const boss = q(
      `SELECT id, name, ${matchesCol} AS matches_count, ${winsCol} AS wins_count,
              CAST(${winsCol} AS REAL) / ${matchesCol} AS wr
       FROM users WHERE ${matchesCol} >= 20
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
       WHERE m.status = 'confirmed' AND m.discipline = ?
         AND ((m.winner_id = m.initiator_id AND m.initiator_elo_before < m.opponent_elo_before)
           OR (m.winner_id = m.opponent_id AND m.opponent_elo_before < m.initiator_elo_before))
       ORDER BY diff DESC LIMIT 1`
    ).get(disc);
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
