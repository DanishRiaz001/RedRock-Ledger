-- ============================================================================
-- Multi-country support — adds a `country` column to company_profile.
-- Run once in the Supabase SQL Editor.
-- ============================================================================

alter table company_profile add column if not exists country text not null default 'PK';

-- Sanity constraint — only these two values are meaningful right now.
alter table company_profile drop constraint if exists company_profile_country_check;
alter table company_profile add constraint company_profile_country_check
  check (country in ('PK','NO'));

comment on column company_profile.country is
  'PK = Pakistan (VAT/MVA features hidden), NO = Norway (VAT/MVA fully enabled). Drives feature gating in the app — see feat.vat in FinanceTracker.jsx.';
