-- ========================================
-- ShopBrain Subscription Management Schema
-- ========================================

-- Table des abonnements utilisateurs
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('standard', 'pro', 'premium')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due')),
  stripe_session_id TEXT UNIQUE,
  stripe_customer_id TEXT UNIQUE,
  payment_intent_id TEXT UNIQUE,
  amount_paid BIGINT, -- en cents
  currency TEXT DEFAULT 'usd',
  started_at TIMESTAMP DEFAULT NOW(),
  ends_at TIMESTAMP,
  auto_renew BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX (user_id),
  INDEX (status),
  INDEX (plan)
);

-- Table des profils utilisateurs
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  subscription_tier TEXT DEFAULT 'free',
  shopify_shop_url TEXT,
  shopify_access_token TEXT ENCRYPTED, -- Supabase Vault
  openai_api_key TEXT ENCRYPTED, -- Supabase Vault
  products_analyzed INT DEFAULT 0,
  reports_generated INT DEFAULT 0,
  last_ai_run TIMESTAMP,
  preferences JSONB DEFAULT '{"language": "fr", "timezone": "UTC"}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX (email),
  INDEX (subscription_tier)
);

-- Table des analyses de produits
CREATE TABLE IF NOT EXISTS product_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shopify_product_id TEXT,
  original_title TEXT,
  original_description TEXT,
  analysis_result JSONB,
  optimized_title TEXT,
  optimized_description TEXT,
  price_recommendation JSONB,
  cross_sell JSONB,
  upsell JSONB,
  status TEXT DEFAULT 'pending', -- pending, completed, applied
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX (user_id),
  INDEX (status),
  INDEX (shopify_product_id)
);

-- Table des rapports générés
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL, -- weekly, daily, monthly
  period_start DATE,
  period_end DATE,
  content JSONB,
  pdf_url TEXT,
  email_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX (user_id),
  INDEX (report_type),
  INDEX (created_at)
);

-- Table des actions automatiques (Premium)
CREATE TABLE IF NOT EXISTS automated_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shopify_product_id TEXT,
  action_type TEXT NOT NULL, -- price, content, image, inventory
  old_value JSONB,
  new_value JSONB,
  status TEXT DEFAULT 'pending', -- pending, executed, failed, rolled_back
  error_message TEXT,
  executed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX (user_id),
  INDEX (status),
  INDEX (shopify_product_id)
);

-- Table des événements Stripe webhook
CREATE TABLE IF NOT EXISTS stripe_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  user_id UUID,
  data JSONB,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  
  INDEX (stripe_event_id),
  INDEX (event_type),
  INDEX (processed)
);

-- Triggers pour mise à jour automatique
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_subscriptions_updated_at
BEFORE UPDATE ON user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at
BEFORE UPDATE ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_analyses_updated_at
BEFORE UPDATE ON product_analyses
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS)
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE automated_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;

-- Policies - Les utilisateurs ne voient que leurs propres données
CREATE POLICY "user_subscriptions_self" ON user_subscriptions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "user_profiles_self" ON user_profiles
  FOR ALL USING (auth.uid() = id);

CREATE POLICY "product_analyses_self" ON product_analyses
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "reports_self" ON reports
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "automated_actions_self" ON automated_actions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "stripe_events_self" ON stripe_events
  FOR ALL USING (auth.uid() = user_id OR user_id IS NULL);
