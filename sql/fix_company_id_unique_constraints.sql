-- Fix: multi-company upserts fail silently.
--
-- add_multi_company.sql added a nullable company_id column to every scoped
-- table, but never added the composite unique constraints that go with it.
-- The app's upsert calls target onConflict:"user_id,company_id,<cols>"
-- whenever a company is active (see appshell.jsx), but Postgres has no
-- unique/exclusion constraint matching that column list, so every one of
-- those upserts fails with 42P10 ("no unique or exclusion constraint
-- matching the ON CONFLICT specification").
--
-- Symptom this explains: clicking "+ Add 1363" on the Chart of Accounts
-- screen updates the on-screen list immediately (optimistic local state),
-- looks like it worked, but the insert never reaches the database — so on
-- the next reload the account is gone again and the code reappears in the
-- "missing from your chart of accounts" banner. Same underlying bug also
-- silently breaks saving company_profile, budgets, reconciliation_status,
-- and txn_attachments for any account with multi-company enabled.
--
-- Each block below checks the target table actually has a company_id
-- column before touching it, and RAISEs a NOTICE (not an error) naming any
-- table that's missing it — that means sql/add_multi_company.sql hasn't
-- fully run there yet, and needs to be (re)run first before this script's
-- constraint for that table will apply. Safe to run multiple times.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='company_id') THEN
    RAISE NOTICE 'Skipping accounts: company_id column missing — run add_multi_company.sql first.';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_user_company_code_key') THEN
    ALTER TABLE accounts ADD CONSTRAINT accounts_user_company_code_key UNIQUE (user_id, company_id, code);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_profile' AND column_name='company_id') THEN
    RAISE NOTICE 'Skipping company_profile: company_id column missing — run add_multi_company.sql first.';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_profile_user_company_key') THEN
    ALTER TABLE company_profile ADD CONSTRAINT company_profile_user_company_key UNIQUE (user_id, company_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reconciliation_status' AND column_name='company_id') THEN
    RAISE NOTICE 'Skipping reconciliation_status: company_id column missing — run add_multi_company.sql first.';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reconciliation_status_user_company_account_period_key') THEN
    ALTER TABLE reconciliation_status ADD CONSTRAINT reconciliation_status_user_company_account_period_key UNIQUE (user_id, company_id, account_code, period);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='budgets' AND column_name='company_id') THEN
    RAISE NOTICE 'Skipping budgets: company_id column missing — run add_multi_company.sql first.';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budgets_user_company_year_month_code_key') THEN
    ALTER TABLE budgets ADD CONSTRAINT budgets_user_company_year_month_code_key UNIQUE (user_id, company_id, year, month, code);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='txn_attachments' AND column_name='company_id') THEN
    RAISE NOTICE 'Skipping txn_attachments: company_id column missing — run add_multi_company.sql first.';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'txn_attachments_user_company_txn_file_key') THEN
    ALTER TABLE txn_attachments ADD CONSTRAINT txn_attachments_user_company_txn_file_key UNIQUE (user_id, company_id, txn_id, file_id);
  END IF;
END $$;
