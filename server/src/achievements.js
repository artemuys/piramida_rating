import { q } from "./db.js";
import { now } from "./util.js";

// ── Ранги ────────────────────────────────────────────────────
export const RANKS = [
  { name: "bronze",   label: "Бронза",  emoji: "🥉", min: 0,    color: "#CD7F32", next: 1100 },
  { name: "silver",   label: "Серебро", emoji: "🥈", min: 1100, color: "#A8A8A8", next: 1200 },
  { name: "platinum", label: "Платина", emoji: "🔷", min: 1200, color: "#A8D8EA", next: 1300 },
  { name: "emerald",  label: "Изумруд", emoji: "💚", min: 1300, color: "#50C878", next: 1400 },
  { name: "diamond",  label: "Алмаз",   emoji: "💎", min: 1400, color: "#7DF9FF", next: 1500 },
  { name: "master",   label: "Мастер",  emoji: "👑", min: 1500, color: "#FFD700", next: null },
];

export function rankOf(elo) {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (elo >= RANKS[i].min) return RANKS[i];
  }
  return RANKS[0];
}

// ── Уровень / XP ─────────────────────────────────────────────
// Level 2 ≈ 40 XP (2 wins or 4 losses). Level 100 ≈ 15 000 XP.
export function xpToReachLevel(n) {
  if (n <= 1) return 0;
  const k = n - 1;
  return Math.round(1.14 * k * k + 39 * k);
}

export function levelFromXp(xp) {
  for (let n = 100; n >= 2; n--) {
    if (xp >= xpToReachLevel(n)) return n;
  }
  return 1;
}

// ── Выдать ачивку (идемпотентно) ────────────────────────────
export function grantAchievement(userId, code) {
  const existing = q(`SELECT 1 FROM achievements WHERE user_id = ? AND code = ?`).get(userId, code);
  if (existing) return false;
  q(`INSERT INTO achievements (user_id, code, earned_at, seen) VALUES (?, ?, ?, 0)`).run(userId, code, now());
  return true;
}

// ── Добавить событие в ленту ─────────────────────────────────
export function addFeedEvent(type, actorId, targetId, data = {}) {
  q(`INSERT INTO feed (type, actor_id, target_id, data, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(type, actorId ?? null, targetId ?? null, JSON.stringify(data), now());
}

// ── Ачивки после матча ───────────────────────────────────────
export function checkMatchAchievements(winnerId, loserId, matchId) {
  const t = now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekAgo = t - 7 * 24 * 3600 * 1000;

  function tryGrant(userId, code) {
    if (!grantAchievement(userId, code)) return;
    const u = q(`SELECT name FROM users WHERE id = ?`).get(userId);
    addFeedEvent("achievement", userId, null, { code, name: u?.name ?? "" });
  }

  for (const [userId, won] of [[winnerId, true], [loserId, false]]) {
    const u = q(`SELECT * FROM users WHERE id = ?`).get(userId);
    if (!u) continue;
    const oppId = won ? loserId : winnerId;

    // Калибровка
    if (u.matches_count === 10) tryGrant(userId, "calibration");

    // Завсегдатай
    for (const n of [20, 50, 100, 200, 500, 1000]) {
      if (u.matches_count === n) tryGrant(userId, `veteran_${n}`);
    }

    // Новый пик
    if (won) {
      for (const thr of [1100, 1200, 1300, 1400, 1500]) {
        if (u.elo >= thr) tryGrant(userId, `new_peak_${thr}`);
      }
    }

    // Стрики
    if (won) {
      if (u.streak === 5)  tryGrant(userId, "on_fire_5");
      if (u.streak === 7)  tryGrant(userId, "inferno_7");
      if (u.streak === 10) tryGrant(userId, "immortal_10");
    }

    // Плохой день
    if (!won && u.streak === -6) tryGrant(userId, "bad_day");

    // День сурка: 10 побед над одним за день
    if (won) {
      const c = q(
        `SELECT COUNT(*) AS c FROM matches WHERE status='confirmed' AND winner_id=? AND resolved_at>=?
           AND ((initiator_id=? AND opponent_id=?) OR (initiator_id=? AND opponent_id=?))`
      ).get(userId, todayStart.getTime(), userId, oppId, oppId, userId).c;
      if (c === 10) tryGrant(userId, "groundhog");
    }

    // Главный спонсор: проиграть одному 4 раза подряд за день
    if (!won) {
      const c = q(
        `SELECT COUNT(*) AS c FROM matches WHERE status='confirmed' AND winner_id=? AND resolved_at>=?
           AND ((initiator_id=? AND opponent_id=?) OR (initiator_id=? AND opponent_id=?))`
      ).get(oppId, todayStart.getTime(), oppId, userId, userId, oppId).c;
      if (c === 4) tryGrant(userId, "main_donor");
    }

    // Феникс
    if (won) {
      const prev = q(
        `SELECT winner_id FROM matches WHERE status='confirmed' AND id!=?
           AND (initiator_id=? OR opponent_id=?) ORDER BY resolved_at DESC LIMIT 4`
      ).all(matchId, userId, userId);
      if (prev.length >= 4 && prev.every(r => r.winner_id !== userId)) {
        tryGrant(userId, "phoenix");
      }
    }

    // Ты пытался
    if (!won) {
      const oppElo = q(`SELECT elo FROM users WHERE id=?`).get(oppId)?.elo ?? 0;
      const above = q(`SELECT COUNT(*) AS c FROM users WHERE elo > ?`).get(oppElo).c;
      if (above < 3) tryGrant(userId, "tried");
    }

    // Экстраверт: 20 уникальных
    const uniqAll = q(
      `SELECT COUNT(DISTINCT CASE WHEN initiator_id=? THEN opponent_id ELSE initiator_id END) AS c
       FROM matches WHERE status='confirmed' AND (initiator_id=? OR opponent_id=?)`
    ).get(userId, userId, userId).c;
    if (uniqAll >= 20) tryGrant(userId, "extrovert");

    // Охотник за скальпами: 10 разных за неделю
    const uniqWeek = q(
      `SELECT COUNT(DISTINCT CASE WHEN initiator_id=? THEN opponent_id ELSE initiator_id END) AS c
       FROM matches WHERE status='confirmed' AND (initiator_id=? OR opponent_id=?) AND resolved_at>=?`
    ).get(userId, userId, userId, weekAgo).c;
    if (uniqWeek >= 10) tryGrant(userId, "headhunter");

    // Американские горки
    const last6 = q(
      `SELECT winner_id FROM matches WHERE status='confirmed' AND (initiator_id=? OR opponent_id=?)
       ORDER BY resolved_at DESC LIMIT 6`
    ).all(userId, userId);
    if (last6.length >= 6) {
      let alt = true;
      for (let i = 0; i < 5; i++) {
        if ((last6[i].winner_id === userId) === (last6[i + 1].winner_id === userId)) { alt = false; break; }
      }
      if (alt) tryGrant(userId, "rollercoaster");
    }

    // Своя атмосфера: 10 подряд с одним
    const last10 = q(
      `SELECT initiator_id, opponent_id FROM matches WHERE status='confirmed' AND (initiator_id=? OR opponent_id=?)
       ORDER BY resolved_at DESC LIMIT 10`
    ).all(userId, userId);
    if (last10.length >= 10) {
      const opp0 = last10[0].initiator_id === userId ? last10[0].opponent_id : last10[0].initiator_id;
      if (last10.every(m => (m.initiator_id === userId ? m.opponent_id : m.initiator_id) === opp0)) {
        tryGrant(userId, "own_atmo");
      }
    }
  }

  refreshElite();
}

export function refreshElite() {
  const top3 = q(`SELECT id FROM users ORDER BY elo DESC LIMIT 3`).all();
  const ids = top3.map(u => u.id);
  if (!ids.length) return;
  q(`DELETE FROM achievements WHERE code='elite' AND user_id NOT IN (${ids.map(() => "?").join(",")})`)
    .run(...ids);
  for (const id of ids) grantAchievement(id, "elite");
}
