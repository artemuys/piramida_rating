import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { useApp } from "./store.jsx";
import { Ava, ClockAnim, MatchResultModal } from "./components.jsx";
import { useNow, fmtCountdown } from "./util.js";
import { haptic } from "./telegram.js";

/**
 * Глобальный наблюдатель P2P-подтверждения матчей.
 * Поллит /matches/active и поверх любого экрана показывает:
 *  - входящее подтверждение (я — игрок Б, 30-секундный отсчёт),
 *  - ожидание соперника (я — игрок А),
 *  - модалку с итогом (confirmed / conflict / timeout / cancelled).
 */
export function MatchWatcher() {
  const { me, t, refreshMe, toastError, matchPoke } = useApp();
  const [active, setActive] = useState({ incoming: null, outgoing: null, unseen: null });
  const [skew, setSkew] = useState(0); // serverNow - clientNow
  const [resultMatch, setResultMatch] = useState(null);
  const [busy, setBusy] = useState(false);
  const aliveRef = useRef(true);

  const poll = useCallback(async () => {
    try {
      const r = await api.get("/matches/active");
      if (!aliveRef.current) return;
      setSkew(r.now - Date.now());
      setActive({ incoming: r.incoming, outgoing: r.outgoing, unseen: r.unseen });
    } catch {
      /* сетевые сбои поллинга молча переживаем — следующий тик повторит */
    }
  }, []);

  // Адаптивный поллинг: 1.5 c в активной фазе матча, 4 c при чекине, 15 c иначе
  useEffect(() => {
    aliveRef.current = true;
    let timer;
    const tick = async () => {
      await poll();
      if (!aliveRef.current) return;
      const inMatch = activeRef.current.incoming || activeRef.current.outgoing;
      const delay = inMatch ? 1500 : me?.isCheckedIn ? 4000 : 15000;
      timer = setTimeout(tick, delay);
    };
    tick();
    return () => { aliveRef.current = false; clearTimeout(timer); };
  }, [poll, me?.isCheckedIn]);

  const activeRef = useRef(active);
  activeRef.current = active;

  // Мгновенный опрос после report из профиля игрока
  useEffect(() => { if (matchPoke > 0) poll(); }, [matchPoke, poll]);

  // Непросмотренный итог → показываем модалку (один раз)
  useEffect(() => {
    if (active.unseen && !resultMatch) {
      setResultMatch(active.unseen);
      haptic(active.unseen.status === "confirmed" ? "ok" : "err");
    }
  }, [active.unseen, resultMatch]);

  async function respond(matchId, result) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.post(`/matches/${matchId}/respond`, { result });
      setActive((a) => ({ ...a, incoming: null }));
      setResultMatch(r.match);
      haptic(r.match.status === "confirmed" ? "ok" : "err");
      api.post(`/matches/${matchId}/ack`).catch(() => {});
      refreshMe();
    } catch (e) {
      toastError(e);
      poll();
    } finally {
      setBusy(false);
    }
  }

  async function cancelOutgoing(matchId) {
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/matches/${matchId}/cancel`);
      setActive((a) => ({ ...a, outgoing: null }));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
      poll();
    }
  }

  async function closeResult() {
    const id = resultMatch?.id;
    setResultMatch(null);
    setActive((a) => ({ ...a, unseen: null }));
    if (id) api.post(`/matches/${id}/ack`).catch(() => {});
    refreshMe();
    poll();
  }

  if (resultMatch) return <MatchResultModal match={resultMatch} onClose={closeResult} />;

  if (active.incoming) {
    return <IncomingConfirm match={active.incoming} skew={skew} busy={busy} onRespond={respond} t={t} onExpired={poll} />;
  }

  if (active.outgoing) {
    return <WaitingOverlay match={active.outgoing} skew={skew} busy={busy} onCancel={cancelOutgoing} t={t} />;
  }

  return null;
}

function IncomingConfirm({ match, skew, busy, onRespond, t, onExpired }) {
  const now = useNow(250);
  const left = match.expiresAt - (now + skew);
  const opp = match.opponentUser; // для игрока Б "opponentUser" — это инициатор

  useEffect(() => {
    if (left <= -1500) onExpired();
  }, [left <= -1500]); // eslint-disable-line react-hooks/exhaustive-deps

  const claimText = (match.their.claim === "win" ? t.x.confirmWin : t.x.confirmLose).replace("{name}", opp.name);

  return (
    <div className="modal-overlay center">
      <div className="modal">
        <div className="modal-header">
          <div className="confirm-countdown timer">{fmtCountdown(left)}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 14 }}>
            {t.waiting.timeLeft}
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <Ava id={opp.id} name={opp.name} size={56} />
          </div>
          <div className="modal-result-lbl" style={{ color: "#fff", fontSize: 22 }}>{t.x.confirmTitle}</div>
          <div className="modal-sub">{claimText}</div>
          <div className="modal-sub" style={{ fontSize: 13, marginTop: 6 }}>{t.x.confirmHint}</div>
        </div>
        <div className="modal-body">
          <div className="btn-stack-row">
            <button className="res-btn res-win" disabled={busy || left <= 0} onClick={() => onRespond(match.id, "win")}>
              {t.player.iWonBtn}
            </button>
            <button className="res-btn res-lose" disabled={busy || left <= 0} onClick={() => onRespond(match.id, "lose")}>
              {t.player.iLostBtn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WaitingOverlay({ match, skew, busy, onCancel, t }) {
  const now = useNow(250);
  const left = match.expiresAt - (now + skew);
  const opp = match.opponentUser;

  return (
    <div className="modal-overlay center">
      <div className="modal">
        <div className="wait-box">
          <ClockAnim />
          <div className="wait-countdown timer">{fmtCountdown(left)}</div>
          <div className="wait-countdown-lbl">{t.waiting.timeLeft}</div>
          <div className="wait-name">{t.waiting.title} {opp.name}</div>
          <div className="wait-txt">{t.waiting.sub}</div>
          <div className="wait-res">
            {t.waiting.reported} <span>{match.my.claim === "win" ? t.waiting.win : t.waiting.lose}</span>
          </div>
        </div>
        <div className="btn-stack">
          <button className="btn-tonal red" disabled={busy} onClick={() => onCancel(match.id)}>{t.waiting.cancel}</button>
        </div>
      </div>
    </div>
  );
}
