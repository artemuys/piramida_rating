import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useApp } from "../store.jsx";
import { Ava, Crown, Spinner, Empty, ContactLink } from "../components.jsx";
import { fmtDateTime, fmtDate } from "../util.js";
import { haptic, tgConfirm } from "../telegram.js";

/** Панель администратора: поиск/список игроков */
export function Admin({ navigate }) {
  const { t, toastError } = useApp();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState(null);
  const debounceRef = useRef(null);

  const load = useCallback((q) => {
    api.get(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`)
      .then((r) => setUsers(r.users))
      .catch((e) => { toastError(e); setUsers([]); });
  }, [toastError]);

  useEffect(() => { load(""); }, [load]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(query.trim()), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, load]);

  return (
    <div className="card">
      <div className="inp-wrap" style={{ paddingTop: 16 }}>
        <input
          className="inp"
          placeholder={t.admin.searchPh}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {users === null && <Spinner />}
      {users !== null && (
        <>
          <div className="hint" style={{ paddingTop: 0 }}>{t.admin.allPlayers}</div>
          {users.map((u) => (
            <div className="row" key={u.id} style={{ cursor: "pointer" }} onClick={() => navigate("admin-player", { playerId: u.id })}>
              <Ava id={u.id} name={u.name} />
              <div className="row-info">
                <div className="row-name">{u.name}<Crown role={u.role} /></div>
                <div className="row-meta">{t.idLabel} {u.id} · {u.elo} {t.elo}</div>
              </div>
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                {u.isCheckedIn && <span className="badge badge-green">{t.admin.statusCheckin}</span>}
                {u.isActivated
                  ? <span className="badge badge-blue">{t.admin.statusActive}</span>
                  : <span className="badge badge-red">{t.admin.statusBlocked}</span>}
              </div>
              <span className="list-row-chevron" style={{ marginLeft: 6 }}>›</span>
            </div>
          ))}
          <div style={{ height: 8 }} />
        </>
      )}
    </div>
  );
}

function ActionRow({ title, sub, btnLabel, btnClass, disabled, onClick }) {
  return (
    <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.45)", marginTop: 2 }}>{sub}</div>
      </div>
      <button
        className={`btn-tonal ${btnClass}`}
        style={{ width: "auto", padding: "9px 18px", fontSize: 15, flexShrink: 0 }}
        disabled={disabled}
        onClick={onClick}
      >
        {btnLabel}
      </button>
    </div>
  );
}

/** Карточка игрока в админке: чекин / активация / деактивация */
export function AdminPlayer({ params }) {
  const { t, lang, toastError, toast } = useApp();
  const playerId = params.playerId;
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get(`/admin/users/${playerId}`)
      .then(setData)
      .catch((e) => { setFailed(true); toastError(e); });
  }, [playerId, toastError]);

  useEffect(() => { load(); }, [load]);

  if (failed) return <Empty icon="❓" text={t.result.notFound} />;
  if (!data) return <Spinner />;

  const u = data.user;

  async function act(action, confirmMsg) {
    if (busy) return;
    if (confirmMsg && !(await tgConfirm(confirmMsg))) return;
    setBusy(true);
    try {
      await api.post(`/admin/users/${u.id}/${action}`);
      haptic("ok");
      toast("✓", "ok");
      load();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        <div style={{ padding: "22px 20px 16px", display: "flex", alignItems: "center", gap: 16 }}>
          <Ava id={u.id} name={u.name} size={64} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="adm-name">
              {u.name}<Crown role={u.role} />
              {u.isActivated
                ? <span className="badge badge-green">{t.admin.statusActive}</span>
                : <span className="badge badge-red">{t.admin.statusBlocked}</span>}
            </div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,.55)" }}>
              {t.idLabel} {u.id} · {u.elo} {t.elo} · {u.contact ? <ContactLink contact={u.contact} /> : t.noContact}
            </div>
          </div>
        </div>
        <div className="stats-row">
          <div className="stat"><div className="stat-val">{u.elo}</div><div className="stat-lbl">{t.elo}</div></div>
          <div className="stat">
            <div className="stat-val">{u.isCheckedIn ? "✓" : "—"}</div>
            <div className="stat-lbl">{t.admin.statusCheckin}</div>
          </div>
          <div className="stat">
            <div className="stat-val">{u.isActivated ? "✓" : "✗"}</div>
            <div className="stat-lbl">{t.admin.statusActive}</div>
          </div>
        </div>
        <div className="s-hint" style={{ padding: "10px 20px 14px" }}>
          {u.isCheckedIn && <>✓ {t.x.checkinUntil} {fmtDateTime(u.checkedInUntil, lang)}<br /></>}
          {u.isActivated && <>{t.x.activatedUntilLbl} {fmtDateTime(u.activatedUntil, lang)}</>}
        </div>
      </div>

      <div className="card">
        <div className="s-sect">{t.admin.actions}</div>
        <ActionRow
          title={`✓ ${t.admin.checkin}`}
          sub={t.admin.checkinSub}
          btnLabel={t.admin.checkin}
          btnClass="green"
          disabled={busy}
          onClick={() => act("checkin")}
        />
        <ActionRow
          title={t.admin.activate}
          sub={t.admin.activateSub}
          btnLabel={t.admin.activate}
          btnClass="blue"
          disabled={busy}
          onClick={() => act("activate")}
        />
        <ActionRow
          title={t.admin.deactivate}
          sub={t.admin.deactivateSub}
          btnLabel={t.admin.deactivate}
          btnClass="red"
          disabled={busy}
          onClick={() => act("deactivate", t.admin.deactivateConfirm)}
        />
      </div>

      <div className="card">
        <div className="s-sect">{t.admin.recentMatches}</div>
        {data.recentMatches.length === 0
          ? <div className="empty" style={{ padding: 24 }}>{t.admin.noMatches}</div>
          : data.recentMatches.map((m) => (
            <div className="row" key={m.id}>
              <div className="dot" style={{ background: m.won === null ? "#636366" : m.won ? "#30D158" : "#FF453A" }} />
              <div className="row-info">
                <div className="row-name">{m.opponentName}</div>
                <div className="row-meta">{fmtDate(m.date, lang)} · {m.status}</div>
              </div>
              {m.delta !== null && (
                <span style={{ fontWeight: 600, fontSize: 15, color: m.won ? "#30D158" : "#FF453A" }}>
                  {m.delta > 0 ? "+" : ""}{m.delta}
                </span>
              )}
            </div>
          ))}
      </div>
    </>
  );
}
