// Экран «Внести результат»: список недавних соперников, дебаунс-поиск по ID,
// переход в профиль найденного игрока, обработка «не найден».
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { getT } from "../../src/i18n.js";

let mockApp, getImpl;
vi.mock("../../src/store.jsx", () => ({ useApp: () => mockApp }));
vi.mock("../../src/api.js", () => ({ api: { get: vi.fn((p) => getImpl(p)) } }));

import { Result } from "../../src/screens/Result.jsx";

const t = getT("ru");

beforeEach(() => {
  mockApp = { t, toastError: vi.fn() };
  getImpl = (p) => {
    if (p === "/recent-opponents") return Promise.resolve({ opponents: [
      { id: 1001, name: "Анна", elo: 1100, role: "user", lastDelta: 12 },
      { id: 1002, name: "Борис", elo: 980, role: "user", lastDelta: -8 },
    ] });
    return Promise.reject(Object.assign(new Error(), { code: "player_not_found" }));
  };
});

describe("недавние соперники", () => {
  test("рендерятся при пустом поле ввода", async () => {
    render(<Result navigate={vi.fn()} />);
    await screen.findByText("Анна");
    expect(screen.getByText("Борис")).toBeTruthy();
  });
});

describe("поиск по ID (дебаунс)", () => {
  test("валидный ID находит игрока и ведёт в профиль", async () => {
    getImpl = (p) =>
      p === "/recent-opponents" ? Promise.resolve({ opponents: [] })
      : p === "/players/1234" ? Promise.resolve({ player: { id: 1234, name: "Гена", elo: 1250, role: "admin" } })
      : Promise.reject(Object.assign(new Error(), { code: "player_not_found" }));

    const navigate = vi.fn();
    render(<Result navigate={navigate} />);
    fireEvent.change(screen.getByPlaceholderText(t.result.placeholder), { target: { value: "1234" } });

    const found = await screen.findByText("Гена", {}, { timeout: 1500 }); // ждём дебаунс 350мс + промис
    fireEvent.click(found);
    expect(navigate).toHaveBeenCalledWith("player", { playerId: 1234, title: "Гена" });
  });

  test("неизвестный ID показывает «не найден»", async () => {
    render(<Result navigate={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(t.result.placeholder), { target: { value: "999" } });
    await screen.findByText(t.result.notFound, {}, { timeout: 1500 });
  });

  test("нецифровой ввод фильтруется (поиск не запускается)", async () => {
    const navigate = vi.fn();
    render(<Result navigate={navigate} />);
    const input = screen.getByPlaceholderText(t.result.placeholder);
    fireEvent.change(input, { target: { value: "abc" } });
    expect(input.value).toBe(""); // \D вырезано
  });
});
