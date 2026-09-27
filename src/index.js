require("dotenv").config();

// Zorunlu ayarlar eksikse sunucu anlaşılır bir mesajla durur.
for (const key of ["DATABASE_URL", "JWT_SECRET"]) {
  if (!process.env[key]) {
    console.error(`[ayar] ${key} tanımlı değil. Render → Environment bölümünden ekleyin.`);
    process.exit(1);
  }
}

const express = require("express");
const cors = require("cors");

// Express 4, "async" fonksiyonlardaki hataları kendisi yakalamaz; yakalanmayan
// bir veritabanı hatası tüm sunucuyu çökertebilir. Bu küçük yama, her hatayı
// aşağıdaki hata yakalayıcıya yönlendirir.
const Layer = require("express/lib/router/layer");
const originalHandle = Layer.prototype.handle_request;
Layer.prototype.handle_request = function (req, res, next) {
  if (this.handle.length > 3) return originalHandle.call(this, req, res, next);
  try {
    const out = this.handle(req, res, next);
    if (out && typeof out.catch === "function") out.catch(next);
  } catch (err) {
    next(err);
  }
};

const authRoutes = require("./routes/auth");
const listingsRoutes = require("./routes/listings");
const requestsRoutes = require("./routes/requests");
const offersRoutes = require("./routes/offers");
const paymentsRoutes = require("./routes/payments");
const adminRoutes = require("./routes/admin");
const messagesRoutes = require("./routes/messages");
const engagementRoutes = require("./routes/engagement");

const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/listings", listingsRoutes);
app.use("/buy-requests", requestsRoutes);
app.use("/admin", adminRoutes);
app.use("/", offersRoutes);
app.use("/", paymentsRoutes);
app.use("/", messagesRoutes);
app.use("/", engagementRoutes);

app.use((req, res) => res.status(404).json({ error: "Adres bulunamadı." }));

app.use((err, req, res, next) => {
  // Bozuk JSON gövdesi
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Geçersiz istek." });
  // Geçersiz kimlik (ör. /listings/abc) → bulunamadı
  if (err.code === "22P02") return res.status(404).json({ error: "Kayıt bulunamadı." });
  // Var olmayan kullanıcı/ilana bağlanmaya çalışma
  if (err.code === "23503") return res.status(400).json({ error: "İlgili kayıt bulunamadı." });
  console.error(err);
  res.status(500).json({ error: "Sunucu hatası." });
});

const PORT = process.env.PORT || 4000;

const { runMigrations } = require("./migrate");
runMigrations()
  .then(() => {
    app.listen(PORT, () => console.log(`Benim Meram API çalışıyor: http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error("Veritabanı kurulumu başarısız, sunucu başlatılamadı:", e.message);
    process.exit(1);
  });
