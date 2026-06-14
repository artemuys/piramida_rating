// Заявки (новая модель): диапазон дат (до 7 дней) + диапазон времени (с–по),
// список своих с удалением, лента чужих, создание через форму.
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
const today = () => {
  const d = new Date();
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

  test("своя заявка показывает диапазон времени и удаляется", async () => {
    getImpl = (p) =>
      p === "/requests/mine"
        ? Promise.resolve({ requests: [{ id: 11, startDay: today(), endDay: today(), timeFrom: "18:00", timeTo: "22:00", disc: 0, pays: 0 }] })
        : Promise.resolve({ feed: [] });
    render(<Apps navigate={vi.fn()} />);
    expect(await screen.findByText(/18:00–22:00/)).toBeTruthy();
    fireEvent.click(screen.getByText(t.apps.delete));
    await waitFor(() => expect(api.del).toHaveBeenCalledWith("/requests/11"));
  });

  test("чужая заявка из ленты ведёт в профиль", async () => {
    getImpl = (p) =>
      p === "/requests/mine"
        ? Promise.resolve({ requests: [] })
        : Promise.resolve({ feed: [{ id: 2, startDay: today(), endDay: today(), timeFrom: "10:00", timeTo: "14:00", disc: 0, pays: 0, player: { id: 50, name: "Игрок", elo: 1100, role: "user", contact: "@x" } }] });
    const navigate = vi.fn();
    render(<Apps navigate={navigate} />);
    fireEvent.click(await screen.findByText("Игрок"));
    expect(navigate).toHaveBeenCalledWith("player", { playerId: 50, title: "Игрок" });
  });

  test("форма новой заявки отправляет диапазон дат и времени", async () => {
    getImpl = () => Promise.resolve({ requests: [], feed: [] });
    render(<Apps navigate={vi.fn()} />);
    fireEvent.click(await screen.findByText(t.apps.newApp));
    fireEvent.click(screen.getByRole("button", { name: t.apps.create }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe("/requests");
    expect(body).toMatchObject({ startOffset: 0, endOffset: 0, timeFrom: "18:00", timeTo: "22:00" });
    expect(typeof body.disc).toBe("number");
  });

  test("невалидный интервал времени блокирует создание", async () => {
    getImpl = () => Promise.resolve({ requests: [], feed: [] });
    const { container } = render(<Apps navigate={vi.fn()} />);
    fireEvent.click(await screen.findByText(t.apps.newApp));
    const [from, to] = container.querySelectorAll('input[type="time"]');
    fireEvent.change(from, { target: { value: "22:00" } });
    fireEvent.change(to, { target: { value: "20:00" } }); // конец раньше начала
    expect(screen.getByRole("button", { name: t.apps.create }).disabled).toBe(true);
  });
});
