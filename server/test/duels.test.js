import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { loadServer, req, createUser } from "./helpers.js";

let app, q;
before(async () => ({ app, q } = await loadServer()));

const challenge = (by, opponentId, message) =>
  req(app, "POST", "/api/duels", { tgId: by.tgId, body: { opponentId, ...(message !== undefined ? { message } : {}) } });

describe("дуэли — создание", () => {
  test("успешный вызов появляется у обоих: исходящий и входящий", async () => {
    const a = await createUser(app);
    const b = await createUser(app);
    const r = await challenge(a, b.me.id, "  на  стол  ");
    assert.equal(r.statusCode, 200, r.body);

    const aView = (await req(app, "GET", "/api/duels", { tgId: a.tgId })).json();
    const bView = (await req(app, "GET", "/api/duels", { tgId: b.tgId })).json();
    assert.equal(aView.outgoing.length, 1);
    assert.equal(aView.outgoing[0].opponent.id, b.me.id);
    assert.equal(aView.outgoing[0].message, "на стол"); // clean схлопнул пробелы
    assert.equal(bView.incoming.length, 1);
    assert.equal(bView.incoming[0].challenger.id, a.me.id);
    assert.equal(bView.incoming[0].challenger.contact, "@test"); // контакт виден сопернику
  });

  test("вызов самому себе — 400 self_match", async () => {
    const a = await createUser(app);
    const r = await challenge(a, a.me.id);
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().error, "self_match");
  });

  test("без контакта — 403 no_contact", async () => {
    const a = await createUser(app);
    const b = await createUser(app);
    q(`UPDATE users SET contact = '' WHERE id = ?`).run(a.me.id);
    const r = await challenge(a, b.me.id);
    assert.equal(r.statusCode, 403);
    assert.equal(r.json().error, "no_contact");
  });

  test("несуществующий соперник — 404", async () => {
    const a = await createUser(app);
    const r = await challenge(a, 99_999);
    assert.equal(r.statusCode, 404);
    assert.equal(r.json().error, "player_not_found");
  });

  test("повторный открытый вызов тому же — 409 duel_exists", async () => {
    const a = await createUser(app);
    const b = await createUser(app);
    assert.equal((await challenge(a, b.me.id)).statusCode, 200);
    const r = await challenge(a, b.me.id);
    assert.equal(r.statusCode, 409);
    assert.equal(r.json().error, "duel_exists");
  });
});

describe("дуэли — разрешение", () => {
  async function open(a, b) {
    const r = await challenge(a, b.me.id);
    // id вызова берём из исходящих
    const out = (await req(app, "GET", "/api/duels", { tgId: a.tgId })).json().outgoing;
    return out[0].id;
  }

  test("челленджер отменяет свой вызов", async () => {
    const a = await createUser(app);
    const b = await createUser(app);
    const id = await open(a, b);
    const r = await req(app, "POST", `/api/duels/${id}/cancel`, { tgId: a.tgId });
    assert.equal(r.statusCode, 200);
    assert.equal((await req(app, "GET", "/api/duels", { tgId: a.tgId })).json().outgoing.length, 0);
  });

  test("чужой не может отменить вызов — 404", async () => {
    const a = await createUser(app);
    const b = await createUser(app);
    const id = await open(a, b);
    const r = await req(app, "POST", `/api/duels/${id}/cancel`, { tgId: b.tgId }); // b — оппонент, не челленджер
    assert.equal(r.statusCode, 404);
  });

  test("оппонент отклоняет входящий", async () => {
    const a = await createUser(app);
    const b = await createUser(app);
    const id = await open(a, b);
    const r = await req(app, "POST", `/api/duels/${id}/decline`, { tgId: b.tgId });
    assert.equal(r.statusCode, 200);
    assert.equal((await req(app, "GET", "/api/duels", { tgId: b.tgId })).json().incoming.length, 0);
  });

  test("повторное разрешение уже закрытого — 409 already_resolved", async () => {
    const a = await createUser(app);
    const b = await createUser(app);
    const id = await open(a, b);
    await req(app, "POST", `/api/duels/${id}/decline`, { tgId: b.tgId });
    const r = await req(app, "POST", `/api/duels/${id}/decline`, { tgId: b.tgId });
    assert.equal(r.statusCode, 409);
    assert.equal(r.json().error, "already_resolved");
  });

  test("отмена несуществующего вызова — 404", async () => {
    const a = await createUser(app);
    const r = await req(app, "POST", `/api/duels/0/cancel`, { tgId: a.tgId });
    assert.equal(r.statusCode, 404);
  });
});
