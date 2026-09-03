const jwt = require("jsonwebtoken");

function requireAdminRole(...allowedRoles) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Yönetici girişi gerekiyor." });
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (!payload.adminRole || !allowedRoles.includes(payload.adminRole)) {
        return res.status(403).json({ error: "Bu işlem için yetkiniz yok." });
      }
      req.adminId = payload.adminId;
      req.adminRole = payload.adminRole;
      next();
    } catch {
      return res.status(401).json({ error: "Oturum geçersiz." });
    }
  };
}

module.exports = { requireAdminRole };
