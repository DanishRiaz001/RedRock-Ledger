# RedRock Ledger — Quick Recovery Runbook

Fast paths for when something breaks, split by what's actually different between Norway and Pakistan operations.

## Universal (applies to both countries)

**App is broken / bad deploy went live**
1. Cloudflare Pages → Deployments → find the last known-good deployment → "Rollback to this deployment" (instant, no git needed)
2. In parallel: `git revert <bad-commit>` and push, so `main` matches what's actually live

**A client reports wrong/missing data**
1. Check Supabase directly (Table Editor) for that `user_id` — confirms whether it's a data problem or a display/rendering problem
2. If data's there but not showing: browser console error first (same pattern used throughout this project — paste the red error text, trace the missing import/prop)
3. If data's genuinely missing: check Supabase's own point-in-time recovery (Pro plan includes daily backups) before assuming it's unrecoverable

**Suspected cross-client data leak**
1. Immediately check RLS status on the affected table (Table Editor → table → RLS toggle)
2. If RLS is off or misconfigured, that table's writes/reads are unsafe until fixed — this is the one failure mode that's urgent, not just annoying, since it's a trust/legal issue not a bug
3. Run `sql/multi_tenant_rls.sql`, then `sql/multi_tenant_rls_part2.sql`, then `sql/multi_tenant_rls_part3.sql` in that order — together they cover all 23 tables the app writes to (verified by grepping every `sb.from(...)` call in the codebase, not just the obvious ones)

## Norway-specific

**VAT report numbers look wrong before a filing deadline**
1. Check `VATCodesScreen` — confirm the account's `default_vat_code` matches the real transaction, not just the account's usual code (accounts can have transactions posted with a different code than their default)
2. Cross-check against `VATTerminScreen`'s period grouping — a transaction dated near a period boundary can land in the wrong Mva-melding period if the date was entered wrong

**A client asks about Altinn e-filing**
- Not built (per project scope) — this needs to be communicated clearly as a known gap, not something breaking. Client exports the VAT report and files manually via Altinn for now.

## Pakistan-specific

**A client asks about tax filing / FBR**
- Not built yet by design ("we will build Pakistani a bit later" per your own instruction) — the country selector already shows "Pakistani tax filing isn't built yet" in Company Settings so this should already be expected, not a surprise support ticket.

**A Pakistan-side client's data looks like it has Norwegian formatting (MVA references, NOK)**
- Check `company_profile.country` for that user — should be `'PK'`. If a new signup somehow defaulted to `'NO'`, that's the bug to chase (should default to `'PK'` per the SQL migration).

## Escalation triggers — stop and think, don't just patch

- Any RLS/data-isolation issue → treat as urgent, not routine
- Any issue affecting a live client's ability to close their books near a filing deadline → prioritize over new feature work
- Anything where the fix isn't obvious within ~15 minutes → this project's established pattern (build → ESLint → render-check → verify the actual packaged output) beats a fast guess, even under time pressure
