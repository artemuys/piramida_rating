import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useApp } from "../store.jsx";
import { Ava, Crown, RulesModal, Spinner, Stats, Empty, RankBadge, LevelBar, StreakBadge } from "../components.jsx";
import { useNow, fmtElapsed, fmtDateTime } from "../util.js";
import { haptic } from "../telegram.js";
import { ACH_META } from "./Achievements.jsx";

function NavRow({ icon, iconBg, label, value, onClick, locked, badge }) {
  return (
    <div className={`list-row${locked ? " locked" : ""}`} onClick={locked ? undefined : onClick}>
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
  const [disc, setDisc] = useState(me.searching?.disc ?? me.prefDisc);
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
              {t.discOpts[disc]} · {t.paysOpts[pays]}
            </span>
          </>
        )}
        <span className="chevron">▾</span>
      </button>
      {open && (
        <div className="search-expand">
          <div className="search-expand-row">
            <span className="search-expand-lbl">{t.search.discipline}</span>
            <div className="search-tog-g">
              {t.discOpts.map((d, i) => (
                <button key={i} className={`search-tog${disc === i ? " on" : ""}`} onClick={() => setDisc(i)}>{d}</button>
              ))}
            </div>
          </div>
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

function LiveFeed({ navigate }) {
  const [feed, setFeed] = useState(null);
  const [announcements, setAnnouncements] = useState([]);

  useEffect(() => {
    api.get("/feed").then(r => setFeed(r.feed)).catch(() => setFeed([]));
    api.get("/announcements").then(r => setAnnouncements(r.announcements.slice(0, 2))).catch(() => {});
  }, []);

  if (!feed && !announcements.length) return null;
  if (feed !== null && feed.length === 0 && !announcements.length) return null;

  function feedText(item) {
    const d = item.data || {};
    switch (item.type) {
      case "match_win":
        return `🏆 ${d.winnerName || item.actorName} обыграл ${d.loserName || item.targetName} (+${d.delta || "?"})`;
      case "achievement": {
        const meta = ACH_META[d.code] || { icon: "🏅", label: d.code };
        return `${meta.icon} ${d.name || item.actorName} получил «${meta.label}»`;
      }
      case "rank_up":
        return `⬆️ ${d.name || item.actorName} достиг ${d.rank}`;
      case "season_end":
        return "🔄 Новый сезон начался!";
      case "new_player":
        return `👋 ${d.name || item.actorName} присоединился к клубу`;
      default:
        return `• ${item.actorName || ""}`;
    }
  }

  function getActorId(item) {
    if (item.type === "match_win") return item.actorId;
    if (item.type === "achievement") return item.actorId;
    return null;
  }

  return (
    <div className="card feed-card">
      <div className="feed-header">
        <span className="feed-title">🔴 Живая лента клуба</span>
      </div>
      {announcements.map(a => (
        <div key={`ann-${a.id}`} className="feed-item feed-announce">
          <span className="feed-icon">📢</span>
          <div className="feed-content">
            <div className="feed-text">{a.text}</div>
            <div className="feed-meta">{a.authorName}</div>
          </div>
        </div>
      ))}
      {(feed || []).map(item => {
        const actorId = getActorId(item);
        return (
          <div
            key={item.id}
            className={`feed-item${actorId ? " clickable" : ""}`}
            onClick={() => actorId && navigate("player", { playerId: actorId, title: item.actorName })}
          >
            <div className="feed-content">
              <div className="feed-text">{feedText(item)}</div>
              <div className="feed-meta">{fmtElapsed(Date.now() - item.createdAt)} назад</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Home({ navigate }) {
  const { me, t, lang } = useApp();
  const [rules, setRules] = useState(false);

  return (
    <>
      {rules && <RulesModal onClose={() => setRules(false)} />}

      <div className="card hero-card">
        <div className="user-hero">
          <div className="user-hero-text">
            <div className="user-name">
              👋 {me.name.split(" ")[0]}
              {me.role === "admin" && !me.isSuper && <span className="badge badge-yellow">👑 admin</span>}
              {me.isSuper && <span className="badge badge-yellow">⚡ super</span>}
              {me.searching && <span className="badge badge-green">{t.nav.searching}</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              <RankBadge elo={me.elo} />
              {me.streak !== 0 && <StreakBadge streak={me.streak} />}
            </div>
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

        {!me.isActivated && (
          <div className="alert alert-r">
            <div className="alert-t">🚫 {t.x.alertNotActivatedT}</div>
            {t.x.alertNotActivatedM}
          </div>
        )}

        <div className="btn-stack">
          <SearchBlock />
          {me.isActivated && (
            <div className="btn-stack-row">
              <button className="btn-tonal" onClick={() => navigate("search-list")}>👥 {t.nav.whoSearching}</button>
              <button
                className={`btn-tonal${me.pendingDuels > 0 ? " yellow" : ""}`}
                style={{ position: "relative" }}
                onClick={() => navigate("duels")}
              >
                ⚔️ {t.nav.duels}
                {me.pendingDuels > 0 && <span className="btn-badge">{me.pendingDuels}</span>}
              </button>
            </div>
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
        <NavRow icon="⚙️" iconBg="rgba(99,99,102,.3)" label={t.nav.settings} onClick={() => navigate("settings")} />
        {me.role === "admin" && (
          <NavRow icon="🛡" iconBg="rgba(255,159,10,.15)" label={t.x.adminPanel.replace("🛡 ", "")} onClick={() => navigate("admin")} />
        )}
        {me.isSuper && (
          <NavRow icon="⚡" iconBg="rgba(255,214,10,.2)" label={t.nav.superadmin} onClick={() => navigate("superadmin")} />
        )}
      </div>

      <div className="card">
        <NavRow icon="📖" iconBg="rgba(255,255,255,.08)" label={t.x.rulesBtn} onClick={() => setRules(true)} />
      </div>

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
          <span className="tg">{p.contact}</span>
        </div>
      ))}
    </div>
  );
}
