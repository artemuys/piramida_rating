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

describe("создание заявок", () => {
  test("создаётся и видна в моих заявках", async () => {
    const u = await activeUser();
    const r = await post(u, { dayOffset: 1, timeSlot: 0, disc: 1, pays: 0 });
    assert.equal(r.statusCode, 200, r.body);

    const mine = (await req(app, "GET", "/api/requests/mine", { tgId: u.tgId })).json().requests;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].timeSlot, 0);
    assert.match(mine[0].day, /^\d{4}-\d{2}-\d{2}$/);
  });

  test("без активации — 403", async () => {
    const u = await createUser(app);
    const r = await post(u, { dayOffset: 1, timeSlot: 0, disc: 0, pays: 0 });
    assert.equal(r.statusCode, 403);
    assert.equal(r.json().error, "not_activated");
  });

  test("без контакта — 403 no_contact", async () => {
    const u = await activeUser();
    await req(app, "PATCH", "/api/me", { tgId: u.tgId, body: { contact: "" } });
    const r = await post(u, { dayOffset: 1, timeSlot: 0, disc: 0, pays: 0 });
    assert.equal(r.statusCode, 403);
    assert.equal(r.json().error, "no_contact");
  });

  test("дубль (тот же день и слот) — 409", async () => {
    const u = await activeUser();
    await post(u, { dayOffset: 2, timeSlot: 1, disc: 0, pays: 0 });
    const r = await post(u, { dayOffset: 2, timeSlot: 1, disc: 1, pays: 1 });
    assert.equal(r.statusCode, 409);
    assert.equal(r.json().error, "duplicate_request");
  });

  test("лимит MAX_REQUESTS_PER_USER (3 дня × 2 слота)", async () => {
    const u = await activeUser();
    for (const dayOffset of [1, 2, 3]) {
      for (const timeSlot of [0, 1]) {
        const r = await post(u, { dayOffset, timeSlot, disc: 0, pays: 0 });
        assert.equal(r.statusCode, 200, r.body);
      }
    }
    assert.equal(config.MAX_REQUESTS_PER_USER, 6);
    // седьмая упрётся либо в лимит, либо в UNIQUE — лимит проверяется раньше
    const r = await post(u, { dayOffset: 1, timeSlot: 0, disc: 0, pays: 0 });
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().error, "limit_reached");
  });

  test("dayOffset вне 1..3 отклоняется схемой", async () => {
    const u = await activeUser();
    for (const dayOffset of [0, 4, -1]) {
      const r = await post(u, { dayOffset, timeSlot: 0, disc: 0, pays: 0 });
      assert.equal(r.statusCode, 400, `dayOffset=${dayOffset}`);
    }
  });
});

describe("лента и удаление", () => {
  test("лента не содержит моих заявок и заявок неактивированных", async () => {
    const me = await activeUser();
    const other = await activeUser();
    const expired = await activeUser();

    await post(me, { dayOffset: 1, timeSlot: 0, disc: 0, pays: 0 });
    await post(other, { dayOffset: 1, timeSlot: 0, disc: 1, pays: 1 });
    await post(expired, { dayOffset: 1, timeSlot: 1, disc: 0, pays: 0 });
    q(`UPDATE users SET activated_until = 0 WHERE id = ?`).run(expired.me.id); // активация истекла после подачи

    const { feed, days } = (await req(app, "GET", "/api/requests/feed", { tgId: me.tgId })).json();
    assert.equal(days.length, 3);
    const ids = feed.map((f) => f.player.id);
    assert.ok(ids.includes(other.me.id));
    assert.ok(!ids.includes(me.me.id), "своя заявка в ленте");
    assert.ok(!ids.includes(expired.me.id), "заявка неактивированного в ленте");
    // активированный зритель видит контакт
    assert.equal(feed.find((f) => f.player.id === other.me.id).player.contact, "@test");
  });

  test("удаление своей заявки; чужую удалить нельзя", async () => {
    const a = await activeUser();
    const b = await activeUser();
    const id = (await post(a, { dayOffset: 3, timeSlot: 0, disc: 0, pays: 0 })).json().id;

    await req(app, "DELETE", `/api/requests/${id}`, { tgId: b.tgId }); // чужая — тихий no-op
    assert.equal((await req(app, "GET", "/api/requests/mine", { tgId: a.tgId })).json().requests.length, 1);

    await req(app, "DELETE", `/api/requests/${id}`, { tgId: a.tgId });
    assert.equal((await req(app, "GET", "/api/requests/mine", { tgId: a.tgId })).json().requests.length, 0);
  });
});
