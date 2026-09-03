const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { pool } = require("../db");
const { sendSms } = require("../lib/sms");

const router = express.Router();
const hash = (v) => crypto.createHash("sha256").update(v).digest("hex");

router.post("/register", async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: "Telefon numarası gerekli." });

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await pool.query(
    "INSERT INTO otp_codes (phone_number, code_hash, expires_at) VALUES ($1, $2, $3)",
    [phoneNumber, hash(code), expiresAt]
  );

  try {
    await sendSms(phoneNumber, `Benim Meram doğrulama kodunuz: ${code}`);
  } catch (e) {
    return res.status(503).json({ error: e.message });
  }

  res.json({ ok: true, message: "Doğrulama kodu gönderildi." });
});

router.post("/verify-otp", async (req, res) => {
  const { phoneNumber, code, fullName, profileType } = req.body;
  if (!phoneNumber || !code) return res.status(400).json({ error: "Telefon ve kod gerekli." });

  const { rows } = await pool.query(
    `SELECT * FROM otp_codes WHERE phone_number = $1 AND code_hash = $2 AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [phoneNumber, hash(code)]
  );
  if (rows.length === 0) return res.status(400).json({ error: "Kod hatalı veya süresi dolmuş." });

  let userRes = await pool.query("SELECT * FROM users WHERE phone_number = $1", [phoneNumber]);
  let user = userRes.rows[0];

  if (!user) {
    if (!fullName || !profileType) {
      return res.status(400).json({ error: "Yeni kullanıcı için ad ve profil tipi gerekli.", newUser: true });
    }
    const insert = await pool.query(
      `INSERT INTO users (phone_number, full_name, profile_type, is_phone_verified)
       VALUES ($1, $2, $3, true) RETURNING *`,
      [phoneNumber, fullName, profileType]
    );
    user = insert.rows[0];
  } else if (!user.is_phone_verified) {
    await pool.query("UPDATE users SET is_phone_verified = true WHERE id = $1", [user.id]);
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, user: { id: user.id, fullName: user.full_name, profileType: user.profile_type } });
});

module.exports = router;
