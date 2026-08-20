-- ============================================================================
-- Phase 1 of the multi-client plan: make RLS company-aware.
-- ============================================================================
-- WHERE THINGS STAND: multi_tenant_rls.sql (+ part2/part3) already put real
-- RLS on every table, keyed to rr_can_read/rr_can_write/rr_can_write_settings
-- — those check *who you are* against client_access, and that part is
-- already safe (a user with no grant genuinely cannot read/write another
-- user's rows at the database level, confirmed by reading the policies).
--
-- THE GAP THIS CLOSES: company_id was added to every table afterwards
-- (add_multi_company.sql) as plain data, but no policy actually looks at
-- it. So today, granting someone access to "Danish's books" grants them
-- every company Danish owns, not just the one client they were meant to
-- see. This file makes company_id load-bearing: client_access grants can
-- now be scoped to one company, and every policy honors that.
--
-- SAFE TO RUN: rows with company_id still NULL (pre-migration data) keep
-- working exactly as before — this only adds a *narrower* check on top of
-- the existing one, it doesn't remove any access anyone currently has.
--
-- Run this whole file once in the Supabase SQL Editor, after
-- multi_tenant_rls.sql + part2 + part3 + add_multi_company.sql have all
-- already been run. Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. client_access needs to know WHICH company a grant is for. Nullable —
--    a grant with company_id left NULL means "every company under this
--    login" (the old, broad behavior), so existing grants keep working
--    unchanged until someone re-grants them scoped to one company.
-- ----------------------------------------------------------------------------
ALTER TABLE client_access ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

-- ----------------------------------------------------------------------------
-- 2. The company-aware access check. Wraps the existing rr_access_level
--    logic instead of replacing it — same admin/ownership rules, just with
--    an extra company match when the row and/or the grant specify one.
-- ----------------------------------------------------------------------------
create or replace function rr_access_level_for_company(target_user_id uuid, target_company_id uuid)
returns text
language sql
security definer
stable
as $$
  select case
    -- Own books: always full access, regardless of company.
    when target_user_id = auth.uid() then 'full'
    -- The row isn't tagged to a specific company (legacy data) — fall back
    -- to the plain per-login grant, same as before this migration.
    when target_company_id is null then (
      select access_level from client_access
      where employee_user_id = auth.uid() and client_user_id = target_user_id
      order by (company_id is null) -- prefer a company-specific grant if one exists
      limit 1
    )
    -- The row belongs to a specific company — match a grant that names
    -- that exact company, or an old-style grant with no company set
    -- (meaning "the whole login", kept working for backward compatibility).
    else (
      select access_level from client_access
      where employee_user_id = auth.uid()
        and client_user_id = target_user_id
        and (company_id = target_company_id or company_id is null)
      order by (company_id is null) -- a company-specific grant wins over a blanket one
      limit 1
    )
  end;
$$;

create or replace function rr_can_read_company(target_user_id uuid, target_company_id uuid)
returns boolean language sql stable as $$
  select rr_access_level_for_company(target_user_id, target_company_id) is not null;
$$;

create or replace function rr_can_write_company(target_user_id uuid, target_company_id uuid)
returns boolean language sql stable as $$
  select rr_access_level_for_company(target_user_id, target_company_id) in ('full','entries');
$$;

create or replace function rr_can_write_settings_company(target_user_id uuid, target_company_id uuid)
returns boolean language sql stable as $$
  select rr_access_level_for_company(target_user_id, target_company_id) = 'full';
$$;

-- ----------------------------------------------------------------------------
-- 3. Re-point every existing policy at the company-aware functions. Same
--    read/write split as multi_tenant_rls.sql + part2/part3 (transactional
--    tables allow 'entries' to write; structural tables need 'full') —
--    only the underlying check changes, so re-running this doesn't alter
--    who could already read or write what, only narrows access when a
--    grant IS scoped to one company.
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'accounts','contacts','invoices','bank_statement_lines','txn_attachments','inbox_files',
    'transactions','sinking_funds','budgets','money_sources'
  ]
  loop
    if exists (select 1 from information_schema.tables where table_name=t) then
      execute format('drop policy if exists %I_select on %I', t, t);
      execute format('create policy %I_select on %I for select using (rr_can_read_company(user_id, company_id))', t, t);
      execute format('drop policy if exists %I_write on %I', t, t);
      execute format('create policy %I_write on %I for all using (rr_can_write_company(user_id, company_id)) with check (rr_can_write_company(user_id, company_id))', t, t);
    end if;
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'employees','pos_products','payroll_runs','recurring_invoices','company_profile',
    'quotes','audit_log','payroll_lines'
  ]
  loop
    if exists (select 1 from information_schema.tables where table_name=t) then
      execute format('drop policy if exists %I_select on %I', t, t);
      execute format('create policy %I_select on %I for select using (rr_can_read_company(user_id, company_id))', t, t);
      execute format('drop policy if exists %I_write on %I', t, t);
      execute format('create policy %I_write on %I for all using (rr_can_write_settings_company(user_id, company_id)) with check (rr_can_write_settings_company(user_id, company_id))', t, t);
    end if;
  end loop;
end $$;

-- entry_comments — same special case as multi_tenant_rls_part2.sql: keyed
-- by the books-owner's user_id/company_id, not the comment author's.
drop policy if exists entry_comments_select on entry_comments;
create policy entry_comments_select on entry_comments for select
  using (rr_can_read_company(user_id, company_id));
drop policy if exists entry_comments_write on entry_comments;
create policy entry_comments_write on entry_comments for all
  using (rr_can_write_company(user_id, company_id)) with check (rr_can_write_company(user_id, company_id));

-- ----------------------------------------------------------------------------
-- 4. client_access itself — extend the existing "a client can see who has
--    access to their books" policy so it also covers a client viewing
--    grants for one specific company (not just the whole-login list).
--    Grant/revoke stays admin-only, unchanged.
-- ----------------------------------------------------------------------------
drop policy if exists client_access_select on client_access;
create policy client_access_select on client_access for select
  using (
    employee_user_id = auth.uid()
    or client_user_id = auth.uid()
    or rr_is_admin()
  );

-- ----------------------------------------------------------------------------
-- 5. Every NEW grant the app creates from here on always names one company
--    (Phase 3 — grantClientAccess now requires a company_id). The old
--    unique(client_user_id, employee_user_id) constraint would block that —
--    it only allowed one grant per employee/client pair, period. Replacing
--    it with a 3-column constraint lets the same employee hold separate
--    grants on separate companies for the same client login. Existing rows
--    (company_id NULL, from before this migration) are left exactly as they
--    are — untouched, still honored by rr_access_level_for_company's
--    fallback — this only changes what's allowed going forward.
-- ----------------------------------------------------------------------------
ALTER TABLE client_access DROP CONSTRAINT IF EXISTS client_access_client_user_id_employee_user_id_key;
ALTER TABLE client_access ADD CONSTRAINT client_access_employee_client_company_key UNIQUE (employee_user_id, client_user_id, company_id);

-- ============================================================================
-- After running this: existing grants (company_id NULL) keep working exactly
-- as before, and the app's grant/revoke UI (Phase 3, already wired in this
-- same change) can now create one grant per company instead of one grant
-- covering a client's entire login.
-- ============================================================================
