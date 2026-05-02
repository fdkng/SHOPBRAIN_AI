CREATE TABLE IF NOT EXISTS client_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  display_name TEXT,
  external_account_id TEXT NOT NULL,
  external_account_name TEXT,
  status TEXT DEFAULT 'pending',
  connection_mode TEXT DEFAULT 'manual',
  api_version TEXT,
  is_primary BOOLEAN DEFAULT TRUE,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  config JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider, external_account_id)
);

CREATE INDEX IF NOT EXISTS idx_client_integrations_user_id ON client_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_client_integrations_provider ON client_integrations(provider);
CREATE INDEX IF NOT EXISTS idx_client_integrations_user_provider ON client_integrations(user_id, provider);

ALTER TABLE client_integrations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_client_integrations_updated_at ON client_integrations;
CREATE TRIGGER update_client_integrations_updated_at
BEFORE UPDATE ON client_integrations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'client_integrations' AND policyname = 'Users can view their own client integrations'
  ) THEN
    CREATE POLICY "Users can view their own client integrations"
      ON client_integrations FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'client_integrations' AND policyname = 'Users can insert their own client integrations'
  ) THEN
    CREATE POLICY "Users can insert their own client integrations"
      ON client_integrations FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'client_integrations' AND policyname = 'Users can update their own client integrations'
  ) THEN
    CREATE POLICY "Users can update their own client integrations"
      ON client_integrations FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'client_integrations' AND policyname = 'Users can delete their own client integrations'
  ) THEN
    CREATE POLICY "Users can delete their own client integrations"
      ON client_integrations FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;