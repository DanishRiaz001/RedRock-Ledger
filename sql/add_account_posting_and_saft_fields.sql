-- Adds the fields needed to bring Chart of Accounts up to the Tripletex
-- "Kontoplan" layout: a "show at posting" toggle and the two SAF-T
-- reference code columns (v1.3 / v1.2). These are free-text/boolean only —
-- no official SAF-T code values are pre-filled by the app, since incorrect
-- SAF-T mappings could cause real compliance problems; the accountant
-- enters their own values per account when they choose to.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS show_at_posting boolean DEFAULT true;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS saft_code_13 text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS saft_code_12 text;

-- Separate, pre-existing bug found while adding the above: the account
-- edit modal has always had "Internal category" and "Depreciation code"
-- fields, but appshell.jsx's account save/load code never included
-- custom_category or depreciation_code in its Supabase payload or its
-- fetch mapping — so anything typed into those two fields was silently
-- discarded on every reload, regardless of whether these columns existed.
-- Add them now since the code fix (this same commit) starts using them.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS custom_category text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS depreciation_code text;
