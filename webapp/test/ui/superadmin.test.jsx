// Суперадмин-панель: вкладки. Дефолтная (Игроки) грузит /admin/users,
// переключение на Статистику грузит /admin/stats.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { getT } from "../../src/i18n.js";

let mockApp, getImpl;
vi.mock("../../src/store.jsx", () => ({ useApp: () => mockApp }));
vi.mock("../../src/api.js", () => ({ api: { get: vi.fn((p) => getImpl(p)), post: vi.fn(() => Promise.resolve({})), del: vi.fn(() => Promise.resolve({})), patch: vi.fn(() => Promise.resolve({})) } }));
vi.mock("../../src/telegram.js", () => ({ haptic: vi.fn(), tgConfirm: vi.fn(() => Promise.resolve(true)), tg: null }));

import { SuperAdmin } from "../../src/screens/SuperAdmin.jsx";
import { api } from "../../src/api.js";

const t = getT("ru");
beforeEach(() => {
  mockApp = { t, toast: vi.fn(), toastError: vi.fn() };
  getImpl = (p) => {
    if (p.startsWith("/admin/users")) return Promise.resolve({ users: [{ id: 1001, name: "Игрок", role: "user", elo: 1100, isActivated: true, isCheckedIn: false }] });
    if (p === "/admin/stats") return Promise.resolve({ total: 42, activated: 30, banned: 1, searching: 3, matchesToday: 5, matchesTotal: 100, currentSeason: null });
    return Promise.resolve({});
  };
});

describe("SuperAdmin", () => {
  test("дефолтная вкладка «Игроки» грузит список", async () => {
    render(<SuperAdmin navigate={vi.fn()} />);
    await screen.findByText("Игрок");
    expect(api.get).toHaveBeenCalledWith("/admin/users");
  });

  test("переключение на «Статистика» грузит /admin/stats и показывает числа", async () => {
    render(<SuperAdmin navigate={vi.fn()} />);
    await screen.findByText("Игрок");
    fireEvent.click(screen.getByRole("button", { name: "📊 Статистика" }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/admin/stats"));
    await screen.findByText("42"); // total
  });
});
