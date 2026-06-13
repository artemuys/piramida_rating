import { useState } from "react";
import { api } from "../api.js";
import { useApp } from "../store.jsx";
import { LANGS } from "../i18n.js";
import { haptic, tg } from "../telegram.js";

function getTgUsername() {
  try { return tg?.initDataUnsafe?.user?.username || ""; } catch { return ""; }
}

function isValidPhone(val) {
  return /^\+?[\d\s\-\(\)]{7,20}$/.test(val.trim()) && (val.match(/\d/g) || []).length >= 7;
}

export function Settings() {
  const { me, t, refreshMe, toastError, toast } = useApp();
  const tgUsername = getTgUsername(); // "" if user has no @username
  const hasTgUsername = !!tgUsername;

  // If user previously saved a telegram contact keep it; otherwise only allow telegram if they have a username
  const alreadyHasTgContact = (me.contactType || "telegram") === "telegram" && !!me.contact;
  const canUseTelegram = hasTgUsername || alreadyHasTgContact;

  const [contact, setContact] = useState(() => {
    if (me.contact) return me.contact;
    if (hasTgUsername) return `@${tgUsername}`;
    return "";
  });
  const [contactType, setContactType] = useState(() => {
    const saved = me.contactType || "telegram";
    // If they have telegram saved keep it; if no username default to phone
    if (saved === "telegram" && !canUseTelegram) return "phone";
    return saved;
  });
  const [disc, setDisc] = useState(me.prefDisc);
  const [pays, setPays] = useState(me.prefPays);
  const [lang, setLang] = useState(me.lang);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newName, setNewName] = useState("");
  const [nameBusy, setNameBusy] = useState(false);

  function switchContactType(type) {
    setContactType(type);
    if (type === "telegram") {
      // Auto-fill with @username if not already set
      if (!contact && hasTgUsername) setContact(`@${tgUsername}`);
    }
  }

  const phoneError = contactType === "phone" && contact.trim().length > 0 && !isValidPhone(contact);
  const contactOk = contact.trim().length >= 2 && !phoneError;

  async function save() {
    if (busy || !contactOk) return;
    setBusy(true);
    try {
      await api.patch("/me", {
        contact: contact.trim(),
        contactType,
        lang,
        prefDisc: disc,
        prefPays: pays,
      });
      localStorage.setItem("lang", lang);
      await refreshMe();
      haptic("ok");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    const n = newName.trim();
    if (!n || nameBusy) return;
    setNameBusy(true);
    try {
      await api.patch("/me", { name: n });
      await refreshMe();
      haptic("ok");
      toast("✓ Имя изменено", "ok");
      setNewName("");
    } catch (e) {
      toastError(e);
    } finally {
      setNameBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        <div className="s-sect">{t.settings.profile}</div>
        <div className="s-row" style={{ alignItems: "center" }}>
          <div className="s-lbl">👤 Имя</div>
          <span style={{ fontSize: 15, color: "rgba(255,255,255,.6)" }}>{me.name}</span>
        </div>

        {me.nameChangeAllowed ? (
          <>
            <div className="s-hint" style={{ paddingTop: 0, color: "#FF9F0A" }}>
              У вас есть одна возможность сменить имя.
            </div>
            <div style={{ padding: "0 16px 12px", display: "flex", gap: 8 }}>
              <input
                className="s-inp"
                style={{ flex: 1 }}
                placeholder="Новое имя"
                value={newName}
                maxLength={40}
                onChange={e => setNewName(e.target.value)}
              />
              <button
                className="btn-tonal blue"
                style={{ padding: "8px 14px", width: "auto" }}
                disabled={nameBusy || newName.trim().length < 2}
                onClick={saveName}
              >
                Сохранить
              </button>
            </div>
          </>
        ) : (
          <div className="s-hint" style={{ paddingTop: 0 }}>Имя задаётся при регистрации и не меняется.</div>
        )}

        <div className="s-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
          <div className="s-lbl">📩 Способ связи <span style={{ color: "#FF453A", fontSize: 11 }}>обязательно</span></div>
          <div className="tog-g" style={{ width: "100%" }}>
            <button
              className={`tog${contactType === "telegram" ? " on" : ""}${!canUseTelegram ? " disabled" : ""}`}
              onClick={() => canUseTelegram && switchContactType("telegram")}
              disabled={!canUseTelegram}
              title={!canUseTelegram ? "У вас нет @username в Telegram" : undefined}
              style={!canUseTelegram ? { opacity: 0.38, cursor: "not-allowed" } : {}}
            >
              Telegram
            </button>
            <button className={`tog${contactType === "phone" ? " on" : ""}`} onClick={() => switchContactType("phone")}>Телефон</button>
          </div>
          {!canUseTelegram && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)", padding: "0 2px" }}>
              Telegram недоступен — у вас нет @username. Установите его в настройках Telegram.
            </div>
          )}
          <input
            className="s-inp"
            value={contact}
            maxLength={120}
            placeholder={contactType === "telegram" ? "@username" : "+7 (___) ___-__-__"}
            onChange={(e) => setContact(e.target.value)}
            style={phoneError ? { boxShadow: "0 0 0 2px #FF453A" } : {}}
          />
          {phoneError && (
            <div style={{ fontSize: 12, color: "#FF453A", padding: "0 4px" }}>
              Неверный формат. Пример: +7 (999) 123-45-67
            </div>
          )}
        </div>
        <div className="s-hint">
          {contactType === "telegram"
            ? "Будет прямая ссылка на ваш Telegram."
            : "Номер телефона — видно только активированным игрокам."}
        </div>
      </div>

      <div className="card">
        <div className="s-sect">{t.settings.searchDefaults}</div>
        <div className="tog-wrap">
          <div className="tog-lbl">{t.search.discipline}</div>
          <div className="tog-g">
            {t.discOpts.map((d, i) => (
              <button key={i} className={`tog${disc === i ? " on" : ""}`} onClick={() => setDisc(i)}>{d}</button>
            ))}
          </div>
        </div>
        <div className="tog-wrap">
          <div className="tog-lbl">{t.search.whoPays}</div>
          <div className="tog-g">
            {t.paysOpts.map((p, i) => (
              <button key={i} className={`tog${pays === i ? " on" : ""}`} onClick={() => setPays(i)}>{p}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="s-sect">{t.settings.language}</div>
        <div style={{ padding: "8px 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {LANGS.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              style={{
                padding: "13px 16px", borderRadius: 14, border: "none", cursor: "pointer",
                fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 14,
                background: lang === l.code ? "rgba(10,132,255,.15)" : "#2c2c2e",
                boxShadow: lang === l.code ? "0 0 0 2px #0A84FF" : "none",
              }}
            >
              <span style={{ fontSize: 22 }}>{l.flag}</span>
              <span style={{ fontSize: 16, fontWeight: 600, color: lang === l.code ? "#0A84FF" : "#fff" }}>{l.label}</span>
              {lang === l.code && <span style={{ marginLeft: "auto", color: "#0A84FF" }}>✓</span>}
            </button>
          ))}
        </div>
      </div>

      <button
        className="btn-primary"
        style={saved ? { background: "#30D158", color: "#000" } : {}}
        disabled={busy || !contactOk}
        onClick={save}
      >
        {saved ? "✓" : t.settings.save}
      </button>
    </>
  );
}
