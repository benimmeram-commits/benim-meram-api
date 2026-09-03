const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

let hasPostgis = false;
pool.query("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS ok")
  .then(r => { hasPostgis = r.rows[0].ok; })
  .catch(() => { hasPostgis = false; });

router.get("/", async (req, res) => {
  const { mainCategory, subCategory, breed, minPrice, maxPrice, city, region, q, lat, lng, radiusKm } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(50, parseInt(req.query.pageSize) || 20);
  const offset = (page - 1) * pageSize;

  const clauses = ["status = 'yayinda'"];
  const params = [];

  if (mainCategory) { params.push(mainCategory); clauses.push(`main_category = $${params.length}`); }
  if (subCategory) { params.push(subCategory); clauses.push(`sub_category = $${params.length}`); }
  if (breed) { params.push(`%${breed}%`); clauses.push(`breed ILIKE $${params.length}`); }
  if (minPrice) { params.push(minPrice); clauses.push(`price >= $${params.length}`); }
  if (maxPrice) { params.push(maxPrice); clauses.push(`price <= $${params.length}`); }
  if (city) { params.push(city); clauses.push(`seller_city = $${params.length}`); }
  if (region) { params.push(region); clauses.push(`seller_region = $${params.length}`); }
  if (q) { params.push(`%${q}%`); clauses.push(`(breed ILIKE $${params.length} OR description ILIKE $${params.length} OR sub_category ILIKE $${params.length})`); }
  if (lat && lng && radiusKm && hasPostgis) {
    params.push(lng, lat,
