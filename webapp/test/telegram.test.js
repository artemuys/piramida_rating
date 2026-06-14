// Обёртка над Telegram WebApp SDK. Все методы версионно-зависимы и должны
// безопасно деградировать в обычном браузере (без window.Telegram) и на старых
// клиентах (isVersionAtLeast === false), не выбрасывая исключений в рендер.
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";

// telegram.js читает window.Telegram?.WebApp ОДИН раз на этапе загрузки модуля.
// Чтобы протестировать разные окружения, ставим window и импортируем модуль
// заново с уникальным query-параметром (обход кэша ESM).
let modSeq = 0;
async function loadWith(webApp) {
  if (webApp === null) delete globalThis.window;
  else globalThis.window = { Telegram: { WebApp: webApp }, confirm: () => true, open: () => {} };
  return import(`../src/telegram.js?v=${++modSeq}`);
}

afterEach(() => { delete globalThis.window; });

// Мок WebApp с управляемой версией и шпионами вызовов.
function makeWebApp({ version = true } = {}) {
  const calls = [];
  return {
    calls,
    initData: "",
    isVersionAtLeast: () => version,
    HapticFeedback: {
      notificationOccurred: (x) => calls.push(["notify", x]),
      impactOccurred: (x) => calls.push(["impact", x]),
    },
    BackButton: {
      show: () => calls.push(["show"]),
      hide: () => calls.push(["hide"]),
      onClick: (cb) => calls.push(["onClick", cb]),
      offClick: (cb) => calls.push(["offClick", cb]),
    },
    showConfirm: (msg, cb) => { calls.push(["confirm", msg]); cb(true); },
  };
}

describe("вне Telegram (нет window.Telegram)", () => {
  test("функции не падают и сообщают, что мы не в Telegram", async () => {
    const m = await loadWith(null);
    assert.equal(m.tg, null);
    assert.equal(m.getInitData(), "");
    assert.equal(m.insideTelegram(), false);
    assert.doesNotThrow(() => m.haptic("ok"));
    assert.equal(typeof m.setBackButton(true, () => {}), "function");
    m.initTelegram(); // не должно бросать
  });
});

describe("insideTelegram", () => {
  test("true только при наличии initData", async () => {
    const wa = makeWebApp();
    wa.initData = "query_id=AAA";
    const m = await loadWith(wa);
    assert.equal(m.insideTelegram(), true);
    assert.equal(m.getInitData(), "query_id=AAA");
  });

  test("false если initData пустой", async () => {
    const m = await loadWith(makeWebApp());
    assert.equal(m.insideTelegram(), false);
  });
});

describe("haptic — версионное гейтирование", () => {
  test("на старом клиенте (<6.1) ничего не вызывает", async () => {
    const wa = makeWebApp({ version: false });
    const m = await loadWith(wa);
    m.haptic("ok");
    m.haptic("err");
    m.haptic("light");
    assert.deepEqual(wa.calls, []);
  });

  test("маппинг типов на методы SDK", async () => {
    const wa = makeWebApp({ version: true });
    const m = await loadWith(wa);
    m.haptic("ok");
    m.haptic("err");
    m.haptic("light");
    assert.deepEqual(wa.calls, [
      ["notify", "success"],
      ["notify", "error"],
      ["impact", "light"],
    ]);
  });
});

describe("setBackButton", () => {
  test("на старом клиенте возвращает no-op и не трогает кнопку", async () => {
    const wa = makeWebApp({ version: false });
    const m = await loadWith(wa);
    const off = m.setBackButton(true, () => {});
    assert.equal(typeof off, "function");
    assert.deepEqual(wa.calls, []);
  });

  test("visible=true показывает кнопку и вешает обработчик; cleanup снимает", async () => {
    const wa = makeWebApp({ version: true });
    const m = await loadWith(wa);
    const cb = () => {};
    const off = m.setBackButton(true, cb);
    assert.deepEqual(wa.calls, [["show"], ["onClick", cb]]);
    off();
    assert.deepEqual(wa.calls.at(-1), ["offClick", cb]);
  });

  test("visible=false прячет кнопку", async () => {
    const wa = makeWebApp({ version: true });
    const m = await loadWith(wa);
    m.setBackButton(false, () => {});
    assert.deepEqual(wa.calls, [["hide"]]);
  });
});

describe("tgConfirm", () => {
  test("использует нативный showConfirm, когда доступен", async () => {
    const wa = makeWebApp({ version: true });
    const m = await loadWith(wa);
    const ok = await m.tgConfirm("Точно?");
    assert.equal(ok, true);
    assert.deepEqual(wa.calls.at(-1), ["confirm", "Точно?"]);
  });

  test("фолбэк на window.confirm, если showConfirm нет", async () => {
    const wa = makeWebApp({ version: true });
    delete wa.showConfirm;
    globalThis.window = { Telegram: { WebApp: wa }, confirm: () => false };
    const m = await import(`../src/telegram.js?v=${++modSeq}`);
    const ok = await m.tgConfirm("?");
    assert.equal(ok, false);
  });
});
