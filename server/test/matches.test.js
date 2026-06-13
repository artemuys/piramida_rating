import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { loadServer, req, createUser, checkin, setElo } from "./helpers.js";

let app, q;
before(async () => ({ app, q } = await loadServer()));

const getUser = (id) => q(`SELECT * FROM users WHERE id = ?`).get(id);
const getMatch = (id) => q(`SELECT * FROM matches WHERE id = ?`).get(id);

/** Пара свежих заигранных (checked-in) игроков. */
async function pair(eloA = 1000, eloB = 1000) {
  const a = await createUser(app);
  const b = await createUser(app);
  checkin(q, a.me.id);
  checkin(q, b.me.id);
  setElo(q, a.me.id, eloA);
  setElo(q, b.me.id, eloB);
  return [a, b];
}

async function report(by, opponentId, result = "win") {
  const r = await req(app, "POST", "/api/matches/report", { tgId: by.tgId, body: { opponentId, result } });
  assert.equal(r.statusCode, 200, r.body);
  return r.json().match;
}

async function respond(by, matchId, result) {
  const r = await req(app, "POST", `/api/matches/${matchId}/respond`, { tgId: by.tgId, body: { result } });
  assert.equal(r.statusCode, 200, r.body);
  return r.json().match;
}

describe("подтверждённый матч — математика Эло", () => {
  test("равные рейтинги 1000 vs 1000 → +16/−16", async () => {
    const [a, b] = await pair(1000, 1000);
    const m = await report(a, b.me.id, "win");
    const done = await respond(b, m.id, "lose");

    assert.equal(done.status, "confirmed");
    assert.equal(done.delta, 16);
    assert.equal(done.iWon, false); // отвечал проигравший
    assert.deepEqual(done.my, { claim: "lose", eloBefore: 1000, eloAfter: 984 });
    assert.deepEqual(done.their, { claim: "win", eloBefore: 1000, eloAfter: 1016 });

    const ua = getUser(a.me.id), ub = getUser(b.me.id);
    assert.equal(ua.elo, 1016);
    assert.equal(ua.matches_count, 1);
    assert.equal(ua.wins_count, 1);
    assert.equal(ub.elo, 984);
    assert.equal(ub.matches_count, 1);
    assert.equal(ub.wins_count, 0);

    const row = getMatch(m.id);
    assert.equal(row.winner_id, a.me.id);
    assert.equal(row.initiator_elo_after, 1016);
    assert.equal(row.opponent_elo_after, 984);
  });

  test("инициатор заявляет поражение — победитель оппонент", async () => {
    const [a, b] = await pair(1000, 1000);
    const m = await report(a, b.me.id, "lose");
    const done = await respond(b, m.id, "win");
    assert.equal(done.status, "confirmed");
    assert.equal(getMatch(m.id).winner_id, b.me.id);
    assert.equal(getUser(b.me.id).elo, 1016);
    assert.equal(getUser(a.me.id).elo, 984);
  });

  test("фаворит 1200 побеждает 1000 → +8/−8", async () => {
    const [a, b] = await pair(1200, 1000);
    const m = await report(a, b.me.id, "win");
    const done = await respond(b, m.id, "lose");
    assert.equal(done.delta, 8);
    assert.equal(getUser(a.me.id).elo, 1208);
    assert.equal(getUser(b.me.id).elo, 992);
  });

  test("андердог 1000 побеждает 1200 → +24/−24", async () => {
    const [a, b] = await pair(1000, 1200);
    const m = await report(a, b.me.id, "win");
    const done = await respond(b, m.id, "lose");
    assert.equal(done.delta, 24);
    assert.equal(getUser(a.me.id).elo, 1024);
    assert.equal(getUser(b.me.id).elo, 1176);
  });

  test("эло проигравшего клемпится на нуле, elo_after согласован", async () => {
    const [a, b] = await pair(5, 0); // почти равные → d = 16, но у проигравшего только 0
    const m = await report(a, b.me.id, "win");
    const done = await respond(b, m.id, "lose");
    assert.equal(getUser(b.me.id).elo, 0); // не ушёл в минус
    assert.equal(getMatch(m.id).opponent_elo_after, 0);
    assert.equal(done.my.eloAfter, 0);
  });

  test("эло пересчитывается по актуальным рейтингам на момент подтверждения", async () => {
    const [a, b] = await pair(1000, 1000);
    const m = await report(a, b.me.id, "win");
    setElo(q, a.me.id, 1200); // рейтинг изменился между заявкой и подтверждением
    const done = await respond(b, m.id, "lose");
    assert.equal(done.delta, 8); // eloDelta(1200, 1000), а не 16 по снимку заявки
    assert.equal(getMatch(m.id).initiator_elo_before, 1200); // before перезаписан актуальным
    assert.equal(getUser(a.me.id).elo, 1208);
  });
});

describe("конфликт, таймаут, отмена — без изменения Эло", () => {
  test("оба заявили победу → conflict", async () => {
    const [a, b] = await pair();
    const m = await report(a, b.me.id, "win");
    const done = await respond(b, m.id, "win");
    assert.equal(done.status, "conflict");
    assert.equal(done.delta, null);
    assert.equal(getUser(a.me.id).elo, 1000);
    assert.equal(getUser(b.me.id).elo, 1000);
    assert.equal(getUser(a.me.id).matches_count, 0);
  });

  test("оба заявили поражение → conflict", async () => {
    const [a, b] = await pair();
    const m = await report(a, b.me.id, "lose");
    const done = await respond(b, m.id, "lose");
    assert.equal(done.status, "conflict");
  });

  test("просроченный матч → timeout при ответе", async () => {
    const [a, b] = await pair();
    const m = await report(a, b.me.id, "win");
    q(`UPDATE matches SET expires_at = ? WHERE id = ?`).run(Date.now() - 1000, m.id);
    const done = await respond(b, m.id, "lose");
    assert.equal(done.status, "timeout");
    assert.equal(getUser(a.me.id).elo, 1000);
  });

  test("ленивый свипер переводит просроченные в timeout при поллинге", async () => {
    const [a, b] = await pair();
    const m = await report(a, b.me.id, "win");
    q(`UPDATE matches SET expires_at = ? WHERE id = ?`).run(Date.now() - 1000, m.id);
    await req(app, "GET", "/api/matches/active", { tgId: a.tgId });
    assert.equal(getMatch(m.id).status, "timeout");
  });

  test("инициатор отменяет pending", async () => {
    const [a, b] = await pair();
    const m = await report(a, b.me.id, "win");
    const r = await req(app, "POST", `/api/matches/${m.id}/cancel`, { tgId: a.tgId });
    assert.equal(r.statusCode, 200);
    assert.equal(getMatch(m.id).status, "cancelled");
  });

  test("оппонент не может отменить чужую заявку", async () => {
    const [a, b] = await pair();
    const m = await report(a, b.me.id, "win");
    const r = await req(app, "POST", `/api/matches/${m.id}/cancel`, { tgId: b.tgId });
    assert.equal(r.statusCode, 404);
  });

  test("ответ на уже разрешённый матч возвращает итог, не меняя его", async () => {
    const [a, b] = await pair();
    const m = await report(a, b.me.id, "win");
    await respond(b, m.id, "lose");
    const again = await respond(b, m.id, "win"); // попытка переиграть итог
    assert.equal(again.status, "confirmed");
    assert.equal(getUser(a.me.id).elo, 1016); // второй раз эло не начислено
    assert.equal(getUser(a.me.id).matches_count, 1);
  });
});

describe("ограничения заявки результата", () => {
  test("без чекина — 403 not_checked_in", async () => {
    const a = await createUser(app);
    const b = await createUser(app);
    checkin(q, b.me.id);
    const r = await req(app, "POST", "/api/matches/report", { tgId: a.tgId, body: { opponentId: b.me.id, result: "win" } });
    assert.equal(r.statusCode, 403);
    assert.equal(r.json().error, "not_checked_in");
  });

  test("оппонент без чекина — 409", async () => {
    const a = await createUser(app);
    const b = await createUser(app);
    checkin(q, a.me.id);
    const r = await req(app, "POST", "/api/matches/report", { tgId: a.tgId, body: { opponentId: b.me.id, result: "win" } });
    assert.equal(r.statusCode, 409);
    assert.equal(r.json().error, "opponent_not_checked_in");
  });

  test("матч с самим собой — 400", async () => {
    const a = await createUser(app);
    checkin(q, a.me.id);
    const r = await req(app, "POST", "/api/matches/report", { tgId: a.tgId, body: { opponentId: a.me.id, result: "win" } });
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().error, "self_match");
  });

  test("несуществующий оппонент — 404", async () => {
    const a = await createUser(app);
    checkin(q, a.me.id);
    const r = await req(app, "POST", "/api/matches/report", { tgId: a.tgId, body: { opponentId: 999999, result: "win" } });
    assert.equal(r.statusCode, 404);
  });

  test("занятость: у меня pending → you_busy, у оппонента → opponent_busy", async () => {
    const [a, b] = await pair();
    const c = await createUser(app);
    checkin(q, c.me.id);
    await report(a, b.me.id, "win");

    const r1 = await req(app, "POST", "/api/matches/report", { tgId: a.tgId, body: { opponentId: c.me.id, result: "win" } });
    assert.equal(r1.json().error, "you_busy");

    const r2 = await req(app, "POST", "/api/matches/report", { tgId: c.tgId, body: { opponentId: a.me.id, result: "win" } });
    assert.equal(r2.json().error, "opponent_busy");
  });

  test("невалидный result отклоняется схемой", async () => {
    const [a, b] = await pair();
    const r = await req(app, "POST", "/api/matches/report", { tgId: a.tgId, body: { opponentId: b.me.id, result: "draw" } });
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().error, "validation");
  });

  test("respond чужого матча — 404 (в т.ч. для инициатора)", async () => {
    const [a, b] = await pair();
    const c = await createUser(app);
    checkin(q, c.me.id);
    const m = await report(a, b.me.id, "win");
    for (const who of [a, c]) {
      const r = await req(app, "POST", `/api/matches/${m.id}/respond`, { tgId: who.tgId, body: { result: "lose" } });
      assert.equal(r.statusCode, 404, `user ${who.me.id}`);
    }
  });
});

describe("поллинг и подтверждение просмотра", () => {
  test("active: входящий у оппонента, исходящий у инициатора", async () => {
    const [a, b] = await pair();
    const m = await report(a, b.me.id, "win");

    const forA = (await req(app, "GET", "/api/matches/active", { tgId: a.tgId })).json();
    assert.equal(forA.outgoing.id, m.id);
    assert.equal(forA.incoming, null);

    const forB = (await req(app, "GET", "/api/matches/active", { tgId: b.tgId })).json();
    assert.equal(forB.incoming.id, m.id);
    assert.equal(forB.outgoing, null);
    assert.equal(forB.incoming.opponentUser.id, a.me.id);
  });

  test("итог показывается инициатору как unseen, пока он не подтвердит ack", async () => {
    const [a, b] = await pair();
    const m = await report(a, b.me.id, "win");
    await respond(b, m.id, "lose");

    const before = (await req(app, "GET", "/api/matches/active", { tgId: a.tgId })).json();
    assert.equal(before.unseen.id, m.id);
    // оппонент видел итог в ответе respond — у него unseen нет
    const forB = (await req(app, "GET", "/api/matches/active", { tgId: b.tgId })).json();
    assert.equal(forB.unseen, null);

    await req(app, "POST", `/api/matches/${m.id}/ack`, { tgId: a.tgId });
    const after = (await req(app, "GET", "/api/matches/active", { tgId: a.tgId })).json();
    assert.equal(after.unseen, null);
  });
});
