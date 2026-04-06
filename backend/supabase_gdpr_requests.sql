-- GDPR Compliance Requests table for Shopify mandatory webhooks
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS gdpr_requests (
    id BIGSERIAL PRIMARY KEY,
    type TEXT NOT NULL,          -- 'customers/data_request', 'customers/redact', 'shop/redact'
    shop_domain TEXT,
    shop_id TEXT,
    customer_id TEXT,
    customer_email TEXT,
    payload JSONB,
    status TEXT DEFAULT 'received',  -- 'received', 'processing', 'completed'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_gdpr_requests_shop ON gdpr_requests(shop_domain);
CREATE INDEX IF NOT EXISTS idx_gdpr_requests_type ON gdpr_requests(type);
