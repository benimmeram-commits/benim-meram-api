const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { createCheckout } = require("../lib/payment");

const router = express.Router();

const SUBSCRIPTION_PRICE = 1000;
const PER_LISTING_PRICE = 75;

router.post("/subscriptions/checkout", requireAuth, async (req, res) => {
  const user = (await pool.query("SELECT * FROM users WHERE id = $1", [req.userId])).rows[0];

  const payment = await pool.query(
    "INSERT INTO payments (user_id, kind, amount, status) VALUES ($1,'abonelik',$2,'beklemede') RETURNING *",
    [req.userId, SUBSCRIPTION_PRICE]
  );

  const result = await createCheckout({
    userId: req.userId, amount: SUBSCRIPTION_PRICE, kind: "abonelik",
    buyerEmail: user.email, buyerName: user.full_name, buyerPhone: user.phone_number,
  });

  if (result.simulated) {
    await pool.query("UPDATE payments SET status = 'basarili' WHERE id = $1", [payment.rows[0].id]);
    await pool.query(
      `INSERT INTO subscriptions (user_id, expires_at) VALUES ($1, now() + interval '30 days')`,
      [req.userId]
    );
    await pool.query("UPDATE users SET subscription_status = 'aktif' WHERE id = $1", [req.userId]);
  }

  res.json(result);
});

router.post("/listings/:id/pay-per-post", requireAuth, async (req, res) => {
  const result = await createCheckout({ userId: req.userId, amount: PER_LISTING_PRICE, kind: "tekil_ilan" });
  await pool.query(
    "INSERT INTO payments (user_id, kind, amount, status) VALUES ($1,'tekil_ilan',$2,$3)",
    [req.userId, PER_LISTING_PRICE, result.simulated ? "basarili" : "beklemede"]
  );
  res.json(result);
});

router.post("/payments/webhook", async (req, res) => {
  res.json({ received: true });
});

module.exports = router;
