// Админка: список/поиск игроков, карточка игрока и действия (чекин/активация).
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { getT } from "../../src/i18n.js";

let mockApp, getImpl;
vi.mock("../../src/store.jsx", () => ({ useApp: () => mockApp }));
vi.mock("../../src/api.js", () => ({ api: { get: vi.fn((p) => getImpl(p)), post: vi.fn(() => Promise.resolve({})) } }));
vi.mock("../../src/telegram.js", () => ({ haptic: vi.fn(), tgConfirm: vi.fn(() => Promise.resolve(true)), tg: null }));

import { Admin, AdminPlayer } from "../../src/screens/Admin.jsx";
import { api } from "../../src/api.js";

const t = getT("ru");
beforeEach(() => {
  mockApp = { t, lang: "ru", toast: vi.fn(), toastError: vi.fn() };
  api.post.mockClear();
});

describe("Admin (список)", () => {
  test("рендерит игроков и ведёт в карточку", async () => {
    getImpl = () => Promise.resolve({ users: [
      { id: 1001, name: "Игрок Один", role: "user", elo: 1100, isActivated: true, isCheckedIn: false },
    ] });
    const navigate = vi.fn();
    render(<Admin navigate={navigate} />);
    fireEvent.click(await screen.findByText("Игрок Один"));
    expect(navigate).toHaveBeenCalledWith("admin-player", { playerId: 1001 });
  });
});

describe("AdminPlayer (карточка)", () => {
  const cardData = {
    user: { id: 1001, name: "Игрок Один", role: "user", elo: 1100, contact: "@x", isActivated: true, isCheckedIn: false, activatedUntil: Date.now() + 1e9, checkedInUntil: 0 },
    recentMatches: [],
  };

  test("чекин шлёт post /admin/users/:id/checkin", async () => {
    getImpl = () => Promise.resolve(cardData);
    render(<AdminPlayer params={{ playerId: 1001 }} />);
    await screen.findByText("Игрок Один");
    fireEvent.click(screen.getByRole("button", { name: t.admin.checkin }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/admin/users/1001/checkin"));
  });

  test("несуществующий игрок → заглушка", async () => {
    getImpl = () => Promise.reject(Object.assign(new Error(), { code: "player_not_found" }));
    render(<AdminPlayer params={{ playerId: 9 }} />);
    await screen.findByText(t.result.notFound);
  });
});
