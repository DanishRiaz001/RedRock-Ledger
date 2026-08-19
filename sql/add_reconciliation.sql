-- ============================================================================
-- Balance sheet reconciliation tracking — Phase 5 (items #17-19)
-- ============================================================================
-- One row per (account, period) — tracks close-out status, who set it, and
-- comments, matching the real accounting workflow of walking through every
-- balance sheet account each period and confirming it's actually correct
-- before the books are considered closed.
create table if not exists reconciliation_status (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_code text not null,
  period text not null, -- 'YYYY-MM'
  status text not null default 'not_started', -- not_started | in_progress | done | reviewed | follow_up | not_applicable
  status_comment text default '',
  account_comment text default '',
  updated_by uuid,
  updated_at timestamptz default now(),
  unique(user_id, account_code, period)
);

-- Links an uploaded file (already in inbox_files) to a specific account +
-- period, so the same underlying storage/upload system from the Inbox is
-- reused rather than building a parallel file system.
create table if not exists reconciliation_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_code text not null,
  period text not null,
  inbox_file_id uuid not null,
  created_at timestamptz default now()
);

alter table reconciliation_status enable row level security;
drop policy if exists reconciliation_status_select on reconciliation_status;
create policy reconciliation_status_select on reconciliation_status for select using (rr_can_read(user_id));
drop policy if exists reconciliation_status_write on reconciliation_status;
create policy reconciliation_status_write on reconciliation_status for all
  using (rr_can_write(user_id)) with check (rr_can_write(user_id));

alter table reconciliation_files enable row level security;
drop policy if exists reconciliation_files_select on reconciliation_files;
create policy reconciliation_files_select on reconciliation_files for select using (rr_can_read(user_id));
drop policy if exists reconciliation_files_write on reconciliation_files;
create policy reconciliation_files_write on reconciliation_files for all
  using (rr_can_write(user_id)) with check (rr_can_write(user_id));
