// Home: шапка профиля, навигационные строки, переходы. И SearchListScreen:
// список ищущих / пустое состояние.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { getT } from "../../src/i18n.js";

let mockApp, getImpl;
vi.mock("../../src/store.jsx", () => ({ useApp: () => mockApp }));
vi.mock("../../src/api.js", () => ({ api: { get: vi.fn((p) => getImpl(p)), post: vi.fn(() => Promise.resolve({})) } }));
vi.mock("../../src/telegram.js", () => ({ haptic: vi.fn(), tg: null }));

import { Home, SearchListScreen } from "../../src/screens/Home.jsx";

const t = getT("ru");
const fullMe = {
  id: 1234, name: "Иван Петров", role: "user", isSuper: false, searching: null,
  elo: 1250, streak: 0, place: 5, matchesCount: 12, winsCount: 7, xp: 200,
  isCheckedIn: false, isActivated: true, achPoints: 30, unseenAchievements: 0,
  favoritesCount: 3, pendingDuels: 0, activeDiscipline: "pyramid", prefDisc: 2, prefPays: 0,
};

beforeEach(() => {
  mockApp = { me: { ...fullMe }, t, lang: "ru", refreshMe: vi.fn(() => Promise.resolve()) };
  getImpl = () => Promise.resolve({ matches: [], feed: [] });
});

describe("Home", () => {
  test("показывает имя (первое слово) и ID игрока", async () => {
    render(<Home navigate={vi.fn()} />);
    expect(screen.getByText("Иван")).toBeTruthy(); // split(" ")[0]
    expect(screen.getByText(new RegExp(`${t.idLabel} 1234`))).toBeTruthy();
  });

  test("навигация в рейтинг по строке", async () => {
    const navigate = vi.fn();
    render(<Home navigate={navigate} />);
    fireEvent.click(screen.getByText(t.nav.rating));
    expect(navigate).toHaveBeenCalledWith("rating");
  });

  test("неактивированный игрок видит предупреждение", () => {
    mockApp.me = { ...fullMe, isActivated: false };
    render(<Home navigate={vi.fn()} />);
    expect(screen.getByText(new RegExp(t.x.alertNotActivatedT))).toBeTruthy();
  });
});

describe("SearchListScreen", () => {
  test("никто не ищет → пустое состояние", async () => {
    getImpl = () => Promise.resolve({ players: [] });
    render(<SearchListScreen navigate={vi.fn()} />);
    await screen.findByText(t.x.whoSearchingEmpty);
  });

  test("ищущий игрок ведёт в профиль", async () => {
    getImpl = () => Promise.resolve({ players: [{ id: 77, name: "Ищущий", elo: 1100, role: "user", disc: 0, pays: 0, contact: "@s" }] });
    const navigate = vi.fn();
    render(<SearchListScreen navigate={navigate} />);
    fireEvent.click(await screen.findByText("Ищущий"));
    expect(navigate).toHaveBeenCalledWith("player", { playerId: 77, title: "Ищущий" });
  });
});
