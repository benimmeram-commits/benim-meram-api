const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { notifyNearbySellers } = require("../lib/push");

const router = express.Router();

router.get("/", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM buy_requests WHERE status = 'acik' ORDER BY created_at DESC LIMIT 100"
  );
  res.json(rows);
});

router.post("/", requireAuth, async (req, res) => {
  const { budgetMax, desiredCategory, desiredBreed, lat, lng, locationLabel } = req.body;
  if (!budgetMax || !desiredCategory) return res.status(400).json({ error: "Bütçe ve kategori gerekli." });

  const { rows } = await pool.query(
    `INSERT INTO buy_requests (buyer_id, budget_max, desired_category, desired_breed, location, location_label)
     VALUES ($1,$2,$3,$4, CASE WHEN $5::float IS NOT NULL THEN ST_MakePoint($5,$6)::geography ELSE NULL END, $7)
     RETURNING *`,
    [req.userId, budgetMax, desiredCategory, desiredBreed || null, lng || null, lat || null, locationLabel || null]
  );
  const created = rows[0];

  try {
    await notifyNearbySellers([], "Yeni Alım Talebi", `${desiredCategory} aranıyor — bütçe ${budgetMax} TL`);
  } catch { /* push henüz bağlanmadıysa sessizce geç */ }

  res.status(201).json(created);
});

module.exports = router;
