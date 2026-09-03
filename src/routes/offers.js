const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/:listingId/offers", requireAuth, async (req, res) => {
  const { amount } = req.body;
  if (!amount) return res.status(400).json({ error: "Teklif tutarı gerekli." });

  const { rows } = await pool.query(
    "INSERT INTO offers (listing_id, buyer_id, amount) VALUES ($1,$2,$3) RETURNING *",
    [req.params.listingId, req.userId, amount]
  );
  res.status(201).json(rows[0]);
});

router.get("/:listingId/offers", requireAuth, async (req, res) => {
  const listing = await pool.query("SELECT seller_id FROM listings WHERE id = $1", [req.params.listingId]);
  if (listing.rows.length === 0) return res.status(404).json({ error: "İlan bulunamadı." });
  if (listing.rows[0].seller_id !== req.userId) return res.status(403).json({ error: "Bu ilanın teklifini görme yetkiniz yok." });

  const { rows } = await pool.query("SELECT * FROM offers WHERE listing_id = $1 ORDER BY created_at DESC", [req.params.listingId]);
  res.json(rows);
});

router.patch("/offers/:id", requireAuth, async (req, res) => {
  const { action, counterAmount } = req.body;
  const offerRes = await pool.query(
    `SELECT o.*, l.seller_id FROM offers o JOIN listings l ON l.id = o.listing_id WHERE o.id = $1`,
    [req.params.id]
  );
  if (offerRes.rows.length === 0) return res.status(404).json({ error: "Teklif bulunamadı." });
  const offer = offerRes.rows[0];
  if (offer.seller_id !== req.userId) return res.status(403).json({ error: "Bu teklife yanıt verme yetkiniz yok." });

  const statusMap = { kabul: "kabul", red: "red", karsi_teklif: "karsi_teklif" };
  if (!statusMap[action]) return res.status(400).json({ error: "Geçersiz işlem." });

  const { rows } = await pool.query(
    "UPDATE offers SET status = $1, counter_amount = $2 WHERE id = $3 RETURNING *",
    [statusMap[action], action === "karsi_teklif" ? counterAmount : null, req.params.id]
  );
  res.json(rows[0]);
});

module.exports = router;
