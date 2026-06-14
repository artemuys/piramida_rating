import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { loadServer, req, createUser, activate } from "./helpers.js";

let app, q, config;
before(async () => ({ app, q, config } = await loadServer()));

async function activeUser(overrides) {
  const u = await createUser(app, overrides);
  activate(q, u.me.id);
  return u;
}

const post = (u, body) => req(app, "POST", "/api/requests", { tgId: u.tgId, body });
const validBody = (over = {}) => ({ startOffset: 0, endOffset: 1, timeFrom: "18:00", timeTo: "22:00", disc: 1, pays: 0, ...over });

describe("создание заявок", () => {
  test("диапазон дат + диапазон времени, видна в моих заявках", async () => {
    const u = await activeUser();
    const r = await post(u, validBody({ startOffset: 0, endOffset: 6 })); // 7 дней
    assert.equal(r.statusCode, 200, r.body);

    const mine = (await req(app, "GET", "/api/requests/mine", { tgId: u.tgId })).json().requests;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].timeFrom, "18:00");
    assert.equal(mine[0].timeTo, "22:00");
    assert.match(mine[0].startDay, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(mine[0].endDay, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(mine[0].startDay < mine[0].endDay);
  });

  test("без активации — 403", async () => {
    const u = await createUser(app);
    const r = await post(u, validBody());
    assert.equal(r.statusCode, 403);
    assert.equal(r.json().error, "not_activated");
  });

  test("без контакта — 403 no_contact", async () => {
    const u = await activeUser();
    await req(app, "PATCH", "/api/me", { tgId: u.tgId, body: { contact: "" } });
    const r = await post(u, validBody());
    assert.equal(r.statusCode, 403);
    assert.equal(r.json().error, "no_contact");
  });

  test("конец раньше начала — 400 invalid_range", async () => {
    const u = await activeUser();
    const r = await post(u, validBody({ startOffset: 3, endOffset: 1 }));
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().error, "invalid_range");
  });

  test("время «с» не раньше «по» — 400 invalid_time", async () => {
    const u = await activeUser();
    const r = await post(u, validBody({ timeFrom: "20:00", timeTo: "20:00" }));
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().error, "invalid_time");
  });

  test("кривой формат времени отклоняется схемой", async () => {
    const u = await activeUser();
    for (const bad of ["25:00", "9:00", "18.00", "abc"]) {
      const r = await post(u, validBody({ timeFrom: bad }));
      assert.equal(r.statusCode, 400, `timeFrom=${bad}`);
    }
  });

  test("offset вне 0..6 отклоняется схемой", async () => {
    const u = await activeUser();
    for (const body of [validBody({ startOffset: -1 }), validBody({ endOffset: 7 })]) {
      assert.equal((await post(u, body)).statusCode, 400);
    }
  });

  test("лимит MAX_REQUESTS_PER_USER", async () => {
    const u = await activeUser();
    for (let i = 0; i < config.MAX_REQUESTS_PER_USER; i++) {
      assert.equal((await post(u, validBody())).statusCode, 200);
    }
    const r = await post(u, validBody());
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().error, "limit_reached");
  });
});

describe("лента и удаление", () => {
  test("лента содержит пересекающие окно чужие заявки, без своих и неактивированных", async () => {
    const me = await activeUser();
    const other = await activeUser();
    const expired = await activeUser();

    await post(me, validBody());
    await post(other, validBody({ startOffset: 0, endOffset: 2 }));
    await post(expired, validBody({ startOffset: 1, endOffset: 1 }));
    q(`UPDATE users SET activated_until = 0 WHERE id = ?`).run(expired.me.id);

    const { feed } = (await req(app, "GET", "/api/requests/feed", { tgId: me.tgId })).json();
    const ids = feed.map((f) => f.player.id);
    assert.ok(ids.includes(other.me.id));
    assert.ok(!ids.includes(me.me.id), "своя заявка в ленте");
    assert.ok(!ids.includes(expired.me.id), "заявка неактивированного в ленте");

    const row = feed.find((f) => f.player.id === other.me.id);
    assert.equal(row.player.contact, "@test");
    assert.equal(row.timeFrom, "18:00");
    assert.ok(row.startDay && row.endDay);
  });

  test("заявка целиком в прошлом в ленту не попадает", async () => {
    const me = await activeUser();
    const other = await activeUser();
    const id = (await post(other, validBody())).json().id;
    // сдвигаем диапазон во вчера
    q(`UPDATE requests SET start_day = '2000-01-01', end_day = '2000-01-02' WHERE id = ?`).run(id);
    const { feed } = (await req(app, "GET", "/api/requests/feed", { tgId: me.tgId })).json();
    assert.ok(!feed.some((f) => f.id === id));
  });

  test("удаление своей заявки; чужую удалить нельзя", async () => {
    const a = await activeUser();
    const b = await activeUser();
    const id = (await post(a, validBody())).json().id;

    await req(app, "DELETE", `/api/requests/${id}`, { tgId: b.tgId }); // чужая — тихий no-op
    assert.equal((await req(app, "GET", "/api/requests/mine", { tgId: a.tgId })).json().requests.length, 1);

    await req(app, "DELETE", `/api/requests/${id}`, { tgId: a.tgId });
    assert.equal((await req(app, "GET", "/api/requests/mine", { tgId: a.tgId })).json().requests.length, 0);
  });
});
