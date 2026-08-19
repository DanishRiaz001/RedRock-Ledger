-- Fix: every account save fails with PGRST204 "Could not find the
-- 'currency' column of 'accounts' in the schema cache".
--
-- appshell.jsx's setAccounts() (the single save path used by every entry
-- point — new account, "+Add <orphan code>", edit, import) has always sent
-- a `currency` field on every row, and reports.jsx's account editor and
-- balance display both read/write account.currency as a real per-account
-- feature (e.g. holding a USD account alongside PKR ones). The column
-- itself was never actually added to the accounts table, so PostgREST
-- rejects the whole upsert before it reaches RLS or the ON CONFLICT check
-- — meaning EVERY account save fails, not just newly-added orphan codes.
-- That's why "+ Add 1363" appears to work (optimistic local state) but the
-- code is gone again after a reload.

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS currency text DEFAULT 'PKR';

-- Same upsert-payload-vs-schema gap exists on company_profile (see
-- appshell.jsx saveCompanyProfile, which also always sends `currency` and
-- `language`). No migration file ever added these two, unlike
-- track_projects/country which each got their own migration — so if they
-- were never added directly in the Supabase dashboard either, company
-- settings saves would fail the exact same way. Guarded no-ops if already present.
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS currency text DEFAULT 'PKR';
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS language text DEFAULT 'English';
