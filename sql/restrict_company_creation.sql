-- ============================================================================
-- Restrict who can create a new company row — server-side enforcement to
-- go with the client-side change (FinanceTracker.jsx: "Add a company" is
-- now hidden from everyone except one hardcoded super-admin email).
--
-- IMPORTANT: hiding a button in the UI is not real security by itself —
-- anyone with the project's anon key (visible in the browser network tab)
-- can call the Supabase REST API directly and insert a row, bypassing the
-- UI entirely. No RLS policy restricting INSERT on `companies` existed
-- before this file — meaning any signed-in user could already create a
-- company by calling the API directly, regardless of what the UI shows.
-- This closes that gap.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

alter table companies enable row level security;

-- Read: unchanged from whatever already governs company visibility
-- elsewhere (client_access grants, ownership) — this file only tightens
-- INSERT. If companies has no read policy yet, add one matching your
-- existing rr_can_read/rr_can_read_company pattern before relying on this.

drop policy if exists companies_insert_superadmin_only on companies;
create policy companies_insert_superadmin_only on companies for insert
  with check (
    -- auth.jwt()->>'email' reads the email claim straight off the
    -- caller's JWT — no join needed. Add more emails here (or switch to
    -- a real "platform_admins" table) if more than one person should be
    -- able to create companies.
    (auth.jwt()->>'email') = 'danishriaz001@gmail.com'
  );

-- update/delete on companies are left alone here — this file is only
-- about who can CREATE a new one. Tighten those too if the same
-- self-serve concern applies to renaming/deleting companies.
