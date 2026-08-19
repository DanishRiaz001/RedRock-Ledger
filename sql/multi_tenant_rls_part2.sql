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
