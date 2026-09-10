-- ============================================================================
-- VAT split
--
-- When companyProfile.split_vat is ON, every posting with a plain
-- VAT-inclusive code (1/11/12/13 input, 3/31/32/33 output) is written as TWO
-- rows sharing one bilag: the NET amount on the expense/income account, and
-- the VAT amount on its 27xx settlement account (2700/2710/... — per code).
--
--   split_vat (on company_profile) — the per-company switch, default OFF.
--   vat_split (on transactions)    — marks the NET P&L row of a split entry,
--     AND the 27xx VAT leg, so reports know `amount` is already net and don't
--     subtract the VAT again. Historical (pre-flag) rows stay false = gross.
-- ============================================================================

alter table company_profile add column if not exists split_vat boolean not null default false;

alter table transactions add column if not exists vat_split boolean not null default false;

-- PostgREST schema cache
notify pgrst, 'reload schema';
