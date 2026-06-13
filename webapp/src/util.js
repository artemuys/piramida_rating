import { useEffect, useState } from "react";
import { LOCALES } from "./i18n.js";

const PALETTE = ["#0A84FF", "#30D158", "#f59e0b", "#BF5AF2", "#FF375F", "#64D2FF", "#FF9F0A", "#FFD60A"];

export function avaColor(id) {
  return PALETTE[Math.abs(Number(id) || 0) % PALETTE.length];
}

export function initials(name) {
  return String(name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export function fmtDate(ts, lang) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString(LOCALES[lang] || "ru-RU", { day: "numeric", month: "short" });
}

export function fmtDateTime(ts, lang) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(LOCALES[lang] || "ru-RU", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function fmtDayLabel(dayStr, t, lang) {
  const today = new Date();
  const local = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (dayStr === local) return t.apps.today;
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tm = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  if (dayStr === tm) return t.apps.tomorrow;
  return new Date(`${dayStr}T12:00:00`).toLocaleDateString(LOCALES[lang] || "ru-RU", { day: "numeric", month: "short" });
}

/** Тикающее "сейчас" для таймеров (учитывает рассинхрон часов через skew) */
export function useNow(intervalMs = 500) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function fmtCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function winPct(matches, wins) {
  return matches > 0 ? Math.round((wins / matches) * 100) : 0;
}

export const RANKS = [
  { name: "bronze",   label: "Бронза",  emoji: "🥉", min: 0,    color: "#CD7F32", gradient: "linear-gradient(135deg,#5C3A1E,#8B5E3C)", next: 1100 },
  { name: "silver",   label: "Серебро", emoji: "🥈", min: 1100, color: "#C0C0C0", gradient: "linear-gradient(135deg,#3a3a3c,#636366)",   next: 1200 },
  { name: "platinum", label: "Платина", emoji: "🔷", min: 1200, color: "#A8D8EA", gradient: "linear-gradient(135deg,#1a3a4a,#2a6a8a)",   next: 1300 },
  { name: "emerald",  label: "Изумруд", emoji: "💚", min: 1300, color: "#50C878", gradient: "linear-gradient(135deg,#0d3320,#1a6040)",   next: 1400 },
  { name: "diamond",  label: "Алмаз",   emoji: "💎", min: 1400, color: "#7DF9FF", gradient: "linear-gradient(135deg,#0a2a3a,#1a5a7a)",   next: 1500 },
  { name: "master",   label: "Мастер",  emoji: "👑", min: 1500, color: "#FFD700", gradient: "linear-gradient(135deg,#3a2a00,#7a5500)",   next: null },
];

export function rankOf(elo) {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (elo >= RANKS[i].min) return RANKS[i];
  }
  return RANKS[0];
}

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

export function xpProgress(xp) {
  const level = levelFromXp(xp);
  if (level >= 100) return { level: 100, current: xp, needed: xpToReachLevel(100), pct: 100 };
  const base = xpToReachLevel(level);
  const next = xpToReachLevel(level + 1);
  const current = xp - base;
  const needed = next - base;
  const pct = Math.min(100, Math.round((current / needed) * 100));
  return { level, current, needed, pct };
}
