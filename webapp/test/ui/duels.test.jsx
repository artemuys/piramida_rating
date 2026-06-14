// Дуэли: списки входящих/исходящих, пустое состояние, отклонение/отмена
// (post + перезагрузка) и отправка вызова через DuelModal.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { getT } from "../../src/i18n.js";

let mockApp, getImpl;
vi.mock("../../src/store.jsx", () => ({ useApp: () => mockApp }));
vi.mock("../../src/api.js", () => ({ api: { get: vi.fn((p) => getImpl(p)), post: vi.fn(() => Promise.resolve({})) } }));
vi.mock("../../src/telegram.js", () => ({ haptic: vi.fn(), tg: null }));

import { Duels, DuelModal } from "../../src/screens/Duels.jsx";
import { api } from "../../src/api.js";

const t = getT("ru");
beforeEach(() => {
  mockApp = { me: { id: 1, contact: "@me" }, t, toast: vi.fn(), toastError: vi.fn() };
  api.post.mockClear();
});

describe("Duels", () => {
  test("нет вызовов → пустое состояние", async () => {
    getImpl = () => Promise.resolve({ incoming: [], outgoing: [] });
    render(<Duels navigate={vi.fn()} />);
    await screen.findByText(t.duels.empty);
  });

  test("входящий вызов можно отклонить (post + перезагрузка)", async () => {
    getImpl = () => Promise.resolve({
      incoming: [{ id: 5, challenger: { id: 2, name: "Вызов", elo: 1100, contact: "@c" }, message: "го", status: "open" }],
      outgoing: [],
    });
    render(<Duels navigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: t.duels.decline }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/duels/5/decline"));
  });

  test("исходящий вызов можно отменить", async () => {
    getImpl = () => Promise.resolve({
      incoming: [],
      outgoing: [{ id: 7, opponent: { id: 3, name: "Цель", elo: 1000 }, status: "open" }],
    });
    render(<Duels navigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: t.duels.cancelBtn }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/duels/7/cancel"));
  });
});

describe("DuelModal", () => {
  test("отправляет вызов с сообщением", async () => {
    render(<DuelModal opponent={{ id: 9, name: "Враг" }} onClose={vi.fn()} onSent={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(t.duels.msgPh), { target: { value: "выходи" } });
    fireEvent.click(screen.getByRole("button", { name: t.duels.send }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/duels", { opponentId: 9, message: "выходи" }));
  });

  test("без контакта отправка заблокирована и показывает ошибку", () => {
    mockApp.me = { id: 1, contact: "" };
    render(<DuelModal opponent={{ id: 9, name: "Враг" }} onClose={vi.fn()} onSent={vi.fn()} />);
    expect(screen.getByRole("button", { name: t.duels.send }).disabled).toBe(true);
  });
});
