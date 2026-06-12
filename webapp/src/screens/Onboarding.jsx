import { useState } from "react";
import { api } from "../api.js";
import { LANGS, getT } from "../i18n.js";
import { useApp } from "../store.jsx";
import { haptic } from "../telegram.js";

export function Onboarding() {
  const { obLang, setObLang, refreshMe, toastError } = useApp();
  const [step, setStep] = useState(obLang ? 1 : 0); // 0 = язык
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [disc, setDisc] = useState(2);
  const [pays, setPays] = useState(0);
  const [chosen, setChosen] = useState(obLang);
  const [busy, setBusy] = useState(false);

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
            className={`ob-field${name.trim().length >= 2 ? " ok" : ""}`}
            placeholder={t.step0.placeholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={40}
          />
          <div className="ob-field-hint">{t.step0.hint}</div>
          <button className="ob-btn" disabled={name.trim().length < 2} onClick={() => setStep(2)}>{t.step0.next}</button>
        </>
      ),
    },
    {
      emoji: "💬", title: t.step1.title, sub: t.step1.sub,
      content: (
        <>
          <input
            className={`ob-field${contact.trim().length >= 2 ? " ok" : ""}`}
            placeholder={t.step1.placeholder}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            autoFocus
            maxLength={60}
          />
          <div className="ob-field-hint">{t.step1.hint}</div>
          <button className="ob-btn" disabled={contact.trim().length < 2} onClick={() => setStep(3)}>{t.step1.next}</button>
        </>
      ),
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
          <button className="ob-btn green" disabled={busy} onClick={finish}>{busy ? "…" : t.step2.finish}</button>
        </>
      ),
    },
  ];

  const s = steps[step - 1];

  return (
    <div className="ob-wrap">
      <div className="ob-progress">
        {[0, 1, 2].map((i) => (
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
