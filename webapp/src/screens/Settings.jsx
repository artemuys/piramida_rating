import { useState } from "react";
import { api } from "../api.js";
import { useApp } from "../store.jsx";
import { LANGS } from "../i18n.js";
import { haptic } from "../telegram.js";

export function Settings() {
  const { me, t, refreshMe, toastError } = useApp();
  const [name, setName] = useState(me.name);
  const [disc, setDisc] = useState(me.prefDisc);
  const [pays, setPays] = useState(me.prefPays);
  const [lang, setLang] = useState(me.lang);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      await api.patch("/me", {
        name: name.trim(),
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

  return (
    <>
      <div className="card">
        <div className="s-sect">{t.settings.profile}</div>
        <div className="s-row">
          <div className="s-lbl">{t.settings.name}</div>
          <input className="s-inp" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
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
        disabled={busy || name.trim().length < 2}
        onClick={save}
      >
        {saved ? "✓" : t.settings.save}
      </button>
    </>
  );
}
