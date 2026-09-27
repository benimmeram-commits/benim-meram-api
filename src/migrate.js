// ---------------------------------------------------------------------
// OTOMATİK VERİTABANI KURULUMU
// ---------------------------------------------------------------------
// Sunucu her başladığında db/schema.sql dosyasını çalıştırır.
// Şemadaki her komut "IF NOT EXISTS" ile yazıldığı için:
//   - ilk açılışta tüm tablolar kurulur,
//   - sonraki açılışlarda sadece YENİ eklenen tablo/indeksler kurulur,
//   - mevcut verilere DOKUNULMAZ.
// Aynı anda birden fazla sunucu açılırsa kilit sayesinde sırayla çalışırlar.
// ---------------------------------------------------------------------

const fs = require("fs");
const path = require("path");
const { pool } = require("./db");

const LOCK_ID = 7042026; // herhangi sabit bir sayı

async function runMigrations() {
  const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    await client.query("BEGIN");
    await client.query(schemaSql);
    await client.query("COMMIT");
    console.log("[kurulum] Veritabanı şeması güncel.");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[kurulum] HATA — şema kurulamadı:", e.message);
    throw e;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]).catch(() => {});
    client.release();
  }
}

module.exports = { runMigrations };
