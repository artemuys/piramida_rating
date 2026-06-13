import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { useApp } from "../store.jsx";
import { Ava, Spinner, Empty } from "../components.jsx";
import { fmtElapsed } from "../util.js";
import { haptic } from "../telegram.js";

export function Duels({ navigate }) {
  const { t, toast, toastError } = useApp();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/duels").then(setData).catch(toastError);
  }, [toastError]);

  useEffect(() => { load(); }, [load]);

  async function act(url, okMsg) {
    if (busy) return;
    setBusy(true);
    try {
      await api.post(url);
      haptic("ok");
      toast(okMsg, "ok");
      load();
    } catch (e) { toastError(e); }
    finally { setBusy(false); }
  }

  if (!data) return <Spinner />;

  const now = Date.now();
  const hasAny = data.incoming.length > 0 || data.outgoing.length > 0;

  return (
    <>
      {data.incoming.length > 0 && (
        <div className="card">
          <div className="s-sect" style={{ color: "#FF9F0A" }}>⚔️ Входящие вызовы</div>
          {data.incoming.map(d => (
            <div key={d.id} className="duel-row">
              <div className="duel-row-top" onClick={() => navigate("player", { playerId: d.challenger.id, title: d.challenger.name })} style={{ cursor: "pointer" }}>
                <Ava id={d.challenger.id} name={d.challenger.name} />
                <div className="duel-info">
                  <div className="duel-name">{d.challenger.name}</div>
                  <div className="duel-meta">{d.challenger.elo} эло</div>
                </div>
              </div>
              {d.message && <div className="duel-msg">💬 {d.message}</div>}
              {d.challenger.contact && <div className="duel-contact">📩 {d.challenger.contact}</div>}
              <div className="duel-actions">
                <button
                  className="btn-tonal red"
                  style={{ flex: 1, padding: "10px", fontSize: 14 }}
                  disabled={busy}
                  onClick={() => act(`/duels/${d.id}/decline`, "Вызов отклонён")}
                >
                  Отклонить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {data.outgoing.length > 0 && (
        <div className="card">
          <div className="s-sect" style={{ color: "#0A84FF" }}>🗡 Мои вызовы</div>
          {data.outgoing.map(d => (
            <div key={d.id} className="duel-row">
              <div
                className="duel-row-top"
                onClick={() => navigate("player", { playerId: d.opponent.id, title: d.opponent.name })}
                style={{ cursor: "pointer" }}
              >
                <Ava id={d.opponent.id} name={d.opponent.name} />
                <div className="duel-info">
                  <div className="duel-name">{d.opponent.name}</div>
                  <div className="duel-meta">{d.opponent.elo} эло</div>
                </div>
              </div>
              {d.message && <div className="duel-msg">💬 {d.message}</div>}
              <div className="duel-actions">
                <button
                  className="btn-tonal"
                  style={{ flex: 1, padding: "10px", fontSize: 14 }}
                  disabled={busy}
                  onClick={() => act(`/duels/${d.id}/cancel`, "Вызов отменён")}
                >
                  Отменить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!hasAny && (
        <Empty icon="⚔️" text="Нет активных дуэлей" hint="Брось вызов из профиля соперника" />
      )}
    </>
  );
}

export function DuelModal({ opponent, onClose, onSent }) {
  const { me, toastError, toast } = useApp();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const noContact = !me?.contact;

  async function send() {
    if (busy) return;
    if (noContact) { toast("⚠️ Укажи способ связи в настройках", "err"); return; }
    setBusy(true);
    try {
      await api.post("/duels", { opponentId: opponent.id, message: msg.trim() });
      haptic("ok");
      toast("⚔️ Вызов отправлен!", "ok");
      onSent?.();
      onClose();
    } catch (e) { toastError(e); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-grabber" />
        <div className="modal-header">
          <span className="modal-icon">⚔️</span>
          <div className="modal-result-lbl" style={{ color: "#FF9F0A" }}>Вызов на дуэль</div>
          <div className="modal-sub">Бросаешь вызов: <strong>{opponent.name}</strong></div>
        </div>
        <div className="modal-body">
          <div className="duel-contact-row">
            <span className="duel-contact-lbl">📩 Мой способ связи</span>
            <span className="duel-contact-val" style={{ color: noContact ? "#FF453A" : "#0A84FF" }}>
              {noContact ? "не указан — зайди в настройки" : me.contact}
            </span>
          </div>
          <textarea
            className="duel-textarea"
            placeholder="Сообщение сопернику: время, место, условия… (необязательно)"
            maxLength={200}
            value={msg}
            onChange={e => setMsg(e.target.value)}
            rows={3}
            style={{ marginTop: 10 }}
          />
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button className="btn-tonal" style={{ flex: 1 }} onClick={onClose}>Отмена</button>
            <button
              className="btn-primary"
              style={{ flex: 1, background: noContact ? undefined : "linear-gradient(135deg,#FF9F0A,#FF6B0A)" }}
              disabled={busy || noContact}
              onClick={send}
            >
              ⚔️ Бросить вызов
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
