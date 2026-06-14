// Навигационная оболочка Shell: стек экранов, заголовок, кнопка «назад» и
// гварды доступа. Если гвард протечёт — обычный игрок попадёт на админский
// экран. Экраны замоканы заглушками, чтобы тестировать только маршрутизацию.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { getT } from "../../src/i18n.js";

// Профиль текущего игрока — мутируем перед каждым тестом.
let me;

vi.mock("canvas-confetti", () => ({ default: vi.fn() }));
vi.mock("../../src/MatchWatcher.jsx", () => ({ MatchWatcher: () => null }));
vi.mock("../../src/api.js", () => ({
  api: {
    get: vi.fn((path) =>
      path === "/me" ? Promise.resolve({ me }) : Promise.resolve({ announcements: [] })
    ),
  },
}));

// Home даёт кнопки перехода на разные экраны (в т.ч. защищённые).
vi.mock("../../src/screens/Home.jsx", () => ({
  Home: ({ navigate }) => (
    <div>
      HOME
      <button onClick={() => navigate("rating")}>go-rating</button>
      <button onClick={() => navigate("admin")}>go-admin</button>
      <button onClick={() => navigate("superadmin")}>go-super</button>
    </div>
  ),
  SearchListScreen: () => <div>SEARCH</div>,
}));
// Заглушки экранов (фабрики vi.mock хойстятся — переменные сюда тащить нельзя).
vi.mock("../../src/screens/Onboarding.jsx", () => ({ Onboarding: () => <div>ONBOARDING</div> }));
vi.mock("../../src/screens/Apps.jsx", () => ({ Apps: () => <div>APPS</div> }));
vi.mock("../../src/screens/Result.jsx", () => ({ Result: () => <div>RESULT</div> }));
vi.mock("../../src/screens/Player.jsx", () => ({ Player: () => <div>PLAYER</div> }));
vi.mock("../../src/screens/Lists.jsx", () => ({
  Rating: () => <div>RATING</div>, History: () => <div>HISTORY</div>, Favorites: () => <div>FAVORITES</div>,
}));
vi.mock("../../src/screens/Settings.jsx", () => ({ Settings: () => <div>SETTINGS</div> }));
vi.mock("../../src/screens/Admin.jsx", () => ({ Admin: () => <div>ADMIN</div>, AdminPlayer: () => <div>ADMINPLAYER</div> }));
vi.mock("../../src/screens/Duels.jsx", () => ({ Duels: () => <div>DUELS</div> }));
vi.mock("../../src/screens/Achievements.jsx", () => ({ Achievements: () => <div>ACHIEVEMENTS</div> }));
vi.mock("../../src/screens/Records.jsx", () => ({ Records: () => <div>RECORDS</div> }));
vi.mock("../../src/screens/SuperAdmin.jsx", () => ({ SuperAdmin: () => <div>SUPERADMIN</div> }));

import App from "../../src/App.jsx";
import { AppProvider } from "../../src/store.jsx";

const t = getT("ru");
const renderApp = () => render(<AppProvider><App /></AppProvider>);

beforeEach(() => {
  me = { id: 1, name: "Игрок", role: "user", isSuper: false, lang: "ru" };
});

describe("стартовый экран", () => {
  test("дом: заголовок nav.home, кнопки «назад» нет", async () => {
    const { container } = renderApp();
    await screen.findByText("HOME");
    expect(container.querySelector(".topbar-title").textContent).toBe(t.nav.home);
    expect(container.querySelector(".back-btn")).toBeNull();
  });
});

describe("переходы", () => {
  test("переход на рейтинг: новый экран, заголовок и кнопка «назад»", async () => {
    const { container } = renderApp();
    await screen.findByText("HOME");
    fireEvent.click(screen.getByText("go-rating"));
    await screen.findByText("RATING");
    expect(container.querySelector(".topbar-title").textContent).toBe(t.nav.rating);
    expect(container.querySelector(".back-btn")).not.toBeNull();
  });

  test("кнопка «назад» возвращает домой", async () => {
    renderApp();
    await screen.findByText("HOME");
    fireEvent.click(screen.getByText("go-rating"));
    await screen.findByText("RATING");
    fireEvent.click(document.querySelector(".back-btn"));
    await screen.findByText("HOME");
  });
});

describe("гварды доступа", () => {
  test("обычный игрок не попадает на админку (navigate игнорируется)", async () => {
    renderApp();
    await screen.findByText("HOME");
    fireEvent.click(screen.getByText("go-admin"));
    // экран не сменился
    expect(screen.queryByText("ADMIN")).toBeNull();
    expect(screen.getByText("HOME")).toBeTruthy();
  });

  test("админ проходит на админский экран", async () => {
    me.role = "admin";
    renderApp();
    await screen.findByText("HOME");
    fireEvent.click(screen.getByText("go-admin"));
    await screen.findByText("ADMIN");
  });

  test("superadmin закрыт без isSuper и открыт с ним", async () => {
    renderApp();
    await screen.findByText("HOME");
    fireEvent.click(screen.getByText("go-super"));
    expect(screen.queryByText("SUPERADMIN")).toBeNull();
  });

  test("игрок с isSuper проходит в superadmin", async () => {
    me.isSuper = true;
    renderApp();
    await screen.findByText("HOME");
    fireEvent.click(screen.getByText("go-super"));
    await screen.findByText("SUPERADMIN");
  });
});

describe("фазы оболочки", () => {
  test("auth_failed показывает экран «откройте из Telegram»", async () => {
    const { api } = await import("../../src/api.js");
    api.get.mockImplementationOnce(() =>
      Promise.reject(Object.assign(new Error(), { code: "auth_failed" }))
    );
    const { container } = renderApp();
    await waitFor(() => expect(container.querySelector(".fatal")).not.toBeNull());
    expect(container.textContent).toContain(t.x.openFromTg);
  });
});
