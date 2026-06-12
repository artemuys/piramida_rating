import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useApp } from "../store.jsx";
import { Ava, Crown, Spinner } from "../components.jsx";

/** Экран «Внести результат»: поиск по ID + 5 последних соперников */
export function Result({ navigate }) {
  const { t, toastError } = useApp();
  const [idVal, setIdVal] = useState("");
  const [found, setFound] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [recent, setRecent] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    api.get("/recent-opponents")
      .then((r) => setRecent(r.opponents))
      .catch(() => setRecent([]));
  }, []);

  useEffect(() => {
    setFound(null);
    setNotFound(false);
    clearTimeout(debounceRef.current);
    const id = idVal.trim();
    if (!/^\d{1,9}$/.test(id)) return;
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await api.get(`/players/${id}`);
        setFound(r.player);
      } catch (e) {
        if (e.code === "player_not_found") setNotFound(true);
        else toastError(e);
      }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [idVal, toastError]);

  return (
    <div className="card">
      <div className="inp-wrap" style={{ paddingTop: 16 }}>
        <input
          className={`inp${found ? " ok" : ""}`}
          placeholder={t.result.placeholder}
          value={idVal}
          inputMode="numeric"
          onChange={(e) => setIdVal(e.target.value.replace(/\D/g, ""))}
        />
        {found && (
          <div className="found-box" style={{ cursor: "pointer", marginTop: 10 }} onClick={() => navigate("player", { playerId: found.id, title: found.name })}>
            <div className="found-name">{found.name}<Crown role={found.role} /> <span className="list-row-chevron" style={{ fontSize: 15 }}>›</span></div>
            <div className="found-meta">{t.idLabel} {found.id} · {found.elo} {t.elo} · {t.result.goToProfile}</div>
          </div>
        )}
        {notFound && (
          <div className="hint" style={{ padding: "12px 0 0", textAlign: "left" }}>{t.result.notFound}</div>
        )}
      </div>

      {!found && idVal === "" && (
        <>
          <div className="hint" style={{ paddingTop: 4 }}>{t.result.recentMatches}</div>
          {recent === null && <Spinner />}
          {recent !== null && recent.length === 0 && (
            <div className="hint" style={{ paddingBottom: 18 }}>{t.result.emptyRecent}</div>
          )}
          {recent !== null && recent.map((p) => (
            <div className="row" key={p.id} style={{ cursor: "pointer" }} onClick={() => navigate("player", { playerId: p.id, title: p.name })}>
              <div className="dot" style={{ background: p.lastDelta > 0 ? "#30D158" : "#FF453A" }} />
              <Ava id={p.id} name={p.name} />
              <div className="row-info">
                <div className="row-name">{p.name}<Crown role={p.role} /></div>
                <div className="row-meta">{t.idLabel} {p.id} · {p.elo} {t.elo}</div>
              </div>
              <span style={{ fontWeight: 600, fontSize: 15, color: p.lastDelta > 0 ? "#30D158" : "#FF453A" }}>
                {p.lastDelta > 0 ? "+" : ""}{p.lastDelta}
              </span>
            </div>
          ))}
          {recent !== null && recent.length > 0 && (
            <div className="hint" style={{ paddingBottom: 16 }}>{t.result.tapToGo}</div>
          )}
        </>
      )}
    </div>
  );
}
