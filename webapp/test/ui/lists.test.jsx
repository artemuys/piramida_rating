// Rating / History / Favorites: загрузка списков, подсветка «вы», пустые
// состояния и переход в профиль по клику.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { getT } from "../../src/i18n.js";

let mockApp, getImpl;
vi.mock("../../src/store.jsx", () => ({ useApp: () => mockApp }));
vi.mock("../../src/api.js", () => ({ api: { get: vi.fn((p) => getImpl(p)) } }));
vi.mock("../../src/telegram.js", () => ({ haptic: vi.fn(), tg: null }));

import { Rating, History, Favorites } from "../../src/screens/Lists.jsx";

const t = getT("ru");
beforeEach(() => {
  mockApp = { me: { id: 1, name: "Я", elo: 1200, place: 7 }, t, lang: "ru", toastError: vi.fn() };
});

describe("Rating", () => {
  test("рендерит топ и подсвечивает текущего игрока", async () => {
    getImpl = () => Promise.resolve({
      top: [
        { id: 9, name: "Лидер", elo: 1500, role: "user" },
        { id: 1, name: "Я", elo: 1200, role: "user" },
      ],
      me: { place: 2 }, season: null,
    });
    render(<Rating navigate={vi.fn()} />);
    await screen.findByText("Лидер");
    expect(screen.getAllByText(t.rating.you).length).toBeGreaterThan(0); // метка «вы» у своей строки
  });

  test("если игрока нет в топе — показывает его строку с местом", async () => {
    getImpl = () => Promise.resolve({
      top: [{ id: 9, name: "Лидер", elo: 1500, role: "user" }],
      me: { place: 42 }, season: null,
    });
    render(<Rating navigate={vi.fn()} />);
    await screen.findByText("Лидер");
    expect(screen.getByText("42")).toBeTruthy(); // место вне топа
  });
});

describe("History", () => {
  test("пустая история → заглушка", async () => {
    getImpl = () => Promise.resolve({ matches: [] });
    render(<History navigate={vi.fn()} />);
    await screen.findByText(t.x.noHistory);
  });

  test("матч ведёт в профиль соперника", async () => {
    getImpl = () => Promise.resolve({ matches: [
      { id: 5, opponent: { id: 8, name: "Соперник", role: "user" }, iWon: true, delta: 16, date: Date.now() },
    ] });
    const navigate = vi.fn();
    render(<History navigate={navigate} />);
    fireEvent.click(await screen.findByText("Соперник"));
    expect(navigate).toHaveBeenCalledWith("player", { playerId: 8, title: "Соперник" });
  });
});

describe("Favorites", () => {
  test("пусто → заглушка с подсказкой", async () => {
    getImpl = () => Promise.resolve({ favorites: [] });
    render(<Favorites navigate={vi.fn()} />);
    await screen.findByText(t.x.noFavs);
  });

  test("избранный ведёт в профиль", async () => {
    getImpl = () => Promise.resolve({ favorites: [{ id: 3, name: "Друг", elo: 1100, role: "user" }] });
    const navigate = vi.fn();
    render(<Favorites navigate={navigate} />);
    fireEvent.click(await screen.findByText("Друг"));
    expect(navigate).toHaveBeenCalledWith("player", { playerId: 3, title: "Друг" });
  });
});
