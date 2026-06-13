import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useApp } from "../store.jsx";
import { Ava, Crown, Spinner, Empty, RankBadge } from "../components.jsx";
import { fmtDate, rankOf } from "../util.js";
import { LOCALES } from "../i18n.js";

/** Рейтинг клуба: топ-100, текущий пользователь подсвечен */
export function Rating({ navigate }) {
  const { me, t, lang, toastError } = useApp();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/rating").then(setData).catch(toastError);
  }, [toastError]);

  if (!data) return <Spinner />;

  const inTop = data.top.some((p) => p.id === me.id);
  const season = data.season;
  const rs = t.season_ext;
  const seasonEndStr = season
    ? new Date(season.endsAt).toLocaleDateString(LOCALES[lang] ?? "ru-RU", { day: "numeric", month: "numeric", year: "numeric" })
    : null;

  return (
    <>
    {season && (
      <div className="card" style={{ padding: "14px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 18 }}>🏆</span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{rs.season}{season.id}</span>
          <span style={{ marginLeft: "auto", fontSize: 13, color: "#FF9F0A", fontWeight: 600 }}>
            {rs.ends} {seasonEndStr}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.5)", lineHeight: 1.55 }}>
          {rs.hint}
        </div>
      </div>
    )}
    <div className="card">
      {data.top.map((p, i) => {
        const you = p.id === me.id;
        return (
          <div
            key={p.id}
            className={`r-row${you ? " r-you" : ""}`}
            onClick={() => !you && navigate("player", { playerId: p.id, title: p.name })}
          >
            <span className="r-pos">
              {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
            </span>
            <Ava id={p.id} name={p.name} ringColor={rankOf(p.elo).color} />
            <span className="r-name" style={{ minWidth: 0 }}>
              <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.name}<Crown role={p.role} />
                {you && <span className="r-you-lbl">{t.rating.you}</span>}
              </span>
              <RankBadge elo={p.elo} size="sm" />
            </span>
            <span className="r-elo">{p.elo}</span>
          </div>
        );
      })}
      {!inTop && (
        <div className="r-row r-you">
          <span className="r-pos">{data.me.place}</span>
          <Ava id={me.id} name={me.name} />
          <span className="r-name">{me.name}<span className="r-you-lbl">{t.rating.you}</span></span>
          <span className="r-elo">{me.elo}</span>
        </div>
      )}
      <div className="hint" style={{ paddingBottom: 14 }}>··· {t.nav.rating} · TOP-100 ···</div>
    </div>
    </>
  );
}

/** История моих матчей (последние 10), строки ведут в профиль соперника */
export function History({ navigate }) {
  const { t, lang, toastError } = useApp();
  const [matches, setMatches] = useState(null);

  useEffect(() => {
    api.get("/history").then((r) => setMatches(r.matches)).catch((e) => { toastError(e); setMatches([]); });
  }, [toastError]);

  if (matches === null) return <Spinner />;
  if (!matches.length) return <Empty icon="📜" text={t.x.noHistory} />;

  return (
    <div className="card">
      {matches.map((m) => (
        <div className="row" key={m.id} style={{ cursor: "pointer" }} onClick={() => navigate("player", { playerId: m.opponent.id, title: m.opponent.name })}>
          <div className="dot" style={{ background: m.iWon ? "#30D158" : "#FF453A" }} />
          <Ava id={m.opponent.id} name={m.opponent.name} />
          <div className="row-info">
            <div className="row-name">{m.opponent.name}<Crown role={m.opponent.role} /></div>
            <div className="row-meta">{fmtDate(m.date, lang)}</div>
          </div>
          <span style={{ fontWeight: 600, fontSize: 16, color: m.iWon ? "#30D158" : "#FF453A", marginRight: 4 }}>
            {m.delta > 0 ? "+" : ""}{m.delta}
          </span>
          <span className="list-row-chevron">›</span>
        </div>
      ))}
    </div>
  );
}

/** Избранные игроки */
export function Favorites({ navigate }) {
  const { t, toastError } = useApp();
  const [favorites, setFavorites] = useState(null);

  useEffect(() => {
    api.get("/favorites").then((r) => setFavorites(r.favorites)).catch((e) => { toastError(e); setFavorites([]); });
  }, [toastError]);

  if (favorites === null) return <Spinner />;
  if (!favorites.length) return <Empty icon="⭐" text={t.x.noFavs} hint={t.x.noFavsHint} />;

  return (
    <div className="card">
      {favorites.map((p) => (
        <div className="list-row" key={p.id} onClick={() => navigate("player", { playerId: p.id, title: p.name })}>
          <Ava id={p.id} name={p.name} ringColor={rankOf(p.elo).color} />
          <span className="list-row-label">{p.name}<Crown role={p.role} /></span>
          <span className="list-row-value">{p.elo} {t.elo}</span>
          <span className="list-row-chevron">›</span>
        </div>
      ))}
    </div>
  );
}
