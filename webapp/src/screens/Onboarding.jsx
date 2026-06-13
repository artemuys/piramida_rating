import { useState } from "react";
import { api } from "../api.js";
import { LANGS, getT } from "../i18n.js";
import { useApp } from "../store.jsx";
import { haptic, tg } from "../telegram.js";

function getTgUsername() {
  try { return tg?.initDataUnsafe?.user?.username || ""; } catch { return ""; }
}

function isValidPhone(val) {
  return /^\+?[\d\s\-\(\)]{7,20}$/.test(val.trim()) && (val.match(/\d/g) || []).length >= 7;
}

export function Onboarding() {
  const { obLang, setObLang, refreshMe, toastError } = useApp();
  const [step, setStep] = useState(0); // 0 = язык (всегда начинаем с выбора языка)
  const [name, setName] = useState("");
  const tgUsername = getTgUsername();
  const hasTgUsername = !!tgUsername;
  const [contact, setContact] = useState(hasTgUsername ? `@${tgUsername}` : "");
  const [contactType, setContactType] = useState(hasTgUsername ? "telegram" : "phone");
  const [disc, setDisc] = useState(2);
  const [pays, setPays] = useState(0);
  const [chosen, setChosen] = useState(obLang);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  const NAME_RE = /^[\p{L}\-]{2,}$/u;
  const nameValid = NAME_RE.test(name.trim());

  const t = getT(chosen || "ru");

  function pickLang() {
    localStorage.setItem("lang", chosen);
    setObLang(chosen);
    setStep(1);
    haptic();
  }

  async function finish() {
    if (busy) return;
    setBusy(true);
    try {
      await api.post("/auth/onboard", {
        name: name.trim(),
        contact: contact.trim(),
        contactType,
        lang: chosen,
        prefDisc: disc,
        prefPays: pays,
      });
      haptic("ok");
      await refreshMe();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  }

  if (step === 0) {
    return (
      <div className="ob-wrap">
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", paddingBottom: 32 }}>
          <span style={{ fontSize: 52, marginBottom: 24, display: "block", animation: "icon-pop .4s cubic-bezier(.34,1.56,.64,1) .05s both" }}>🎱</span>
          <div className="ob-title" style={{ marginBottom: 6 }}>Billiard Club</div>
          <div className="ob-sub" style={{ marginBottom: 36 }}>
            Choose your language · Выберите язык · Wybierz język · Оберіть мову
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => setChosen(l.code)}
                style={{
                  width: "100%", padding: "16px 20px", borderRadius: 16, border: "none",
                  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  display: "flex", alignItems: "center", gap: 16,
                  background: chosen === l.code ? "rgba(10,132,255,.15)" : "#1c1c1e",
                  boxShadow: chosen === l.code ? "0 0 0 2px #0A84FF" : "0 0 0 1px rgba(255,255,255,.08)",
                  transition: "all .15s",
                }}
              >
                <span style={{ fontSize: 28, lineHeight: 1 }}>{l.flag}</span>
                <span style={{ fontSize: 18, fontWeight: 600, color: chosen === l.code ? "#0A84FF" : "#fff", letterSpacing: "-.02em" }}>{l.label}</span>
                {chosen === l.code && <span style={{ marginLeft: "auto", color: "#0A84FF", fontSize: 20 }}>✓</span>}
              </button>
            ))}
          </div>
          <button className="ob-btn" disabled={!chosen} onClick={pickLang}>
            {chosen ? `${LANGS.find((l) => l.code === chosen)?.label} →` : "—"}
          </button>
        </div>
      </div>
    );
  }

  const steps = [
    {
      emoji: "🎱", title: t.step0.title, sub: t.step0.sub,
      content: (
        <>
          <input
            className={`ob-field${nameValid ? " ok" : name.trim().length > 0 ? " err" : ""}`}
            placeholder={t.step0.placeholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={40}
          />
          <div className="ob-field-hint">
            {name.trim().length > 0 && !nameValid
              ? "⚠️ Только буквы, без пробелов и спецсимволов, минимум 2 символа"
              : t.step0.hint}
          </div>
          <button className="ob-btn" disabled={!nameValid} onClick={() => setStep(2)}>{t.step0.next}</button>
        </>
      ),
    },
    {
      emoji: "💬", title: t.step1.title, sub: t.step1.sub,
      content: (() => {
        const phoneErr = contactType === "phone" && contact.trim().length > 0 && !isValidPhone(contact);
        const contactOk = contact.trim().length >= 2 && !phoneErr;
        return (
          <>
            <div className="tog-g" style={{ marginBottom: hasTgUsername ? 14 : 0 }}>
              <button
                className={`tog${contactType === "telegram" ? " on" : ""}`}
                disabled={!hasTgUsername}
                style={!hasTgUsername ? { opacity: 0.35, cursor: "not-allowed" } : {}}
                onClick={() => { if (hasTgUsername) { setContactType("telegram"); setContact(`@${tgUsername}`); } }}
              >
                Telegram
              </button>
              <button className={`tog${contactType === "phone" ? " on" : ""}`} onClick={() => { setContactType("phone"); setContact(""); }}>Телефон</button>
            </div>
            {!hasTgUsername && (
              <div className="ob-field-hint" style={{ marginBottom: 10, marginTop: 8 }}>
                У вас нет @username в Telegram — доступен только телефон. Вы сможете добавить Telegram позже в настройках.
              </div>
            )}
            <input
              className={`ob-field${contactOk ? " ok" : phoneErr ? " err" : ""}`}
              placeholder={contactType === "telegram" ? "@username" : "+7 (___) ___-__-__"}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              autoFocus
              maxLength={60}
            />
            {phoneErr && (
              <div className="ob-field-hint" style={{ color: "#ff8090" }}>
                Неверный формат. Пример: +7 (999) 123-45-67
              </div>
            )}
            <div className="ob-field-hint">
              {contactType === "telegram"
                ? "Другие игроки смогут написать вам напрямую."
                : "Виден только активированным игрокам клуба."}
            </div>
            <button className="ob-btn" disabled={!contactOk} onClick={() => setStep(3)}>{t.step1.next}</button>
          </>
        );
      })(),
    },
    {
      emoji: "⚙️", title: t.step2.title, sub: t.step2.sub,
      content: (
        <>
          <div className="ob-prefs">
            <div>
              <div className="ob-pref-label">{t.step2.disc}</div>
              <div className="tog-g">
                {t.discOpts.map((d, i) => (
                  <button key={i} className={`tog${disc === i ? " on" : ""}`} onClick={() => setDisc(i)}>{d}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="ob-pref-label">{t.step2.pays}</div>
              <div className="tog-g">
                {t.paysOpts.map((p, i) => (
                  <button key={i} className={`tog${pays === i ? " on" : ""}`} onClick={() => setPays(i)}>{p}</button>
                ))}
              </div>
            </div>
          </div>
          <button className="ob-btn" onClick={() => setStep(4)}>{t.step2.finish}</button>
        </>
      ),
    },
    {
      emoji: "📖", title: t.step3.title, sub: t.step3.sub,
      content: (
        <>
          <div style={{
            background: "#1c1c1e", borderRadius: 14, padding: "14px 16px", marginBottom: 16,
            fontSize: 13, color: "rgba(255,255,255,.65)", lineHeight: 1.6,
            maxHeight: 220, overflowY: "auto", whiteSpace: "pre-line", textAlign: "left",
          }}>
            {t.x.rules}
          </div>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20, cursor: "pointer", textAlign: "left" }}>
            <input
              type="checkbox"
              checked={rulesAccepted}
              onChange={(e) => setRulesAccepted(e.target.checked)}
              style={{ marginTop: 3, width: 18, height: 18, accentColor: "#0A84FF", flexShrink: 0 }}
            />
            <span style={{ fontSize: 14, color: rulesAccepted ? "#fff" : "rgba(255,255,255,.6)" }}>{t.step3.accept}</span>
          </label>
          <button className="ob-btn green" disabled={!rulesAccepted || busy} onClick={finish}>{busy ? "…" : t.step3.finish}</button>
        </>
      ),
    },
  ];

  const s = steps[step - 1];

  return (
    <div className="ob-wrap">
      <div className="ob-progress">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`ob-dot${i < step - 1 ? " done" : i === step - 1 ? " active" : ""}`} />
        ))}
      </div>
      <div className="ob-body" key={step}>
        <span className="ob-emoji">{s.emoji}</span>
        <div className="ob-title">{s.title}</div>
        <div className="ob-sub">{s.sub}</div>
        {s.content}
      </div>
    </div>
  );
}
