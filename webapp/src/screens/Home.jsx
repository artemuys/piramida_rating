import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useApp } from "../store.jsx";
import { Ava, Crown, RulesModal, Spinner, Stats, Empty, RankBadge, RankProgress, LevelBar, StreakBadge, StreakProgress, FeedSkeleton, RevealContact } from "../components.jsx";
import { useNow, fmtElapsed, fmtDateTime, fmtAgo } from "../util.js";
import { haptic } from "../telegram.js";
import { getAchMeta } from "./Achievements.jsx";

function NavRow({ icon, iconBg, label, value, onClick, locked, badge }) {
  function handleClick() {
    if (locked) return;
    haptic("selection");
    onClick?.();
  }
  return (
    <div className={`list-row${locked ? " locked" : ""}`} onClick={handleClick}>
      <div className="list-row-icon" style={{ background: iconBg }}>{icon}</div>
      <span className="list-row-label">{label}</span>
      {badge > 0 && <span className="notif-dot">{badge}</span>}
      {value != null && <span className="list-row-value">{value}</span>}
      {!locked && <span className="list-row-chevron">›</span>}
    </div>
  );
}

function SearchBlock() {
  const { me, t, refreshMe, toastError } = useApp();
  const [open, setOpen] = useState(false);
  const isPool = me.activeDiscipline !== 'pyramid';
  // В пуле дисциплина фиксирована (всегда American=1), в пирамиде — выбор как раньше
  const [disc, setDisc] = useState(isPool ? 1 : (me.searching?.disc ?? me.prefDisc));
  const [pays, setPays] = useState(me.searching?.pays ?? me.prefPays);
  const [busy, setBusy] = useState(false);
  const now = useNow(1000);

  const searching = !!me.searching;
  const canSearch = me.isActivated;

  async function start() {
    if (busy) return;
    setBusy(true);
    try {
      await api.post("/search/start", { disc, pays });
      haptic("ok");
      setOpen(false);
      await refreshMe();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  }

  async function stop() {
    if (busy) return;
    setBusy(true);
    try {
      await api.post("/search/stop");
      setOpen(false);
      await refreshMe();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  }

  return (
    <div>
      <button
        className={`search-main-btn${searching ? " searching" : ""}${open ? " open" : ""}`}
        disabled={!canSearch}
        onClick={() => setOpen((o) => !o)}
      >
        <span>🔍</span>
        {searching ? (
          <>
            <span>{t.search.inSearch}</span>
            <span className="search-timer timer">{fmtElapsed(now - me.searching.startedAt)}</span>
          </>
        ) : (
          <>
            <span>{t.search.btn}</span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,.35)", marginLeft: 2 }}>
              {!isPool && `${t.discOpts[disc]} · `}{t.paysOpts[pays]}
            </span>
          </>
        )}
        <span className="chevron">▾</span>
      </button>
      {open && (
        <div className="search-expand">
          {!isPool && (
            <div className="search-expand-row">
              <span className="search-expand-lbl">{t.search.discipline}</span>
              <div className="search-tog-g">
                {t.discOpts.map((d, i) => (
                  <button key={i} className={`search-tog${disc === i ? " on" : ""}`} onClick={() => setDisc(i)}>{d}</button>
                ))}
              </div>
            </div>
          )}
          <div className="search-expand-row">
            <span className="search-expand-lbl">{t.search.whoPays}</span>
            <div className="search-tog-g">
              {t.paysOpts.map((p, i) => (
                <button key={i} className={`search-tog${pays === i ? " on" : ""}`} onClick={() => setPays(i)}>{p}</button>
              ))}
            </div>
          </div>
          {searching
            ? <button className="search-stop-btn" disabled={busy} onClick={stop}>{t.search.stop}</button>
            : <button className="search-go-btn" disabled={busy} onClick={start}>{t.search.start}</button>}
          <div className="hint" style={{ padding: "10px 0 0" }}>{t.x.searchUntilMidnight}</div>
        </div>
      )}
    </div>
  );
}

function AchFeedModal({ code, onClose }) {
  const { t } = useApp();
  const meta = getAchMeta(code, t);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-grabber" />
        <div className="modal-header">
          <span className="modal-icon">{meta.icon}</span>
          <div className="modal-result-lbl" style={{ color: "#FFD60A", fontSize: 22 }}>{meta.label}</div>
          <div className="modal-sub">{meta.desc}</div>
        </div>
        <div className="modal-body" style={{ paddingTop: 4 }}>
          <button className="modal-btn-done" onClick={onClose}>{t.x.close}</button>
        </div>
      </div>
    </div>
  );
}

function LiveFeed({ navigate }) {
  const { t } = useApp();
  const [feed, setFeed] = useState(null);
  const [achModal, setAchModal] = useState(null); // { code }

  useEffect(() => {
    api.get("/feed").then(r => setFeed(r.feed)).catch(() => setFeed([]));
  }, []);

  if (!feed) return <FeedSkeleton />;
  if (feed.length === 0) return null;

  function renderFeedItem(item) {
    const d = item.data || {};
    switch (item.type) {
      case "match_win": {
        const winnerId = d.winnerId || item.actorId;
        const loserId = d.loserId || item.targetId;
        const winnerName = (d.winnerName || item.actorName || "").trim() || t.feed.defaultName;
        const loserName = (d.loserName || item.targetName || "").trim() || t.feed.defaultName;
        return (
          <div className="feed-text">
            🏆{" "}
            <span className="feed-name-link" onClick={() => winnerId && navigate("player", { playerId: winnerId, title: winnerName })}>{winnerName}</span>
            {" "}{t.feed.beat}{" "}
            <span className="feed-name-link" onClick={() => loserId && navigate("player", { playerId: loserId, title: loserName })}>{loserName}</span>
            {" ("}+{d.delta || "?"}{")" }
          </div>
        );
      }
      case "achievement": {
        const meta = getAchMeta(d.code, t);
        const actorName = d.name || item.actorName;
        return (
          <div className="feed-text">
            {meta.icon}{" "}
            <span className="feed-name-link" onClick={() => item.actorId && navigate("player", { playerId: item.actorId, title: actorName })}>{actorName}</span>
            {" "}{t.feed.received}{" "}
            <span className="feed-ach-link" onClick={() => setAchModal({ code: d.code })}>«{meta.label}»</span>
          </div>
        );
      }
      case "rank_up": {
        const name = d.name || item.actorName;
        return (
          <div className="feed-text">
            ⬆️{" "}
            <span className="feed-name-link" onClick={() => item.actorId && navigate("player", { playerId: item.actorId, title: name })}>{name}</span>
            {" "}{t.feed.reached}{" "}{d.rank}
          </div>
        );
      }
      case "season_end":
        return <div className="feed-text">{t.feed.newSeason}</div>;
      case "new_player": {
        const name = d.name || item.actorName;
        return (
          <div className="feed-text">
            👋{" "}
            <span className="feed-name-link" onClick={() => item.actorId && navigate("player", { playerId: item.actorId, title: name })}>{name}</span>
            {" "}{t.feed.joined}
          </div>
        );
      }
      default:
        return <div className="feed-text">• {item.actorName || ""}</div>;
    }
  }

  return (
    <>
      {achModal && <AchFeedModal code={achModal.code} onClose={() => setAchModal(null)} />}
      <div className="card feed-card">
        <div className="feed-header">
          <span className="feed-title">{t.feed.title}</span>
        </div>
        {feed.map(item => (
          <div key={item.id} className="feed-item">
            <div className="feed-content">
              {renderFeedItem(item)}
              <div className="feed-meta">{fmtAgo(Date.now() - item.createdAt)}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function usePullToRefresh(onRefresh) {
  const [ptr, setPtr] = useState({ active: false, progress: 0, refreshing: false });
  const startY = useRef(null);
  const progressRef = useRef(0);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const THRESHOLD = 72;

    function onTouchStart(e) {
      if (window.scrollY > 0) return;
      startY.current = e.touches[0].clientY;
    }
    function onTouchMove(e) {
      if (startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) { startY.current = null; return; }
      const progress = Math.min(dy / THRESHOLD, 1);
      progressRef.current = progress;
      setPtr(p => ({ ...p, active: true, progress }));
    }
    function onTouchEnd() {
      if (startY.current === null) return;
      const prog = progressRef.current;
      startY.current = null;
      progressRef.current = 0;
      if (prog >= 1 && !refreshingRef.current) {
        refreshingRef.current = true;
        haptic("ok");
        setPtr({ active: false, progress: 0, refreshing: true });
        Promise.resolve(onRefreshRef.current()).finally(() => {
          refreshingRef.current = false;
          setPtr({ active: false, progress: 0, refreshing: false });
        });
      } else {
        setPtr({ active: false, progress: 0, refreshing: false });
      }
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  return ptr;
}

export function Home({ navigate }) {
  const { me, t, lang, refreshMe } = useApp();
  const [rules, setRules] = useState(false);
  const [lastMatch, setLastMatch] = useState(undefined);
  const ptr = usePullToRefresh(refreshMe);

  useEffect(() => {
    api.get("/history").then(r => setLastMatch(r.matches?.[0] ?? null)).catch(() => setLastMatch(null));
  }, []);

  return (
    <>
      {rules && <RulesModal onClose={() => setRules(false)} />}

      <div style={{ position: "relative" }}>
        <div className={`ptr-indicator${ptr.refreshing ? " active" : ""}`}
          style={{ opacity: ptr.refreshing ? 1 : ptr.progress }}>
          {ptr.refreshing
            ? <><div className="ptr-spinner" />Обновление...</>
            : <span style={{ transform: `rotate(${ptr.progress * 180}deg)`, display: "inline-block" }}>↓</span>}
        </div>
      </div>

      <div className="card hero-card">
        <div className="user-hero">
          <div className="user-hero-text">
            <div className="user-name">
              {me.name.split(" ")[0]}
              {me.role === "admin" && !me.isSuper && <span className="badge badge-yellow">👑 {t.x.roleAdmin}</span>}
              {me.isSuper && <span className="badge badge-yellow">⚡ {t.x.roleSuper}</span>}
              {me.searching && <span className="badge badge-green">{t.nav.searching}</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              <RankBadge elo={me.elo} />
              {me.achPoints > 0 && <span style={{ fontSize: 12, color: "#FFD60A", background: "rgba(255,214,10,.12)", borderRadius: 8, padding: "3px 8px" }}>🏆 {me.achPoints} {t.pts}</span>}
            </div>
            <RankProgress elo={me.elo} />
            <StreakProgress streak={me.streak} />
            <div className="user-sub" style={{ marginTop: 6 }}>
              {t.idLabel} {me.id}
              {me.isCheckedIn
                ? <span style={{ color: "#30D158" }}> · ✓ {t.x.checkinUntil} {fmtDateTime(me.checkedInUntil, lang).split(",").pop()}</span>
                : me.isActivated && <span> · {t.x.noCheckinHint}</span>}
            </div>
          </div>
        </div>

        <Stats elo={me.elo} place={me.place} matches={me.matchesCount} wins={me.winsCount} t={t} />
        <LevelBar xp={me.xp} style={{ padding: "10px 20px 16px" }} />

        {lastMatch && (
          <div className="last-match-row">
            <div className="last-match-dot" style={{ background: lastMatch.iWon ? "#30D158" : "#FF453A" }} />
            <span className="last-match-label">{t.x.lastMatch}:</span>
            <span className="last-match-result" style={{ color: lastMatch.iWon ? "#30D158" : "#FF453A" }}>
              {lastMatch.iWon ? t.modal.win : t.modal.lose}
              {" "}{lastMatch.delta > 0 ? "+" : ""}{lastMatch.delta} {t.elo}
            </span>
            <span className="last-match-vs">vs {lastMatch.opponent.name.split(" ")[0]}</span>
          </div>
        )}

        {!me.isActivated && (
          <div className="alert alert-r">
            <div className="alert-t">🚫 {t.x.alertNotActivatedT}</div>
            {t.x.alertNotActivatedM}
          </div>
        )}

        <div className="btn-stack">
          <SearchBlock />
          {me.isActivated && (
            <>
              <div className="btn-stack-row">
                <button className="btn-tonal" onClick={() => navigate("search-list")}>👥 {t.nav.whoSearching}</button>
                <button className="btn-tonal" onClick={() => navigate("apps")}>📋 {t.nav.apps}</button>
              </div>
              <button
                className={`btn-tonal${me.pendingDuels > 0 ? " yellow" : ""}`}
                style={{ position: "relative" }}
                onClick={() => navigate("duels")}
              >
                ⚔️ {t.nav.duels}
                {me.pendingDuels > 0 && <span className="btn-badge">{me.pendingDuels}</span>}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <NavRow icon="📋" iconBg="rgba(10,132,255,.15)" label={t.nav.apps} onClick={() => navigate("apps")} locked={!me.isActivated} />
        <NavRow icon="⭐" iconBg="rgba(255,214,10,.15)" label={t.nav.favorites} value={me.favoritesCount || null} onClick={() => navigate("favorites")} />
        <NavRow icon="🏆" iconBg="rgba(255,214,10,.15)" label={t.nav.rating} value={`#${me.place}`} onClick={() => navigate("rating")} />
        <NavRow icon="✚" iconBg="rgba(48,209,88,.15)" label={t.nav.result} onClick={() => navigate("result")} locked={!me.isActivated} />
        <NavRow icon="📜" iconBg="rgba(191,90,242,.15)" label={t.nav.history} onClick={() => navigate("history")} />
        <NavRow
          icon="🏅" iconBg="rgba(255,214,10,.12)"
          label={t.nav.achievements}
          badge={me.unseenAchievements}
          onClick={() => navigate("achievements")}
        />
        <NavRow icon="🥇" iconBg="rgba(255,159,10,.12)" label={t.nav.records} onClick={() => navigate("records")} />
      </div>

      <div className="card">
        <NavRow icon="⚙️" iconBg="rgba(99,99,102,.3)" label={t.nav.settings} onClick={() => navigate("settings")} />
        <NavRow icon="📖" iconBg="rgba(255,255,255,.08)" label={t.x.rulesBtn} onClick={() => setRules(true)} />
      </div>

      {(me.role === "admin" || me.isSuper) && (
        <div className="card">
          {me.role === "admin" && (
            <NavRow icon="🛡" iconBg="rgba(255,159,10,.15)" label={t.x.adminPanel.replace("🛡 ", "")} onClick={() => navigate("admin")} />
          )}
          {me.isSuper && (
            <NavRow icon="⚡" iconBg="rgba(255,214,10,.2)" label={t.nav.superadmin} onClick={() => navigate("superadmin")} />
          )}
        </div>
      )}

      <LiveFeed navigate={navigate} />
    </>
  );
}

export function SearchListScreen({ navigate }) {
  const { t, toastError } = useApp();
  const [players, setPlayers] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api.get("/search/list")
        .then((r) => alive && setPlayers(r.players))
        .catch((e) => alive && (players === null ? toastError(e) : null));
    load();
    const id = setInterval(load, 10000);
    return () => { alive = false; clearInterval(id); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (players === null) return <Spinner />;
  if (!players.length) return <Empty icon="🔍" text={t.x.whoSearchingEmpty} />;

  return (
    <div className="card">
      {players.map((p) => (
        <div className="row" key={p.id} style={{ cursor: "pointer" }} onClick={() => navigate("player", { playerId: p.id, title: p.name })}>
          <Ava id={p.id} name={p.name} />
          <div className="row-info">
            <div className="row-name">{p.name}<Crown role={p.role} /></div>
            <div className="row-meta">{p.elo} {t.elo} · {t.discOpts[p.disc]} · {t.paysOpts[p.pays]}</div>
          </div>
          <RevealContact contact={p.contact} t={t.apps} />
        </div>
      ))}
    </div>
  );
}
