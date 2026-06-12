import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useApp } from "../store.jsx";
import { Ava, Crown, RulesModal, Spinner, Stats, Empty } from "../components.jsx";
import { useNow, fmtElapsed, fmtDateTime } from "../util.js";
import { haptic } from "../telegram.js";

function NavRow({ icon, iconBg, label, value, onClick, locked }) {
  return (
    <div className={`list-row${locked ? " locked" : ""}`} onClick={locked ? undefined : onClick}>
      <div className="list-row-icon" style={{ background: iconBg }}>{icon}</div>
      <span className="list-row-label">{label}</span>
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
  const canSearch = me.isActivated && !!me.contact;

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

export function Home({ navigate }) {
  const { me, t, lang } = useApp();
  const [rules, setRules] = useState(false);

  const noContact = !me.contact;

  return (
    <>
      {rules && <RulesModal onClose={() => setRules(false)} />}

      <div className="card">
        <div className="user-hero">
          <div className="user-hero-text">
            <div className="user-name">
              👋 {me.name.split(" ")[0]}
              {me.role === "admin" && <span className="badge badge-yellow">👑 admin</span>}
              {me.searching && <span className="badge badge-green">{t.nav.searching}</span>}
            </div>
            <div className="user-sub">
              {t.idLabel} {me.id}
              {me.isCheckedIn
                ? <span style={{ color: "#30D158" }}> · ✓ {t.x.checkinUntil} {fmtDateTime(me.checkedInUntil, lang).split(",").pop()}</span>
                : me.isActivated && <span> · {t.x.noCheckinHint}</span>}
            </div>
          </div>
        </div>
        <Stats elo={me.elo} place={me.place} matches={me.matchesCount} wins={me.winsCount} t={t} />

        {!me.isActivated && (
          <div className="alert alert-r">
            <div className="alert-t">🚫 {t.x.alertNotActivatedT}</div>
            {t.x.alertNotActivatedM}
          </div>
        )}
        {me.isActivated && noContact && (
          <div className="alert alert-y">
            <div className="alert-t">⚠ {t.x.alertNoContactT}</div>
            {t.x.alertNoContactM}
          </div>
        )}

        <div className="btn-stack">
          {me.isActivated && noContact && (
            <button className="btn-primary yellow" onClick={() => navigate("settings")}>{t.x.goSettings}</button>
          )}
          <SearchBlock />
          {me.isActivated && (
            <button className="btn-tonal" onClick={() => navigate("search-list")}>👥 {t.nav.whoSearching}</button>
          )}
        </div>
      </div>

      <div className="card">
        <NavRow icon="📋" iconBg="rgba(10,132,255,.15)" label={t.nav.apps} onClick={() => navigate("apps")} locked={!me.isActivated || noContact} />
        <NavRow icon="⭐" iconBg="rgba(255,214,10,.15)" label={t.nav.favorites} value={me.favoritesCount || null} onClick={() => navigate("favorites")} />
        <NavRow icon="🏆" iconBg="rgba(255,214,10,.15)" label={t.nav.rating} value={`#${me.place}`} onClick={() => navigate("rating")} />
        <NavRow icon="✚" iconBg="rgba(48,209,88,.15)" label={t.nav.result} onClick={() => navigate("result")} locked={!me.isActivated} />
        <NavRow icon="📜" iconBg="rgba(191,90,242,.15)" label={t.nav.history} onClick={() => navigate("history")} />
        <NavRow icon="⚙️" iconBg="rgba(99,99,102,.3)" label={t.nav.settings} onClick={() => navigate("settings")} />
        {me.role === "admin" && (
          <NavRow icon="🛡" iconBg="rgba(255,159,10,.15)" label={t.x.adminPanel.replace("🛡 ", "")} onClick={() => navigate("admin")} />
        )}
      </div>

      <div className="card">
        <NavRow icon="📖" iconBg="rgba(255,255,255,.08)" label={t.x.rulesBtn} onClick={() => setRules(true)} />
      </div>
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
