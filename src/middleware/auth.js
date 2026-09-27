const jwt = require("jsonwebtoken");

function readUserId(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return { error: "Giriş yapmanız gerekiyor." };
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.userId) return { error: "Oturum geçersiz." };
    return { userId: payload.userId };
  } catch {
    return { error: "Oturum geçersiz veya süresi dolmuş." };
  }
}

// Giriş ZORUNLU olan adresler için
function requireAuth(req, res, next) {
  const r = readUserId(req);
  if (r.error) return res.status(401).json({ error: r.error });
  req.userId = r.userId;
  next();
}

// Giriş İSTEĞE BAĞLI olan adresler için (girişliyse req.userId dolar, değilse boş kalır)
function optionalAuth(req, res, next) {
  const r = readUserId(req);
  if (r.userId) req.userId = r.userId;
  next();
}

module.exports = { requireAuth, optionalAuth };
