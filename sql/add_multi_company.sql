-- Multi-company support: one login can own several separate companies
-- ("test companies" or real client books), switchable in-app, fully
-- isolated from each other.

-- 1. The companies table itself.
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'My Company',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Add company_id to every table that currently scopes only by user_id.
-- Nullable at first so existing rows aren't broken before backfill runs.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'accounts','attachments','audit_log','bank_statement_lines','budgets',
    'client_access','company_profile','contacts','employees','entry_comments',
    'inbox_files','invoices','money_sources','payroll_lines','payroll_runs',
    'pos_products','projects','quotes','reconciliation_files',
    'reconciliation_status','recurring_invoices','sinking_funds',
    'transactions','txn_attachments','usage_events'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = t AND column_name = 'company_id'
      ) THEN
        EXECUTE format('ALTER TABLE %I ADD COLUMN company_id uuid REFERENCES companies(id) ON DELETE CASCADE', t);
      END IF;
    END IF;
  END LOOP;
END $$;

-- 3. For every existing user with data but no company yet, create one
-- "Default Company" and backfill every one of their existing rows onto it.
-- This is what makes the migration safe to run on a live account without
-- anyone losing access to their current books.
DO $$
DECLARE
  u uuid;
  new_company_id uuid;
  t text;
  tables text[] := ARRAY[
    'accounts','attachments','audit_log','bank_statement_lines','budgets',
    'client_access','company_profile','contacts','employees','entry_comments',
    'inbox_files','invoices','money_sources','payroll_lines','payroll_runs',
    'pos_products','projects','quotes','reconciliation_files',
    'reconciliation_status','recurring_invoices','sinking_funds',
    'transactions','txn_attachments','usage_events'
  ];
BEGIN
  FOR u IN SELECT DISTINCT user_id FROM transactions WHERE user_id IS NOT NULL LOOP
    IF NOT EXISTS (SELECT 1 FROM companies WHERE owner_user_id = u) THEN
      INSERT INTO companies (owner_user_id, name) VALUES (u, 'Default Company') RETURNING id INTO new_company_id;
      FOREACH t IN ARRAY tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
          EXECUTE format('UPDATE %I SET company_id = $1 WHERE user_id = $2 AND company_id IS NULL', t)
            USING new_company_id, u;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- 4. RLS stays disabled per the existing app pattern (access controlled by
-- application-level filtering, not database policies) — this migration
-- only adds the column and backfills it, matching how every other table
-- in this app already works.
