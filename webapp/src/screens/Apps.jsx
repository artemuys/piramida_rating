import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { useApp } from "../store.jsx";
import { Ava, Crown, Spinner } from "../components.jsx";
import { fmtDayLabel } from "../util.js";
import { haptic } from "../telegram.js";

function NewRequestForm({ onDone, onCancel }) {
  const { me, t, toastError } = useApp();
  const [dayOffset, setDayOffset] = useState(1);
  const [timeSlot, setTimeSlot] = useState(0);
  const isPool = me.activeDiscipline !== 'pyramid';
  // В пуле дисциплина фиксирована (American=0), в пирамиде — выбор как раньше
  const [disc, setDisc] = useState(isPool ? 0 : (me.prefDisc === 2 ? 1 : me.prefDisc));
  const [pays, setPays] = useState(me.prefPays);
  const [busy, setBusy] = useState(false);

  const DAY_OFFSETS = [1, 2, 3];
  const dayLabels = [t.apps.tomorrow, fmtDayLabel(offsetDay(2), t, me.lang), fmtDayLabel(offsetDay(3), t, me.lang)];

  async function create() {
    if (busy) return;
    setBusy(true);
    try {
      await api.post("/requests", { dayOffset, timeSlot, disc, pays });
      haptic("ok");
      onDone();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  }

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
      <div className="s-sect" style={{ paddingTop: 12 }}>{t.apps.newTitle}</div>
      <div className="tog-wrap">
        <div className="tog-lbl">{t.apps.day}</div>
        <div className="tog-g">
          {dayLabels.map((label, i) => (
            <button key={i} className={`tog${dayOffset === DAY_OFFSETS[i] ? " on" : ""}`} onClick={() => setDayOffset(DAY_OFFSETS[i])}>{label}</button>
          ))}
        </div>
      </div>
      <div className="tog-wrap">
        <div className="tog-lbl">{t.apps.time}</div>
        <div className="tog-g">
          {t.timeOpts.map((tv, i) => (
            <button key={i} className={`tog${timeSlot === i ? " on" : ""}`} onClick={() => setTimeSlot(i)}>{tv}</button>
          ))}
        </div>
      </div>
      {!isPool && (
        <div className="tog-wrap">
          <div className="tog-lbl">{t.apps.disc}</div>
          <div className="tog-g">
            {t.reqDiscOpts.map((d, i) => (
              <button key={i} className={`tog${disc === i ? " on" : ""}`} onClick={() => setDisc(i)}>{d}</button>
            ))}
          </div>
        </div>
      )}
      <div className="tog-wrap">
        <div className="tog-lbl">{t.apps.pays}</div>
        <div className="tog-g">
          {t.paysOpts.map((p, i) => (
            <button key={i} className={`tog${pays === i ? " on" : ""}`} onClick={() => setPays(i)}>{p}</button>
          ))}
        </div>
      </div>
      <div className="btn-stack">
        <button className="btn-primary green" disabled={busy} onClick={create}>{t.apps.create}</button>
        <button className="btn-tonal" onClick={onCancel}>{t.apps.cancel}</button>
      </div>
    </div>
  );
}

function offsetDay(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function Apps({ navigate }) {
  const { me, t, toastError } = useApp();
  const [mine, setMine] = useState(null);
  const [feed, setFeed] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, f] = await Promise.all([api.get("/requests/mine"), api.get("/requests/feed")]);
      setMine(m.requests);
      setFeed(f.feed);
    } catch (e) {
      toastError(e);
      setMine((v) => v ?? []);
      setFeed((v) => v ?? []);
    }
  }, [toastError]);

  useEffect(() => { load(); }, [load]);

  async function remove(id) {
    try {
      await api.del(`/requests/${id}`);
      setMine((prev) => prev.filter((x) => x.id !== id));
    } catch (e) { toastError(e); }
  }

  if (mine === null || feed === null) return <Spinner />;

  const byDay = new Map();
  for (const r of feed) {
    if (!byDay.has(r.day)) byDay.set(r.day, []);
    byDay.get(r.day).push(r);
  }

  return (
    <>
      <div className="card">
        <div className="s-sect">{t.apps.myApps}</div>
        {mine.length === 0 && !showNew && (
          <div style={{ padding: "12px 20px 4px", color: "rgba(255,255,255,.4)", fontSize: 14 }}>{t.apps.noApps}</div>
        )}
        {mine.map((a) => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", padding: "11px 20px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: "-.01em" }}>{fmtDayLabel(a.day, t, me.lang)}</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.45)", marginTop: 2 }}>
                {t.timeOpts[a.timeSlot]} · {t.reqDiscOpts[a.disc]} · {t.paysOpts[a.pays]}
              </div>
            </div>
            <button
              onClick={() => remove(a.id)}
              style={{ background: "none", border: "none", color: "#FF453A", fontSize: 14, cursor: "pointer", padding: "4px 0 4px 12px", fontFamily: "inherit" }}
            >
              {t.apps.delete}
            </button>
          </div>
        ))}
        {showNew
          ? <NewRequestForm onDone={() => { setShowNew(false); load(); }} onCancel={() => setShowNew(false)} />
          : (
            <div style={{ padding: "12px 20px 16px" }}>
              <button className="btn-tonal blue" onClick={() => setShowNew(true)}>{t.apps.newApp}</button>
            </div>
          )}
      </div>

      {feed.length === 0 && <div className="hint" style={{ paddingBottom: 8 }}>{t.apps.emptyFeed}</div>}

      {[...byDay.entries()].map(([day, items]) => (
        <div className="card" key={day}>
          <div className="s-sect">{fmtDayLabel(day, t, me.lang)}</div>
          {items.map((r) => (
            <div className="row" key={r.id} style={{ cursor: "pointer" }} onClick={() => navigate("player", { playerId: r.player.id, title: r.player.name })}>
              <Ava id={r.player.id} name={r.player.name} />
              <div className="row-info">
                <div className="row-name">
                  {r.player.name}<Crown role={r.player.role} />{" "}
                  <span style={{ color: "rgba(255,255,255,.4)", fontWeight: 400, fontSize: 13 }}>{r.player.elo} {t.elo}</span>
                </div>
                <div className="row-meta">
                  {t.timeOpts[r.timeSlot]} · {t.reqDiscOpts[r.disc]} · {t.paysOpts[r.pays]}
                </div>
              </div>
              <span className="tg" style={{ fontSize: 13, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.player.contact}
              </span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
