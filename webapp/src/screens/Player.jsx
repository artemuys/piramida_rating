import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { useApp } from "../store.jsx";
import { Ava, Crown, Spinner, Empty } from "../components.jsx";
import { fmtDate } from "../util.js";
import { haptic } from "../telegram.js";

/** Профиль игрока: избранное + кнопки Победа/Поражение (P2P-фиксация) */
export function Player({ params }) {
  const { me, t, lang, toast, toastError, pokeMatches } = useApp();
  const playerId = params.playerId;
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/players/${playerId}`);
      setData(r);
    } catch (e) {
      setFailed(true);
      toastError(e);
    }
  }, [playerId, toastError]);

  useEffect(() => { load(); }, [load]);

  if (failed) return <Empty icon="❓" text={t.result.notFound} />;
  if (!data) return <Spinner />;

  const { player, isFavorite, h2h } = data;
  const self = player.id === me.id;

  async function toggleFav() {
    try {
      if (isFavorite) await api.del(`/favorites/${player.id}`);
      else await api.post(`/favorites/${player.id}`);
      haptic();
      setData((d) => ({ ...d, isFavorite: !d.isFavorite }));
    } catch (e) { toastError(e); }
  }

  async function report(result) {
    if (busy) return;
    if (!me.isCheckedIn) {
      toast(t.x.needCheckin, "err");
      return;
    }
    setBusy(true);
    try {
      await api.post("/matches/report", { opponentId: player.id, result });
      haptic("ok");
      pokeMatches(); // MatchWatcher немедленно покажет оверлей ожидания
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  const wins = h2h.filter((m) => m.iWon).length;
  const losses = h2h.length - wins;

  return (
    <>
      <div className="card">
        <div style={{ padding: "22px 20px 16px", display: "flex", alignItems: "center", gap: 16 }}>
          <Ava id={player.id} name={player.name} size={64} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.03em" }}>
              {player.name}<Crown role={player.role} />
            </div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,.55)", marginTop: 3 }}>
              {t.idLabel} {player.id}
              {player.contact ? <> · <span className="tg">{player.contact}</span></> : null}
            </div>
          </div>
        </div>
        <div className="stats-row">
          <div className="stat"><div className="stat-val">{player.elo}</div><div className="stat-lbl">{t.elo}</div></div>
          <div className="stat"><div className="stat-val">{player.matchesCount}</div><div className="stat-lbl">{t.matches}</div></div>
          <div className="stat"><div className="stat-val">{player.winsCount}</div><div className="stat-lbl">{t.wins}</div></div>
        </div>

        {!self && (
          <div className="btn-stack">
            <div className="btn-stack-row">
              <button
                className="res-btn res-win"
                style={{ padding: 16, fontSize: 17, opacity: me.isCheckedIn ? 1 : 0.4 }}
                disabled={busy}
                onClick={() => report("win")}
              >
                {t.player.iWonBtn}
              </button>
              <button
                className="res-btn res-lose"
                style={{ padding: 16, fontSize: 17, opacity: me.isCheckedIn ? 1 : 0.4 }}
                disabled={busy}
                onClick={() => report("lose")}
              >
                {t.player.iLostBtn}
              </button>
            </div>
            {!me.isCheckedIn && (
              <div className="hint" style={{ padding: 0 }}>{t.x.needCheckin}</div>
            )}
            <button
              className={`btn-tonal${isFavorite ? " yellow" : ""}`}
              onClick={toggleFav}
            >
              {isFavorite ? t.player.inFav : t.player.addFav}
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="s-sect">{t.player.historyWith} {player.name.split(" ")[0]}</div>
        {h2h.length === 0
          ? <div className="empty" style={{ padding: "28px 24px" }}>{t.player.noMatches}</div>
          : h2h.map((m) => (
            <div className="row" key={m.id}>
              <div className="dot" style={{ background: m.iWon ? "#30D158" : "#FF453A" }} />
              <div className="row-info">
                <div className="row-name">{m.iWon ? t.player.won : t.player.lost}</div>
                <div className="row-meta">{fmtDate(m.date, lang)}</div>
              </div>
              <span style={{ fontWeight: 600, fontSize: 16, color: m.iWon ? "#30D158" : "#FF453A" }}>
                {m.delta > 0 ? "+" : ""}{m.delta} {t.elo}
              </span>
            </div>
          ))}
        {h2h.length > 0 && wins + losses > 0 && (
          <div className="hint" style={{ paddingBottom: 14 }}>{wins} {t.player.wins} · {losses} {t.player.losses}</div>
        )}
      </div>
    </>
  );
}
