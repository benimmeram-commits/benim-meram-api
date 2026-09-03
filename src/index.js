require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const listingsRoutes = require("./routes/listings");
const requestsRoutes = require("./routes/requests");
const offersRoutes = require("./routes/offers");
const paymentsRoutes = require("./routes/payments");
const adminRoutes = require("./routes/admin");
const messagesRoutes = require("./routes/messages");
const engagementRoutes = require("./routes/engagement");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/listings", listingsRoutes);
app.use("/buy-requests", requestsRoutes);
app.use("/", offersRoutes);
app.use("/", paymentsRoutes);
app.use("/admin", adminRoutes);
app.use("/", messagesRoutes);
app.use("/", engagementRoutes);

app.use((err, req, res, next) => {
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
