import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { getT } from "./i18n.js";
import { haptic } from "./telegram.js";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

let toastSeq = 0;

export function AppProvider({ children }) {
  const [me, setMe] = useState(null);
  // phase: loading | onboarding | ready | auth_failed | error
  const [phase, setPhase] = useState("loading");
  const [obLang, setObLang] = useState(localStorage.getItem("lang") || null);
  const [toasts, setToasts] = useState([]);
  const [matchPoke, setMatchPoke] = useState(0); // сигнал watcher'у опросить сервер немедленно

  const lang = me?.lang || obLang || "ru";
  const t = useMemo(() => getT(lang), [lang]);
  const tRef = useRef(t);
  tRef.current = t;

  const toast = useCallback((msg, kind = "info") => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev.slice(-2), { id, msg, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 3800);
    if (kind === "err") haptic("err");
  }, []);

  const toastError = useCallback((e) => {
    const x = tRef.current.x;
    toast(x.errors[e?.code] || x.errors.internal, "err");
  }, [toast]);

  const refreshMe = useCallback(async () => {
    try {
      const r = await api.get("/me");
      setMe(r.me);
      setPhase("ready");
      return r.me;
    } catch (e) {
      if (e.code === "not_onboarded") setPhase("onboarding");
      else if (e.code === "auth_failed") setPhase("auth_failed");
      else setPhase((p) => (p === "ready" ? p : "error")); // сеть мигнула — не выбрасываем из приложения
      return null;
    }
  }, []);

  useEffect(() => { refreshMe(); }, [refreshMe]);

  // Фоновое обновление профиля (статусы активации/чекина истекают со временем)
  useEffect(() => {
    if (phase !== "ready") return;
    const id = setInterval(refreshMe, 30_000);
    return () => clearInterval(id);
  }, [phase, refreshMe]);

  // Немедленное обновление при возврате в приложение (Telegram WebApp может засыпать)
  useEffect(() => {
    if (phase !== "ready") return;
    const onVisible = () => { if (document.visibilityState === "visible") refreshMe(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refreshMe);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refreshMe);
    };
  }, [phase, refreshMe]);

  const pokeMatches = useCallback(() => setMatchPoke((n) => n + 1), []);
  const updateMe = useCallback((partial) => setMe((prev) => prev ? { ...prev, ...partial } : prev), []);

  const value = useMemo(
    () => ({ me, setMe, updateMe, phase, setPhase, refreshMe, lang, obLang, setObLang, t, toasts, toast, toastError, matchPoke, pokeMatches }),
    [me, updateMe, phase, refreshMe, lang, obLang, t, toasts, toast, toastError, matchPoke, pokeMatches]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
