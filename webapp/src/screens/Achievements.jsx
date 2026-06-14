import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useApp } from "../store.jsx";
import { Spinner, Empty } from "../components.jsx";
import { LOCALES } from "../i18n.js";

export const ACH_META = {
  season_master: { icon: "🏆", pts: 100 },
  calibration:   { icon: "🎯", pts: 5  },
  elite:         { icon: "👑", pts: 50 },
  new_peak_1100: { icon: "📈", pts: 15 },
  new_peak_1200: { icon: "📈", pts: 20 },
  new_peak_1300: { icon: "📈", pts: 30 },
  new_peak_1400: { icon: "📈", pts: 40 },
  new_peak_1500: { icon: "📈", pts: 60 },
  on_fire_5:     { icon: "🔥", pts: 10 },
  inferno_7:     { icon: "🔥", pts: 20 },
  immortal_10:   { icon: "⚡", pts: 40 },
  groundhog:     { icon: "😤", pts: 15 },
  rollercoaster: { icon: "🎢", pts: 10 },
  own_atmo:      { icon: "🫂", pts: 10 },
  headhunter:    { icon: "🎯", pts: 20 },
  extrovert:     { icon: "🌍", pts: 25 },
  veteran_20:    { icon: "🏅", pts: 5  },
  veteran_50:    { icon: "🏅", pts: 10 },
  veteran_100:   { icon: "🥇", pts: 20 },
  veteran_200:   { icon: "🥇", pts: 30 },
  veteran_500:   { icon: "💎", pts: 50 },
  veteran_1000:  { icon: "👑", pts: 100},
  bad_day:       { icon: "😤", pts: 5  },
  main_donor:    { icon: "💸", pts: 5  },
  tried:         { icon: "🙏", pts: 5  },
  phoenix:       { icon: "🦅", pts: 15 },
};

export function getAchMeta(code, t, extra = {}) {
  // pyramid-discipline achievements have a 'p:' prefix — strip it for display lookup
  const baseCode = code.startsWith('p:') ? code.slice(2) : code;
  const icon = ACH_META[baseCode]?.icon;
  const pts = ACH_META[baseCode]?.pts ?? 0;
  const meta = t?.ach?.meta;

  if (meta && meta[baseCode]) {
    return { icon: icon ?? "🏅", label: meta[baseCode].label, desc: meta[baseCode].desc, pts };
  }

  if (/^season_master_(\d+)$/.test(baseCode)) {
    const seasonId = baseCode.match(/\d+$/)[0];
    let label = meta ? `${meta.season_master?.label ?? "Season Master"} #${seasonId}` : `Season Master #${seasonId}`;
    let desc = meta
      ? `${meta.season_master?.desc ?? "Top 3"} #${seasonId}`
      : `Top 3 #${seasonId}`;
    if (extra.seasonStartedAt && extra.seasonEndsAt) {
      const locale = t ? (LOCALES[t._lang] ?? "ru-RU") : "ru-RU";
      const fmt = (ts) => new Date(ts).toLocaleDateString(locale, { day: "numeric", month: "short", year: "2-digit" });
      desc += ` · ${fmt(extra.seasonStartedAt)} — ${fmt(extra.seasonEndsAt)}`;
    }
    return { icon: "🏆", label, desc, pts: 100 };
  }

  return { icon: "❓", label: baseCode, desc: "", pts: 0 };
}

function AchCard({ code, earnedAt, locked, seasonStartedAt, seasonEndsAt, t, lang }) {
  const meta = getAchMeta(code, t, { seasonStartedAt, seasonEndsAt });
  const locale = LOCALES[lang] ?? "ru-RU";
  return (
    <div className={`ach-card${locked ? " ach-locked" : ""}`}>
      <div className="ach-icon">{meta.icon}</div>
      <div className="ach-text">
        <div className="ach-label">{meta.label}</div>
        <div className="ach-desc">{meta.desc}</div>
        <div className="ach-pts-row">
          <span className="ach-pts">{locked ? "" : "✓ "}{meta.pts} {t.ach.pts}</span>
          {earnedAt && !locked && (
            <span className="ach-date">
              {new Date(earnedAt).toLocaleDateString(locale, { day: "numeric", month: "short" })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function Achievements({ playerId }) {
  const { t, lang, toastError } = useApp();

  const [achs, setAchs] = useState(null);

  const url = playerId ? `/achievements/${playerId}` : "/achievements/me";
  useEffect(() => {
    api.get(url).then(r => setAchs(r.achievements)).catch(toastError);
  }, [url, toastError]);

  if (!achs) return <Spinner />;

  // Ачивки дисциплины «пирамида» приходят с префиксом 'p:' — снимаем его,
  // чтобы сопоставлять с ключами ACH_META (они без префикса).
  const strip = (c) => (c.startsWith("p:") ? c.slice(2) : c);
  const earned = new Map(achs.map(a => [strip(a.code), a.earnedAt]));
  const allCodes = Object.keys(ACH_META);
  const extraEarned = achs.map(a => strip(a.code)).filter(c => !ACH_META[c] && /^season_master_\d+$/.test(c));
  const earnedList = [...allCodes.filter(c => earned.has(c)), ...extraEarned];
  const lockedList = allCodes.filter(c => !earned.has(c));

  const totalPts = earnedList.reduce((sum, c) => sum + (getAchMeta(c, t)?.pts ?? 0), 0);
  const maxPts   = allCodes.reduce((sum, c) => sum + (ACH_META[c]?.pts ?? 0), 0);

  const ta = t.ach;

  return (
    <div>
      {earnedList.length > 0 && (
        <div className="ach-score-card">
          <div className="ach-score-icon">🏆</div>
          <div className="ach-score-info">
            <div className="ach-score-val">{totalPts} <span>{ta.ptsTotal}</span></div>
            <div className="ach-score-sub">{earnedList.length} {ta.of} {allCodes.length} {ta.achievementsWord} · {ta.max} {maxPts}</div>
          </div>
        </div>
      )}
      {earnedList.length === 0 && (
        <div className="hint" style={{ paddingBottom: 8 }}>{ta.empty}</div>
      )}
      <div className="card">
        {earnedList.length > 0 && (
          <>
            <div className="s-sect" style={{ color: "#FFD60A" }}>{ta.earnedSection} {earnedList.length}</div>
            <div className="ach-grid">
              {earnedList.map(code => {
                const a = achs.find(x => strip(x.code) === code);
                return <AchCard key={code} code={code} earnedAt={earned.get(code)} seasonStartedAt={a?.seasonStartedAt} seasonEndsAt={a?.seasonEndsAt} t={t} lang={lang} />;
              })}
            </div>
          </>
        )}
        {lockedList.length > 0 && (
          <>
            <div className="s-sect">{ta.lockedSection} {lockedList.length}</div>
            <div className="ach-grid">
              {lockedList.map(code => (
                <AchCard key={code} code={code} locked t={t} lang={lang} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
