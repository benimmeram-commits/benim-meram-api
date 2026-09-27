const { Pool } = require("pg");

const url = process.env.DATABASE_URL || "";

// Render'ın "External Database URL"i (adresinde .render.com geçer) şifreli bağlantı ister.
// "Internal Database URL" ile bağlanırken buna gerek yoktur.
const needsSsl = process.env.DATABASE_SSL === "true" || /\.render\.com/.test(url);

const pool = new Pool({
  connectionString: url,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: parseInt(process.env.DATABASE_POOL_MAX) || 10,
});

pool.on("error", (err) => console.error("[veritabanı] beklenmeyen bağlantı hatası:", err.message));

module.exports = { pool };
