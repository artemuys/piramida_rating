import { q } from "../db.js";
import { config } from "../config.js";
import { ApiError, requireUser } from "../errors.js";
import { clean, now, publicUser } from "../util.js";
import { rankOf, levelFromXp } from "../achievements.js";

// Очки за достижения (зеркалим из фронтенда)
const ACH_PTS = {
  calibration:1,elite:50,new_peak_1100:15,new_peak_1200:20,new_peak_1300:30,
  new_peak_1400:40,new_peak_1500:60,on_fire_5:10,inferno_7:20,immortal_10:40,
  groundhog:15,rollercoaster:10,own_atmo:10,headhunter:20,extrovert:25,
  veteran_20:5,veteran_50:10,veteran_100:20,veteran_200:30,veteran_500:50,
  veteran_1000:100,bad_day:5,main_donor:5,tried:5,phoenix:15,
};

// ── Кэш «мест» ───────────────────────────────────────────────
// place(elo) пересчитывался полным сканом users на КАЖДЫЙ /me (поллится каждые 30 с
// + на focus/visibility). Вместо этого держим отсортированный по убыванию снимок Эло
// (обновляется раз в 5 с, один скан на всех) и ищем место бинарным поиском — O(log N),
// без обращения к БД на горячем пути.
const placeCache = { pool: { at: 0, elos: [] }, pyramid: { at: 0, elos: [] } };
function placeOf(disc, elo) {
  const key = disc === "pyramid" ? "pyramid" : "pool";
  const eloCol = key === "pyramid" ? "elo_pyramid" : "elo";
  const c = placeCache[key];
  const t = now();
  if (t - c.at > 5000) {
    c.elos = q(`SELECT ${eloCol} AS e FROM users ORDER BY ${eloCol} DESC`).all().map((r) => r.e);
    c.at = t;
  }
  // Число игроков с Эло строго больше → индекс первого элемента <= elo (место = он + 1).
  let lo = 0, hi = c.elos.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (c.elos[mid] > elo) lo = mid + 1;
    else hi = mid;
  }
  return lo + 1;
}

function serializeMe(u) {
  const t = now();
  const disc = u.active_discipline ?? 'pool';
  const isPyramid = disc === 'pyramid';

  // Дисциплина-специфичные статы
  const elo         = isPyramid ? (u.elo_pyramid          ?? 1000) : u.elo;
  const matchesCount = isPyramid ? (u.matches_count_pyramid ?? 0)    : u.matches_count;
  const winsCount   = isPyramid ? (u.wins_count_pyramid   ?? 0)    : u.wins_count;
  const xp          = isPyramid ? (u.xp_pyramid           ?? 0)    : (u.xp ?? 0);
  const streak      = isPyramid ? (u.streak_pyramid        ?? 0)    : (u.streak ?? 0);
  const bestStreak  = isPyramid ? (u.best_streak_pyramid  ?? 0)    : (u.best_streak ?? 0);
  const peakElo     = isPyramid ? (u.peak_elo_pyramid     ?? 1000) : (u.peak_elo ?? u.elo);

  const place = placeOf(disc, elo);
  const favoritesCount = q(`SELECT COUNT(*) AS c FROM favorites WHERE user_id = ?`).get(u.id).c;

  // Непросмотренные ачивки текущей дисциплины
  const unseenAch = isPyramid
    ? q(`SELECT COUNT(*) AS c FROM achievements WHERE user_id = ? AND seen = 0 AND code LIKE 'p:%'`).get(u.id).c
    : q(`SELECT COUNT(*) AS c FROM achievements WHERE user_id = ? AND seen = 0 AND code NOT LIKE 'p:%'`).get(u.id).c;

  const pendingDuels = q(`SELECT COUNT(*) AS c FROM duels WHERE opponent_id = ? AND status = 'open'`).get(u.id).c;
  const rank = rankOf(elo);
  const level = levelFromXp(xp);

  // Очки ачивок текущей дисциплины
  const achPtsRows = isPyramid
    ? q(`SELECT code FROM achievements WHERE user_id = ? AND code LIKE 'p:%'`).all(u.id)
    : q(`SELECT code FROM achievements WHERE user_id = ? AND code NOT LIKE 'p:%'`).all(u.id);
  const achPoints = achPtsRows.reduce((sum, r) => {
    const baseCode = r.code.startsWith('p:') ? r.code.slice(2) : r.code;
    return sum + (ACH_PTS[baseCode] ?? 0);
  }, 0);

  return {
    id: u.id,
    name: u.name,
    contact: u.contact,
    contactType: u.contact_type ?? "telegram",
    lang: u.lang,
    role: u.role,
    isSuper: !!u.is_super,
    prefDisc: u.pref_disc,
    prefPays: u.pref_pays,
    activeDiscipline: disc,
    elo,
    matchesCount,
    winsCount,
    place,
    favoritesCount,
    rank,
    xp,
    level,
    streak,
    bestStreak,
    peakElo,
    nameChangeAllowed: !!u.name_change_allowed,
    unseenAchievements: unseenAch,
    pendingDuels,
    achPoints,
    isActivated: u.activated_until > t,
    activatedUntil: u.activated_until,
    isCheckedIn: u.checked_in_until > t,
    checkedInUntil: u.checked_in_until,
    searching:
      u.search_until > t
        ? { until: u.search_until, startedAt: u.search_started, disc: u.search_disc, pays: u.search_pays }
        : null,
    serverNow: t,
  };
}

const onboardSchema = {
  body: {
    type: "object",
    required: ["name", "contact", "lang"],
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 2, maxLength: 40 },
      contact: { type: "string", minLength: 1, maxLength: 120 },
      contactType: { type: "string", enum: ["telegram", "phone"] },
      lang: { type: "string", enum: ["en", "pl", "uk", "ru"] },
      prefDisc: { type: "integer", minimum: 0, maximum: 2 },
      prefPays: { type: "integer", minimum: 0, maximum: 1 },
      activeDiscipline: { type: "string", enum: ["pool", "pyramid"] },
    },
  },
};

const patchMeSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 2, maxLength: 40 },
      contact: { type: "string", maxLength: 120 },
      contactType: { type: "string", enum: ["telegram", "phone"] },
      lang: { type: "string", enum: ["en", "pl", "uk", "ru"] },
      prefDisc: { type: "integer", minimum: 0, maximum: 2 },
      prefPays: { type: "integer", minimum: 0, maximum: 1 },
      activeDiscipline: { type: "string", enum: ["pool", "pyramid"] },
    },
  },
};

let ratingCache = { pool: { at: 0, data: null }, pyramid: { at: 0, data: null } };

export default async function usersRoutes(app) {
  // ── Онбординг ──────────────────────────────────────────────
  app.post("/auth/onboard", { schema: onboardSchema, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, (req) => {
    if (req.user) return { me: serializeMe(req.user) }; // идемпотентность: повторный вызов не дублирует

    const name = clean(req.body.name, 40);
    const contact = clean(req.body.contact, 60);
    if (name.length < 2) throw new ApiError(400, "validation");
    if (!/^\p{L}+(?:[ \-]\p{L}+)*$/u.test(name)) throw new ApiError(400, "invalid_name");
    if (contact.length < 2) throw new ApiError(400, "validation");
    const contactType = req.body.contactType ?? "telegram";

    const role = config.adminTgIds.includes(String(req.tgUser.id)) ? "admin" : "user";
    const r = q(
      `INSERT INTO users (tg_id, role, name, contact, contact_type, lang, pref_disc, pref_pays, active_discipline, elo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      req.tgUser.id, role, name, contact, contactType, req.body.lang,
      req.body.prefDisc ?? 2, req.body.prefPays ?? 0, 'pyramid', config.ELO_START, now()
    );
    const me = q(`SELECT * FROM users WHERE id = ?`).get(Number(r.lastInsertRowid));
    return { me: serializeMe(me) };
  });

  // ── Мой профиль ────────────────────────────────────────────
  app.get("/me", (req) => ({ me: serializeMe(requireUser(req)) }));

  app.patch("/me", { schema: patchMeSchema }, (req) => {
    const u = requireUser(req);
    const contact = req.body.contact !== undefined ? clean(req.body.contact, 60) : u.contact;
    const contactType = req.body.contactType ?? u.contact_type ?? "telegram";

    if (req.body.name !== undefined) {
      if (!u.name_change_allowed) throw new ApiError(403, "not_allowed");
      const newName = clean(req.body.name, 40);
      if (newName.length < 2 || !/^\p{L}+(?:[ \-]\p{L}+)*$/u.test(newName)) throw new ApiError(400, "invalid_name");
      q(`UPDATE users SET name = ?, name_change_allowed = 0 WHERE id = ?`).run(newName, u.id);
    }

    q(`UPDATE users SET contact = ?, contact_type = ?, lang = ?, pref_disc = ?, pref_pays = ?, active_discipline = ? WHERE id = ?`).run(
      contact,
      contactType,
      req.body.lang ?? u.lang,
      req.body.prefDisc ?? u.pref_disc,
      req.body.prefPays ?? u.pref_pays,
      'pyramid',
      u.id
    );
    return { me: serializeMe(q(`SELECT * FROM users WHERE id = ?`).get(u.id)) };
  });

  // ── Рейтинг клуба (кэш 5 секунд, разделён по дисциплинам) ──
  app.get("/rating", (req) => {
    const u = requireUser(req);
    const disc = u.active_discipline ?? 'pool';
    const isPyramid = disc === 'pyramid';
    const eloCol = isPyramid ? 'elo_pyramid' : 'elo';
    const mcCol  = isPyramid ? 'matches_count_pyramid' : 'matches_count';
    const t = now();
    const cache = ratingCache[disc];
    if (!cache.data || t - cache.at > 5000) {
      ratingCache[disc] = {
        at: t,
        data: q(
          `SELECT id, name, ${eloCol} AS elo, role, ${mcCol} AS matches_count
           FROM users ORDER BY ${eloCol} DESC, ${mcCol} DESC, id ASC LIMIT ?`
        ).all(config.RATING_TOP),
      };
    }
    const userElo = isPyramid ? (u.elo_pyramid ?? 1000) : u.elo;
    const place = placeOf(disc, userElo);
    const season = q(`SELECT * FROM seasons WHERE closed = 0 OR closed IS NULL ORDER BY id DESC LIMIT 1`).get();
    return {
      top: ratingCache[disc].data.map((r) => ({
        id: r.id, name: r.name, elo: r.elo, role: r.role,
      })),
      me: { id: u.id, name: u.name, elo: userElo, place, role: u.role },
      season: season ? { id: season.id, startedAt: season.started_at, endsAt: season.ends_at } : null,
    };
  });

  // ── Чужой профиль ──────────────────────────────────────────
  app.get("/players/:id", (req) => {
    const u = requireUser(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "validation");
    const p = q(`SELECT * FROM users WHERE id = ?`).get(id);
    if (!p) throw new ApiError(404, "player_not_found");

    const t = now();
    const disc = u.active_discipline ?? 'pool';
    const isPyramid = disc === 'pyramid';
    const isFavorite = !!q(`SELECT 1 FROM favorites WHERE user_id = ? AND fav_id = ?`).get(u.id, id);
    const h2h = q(
      `SELECT * FROM matches
       WHERE status = 'confirmed' AND discipline = ?
         AND ((initiator_id = ? AND opponent_id = ?) OR (initiator_id = ? AND opponent_id = ?))
       ORDER BY resolved_at DESC LIMIT ?`
    ).all(disc, u.id, id, id, u.id, config.HISTORY_LIMIT);

    // Последние 5 матчей игрока (для его профиля)
    const recentMatches = q(
      `SELECT m.*, o.id AS o_id, o.name AS o_name, o.elo AS o_elo
       FROM matches m
       JOIN users o ON o.id = CASE WHEN m.initiator_id = ? THEN m.opponent_id ELSE m.initiator_id END
       WHERE m.status = 'confirmed' AND m.discipline = ? AND (m.initiator_id = ? OR m.opponent_id = ?)
       ORDER BY m.resolved_at DESC LIMIT 5`
    ).all(id, disc, id, id);

    // H2H счёт всего
    const h2hTotal = q(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN winner_id = ? THEN 1 ELSE 0 END) AS my_wins
       FROM matches
       WHERE status = 'confirmed' AND discipline = ?
         AND ((initiator_id = ? AND opponent_id = ?) OR (initiator_id = ? AND opponent_id = ?))`
    ).get(u.id, disc, u.id, id, id, u.id);

    // Место в рейтинге
    const pElo = isPyramid ? (p.elo_pyramid ?? 1000) : p.elo;
    const place = placeOf(disc, pElo);

    const rank = rankOf(pElo);
    const xp = isPyramid ? (p.xp_pyramid ?? 0) : (p.xp ?? 0);
    const level = levelFromXp(xp);
    const pStreak = isPyramid ? (p.streak_pyramid ?? 0) : (p.streak ?? 0);
    const pBestStreak = isPyramid ? (p.best_streak_pyramid ?? 0) : (p.best_streak ?? 0);
    const pPeakElo = isPyramid ? (p.peak_elo_pyramid ?? 1000) : (p.peak_elo ?? p.elo);
    const pMatchesCount = isPyramid ? (p.matches_count_pyramid ?? 0) : p.matches_count;
    const pWinsCount = isPyramid ? (p.wins_count_pyramid ?? 0) : p.wins_count;

    const pAchPtsRows = isPyramid
      ? q(`SELECT code FROM achievements WHERE user_id = ? AND code LIKE 'p:%'`).all(id)
      : q(`SELECT code FROM achievements WHERE user_id = ? AND code NOT LIKE 'p:%'`).all(id);
    const pAchPoints = pAchPtsRows.reduce((sum, r) => {
      const baseCode = r.code.startsWith('p:') ? r.code.slice(2) : r.code;
      const isSeason = baseCode.startsWith("season_master_");
      return sum + (ACH_PTS[baseCode] ?? (isSeason ? 100 : 0));
    }, 0);

    return {
      player: {
        id: p.id,
        name: p.name,
        elo: pElo,
        role: p.role,
        matchesCount: pMatchesCount,
        winsCount: pWinsCount,
        contact: u.activated_until > t ? p.contact : null,
        contactType: p.contact_type ?? "telegram",
        rank,
        xp,
        level,
        streak: pStreak,
        bestStreak: pBestStreak,
        peakElo: pPeakElo,
        place,
        achPoints: pAchPoints,
      },
      isFavorite,
      h2h: h2h.map((m) => {
        const iWon = m.winner_id === u.id;
        return { id: m.id, date: m.resolved_at, iWon, delta: iWon ? m.delta : -m.delta };
      }),
      h2hTotal: {
        total: h2hTotal?.total ?? 0,
        myWins: h2hTotal?.my_wins ?? 0,
        theirWins: (h2hTotal?.total ?? 0) - (h2hTotal?.my_wins ?? 0),
      },
      recentMatches: recentMatches.map((m) => {
        const won = m.winner_id === id;
        return { id: m.id, date: m.resolved_at, won, delta: won ? m.delta : -m.delta, opponentName: m.o_name, opponentId: m.o_id };
      }),
    };
  });

  // ── История моих матчей ────────────────────────────────────
  app.get("/history", (req) => {
    const u = requireUser(req);
    const disc = u.active_discipline ?? 'pool';
    const rows = q(
      `SELECT m.*, w.id AS o_id, w.name AS o_name, w.elo AS o_elo, w.role AS o_role
       FROM matches m
       JOIN users w ON w.id = CASE WHEN m.initiator_id = ? THEN m.opponent_id ELSE m.initiator_id END
       WHERE m.status = 'confirmed' AND m.discipline = ? AND (m.initiator_id = ? OR m.opponent_id = ?)
       ORDER BY m.resolved_at DESC LIMIT ?`
    ).all(u.id, disc, u.id, u.id, config.HISTORY_LIMIT);
    return {
      matches: rows.map((m) => {
        const iWon = m.winner_id === u.id;
        return {
          id: m.id,
          date: m.resolved_at,
          iWon,
          delta: iWon ? m.delta : -m.delta,
          opponent: { id: m.o_id, name: m.o_name, elo: m.o_elo, role: m.o_role },
        };
      }),
    };
  });

  // ── 5 последних соперников (быстрый выбор на экране результата) ─
  app.get("/recent-opponents", (req) => {
    const u = requireUser(req);
    const disc = u.active_discipline ?? 'pool';
    const rows = q(
      `SELECT m.winner_id, m.delta, m.resolved_at,
              o.id AS o_id, o.name AS o_name, o.elo AS o_elo, o.role AS o_role
       FROM matches m
       JOIN users o ON o.id = CASE WHEN m.initiator_id = ? THEN m.opponent_id ELSE m.initiator_id END
       WHERE m.status = 'confirmed' AND m.discipline = ? AND (m.initiator_id = ? OR m.opponent_id = ?)
       ORDER BY m.resolved_at DESC LIMIT 30`
    ).all(u.id, disc, u.id, u.id);
    const seen = new Set();
    const result = [];
    for (const m of rows) {
      if (seen.has(m.o_id)) continue;
      seen.add(m.o_id);
      const iWon = m.winner_id === u.id;
      result.push({
        id: m.o_id, name: m.o_name, elo: m.o_elo, role: m.o_role,
        lastDelta: iWon ? m.delta : -m.delta,
      });
      if (result.length >= config.RECENT_OPPONENTS) break;
    }
    return { opponents: result };
  });

  // ── Избранное ──────────────────────────────────────────────
  app.get("/favorites", (req) => {
    const u = requireUser(req);
    const rows = q(
      `SELECT p.id, p.name, p.elo, p.role FROM favorites f
       JOIN users p ON p.id = f.fav_id WHERE f.user_id = ? ORDER BY f.created_at DESC`
    ).all(u.id);
    return { favorites: rows };
  });

  app.post("/favorites/:id", (req) => {
    const u = requireUser(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0 || id === u.id) throw new ApiError(400, "validation");
    if (!q(`SELECT 1 FROM users WHERE id = ?`).get(id)) throw new ApiError(404, "player_not_found");
    const count = q(`SELECT COUNT(*) AS c FROM favorites WHERE user_id = ?`).get(u.id).c;
    if (count >= config.MAX_FAVORITES) throw new ApiError(400, "limit_reached");
    q(`INSERT OR IGNORE INTO favorites (user_id, fav_id, created_at) VALUES (?, ?, ?)`).run(u.id, id, now());
    return { ok: true };
  });

  app.delete("/favorites/:id", (req) => {
    const u = requireUser(req);
    q(`DELETE FROM favorites WHERE user_id = ? AND fav_id = ?`).run(u.id, Number(req.params.id) || 0);
    return { ok: true };
  });
}
