import { Component } from "react";
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
    return (
      <div className={`modal-player ${cardCls}`}>
        {isMe && <div className="modal-you">{t.rating.you}</div>}
        <div className="modal-player-ava" style={{ background: color + "28", color }}>{initials(user.name)}</div>
        <div className="modal-player-name">{user.name}</div>
        <div className={`modal-player-elo-new ${eloCls}`}>{resolved ? eloAfter : eloBefore ?? user.elo}</div>
        {resolved
          ? <div className={`modal-delta ${side === "win" ? "modal-delta-win" : "modal-delta-lose"}`}>{d > 0 ? "+" : ""}{d} {t.elo}</div>
          : <div className="modal-delta modal-delta-neutral">{t.modal.noChange}</div>}
      </div>
    );
  }

  const mySide = resolved ? (match.iWon ? "win" : "lose") : "neutral";
  const theirSide = resolved ? (match.iWon ? "lose" : "win") : "neutral";

  const newStreak = match.status === "confirmed" && match.iWon ? (me.streak > 0 ? me.streak : 1) : null;

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
          <div className="modal-divider" />
          <button className="modal-btn-done" onClick={onClose}>{t.modal.done}</button>
        </div>
      </div>
    </div>
  );
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
