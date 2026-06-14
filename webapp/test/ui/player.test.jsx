// Профиль игрока: загрузка, заявка результата (требует чекина), добавление в
// избранное, обработка «не найден».
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { getT } from "../../src/i18n.js";

let mockApp, getImpl;
vi.mock("../../src/store.jsx", () => ({ useApp: () => mockApp }));
vi.mock("../../src/api.js", () => ({
  api: { get: vi.fn((p) => getImpl(p)), post: vi.fn(() => Promise.resolve({})), del: vi.fn(() => Promise.resolve({})) },
}));
vi.mock("../../src/telegram.js", () => ({ haptic: vi.fn(), tg: null }));
vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

import { Player } from "../../src/screens/Player.jsx";
import { api } from "../../src/api.js";

const t = getT("ru");
const playerData = {
  player: { id: 8, name: "Соперник", role: "user", elo: 1200, peakElo: 1250, place: 4, matchesCount: 20, winsCount: 12, level: 5, xp: 300, streak: 0, achPoints: 10 },
  isFavorite: false, h2h: [], h2hTotal: { total: 0, myWins: 0, theirWins: 0 }, recentMatches: [],
};

beforeEach(() => {
  mockApp = { me: { id: 1, isCheckedIn: true, isActivated: true }, t, lang: "ru", toast: vi.fn(), toastError: vi.fn(), pokeMatches: vi.fn() };
  getImpl = () => Promise.resolve(playerData);
  api.post.mockClear();
  api.del.mockClear();
});

describe("Player", () => {
  test("рендерит имя и статы игрока", async () => {
    render(<Player params={{ playerId: 8 }} navigate={vi.fn()} />);
    await screen.findByText("Соперник");
    expect(screen.getByText("1200")).toBeTruthy(); // elo в статах
  });

  test("заявка победы при чекине шлёт /matches/report и дёргает watcher", async () => {
    render(<Player params={{ playerId: 8 }} navigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: t.player.iWonBtn }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/matches/report", { opponentId: 8, result: "win" }));
    expect(mockApp.pokeMatches).toHaveBeenCalled();
  });

  test("без чекина заявка не отправляется, показывается тост", async () => {
    mockApp.me = { id: 1, isCheckedIn: false, isActivated: true };
    render(<Player params={{ playerId: 8 }} navigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: t.player.iWonBtn }));
    expect(api.post).not.toHaveBeenCalled();
    expect(mockApp.toast).toHaveBeenCalled();
  });

  test("добавление в избранное вызывает post /favorites/:id", async () => {
    render(<Player params={{ playerId: 8 }} navigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: t.player.addFav }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/favorites/8"));
  });

  test("несуществующий игрок → заглушка «не найден»", async () => {
    getImpl = () => Promise.reject(Object.assign(new Error(), { code: "player_not_found" }));
    render(<Player params={{ playerId: 999 }} navigate={vi.fn()} />);
    await screen.findByText(t.result.notFound);
  });
});
