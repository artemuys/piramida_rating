import { config } from "./config.js";

export const now = () => Date.now();

/** YYYY-MM-DD в локальном времени сервера (часовой пояс клуба) */
export function dayStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Очистка пользовательских строк: управляющие символы, повторные пробелы */
export function clean(s, maxLen) {
  return String(s ?? "")
    .replace(/\p{Cc}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

export function eloDelta(ratingWinner, ratingLoser) {
  const expected = 1 / (1 + Math.pow(10, (ratingLoser - ratingWinner) / 400));
  return Math.max(1, Math.round(config.ELO_K * (1 - expected)));
}

/** Публичная карточка игрока (без контакта — он отдаётся отдельно по правам) */
export function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    elo: u.elo,
    role: u.role,
    matchesCount: u.matches_count,
    winsCount: u.wins_count,
  };
}

export function serializeMatch(m, viewerId) {
  const iAmInitiator = m.initiator_id === viewerId;
  const my = iAmInitiator
    ? { claim: m.initiator_claim, eloBefore: m.initiator_elo_before, eloAfter: m.initiator_elo_after }
    : { claim: m.opponent_claim, eloBefore: m.opponent_elo_before, eloAfter: m.opponent_elo_after };
  const their = iAmInitiator
    ? { claim: m.opponent_claim, eloBefore: m.opponent_elo_before, eloAfter: m.opponent_elo_after }
    : { claim: m.initiator_claim, eloBefore: m.initiator_elo_before, eloAfter: m.initiator_elo_after };
  return {
    id: m.id,
    status: m.status,
    iAmInitiator,
    my,
    their,
    delta: m.delta,
    iWon: m.status === "confirmed" ? m.winner_id === viewerId : null,
    expiresAt: m.expires_at,
    createdAt: m.created_at,
    resolvedAt: m.resolved_at,
  };
}
