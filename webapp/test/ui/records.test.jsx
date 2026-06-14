// Клубные рекорды: загрузка /records и отрисовка имеющихся записей по секциям.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { getT } from "../../src/i18n.js";

let mockApp, getImpl;
vi.mock("../../src/store.jsx", () => ({ useApp: () => mockApp }));
vi.mock("../../src/api.js", () => ({ api: { get: vi.fn((p) => getImpl(p)) } }));
vi.mock("../../src/telegram.js", () => ({ haptic: vi.fn(), tg: null }));

import { Records } from "../../src/screens/Records.jsx";

const t = getT("ru");
beforeEach(() => { mockApp = { t, toastError: vi.fn() }; });

describe("Records", () => {
  test("рендерит имеющиеся рекорды (имена и значения)", async () => {
    getImpl = () => Promise.resolve({
      allTime: {
        bestStreak: { id: 1, name: "Чемпион", count: 9 },
        peakElo: { id: 2, name: "Пик", elo: 1500 },
        veteran: null, derby: null, boss: null, upset: null,
      },
      monthly: { mostMatches: null, topGainer: null, topDonor: null, topHunter: null },
      weekly: { topGainer: null, marathon: null },
    });
    render(<Records navigate={vi.fn()} />);
    await screen.findByText("Чемпион");
    expect(screen.getByText("Пик")).toBeTruthy();
    expect(screen.getByText(/1500/)).toBeTruthy();
  });

  test("спиннер пока данные не загружены", () => {
    getImpl = () => new Promise(() => {}); // никогда не резолвится
    const { container } = render(<Records navigate={vi.fn()} />);
    expect(container.querySelector(".spinner")).toBeTruthy();
  });
});
