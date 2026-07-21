CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN CREATE TYPE user_role AS ENUM ('customer', 'admin', 'support'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE payment_status AS ENUM ('pending', 'verified', 'failed', 'refunded'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE subscription_status AS ENUM ('pending', 'active', 'suspended', 'expired', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 120),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'customer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mobile TEXT NOT NULL,
  service_address TEXT NOT NULL,
  router_username TEXT UNIQUE,
  router_secret_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  speed_mbps INTEGER NOT NULL CHECK (speed_mbps > 0),
  price_paise INTEGER NOT NULL CHECK (price_paise > 0),
  duration_days INTEGER NOT NULL DEFAULT 30 CHECK (duration_days BETWEEN 1 AND 365),
  active BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO plans (slug, name, speed_mbps, price_paise, duration_days) VALUES
  ('starter-20', 'Starter 20', 20, 42373, 30),
  ('family-50', 'Family 50', 50, 52542, 30),
  ('power-100', 'Power 100', 100, 84745, 30)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, speed_mbps = EXCLUDED.speed_mbps, price_paise = EXCLUDED.price_paise, duration_days = EXCLUDED.duration_days;

UPDATE plans SET active = false WHERE slug IN ('essential', 'momentum', 'velocity');

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  plan_id UUID NOT NULL REFERENCES plans(id),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  provider TEXT NOT NULL DEFAULT 'razorpay',
  provider_order_id TEXT UNIQUE,
  provider_payment_id TEXT UNIQUE,
  status payment_status NOT NULL DEFAULT 'pending',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  plan_id UUID NOT NULL REFERENCES plans(id),
  payment_id UUID UNIQUE REFERENCES payments(id),
  status subscription_status NOT NULL DEFAULT 'pending',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  provision_status TEXT NOT NULL DEFAULT 'pending',
  provisioned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id),
  payment_id UUID NOT NULL UNIQUE REFERENCES payments(id),
  file_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

CREATE INDEX IF NOT EXISTS payments_user_created_idx ON payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS subscriptions_user_status_idx ON subscriptions (user_id, status, ends_at DESC);
