import { MVA_CODES } from "./utils.js";

// ============================================================================
// VAT split
//
// The app's default posting model is one row: Dr X / Cr Y for the GROSS
// (VAT-inclusive) amount, with vat_code / vat_pct / vat_amount stored only as
// metadata for the Mva-melding. That leaves the P&L account carrying VAT it
// shouldn't, and the input/output-VAT balance-sheet accounts (27xx) never move.
//
// When a company turns on `companyProfile.splitVat`, every posting that has a
// deductible/collectable VAT code is written as TWO rows sharing one bilag:
//
//   purchase (input VAT, e.g. code 1 -> 2710):
//     Dr <expense>  net           (keeps the vat_* metadata for the report)
//     Dr <2710>     vatAmount
//     Cr <supplier> gross
//
//   sale (output VAT, e.g. code 3 -> 2700):
//     Dr <customer> gross
//     Cr <income>   net           (keeps the vat_* metadata)
//     Cr <2700>     vatAmount
//
// The settlement account is PER VAT CODE — 2700/2701/2702/2703 for the output
// rates, 2710/2711/2712 for the input rates, 2705/2706 for import, etc. —
// taken straight from MVA_CODES[].settleAccount, so "each konto has its code
// for salg and purchase" is honoured automatically.
// ============================================================================

// Returns null when no split applies:
//  - no VAT code, or a code with no settlement account (5, 6, 0, ...)
//  - the VAT amount is ~0, or >= the gross (nothing sensible to split)
//  - a negative (reversal / kreditnota) amount — left exactly as entered
//  - the settlement account isn't in the chart of accounts
// Otherwise returns { net, vatLeg } where vatLeg is a plain posting spec that
// the caller inserts as a second row under the SAME bilag.
export function vatSplit({ debitCode, creditCode, amount, vatCode, vatAmount, description }, accounts) {
  if (vatCode == null || vatCode === "") return null;
  const amt = Number(amount);
  if (!(amt > 0)) return null; // only forward postings; reversals stay one-line
  const vc = MVA_CODES.find(c => String(c.code) === String(vatCode));
  // Only the plain VAT-inclusive codes split this way. Reverse-charge / import
  // / direktepostert / adjustment codes are flagged without `autoSplit` and
  // fall through to a single gross row (posting their extra 27xx leg is a
  // separate feature).
  if (!vc || !vc.autoSplit) return null;
  const settle = vc.settleAccount;
  if (!settle) return null;
  const vat = Math.round(Math.abs(Number(vatAmount) || 0) * 100) / 100;
  if (vat < 0.005 || vat >= amt) return null;
  if (Array.isArray(accounts) && accounts.length && !accounts.some(a => a.code === settle)) return null;

  const net = Math.round((amt - vat) * 100) / 100;
  const isInput = vc.direction === "input";
  const tag = isInput ? " — inngående mva" : " — utgående mva";
  const vatLeg = isInput
    ? { debitCode: settle, creditCode, amount: vat, description: (description || "") + tag }
    : { debitCode, creditCode: settle, amount: vat, description: (description || "") + tag };
  return { net, vatLeg, settleAccount: settle, direction: vc.direction };
}

// ============================================================================
// Reverse charge (omvendt avgiftsplikt) — import of goods, foreign services,
// climate quotas/gold. Unlike a normal purchase, the supplier charges NO VAT:
// `amount` is the NET base as entered. The buyer self-assesses the VAT on top
// and posts it as a wash (fully deductible) or a real cost (not deductible):
//
//   deductible   (code 81/83/86/88/91): Dr <input 27xx>  / Cr <output 27xx>  vat
//   non-deductible (82/84/87/89/92):    Dr <expense>     / Cr <output 27xx>  vat
//
// The base itself posts completely normally (Dr expense / Cr supplier, no
// VAT split — vatSplit() already returns null for these codes since they
// lack `autoSplit`). This only adds the extra 27xx leg(s).
// ============================================================================
export function reverseChargeLegs({ debitCode, amount, vatCode, description }, accounts) {
  if (!(Number(amount) > 0)) return null;
  const vc = MVA_CODES.find(c => String(c.code) === String(vatCode));
  if (!vc || !vc.reverseCharge) return null;
  const out = vc.reverseChargeAccount;
  if (!out) return null;
  const chart = Array.isArray(accounts) ? accounts : [];
  if (chart.length && !chart.some(a => a.code === out)) return null;
  const vat = Math.round(Math.abs(Number(amount)) * (vc.rate || 0) / 100 * 100) / 100;
  if (vat < 0.005) return null;
  const deductible = vc.settleAccount && (!chart.length || chart.some(a => a.code === vc.settleAccount));
  const leg = deductible
    ? { debitCode: vc.settleAccount, creditCode: out, amount: vat, description: (description || "") + " — omvendt avgiftsplikt" }
    : { debitCode, creditCode: out, amount: vat, description: (description || "") + " — omvendt avgiftsplikt (ikke fradragsberettiget)" };
  return { leg, vat, deductible };
}
