export const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : null;

export function initTelegram() {
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    tg.setHeaderColor?.("#000000");
    tg.setBackgroundColor?.("#000000");
    tg.disableVerticalSwipes?.();
  } catch {
    /* старые клиенты могут не поддерживать часть методов */
  }
}

export function getInitData() {
  return tg?.initData || "";
}

function supports(version) {
  try { return !!tg?.isVersionAtLeast?.(version); } catch { return false; }
}

export function haptic(type = "light") {
  if (!supports("6.1")) return;
  try {
    if (type === "ok") tg?.HapticFeedback?.notificationOccurred("success");
    else if (type === "err") tg?.HapticFeedback?.notificationOccurred("error");
    else tg?.HapticFeedback?.impactOccurred("light");
  } catch { /* не критично */ }
}

export function setBackButton(visible, onClick) {
  const bb = tg?.BackButton;
  if (!bb || !supports("6.1")) return () => {};
  try {
    if (visible) {
      bb.show();
      bb.onClick(onClick);
      return () => { try { bb.offClick(onClick); } catch { /* noop */ } };
    }
    bb.hide();
  } catch { /* noop */ }
  return () => {};
}

export function tgConfirm(message) {
  return new Promise((resolve) => {
    if (tg?.showConfirm) {
      try {
        tg.showConfirm(message, (ok) => resolve(ok));
        return;
      } catch { /* fallthrough */ }
    }
    resolve(window.confirm(message));
  });
}

/** Приложение открыто внутри Telegram? */
export function insideTelegram() {
  return !!(tg && tg.initData);
}
