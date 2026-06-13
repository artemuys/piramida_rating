import { Component, useEffect, useRef, useState } from "react";
import { useApp } from "./store.jsx";
import { avaColor, initials, winPct, rankOf, xpProgress } from "./util.js";

export function Ava({ id, name, size = 38 }) {
  const color = avaColor(id);
  return (
    <div
      className="ava"
      style={{ background: color + "28", color, width: size, height: size, fontSize: size * 0.32 }}
    >
      {initials(name)}
    </div>
  );
}

export function Crown({ role }) {
  if (role !== "admin") return null;
  return <span title="admin" style={{ marginLeft: 4 }}>👑</span>;
}

export function Stats({ elo, place, matches, wins, t }) {
  return (
    <div className="stats-row">
      <div className="stat"><div className="stat-val">{elo}</div><div className="stat-lbl">{t.elo}</div></div>
      <div className="stat"><div className="stat-val">#{place}</div><div className="stat-lbl">{t.place}</div></div>
      <div className="stat"><div className="stat-val">{matches}</div><div className="stat-lbl">{t.matches}</div></div>
      <div className="stat"><div className="stat-val">{winPct(matches, wins)}%</div><div className="stat-lbl">{t.wins}</div></div>
    </div>
  );
}

export function RankBadge({ elo, size = "md" }) {
  const rank = rankOf(elo);
  const sizes = { sm: { font: 11, px: "3px 8px" }, md: { font: 13, px: "4px 12px" }, lg: { font: 16, px: "7px 16px" } };
  const s = sizes[size] || sizes.md;
  return (
    <span
      className="rank-badge"
      style={{
        background: rank.gradient,
        color: rank.color,
        fontSize: s.font,
        padding: s.px,
        border: `1px solid ${rank.color}33`,
      }}
    >
      {rank.emoji} {rank.label}
    </span>
  );
}

export function LevelBar({ xp, style }) {
  const prog = xpProgress(xp ?? 0);
  return (
    <div className="level-bar-wrap" style={style}>
      <div className="level-bar-row">
        <span className="level-bar-lbl">Ур. <strong>{prog.level}</strong></span>
        <span className="level-bar-xp">{prog.current} / {prog.needed} XP</span>
      </div>
      <div className="level-bar-track">
        <div className="level-bar-fill" style={{ width: `${prog.pct}%` }} />
      </div>
    </div>
  );
}

export function StreakBadge({ streak }) {
  if (!streak || streak === 0) return null;
  const wins = streak > 0;
  const count = Math.abs(streak);
  if (count < 2) return null;
  return (
    <span className={`streak-badge${wins ? " streak-win" : " streak-lose"}`}>
      {wins ? "🔥" : "❄️"} {count}
    </span>
  );
}

export function StreakProgress({ streak }) {
  const GOAL = 5;
  const isWin = streak > 0;
  const isLose = streak < 0;
  const count = Math.abs(streak ?? 0);
  const filled = Math.min(count, GOAL);
  const label = isWin
    ? (count >= GOAL ? `🔥 Серия ${count}!` : `🔥 Серия побед: ${count} / ${GOAL}`)
    : isLose
    ? (count >= GOAL ? `❄️ Проигрышная серия: ${count}` : `❄️ Поражений подряд: ${count} / ${GOAL}`)
    : "Серия: 0";

  return (
    <div className="streak-progress-wrap">
      <div className="streak-progress-row">
        {Array.from({ length: GOAL }).map((_, i) => (
          <div
            key={i}
            className={`streak-progress-dot ${i < filled ? (isWin ? "sp-win" : "sp-lose") : "sp-empty"}`}
          />
        ))}
      </div>
      <div className="streak-progress-lbl">{label}</div>
    </div>
  );
}

export function WinStreak({ matches }) {
  if (!matches || matches.length === 0) return null;
  const last6 = matches.slice(0, 6);
  return (
    <div className="win-streak-row">
      {last6.map((m, i) => (
        <div key={i} className={`ws-dot ${m.iWon || m.won ? "ws-w" : "ws-l"}`} title={m.iWon || m.won ? "W" : "L"} />
      ))}
      {matches.length > 6 && <span className="ws-more">···</span>}
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" />;
}

export function Empty({ icon, text, hint }) {
  return (
    <div className="card">
      <div className="empty">
        <div className="empty-icon">{icon}</div>
        {text}
        {hint && <><br /><span style={{ color: "rgba(255,255,255,.3)", fontSize: 14 }}>{hint}</span></>}
      </div>
    </div>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  if (!toasts.length) return null;
  return (
    <div className="toast-wrap">
      {toasts.map((x) => (
        <div key={x.id} className={`toast ${x.kind === "err" ? "err" : x.kind === "ok" ? "ok" : ""}`}>{x.msg}</div>
      ))}
    </div>
  );
}

export function ClockAnim() {
  return (
    <div className="clock-wrap">
      <div className="clock-face" />
      <div className="clock-hand-h" />
      <div className="clock-hand-m" />
      <div className="clock-center" />
    </div>
  );
}

export function RulesModal({ onClose }) {
  const { t } = useApp();
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-grabber" />
        <div className="modal-header">
          <span className="modal-icon">🎱</span>
          <div className="modal-result-lbl" style={{ color: "#fff" }}>{t.x.rulesTitle}</div>
        </div>
        <div className="rules-body">{t.x.rules}</div>
        <div className="modal-body" style={{ paddingTop: 0 }}>
          <button className="modal-btn-done" onClick={onClose}>{t.x.close}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Итог матча. match — сериализованный объект с сервера:
 * { status, my:{eloBefore,eloAfter}, their:{...}, opponentUser, delta, iWon }
 */
export function MatchResultModal({ match, onClose }) {
  const { me, t } = useApp();
  const type =
    match.status === "confirmed" ? (match.iWon ? "win" : "lose")
    : match.status === "conflict" ? "conflict"
    : match.status === "timeout" ? "timeout"
    : "canceled";

  const configs = {
    win: { icon: "🏆", label: t.modal.win, cls: "modal-result-win" },
    lose: { icon: "💀", label: t.modal.lose, cls: "modal-result-lose" },
    conflict: { icon: "⚠️", label: t.modal.conflict, cls: "modal-result-conflict" },
    timeout: { icon: "⏰", label: t.modal.timeout, cls: "modal-result-timeout" },
    canceled: { icon: "🚫", label: t.modal.canceled, cls: "modal-result-timeout" },
  };
  const cfg = configs[type];
  const subs = { conflict: t.modal.conflictSub, timeout: t.modal.timeoutSub, canceled: t.modal.canceledSub };

  const resolved = match.status === "confirmed";
  const opp = match.opponentUser || { id: 0, name: "?", elo: 0 };

  function PlayerCard({ user, isMe, side, eloBefore, eloAfter }) {
    const eloCls = side === "win" ? "modal-player-elo-new-win" : side === "lose" ? "modal-player-elo-new-lose" : "modal-player-elo-new-neutral";
    const cardCls = side === "win" ? "modal-player-win" : side === "lose" ? "modal-player-lose" : "modal-player-neutral";
    const d = side === "win" ? match.delta : side === "lose" ? -match.delta : 0;
    const color = avaColor(user.id);
    const displayElo = resolved ? eloAfter : eloBefore ?? user.elo;
    return (
      <div className={`modal-player ${cardCls}`}>
        {isMe && <div className="modal-you">{t.rating.you}</div>}
        <div className="modal-player-ava" style={{ background: color + "28", color }}>{initials(user.name)}</div>
        <div className="modal-player-name">{user.name}</div>
        <div className={`modal-player-elo-new ${eloCls}`}>
          {resolved ? <AnimatedNumber value={displayElo} duration={900} /> : displayElo}
        </div>
        {resolved
          ? <div className={`modal-delta ${side === "win" ? "modal-delta-win" : "modal-delta-lose"}`}>{d > 0 ? "+" : ""}{d} {t.elo}</div>
          : <div className="modal-delta modal-delta-neutral">{t.modal.noChange}</div>}
      </div>
    );
  }

  const mySide = resolved ? (match.iWon ? "win" : "lose") : "neutral";
  const theirSide = resolved ? (match.iWon ? "lose" : "win") : "neutral";

  const newStreak = match.status === "confirmed" && match.iWon ? (me.streak > 0 ? me.streak : 1) : null;
  const xpGain = resolved ? (match.iWon ? 20 : 10) : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-grabber" />
        <div className="modal-header">
          <span className="modal-icon">{cfg.icon}</span>
          <div className={`modal-result-lbl ${cfg.cls}`}>{cfg.label}</div>
          {subs[type] && <div className="modal-sub">{subs[type]}</div>}
          {newStreak >= 3 && (
            <div style={{ marginTop: 8 }}>
              <span className="streak-badge streak-win">🔥 Серия {newStreak}!</span>
            </div>
          )}
        </div>
        <div className="modal-body">
          <div className="modal-players">
            <PlayerCard user={me} isMe side={mySide} eloBefore={match.my?.eloBefore} eloAfter={match.my?.eloAfter} />
            <div className="modal-vs">VS</div>
            <PlayerCard user={opp} side={theirSide} eloBefore={match.their?.eloBefore} eloAfter={match.their?.eloAfter} />
          </div>
          {xpGain && (
            <div className="modal-xp-row">
              <span className="modal-xp-icon">⭐</span>
              <span className="modal-xp-label">Опыт</span>
              <span className="modal-xp-gain">+{xpGain} XP</span>
            </div>
          )}
          <div className="modal-divider" />
          <button className="modal-btn-done" onClick={onClose}>{t.modal.done}</button>
        </div>
      </div>
    </div>
  );
}

export function AchievementUnlockModal({ code, earnedAt, onClose }) {
  const { ACH_META_IMPORT } = {};
  // Import inline to avoid circular deps
  const META = {
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
  const meta = META[code] || { icon: "🏅", label: code, desc: "" };
  return (
    <div className="modal-overlay center ach-unlock-overlay" onClick={onClose}>
      <div className="modal ach-unlock-modal" onClick={e => e.stopPropagation()}>
        <div className="ach-unlock-glow" style={{ background: "radial-gradient(circle at 50% 0%, rgba(255,214,10,.18) 0%, transparent 70%)" }} />
        <div className="ach-unlock-icon-wrap">
          <div className="ach-unlock-icon">{meta.icon}</div>
          <div className="ach-unlock-rays" />
        </div>
        <div className="ach-unlock-badge">🏆 Новое достижение!</div>
        <div className="ach-unlock-label">{meta.label}</div>
        <div className="ach-unlock-desc">{meta.desc}</div>
        <button className="modal-btn-done" style={{ margin: "20px 20px 32px", width: "calc(100% - 40px)" }} onClick={onClose}>
          Отлично!
        </button>
      </div>
    </div>
  );
}

function AnimatedNumber({ value, duration = 800 }) {
  const [display, setDisplay] = useState(value);
  const startRef = useRef(null);
  const startValRef = useRef(value);

  useEffect(() => {
    startRef.current = null;
    startValRef.current = display;
    const target = value;
    const start = startValRef.current;
    if (start === target) return;
    const step = (ts) => {
      if (!startRef.current) startRef.current = ts;
      const prog = Math.min((ts - startRef.current) / duration, 1);
      const ease = 1 - Math.pow(1 - prog, 3);
      setDisplay(Math.round(start + (target - start) * ease));
      if (prog < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return <>{display}</>;
}

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("UI crash:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="fatal">
          <div className="fatal-icon">😵</div>
          <div>Something went wrong</div>
          <button className="btn-primary" style={{ maxWidth: 220 }} onClick={() => { this.setState({ error: null }); location.reload(); }}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
