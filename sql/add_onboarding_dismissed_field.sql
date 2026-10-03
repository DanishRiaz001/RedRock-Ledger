-- ============================================================================
-- Fixes a real bug: the "welcome, let's set up your company" onboarding
-- screen could resurface for an already-established company. Two compounding
-- causes:
--   1. Dismissal was stored only in that ONE browser's localStorage, never in
--      the database — so a granted employee/accountant opening the company
--      on their own device had no record it was ever dismissed.
--   2. The trigger condition was purely `transactions.length === 0`, with no
--      check for whether the company was already set up — so deleting a
--      company's only/last remaining transaction (e.g. during a data
--      cleanup) made it look "brand new" again.
--
-- This adds a durable, per-company, database-backed dismissal flag so
-- dismissing it once (from any device) is permanent everywhere.
--
-- Existing companies are backfilled to TRUE (already established, should
-- never see onboarding again) — only genuinely new companies going forward
-- get the column's default of FALSE.
--
-- Run once in the Supabase SQL Editor.
-- ============================================================================

alter table company_profile add column if not exists onboarding_dismissed boolean not null default false;

-- Backfill: every row that already exists as of running this migration is,
-- by definition, an already-established company.
update company_profile set onboarding_dismissed = true where onboarding_dismissed = false;

comment on column company_profile.onboarding_dismissed is
  'True once this company has dismissed/completed the first-run onboarding wizard, from any device. Replaces the old per-browser localStorage flag (rr_onboarding_done_<companyId>), which caused onboarding to incorrectly resurface for other devices/users or after transactions.length briefly hit 0. See FinanceTracker.jsx onboardingDismissed/dismissOnboarding.';
