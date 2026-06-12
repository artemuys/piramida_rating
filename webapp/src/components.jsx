import { Component } from "react";
import { useApp } from "./store.jsx";
import { avaColor, initials, winPct } from "./util.js";

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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-grabber" />
        <div className="modal-header">
          <span className="modal-icon">{cfg.icon}</span>
          <div className={`modal-result-lbl ${cfg.cls}`}>{cfg.label}</div>
          {subs[type] && <div className="modal-sub">{subs[type]}</div>}
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
