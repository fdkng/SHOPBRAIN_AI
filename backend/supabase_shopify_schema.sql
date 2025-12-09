-- Table pour stocker les connexions Shopify des utilisateurs
CREATE TABLE IF NOT EXISTS shopify_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    shop_domain TEXT NOT NULL,
    access_token TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Index pour recherches rapides par user_id
CREATE INDEX IF NOT EXISTS idx_shopify_connections_user_id ON shopify_connections(user_id);

-- Table pour stocker les analyses de produits
CREATE TABLE IF NOT EXISTS product_analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    shopify_product_id TEXT NOT NULL,
    original_title TEXT,
    original_description TEXT,
    analysis_result JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour recherches rapides
CREATE INDEX IF NOT EXISTS idx_product_analyses_user_id ON product_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_product_analyses_shopify_product_id ON product_analyses(shopify_product_id);

-- Politique RLS (Row Level Security) pour shopify_connections
ALTER TABLE shopify_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own Shopify connections"
ON shopify_connections FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Shopify connections"
ON shopify_connections FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Shopify connections"
ON shopify_connections FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Shopify connections"
ON shopify_connections FOR DELETE
USING (auth.uid() = user_id);

-- Politique RLS pour product_analyses
ALTER TABLE product_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own product analyses"
ON product_analyses FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own product analyses"
ON product_analyses FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own product analyses"
ON product_analyses FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own product analyses"
ON product_analyses FOR DELETE
USING (auth.uid() = user_id);

-- Fonction pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour shopify_connections
CREATE TRIGGER update_shopify_connections_updated_at
BEFORE UPDATE ON shopify_connections
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger pour product_analyses
CREATE TRIGGER update_product_analyses_updated_at
BEFORE UPDATE ON product_analyses
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
