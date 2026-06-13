import { q } from "../db.js";
import { config } from "../config.js";
import { requireUser } from "../errors.js";
import { now } from "../util.js";

export default async function feedRoutes(app) {
  // GET /feed — последние N событий в ленте
  app.get("/feed", (req) => {
    requireUser(req);
    const rows = q(
      `SELECT f.*, a.name AS actor_name, b.name AS target_name
       FROM feed f
       LEFT JOIN users a ON a.id = f.actor_id
       LEFT JOIN users b ON b.id = f.target_id
       ORDER BY f.created_at DESC LIMIT ?`
    ).all(config.FEED_LIMIT);

    return {
      feed: rows.map(r => {
        let data = {};
        try { data = JSON.parse(r.data); } catch { /* ignore */ }
        return {
          id: r.id,
          type: r.type,
          actorId: r.actor_id,
          actorName: r.actor_name,
          targetId: r.target_id,
          targetName: r.target_name,
          data,
          createdAt: r.created_at,
        };
      }),
    };
  });

  // GET /announcements — клубные объявления (последние 10)
  app.get("/announcements", (req) => {
    requireUser(req);
    const rows = q(
      `SELECT an.*, u.name AS author_name
       FROM announcements an JOIN users u ON u.id = an.author_id
       ORDER BY an.created_at DESC LIMIT 10`
    ).all();
    return {
      announcements: rows.map(r => ({
        id: r.id,
        text: r.text,
        authorName: r.author_name,
        createdAt: r.created_at,
      })),
    };
  });
}
