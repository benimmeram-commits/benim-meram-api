-- ---------------------------------------------------------------------
-- BENİM MERAM — VERİTABANI ŞEMASI
-- ---------------------------------------------------------------------
-- Bu dosya sunucu her açıldığında çalışır (bkz. src/migrate.js).
-- Her komut "IF NOT EXISTS" ile yazıldığı için tekrar çalışması zararsızdır:
-- var olan tabloya ve verilere DOKUNMAZ, sadece eksik olanı ekler.
--
-- Değer sözlüğü (mobil uygulamadaki src/constants.js ile aynı):
--   main_category : buyukbas | kucukbas
--   seller_region : marmara | ege | akdeniz | ic_anadolu | karadeniz |
--                   dogu_anadolu | guneydogu_anadolu
--   profile_type  : bireysel | ciftci | tuccar
--   listing status: yayinda | satildi | kaldirildi
-- ---------------------------------------------------------------------

-- ---------- Kullanıcılar ----------
CREATE TABLE IF NOT EXISTS users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number        text NOT NULL UNIQUE,
  full_name           text,
  profile_type        text,
  email               text,
  is_phone_verified   boolean NOT NULL DEFAULT false,
  subscription_status text NOT NULL DEFAULT 'yok',          -- yok | aktif
  rating_avg          numeric(3,2) NOT NULL DEFAULT 0,
  rating_count        integer NOT NULL DEFAULT 0,
  document_ref        text,
  document_photo_url  text,
  document_status     text NOT NULL DEFAULT 'yok',          -- yok | beklemede | onaylandi | reddedildi
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id           bigserial PRIMARY KEY,
  phone_number text NOT NULL,
  code_hash    text NOT NULL,
  expires_at   timestamptz NOT NULL,
  attempts     integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------- İlanlar ----------
CREATE TABLE IF NOT EXISTS listings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  main_category text NOT NULL,
  sub_category  text NOT NULL,
  breed         text,
  price         numeric(12,2) NOT NULL CHECK (price >= 0),
  age_months    integer,
  weight_kg     numeric(7,2),
  description   text,
  seller_city   text,
  seller_region text,
  lat           double precision,
  lng           double precision,
  media_urls    jsonb NOT NULL DEFAULT '[]'::jsonb,
  status        text NOT NULL DEFAULT 'yayinda',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------- Alım talepleri ----------
CREATE TABLE IF NOT EXISTS buy_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  budget_max       numeric(12,2) NOT NULL,
  desired_category text NOT NULL,
  desired_breed    text,
  lat              double precision,
  lng              double precision,
  location_label   text,
  status           text NOT NULL DEFAULT 'acik',            -- acik | kapali
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------- Teklifler ----------
CREATE TABLE IF NOT EXISTS offers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id     uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount         numeric(12,2) NOT NULL,
  status         text NOT NULL DEFAULT 'beklemede',         -- beklemede | kabul | red | karsi_teklif
  counter_amount numeric(12,2),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------- Ödemeler ve abonelik ----------
CREATE TABLE IF NOT EXISTS payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         text NOT NULL,                               -- abonelik | tekil_ilan
  amount       numeric(12,2) NOT NULL,
  status       text NOT NULL DEFAULT 'beklemede',           -- beklemede | basarili | basarisiz
  provider_ref text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at  timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pricing_settings (
  id                 integer PRIMARY KEY CHECK (id = 1),
  subscription_price numeric(12,2) NOT NULL DEFAULT 1000,
  per_listing_price  numeric(12,2) NOT NULL DEFAULT 75,
  commission_rate    numeric(5,4)  NOT NULL DEFAULT 0
);

-- ---------- Mesajlaşma ----------
CREATE TABLE IF NOT EXISTS conversations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES listings(id) ON DELETE SET NULL,
  buyer_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS region_chat_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region     text NOT NULL,
  sender_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Beğeni, favori, değerlendirme ----------
CREATE TABLE IF NOT EXISTS likes (
  id         bigserial PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, user_id)
);

CREATE TABLE IF NOT EXISTS favorites (
  id         bigserial PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, user_id)
);

CREATE TABLE IF NOT EXISTS reviews (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewed_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id       uuid REFERENCES listings(id) ON DELETE SET NULL,
  stars            integer NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment          text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES users(id) ON DELETE SET NULL,
  listing_id  uuid REFERENCES listings(id) ON DELETE SET NULL,
  reason      text,
  status      text NOT NULL DEFAULT 'acik',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- Yönetim paneli ----------
CREATE TABLE IF NOT EXISTS admin_users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tc_no                text NOT NULL UNIQUE,
  full_name            text NOT NULL,
  phone_number         text,
  password_hash        text NOT NULL,
  role                 text NOT NULL,                       -- super | mod | destek
  security_question    text,
  security_answer_hash text,
  document_photo_url   text,
  created_by           uuid,
  active               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_login_logs (
  id         bigserial PRIMARY KEY,
  tc_no      text,
  full_name  text,
  role       text,
  success    boolean NOT NULL,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         bigserial PRIMARY KEY,
  actor_name text,
  actor_role text,
  action     text NOT NULL,
  target     text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- EKSİK SÜTUNLARI TAMAMLA
-- ---------------------------------------------------------------------
-- Veritabanında bu tabloların daha eski bir hali varsa, "CREATE TABLE IF
-- NOT EXISTS" onları atlar ve yeni sütunlar eksik kalır. Aşağıdaki satırlar
-- eksik sütunları ekler; zaten varsa hiçbir şey yapmaz.
-- ---------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_type text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_phone_verified boolean DEFAULT false NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'yok' NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rating_avg numeric(3,2) DEFAULT 0 NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rating_count integer DEFAULT 0 NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS document_ref text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS document_photo_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS document_status text DEFAULT 'yok' NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS code_hash text;
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS attempts integer DEFAULT 0 NOT NULL;
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS seller_id uuid;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS main_category text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS sub_category text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS breed text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS price numeric(12,2);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS age_months integer;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS weight_kg numeric(7,2);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS seller_city text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS seller_region text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS lng double precision;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS media_urls jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS status text DEFAULT 'yayinda' NOT NULL;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE buy_requests ADD COLUMN IF NOT EXISTS buyer_id uuid;
ALTER TABLE buy_requests ADD COLUMN IF NOT EXISTS budget_max numeric(12,2);
ALTER TABLE buy_requests ADD COLUMN IF NOT EXISTS desired_category text;
ALTER TABLE buy_requests ADD COLUMN IF NOT EXISTS desired_breed text;
ALTER TABLE buy_requests ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE buy_requests ADD COLUMN IF NOT EXISTS lng double precision;
ALTER TABLE buy_requests ADD COLUMN IF NOT EXISTS location_label text;
ALTER TABLE buy_requests ADD COLUMN IF NOT EXISTS status text DEFAULT 'acik' NOT NULL;
ALTER TABLE buy_requests ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS listing_id uuid;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS buyer_id uuid;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS amount numeric(12,2);
ALTER TABLE offers ADD COLUMN IF NOT EXISTS status text DEFAULT 'beklemede' NOT NULL;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS counter_amount numeric(12,2);
ALTER TABLE offers ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount numeric(12,2);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS status text DEFAULT 'beklemede' NOT NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_ref text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS starts_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE pricing_settings ADD COLUMN IF NOT EXISTS subscription_price numeric(12,2) DEFAULT 1000 NOT NULL;
ALTER TABLE pricing_settings ADD COLUMN IF NOT EXISTS per_listing_price numeric(12,2) DEFAULT 75 NOT NULL;
ALTER TABLE pricing_settings ADD COLUMN IF NOT EXISTS commission_rate numeric(5,4) DEFAULT 0 NOT NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS listing_id uuid;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS buyer_id uuid;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS seller_id uuid;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_id uuid;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_id uuid;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE region_chat_messages ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE region_chat_messages ADD COLUMN IF NOT EXISTS sender_id uuid;
ALTER TABLE region_chat_messages ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE region_chat_messages ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE likes ADD COLUMN IF NOT EXISTS listing_id uuid;
ALTER TABLE likes ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE likes ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS listing_id uuid;
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reviewer_id uuid;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reviewed_user_id uuid;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS listing_id uuid;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS stars integer;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS comment text;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_id uuid;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS listing_id uuid;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS status text DEFAULT 'acik' NOT NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS tc_no text;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS security_question text;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS security_answer_hash text;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS document_photo_url text;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS active boolean DEFAULT true NOT NULL;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE admin_login_logs ADD COLUMN IF NOT EXISTS tc_no text;
ALTER TABLE admin_login_logs ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE admin_login_logs ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE admin_login_logs ADD COLUMN IF NOT EXISTS success boolean;
ALTER TABLE admin_login_logs ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE admin_login_logs ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_name text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_role text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS action text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS target text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now() NOT NULL;

-- ---------------------------------------------------------------------
-- İNDEKSLER VE BAŞLANGIÇ VERİLERİ
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS otp_codes_phone_idx ON otp_codes (phone_number, created_at DESC);
CREATE INDEX IF NOT EXISTS listings_feed_idx     ON listings (status, created_at DESC);
CREATE INDEX IF NOT EXISTS listings_category_idx ON listings (status, main_category, created_at DESC);
CREATE INDEX IF NOT EXISTS listings_region_idx   ON listings (status, seller_region, created_at DESC);
CREATE INDEX IF NOT EXISTS listings_city_idx     ON listings (status, seller_city);
CREATE INDEX IF NOT EXISTS listings_seller_idx   ON listings (seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS listings_geo_idx      ON listings (lat, lng);
CREATE INDEX IF NOT EXISTS buy_requests_open_idx ON buy_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS offers_listing_idx ON offers (listing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_user_idx ON payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON subscriptions (user_id, expires_at DESC);
INSERT INTO pricing_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
CREATE INDEX IF NOT EXISTS conversations_buyer_idx  ON conversations (buyer_id);
CREATE INDEX IF NOT EXISTS conversations_seller_idx ON conversations (seller_id);
CREATE INDEX IF NOT EXISTS messages_conv_idx ON messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS region_chat_idx ON region_chat_messages (region, created_at DESC);
CREATE INDEX IF NOT EXISTS favorites_user_idx ON favorites (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_user_idx ON reviews (reviewed_user_id, created_at DESC);
