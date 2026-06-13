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
  const icon = ACH_META[code]?.icon;
  const pts = ACH_META[code]?.pts ?? 0;
  const meta = t?.ach?.meta;

  if (meta && meta[code]) {
    return { icon: icon ?? "🏅", label: meta[code].label, desc: meta[code].desc, pts };
  }

  if (/^season_master_(\d+)$/.test(code)) {
    const seasonId = code.match(/\d+$/)[0];
    let label = meta ? `${meta.season_master?.label ?? "Season Master"} #${seasonId}` : `Хозяин сезона #${seasonId}`;
    let desc = meta
      ? `${meta.season_master?.desc ?? "Top 3"} #${seasonId}`
      : `Топ-3 по итогам сезона #${seasonId}`;
    if (extra.seasonStartedAt && extra.seasonEndsAt) {
      const locale = t ? (LOCALES[t._lang] ?? "ru-RU") : "ru-RU";
      const fmt = (ts) => new Date(ts).toLocaleDateString(locale, { day: "numeric", month: "short", year: "2-digit" });
      desc += ` · ${fmt(extra.seasonStartedAt)} — ${fmt(extra.seasonEndsAt)}`;
    }
    return { icon: "🏆", label, desc, pts: 100 };
  }

  // Russian fallback
  const RU_META = {
    season_master: { label: "Хозяин сезона",       desc: "Топ-3 по итогам сезона" },
    calibration:   { label: "Калибровка пройдена", desc: "Сыграть первые 10 матчей" },
    elite:         { label: "Элита",               desc: "Войти в топ-3 клуба по рейтингу" },
    new_peak_1100: { label: "Новый пик · 1100",    desc: "Достичь рейтинга 1100" },
    new_peak_1200: { label: "Новый пик · 1200",    desc: "Достичь рейтинга 1200" },
    new_peak_1300: { label: "Новый пик · 1300",    desc: "Достичь рейтинга 1300" },
    new_peak_1400: { label: "Новый пик · 1400",    desc: "Достичь рейтинга 1400" },
    new_peak_1500: { label: "Новый пик · 1500",    desc: "Достичь рейтинга 1500" },
    on_fire_5:     { label: "На кураже",           desc: "5 побед подряд" },
    inferno_7:     { label: "В огне",              desc: "7 побед подряд" },
    immortal_10:   { label: "Бессмертный",         desc: "10 побед подряд" },
    groundhog:     { label: "День сурка",          desc: "Победить одного и того же 10 раз за день" },
    rollercoaster: { label: "Американские горки",  desc: "В/П/В/П/В/П — 6 матчей подряд" },
    own_atmo:      { label: "Своя атмосфера",      desc: "10 матчей подряд с одним соперником" },
    headhunter:    { label: "Охотник за скальпами", desc: "10 разных соперников за неделю" },
    extrovert:     { label: "Экстраверт",          desc: "Сыграть с 20 уникальными игроками" },
    veteran_20:    { label: "Завсегдатай · 20",    desc: "20 матчей сыграно" },
    veteran_50:    { label: "Завсегдатай · 50",    desc: "50 матчей сыграно" },
    veteran_100:   { label: "Завсегдатай · 100",   desc: "100 матчей сыграно" },
    veteran_200:   { label: "Завсегдатай · 200",   desc: "200 матчей сыграно" },
    veteran_500:   { label: "Легенда · 500",       desc: "500 матчей сыграно" },
    veteran_1000:  { label: "Легенда · 1000",      desc: "1000 матчей сыграно" },
    bad_day:       { label: "Не твой день",        desc: "6 поражений подряд" },
    main_donor:    { label: "Главный спонсор",     desc: "Проиграть одному 4 раза за день" },
    tried:         { label: "Ты пытался",          desc: "Проиграть игроку из топ-3" },
    phoenix:       { label: "Феникс",              desc: "Выиграть после 4+ поражений подряд" },
  };
  if (RU_META[code]) return { icon: icon ?? "🏅", ...RU_META[code], pts };
  return { icon: "❓", label: code, desc: "", pts: 0 };
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
          <span className="ach-pts">{locked ? "" : "✓ "}{meta.pts} {t?.ach?.pts ?? "очк."}</span>
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

  const earned = new Map(achs.map(a => [a.code, a.earnedAt]));
  const allCodes = Object.keys(ACH_META);
  const extraEarned = achs.filter(a => !ACH_META[a.code] && /^season_master_\d+$/.test(a.code)).map(a => a.code);
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
                const a = achs.find(x => x.code === code);
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
