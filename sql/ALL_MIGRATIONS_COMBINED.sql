-- ============================================================================
-- RedRock Ledger — Complete Supabase migration (run once, top to bottom)
-- ============================================================================
-- All 5 SQL files combined in the correct order. Fixed in this version:
--   client_access, access_requests, and entry_comments tables are now
--   created here (CREATE TABLE IF NOT EXISTS) instead of assumed to already
--   exist — matches your project notes flagging client_access_requests.sql
--   and entry_comments.sql as pending migrations from before this session.
-- Safe to re-run — every statement uses IF NOT EXISTS / DROP...IF EXISTS / OR REPLACE.
-- ============================================================================

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

-- ============================================================================
-- ============================================================================
-- Multi-tenant Row Level Security for RedRock Ledger
-- ============================================================================
-- WHY THIS MATTERS: The app's client-switcher UI (grant/revoke access,
-- access levels, the "readonly"/"reports"/"entries"/"full" banner) is real
-- and working — but it's enforced entirely in the React code. Without RLS,
-- anyone with your Supabase anon key (visible in the browser's network tab
-- on any page load) could call the Supabase REST API directly and read or
-- write ANY client's transactions, bypassing the UI completely. RLS moves
-- the enforcement into Postgres itself, so it's true no matter how the
-- database is accessed.
--
-- Run this whole file once in the Supabase SQL Editor. It is safe to re-run
-- (uses DROP POLICY IF EXISTS / CREATE OR REPLACE throughout).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper function: does the current logged-in user have access to this
-- client's books, and at what level? SECURITY DEFINER so it can read
-- client_access even though RLS will also be enabled on that table itself.
-- ----------------------------------------------------------------------------
create or replace function rr_access_level(target_user_id uuid)
returns text
language sql
security definer
stable
as $$
  select case
    -- Own books: always full access
    when target_user_id = auth.uid() then 'full'
    -- Admins (Redrock staff) can see everyone, but only at the level
    -- explicitly granted via client_access — admins don't get an automatic
    -- bypass, since "admin" here means "can manage the platform", not
    -- "can see every client's transactions by default".
    else (
      select access_level from client_access
      where employee_user_id = auth.uid() and client_user_id = target_user_id
      limit 1
    )
  end;
$$;

-- Convenience boolean checks used throughout the policies below.
create or replace function rr_can_read(target_user_id uuid)
returns boolean language sql stable as $$
  select rr_access_level(target_user_id) is not null;
$$;

create or replace function rr_can_write(target_user_id uuid)
returns boolean language sql stable as $$
  select rr_access_level(target_user_id) in ('full','entries');
$$;

create or replace function rr_can_write_settings(target_user_id uuid)
returns boolean language sql stable as $$
  select rr_access_level(target_user_id) = 'full';
$$;

create or replace function rr_is_admin()
returns boolean language sql stable as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
alter table profiles enable row level security;

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  using (id = auth.uid() or rr_is_admin());

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists profiles_admin_update on profiles;
create policy profiles_admin_update on profiles for update
  using (rr_is_admin());

-- ----------------------------------------------------------------------------
-- accounts / contacts — structural chart-of-accounts data.
-- Read: anyone with any access level. Write: 'full' access only (an
-- 'entries' user can post transactions but shouldn't restructure the
-- chart of accounts or edit contact records).
-- ----------------------------------------------------------------------------
alter table accounts enable row level security;

drop policy if exists accounts_select on accounts;
create policy accounts_select on accounts for select
  using (rr_can_read(user_id));

drop policy if exists accounts_write on accounts;
create policy accounts_write on accounts for all
  using (rr_can_write_settings(user_id))
  with check (rr_can_write_settings(user_id));

alter table contacts enable row level security;

drop policy if exists contacts_select on contacts;
create policy contacts_select on contacts for select
  using (rr_can_read(user_id));

drop policy if exists contacts_write on contacts;
create policy contacts_write on contacts for all
  using (rr_can_write_settings(user_id))
  with check (rr_can_write_settings(user_id));

-- ----------------------------------------------------------------------------
-- transactions — the core ledger. Read: any access level. Write: 'full' or
-- 'entries' only ('reports' and 'readonly' are view-only by definition).
-- ----------------------------------------------------------------------------
alter table transactions enable row level security;

drop policy if exists transactions_select on transactions;
create policy transactions_select on transactions for select
  using (rr_can_read(user_id));

drop policy if exists transactions_write on transactions;
create policy transactions_write on transactions for all
  using (rr_can_write(user_id))
  with check (rr_can_write(user_id));

-- ----------------------------------------------------------------------------
-- sinking_funds — treated like transactions: full/entries can write.
-- ----------------------------------------------------------------------------
alter table sinking_funds enable row level security;

drop policy if exists sinking_funds_select on sinking_funds;
create policy sinking_funds_select on sinking_funds for select
  using (rr_can_read(user_id));

drop policy if exists sinking_funds_write on sinking_funds;
create policy sinking_funds_write on sinking_funds for all
  using (rr_can_write(user_id))
  with check (rr_can_write(user_id));

-- ----------------------------------------------------------------------------
-- client_access — the grant table itself. Created here if it doesn't exist
-- yet (confirmed exact schema from the actual app code: appshell.jsx's
-- fetchClientAccessFor/grantClientAccess/revokeClientAccess calls). A client
-- can see who has access to THEIR books (transparency). An employee can see
-- their own grants. Only an admin can create/revoke grants.
-- ----------------------------------------------------------------------------
create table if not exists client_access (
  id uuid primary key default gen_random_uuid(),
  employee_user_id uuid not null,
  client_user_id uuid not null,
  access_level text not null default 'readonly',
  granted_by uuid,
  created_at timestamptz default now(),
  unique(client_user_id, employee_user_id)
);

alter table client_access enable row level security;

drop policy if exists client_access_select on client_access;
create policy client_access_select on client_access for select
  using (
    employee_user_id = auth.uid()
    or client_user_id = auth.uid()
    or rr_is_admin()
  );

drop policy if exists client_access_admin_write on client_access;
create policy client_access_admin_write on client_access for all
  using (rr_is_admin())
  with check (rr_is_admin());

-- ----------------------------------------------------------------------------
-- access_requests — created here if it doesn't exist yet (confirmed exact
-- schema from the actual app code: appshell.jsx's requestRedrockAccess/
-- fetchAccessRequests/dismissAccessRequest/resolveAccessRequestAsGranted
-- calls). A client can create their own request and see its status. Only
-- an admin can list/resolve all pending requests.
-- ----------------------------------------------------------------------------
create table if not exists access_requests (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null,
  note text default '',
  status text not null default 'pending',
  created_at timestamptz default now(),
  resolved_at timestamptz,
  resolved_by uuid
);

alter table access_requests enable row level security;

drop policy if exists access_requests_select on access_requests;
create policy access_requests_select on access_requests for select
  using (client_user_id = auth.uid() or rr_is_admin());

drop policy if exists access_requests_insert on access_requests;
create policy access_requests_insert on access_requests for insert
  with check (client_user_id = auth.uid());

drop policy if exists access_requests_admin_update on access_requests;
create policy access_requests_admin_update on access_requests for update
  using (rr_is_admin());

-- ============================================================================
-- IMPORTANT — tables NOT yet covered here because their schema wasn't
-- visible from the extracted code: invoices, employees, quotes, payroll_runs,
-- pos_products, audit_log, inbox_files, bank_statement_lines, and any others
-- your app writes to. Each of these needs the same pattern (enable RLS +
-- select/write policies keyed to rr_can_read/rr_can_write on their user_id
-- column) before this is complete. Run this once, confirm the tables above
-- work correctly, then we extend it to the rest.
-- ============================================================================

-- ============================================================================
-- ============================================================================
-- Multi-tenant RLS — Part 2: remaining tables
-- ============================================================================
-- Extends the same rr_can_read/rr_can_write/rr_can_write_settings functions
-- from sql/multi_tenant_rls.sql (run that file FIRST — this depends on it)
-- to every other table the app writes to. All ten confirmed to key directly
-- by `user_id` = the books-owning client, same pattern as accounts/contacts/
-- transactions, by checking every sb.from(...) call in appshell.jsx.
--
-- Read: any granted access level. Write: 'full' or 'entries' for day-to-day
-- transactional tables (invoices, quotes, bank_statement_lines, txn_attachments,
-- inbox_files, entry_comments); 'full' only for structural/administrative
-- tables (employees, pos_products, payroll_runs/payroll_lines, audit_log,
-- recurring_invoices, company_profile) since these aren't things an
-- entries-only bookkeeper should be restructuring.
-- ============================================================================

-- Transactional tables — full or entries can write
do $$
declare t text;
begin
  foreach t in array array['invoices','bank_statement_lines','txn_attachments','inbox_files']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_select on %I', t, t);
    execute format('create policy %I_select on %I for select using (rr_can_read(user_id))', t, t);
    execute format('drop policy if exists %I_write on %I', t, t);
    execute format('create policy %I_write on %I for all using (rr_can_write(user_id)) with check (rr_can_write(user_id))', t, t);
  end loop;
end $$;

-- Structural/administrative tables — full access only can write
do $$
declare t text;
begin
  foreach t in array array['employees','pos_products','payroll_runs','recurring_invoices','company_profile','quotes','audit_log']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_select on %I', t, t);
    execute format('create policy %I_select on %I for select using (rr_can_read(user_id))', t, t);
    execute format('drop policy if exists %I_write on %I', t, t);
    execute format('create policy %I_write on %I for all using (rr_can_write_settings(user_id)) with check (rr_can_write_settings(user_id))', t, t);
  end loop;
end $$;

-- payroll_lines — keyed by user_id directly (confirmed from the insert code),
-- but conceptually a child of payroll_runs, so it gets the same full-only rule.
alter table payroll_lines enable row level security;
drop policy if exists payroll_lines_select on payroll_lines;
create policy payroll_lines_select on payroll_lines for select using (rr_can_read(user_id));
drop policy if exists payroll_lines_write on payroll_lines;
create policy payroll_lines_write on payroll_lines for all
  using (rr_can_write_settings(user_id)) with check (rr_can_write_settings(user_id));

-- entry_comments — special case: has BOTH `user_id` (the books owner, set
-- via booksUserId||getCurrentUserId() in the app) and `author_id` (whoever
-- actually wrote the comment). Created here if it doesn't exist yet
-- (confirmed exact schema from appshell.jsx's fetchEntryComments/
-- addEntryComment calls). Read/write both gated on the books owner's
-- access grant, same as everything else — an entries-level user should be
-- able to leave and read comments same as they can post entries.
create table if not exists entry_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  transaction_id bigint not null,
  author_id uuid,
  body text not null,
  created_at timestamptz default now()
);

alter table entry_comments enable row level security;
drop policy if exists entry_comments_select on entry_comments;
create policy entry_comments_select on entry_comments for select
  using (rr_can_read(user_id));
drop policy if exists entry_comments_write on entry_comments;
create policy entry_comments_write on entry_comments for all
  using (rr_can_write(user_id)) with check (rr_can_write(user_id));

-- ============================================================================
-- After running this + Part 1, every table the app writes to has RLS. Next
-- step per the runbook: create two real test accounts, grant one 'readonly'
-- access to the other's books, and confirm — via direct API calls with each
-- account's own JWT, not just clicking through the UI — that the readonly
-- account genuinely cannot INSERT/UPDATE/DELETE anything on the other
-- account's data. That's the real proof this works, not just that the
-- policies exist.
-- ============================================================================

-- ============================================================================
-- ============================================================================
-- Multi-tenant RLS — Part 3: budgets, money_sources, usage_events
-- ============================================================================
-- Found these 3 by cross-checking every sb.from(...) call across the ENTIRE
-- codebase against what Part 1 + Part 2 covered — they were missed in the
-- first two passes. Run after Part 1 and Part 2.
-- ============================================================================

-- budgets, money_sources — standard books-owner pattern, full/entries can write
do $$
declare t text;
begin
  foreach t in array array['budgets','money_sources']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_select on %I', t, t);
    execute format('create policy %I_select on %I for select using (rr_can_read(user_id))', t, t);
    execute format('drop policy if exists %I_write on %I', t, t);
    execute format('create policy %I_write on %I for all using (rr_can_write(user_id)) with check (rr_can_write(user_id))', t, t);
  end loop;
end $$;

-- usage_events — DIFFERENT shape from every other table. The app reads this
-- with no per-user filter (admin.jsx: sb.from("usage_events").select(...) —
-- an admin-only cross-account usage dashboard), and writes one row per user
-- per tab-change as a lightweight analytics ping. So: any logged-in user can
-- insert their OWN event, but only an admin can read the full table.
alter table usage_events enable row level security;

drop policy if exists usage_events_select on usage_events;
create policy usage_events_select on usage_events for select
  using (rr_is_admin());

drop policy if exists usage_events_insert on usage_events;
create policy usage_events_insert on usage_events for insert
  with check (user_id = auth.uid());

-- ============================================================================
-- This completes RLS coverage for every table the app currently writes to
-- (confirmed via grep across the full codebase, not just spot-checked).
-- If a future feature adds a new table, it needs the same treatment before
-- going live — check whether it's a books-owner table (use the standard
-- pattern above) or a cross-account admin table (use the usage_events
-- pattern) before assuming the default.
-- ============================================================================

-- ============================================================================
-- ============================================================================
-- Project/department tracking — same pattern as money_sources
-- ============================================================================
create table if not exists projects (
  id text primary key,
  user_id uuid not null,
  name text not null,
  inactive boolean default false,
  created_at timestamptz default now()
);

alter table transactions add column if not exists project_id text;

-- RLS — same books-owner pattern as everything else. Run AFTER the main
-- multi_tenant_rls.sql files so rr_can_read/rr_can_write already exist.
alter table projects enable row level security;
drop policy if exists projects_select on projects;
create policy projects_select on projects for select using (rr_can_read(user_id));
drop policy if exists projects_write on projects;
create policy projects_write on projects for all
  using (rr_can_write(user_id)) with check (rr_can_write(user_id));

-- Also add the tracking toggle to company_profile, alongside country.
alter table company_profile add column if not exists track_projects boolean default false;
