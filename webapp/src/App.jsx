import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "./store.jsx";
import { ErrorBoundary, Spinner, Toasts } from "./components.jsx";
import { api } from "./api.js";
import { MatchWatcher } from "./MatchWatcher.jsx";
import { Onboarding } from "./screens/Onboarding.jsx";
import { Home, SearchListScreen } from "./screens/Home.jsx";
import { Apps } from "./screens/Apps.jsx";
import { Result } from "./screens/Result.jsx";
import { Player } from "./screens/Player.jsx";
import { Rating, History, Favorites } from "./screens/Lists.jsx";
import { Settings } from "./screens/Settings.jsx";
import { Admin, AdminPlayer } from "./screens/Admin.jsx";
import { Duels } from "./screens/Duels.jsx";
import { Achievements } from "./screens/Achievements.jsx";
import { Records } from "./screens/Records.jsx";
import { SuperAdmin } from "./screens/SuperAdmin.jsx";
import { setBackButton, insideTelegram } from "./telegram.js";

const SCREENS = {
  home: { component: Home, title: (t) => t.nav.home, home: true },
  apps: { component: Apps, title: (t) => t.nav.apps },
  rating: { component: Rating, title: (t) => t.nav.rating },
  result: { component: Result, title: (t) => t.nav.result },
  history: { component: History, title: (t) => t.nav.history },
  favorites: { component: Favorites, title: (t) => t.nav.favorites },
  settings: { component: Settings, title: (t) => t.nav.settings },
  player: { component: Player, title: (t, p) => p.title || "" },
  "search-list": { component: SearchListScreen, title: (t) => t.nav.whoSearching },
  admin: { component: Admin, title: (t) => t.nav.admin, adminOnly: true },
  "admin-player": { component: AdminPlayer, title: (t) => t.nav.admin, adminOnly: true },
  duels: { component: Duels, title: (t) => t.nav.duels },
  achievements: { component: Achievements, title: (t) => t.nav.achievements },
  records: { component: Records, title: (t) => t.nav.records },
  superadmin: { component: SuperAdmin, title: (t) => t.nav.superadmin, superOnly: true },
};

function AnnounceBanner() {
  const [ann, setAnn] = useState(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem("ann_dismissed") || "");

  useEffect(() => {
    api.get("/announcements").then(r => {
      const latest = r.announcements?.[0];
      if (latest) setAnn(latest);
    }).catch(() => {});
  }, []);

  if (!ann || dismissed === String(ann.id)) return null;

  function dismiss() {
    localStorage.setItem("ann_dismissed", String(ann.id));
    setDismissed(String(ann.id));
  }

  return (
    <div className="announce-banner" onClick={dismiss}>
      <span className="announce-banner-icon">📢</span>
      <span className="announce-banner-text">{ann.text}</span>
      <span className="announce-banner-close">✕</span>
    </div>
  );
}

function Shell() {
  const { me, phase, t, refreshMe } = useApp();
  const [nav, setNav] = useState([{ id: "home", params: {} }]);
  const dirRef = useRef("forward");

  const current = nav[nav.length - 1];
  const screen = SCREENS[current.id] || SCREENS.home;
  const isHome = !!screen.home;

  function navigate(id, params = {}) {
    if (!SCREENS[id]) return;
    if (SCREENS[id].adminOnly && me?.role !== "admin") return;
    if (SCREENS[id].superOnly && !me?.isSuper) return;
    dirRef.current = "forward";
    setNav((prev) => [...prev, { id, params }]);
  }
  function goBack() {
    dirRef.current = "back";
    setNav((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }

  // Системная кнопка «Назад» Telegram
  useEffect(() => setBackButton(!isHome, goBack), [isHome, current]);

  // Если права отозвали (деактивация), уходим с админских/закрытых экранов
  useEffect(() => {
    if (me && screen.adminOnly && me.role !== "admin") setNav([{ id: "home", params: {} }]);
  }, [me, screen]);

  const title = useMemo(() => screen.title(t, current.params), [screen, t, current.params]);

  if (phase === "loading") {
    return <div className="app"><Spinner /></div>;
  }

  if (phase === "auth_failed") {
    return (
      <div className="fatal">
        <div className="fatal-icon">🔒</div>
        <div>{t.x.openFromTg}</div>
        {!insideTelegram() && import.meta.env.DEV && (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.35)" }}>
            DEV: установите DEV_AUTH=1 на сервере и localStorage.devTgId
          </div>
        )}
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="fatal">
        <div className="fatal-icon">📡</div>
        <div>{t.x.errors.network}</div>
        <button className="btn-primary" style={{ maxWidth: 220 }} onClick={refreshMe}>{t.x.retry}</button>
      </div>
    );
  }

  if (phase === "onboarding") {
    return (
      <>
        <Toasts />
        <Onboarding />
      </>
    );
  }

  const Comp = screen.component;

  return (
    <div className="app">
      <AnnounceBanner />
      <Toasts />
      <MatchWatcher />
      <div className="topbar">
        {!isHome
          ? <button className="back-btn" onClick={goBack}><span className="back-arrow">‹</span>{t.back}</button>
          : <div style={{ width: 64 }} />}
        <div className="topbar-title">{title}</div>
        <div className="topbar-spacer" />
      </div>
      <div className={`page page-${dirRef.current}`} key={`${current.id}-${current.params.playerId ?? ""}`}>
        <Comp navigate={navigate} params={current.params} />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Shell />
    </ErrorBoundary>
  );
}
