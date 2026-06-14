// Сердце приложения: state-машина фаз и тосты. Именно фазы решают, что увидит
// игрок — спиннер, онбординг, экран «откройте из Telegram», ошибку сети или
// рабочее приложение. Маппинг кодов ошибок api → фаза критичен.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";

vi.mock("../../src/api.js", () => ({ api: { get: vi.fn() } }));
vi.mock("../../src/telegram.js", () => ({ haptic: vi.fn() }));

import { AppProvider, useApp } from "../../src/store.jsx";
import { api } from "../../src/api.js";

let hook;
function Probe() {
  hook = useApp();
  return <div data-testid="phase">{hook.phase}</div>;
}
const renderApp = () => render(<AppProvider><Probe /></AppProvider>);
const phase = () => screen.getByTestId("phase").textContent;

beforeEach(() => {
  api.get.mockReset();
  localStorage.clear();
});

describe("фазы по ответу /me", () => {
  test("успех → ready, me сохранён", async () => {
    api.get.mockResolvedValue({ me: { id: 7, name: "Гость", lang: "en" } });
    renderApp();
    await waitFor(() => expect(phase()).toBe("ready"));
    expect(hook.me.id).toBe(7);
    expect(hook.lang).toBe("en"); // язык берётся из профиля
  });

  test("not_onboarded → onboarding", async () => {
    api.get.mockRejectedValue(Object.assign(new Error(), { code: "not_onboarded" }));
    renderApp();
    await waitFor(() => expect(phase()).toBe("onboarding"));
  });

  test("auth_failed → auth_failed", async () => {
    api.get.mockRejectedValue(Object.assign(new Error(), { code: "auth_failed" }));
    renderApp();
    await waitFor(() => expect(phase()).toBe("auth_failed"));
  });

  test("прочая ошибка (сеть) → error", async () => {
    api.get.mockRejectedValue(Object.assign(new Error(), { code: "network" }));
    renderApp();
    await waitFor(() => expect(phase()).toBe("error"));
  });
});

describe("язык", () => {
  test("до загрузки профиля берётся из localStorage, иначе ru", async () => {
    localStorage.setItem("lang", "pl");
    api.get.mockRejectedValue(Object.assign(new Error(), { code: "not_onboarded" }));
    renderApp();
    await waitFor(() => expect(phase()).toBe("onboarding"));
    expect(hook.lang).toBe("pl");
    expect(hook.t._lang).toBe("pl");
  });
});

describe("toast", () => {
  test("toast добавляет сообщение в очередь", async () => {
    api.get.mockResolvedValue({ me: { id: 1 } });
    renderApp();
    await waitFor(() => expect(phase()).toBe("ready"));
    act(() => hook.toast("Привет", "ok"));
    await waitFor(() => expect(hook.toasts.at(-1)?.msg).toBe("Привет"));
    expect(hook.toasts.at(-1).kind).toBe("ok");
  });

  test("очередь не растёт без предела (хвост ≤ 3)", async () => {
    api.get.mockResolvedValue({ me: { id: 1 } });
    renderApp();
    await waitFor(() => expect(phase()).toBe("ready"));
    act(() => { for (let i = 0; i < 6; i++) hook.toast(`m${i}`); });
    await waitFor(() => expect(hook.toasts.length).toBeLessThanOrEqual(3));
  });

  test("toastError маппит код ошибки в локализованный текст", async () => {
    api.get.mockResolvedValue({ me: { id: 1, lang: "en" } });
    renderApp();
    await waitFor(() => expect(phase()).toBe("ready"));
    act(() => hook.toastError({ code: "network" }));
    await waitFor(() => expect(hook.toasts.at(-1)?.kind).toBe("err"));
    expect(hook.toasts.at(-1).msg.length).toBeGreaterThan(0);
  });
});

describe("updateMe", () => {
  test("частичный мердж в профиль", async () => {
    api.get.mockResolvedValue({ me: { id: 1, name: "Старое", elo: 1000 } });
    renderApp();
    await waitFor(() => expect(phase()).toBe("ready"));
    act(() => hook.updateMe({ name: "Новое" }));
    await waitFor(() => expect(hook.me.name).toBe("Новое"));
    expect(hook.me.elo).toBe(1000); // остальные поля сохранены
  });
});
