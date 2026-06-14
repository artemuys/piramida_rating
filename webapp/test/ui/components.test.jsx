// Презентационные компоненты: что реально попадает в DOM при разных входных
// данных. Изолируем от store (мок useApp) и от побочек (confetti) — проверяем
// чистый рендер: ранги, уровни, серии, аватары, контакты, модалка результата.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { getT } from "../../src/i18n.js";

let mockApp;
vi.mock("../../src/store.jsx", () => ({ useApp: () => mockApp }));
vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

import {
  Ava, Crown, RankBadge, RankProgress, LevelBar,
  StreakBadge, StreakProgress, WinStreak, Empty, Spinner,
  ContactLink, MatchResultModal,
} from "../../src/components.jsx";

const t = getT("ru");

beforeEach(() => {
  mockApp = { t, me: { id: 1, name: "Я", elo: 1000, xp: 0, streak: 0 }, toasts: [] };
});

describe("Ava", () => {
  test("показывает инициалы и тонирована цветом id", () => {
    const { container } = render(<Ava id={1} name="Иван Петров" />);
    expect(screen.getByText("ИП")).toBeTruthy();
    expect(container.querySelector(".ava")).toBeTruthy();
  });
});

describe("Crown", () => {
  test("корона только у админа", () => {
    const { container, rerender } = render(<Crown role="user" />);
    expect(container.textContent).toBe("");
    rerender(<Crown role="admin" />);
    expect(container.textContent).toContain("👑");
  });
});

describe("RankBadge", () => {
  test("ранг соответствует ELO", () => {
    render(<RankBadge elo={1250} />);
    expect(screen.getByText(new RegExp(t.ranks.platinum))).toBeTruthy();
  });
});

describe("RankProgress", () => {
  test("у мастера — метка максимального ранга, прогресс 100%", () => {
    const { container } = render(<RankProgress elo={1600} />);
    expect(container.textContent).toContain(t.ranks.maxRank);
    expect(container.querySelector(".rank-progress-fill").style.width).toBe("100%");
  });

  test("ниже мастера — частичный прогресс к следующему рангу", () => {
    const { container } = render(<RankProgress elo={1150} />); // silver, next 1200
    const w = container.querySelector(".rank-progress-fill").style.width;
    expect(w).toBe("50%"); // (1150-1100)/(1200-1100)
  });
});

describe("LevelBar", () => {
  test("показывает уровень и XP-прогресс, не падает на пустом xp", () => {
    const { container } = render(<LevelBar xp={undefined} />);
    expect(container.textContent).toContain("XP");
    expect(container.querySelector(".level-bar-fill")).toBeTruthy();
  });
});

describe("StreakBadge", () => {
  test("ничего при |streak| < 2", () => {
    expect(render(<StreakBadge streak={0} />).container.textContent).toBe("");
    expect(render(<StreakBadge streak={1} />).container.textContent).toBe("");
  });
  test("огонь на победной серии, лёд на проигрышной", () => {
    expect(render(<StreakBadge streak={3} />).container.textContent).toContain("🔥");
    expect(render(<StreakBadge streak={-4} />).container.textContent).toContain("❄️");
  });
});

describe("StreakProgress", () => {
  test("ровно 5 точек, заполнено min(|streak|,5)", () => {
    const { container } = render(<StreakProgress streak={3} />);
    expect(container.querySelectorAll(".streak-progress-dot").length).toBe(5);
    expect(container.querySelectorAll(".sp-win").length).toBe(3);
  });
});

describe("WinStreak", () => {
  test("пусто без матчей", () => {
    expect(render(<WinStreak matches={[]} />).container.textContent).toBe("");
  });
  test("максимум 6 точек + многоточие при переполнении", () => {
    const matches = Array.from({ length: 8 }, (_, i) => ({ iWon: i % 2 === 0 }));
    const { container } = render(<WinStreak matches={matches} />);
    expect(container.querySelectorAll(".ws-dot").length).toBe(6);
    expect(container.querySelector(".ws-more")).toBeTruthy();
  });
});

describe("Empty / Spinner", () => {
  test("Empty рендерит иконку, текст и подсказку", () => {
    const { container } = render(<Empty icon="🎱" text="Пусто" hint="подсказка" />);
    expect(container.textContent).toContain("🎱");
    expect(container.textContent).toContain("Пусто");
    expect(container.textContent).toContain("подсказка");
  });
  test("Spinner рендерит .spinner", () => {
    expect(render(<Spinner />).container.querySelector(".spinner")).toBeTruthy();
  });
});

describe("ContactLink", () => {
  test("Telegram-ник → ссылка на t.me", () => {
    render(<ContactLink contact="@user" />);
    expect(screen.getByText("@user").getAttribute("href")).toBe("https://t.me/user");
  });
  test("телефон → tel:", () => {
    render(<ContactLink contact="+79990001122" />);
    expect(screen.getByText("+79990001122").getAttribute("href")).toBe("tel:+79990001122");
  });
  test("пустой контакт ничего не рендерит", () => {
    expect(render(<ContactLink contact="" />).container.textContent).toBe("");
  });
});

describe("MatchResultModal", () => {
  const base = {
    status: "confirmed", iWon: true, delta: 16,
    my: { eloBefore: 1000, eloAfter: 1016 },
    their: { eloBefore: 1000, eloAfter: 984 },
    opponentUser: { id: 2, name: "Соперник", elo: 1000 },
  };

  test("победа: трофей, заголовок победы, имя соперника", () => {
    const { container } = render(<MatchResultModal match={base} onClose={() => {}} />);
    expect(container.textContent).toContain("🏆");
    expect(container.textContent).toContain(t.modal.win);
    expect(container.textContent).toContain("Соперник");
  });

  test("поражение: череп и заголовок поражения", () => {
    const { container } = render(
      <MatchResultModal match={{ ...base, iWon: false }} onClose={() => {}} />
    );
    expect(container.textContent).toContain("💀");
    expect(container.textContent).toContain(t.modal.lose);
  });

  test("конфликт: статус не confirmed → подпись о спорном матче, без изменения ELO", () => {
    const { container } = render(
      <MatchResultModal match={{ ...base, status: "conflict" }} onClose={() => {}} />
    );
    expect(container.textContent).toContain(t.modal.conflict);
    expect(container.textContent).toContain(t.modal.noChange);
  });
});
