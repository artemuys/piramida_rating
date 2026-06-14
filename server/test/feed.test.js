import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { loadServer, req, createUser } from "./helpers.js";

let app, q;
before(async () => ({ app, q } = await loadServer()));

const insertFeed = (type, actorId, data, discipline = "pyramid", createdAt = Date.now()) =>
  q(`INSERT INTO feed (type, actor_id, target_id, data, discipline, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(type, actorId, null, JSON.stringify(data), discipline, createdAt);

describe("GET /feed", () => {
  test("возвращает события активной дисциплины, новые сверху, с распарсенным data", async () => {
    const u = await createUser(app); // active_discipline = pyramid
    insertFeed("achievement", u.me.id, { code: "p:calibration" }, "pyramid", 1000);
    insertFeed("match_win", u.me.id, { delta: 16 }, "pyramid", 2000);

    const { feed } = (await req(app, "GET", "/api/feed", { tgId: u.tgId })).json();
    assert.ok(feed.length >= 2);
    assert.equal(feed[0].createdAt >= feed[1].createdAt, true); // DESC
    const win = feed.find((f) => f.type === "match_win");
    assert.equal(win.data.delta, 16); // JSON распарсен в объект
    assert.equal(win.actorName, u.me.name); // имя актёра подтянуто join'ом
  });

  test("события чужой дисциплины (pool) в пирамидную ленту не попадают", async () => {
    const u = await createUser(app);
    insertFeed("match_win", u.me.id, { delta: 5 }, "pool", 3000);
    const { feed } = (await req(app, "GET", "/api/feed", { tgId: u.tgId })).json();
    assert.ok(feed.every((f) => !(f.actorId === u.me.id && f.data.delta === 5)));
  });

  test("неавторизованный — 401/403", async () => {
    const r = await req(app, "GET", "/api/feed", {}); // без tgId
    assert.ok(r.statusCode >= 400);
  });
});

describe("GET /announcements", () => {
  test("активные объявления, автор подтянут, неактивные скрыты", async () => {
    const admin = await createUser(app);
    q(`INSERT INTO announcements (author_id, text, active, created_at) VALUES (?, 'Турнир в субботу', 1, ?)`)
      .run(admin.me.id, Date.now());
    q(`INSERT INTO announcements (author_id, text, active, created_at) VALUES (?, 'Старое', 0, ?)`)
      .run(admin.me.id, Date.now() - 1000);

    const { announcements } = (await req(app, "GET", "/api/announcements", { tgId: admin.tgId })).json();
    const texts = announcements.map((a) => a.text);
    assert.ok(texts.includes("Турнир в субботу"));
    assert.ok(!texts.includes("Старое")); // active = 0 не показывается
    assert.equal(announcements.find((a) => a.text === "Турнир в субботу").authorName, admin.me.name);
  });
});
