// HTTP-клиент: какие заголовки уходят на сервер и как ответы превращаются в
// ApiError. Ошибка в маппинге кодов = неверные тосты у игрока и сломанные фазы
// в store (auth_failed / not_onboarded распознаются именно по code).
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// getInitData мокаем — он лезет в window.Telegram, нам нужен контролируемый ответ.
vi.mock("../../src/telegram.js", () => ({ getInitData: vi.fn(() => "") }));

import { api, ApiError } from "../../src/api.js";
import { getInitData } from "../../src/telegram.js";

function mockFetch(impl) {
  const fn = vi.fn(impl);
  global.fetch = fn;
  return fn;
}
const okJson = (data, status = 200) => () =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) });

beforeEach(() => {
  getInitData.mockReturnValue("");
  localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("заголовки запроса", () => {
  test("init-data Telegram уходит в x-telegram-init-data", async () => {
    getInitData.mockReturnValue("query_id=AAA");
    const f = mockFetch(okJson({ ok: 1 }));
    await api.get("/me");
    const [url, opts] = f.mock.calls[0];
    expect(url).toBe("/api/me");
    expect(opts.headers["x-telegram-init-data"]).toBe("query_id=AAA");
    expect(opts.headers["x-dev-tg-id"]).toBeUndefined();
  });

  test("без init-data в DEV подставляется x-dev-tg-id из localStorage", async () => {
    localStorage.setItem("devTgId", "42");
    const f = mockFetch(okJson({}));
    await api.get("/me");
    // import.meta.env.DEV истинен под vitest → ветка dev-заголовка активна
    expect(f.mock.calls[0][1].headers["x-dev-tg-id"]).toBe("42");
  });

  test("POST сериализует тело и ставит content-type", async () => {
    const f = mockFetch(okJson({}));
    await api.post("/matches", { opponentId: 7 });
    const opts = f.mock.calls[0][1];
    expect(opts.method).toBe("POST");
    expect(opts.headers["content-type"]).toBe("application/json");
    expect(opts.body).toBe(JSON.stringify({ opponentId: 7 }));
  });

  test("GET не несёт тела и content-type", async () => {
    const f = mockFetch(okJson({}));
    await api.get("/feed");
    const opts = f.mock.calls[0][1];
    expect(opts.body).toBeUndefined();
    expect(opts.headers["content-type"]).toBeUndefined();
  });

  test("методы строятся корректно (patch/del)", async () => {
    const f = mockFetch(okJson({}));
    await api.patch("/me", { lang: "en" });
    await api.del("/apps/1");
    expect(f.mock.calls[0][1].method).toBe("PATCH");
    expect(f.mock.calls[1][1].method).toBe("DELETE");
    expect(f.mock.calls[1][1].body).toBeUndefined();
  });
});

describe("маппинг ошибок в ApiError", () => {
  test("успех возвращает распарсенное тело", async () => {
    mockFetch(okJson({ me: { id: 1 } }));
    await expect(api.get("/me")).resolves.toEqual({ me: { id: 1 } });
  });

  test("сетевой сбой → ApiError('network', 0)", async () => {
    mockFetch(() => Promise.reject(new TypeError("fail")));
    await expect(api.get("/me")).rejects.toMatchObject({ code: "network", status: 0 });
  });

  test("код ошибки из тела пробрасывается как есть", async () => {
    mockFetch(okJson({ error: "not_onboarded" }, 403));
    const e = await api.get("/me").catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.code).toBe("not_onboarded");
    expect(e.status).toBe(403);
  });

  test("5xx без тела → 'internal'", async () => {
    mockFetch(() => Promise.resolve({ ok: false, status: 502, json: () => Promise.reject(new Error()) }));
    await expect(api.get("/me")).rejects.toMatchObject({ code: "internal", status: 502 });
  });

  test("4xx без явного кода → 'validation'", async () => {
    mockFetch(okJson({}, 400));
    await expect(api.get("/me")).rejects.toMatchObject({ code: "validation", status: 400 });
  });
});
