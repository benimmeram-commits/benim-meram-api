// PUSH BİLDİRİM KATMANI (Firebase Cloud Messaging)
// ------------------------------------------------------------------
// Hesap açmadan önce: bu dosya konsola yazdırır.
// ------------------------------------------------------------------

async function notifyNearbySellers(deviceTokens, title, body) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new Error("Firebase entegrasyonu henüz bağlanmadı — src/lib/push.js içindeki TODO'yu doldurun.");
  }

  console.log(`[PUSH SİMÜLASYONU] ${deviceTokens.length} cihaza bildirim: "${title} — ${body}"`);
  return true;
}

module.exports = { notifyNearbySellers };
