// Заявки: список своих + лента чужих по дням, удаление своей, создание новой
// через форму (post /requests).
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { getT } from "../../src/i18n.js";

let mockApp, getImpl;
vi.mock("../../src/store.jsx", () => ({ useApp: () => mockApp }));
vi.mock("../../src/api.js", () => ({
  api: { get: vi.fn((p) => getImpl(p)), post: vi.fn(() => Promise.resolve({ id: 1 })), del: vi.fn(() => Promise.resolve({})) },
}));
vi.mock("../../src/telegram.js", () => ({ haptic: vi.fn(), tg: null }));

import { Apps } from "../../src/screens/Apps.jsx";
import { api } from "../../src/api.js";

const t = getT("ru");
const tomorrow = () => {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

beforeEach(() => {
  mockApp = { me: { id: 1, lang: "ru", prefDisc: 2, prefPays: 0, activeDiscipline: "pyramid" }, t, toastError: vi.fn() };
  api.post.mockClear();
  api.del.mockClear();
});

describe("Apps", () => {
  test("нет своих заявок → подсказка, лента пуста", async () => {
    getImpl = () => Promise.resolve({ requests: [], feed: [] });
    render(<Apps navigate={vi.fn()} />);
    await screen.findByText(t.apps.noApps);
    expect(screen.getByText(t.apps.emptyFeed)).toBeTruthy();
  });

  test("своя заявка удаляется через del", async () => {
    getImpl = (p) =>
      p === "/requests/mine"
        ? Promise.resolve({ requests: [{ id: 11, day: tomorrow(), timeSlot: 0, disc: 0, pays: 0 }] })
        : Promise.resolve({ feed: [] });
    render(<Apps navigate={vi.fn()} />);
    fireEvent.click(await screen.findByText(t.apps.delete));
    await waitFor(() => expect(api.del).toHaveBeenCalledWith("/requests/11"));
  });

  test("чужая заявка из ленты ведёт в профиль", async () => {
    getImpl = (p) =>
      p === "/requests/mine"
        ? Promise.resolve({ requests: [] })
        : Promise.resolve({ feed: [{ id: 2, day: tomorrow(), timeSlot: 0, disc: 0, pays: 0, player: { id: 50, name: "Игрок", elo: 1100, role: "user", contact: "@x" } }] });
    const navigate = vi.fn();
    render(<Apps navigate={navigate} />);
    fireEvent.click(await screen.findByText("Игрок"));
    expect(navigate).toHaveBeenCalledWith("player", { playerId: 50, title: "Игрок" });
  });

  test("форма новой заявки отправляет post /requests", async () => {
    getImpl = () => Promise.resolve({ requests: [], feed: [] });
    render(<Apps navigate={vi.fn()} />);
    fireEvent.click(await screen.findByText(t.apps.newApp));
    fireEvent.click(screen.getByRole("button", { name: t.apps.create }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe("/requests");
    expect(body).toMatchObject({ dayOffset: 1, timeSlot: 0 });
  });
});
