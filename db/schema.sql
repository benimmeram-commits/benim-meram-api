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
CREATE INDEX IF NOT EXISTS otp_codes_phone_idx ON otp_codes (phone_number, created_at DESC);

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
CREATE INDEX IF NOT EXISTS listings_feed_idx     ON listings (status, created_at DESC);
CREATE INDEX IF NOT EXISTS listings_category_idx ON listings (status, main_category, created_at DESC);
CREATE INDEX IF NOT EXISTS listings_region_idx   ON listings (status, seller_region, created_at DESC);
CREATE INDEX IF NOT EXISTS listings_city_idx     ON listings (status, seller_city);
CREATE INDEX IF NOT EXISTS listings_seller_idx   ON listings (seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS listings_geo_idx      ON listings (lat, lng);

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
CREATE INDEX IF NOT EXISTS buy_requests_open_idx ON buy_requests (status, created_at DESC);

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
CREATE INDEX IF NOT EXISTS offers_listing_idx ON offers (listing_id, created_at DESC);

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
CREATE INDEX IF NOT EXISTS payments_user_idx ON payments (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at  timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON subscriptions (user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS pricing_settings (
  id                 integer PRIMARY KEY CHECK (id = 1),
  subscription_price numeric(12,2) NOT NULL DEFAULT 1000,
  per_listing_price  numeric(12,2) NOT NULL DEFAULT 75,
  commission_rate    numeric(5,4)  NOT NULL DEFAULT 0
);
INSERT INTO pricing_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ---------- Mesajlaşma ----------
CREATE TABLE IF NOT EXISTS conversations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES listings(id) ON DELETE SET NULL,
  buyer_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversations_buyer_idx  ON conversations (buyer_id);
CREATE INDEX IF NOT EXISTS conversations_seller_idx ON conversations (seller_id);

CREATE TABLE IF NOT EXISTS messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conv_idx ON messages (conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS region_chat_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region     text NOT NULL,
  sender_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS region_chat_idx ON region_chat_messages (region, created_at DESC);

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
CREATE INDEX IF NOT EXISTS favorites_user_idx ON favorites (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reviews (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewed_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id       uuid REFERENCES listings(id) ON DELETE SET NULL,
  stars            integer NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment          text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reviews_user_idx ON reviews (reviewed_user_id, created_at DESC);

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
