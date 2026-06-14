// Регрессия: дисциплина «пирамида» отдаёт ачивки с префиксом 'p:'. Экран обязан
// снимать префикс при сопоставлении с ACH_META, иначе заработанные достижения
// рисуются как «не получено» (баг после удаления pool/pyramid-сплита).
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { getT } from "../../src/i18n.js";

let mockApp;
let achievementsResponse;
vi.mock("../../src/store.jsx", () => ({ useApp: () => mockApp }));
vi.mock("../../src/api.js", () => ({
  api: { get: vi.fn(() => Promise.resolve({ achievements: achievementsResponse })) },
}));

import { Achievements, ACH_META } from "../../src/screens/Achievements.jsx";
import { api } from "../../src/api.js";

const t = getT("ru");
const ALL = Object.keys(ACH_META).length;

beforeEach(() => {
  mockApp = { t, lang: "ru", toastError: vi.fn() };
  api.get.mockClear();
});

describe("Achievements: префикс 'p:' (пирамида)", () => {
  test("ачивка p:calibration засчитывается как полученная", async () => {
    achievementsResponse = [{ code: "p:calibration", earnedAt: Date.now() }];
    const { container } = render(<Achievements />);

    await waitFor(() => expect(container.querySelector(".ach-grid")).not.toBeNull());

    // Карточка очков показывается только когда есть заработанные
    expect(container.querySelector(".ach-score-card")).not.toBeNull();
    // 1 получена → ровно одна карточка без класса locked
    const total = container.querySelectorAll(".ach-card").length;
    const locked = container.querySelectorAll(".ach-card.ach-locked").length;
    expect(total).toBe(ALL);
    expect(locked).toBe(ALL - 1);
    expect(container.textContent).toContain(t.ach.earnedSection);
  });

  test("без ачивок показывается пустое состояние, всё заблокировано", async () => {
    achievementsResponse = [];
    const { container } = render(<Achievements />);

    await waitFor(() => expect(container.querySelector(".ach-grid")).not.toBeNull());
    expect(container.querySelector(".ach-score-card")).toBeNull();
    expect(container.querySelectorAll(".ach-card.ach-locked").length).toBe(ALL);
    expect(container.textContent).toContain(t.ach.empty);
  });

  test("сезонная ачивка p:season_master_3 попадает в полученные сверх ACH_META", async () => {
    achievementsResponse = [{ code: "p:season_master_3", earnedAt: Date.now() }];
    const { container } = render(<Achievements />);

    await waitFor(() => expect(container.querySelector(".ach-grid")).not.toBeNull());
    expect(container.querySelector(".ach-score-card")).not.toBeNull();
    // season_master_* не входит в ACH_META → +1 карточка сверх базовых
    expect(container.querySelectorAll(".ach-card").length).toBe(ALL + 1);
  });

  test("для чужого профиля запрашивается /achievements/:id", async () => {
    achievementsResponse = [];
    render(<Achievements playerId={42} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/achievements/42"));
  });
});
