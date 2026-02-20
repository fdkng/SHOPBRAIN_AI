-- Stock Alert Settings table
-- Stores user's preferred stock alert threshold (in inventory units)
-- Persists across sessions / page refreshes

CREATE TABLE IF NOT EXISTS stock_alert_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  threshold_units INTEGER NOT NULL DEFAULT 15,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_stock_alert_settings_user_id ON stock_alert_settings(user_id);

-- Enable RLS
ALTER TABLE stock_alert_settings ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see/edit their own settings
CREATE POLICY "Users can manage their own stock alert settings"
  ON stock_alert_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow service role full access (backend uses service key)
CREATE POLICY "Service role full access on stock_alert_settings"
  ON stock_alert_settings FOR ALL
  USING (true)
  WITH CHECK (true);


-- Stock Alert Log table
-- Tracks which alerts have been sent to avoid spamming the same product
-- A row = one alert email was sent for this product at this time

CREATE TABLE IF NOT EXISTS stock_alert_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  product_title TEXT,
  inventory_at_alert INTEGER NOT NULL DEFAULT 0,
  threshold_at_alert INTEGER NOT NULL DEFAULT 15,
  email_sent BOOLEAN NOT NULL DEFAULT false,
  dismissed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_alert_log_user ON stock_alert_log(user_id, product_id);
CREATE INDEX IF NOT EXISTS idx_stock_alert_log_created ON stock_alert_log(created_at);

ALTER TABLE stock_alert_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own stock alert logs"
  ON stock_alert_log FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access on stock_alert_log"
  ON stock_alert_log FOR ALL
  USING (true)
  WITH CHECK (true);
