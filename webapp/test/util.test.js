// Ядро интерфейса без рендера: цвета аватаров, инициалы, форматтеры времени,
// проценты, ранги (ELO), уровни (XP). Любая ошибка здесь — это неверные цифры
// у каждого игрока в шапке профиля, рейтинге и модалке результата.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  avaColor,
  initials,
  fmtDate,
  fmtDateTime,
  fmtDayLabel,
  fmtCountdown,
  fmtElapsed,
  fmtAgo,
  winPct,
  RANKS,
  rankOf,
  xpToReachLevel,
  levelFromXp,
  xpProgress,
} from "../src/util.js";

describe("avaColor", () => {
  test("детерминирован и всегда из палитры", () => {
    assert.equal(avaColor(5), avaColor(5));
    const PALETTE = ["#0A84FF", "#30D158", "#f59e0b", "#BF5AF2", "#FF375F", "#64D2FF", "#FF9F0A", "#FFD60A"];
    for (const id of [0, 1, 7, 8, 123, -3]) assert.ok(PALETTE.includes(avaColor(id)));
  });

  test("отрицательные и нечисловые id не ломают индекс", () => {
    assert.equal(avaColor(-8), avaColor(0)); // |−8| % 8 === 0
    assert.equal(avaColor(null), avaColor(0));
    assert.equal(avaColor(undefined), avaColor(0));
    assert.equal(avaColor("xx"), avaColor(0)); // NaN → 0
  });
});

describe("initials", () => {
  test("до двух заглавных букв из слов", () => {
    assert.equal(initials("Иван Петров"), "ИП");
    assert.equal(initials("john ronald reuel"), "JR"); // первые два слова
    assert.equal(initials("Мадонна"), "М");
  });

  test("края: пусто/пробелы/мусор → '?'", () => {
    assert.equal(initials(""), "?");
    assert.equal(initials(null), "?");
    assert.equal(initials(undefined), "?");
    assert.equal(initials("   "), ""); // только пробелы → пустая строка после filter
  });
});

describe("fmtDate / fmtDateTime", () => {
  const ts = Date.UTC(2024, 2, 15, 10, 30); // 15 марта 2024

  test("falsy → прочерк", () => {
    assert.equal(fmtDate(0, "ru"), "—");
    assert.equal(fmtDate(null, "ru"), "—");
    assert.equal(fmtDateTime(undefined, "en"), "—");
  });

  test("валидный ts → непустая строка для каждого языка", () => {
    for (const lang of ["ru", "en", "pl", "uk"]) {
      assert.ok(fmtDate(ts, lang).length > 0);
      assert.ok(fmtDateTime(ts, lang).length > 0);
    }
  });

  test("неизвестный язык не падает (фолбэк локали)", () => {
    assert.ok(fmtDate(ts, "xx").length > 0);
  });
});

describe("fmtDayLabel", () => {
  const t = { apps: { today: "Сегодня", tomorrow: "Завтра" } };
  const ymd = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  test("сегодня и завтра распознаются как локальные метки", () => {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    assert.equal(fmtDayLabel(ymd(today), t, "ru"), "Сегодня");
    assert.equal(fmtDayLabel(ymd(tomorrow), t, "ru"), "Завтра");
  });

  test("прочая дата форматируется как день+месяц", () => {
    const label = fmtDayLabel("2024-03-15", t, "ru");
    assert.notEqual(label, "Сегодня");
    assert.notEqual(label, "Завтра");
    assert.ok(label.length > 0);
  });
});

describe("fmtCountdown", () => {
  test("MM:SS с округлением вверх", () => {
    assert.equal(fmtCountdown(0), "00:00");
    assert.equal(fmtCountdown(1), "00:01"); // ceil
    assert.equal(fmtCountdown(59_000), "00:59");
    assert.equal(fmtCountdown(60_000), "01:00");
    assert.equal(fmtCountdown(90_500), "01:31");
  });

  test("отрицательное время зажимается в 00:00", () => {
    assert.equal(fmtCountdown(-5000), "00:00");
  });
});

describe("fmtElapsed", () => {
  test("HH:MM:SS с округлением вниз", () => {
    assert.equal(fmtElapsed(0), "00:00:00");
    assert.equal(fmtElapsed(999), "00:00:00"); // floor
    assert.equal(fmtElapsed(1000), "00:00:01");
    assert.equal(fmtElapsed(3_661_000), "01:01:01");
  });

  test("отрицательное → 00:00:00", () => {
    assert.equal(fmtElapsed(-1), "00:00:00");
  });
});

describe("fmtAgo", () => {
  test("границы единиц времени", () => {
    assert.equal(fmtAgo(0), "только что");
    assert.equal(fmtAgo(59_000), "только что");
    assert.equal(fmtAgo(60_000), "1 мин назад");
    assert.equal(fmtAgo(59 * 60_000), "59 мин назад");
    assert.equal(fmtAgo(60 * 60_000), "1 ч назад");
    assert.equal(fmtAgo(23 * 3_600_000), "23 ч назад");
    assert.equal(fmtAgo(24 * 3_600_000), "1 д назад");
    assert.equal(fmtAgo(50 * 3_600_000), "2 д назад");
  });
});

describe("winPct", () => {
  test("округлённый процент побед", () => {
    assert.equal(winPct(0, 0), 0); // защита от деления на ноль
    assert.equal(winPct(10, 5), 50);
    assert.equal(winPct(3, 1), 33);
    assert.equal(winPct(3, 2), 67);
    assert.equal(winPct(10, 10), 100);
  });
});

describe("rankOf / RANKS", () => {
  test("границы рангов по ELO", () => {
    assert.equal(rankOf(0).name, "bronze");
    assert.equal(rankOf(1099).name, "bronze");
    assert.equal(rankOf(1100).name, "silver");
    assert.equal(rankOf(1200).name, "platinum");
    assert.equal(rankOf(1300).name, "emerald");
    assert.equal(rankOf(1400).name, "diamond");
    assert.equal(rankOf(1500).name, "master");
    assert.equal(rankOf(9999).name, "master");
  });

  test("ELO ниже минимума всё равно даёт бронзу", () => {
    assert.equal(rankOf(-50).name, "bronze");
  });

  test("у каждого ранга кроме мастера есть next == min следующего", () => {
    for (let i = 0; i < RANKS.length - 1; i++) {
      assert.equal(RANKS[i].next, RANKS[i + 1].min);
    }
    assert.equal(RANKS[RANKS.length - 1].next, null);
  });
});

describe("XP: xpToReachLevel / levelFromXp / xpProgress", () => {
  test("уровни 1 и ниже требуют 0 XP, дальше монотонный рост", () => {
    assert.equal(xpToReachLevel(1), 0);
    assert.equal(xpToReachLevel(0), 0);
    let prev = -1;
    for (let n = 1; n <= 100; n++) {
      const xp = xpToReachLevel(n);
      assert.ok(xp >= prev, `XP уровня ${n} не убывает`);
      prev = xp;
    }
  });

  test("levelFromXp — обратна порогам", () => {
    assert.equal(levelFromXp(0), 1);
    assert.equal(levelFromXp(-100), 1);
    for (let n = 2; n <= 100; n++) {
      assert.equal(levelFromXp(xpToReachLevel(n)), n, `порог уровня ${n}`);
      assert.equal(levelFromXp(xpToReachLevel(n) - 1), n - 1, `чуть ниже порога ${n}`);
    }
  });

  test("xpProgress: pct в [0,100], current/needed согласованы", () => {
    for (const xp of [0, 50, 200, 1000, 5000]) {
      const p = xpProgress(xp);
      assert.ok(p.pct >= 0 && p.pct <= 100);
      assert.equal(p.level, levelFromXp(xp));
      assert.ok(p.current >= 0 && p.current <= p.needed);
    }
  });

  test("xpProgress: максимальный уровень 100 фиксирует pct=100", () => {
    const big = xpToReachLevel(100) + 999;
    const p = xpProgress(big);
    assert.equal(p.level, 100);
    assert.equal(p.pct, 100);
  });
});
