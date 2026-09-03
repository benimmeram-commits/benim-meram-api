// SMS GÖNDERME KATMANI
// ------------------------------------------------------------------
// Hesap açmadan önce: bu dosya konsola yazdırır, gerçek SMS göndermez.
// ------------------------------------------------------------------

async function sendSms(phoneNumber, message) {
  const provider = process.env.SMS_PROVIDER || "none";

  if (provider === "netgsm" && process.env.NETGSM_USERCODE) {
    throw new Error("Netgsm entegrasyonu henüz bağlanmadı — src/lib/sms.js içindeki TODO'yu doldurun.");
  }

  if (provider === "twilio" && process.env.TWILIO_ACCOUNT_SID) {
    throw new Error("Twilio entegrasyonu henüz bağlanmadı — src/lib/sms.js içindeki TODO'yu doldurun.");
  }

  console.log(`[SMS SİMÜLASYONU] ${phoneNumber} numarasına gönderilecek mesaj: "${message}"`);
  return true;
}

module.exports = { sendSms };
