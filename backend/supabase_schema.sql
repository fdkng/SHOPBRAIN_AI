-- Supabase schema for ShopBrain AI (idempotent)
-- You can safely run this script multiple times.

-- Users table (created by Supabase Auth automatically, but we extend it)
-- (Supabase auth.users table is auto-created; we don't need to create it)

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  original_description TEXT NOT NULL,
  optimized_title TEXT,
  optimized_description TEXT,
  cross_sell JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  stripe_session_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  plan_tier TEXT, -- '99', '199', or '299'
  status TEXT DEFAULT 'active', -- 'active', 'cancelled', 'expired'
  trial_ends_at TIMESTAMP,
  current_period_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Products policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'Users can only view their own products'
  ) THEN
    CREATE POLICY "Users can only view their own products"
      ON products FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'Users can only insert their own products'
  ) THEN
    CREATE POLICY "Users can only insert their own products"
      ON products FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'Users can only update their own products'
  ) THEN
    CREATE POLICY "Users can only update their own products"
      ON products FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'Users can only delete their own products'
  ) THEN
    CREATE POLICY "Users can only delete their own products"
      ON products FOR DELETE
      USING (auth.uid() = user_id);
  END IF;

  -- Subscriptions policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscriptions' AND policyname = 'Users can only view their own subscriptions'
  ) THEN
    CREATE POLICY "Users can only view their own subscriptions"
      ON subscriptions FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscriptions' AND policyname = 'Users can only insert their own subscriptions'
  ) THEN
    CREATE POLICY "Users can only insert their own subscriptions"
      ON subscriptions FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscriptions' AND policyname = 'Users can only update their own subscriptions'
  ) THEN
    CREATE POLICY "Users can only update their own subscriptions"
      ON subscriptions FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
END
$$;
