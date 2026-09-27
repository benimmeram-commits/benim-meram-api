// ---------------------------------------------------------------------
// GİRİŞ — telefon + SMS kodu
// ---------------------------------------------------------------------
// Güvenlik önlemleri:
//   - Bir numaraya 10 dakikada en fazla 3 kod gönderilir.
//   - Bir kod için en fazla 5 yanlış deneme yapılabilir, sonra geçersiz olur.
//   - Kod bir kez kullanılınca silinir.
// ---------------------------------------------------------------------

const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { pool } = require("../db");
const { sendSms } = require("../lib/sms");
const { PROFILE_TYPES } = require("../constants");

const router = express.Router();
const hash = (v) => crypto.createHash("sha256").update(String(v)).digest("hex");

const MAX_CODES_PER_10_MIN = 3;
const MAX_ATTEMPTS = 5;

// "+905321234567" biçimine getirir; geçersizse null
function normalizePhone(input) {
  let d = String(input || "").replace(/\D/g, "");
  if (d.startsWith("90")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  return /^5\d{9}$/.test(d) ? `+90${d}` : null;
}

router.post("/register", async (req, res) => {
  const phoneNumber = normalizePhone(req.body?.phoneNumber);
  if (!phoneNumber) return res.status(400).json({ error: "Geçerli bir cep telefonu numarası girin." });

  const recent = await pool.query(
    "SELECT COUNT(*)::int AS n FROM otp_codes WHERE phone_number = $1 AND created_at > now() - interval '10 minutes'",
    [phoneNumber]
  );
  if (recent.rows[0].n >= MAX_CODES_PER_10_MIN) {
    return res.status(429).json({ error: "Çok fazla kod istendi. Lütfen 10 dakika sonra tekrar deneyin." });
  }

  const code = String(crypto.randomInt(100000, 1000000));
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
  const { code, fullName, profileType } = req.body || {};
  const phoneNumber = normalizePhone(req.body?.phoneNumber);
  if (!phoneNumber || !code) return res.status(400).json({ error: "Telefon ve kod gerekli." });

  // Bu numaranın en son, süresi dolmamış kodu
  const { rows } = await pool.query(
    `SELECT * FROM otp_codes WHERE phone_number = $1 AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [phoneNumber]
  );
  const otp = rows[0];
  if (!otp || otp.attempts >= MAX_ATTEMPTS) {
    return res.status(400).json({ error: "Kodun süresi dolmuş. Lütfen yeni kod isteyin." });
  }
  if (otp.code_hash !== hash(code)) {
    await pool.query("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1", [otp.id]);
    return res.status(400).json({ error: "Kod hatalı." });
  }

  let user = (await pool.query("SELECT * FROM users WHERE phone_number = $1", [phoneNumber])).rows[0];

  if (!user) {
    // Yeni kullanıcı: kod doğru ama ad/profil tipi eksikse, kodu silmeden bunları iste
    if (!fullName || !String(fullName).trim() || !profileType) {
      return res.status(400).json({ error: "Yeni kullanıcı için ad ve profil tipi gerekli.", newUser: true });
    }
    if (!PROFILE_TYPES.includes(profileType)) return res.status(400).json({ error: "Geçersiz profil tipi." });
    const insert = await pool.query(
      `INSERT INTO users (phone_number, full_name, profile_type, is_phone_verified)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (phone_number) DO UPDATE SET is_phone_verified = true
       RETURNING *`,
      [phoneNumber, String(fullName).trim(), profileType]
    );
    user = insert.rows[0];
  } else if (!user.is_phone_verified) {
    await pool.query("UPDATE users SET is_phone_verified = true WHERE id = $1", [user.id]);
  }

  // Kullanılan kodu sil
  await pool.query("DELETE FROM otp_codes WHERE phone_number = $1", [phoneNumber]);

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, user: { id: user.id, fullName: user.full_name, profileType: user.profile_type } });
});

module.exports = router;
