// ---------------------------------------------------------------------
// OTOMATİK VERİTABANI KURULUMU
// ---------------------------------------------------------------------
// Sunucu her başladığında bu dosya çalışır ve tablolar henüz yoksa
// db/schema.sql dosyasını uygulayarak onları oluşturur.
// Tablolar zaten varsa hiçbir şey yapmaz — mevcut verilere DOKUNMAZ.
// ---------------------------------------------------------------------

const fs = require("fs");
const path = require("path");
const { pool } = require("./db");

async function runMigrations() {
  const check = await pool.query(
    `SELECT EXISTS (
       SELECT FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'users'
     ) AS exists`
  );

  if (check.rows[0].exists) {
    console.log("[kurulum] Tablolar zaten mevcut, kurulum atlandı.");
    return;
  }

  console.log("[kurulum] Tablolar bulunamadı, veritabanı şeması kuruluyor...");
  const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(schemaSql);
    await client.query("COMMIT");
    console.log("[kurulum] Veritabanı şeması başarıyla kuruldu.");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[kurulum] HATA — şema kurulamadı:", e.message);
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { runMigrations };
