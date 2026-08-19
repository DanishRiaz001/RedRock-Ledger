-- Move the feature-flag/package system out of localStorage (per-browser,
-- fragile) into the database (per-account, consistent everywhere).

-- Global admin toggles — a single row holds every feature's global on/off
-- state, matching what used to live at localStorage key "rr_admin_features".
CREATE TABLE IF NOT EXISTS app_settings (
  id int PRIMARY KEY DEFAULT 1,
  admin_features jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_singleton CHECK (id = 1)
);
INSERT INTO app_settings (id, admin_features) VALUES (1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING;

-- Per-user overrides + package tier — matching what used to live at
-- localStorage key "rr_user_features" (per-user object) and
-- "rr_user_packages". Living on profiles keeps this alongside is_active/
-- is_admin, which already govern access the same way.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='feature_overrides') THEN
    ALTER TABLE profiles ADD COLUMN feature_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='package_tier') THEN
    ALTER TABLE profiles ADD COLUMN package_tier text;
  END IF;
END $$;
