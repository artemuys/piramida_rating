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
