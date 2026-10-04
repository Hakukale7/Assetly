-- =========================================================================
-- ASSETLY SCHEMA — v1.0.0
-- Idempotent. Safe to run on every boot, on fresh or existing databases.
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------- COMPANIES ----------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  tag_prefix TEXT NOT NULL,
  parent_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- USERS --------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  google_id TEXT UNIQUE,
  picture TEXT,
  last_login TIMESTAMPTZ,
  avatar BYTEA,
  avatar_mime TEXT,
  avatar_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- ASSETS -------------------------------------------------------
CREATE TABLE IF NOT EXISTS assets (
  id SERIAL PRIMARY KEY,
  tag TEXT NOT NULL UNIQUE,
  serial TEXT,
  name TEXT NOT NULL,
  category TEXT,
  status TEXT DEFAULT 'In Stock',
  condition TEXT,
  manufacturer TEXT,
  model TEXT,
  assigned_to TEXT,
  email TEXT,
  department TEXT,
  location TEXT,
  supplier TEXT,
  purchase_date DATE,
  purchase_cost NUMERIC(12,2) DEFAULT 0,
  warranty_end DATE,
  notes TEXT,
  useful_life_years INTEGER DEFAULT 5,
  salvage_value NUMERIC(12,2) DEFAULT 0,
  depreciation_method TEXT DEFAULT 'straight_line',
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- MAINTENANCE --------------------------------------------------
CREATE TABLE IF NOT EXISTS maintenance (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  type TEXT,
  vendor TEXT,
  cost NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'Open',
  notes TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- HISTORY (append-only) ---------------------------------------
CREATE TABLE IF NOT EXISTS history (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER REFERENCES assets(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type TEXT,
  message TEXT,
  field TEXT,
  old_value TEXT,
  new_value TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- PERMISSIONS --------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  role TEXT NOT NULL,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE(role, resource, action, company_id)
);

-- ---------- API KEYS -----------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  last_used TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- WEBHOOKS -----------------------------------------------------
CREATE TABLE IF NOT EXISTS webhooks (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id SERIAL PRIMARY KEY,
  webhook_id INTEGER NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload JSONB NOT NULL,
  status_code INTEGER,
  response_body TEXT,
  attempts INTEGER DEFAULT 0,
  succeeded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- PASSWORD RESETS ---------------------------------------------
CREATE TABLE IF NOT EXISTS password_resets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- APP SETTINGS ------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO app_settings (key, value) VALUES
  ('session', '{"timeout_minutes": 60, "idle_warning_minutes": 5, "max_lifetime_hours": 24}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------- ASSIGNMENTS -------------------------------------------------
CREATE TABLE IF NOT EXISTS assignments (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  user_email TEXT,
  department TEXT,
  location TEXT,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  returned_at TIMESTAMPTZ,
  assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT
);

-- ---------- RESERVATIONS ------------------------------------------------
CREATE TABLE IF NOT EXISTS reservations (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  user_email TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at   TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'Reserved',
  purpose TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- SAVED FILTERS -----------------------------------------------
CREATE TABLE IF NOT EXISTS saved_filters (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'assets',
  query JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- ATTACHMENTS -------------------------------------------------
CREATE TABLE IF NOT EXISTS attachments (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data BYTEA NOT NULL,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- ALERT RULES -------------------------------------------------
CREATE TABLE IF NOT EXISTS alert_rules (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  threshold_days INTEGER DEFAULT 30,
  recipients TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- AUDIT SESSIONS ----------------------------------------------
CREATE TABLE IF NOT EXISTS audit_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  scanned_count INTEGER DEFAULT 0,
  found_count INTEGER DEFAULT 0,
  notes TEXT
);

-- ---------- MASTER DATA (vendors, categories, locations) ----------------
CREATE TABLE IF NOT EXISTS master_data (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('vendor','category','location')),
  value TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- MIGRATIONS FOR EXISTING DATABASES
-- =========================================================================

ALTER TABLE users       ADD COLUMN IF NOT EXISTS google_id    TEXT;
ALTER TABLE users       ADD COLUMN IF NOT EXISTS picture      TEXT;
ALTER TABLE users       ADD COLUMN IF NOT EXISTS last_login   TIMESTAMPTZ;
ALTER TABLE users       ADD COLUMN IF NOT EXISTS avatar       BYTEA;
ALTER TABLE users       ADD COLUMN IF NOT EXISTS avatar_mime  TEXT;
ALTER TABLE users       ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ;

ALTER TABLE assets      ADD COLUMN IF NOT EXISTS deleted_at            TIMESTAMPTZ;
ALTER TABLE assets      ADD COLUMN IF NOT EXISTS useful_life_years     INTEGER DEFAULT 5;
ALTER TABLE assets      ADD COLUMN IF NOT EXISTS salvage_value         NUMERIC(12,2) DEFAULT 0;
ALTER TABLE assets      ADD COLUMN IF NOT EXISTS depreciation_method   TEXT DEFAULT 'straight_line';

ALTER TABLE maintenance ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ;

ALTER TABLE history     ADD COLUMN IF NOT EXISTS field        TEXT;
ALTER TABLE history     ADD COLUMN IF NOT EXISTS old_value    TEXT;
ALTER TABLE history     ADD COLUMN IF NOT EXISTS new_value    TEXT;
ALTER TABLE history     ADD COLUMN IF NOT EXISTS ip_address   TEXT;
ALTER TABLE history     ADD COLUMN IF NOT EXISTS user_agent   TEXT;

-- =========================================================================
-- INDEXES
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_assets_company      ON assets(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_status       ON assets(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_warranty     ON assets(warranty_end) WHERE warranty_end IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assets_tag          ON assets(tag);
CREATE INDEX IF NOT EXISTS idx_assets_serial_trgm  ON assets USING gin (serial gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_history_asset       ON history(asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_maint_asset         ON maintenance(asset_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_apikeys_hash        ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries  ON webhook_deliveries(webhook_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignments_asset   ON assignments(asset_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_asset  ON reservations(asset_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_saved_filters_user  ON saved_filters(user_id, scope);
CREATE INDEX IF NOT EXISTS idx_attachments_asset   ON attachments(asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_sessions_user ON audit_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_master_data_company_type ON master_data(company_id, type) WHERE active = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_master_data_unique ON master_data(company_id, type, LOWER(value));

-- =========================================================================
-- APPEND-ONLY HISTORY TRIGGER
-- =========================================================================

CREATE OR REPLACE FUNCTION prevent_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'history is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS history_no_update ON history;
CREATE TRIGGER history_no_update
  BEFORE UPDATE OR DELETE ON history
  FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();

-- =========================================================================
-- DEFAULT PERMISSIONS
-- =========================================================================

INSERT INTO permissions (role, resource, action) VALUES
  ('company_admin', 'asset',       'read'),
  ('company_admin', 'asset',       'write'),
  ('company_admin', 'asset',       'delete'),
  ('company_admin', 'user',        'read'),
  ('company_admin', 'user',        'write'),
  ('company_admin', 'maintenance', 'read'),
  ('company_admin', 'maintenance', 'write'),
  ('company_admin', 'webhook',     'read'),
  ('company_admin', 'webhook',     'write'),
  ('user',          'asset',       'read'),
  ('user',          'asset',       'write'),
  ('user',          'maintenance', 'read'),
  ('user',          'maintenance', 'write')
ON CONFLICT DO NOTHING;

-- =========================================================================
-- SEED DEFAULT MASTER DATA FOR EXISTING COMPANIES
-- =========================================================================

INSERT INTO master_data (company_id, type, value)
SELECT c.id, 'category', v.value
FROM companies c
CROSS JOIN (VALUES
  ('Laptop'), ('Desktop'), ('Monitor'), ('Server'), ('Network'),
  ('Mobile'), ('Peripheral'), ('Software License'), ('Furniture'), ('Other')
) AS v(value)
ON CONFLICT DO NOTHING;

INSERT INTO master_data (company_id, type, value)
SELECT c.id, 'location', v.value
FROM companies c
CROSS JOIN (VALUES
  ('HQ - Floor 1'), ('HQ - Floor 2'), ('HQ - Floor 3'),
  ('Data Center'), ('Warehouse'), ('Remote')
) AS v(value)
ON CONFLICT DO NOTHING;
