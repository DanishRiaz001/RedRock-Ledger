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
