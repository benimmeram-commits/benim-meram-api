const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { REGIONS } = require("../constants");

const MAX_MESSAGE_LENGTH = 2000;

const router = express.Router();

router.get("/conversations", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*, l.breed, l.sub_category,
            ou.full_name AS other_name,
            lm.body AS last_message,
            COALESCE(lm.created_at, c.created_at) AS last_at
     FROM conversations c
     LEFT JOIN listings l ON l.id = c.listing_id
     JOIN users ou ON ou.id = CASE WHEN c.buyer_id = $1 THEN c.seller_id ELSE c.buyer_id END
     LEFT JOIN LATERAL (
       SELECT body, created_at FROM messages m
       WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1
     ) lm ON true
     WHERE c.buyer_id = $1 OR c.seller_id = $1
     ORDER BY last_at DESC
     LIMIT 200`,
    [req.userId]
  );
  res.json(rows);
});

router.post("/conversations", requireAuth, async (req, res) => {
  const { listingId, otherUserId } = req.body;
  if (!otherUserId) return res.status(400).json({ error: "otherUserId gerekli." });
  if (otherUserId === req.userId) return res.status(400).json({ error: "Kendinize mesaj gönderemezsiniz." });

  const existing = await pool.query(
    `SELECT * FROM conversations
     WHERE listing_id = $1 AND ((buyer_id = $2 AND seller_id = $3) OR (buyer_id = $3 AND seller_id = $2))`,
    [listingId || null, req.userId, otherUserId]
  );
  if (existing.rows.length > 0) return res.json(existing.rows[0]);

  const { rows } = await pool.query(
    `INSERT INTO conversations (listing_id, buyer_id, seller_id) VALUES ($1,$2,$3) RETURNING *`,
    [listingId || null, req.userId, otherUserId]
  );
  res.status(201).json(rows[0]);
});

router.get("/conversations/:id/messages", requireAuth, async (req, res) => {
  const conv = await pool.query("SELECT * FROM conversations WHERE id = $1", [req.params.id]);
  if (conv.rows.length === 0) return res.status(404).json({ error: "Sohbet bulunamadı." });
  if (conv.rows[0].buyer_id !== req.userId && conv.rows[0].seller_id !== req.userId) {
    return res.status(403).json({ error: "Bu sohbete erişiminiz yok." });
  }
  const limit = Math.min(100, parseInt(req.query.limit) || 50);
  const params = [req.params.id];
  let beforeClause = "";
  if (req.query.before) { params.push(req.query.before); beforeClause = `AND created_at < $${params.length}`; }
  params.push(limit);
  const { rows } = await pool.query(
    `SELECT * FROM messages WHERE conversation_id = $1 ${beforeClause} ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
  res.json(rows.reverse());
});

router.post("/conversations/:id/messages", requireAuth, async (req, res) => {
  const { body } = req.body || {};
  if (typeof body !== "string" || !body.trim()) return res.status(400).json({ error: "Mesaj boş olamaz." });
  if (body.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ error: "Mesaj çok uzun." });
  const conv = await pool.query("SELECT * FROM conversations WHERE id = $1", [req.params.id]);
  if (conv.rows.length === 0) return res.status(404).json({ error: "Sohbet bulunamadı." });
  if (conv.rows[0].buyer_id !== req.userId && conv.rows[0].seller_id !== req.userId) {
    return res.status(403).json({ error: "Bu sohbete erişiminiz yok." });
  }
  const { rows } = await pool.query(
    `INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1,$2,$3) RETURNING *`,
    [req.params.id, req.userId, body.trim()]
  );
  res.status(201).json(rows[0]);
});

router.get("/region-chat/:region", requireAuth, async (req, res) => {
  if (!REGIONS.includes(req.params.region)) return res.status(404).json({ error: "Bölge bulunamadı." });
  const limit = Math.min(100, parseInt(req.query.limit) || 50);
  const { rows } = await pool.query(
    `SELECT m.*, u.full_name AS sender_name FROM region_chat_messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.region = $1 ORDER BY m.created_at DESC LIMIT $2`,
    [req.params.region, limit]
  );
  res.json(rows.reverse());
});

router.post("/region-chat/:region", requireAuth, async (req, res) => {
  if (!REGIONS.includes(req.params.region)) return res.status(404).json({ error: "Bölge bulunamadı." });
  const { body } = req.body || {};
  if (typeof body !== "string" || !body.trim()) return res.status(400).json({ error: "Mesaj boş olamaz." });
  if (body.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ error: "Mesaj çok uzun." });
  const { rows } = await pool.query(
    `INSERT INTO region_chat_messages (region, sender_id, body) VALUES ($1,$2,$3) RETURNING *`,
    [req.params.region, req.userId, body.trim()]
  );
  res.status(201).json(rows[0]);
});

module.exports = router;
