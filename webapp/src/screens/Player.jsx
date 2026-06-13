import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { useApp } from "../store.jsx";
import { Ava, Crown, Spinner, Empty, RankBadge, RankProgress, LevelBar, StreakBadge, WinStreak } from "../components.jsx";
import { fmtDate, winPct } from "../util.js";
import { haptic } from "../telegram.js";
import { DuelModal } from "./Duels.jsx";
import { Achievements } from "./Achievements.jsx";

export function Player({ params, navigate }) {
  const { me, t, lang, toast, toastError, pokeMatches } = useApp();
  const playerId = params.playerId;
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showAch, setShowAch] = useState(false);
  const [showDuel, setShowDuel] = useState(false);

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

  const { player, isFavorite, h2h, h2hTotal, recentMatches } = data;
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
    if (!me.isCheckedIn) { toast(t.x.needCheckin, "err"); return; }
    setBusy(true);
    try {
      await api.post("/matches/report", { opponentId: player.id, result });
      haptic("ok");
      pokeMatches();
    } catch (e) { toastError(e); }
    finally { setBusy(false); }
  }

  const myH2hWins = h2hTotal?.myWins ?? h2h.filter(m => m.iWon).length;
  const theirH2hWins = h2hTotal?.theirWins ?? h2h.filter(m => !m.iWon).length;

  return (
    <>
      {showDuel && (
        <DuelModal
          opponent={player}
          onClose={() => setShowDuel(false)}
          onSent={() => toast(t.duels.sentToast, "ok")}
        />
      )}

      {showAch && (
        <div className="modal-overlay" onClick={() => setShowAch(false)}>
          <div className="modal" style={{ maxHeight: "80vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
            <div className="modal-grabber" />
            <div style={{ padding: "16px 20px 8px", fontSize: 18, fontWeight: 700 }}>
              {t.player_ext.achievementsOf} {player.name.split(" ")[0]}
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: "0 0 20px" }}>
              <Achievements playerId={player.id} />
            </div>
          </div>
        </div>
      )}

      {/* Hero карточка */}
      <div className="card player-hero-card">
        <div style={{ padding: "22px 20px 8px", display: "flex", alignItems: "flex-start", gap: 16 }}>
          <Ava id={player.id} name={player.name} size={64} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.03em" }}>
              {player.name}<Crown role={player.role} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
              <RankBadge elo={player.elo} />
              {player.streak !== 0 && <StreakBadge streak={player.streak} />}
              {player.achPoints > 0 && <span style={{ fontSize: 12, color: "#FFD60A", background: "rgba(255,214,10,.12)", borderRadius: 8, padding: "3px 8px" }}>🏆 {player.achPoints} {t.pts}</span>}
            </div>
            <RankProgress elo={player.elo} />
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.45)", marginTop: 5 }}>
              {t.idLabel} {player.id} · {t.player_ext.peak} {player.peakElo} · #{player.place}
            </div>
          </div>
        </div>

        <div className="stats-row">
          <div className="stat"><div className="stat-val">{player.elo}</div><div className="stat-lbl">{t.elo}</div></div>
          <div className="stat"><div className="stat-val">{player.matchesCount}</div><div className="stat-lbl">{t.matches}</div></div>
          <div className="stat"><div className="stat-val">{winPct(player.matchesCount, player.winsCount)}%</div><div className="stat-lbl">{t.wins}</div></div>
          <div className="stat"><div className="stat-val">{t.player_ext.lvl}{player.level}</div><div className="stat-lbl">{t.player_ext.level}</div></div>
        </div>

        <LevelBar xp={player.xp} style={{ padding: "0 20px 12px" }} />

        {/* Последние 6 матчей */}
        {recentMatches?.length > 0 && (
          <div style={{ padding: "4px 20px 12px" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>{t.player_ext.recentMatches}</div>
            <WinStreak matches={recentMatches} />
          </div>
        )}
      </div>

      {/* Кнопки действий */}
      {!self && (
        <div className="card">
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
            <div className="btn-stack-row">
              <button className={`btn-tonal${isFavorite ? " yellow" : ""}`} onClick={toggleFav}>
                {isFavorite ? t.player.inFav : t.player.addFav}
              </button>
              {me.isActivated && (
                <button
                  className="btn-tonal"
                  style={{ background: "rgba(255,159,10,.15)", color: "#FF9F0A" }}
                  onClick={() => setShowDuel(true)}
                >
                  {t.player_ext.duel}
                </button>
              )}
            </div>
            <button className="btn-tonal" style={{ background: "rgba(255,214,10,.1)", color: "#FFD60A" }} onClick={() => setShowAch(true)}>
              {t.player_ext.achievements}
            </button>
          </div>
        </div>
      )}

      {self && (
        <div className="card">
          <div className="btn-stack">
            <button className="btn-tonal" style={{ background: "rgba(255,214,10,.1)", color: "#FFD60A" }} onClick={() => setShowAch(true)}>
              {t.player_ext.myAchievements}
            </button>
          </div>
        </div>
      )}

      {/* H2H счёт */}
      {!self && h2hTotal?.total > 0 && (
        <div className="card">
          <div className="s-sect">{t.player_ext.h2h} {player.name.split(" ")[0]}</div>
          <div className="h2h-score">
            <div className="h2h-side h2h-mine">
              <div className="h2h-num">{myH2hWins}</div>
              <div className="h2h-lbl">{t.player_ext.yourWins}</div>
            </div>
            <div className="h2h-divider">VS</div>
            <div className="h2h-side h2h-their">
              <div className="h2h-num">{theirH2hWins}</div>
              <div className="h2h-lbl">{t.player_ext.theirWins} {player.name.split(" ")[0]}</div>
            </div>
          </div>
          <div className="hint" style={{ paddingBottom: 14 }}>
            {t.player_ext.matchesPlayedStr(h2hTotal.total)}
          </div>
        </div>
      )}

      {/* История матчей H2H */}
      {h2h.length > 0 && !self && (
        <div className="card">
          <div className="s-sect">{t.player.historyWith} {player.name.split(" ")[0]}</div>
          {h2h.map((m) => (
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
        </div>
      )}

      {/* Последние матчи игрока */}
      {recentMatches?.length > 0 && (
        <div className="card">
          <div className="s-sect">{self ? t.player_ext.myRecentMatches : `${t.player_ext.recentMatchesOf} ${player.name.split(" ")[0]}`}</div>
          {recentMatches.map((m) => (
            <div
              className="row"
              key={m.id}
              style={{ cursor: "pointer" }}
              onClick={() => navigate("player", { playerId: m.opponentId, title: m.opponentName })}
            >
              <div className="dot" style={{ background: m.won ? "#30D158" : "#FF453A" }} />
              <div className="row-info">
                <div className="row-name">{m.opponentName}</div>
                <div className="row-meta">{fmtDate(m.date, lang)}</div>
              </div>
              <span style={{ fontWeight: 600, fontSize: 16, color: m.won ? "#30D158" : "#FF453A" }}>
                {m.delta > 0 ? "+" : ""}{m.delta}
              </span>
              <span className="list-row-chevron">›</span>
            </div>
          ))}
        </div>
      )}

      {!h2h.length && !recentMatches?.length && (
        <div className="hint" style={{ paddingTop: 8 }}>{t.player.noMatches}</div>
      )}
    </>
  );
}
