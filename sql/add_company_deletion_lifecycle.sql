-- ============================================================================
-- PART 1 — closes a real gap found while building this: sql/
-- restrict_company_creation.sql enabled RLS on `companies` and added an
-- INSERT policy, but its own comment flagged (and never followed up on)
-- that no SELECT/UPDATE policy existed yet. With RLS enabled and no such
-- policy, every company beyond the one auto-created for a fresh login
-- would read back as invisible (Postgres RLS returns zero rows, not an
-- error, for an unauthorized SELECT) — if that migration has already been
-- run, this is why. If it hasn't been run yet, `companies` currently has
-- NO RLS at all (the original gap add_multi_company.sql shipped with:
-- created the table, never enabled RLS on it). Either way, this file is
-- the actual fix — safe to run whether or not restrict_company_creation.sql
-- has been applied yet.
-- ============================================================================

alter table companies enable row level security;

drop policy if exists companies_select on companies;
create policy companies_select on companies for select
  using (
    owner_user_id = auth.uid()
    or exists(select 1 from client_access where employee_user_id=auth.uid() and company_id=companies.id)
    or rr_is_admin()
  );

-- The owner (or anyone with 'full' access, granted via client_access) can
-- rename, reconfigure, or request/cancel deletion of a company they can
-- already fully administer. No DELETE policy is granted here on purpose —
-- see PART 2: a company is never actually SQL-deleted by this app anymore,
-- only archived, so there is nothing that should ever issue a real DELETE
-- against this table from the client.
drop policy if exists companies_update on companies;
create policy companies_update on companies for update
  using (rr_can_write_settings_company(owner_user_id, id) or rr_is_admin())
  with check (rr_can_write_settings_company(owner_user_id, id) or rr_is_admin());

-- ============================================================================
-- PART 2 — company deletion becomes a 7-day, cancellable REQUEST, never an
-- immediate delete. The underlying rows are never dropped — Bokføringsloven
-- requires keeping accounting records for years, so "deleted" here always
-- means archived and hidden, recoverable by the admin, never destroyed.
--
-- Lifecycle: active -> pending_confirmation (request sent, waiting on the
-- owner to click the confirm link) -> pending_deletion (confirmed, 7-day
-- countdown running, cancellable) -> archived (countdown elapsed; hidden
-- from the switcher and Admin Panel's normal list, still fully queryable).
-- Real email delivery (a Resend-backed Edge Function) is a follow-up once
-- that's wired up — until then the app shows the confirm link directly so
-- the flow is fully usable without it.
-- ============================================================================

alter table companies add column if not exists deletion_status text not null default 'active';
alter table companies add column if not exists deletion_requested_at timestamptz;
alter table companies add column if not exists deletion_requested_by uuid;
alter table companies add column if not exists deletion_confirm_token uuid;
alter table companies add column if not exists deletion_confirmed_at timestamptz;
alter table companies add column if not exists scheduled_deletion_at timestamptz;

create index if not exists companies_deletion_status_idx on companies(deletion_status);
