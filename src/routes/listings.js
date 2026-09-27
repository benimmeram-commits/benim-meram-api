// ---------------------------------------------------------------------
// İLANLAR
// ---------------------------------------------------------------------
// GET    /listings            → filtreli ilan listesi (herkese açık)
// GET    /listings/mine       → giriş yapan kullanıcının kendi ilanları
// GET    /listings/:id        → tek ilan (satıcı adı, beğeni sayısı dahil)
// POST   /listings            → yeni ilan ver
// PATCH  /listings/:id        → kendi ilanını düzenle
// PATCH  /listings/:id/status → kendi ilanını "satıldı" / "kaldırıldı" / "yayında" yap
// ---------------------------------------------------------------------

const express = require("express");
const { pool } = require("../db");
const { requireAuth, optionalAuth } = require("../middleware/auth");
const { MAIN_CATEGORIES, REGIONS, LISTING_STATUSES } = require("../constants");

const router = express.Router();

// Yeryüzünde iki nokta arası km (haversine formülü)
const DISTANCE_SQL = (latP, lngP) =>
  `(6371 * acos(LEAST(1, cos(radians(${latP})) * cos(radians(l.lat)) * cos(radians(l.lng) - radians(${lngP})) + sin(radians(${latP})) * sin(radians(l.lat)))))`;

const num = (v) => (v === undefined || v === null || v === "" ? null : Number(v));

// ---------- Liste ----------
router.get("/", async (req, res) => {
  const { mainCategory, subCategory, breed, minPrice, maxPrice, city, region, q, lat, lng, radiusKm } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const clauses = ["l.status = 'yayinda'"];
  const params = [];
  const add = (value, sql) => {
    params.push(value);
    clauses.push(sql.replace(/\?/g, `$${params.length}`));
  };

  if (mainCategory) add(mainCategory, "l.main_category = ?");
  if (subCategory) add(subCategory, "l.sub_category = ?");
  if (breed) add(`%${breed}%`, "l.breed ILIKE ?");
  if (num(minPrice) !== null && !isNaN(num(minPrice))) add(num(minPrice), "l.price >= ?");
  if (num(maxPrice) !== null && !isNaN(num(maxPrice))) add(num(maxPrice), "l.price <= ?");
  if (city) add(city, "l.seller_city = ?");
  if (region) add(region, "l.seller_region = ?");
  if (q) add(`%${q}%`, "(l.breed ILIKE ? OR l.description ILIKE ? OR l.sub_category ILIKE ? OR l.seller_city ILIKE ?)");

  let orderBy = "l.created_at DESC";
  let distanceSelect = "";
  const la = num(lat), ln = num(lng), rk = num(radiusKm);
  if (la !== null && ln !== null && rk !== null && !isNaN(la) && !isNaN(ln) && !isNaN(rk)) {
    params.push(la, ln);
    const latP = `$${params.length - 1}`, lngP = `$${params.length}`;
    // Önce hızlı kutu filtresi (indeks kullanır), sonra gerçek mesafe
    const dLat = rk / 111;
    const dLng = rk / (111 * Math.max(0.1, Math.cos((la * Math.PI) / 180)));
    params.push(la - dLat, la + dLat, ln - dLng, ln + dLng, rk);
    const p = params.length;
    clauses.push(`l.lat BETWEEN $${p - 4} AND $${p - 3} AND l.lng BETWEEN $${p - 2} AND $${p - 1}`);
    clauses.push(`${DISTANCE_SQL(latP, lngP)} <= $${p}`);
    distanceSelect = `, ${DISTANCE_SQL(latP, lngP)} AS distance_km`;
    orderBy = "distance_km ASC";
  }

  params.push(pageSize, offset);
  const { rows } = await pool.query(
    `SELECT l.*${distanceSelect}
     FROM listings l
     WHERE ${clauses.join(" AND ")}
     ORDER BY ${orderBy}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  res.json({ results: rows, page, pageSize, hasMore: rows.length === pageSize });
});

// ---------- Kendi ilanlarım ----------
router.get("/mine", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM listings WHERE seller_id = $1 AND status <> 'kaldirildi' ORDER BY created_at DESC",
    [req.userId]
  );
  res.json(rows);
});

// ---------- Tek ilan ----------
router.get("/:id", optionalAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT l.*,
            u.full_name  AS seller_name,
            u.rating_avg AS seller_rating,
            u.rating_count AS seller_rating_count,
            (SELECT COUNT(*)::int FROM likes WHERE listing_id = l.id) AS like_count,
            EXISTS (SELECT 1 FROM likes     WHERE listing_id = l.id AND user_id = $2) AS liked,
            EXISTS (SELECT 1 FROM favorites WHERE listing_id = l.id AND user_id = $2) AS favorited
     FROM listings l
     JOIN users u ON u.id = l.seller_id
     WHERE l.id = $1`,
    [req.params.id, req.userId || null]
  );
  const listing = rows[0];
  // Kaldırılmış ilanı sadece sahibi görebilir
  if (!listing || (listing.status === "kaldirildi" && listing.seller_id !== req.userId)) {
    return res.status(404).json({ error: "İlan bulunamadı." });
  }
  res.json(listing);
});

// ---------- Doğrulama ----------
function validateListing(b, { partial = false } = {}) {
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };
  const has = (k) => b[k] !== undefined && b[k] !== null && b[k] !== "";

  if (!partial || has("mainCategory")) need(MAIN_CATEGORIES.includes(b.mainCategory), "Geçerli bir kategori seçin.");
  if (!partial || has("subCategory")) need(typeof b.subCategory === "string" && b.subCategory.trim().length > 0, "Hayvan türünü seçin.");
  if (!partial || has("price")) need(Number(b.price) > 0 && Number(b.price) < 1e10, "Geçerli bir fiyat girin.");
  if (!partial || has("region")) need(REGIONS.includes(b.region), "Geçerli bir bölge seçin.");
  if (!partial || has("city")) need(typeof b.city === "string" && b.city.trim().length > 0, "Şehir girin.");
  if (has("ageMonths")) need(Number.isInteger(Number(b.ageMonths)) && Number(b.ageMonths) >= 0, "Yaş (ay) tam sayı olmalı.");
  if (has("weightKg")) need(Number(b.weightKg) > 0, "Ağırlık geçerli değil.");
  if (has("mediaUrls")) {
    need(
      Array.isArray(b.mediaUrls) && b.mediaUrls.length <= 10 && b.mediaUrls.every((u) => typeof u === "string" && /^https:\/\//.test(u)),
      "Fotoğraf adresleri geçersiz."
    );
  }
  if (has("description")) need(String(b.description).length <= 5000, "Açıklama çok uzun.");
  return errors;
}

const clean = (v) => (v === undefined || v === null || v === "" ? null : v);

// ---------- Yeni ilan ----------
router.post("/", requireAuth, async (req, res) => {
  const b = req.body || {};
  const errors = validateListing(b);
  if (errors.length) return res.status(400).json({ error: errors[0], errors });

  const { rows } = await pool.query(
    `INSERT INTO listings
       (seller_id, main_category, sub_category, breed, price, age_months, weight_kg,
        description, seller_city, seller_region, lat, lng, media_urls)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::text::jsonb)
     RETURNING *`,
    [
      req.userId,
      b.mainCategory,
      b.subCategory.trim(),
      clean(b.breed && String(b.breed).trim()),
      Number(b.price),
      clean(b.ageMonths) === null ? null : Number(b.ageMonths),
      clean(b.weightKg) === null ? null : Number(b.weightKg),
      clean(b.description && String(b.description).trim()),
      b.city.trim(),
      b.region,
      clean(b.lat) === null ? null : Number(b.lat),
      clean(b.lng) === null ? null : Number(b.lng),
      JSON.stringify(b.mediaUrls || []),
    ]
  );
  res.status(201).json(rows[0]);
});

// ---------- İlan düzenle ----------
const EDITABLE = {
  mainCategory: "main_category",
  subCategory: "sub_category",
  breed: "breed",
  price: "price",
  ageMonths: "age_months",
  weightKg: "weight_kg",
  description: "description",
  city: "seller_city",
  region: "seller_region",
  lat: "lat",
  lng: "lng",
  mediaUrls: "media_urls",
};

router.patch("/:id", requireAuth, async (req, res) => {
  const b = req.body || {};
  const errors = validateListing(b, { partial: true });
  if (errors.length) return res.status(400).json({ error: errors[0], errors });

  const own = await pool.query("SELECT seller_id FROM listings WHERE id = $1", [req.params.id]);
  if (own.rows.length === 0) return res.status(404).json({ error: "İlan bulunamadı." });
  if (own.rows[0].seller_id !== req.userId) return res.status(403).json({ error: "Bu ilanı düzenleme yetkiniz yok." });

  const sets = [];
  const params = [];
  for (const [key, col] of Object.entries(EDITABLE)) {
    if (b[key] === undefined) continue;
    params.push(key === "mediaUrls" ? JSON.stringify(b[key] || []) : clean(b[key]));
    sets.push(key === "mediaUrls" ? `${col} = $${params.length}::text::jsonb` : `${col} = $${params.length}`);
  }
  if (sets.length === 0) return res.status(400).json({ error: "Değiştirilecek alan yok." });

  params.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE listings SET ${sets.join(", ")}, updated_at = now() WHERE id = $${params.length} RETURNING *`,
    params
  );
  res.json(rows[0]);
});

// ---------- Durum değiştir (satıldı / kaldır / tekrar yayınla) ----------
router.patch("/:id/status", requireAuth, async (req, res) => {
  const { status } = req.body || {};
  if (!LISTING_STATUSES.includes(status)) return res.status(400).json({ error: "Geçersiz durum." });

  const { rows } = await pool.query(
    "UPDATE listings SET status = $1, updated_at = now() WHERE id = $2 AND seller_id = $3 RETURNING *",
    [status, req.params.id, req.userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: "İlan bulunamadı veya size ait değil." });
  res.json(rows[0]);
});

module.exports = router;
