# Pakistan IFRS-for-SMEs Chart of Accounts — Draft v1

**Status:** Draft for review. Needs sign-off from an accountant familiar with IFRS for SMEs and SECP requirements before this becomes the real seed data (`accounts_data.js` equivalent for the PK/IFRS pack). Do not seed this into any real company yet.

**Numbering convention:** Deliberately NOT NS 4102 (Norway's numbering, which the current app's account-range logic — `theme.js` `getSK()`, hardcoded `"1500"`/`"2400"` checks, etc. — is built around). Using a distinct, non-overlapping range so the two frameworks can never collide even if account codes are ever compared as raw numbers by mistake:

| Range | Classification |
|---|---|
| 1000–1499 | Non-current assets |
| 1500–1999 | Current assets |
| 2000–2499 | Equity |
| 2500–2999 | Non-current liabilities |
| 3000–3499 | Current liabilities |
| 4000–4999 | Revenue |
| 5000–5999 | Cost of sales |
| 6000–6999 | Operating expenses (distribution & administrative) |
| 7000–7499 | Other income |
| 7500–7999 | Finance costs |
| 8000–8999 | Taxation |

This mirrors how IFRS for SMEs statements are actually structured (IFRS commonly presents non-current items before current, and separates cost of sales / operating expenses / finance costs / tax as distinct statement sections) — the numbering isn't arbitrary, it's meant to make statement generation a straightforward range-scan later, the same technique the current codebase already uses for Norway (just on a non-colliding range).

---

## 1000–1499 — Non-current assets

| Code | Name |
|---|---|
| 1010 | Freehold land |
| 1020 | Buildings |
| 1030 | Plant and machinery |
| 1040 | Furniture and fixtures |
| 1050 | Office and computer equipment |
| 1060 | Vehicles |
| 1090 | Accumulated depreciation — property, plant and equipment (contra) |
| 1110 | Right-of-use assets (leases) |
| 1120 | Accumulated depreciation — right-of-use assets (contra) |
| 1210 | Intangible assets — software and licenses |
| 1290 | Accumulated amortization — intangible assets (contra) |
| 1310 | Investment property |
| 1410 | Long-term investments |
| 1420 | Long-term security deposits |
| 1430 | Deferred tax asset |

## 1500–1999 — Current assets

| Code | Name |
|---|---|
| 1510 | Cash in hand |
| 1520 | Bank account — current (PKR) |
| 1530 | Bank account — savings (PKR) |
| 1540 | Bank account — foreign currency |
| 1610 | Trade receivables — local customers |
| 1620 | Trade receivables — export customers |
| 1630 | Allowance for expected credit losses (contra) |
| 1710 | Advances to employees |
| 1720 | Advances to suppliers |
| 1730 | Other receivables |
| 1810 | Inventory — raw materials |
| 1820 | Inventory — work in process |
| 1830 | Inventory — finished goods |
| 1840 | Inventory — goods for resale (trading stock) |
| 1910 | Prepaid expenses |
| 1920 | Advance income tax |
| 1930 | Sales tax refundable / input tax adjustable |
| 1940 | Short-term investments |

## 2000–2499 — Equity

| Code | Name |
|---|---|
| 2010 | Share capital — ordinary shares |
| 2020 | Share premium |
| 2110 | Retained earnings |
| 2120 | General reserve |
| 2130 | Revaluation surplus |
| 2210 | Owner's capital (for sole proprietor / partnership entities, used instead of 2010–2020) |
| 2220 | Owner's drawings (contra, sole proprietor / partnership) |

## 2500–2999 — Non-current liabilities

| Code | Name |
|---|---|
| 2510 | Long-term loans — banks |
| 2520 | Long-term loans — directors / related parties |
| 2610 | Lease liabilities — non-current portion |
| 2710 | Provision for gratuity |
| 2720 | Deferred tax liability |

## 3000–3499 — Current liabilities

| Code | Name |
|---|---|
| 3010 | Trade payables — local suppliers |
| 3020 | Trade payables — import suppliers |
| 3110 | Short-term borrowings |
| 3120 | Current portion of long-term loans |
| 3130 | Lease liabilities — current portion |
| 3210 | Accrued expenses |
| 3220 | Accrued salaries and wages |
| 3310 | Sales tax payable / output tax |
| 3320 | Withholding tax payable |
| 3330 | Income tax payable |
| 3340 | Employees' provident fund payable |
| 3410 | Advances from customers / unearned revenue |
| 3420 | Dividend payable |
| 3430 | Other payables |

## 4000–4999 — Revenue

| Code | Name |
|---|---|
| 4010 | Sales — local |
| 4020 | Sales — export |
| 4030 | Service revenue |
| 4110 | Sales returns and allowances (contra) |
| 4120 | Sales discounts (contra) |

## 5000–5999 — Cost of sales

| Code | Name |
|---|---|
| 5010 | Opening inventory |
| 5020 | Purchases — raw materials / goods for resale |
| 5030 | Purchase returns and allowances (contra) |
| 5040 | Direct labor |
| 5050 | Freight and carriage inward |
| 5060 | Factory/production overheads |
| 5090 | Closing inventory (contra, used in COGS calculation) |

*(Note: for a pure service business this whole section may collapse to just "cost of services rendered" — the final pack should offer a trading/manufacturing variant and a services-only variant, decided with the accountant reviewing this.)*

## 6000–6999 — Operating expenses

**Administrative expenses**
| Code | Name |
|---|---|
| 6010 | Salaries and wages — administration |
| 6020 | Employees' provident fund contribution |
| 6030 | Gratuity expense |
| 6040 | Rent — office |
| 6050 | Utilities (electricity, gas, water) |
| 6060 | Telephone and internet |
| 6070 | Office supplies |
| 6080 | Repairs and maintenance |
| 6090 | Insurance |
| 6100 | Legal and professional fees |
| 6110 | Auditors' remuneration |
| 6120 | Depreciation — property, plant and equipment |
| 6130 | Depreciation — right-of-use assets |
| 6140 | Amortization — intangible assets |
| 6150 | Travelling and conveyance |
| 6160 | Entertainment |
| 6170 | Printing and stationery |
| 6180 | Bank charges |
| 6190 | Miscellaneous / general expenses |

**Selling and distribution expenses**
| Code | Name |
|---|---|
| 6510 | Salaries — sales staff |
| 6520 | Sales commission |
| 6530 | Advertising and promotion |
| 6540 | Freight and carriage outward |
| 6550 | Warehousing |

## 7000–7499 — Other income

| Code | Name |
|---|---|
| 7010 | Profit on disposal of fixed assets |
| 7020 | Exchange gain |
| 7030 | Rental income |
| 7040 | Other income |

## 7500–7999 — Finance costs

| Code | Name |
|---|---|
| 7510 | Markup / interest on loans |
| 7520 | Bank charges — financing |
| 7530 | Exchange loss |
| 7540 | Finance cost on lease liabilities |

## 8000–8999 — Taxation

| Code | Name |
|---|---|
| 8010 | Income tax expense — current |
| 8020 | Income tax expense — deferred |

---

## Open questions for the reviewing accountant

1. **Entity type variants**: this draft assumes a company (share capital). Sole proprietorships/partnerships (very common for Pakistani SMEs) need the 2210/2220 owner's-equity accounts instead — should the pack detect entity type at company setup and swap the equity section, or should the user just pick the relevant accounts and the unused ones stay hidden/inactive?
2. **Trading vs manufacturing vs services**: the Cost of Sales section above is a generic trading/manufacturing shape. A services-only business (very common — consultancies, agencies) would need a simplified version. Should this be a setup-time choice (like an industry template) rather than one fixed COA for everyone?
3. **Sales tax mechanics**: Pakistan's sales tax (FBR) has input/output tax adjustment mechanics broadly similar to Norway's VAT but with its own specific rules (e.g., further tax, extra tax in some sectors, withholding sales tax regime). Accounts 1930/3310 are placeholders — the real VAT-equivalent logic (Phase 4 in the roadmap) will need proper design once tax filing integration starts.
4. **Withholding tax**: Pakistan has extensive withholding tax obligations (on payments to suppliers, salaries, services, etc.) — 3320 is a single placeholder account; real implementation likely needs sub-accounts per withholding tax section/rate.

This draft is meant to be substantively correct and usable as a starting point, not a final signed-off standard — please have it reviewed by an accountant who works with Pakistani SMEs under IFRS for SMEs before it goes anywhere near a real company.
