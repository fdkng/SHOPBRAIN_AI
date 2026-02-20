-- Stock Alert Settings table
-- Stores user's preferred stock alert threshold (in inventory units)
-- Persists across sessions / page refreshes

CREATE TABLE IF NOT EXISTS stock_alert_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  threshold_units INTEGER NOT NULL DEFAULT 15,
  enabled BOOLEAN NOT NULL DEFAULT true,
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
