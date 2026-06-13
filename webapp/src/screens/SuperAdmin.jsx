import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useApp } from "../store.jsx";
import { Ava, Crown, Spinner, Empty } from "../components.jsx";
import { haptic, tgConfirm } from "../telegram.js";

export function SuperAdmin({ navigate }) {
  const { t, toast, toastError } = useApp();
  const [tab, setTab] = useState("users");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState(null);
  const [announceText, setAnnounceText] = useState("");
  const [announcements, setAnnouncements] = useState(null);
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef(null);

  const loadUsers = useCallback((q) => {
    api.get(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`)
      .then(r => setUsers(r.users))
      .catch(e => { toastError(e); setUsers([]); });
  }, [toastError]);

  const loadAnnouncements = useCallback(() => {
    api.get("/announcements").then(r => setAnnouncements(r.announcements)).catch(toastError);
  }, [toastError]);

  useEffect(() => { if (tab === "users") loadUsers(""); }, [tab, loadUsers]);
  useEffect(() => { if (tab === "announce") loadAnnouncements(); }, [tab, loadAnnouncements]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => tab === "users" && loadUsers(query.trim()), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, tab, loadUsers]);

  async function act(url, confirmMsg, okMsg) {
    if (busy) return;
    if (confirmMsg && !(await tgConfirm(confirmMsg))) return;
    setBusy(true);
    try {
      await api.post(url);
      haptic("ok");
      toast(okMsg || "✓", "ok");
      loadUsers(query.trim());
    } catch (e) { toastError(e); }
    finally { setBusy(false); }
  }

  async function sendAnnounce() {
    if (!announceText.trim() || busy) return;
    setBusy(true);
    try {
      await api.post("/admin/announce", { text: announceText.trim() });
      haptic("ok");
      toast("📢 Объявление опубликовано", "ok");
      setAnnounceText("");
      loadAnnouncements();
    } catch (e) { toastError(e); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="card">
        <div style={{ display: "flex", padding: "12px 16px 0", gap: 8 }}>
          {["users", "announce"].map(tb => (
            <button
              key={tb}
              className={`tog${tab === tb ? " on" : ""}`}
              style={{ flex: 1, padding: "8px", fontSize: 14 }}
              onClick={() => setTab(tb)}
            >
              {tb === "users" ? "👥 Игроки" : "📢 Объявления"}
            </button>
          ))}
        </div>

        {tab === "users" && (
          <>
            <div className="inp-wrap" style={{ paddingTop: 14 }}>
              <input
                className="inp"
                placeholder="ID или имя игрока"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            {users === null && <Spinner />}
            {users !== null && users.map(u => (
              <div key={u.id} className="sadm-row">
                <div className="sadm-info" onClick={() => navigate("admin-player", { playerId: u.id })} style={{ cursor: "pointer", flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "10px 0 10px 20px" }}>
                  <Ava id={u.id} name={u.name} />
                  <div>
                    <div style={{ fontWeight: 500 }}>{u.name}<Crown role={u.role} /></div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)" }}>
                      {u.id} · {u.elo} эло
                      {u.banned && <span style={{ color: "#FF453A", marginLeft: 6 }}>🚫 забанен</span>}
                      {u.isSuper && <span style={{ color: "#FFD60A", marginLeft: 6 }}>★ супер</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, padding: "0 16px", flexShrink: 0 }}>
                  {!u.banned
                    ? <button className="btn-tonal red" style={{ padding: "6px 10px", fontSize: 12, width: "auto" }} disabled={busy}
                        onClick={() => act(`/admin/users/${u.id}/ban`, `Забанить ${u.name}?`, "Забанен")}>
                        Бан
                      </button>
                    : <button className="btn-tonal green" style={{ padding: "6px 10px", fontSize: 12, width: "auto" }} disabled={busy}
                        onClick={() => act(`/admin/users/${u.id}/unban`, null, "Разбанен")}>
                        Разбан
                      </button>
                  }
                  {u.role !== "admin"
                    ? <button className="btn-tonal blue" style={{ padding: "6px 10px", fontSize: 12, width: "auto" }} disabled={busy}
                        onClick={() => act(`/admin/users/${u.id}/promote`, `Сделать ${u.name} админом?`, "Роль выдана")}>
                        Адм
                      </button>
                    : <button className="btn-tonal" style={{ padding: "6px 10px", fontSize: 12, width: "auto" }} disabled={busy}
                        onClick={() => act(`/admin/users/${u.id}/demote`, `Снять admin с ${u.name}?`, "Роль снята")}>
                        Снять
                      </button>
                  }
                </div>
              </div>
            ))}
            <div style={{ height: 8 }} />
          </>
        )}

        {tab === "announce" && (
          <div style={{ padding: "14px 20px 20px" }}>
            <textarea
              className="duel-textarea"
              placeholder="Текст объявления…"
              rows={4}
              maxLength={1000}
              value={announceText}
              onChange={e => setAnnounceText(e.target.value)}
            />
            <button
              className="btn-primary"
              style={{ marginTop: 10 }}
              disabled={busy || !announceText.trim()}
              onClick={sendAnnounce}
            >
              📢 Опубликовать
            </button>
          </div>
        )}
      </div>

      {tab === "announce" && announcements !== null && announcements.length > 0 && (
        <div className="card">
          <div className="s-sect">История объявлений</div>
          {announcements.map(a => (
            <div key={a.id} className="announce-row">
              <div className="announce-author">{a.authorName}</div>
              <div className="announce-text">{a.text}</div>
              <div className="announce-date">
                {new Date(a.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
