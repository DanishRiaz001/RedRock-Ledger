# Backup strategy for the accounting data (2026-09-10)

Principle: **3-2-1-1-0** — 3 copies, 2 media, 1 off-site, 1 offline/immutable,
0 errors (verified). Accounting data has two extra demands: legal retention
(Norway: 5 years, some records 10) and point-in-time provability (show exactly
what the books looked like on any past date).

## Layer 1 — Live DB (Supabase) — the primary, not a backup
- Confirm **daily automated backups** run and succeed.
- Turn on **Point-in-Time Recovery** if the plan supports it — restore to any
  minute, not just daily snapshots. Worth the paid tier for accounting data.
- Treat Supabase as a vendor that could fail / suspend / get breached. Never the
  only copy.

## Layer 2 — Own full DB dumps — the real backup
- `pg_dump` the whole database, **weekly minimum, daily if automated.**
  ```
  pg_dump "postgresql://postgres:[PW]@[HOST]:5432/postgres" \
    --no-owner --no-privileges -f redrock_full_$(date +%Y%m%d).sql
  ```
- **Encrypt each dump at rest.**
- Rolling retention: 7 daily, 8 weekly, 12 monthly, then 1 per year forever.

## Layer 3 — Off-site, off-platform
- One copy in a **different cloud** (Backblaze B2 / S3 / GCS), different region —
  not another Supabase project.
- Enable **object-lock / immutability / versioning** — ransomware-proof and
  tamper-evident (matters for an audit trail).
- One physical external-drive copy kept out of the building, refreshed quarterly.

## Layer 4 — Attachments + non-DB data
- The DB dump does **NOT** include Supabase Storage files (scanned invoices,
  receipts, statements) — legally part of the bookkeeping.
- Back the Storage bucket up on the same schedule (`supabase storage download`
  or the S3-compatible API) into the same encrypted off-site location.

## Layer 5 — Year-end permanent archives
At each year-end close, produce a frozen archive, never touched again:
- Full `pg_dump` + full Storage export + **SAF-T XML** for the year + a
  plain-language PDF trial balance / income statement / balance sheet.
- Immutable off-site bucket + offline media, labelled by year.
- Keep **≥10 years**.

## Layer 6 — Verify, or it's not a backup
- Every job **reports success/failure somewhere a human sees it.**
- **Test-restore quarterly** — load a dump into a scratch Postgres, open it,
  confirm the numbers.
- Keep a **SHA-256 checksum** of each archived file (proves it hasn't changed).

## Condensed routine
| When | Do |
|---|---|
| Continuous | Supabase daily backups + PITR |
| Daily (auto) | Encrypted `pg_dump` + Storage sync → local + off-site immutable bucket |
| Weekly | In-app "Export Backup" JSON → cloud-synced folder |
| Quarterly | Test-restore; refresh offline drive; check every job still runs |
| Year-end | Permanent frozen archive (DB + Storage + SAF-T + statements), 10-yr retention |

**If only three things:** turn on Supabase PITR; automate a daily encrypted
`pg_dump` to an immutable off-site bucket; test-restore once a quarter.

## Note — in-app "Export Backup" limits
`Settings → Backup & Restore → Export Backup` gives a JSON of transactions,
accounts, contacts, invoices, quotes, recurring invoices, employees, sinking
funds, budgets, company profile. It does **NOT** include: attachment files, the
audit log, VAT status flags, bank-posting-type settings, reconciliation status.
Good as a quick human-readable net; not a complete backup on its own.
