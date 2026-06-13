import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useApp } from "../store.jsx";
import { Spinner, Empty } from "../components.jsx";

export const ACH_META = {
  calibration:   { icon: "🎯", label: "Калибровка пройдена",     desc: "Сыграть первые 10 матчей" },
  elite:         { icon: "👑", label: "Элита",                   desc: "Войти в топ-3 клуба по рейтингу" },
  new_peak_1100: { icon: "📈", label: "Новый пик · 1100",        desc: "Достичь рейтинга 1100" },
  new_peak_1200: { icon: "📈", label: "Новый пик · 1200",        desc: "Достичь рейтинга 1200" },
  new_peak_1300: { icon: "📈", label: "Новый пик · 1300",        desc: "Достичь рейтинга 1300" },
  new_peak_1400: { icon: "📈", label: "Новый пик · 1400",        desc: "Достичь рейтинга 1400" },
  new_peak_1500: { icon: "📈", label: "Новый пик · 1500",        desc: "Достичь рейтинга 1500" },
  on_fire_5:     { icon: "🔥", label: "На кураже",               desc: "5 побед подряд" },
  inferno_7:     { icon: "🔥", label: "В огне",                  desc: "7 побед подряд" },
  immortal_10:   { icon: "⚡", label: "Бессмертный",             desc: "10 побед подряд" },
  groundhog:     { icon: "😤", label: "День сурка",              desc: "Победить одного и того же 10 раз за день" },
  rollercoaster: { icon: "🎢", label: "Американские горки",      desc: "В/П/В/П/В/П — 6 матчей подряд" },
  own_atmo:      { icon: "🫂", label: "Своя атмосфера",          desc: "10 матчей подряд с одним соперником" },
  headhunter:    { icon: "🎯", label: "Охотник за скальпами",    desc: "10 разных соперников за неделю" },
  extrovert:     { icon: "🌍", label: "Экстраверт",              desc: "Сыграть с 20 уникальными игроками" },
  veteran_20:    { icon: "🏅", label: "Завсегдатай · 20",        desc: "20 матчей сыграно" },
  veteran_50:    { icon: "🏅", label: "Завсегдатай · 50",        desc: "50 матчей сыграно" },
  veteran_100:   { icon: "🥇", label: "Завсегдатай · 100",       desc: "100 матчей сыграно" },
  veteran_200:   { icon: "🥇", label: "Завсегдатай · 200",       desc: "200 матчей сыграно" },
  veteran_500:   { icon: "💎", label: "Легенда · 500",           desc: "500 матчей сыграно" },
  veteran_1000:  { icon: "👑", label: "Легенда · 1000",          desc: "1000 матчей сыграно" },
  bad_day:       { icon: "😤", label: "Не твой день",            desc: "6 поражений подряд" },
  main_donor:    { icon: "💸", label: "Главный спонсор",         desc: "Проиграть одному 4 раза за день" },
  tried:         { icon: "🙏", label: "Ты пытался",              desc: "Проиграть игроку из топ-3" },
  phoenix:       { icon: "🦅", label: "Феникс",                  desc: "Выиграть после 4+ поражений подряд" },
};

function AchCard({ code, earnedAt, locked }) {
  const meta = ACH_META[code] || { icon: "❓", label: code, desc: "" };
  return (
    <div className={`ach-card${locked ? " ach-locked" : ""}`}>
      <div className="ach-icon">{meta.icon}</div>
      <div className="ach-text">
        <div className="ach-label">{meta.label}</div>
        <div className="ach-desc">{meta.desc}</div>
        {earnedAt && !locked && (
          <div className="ach-date">
            {new Date(earnedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
          </div>
        )}
      </div>
      {!locked && <div className="ach-check">✓</div>}
    </div>
  );
}

export function Achievements({ playerId }) {
  const { toastError } = useApp();
  const [achs, setAchs] = useState(null);

  const url = playerId ? `/achievements/${playerId}` : "/achievements/me";
  useEffect(() => {
    api.get(url).then(r => setAchs(r.achievements)).catch(toastError);
  }, [url, toastError]);

  if (!achs) return <Spinner />;

  const earned = new Map(achs.map(a => [a.code, a.earnedAt]));
  const allCodes = Object.keys(ACH_META);
  const earnedList = allCodes.filter(c => earned.has(c));
  const lockedList = allCodes.filter(c => !earned.has(c));

  return (
    <div>
      {earnedList.length === 0 && lockedList.length > 0 && (
        <div className="hint" style={{ paddingBottom: 8 }}>Пока нет достижений — всё впереди!</div>
      )}
      <div className="card">
        {earnedList.length > 0 && (
          <>
            <div className="s-sect" style={{ color: "#FFD60A" }}>🏆 Получено · {earnedList.length}</div>
            <div className="ach-grid">
              {earnedList.map(code => (
                <AchCard key={code} code={code} earnedAt={earned.get(code)} />
              ))}
            </div>
          </>
        )}
        {lockedList.length > 0 && (
          <>
            <div className="s-sect">🔒 Не получено · {lockedList.length}</div>
            <div className="ach-grid">
              {lockedList.map(code => (
                <AchCard key={code} code={code} locked />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
