-- ============================================================================
-- VAT split
--
-- A VAT-inclusive posting with a plain code (1/11/12/13 input, 3/31/32/33
-- output) is written as TWO rows sharing one bilag: the NET amount on the
-- expense/income account, and the VAT on its 27xx settlement account
-- (2700/2710/... — per code). This is the normal way Norwegian VAT-registered
-- books are kept, so it is ON by default; the switch only exists so it can be
-- turned off for a set of books that deliberately posts gross.
--
--   split_vat (on company_profile) — the per-company switch, default TRUE.
--   vat_split (on transactions)    — marks the NET P&L row of a split entry,
--     AND the 27xx VAT leg, so reports know `amount` is already net and don't
--     subtract the VAT again. Historical (pre-flag) rows stay false = gross.
-- ============================================================================

alter table company_profile add column if not exists split_vat boolean not null default true;
-- turn it on for every existing company (new entries only — historical rows
-- keep whatever they were; a separate backfill can split the old ones).
alter table company_profile alter column split_vat set default true;
update company_profile set split_vat = true where split_vat is distinct from true;

alter table transactions add column if not exists vat_split boolean not null default false;

-- PostgREST schema cache
notify pgrst, 'reload schema';
