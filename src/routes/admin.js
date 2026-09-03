const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { pool } = require("../db");
const { requireAdminRole } = require("../middleware/rbac");

const router = express.Router();
const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");

router.post("/login", async (req, res) => {
  const { tcNo, password } = req.body;
  const { rows } = await pool.query("SELECT * FROM admin_users WHERE tc_no = $1 AND active = true", [tcNo]);
  if (rows.length === 0 || rows[0].password_hash !== sha256(password)) {
    await pool.query(
      "INSERT INTO admin_login_logs (tc_no, success, reason) VALUES ($1, false, 'hatalı giriş')",
      [tcNo || ""]
    );
    return res.status(401).json({ error: "TC Kimlik No veya şifre hatalı." });
  }
  const admin = rows[0];
  const token = jwt.sign({ adminId: admin.id, adminRole: admin.role }, process.env.JWT_SECRET, { expiresIn: "12h" });
  await pool.query(
    "INSERT INTO admin_login_logs (tc_no, full_name, role, success) VALUES ($1,$2,$3,true)",
    [tcNo, admin.full_name, admin.role]
  );
  res.json({ token, role: admin.role, name: admin.full_name });
});

async function logAudit(actorName, actorRole, action, target) {
  await pool.query(
    "INSERT INTO audit_log (actor_name, actor_role, action, target) VALUES ($1,$2,$3,$4)",
    [actorName, actorRole, action, target || null]
  );
}

router.get("/finance/summary", requireAdminRole("super"), async (req, res) => {
  const revenue = await pool.query(
    `SELECT kind, SUM(amount) AS total FROM payments WHERE status = 'basarili' GROUP BY kind`
  );
  res.json({ revenueByKind: revenue.rows });
});

router.get("/pricing", requireAdminRole("super"), async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM pricing_settings WHERE id = 1");
  res.json(rows[0]);
});
router.patch("/pricing", requireAdminRole("super"), async (req, res) => {
  const { subscriptionPrice, perListingPrice, commissionRate } = req.body;
  const { rows } = await pool.query(
    `UPDATE pricing_settings SET
       subscription_price = COALESCE($1, subscription_price),
       per_listing_price = COALESCE($2, per_listing_price),
       commission_rate = COALESCE($3, commission_rate)
     WHERE id = 1 RETURNING *`,
    [subscriptionPrice ?? null, perListingPrice ?? null, commissionRate ?? null]
  );
  await logAudit(req.adminId, req.adminRole, "Fiyatlandırma güncellendi", JSON.stringify(req.body));
  res.json(rows[0]);
});

router.post("/admins", requireAdminRole("super"), async (req, res) => {
  const { tcNo, fullName, phoneNumber, password, role, securityQuestion, securityAnswer, documentPhotoUrl } = req.body;
  if (!tcNo || !fullName || !phoneNumber || !password || !role || !securityQuestion || !securityAnswer || !documentPhotoUrl) {
    return res.status(400).json({ error: "Tüm alanlar (belge fotoğrafı dahil) zorunlu." });
  }
  const { rows } = await pool.query(
    `INSERT INTO admin_users (tc_no, full_name, phone_number, password_hash, role, security_question, security_answer_hash, document_photo_url, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, tc_no, full_name, role`,
    [tcNo, fullName, phoneNumber, sha256(password), role, securityQuestion, sha256(securityAnswer.toLowerCase()), documentPhotoUrl, req.adminId]
  );
  await logAudit(req.adminId, req.adminRole, `Yeni ${role} oluşturuldu`, fullName);
  res.status(201).json(rows[0]);
});

router.patch("/admins/:id/toggle-active", requireAdminRole("super"), async (req, res) => {
  const { rows } = await pool.query(
    "UPDATE admin_users SET active = NOT active WHERE id = $1 RETURNING id, active", [req.params.id]
  );
  await logAudit(req.adminId, req.adminRole, "Yönetici erişimi değiştirildi", req.params.id);
  res.json(rows[0]);
});

router.patch("/admins/:id/reset-password", requireAdminRole("super"), async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: "Yeni şifre en az 4 karakter olmalı." });
  await pool.query("UPDATE admin_users SET password_hash = $1 WHERE id = $2", [sha256(newPassword), req.params.id]);
  await logAudit(req.adminId, req.adminRole, "Yönetici şifresi sıfırlandı", req.params.id);
  res.json({ ok: true });
});

router.patch("/listings/:id/moderate", requireAdminRole("super", "mod"), async (req, res) => {
  const { action } = req.body;
  await pool.query("UPDATE listings SET status = $1 WHERE id = $2", [action === "kaldir" ? "kaldirildi" : "yayinda", req.params.id]);
  await logAudit(req.adminId, req.adminRole, `İlan ${action === "kaldir" ? "kaldırıldı" : "aktif edildi"}`, req.params.id);
  res.json({ ok: true });
});

router.get("/pending-documents", requireAdminRole("super", "mod"), async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, full_name, phone_number, profile_type, document_ref, document_photo_url FROM users WHERE document_status = 'beklemede' ORDER BY created_at"
  );
  res.json(rows);
});
router.patch("/users/:id/document", requireAdminRole("super", "mod"), async (req, res) => {
  const { action } = req.body;
  await pool.query(
    "UPDATE users SET document_status = $1 WHERE id = $2",
    [action === "onayla" ? "onaylandi" : "reddedildi", req.params.id]
  );
  await logAudit(req.adminId, req.adminRole, `Belge ${action === "onayla" ? "onaylandı" : "reddedildi"}`, req.params.id);
  res.json({ ok: true });
});

router.get("/support-tickets", requireAdminRole("super", "mod", "destek"), async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM reports ORDER BY created_at DESC LIMIT 100");
  res.json(rows);
});

router.get("/audit-log", requireAdminRole("super"), async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200");
  res.json(rows);
});

module.exports = router;
