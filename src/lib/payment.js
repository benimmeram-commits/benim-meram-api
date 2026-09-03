// ÖDEME KATMANI (Iyzico)
// ------------------------------------------------------------------
// Hesap açmadan önce: bu dosya sahte bir "başarılı" ödeme döndürür.
// ------------------------------------------------------------------

async function createCheckout({ userId, amount, kind, buyerEmail, buyerName, buyerPhone }) {
  if (process.env.IYZICO_API_KEY) {
    throw new Error("Iyzico entegrasyonu henüz bağlanmadı — src/lib/payment.js içindeki TODO'yu doldurun.");
  }

  console.log(`[ÖDEME SİMÜLASYONU] Kullanıcı ${userId} için ${amount} TL ${kind} ödemesi "başarılı" sayıldı.`);
  return { status: "success", paymentPageUrl: null, simulated: true };
}

module.exports = { createCheckout };
