-- Financials table for ShopBrain AI
CREATE TABLE IF NOT EXISTS financial_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_domain TEXT,
  entry_type TEXT NOT NULL, -- 'revenue', 'expense', 'other'
  category TEXT, -- 'marketing', 'software', 'shipping', 'other'
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'USD',
  description TEXT,
  date DATE DEFAULT CURRENT_DATE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_entries_user_id ON financial_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_financial_entries_type ON financial_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_financial_entries_date ON financial_entries(date);

ALTER TABLE financial_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only view their own financial entries"
  ON financial_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert their own financial entries"
  ON financial_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only update their own financial entries"
  ON financial_entries FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can only delete their own financial entries"
  ON financial_entries FOR DELETE
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS tracked_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_domain TEXT,
  shopify_product_id TEXT NOT NULL,
  title TEXT,
  image_url TEXT,
  tracked_since TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, shop_domain, shopify_product_id)
);

CREATE INDEX IF NOT EXISTS idx_tracked_products_user_id ON tracked_products(user_id);

ALTER TABLE tracked_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only view their own tracked products"
  ON tracked_products FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert their own tracked products"
  ON tracked_products FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only delete their own tracked products"
  ON tracked_products FOR DELETE
  USING (auth.uid() = user_id);
