import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useApp } from "../store.jsx";
import { Spinner, Empty } from "../components.jsx";

export const ACH_META = {
  calibration:   { icon: "🎯", label: "Калибровка пройдена",     desc: "Сыграть первые 10 матчей",                    pts: 5  },
  elite:         { icon: "👑", label: "Элита",                   desc: "Войти в топ-3 клуба по рейтингу",             pts: 50 },
  new_peak_1100: { icon: "📈", label: "Новый пик · 1100",        desc: "Достичь рейтинга 1100",                       pts: 15 },
  new_peak_1200: { icon: "📈", label: "Новый пик · 1200",        desc: "Достичь рейтинга 1200",                       pts: 20 },
  new_peak_1300: { icon: "📈", label: "Новый пик · 1300",        desc: "Достичь рейтинга 1300",                       pts: 30 },
  new_peak_1400: { icon: "📈", label: "Новый пик · 1400",        desc: "Достичь рейтинга 1400",                       pts: 40 },
  new_peak_1500: { icon: "📈", label: "Новый пик · 1500",        desc: "Достичь рейтинга 1500",                       pts: 60 },
  on_fire_5:     { icon: "🔥", label: "На кураже",               desc: "5 побед подряд",                              pts: 10 },
  inferno_7:     { icon: "🔥", label: "В огне",                  desc: "7 побед подряд",                              pts: 20 },
  immortal_10:   { icon: "⚡", label: "Бессмертный",             desc: "10 побед подряд",                             pts: 40 },
  groundhog:     { icon: "😤", label: "День сурка",              desc: "Победить одного и того же 10 раз за день",    pts: 15 },
  rollercoaster: { icon: "🎢", label: "Американские горки",      desc: "В/П/В/П/В/П — 6 матчей подряд",              pts: 10 },
  own_atmo:      { icon: "🫂", label: "Своя атмосфера",          desc: "10 матчей подряд с одним соперником",         pts: 10 },
  headhunter:    { icon: "🎯", label: "Охотник за скальпами",    desc: "10 разных соперников за неделю",              pts: 20 },
  extrovert:     { icon: "🌍", label: "Экстраверт",              desc: "Сыграть с 20 уникальными игроками",           pts: 25 },
  veteran_20:    { icon: "🏅", label: "Завсегдатай · 20",        desc: "20 матчей сыграно",                           pts: 5  },
  veteran_50:    { icon: "🏅", label: "Завсегдатай · 50",        desc: "50 матчей сыграно",                           pts: 10 },
  veteran_100:   { icon: "🥇", label: "Завсегдатай · 100",       desc: "100 матчей сыграно",                          pts: 20 },
  veteran_200:   { icon: "🥇", label: "Завсегдатай · 200",       desc: "200 матчей сыграно",                          pts: 30 },
  veteran_500:   { icon: "💎", label: "Легенда · 500",           desc: "500 матчей сыграно",                          pts: 50 },
  veteran_1000:  { icon: "👑", label: "Легенда · 1000",          desc: "1000 матчей сыграно",                         pts: 100},
  bad_day:       { icon: "😤", label: "Не твой день",            desc: "6 поражений подряд",                          pts: 5  },
  main_donor:    { icon: "💸", label: "Главный спонсор",         desc: "Проиграть одному 4 раза за день",             pts: 5  },
  tried:         { icon: "🙏", label: "Ты пытался",              desc: "Проиграть игроку из топ-3",                   pts: 5  },
  phoenix:       { icon: "🦅", label: "Феникс",                  desc: "Выиграть после 4+ поражений подряд",          pts: 15 },
};

function AchCard({ code, earnedAt, locked }) {
  const meta = ACH_META[code] || { icon: "❓", label: code, desc: "", pts: 0 };
  return (
    <div className={`ach-card${locked ? " ach-locked" : ""}`}>
      <div className="ach-icon">{meta.icon}</div>
      <div className="ach-text">
        <div className="ach-label">{meta.label}</div>
        <div className="ach-desc">{meta.desc}</div>
        <div className="ach-pts-row">
          <span className="ach-pts">{locked ? "" : "✓ "}{meta.pts} очк.</span>
          {earnedAt && !locked && (
            <span className="ach-date">
              {new Date(earnedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
            </span>
          )}
        </div>
      </div>
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

  const totalPts = earnedList.reduce((sum, c) => sum + (ACH_META[c]?.pts ?? 0), 0);
  const maxPts   = allCodes.reduce((sum, c) => sum + (ACH_META[c]?.pts ?? 0), 0);

  return (
    <div>
      {earnedList.length > 0 && (
        <div className="ach-score-card">
          <div className="ach-score-icon">🏆</div>
          <div className="ach-score-info">
            <div className="ach-score-val">{totalPts} <span>очков</span></div>
            <div className="ach-score-sub">{earnedList.length} из {allCodes.length} достижений · макс {maxPts}</div>
          </div>
        </div>
      )}
      {earnedList.length === 0 && (
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
