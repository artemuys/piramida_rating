import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useApp } from "../store.jsx";
import { Ava, Crown, Spinner, Empty } from "../components.jsx";
import { haptic, tgConfirm } from "../telegram.js";
import { fmtAgo } from "../util.js";

const TABS = [
  { id: "users",     label: "👥 Игроки" },
  { id: "matches",   label: "🎱 Матчи" },
  { id: "announce",  label: "📢 Объявления" },
  { id: "seasons",   label: "🏆 Сезоны" },
  { id: "conflicts", label: "⚔️ Конфликты" },
  { id: "audit",     label: "📋 Аудит" },
  { id: "stats",     label: "📊 Статистика" },
];

export function SuperAdmin({ navigate }) {
  const { t, toast, toastError } = useApp();
  const [tab, setTab] = useState("users");

  return (
    <>
      <div className="card" style={{ padding: "12px 16px 0" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TABS.map(tb => (
            <button
              key={tb.id}
              className={`tog${tab === tb.id ? " on" : ""}`}
              style={{ padding: "7px 12px", fontSize: 13 }}
              onClick={() => setTab(tb.id)}
            >
              {tb.label}
            </button>
          ))}
        </div>
        <div style={{ height: 12 }} />
      </div>

      {tab === "users"     && <UsersTab navigate={navigate} toast={toast} toastError={toastError} />}
      {tab === "matches"   && <MatchesTab toast={toast} toastError={toastError} />}
      {tab === "announce"  && <AnnounceTab toast={toast} toastError={toastError} />}
      {tab === "seasons"   && <SeasonsTab toast={toast} toastError={toastError} />}
      {tab === "conflicts" && <ConflictsTab toast={toast} toastError={toastError} />}
      {tab === "audit"     && <AuditTab toastError={toastError} />}
      {tab === "stats"     && <StatsTab toastError={toastError} />}
    </>
  );
}

// ── Игроки ────────────────────────────────────────────────────────────────────
function UsersTab({ navigate, toast, toastError }) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null); // expanded player panel
  const [newId, setNewId] = useState("");
  const [forceName, setForceName] = useState("");
  const debounceRef = useRef(null);

  const loadUsers = useCallback((q) => {
    api.get(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`)
      .then(r => setUsers(r.users))
      .catch(e => { toastError(e); setUsers([]); });
  }, [toastError]);

  useEffect(() => { loadUsers(""); }, [loadUsers]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadUsers(query.trim()), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, loadUsers]);

  async function act(url, confirmMsg, okMsg, method = "post") {
    if (busy) return;
    if (confirmMsg && !(await tgConfirm(confirmMsg))) return;
    setBusy(true);
    try {
      await (method === "delete" ? api.del(url) : api.post(url));
      haptic("ok");
      toast(okMsg || "✓", "ok");
      setSelected(null);
      loadUsers(query.trim());
    } catch (e) { toastError(e); }
    finally { setBusy(false); }
  }

  async function actBody(url, body, confirmMsg, okMsg) {
    if (busy) return;
    if (confirmMsg && !(await tgConfirm(confirmMsg))) return;
    setBusy(true);
    try {
      await api.post(url, body);
      haptic("ok");
      toast(okMsg || "✓", "ok");
      setSelected(null);
      loadUsers(query.trim());
    } catch (e) { toastError(e); }
    finally { setBusy(false); }
  }

  const u = selected ? users?.find(x => x.id === selected) : null;

  return (
    <>
      <div className="card">
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
          <div key={u.id} className="sadm-row" style={{ flexDirection: "column", padding: 0 }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div className="sadm-info" onClick={() => navigate("admin-player", { playerId: u.id })} style={{ cursor: "pointer", flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "10px 0 10px 20px" }}>
                <Ava id={u.id} name={u.name} />
                <div>
                  <div style={{ fontWeight: 500 }}>{u.name}<Crown role={u.role} /></div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)" }}>
                    #{u.id} · {u.elo} эло
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
                <button
                  className={`btn-tonal${selected === u.id ? " on" : ""}`}
                  style={{ padding: "6px 10px", fontSize: 12, width: "auto" }}
                  onClick={() => { setSelected(selected === u.id ? null : u.id); setNewId(""); setForceName(""); }}
                >
                  ···
                </button>
              </div>
            </div>

            {selected === u.id && (
              <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                {/* Смена имени */}
                <div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,.45)", marginBottom: 4 }}>Принудительно сменить имя</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input className="s-inp" style={{ flex: 1, fontSize: 13 }} placeholder="Новое имя" value={forceName} onChange={e => setForceName(e.target.value)} maxLength={40} />
                    <button className="btn-tonal blue" style={{ padding: "7px 12px", fontSize: 12, width: "auto" }} disabled={busy || forceName.trim().length < 2}
                      onClick={() => actBody(`/admin/users/${u.id}/set-name`, { name: forceName.trim() }, null, "Имя изменено")}>
                      Сохранить
                    </button>
                  </div>
                </div>

                {/* Кнопки действий */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn-tonal" style={{ padding: "7px 12px", fontSize: 12, width: "auto" }} disabled={busy}
                    onClick={() => act(`/admin/users/${u.id}/grant-name-change`, null, "Токен смены имени выдан")}>
                    🖊 Дать смену имени
                  </button>
                  <button className="btn-tonal" style={{ padding: "7px 12px", fontSize: 12, width: "auto" }} disabled={busy}
                    onClick={() => act(`/admin/users/${u.id}/reset-stats`, `Сбросить статистику ${u.name}? ELO → 1000`, "Статистика сброшена")}>
                    🔄 Сброс стат.
                  </button>
                  <button className="btn-tonal red" style={{ padding: "7px 12px", fontSize: 12, width: "auto" }} disabled={busy}
                    onClick={() => act(`/admin/users/${u.id}`, `УДАЛИТЬ аккаунт ${u.name} (#${u.id})? Это необратимо!`, "Игрок удалён", "delete")}>
                    🗑 Удалить
                  </button>
                </div>

                {/* Смена ID */}
                <div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,.45)", marginBottom: 4 }}>Сменить ID (текущий: #{u.id})</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      className="s-inp"
                      style={{ flex: 1, fontSize: 13 }}
                      type="number"
                      placeholder="Новый ID"
                      value={newId}
                      onChange={e => setNewId(e.target.value)}
                    />
                    <button
                      className="btn-tonal"
                      style={{ padding: "7px 12px", fontSize: 12, width: "auto" }}
                      disabled={busy || !newId || Number(newId) === u.id}
                      onClick={() => actBody(`/admin/users/${u.id}/change-id`, { newId: Number(newId) }, `Сменить ID ${u.name} с #${u.id} на #${newId}? Все ссылки будут обновлены.`, `ID изменён на #${newId}`)}
                    >
                      Применить
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        <div style={{ height: 8 }} />
      </div>
    </>
  );
}

// ── Матчи ─────────────────────────────────────────────────────────────────────
const STATUS_LABEL = {
  pending: { label: "Ожидает", color: "#FF9F0A" },
  confirmed: { label: "Подтверждён", color: "#30D158" },
  conflict: { label: "Конфликт", color: "#FF453A" },
  timeout: { label: "Таймаут", color: "rgba(255,255,255,.4)" },
  cancelled: { label: "Отменён", color: "rgba(255,255,255,.25)" },
};

function MatchesTab({ toast, toastError }) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState(null);
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef(null);

  const load = useCallback((q) => {
    api.get(`/admin/matches${q ? `?q=${encodeURIComponent(q)}` : ""}`)
      .then(r => setMatches(r.matches))
      .catch(e => { toastError(e); setMatches([]); });
  }, [toastError]);

  useEffect(() => { load(""); }, [load]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(query.trim()), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, load]);

  async function cancelMatch(m) {
    const label = m.status === "confirmed"
      ? `Аннулировать матч #${m.id}? ЭЛО будет откатено (${m.initiatorName} vs ${m.opponentName})`
      : `Отменить матч #${m.id} (${m.initiatorName} vs ${m.opponentName})?`;
    if (!(await tgConfirm(label))) return;
    setBusy(true);
    try {
      await api.post(`/admin/matches/${m.id}/cancel`);
      haptic("ok");
      toast("✓ Матч отменён", "ok");
      load(query.trim());
    } catch (e) { toastError(e); }
    finally { setBusy(false); }
  }

  return (
    <div className="card">
      <div className="inp-wrap" style={{ paddingTop: 14 }}>
        <input
          className="inp"
          placeholder="ID матча или игрока"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>
      {matches === null && <Spinner />}
      {matches !== null && matches.length === 0 && <Empty icon="🎱" text="Матчей нет" />}
      {matches !== null && matches.map(m => {
        const st = STATUS_LABEL[m.status] ?? { label: m.status, color: "rgba(255,255,255,.4)" };
        const winnerName = m.winnerId
          ? (m.winnerId === m.initiatorId ? m.initiatorName : m.opponentName)
          : null;
        return (
          <div key={m.id} className="announce-row">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,.4)" }}>
                Матч #{m.id} · {new Date(m.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: st.color }}>{st.label}</span>
            </div>
            <div style={{ fontSize: 14, marginBottom: 4 }}>
              {m.initiatorName} <span style={{ color: "rgba(255,255,255,.35)" }}>vs</span> {m.opponentName}
            </div>
            {winnerName && (
              <div style={{ fontSize: 12, color: "#30D158", marginBottom: 4 }}>
                Победил: {winnerName}{m.delta ? ` (+${m.delta} ЭЛО)` : ""}
              </div>
            )}
            {m.status !== "cancelled" && (
              <button
                className="btn-tonal red"
                style={{ padding: "5px 12px", fontSize: 12, width: "auto", marginTop: 4 }}
                disabled={busy}
                onClick={() => cancelMatch(m)}
              >
                {m.status === "confirmed" ? "🔄 Аннулировать" : "✕ Отменить"}
              </button>
            )}
          </div>
        );
      })}
      <div style={{ height: 8 }} />
    </div>
  );
}

// ── Объявления ───────────────────────────────────────────────────────────────
function AnnounceTab({ toast, toastError }) {
  const [text, setText] = useState("");
  const [announcements, setAnnouncements] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/admin/announce-all").then(r => setAnnouncements(r.announcements)).catch(toastError);
  }, [toastError]);

  useEffect(() => { load(); }, [load]);

  async function send() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await api.post("/admin/announce", { text: text.trim() });
      haptic("ok");
      toast("📢 Объявление опубликовано", "ok");
      setText("");
      load();
    } catch (e) { toastError(e); }
    finally { setBusy(false); }
  }

  async function toggle(id) {
    setBusy(true);
    try {
      await api.post(`/admin/announce/${id}/toggle`);
      load();
    } catch (e) { toastError(e); }
    finally { setBusy(false); }
  }

  async function del(id) {
    if (!(await tgConfirm("Удалить объявление?"))) return;
    setBusy(true);
    try {
      await api.del(`/admin/announce/${id}`);
      load();
    } catch (e) { toastError(e); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="card" style={{ padding: "14px 20px 20px" }}>
        <div className="s-sect">Новое объявление</div>
        <textarea
          className="duel-textarea"
          placeholder="Текст объявления…"
          rows={4}
          maxLength={1000}
          value={text}
          onChange={e => setText(e.target.value)}
        />
        <button
          className="btn-primary"
          style={{ marginTop: 10 }}
          disabled={busy || !text.trim()}
          onClick={send}
        >
          📢 Опубликовать
        </button>
      </div>

      {announcements !== null && (
        <div className="card">
          <div className="s-sect">Все объявления</div>
          {announcements.length === 0 && <Empty icon="📢" text="Нет объявлений" />}
          {announcements.map(a => (
            <div key={a.id} className="announce-row" style={{ opacity: a.active ? 1 : 0.45 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div className="announce-author">{a.authorName}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    className={`btn-tonal${a.active ? "" : " green"}`}
                    style={{ padding: "4px 10px", fontSize: 11, width: "auto" }}
                    disabled={busy}
                    onClick={() => toggle(a.id)}
                  >
                    {a.active ? "Скрыть" : "Показать"}
                  </button>
                  <button
                    className="btn-tonal red"
                    style={{ padding: "4px 10px", fontSize: 11, width: "auto" }}
                    disabled={busy}
                    onClick={() => del(a.id)}
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="announce-text">{a.text}</div>
              <div className="announce-date" style={{ display: "flex", gap: 8 }}>
                {new Date(a.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                <span style={{ color: a.active ? "#30D158" : "#FF453A" }}>{a.active ? "● Активно" : "● Скрыто"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Сезоны ────────────────────────────────────────────────────────────────────
function SeasonsTab({ toast, toastError }) {
  const [seasons, setSeasons] = useState(null);
  const [durationDays, setDurationDays] = useState(90);
  const [busy, setBusy] = useState(false);
  const [editEndDate, setEditEndDate] = useState("");

  const load = useCallback(() => {
    api.get("/admin/seasons").then(r => setSeasons(r.seasons)).catch(toastError);
  }, [toastError]);

  useEffect(() => { load(); }, [load]);

  const current = seasons?.find(s => !s.closed);

  async function openSeason() {
    if (busy) return;
    if (!(await tgConfirm(`Открыть новый сезон на ${durationDays} дней?`))) return;
    setBusy(true);
    try {
      await api.post("/admin/seasons", { durationDays: Number(durationDays) });
      haptic("ok");
      toast("✓ Сезон открыт", "ok");
      load();
    } catch (e) { toastError(e); }
    finally { setBusy(false); }
  }

  async function closeSeason(id) {
    if (!(await tgConfirm("Закрыть сезон? Эло будет сброшено, топ-3 получат достижение «Хозяин сезона»."))) return;
    setBusy(true);
    try {
      await api.post(`/admin/seasons/${id}/close`);
      haptic("ok");
      toast("✓ Сезон закрыт", "ok");
      load();
    } catch (e) { toastError(e); }
    finally { setBusy(false); }
  }

  async function updateEndDate(id) {
    if (!editEndDate) return;
    const ts = new Date(editEndDate).getTime();
    if (!ts) return;
    setBusy(true);
    try {
      await api.patch(`/admin/seasons/${id}`, { endsAt: ts });
      haptic("ok");
      toast("✓ Дата обновлена", "ok");
      setEditEndDate("");
      load();
    } catch (e) { toastError(e); }
    finally { setBusy(false); }
  }

  return (
    <>
      {current ? (
        <div className="card" style={{ padding: "16px 20px" }}>
          <div className="s-sect">Текущий сезон #{current.id}</div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.5)", marginBottom: 4 }}>
              Начало: {new Date(current.startedAt).toLocaleDateString("ru-RU")}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#FF9F0A" }}>
              Конец: {new Date(current.endsAt).toLocaleDateString("ru-RU")}
            </div>
          </div>
          <div className="s-sect" style={{ marginTop: 12 }}>Изменить дату окончания</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input
              type="date"
              className="s-inp"
              style={{ flex: 1 }}
              value={editEndDate}
              onChange={e => setEditEndDate(e.target.value)}
            />
            <button
              className="btn-tonal blue"
              style={{ padding: "8px 14px", width: "auto" }}
              disabled={busy || !editEndDate}
              onClick={() => updateEndDate(current.id)}
            >
              Сохранить
            </button>
          </div>
          <button
            className="btn-primary"
            style={{ background: "#FF453A" }}
            disabled={busy}
            onClick={() => closeSeason(current.id)}
          >
            🏁 Закрыть сезон
          </button>
          <div className="hint" style={{ paddingTop: 8 }}>
            При закрытии: топ-3 получают «Хозяин сезона», эло сбрасывается с 30% сохранением.
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: "16px 20px" }}>
          <div className="s-sect">Нет активного сезона</div>
          <div className="hint" style={{ paddingBottom: 10 }}>
            Новый сезон открывается только вручную. Нажмите кнопку ниже когда будете готовы.
          </div>
          <div className="s-sect" style={{ marginTop: 4 }}>Длительность нового сезона</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <input
              type="number"
              className="s-inp"
              style={{ flex: 1 }}
              min={7}
              max={730}
              value={durationDays}
              onChange={e => setDurationDays(e.target.value)}
            />
            <span style={{ color: "rgba(255,255,255,.5)", fontSize: 14 }}>дней</span>
          </div>
          <button className="btn-primary" disabled={busy} onClick={openSeason}>
            🚀 Открыть новый сезон
          </button>
        </div>
      )}

      {seasons && seasons.filter(s => s.closed).length > 0 && (
        <div className="card">
          <div className="s-sect">Прошлые сезоны</div>
          {seasons.filter(s => s.closed).map(s => (
            <div key={s.id} className="announce-row">
              <div style={{ fontWeight: 600 }}>Сезон #{s.id}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)" }}>
                {new Date(s.startedAt).toLocaleDateString("ru-RU")} — {new Date(s.endsAt).toLocaleDateString("ru-RU")}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Конфликты ─────────────────────────────────────────────────────────────────
function ConflictsTab({ toast, toastError }) {
  const [conflicts, setConflicts] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/admin/conflicts").then(r => setConflicts(r.conflicts)).catch(toastError);
  }, [toastError]);

  useEffect(() => { load(); }, [load]);

  async function resolve(matchId, winnerId, winnerName) {
    if (!(await tgConfirm(`Засчитать победу ${winnerName}?`))) return;
    setBusy(true);
    try {
      await api.post(`/admin/conflicts/${matchId}/resolve`, { winnerId });
      haptic("ok");
      toast("✓ Конфликт разрешён", "ok");
      load();
    } catch (e) { toastError(e); }
    finally { setBusy(false); }
  }

  if (!conflicts) return <Spinner />;

  return (
    <div className="card">
      <div className="s-sect">Конфликтные матчи · {conflicts.length}</div>
      {conflicts.length === 0 && <Empty icon="⚔️" text="Нет конфликтов" />}
      {conflicts.map(c => (
        <div key={c.id} className="announce-row">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,.4)" }}>Матч #{c.id} · {fmtAgo(Date.now() - c.createdAt)}</span>
          </div>
          <div style={{ fontSize: 14, marginBottom: 8 }}>
            <span style={{ color: c.initiatorClaim === "win" ? "#30D158" : "#FF453A" }}>
              {c.initiatorName}
            </span>
            {" "}vs{" "}
            <span style={{ color: c.opponentClaim === "win" ? "#30D158" : "#FF453A" }}>
              {c.opponentName}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)", marginBottom: 8 }}>
            {c.initiatorName} заявил: {c.initiatorClaim === "win" ? "победа" : "поражение"} ·{" "}
            {c.opponentName} заявил: {c.opponentClaim === "win" ? "победа" : "поражение"}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn-tonal green"
              style={{ padding: "6px 12px", fontSize: 12, width: "auto", flex: 1 }}
              disabled={busy}
              onClick={() => resolve(c.id, c.initiatorId, c.initiatorName)}
            >
              ✓ {c.initiatorName}
            </button>
            <button
              className="btn-tonal green"
              style={{ padding: "6px 12px", fontSize: 12, width: "auto", flex: 1 }}
              disabled={busy}
              onClick={() => resolve(c.id, c.opponentId, c.opponentName)}
            >
              ✓ {c.opponentName}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Аудит ─────────────────────────────────────────────────────────────────────
function AuditTab({ toastError }) {
  const [entries, setEntries] = useState(null);

  useEffect(() => {
    api.get("/admin/audit").then(r => setEntries(r.entries)).catch(toastError);
  }, [toastError]);

  if (!entries) return <Spinner />;

  return (
    <div className="card">
      <div className="s-sect">Последние 100 действий</div>
      {entries.length === 0 && <Empty icon="📋" text="Нет записей" />}
      {entries.map(e => (
        <div key={e.id} className="announce-row">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{e.adminName}</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.35)" }}>{fmtAgo(Date.now() - e.createdAt)}</span>
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.7)", marginTop: 2 }}>
            {e.action}{e.targetName ? ` → ${e.targetName}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Статистика ────────────────────────────────────────────────────────────────
function StatsTab({ toastError }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/admin/stats").then(setStats).catch(toastError);
  }, [toastError]);

  if (!stats) return <Spinner />;

  const rows = [
    { label: "Всего игроков", value: stats.total },
    { label: "Активированных", value: stats.activated },
    { label: "В поиске прямо сейчас", value: stats.searching },
    { label: "Матчей сегодня", value: stats.matchesToday },
    { label: "Матчей всего", value: stats.matchesTotal },
    { label: "Забанено", value: stats.banned },
  ];

  return (
    <div className="card">
      <div className="s-sect">Статистика клуба</div>
      {stats.currentSeason && (
        <div style={{ padding: "8px 20px 4px" }}>
          <div style={{ fontSize: 13, color: "#FF9F0A", fontWeight: 600 }}>
            🏆 Активный сезон #{stats.currentSeason.id} · до {new Date(stats.currentSeason.endsAt).toLocaleDateString("ru-RU")}
          </div>
        </div>
      )}
      {rows.map(r => (
        <div key={r.label} className="s-row" style={{ padding: "10px 20px" }}>
          <span style={{ color: "rgba(255,255,255,.6)", fontSize: 14 }}>{r.label}</span>
          <span style={{ fontWeight: 700, fontSize: 18 }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}
