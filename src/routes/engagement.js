const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/listings/:id/like", requireAuth, async (req, res) => {
  const existing = await pool.query("SELECT id FROM likes WHERE listing_id = $1 AND user_id = $2", [req.params.id, req.userId]);
  if (existing.rows.length > 0) {
    await pool.query("DELETE FROM likes WHERE id = $1", [existing.rows[0].id]);
    return res.json({ liked: false });
  }
  await pool.query("INSERT INTO likes (listing_id, user_id) VALUES ($1,$2)", [req.params.id, req.userId]);
  res.json({ liked: true });
});

router.get("/listings/:id/like-count", async (req, res) => {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM likes WHERE listing_id = $1", [req.params.id]);
  res.json({ count: rows[0].count });
});

router.post("/listings/:id/favorite", requireAuth, async (req, res) => {
  const existing = await pool.query("SELECT id FROM favorites WHERE listing_id = $1 AND user_id = $2", [req.params.id, req.userId]);
  if (existing.rows.length > 0) {
    await pool.query("DELETE FROM favorites WHERE id = $1", [existing.rows[0].id]);
    return res.json({ favorited: false });
  }
  await pool.query("INSERT INTO favorites (listing_id, user_id) VALUES ($1,$2)", [req.params.id, req.userId]);
  res.json({ favorited: true });
});

router.get("/me/favorites", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT l.* FROM favorites f JOIN listings l ON l.id = f.listing_id
     WHERE f.user_id = $1 ORDER BY f.created_at DESC`,
    [req.userId]
  );
  res.json(rows);
});

router.get("/reels-feed", async (req, res) => {
  const { city, region } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = 20;
  const { rows } = await pool.query(
    `SELECT l.*,
       COALESCE(lk.like_count, 0) AS like_count,
       COALESCE(fv.fav_count, 0) AS fav_count,
       (CASE WHEN l.seller_city = $1 THEN 12 ELSE 0 END) +
       (CASE WHEN l.seller_region = $2 THEN 6 ELSE 0 END) +
       COALESCE(lk.like_count, 0) * 3 +
       COALESCE(fv.fav_count, 0) * 2.5 +
       GREATEST(0, 96 - EXTRACT(EPOCH FROM (now() - l.created_at)) / 3600) / 96 * 4 +
       (CASE WHEN jsonb_array_length(l.media_urls) > 0 THEN 2 ELSE 0 END) AS score
     FROM listings l
     LEFT JOIN (SELECT listing_id, COUNT(*) AS like_count FROM likes GROUP BY listing_id) lk ON lk.listing_id = l.id
     LEFT JOIN (SELECT listing_id, COUNT(*) AS fav_count FROM favorites GROUP BY listing_id) fv ON fv.listing_id = l.id
     WHERE l.status = 'yayinda'
     ORDER BY score DESC
     LIMIT $3 OFFSET $4`,
    [city || null, region || null, pageSize, (page - 1) * pageSize]
  );
  res.json({ results: rows, page });
});

router.post("/reviews", requireAuth, async (req, res) => {
  const { reviewedUserId, listingId, stars, comment } = req.body;
  if (!reviewedUserId || !stars) return res.status(400).json({ error: "Değerlendirilecek kullanıcı ve puan gerekli." });
  if (stars < 1 || stars > 5) return res.status(400).json({ error: "Puan 1-5 arasında olmalı." });

  const { rows } = await pool.query(
    `INSERT INTO reviews (reviewer_id, reviewed_user_id, listing_id, stars, comment)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.userId, reviewedUserId, listingId || null, stars, comment || null]
  );

  const agg = await pool.query(
    "SELECT AVG(stars)::numeric(3,2) AS avg, COUNT(*)::int AS cnt FROM reviews WHERE reviewed_user_id = $1",
    [reviewedUserId]
  );
  await pool.query("UPDATE users SET rating_avg = $1, rating_count = $2 WHERE id = $3", [agg.rows[0].avg, agg.rows[0].cnt, reviewedUserId]);

  res.status(201).json(rows[0]);
});

router.get("/users/:id/reviews", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM reviews WHERE reviewed_user_id = $1 ORDER BY created_at DESC", [req.params.id]);
  res.json(rows);
});

module.exports = router;
