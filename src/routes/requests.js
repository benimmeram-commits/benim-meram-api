const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { notifyNearbySellers } = require("../lib/push");
const { MAIN_CATEGORIES } = require("../constants");

const router = express.Router();

router.get("/", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM buy_requests WHERE status = 'acik' ORDER BY created_at DESC LIMIT 100"
  );
  res.json(rows);
});

router.post("/", requireAuth, async (req, res) => {
  const { budgetMax, desiredCategory, desiredBreed, lat, lng, locationLabel } = req.body || {};
  if (!(Number(budgetMax) > 0) || !desiredCategory) return res.status(400).json({ error: "Bütçe ve kategori gerekli." });
  if (!MAIN_CATEGORIES.includes(desiredCategory)) return res.status(400).json({ error: "Geçerli bir kategori seçin." });

  const toNum = (v) => (v === undefined || v === null || v === "" ? null : Number(v));
  const { rows } = await pool.query(
    `INSERT INTO buy_requests (buyer_id, budget_max, desired_category, desired_breed, lat, lng, location_label)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [req.userId, Number(budgetMax), desiredCategory, desiredBreed || null, toNum(lat), toNum(lng), locationLabel || null]
  );
  const created = rows[0];

  try {
    await notifyNearbySellers([], "Yeni Alım Talebi", `${desiredCategory} aranıyor — bütçe ${budgetMax} TL`);
  } catch { /* push henüz bağlanmadıysa sessizce geç */ }

  res.status(201).json(created);
});

module.exports = router;
