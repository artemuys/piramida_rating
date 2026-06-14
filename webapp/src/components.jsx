import { Component, useEffect, useRef, useState } from "react";
import { getT } from "./i18n.js";
import confetti from "canvas-confetti";
import { useApp } from "./store.jsx";
import { avaColor, initials, winPct, rankOf, RANKS, xpProgress, levelFromXp, xpToReachLevel } from "./util.js";
import { tg } from "./telegram.js";

// Renders a contact as a clickable link (Telegram) or copyable phone number.
export function ContactLink({ contact, style, className }) {
  if (!contact) return null;
  const isTg = contact.startsWith("@");
  const href = isTg ? `https://t.me/${contact.slice(1)}` : `tel:${contact}`;

  function handleClick(e) {
    e.stopPropagation();
    if (isTg && tg?.openTelegramLink) {
      e.preventDefault();
      try { tg.openTelegramLink(`https://t.me/${contact.slice(1)}`); } catch { window.open(href, "_blank"); }
    } else if (!isTg && tg?.openLink) {
      e.preventDefault();
      try { tg.openLink(href); } catch { window.open(href, "_blank"); }
    }
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={className}
      style={{ color: "#0A84FF", textDecoration: "none", userSelect: "text", WebkitUserSelect: "text", ...style }}
    >
      {contact}
    </a>
  );
}

export function Ava({ id, name, size = 38, ringColor }) {
  const color = avaColor(id);
  return (
    <div
      className="ava"
      style={{
        background: color + "28", color, width: size, height: size, fontSize: size * 0.32,
        ...(ringColor ? { boxShadow: `0 0 0 2px ${ringColor}66, 0 0 8px ${ringColor}33` } : {}),
      }}
    >
      {initials(name)}
    </div>
  );
}

export function Crown({ role }) {
  if (role !== "admin") return null;
  return <span style={{ marginLeft: 4 }}>👑</span>;
}

function AnimatedCounter({ value, duration = 900 }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);
  useEffect(() => {
    const start = performance.now();
    const step = (ts) => {
      const prog = Math.min((ts - start) / duration, 1);
      const ease = 1 - Math.pow(1 - prog, 3);
      setDisplay(Math.round(value * ease));
      if (prog < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <>{display}</>;
}

export function Stats({ elo, place, matches, wins, t }) {
  return (
    <div className="stats-row">
      <div className="stat"><div className="stat-val"><AnimatedCounter value={elo} /></div><div className="stat-lbl">{t.elo}</div></div>
      <div className="stat"><div className="stat-val">#{place}</div><div className="stat-lbl">{t.place}</div></div>
      <div className="stat"><div className="stat-val">{matches}</div><div className="stat-lbl">{t.matches}</div></div>
      <div className="stat"><div className="stat-val">{winPct(matches, wins)}%</div><div className="stat-lbl">{t.wins}</div></div>
    </div>
  );
}

export function RankBadge({ elo, size = "md" }) {
  const { t } = useApp();
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
      {rank.emoji} {t.ranks[rank.name]}
    </span>
  );
}

export function RankProgress({ elo }) {
  const { t } = useApp();
  const rank = rankOf(elo);
  if (!rank.next) {
    return (
      <div className="rank-progress-wrap">
        <div className="rank-progress-label">
          <span>{rank.emoji} {t.ranks[rank.name]}</span>
          <span style={{ color: rank.color }}>{t.ranks.maxRank}</span>
        </div>
        <div className="rank-progress-track">
          <div className="rank-progress-fill" style={{ width: "100%", background: rank.color, boxShadow: `0 0 8px ${rank.color}` }} />
        </div>
      </div>
    );
  }
  const nextRank = RANKS.find(r => r.min === rank.next);
  const pct = Math.round(((elo - rank.min) / (rank.next - rank.min)) * 100);
  const toNext = rank.next - elo;
  return (
    <div className="rank-progress-wrap">
      <div className="rank-progress-label">
        <span style={{ color: rank.color }}>{rank.emoji} {t.ranks[rank.name]}</span>
        <span style={{ color: "rgba(255,255,255,.4)", fontSize: 12 }}>{t.ranks.toNext(nextRank?.emoji, t.ranks[nextRank?.name], toNext)}</span>
      </div>
      <div className="rank-progress-track">
        <div className="rank-progress-fill" style={{ width: `${pct}%`, background: rank.color, boxShadow: `0 0 8px ${rank.color}` }} />
      </div>
    </div>
  );
}

export function LevelBar({ xp, style }) {
  const { t } = useApp();
  const prog = xpProgress(xp ?? 0);
  return (
    <div className="level-bar-wrap" style={style}>
      <div className="level-bar-row">
        <span className="level-bar-lbl">{t.player_ext.lvl} <strong>{prog.level}</strong></span>
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
  const { t } = useApp();
  const GOAL = 5;
  const isWin = streak > 0;
  const isLose = streak < 0;
  const count = Math.abs(streak ?? 0);
  const filled = Math.min(count, GOAL);
  const label = isWin
    ? (count >= GOAL ? t.streak.winFull(count) : t.streak.winProgress(count, GOAL))
    : isLose
    ? (count >= GOAL ? t.streak.loseFull(count) : t.streak.loseProgress(count, GOAL))
    : t.streak.zero;

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
  const { t } = useApp();
  if (!matches || matches.length === 0) return null;
  const last6 = matches.slice(0, 6);
  return (
    <div className="win-streak-row">
      {last6.map((m, i) => (
        <div key={i} className={`ws-dot ${m.iWon || m.won ? "ws-w" : "ws-l"}`} title={m.iWon || m.won ? t.x.winDot : t.x.lossDot} />
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
        <div
          key={x.id}
          className={`toast${x.kind === "err" ? " err" : x.kind === "ok" ? " ok" : ""}${x.dying ? " dying" : ""}`}
        >
          {x.msg}
        </div>
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
export function MatchResultModal({ match, xpBefore, onClose }) {
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

  useEffect(() => {
    if (type !== "win") return;
    const colors = ["#FFD700", "#00CC7C", "#3B8EFF", "#FF3D54", "#FFBA08", "#A855F7"];
    const end = Date.now() + 1800;
    (function frame() {
      confetti({ particleCount: 3, angle: 60,  spread: 55, origin: { x: 0 }, colors, disableForReducedMotion: true });
      confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 }, colors, disableForReducedMotion: true });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const mySide = resolved ? (match.iWon ? "win" : "lose") : "neutral";
  const theirSide = resolved ? (match.iWon ? "lose" : "win") : "neutral";

  const newStreak = match.status === "confirmed" && match.iWon ? (me.streak > 0 ? me.streak : 1) : null;
  const xpGain = resolved ? (match.iWon ? 20 : 10) : null;
  const xpBeforeVal = xpBefore ?? (me?.xp ?? 0);
  const xpAfterVal = xpBeforeVal + (xpGain ?? 0);

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
            <XpBarAnim xpBefore={xpBeforeVal} xpAfter={xpAfterVal} gain={xpGain} />
          )}
          <div className="modal-divider" />
          <button className="modal-btn-done" onClick={onClose}>{t.modal.done}</button>
        </div>
      </div>
    </div>
  );
}

const ACH_ICONS = {
  calibration: "🎯", elite: "👑", season_master: "🏆",
  new_peak_1100: "📈", new_peak_1200: "📈", new_peak_1300: "📈", new_peak_1400: "📈", new_peak_1500: "📈",
  on_fire_5: "🔥", inferno_7: "🔥", immortal_10: "⚡",
  groundhog: "😤", rollercoaster: "🎢", own_atmo: "🫂", headhunter: "🎯", extrovert: "🌍",
  veteran_20: "🏅", veteran_50: "🏅", veteran_100: "🥇", veteran_200: "🥇", veteran_500: "💎", veteran_1000: "👑",
  bad_day: "😤", main_donor: "💸", tried: "🙏", phoenix: "🦅",
};

export function AchievementUnlockModal({ code, earnedAt, onClose }) {
  const { t } = useApp();
  const baseCode = code.startsWith("p:") ? code.slice(2) : code;
  const isSeasonMaster = /^season_master_(\d+)$/.test(baseCode);
  const metaT = t.ach.meta[baseCode] ?? (isSeasonMaster ? t.ach.meta.season_master : null);
  const label = metaT ? (isSeasonMaster ? `${metaT.label} #${baseCode.match(/\d+$/)[0]}` : metaT.label) : baseCode;
  const desc  = metaT?.desc ?? "";
  const icon  = ACH_ICONS[baseCode] ?? (isSeasonMaster ? "🏆" : "🏅");
  return (
    <div className="modal-overlay center ach-unlock-overlay" onClick={onClose}>
      <div className="modal ach-unlock-modal" onClick={e => e.stopPropagation()}>
        <div className="ach-unlock-glow" style={{ background: "radial-gradient(circle at 50% 0%, rgba(255,214,10,.18) 0%, transparent 70%)" }} />
        <div className="ach-unlock-icon-wrap">
          <div className="ach-unlock-icon">{icon}</div>
          <div className="ach-unlock-rays" />
        </div>
        <div className="ach-unlock-badge">{t.x.newAch}</div>
        <div className="ach-unlock-label">{label}</div>
        <div className="ach-unlock-desc">{desc}</div>
        <button className="modal-btn-done" style={{ margin: "20px 20px 32px", width: "calc(100% - 40px)" }} onClick={onClose}>
          {t.x.excellent}
        </button>
      </div>
    </div>
  );
}

function XpBarAnim({ xpBefore, xpAfter, gain }) {
  const { t } = useApp();
  const progBefore = xpProgress(xpBefore);
  const progAfter  = xpProgress(xpAfter);
  const leveledUp  = progAfter.level > progBefore.level;

  // Если левел апнулись — показываем прогресс на новом уровне; иначе на текущем
  const level  = progAfter.level;
  const pctBefore = leveledUp ? 0 : progBefore.pct;
  const [pct, setPct] = useState(pctBefore);

  useEffect(() => {
    const id = setTimeout(() => setPct(progAfter.pct), 120);
    return () => clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="modal-xp-wrap">
      <div className="modal-xp-top">
        <span className="modal-xp-lvl">⭐ {t.player_ext.lvl} {level}</span>
        {leveledUp && <span className="modal-xp-levelup">{t.x.levelUp}</span>}
        <span className="modal-xp-gain">+{gain} XP</span>
      </div>
      <div className="modal-xp-track">
        <div className="modal-xp-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="modal-xp-bottom">{progAfter.current} / {progAfter.needed} XP</div>
    </div>
  );
}

export function AnimatedNumber({ value, duration = 800 }) {
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

export function FeedSkeleton() {
  return (
    <div className="card feed-card">
      <div className="feed-header">
        <div className="skel" style={{ width: 80, height: 14 }} />
      </div>
      {[1, 2, 3].map(i => (
        <div key={i} className="feed-skel-item">
          <div className="skel" style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="skel" style={{ height: 12, width: `${55 + i * 12}%` }} />
            <div className="skel" style={{ height: 10, width: 48 }} />
          </div>
        </div>
      ))}
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
      const t = getT(localStorage.getItem("lang") || "ru");
      return (
        <div className="fatal">
          <div className="fatal-icon">😵</div>
          <div>{t.x.crashMsg}</div>
          <button className="btn-primary" style={{ maxWidth: 220 }} onClick={() => { this.setState({ error: null }); location.reload(); }}>
            {t.x.reload}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
