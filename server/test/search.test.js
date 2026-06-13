import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { loadServer, req, createUser, activate } from "./helpers.js";

let app, q;
before(async () => ({ app, q } = await loadServer()));

async function activeUser(overrides) {
  const u = await createUser(app, overrides);
  activate(q, u.me.id);
  return u;
}

describe("поиск соперника", () => {
  test("старт ставит в поиск до конца дня, виден другим, не виден себе", async () => {
    const a = await activeUser();
    const b = await activeUser();

    const r = await req(app, "POST", "/api/search/start", { tgId: a.tgId, body: { disc: 1, pays: 1 } });
    assert.equal(r.statusCode, 200);
    const until = r.json().until;
    assert.ok(until > Date.now());
    assert.equal(new Date(until).getHours(), 23); // до полуночи клуба

    const forB = (await req(app, "GET", "/api/search/list", { tgId: b.tgId })).json().players;
    const found = forB.find((p) => p.id === a.me.id);
    assert.ok(found, "искателя не видно");
    assert.equal(found.disc, 1);
    assert.equal(found.pays, 1);
    assert.equal(found.contact, "@test");

    const forA = (await req(app, "GET", "/api/search/list", { tgId: a.tgId })).json().players;
    assert.ok(!forA.some((p) => p.id === a.me.id), "вижу сам себя в поиске");
  });

  test("параметры по умолчанию берутся из предпочтений профиля", async () => {
    const a = await activeUser();
    const b = await activeUser();
    await req(app, "PATCH", "/api/me", { tgId: a.tgId, body: { prefDisc: 0, prefPays: 1 } });
    await req(app, "POST", "/api/search/start", { tgId: a.tgId, body: {} });

    const found = (await req(app, "GET", "/api/search/list", { tgId: b.tgId })).json()
      .players.find((p) => p.id === a.me.id);
    assert.equal(found.disc, 0);
    assert.equal(found.pays, 1);
  });

  test("стоп убирает из поиска", async () => {
    const a = await activeUser();
    const b = await activeUser();
    await req(app, "POST", "/api/search/start", { tgId: a.tgId, body: {} });
    await req(app, "POST", "/api/search/stop", { tgId: a.tgId });
    const list = (await req(app, "GET", "/api/search/list", { tgId: b.tgId })).json().players;
    assert.ok(!list.some((p) => p.id === a.me.id));
  });

  test("в /me поиск отражается как searching", async () => {
    const a = await activeUser();
    await req(app, "POST", "/api/search/start", { tgId: a.tgId, body: { disc: 2, pays: 0 } });
    const me = (await req(app, "GET", "/api/me", { tgId: a.tgId })).json().me;
    assert.ok(me.searching);
    assert.equal(me.searching.disc, 2);
  });

  test("без активации — 403, без контакта — no_contact", async () => {
    const cold = await createUser(app);
    assert.equal((await req(app, "POST", "/api/search/start", { tgId: cold.tgId, body: {} })).statusCode, 403);

    const noContact = await activeUser();
    await req(app, "PATCH", "/api/me", { tgId: noContact.tgId, body: { contact: "" } });
    const r = await req(app, "POST", "/api/search/start", { tgId: noContact.tgId, body: {} });
    assert.equal(r.json().error, "no_contact");
  });
});
