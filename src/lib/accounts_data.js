const DEFAULT_ACCOUNTS=[
  // ── 1000s ASSETS ──────────────────────────────────────────────
  // Fixed Assets (1000–1099)
  {code:"1000",name:"Fixed Assets"},
  {code:"1010",name:"Land & Buildings"},
  {code:"1020",name:"Office Buildings"},
  {code:"1030",name:"Other Real Estate"},
  // Intangible Assets (1100–1199)
  {code:"1100",name:"Intangible Assets"},
  {code:"1110",name:"Research & Development"},
  {code:"1120",name:"Patents & Licenses"},
  {code:"1130",name:"Goodwill"},
  // Machinery & Equipment (1200–1399)
  {code:"1200",name:"Machinery & Plant"},
  {code:"1210",name:"Production Equipment"},
  {code:"1220",name:"Furniture & Fixtures"},
  {code:"1230",name:"Office Equipment"},
  {code:"1240",name:"Computer Equipment"},
  {code:"1260",name:"Vehicles"},
  // Inventory & Stock (1400–1499)
  {code:"1400",name:"Inventory — Raw Materials"},
  {code:"1410",name:"Inventory — Work in Progress"},
  {code:"1420",name:"Inventory — Finished Goods"},
  // Accounts Receivable (1500–1599)
  {code:"1500",name:"Accounts Receivable"},
  {code:"1510",name:"Trade Receivables"},
  {code:"1520",name:"Receivables from Group Companies"},
  {code:"1530",name:"Other Short-term Receivables"},
  // Other Short-term Receivables (1600–1799)
  {code:"1600",name:"VAT Receivable"},
  {code:"1630",name:"Prepaid Expenses"},
  {code:"1700",name:"Short-term Investments"},
  {code:"1710",name:"Shares in Listed Companies"},
  {code:"1800",name:"Accrued Income"},
  // Bank & Cash (1900–1999)
  {code:"1900",name:"Cash in Hand"},
  {code:"1910",name:"Bank Account — Main"},
  {code:"1920",name:"Bank Account — Operations"},
  {code:"1950",name:"Petty Cash"},
  // ── 2000s EQUITY & LIABILITIES ────────────────────────────────
  // Equity (2000–2099)
  {code:"2000",name:"Share Capital"},
  {code:"2020",name:"Share Premium Reserve"},
  {code:"2050",name:"Retained Earnings"},
  {code:"2080",name:"Profit / Loss This Year"},
  // Long-term Debt (2100–2299)
  {code:"2100",name:"Long-term Bank Loans"},
  {code:"2110",name:"Mortgage Loans"},
  {code:"2130",name:"Loans from Shareholders"},
  {code:"2200",name:"Deferred Tax Liability"},
  {code:"2290",name:"Other Provisions"},
  // Other Long-term Liabilities (2300–2399)
  {code:"2300",name:"Other Long-term Liabilities"},
  {code:"2310",name:"Loans — Group Companies"},
  // Accounts Payable (2400–2499)
  {code:"2400",name:"Accounts Payable"},
  {code:"2410",name:"Trade Payables"},
  {code:"2420",name:"Payables to Group Companies"},
  // VAT & Tax Payable (2500–2599)
  {code:"2500",name:"VAT Payable — Output"},
  {code:"2510",name:"VAT Collected"},
  {code:"2520",name:"VAT — Input (Deductible)"},
  {code:"2540",name:"VAT Payable to Tax Authority"},
  // Public Duties (2600–2699)
  {code:"2600",name:"Withholding Tax Payable"},
  {code:"2610",name:"Social Security Contributions Payable"},
  {code:"2620",name:"Holiday Pay Liability"},
  // Wages & Salaries Payable (2700–2799)
  {code:"2700",name:"Salaries Payable"},
  {code:"2710",name:"Pension Contributions Payable"},
  {code:"2720",name:"Employee Deductions Payable"},
  // Short-term Debt (2800–2899)
  {code:"2800",name:"Short-term Bank Loans"},
  {code:"2810",name:"Credit Facility"},
  // Other Current Liabilities (2900–2999)
  {code:"2900",name:"Accrued Expenses"},
  {code:"2910",name:"Advance Payments from Customers"},
  {code:"2950",name:"Other Current Liabilities"},
  // ── 3000s REVENUE ─────────────────────────────────────────────
  {code:"3000",name:"Sales Revenue",defaultVatCode:"3"},
  {code:"3010",name:"Sales — Goods",defaultVatCode:"3"},
  {code:"3020",name:"Sales — Services",defaultVatCode:"3"},
  {code:"3030",name:"Sales — Projects",defaultVatCode:"3"},
  {code:"3100",name:"Sales Revenue — Export",defaultVatCode:"52"},
  {code:"3200",name:"Sales Revenue — VAT Exempt",defaultVatCode:"5"},
  {code:"3400",name:"Public Grants & Subsidies"},
  {code:"3500",name:"Rental Income"},
  {code:"3600",name:"Commission Income"},
  {code:"3900",name:"Other Operating Income"},
  {code:"3960",name:"Gain on Asset Disposal"},
  // ── 4000s COST OF GOODS SOLD ─────────────────────────────────
  {code:"4000",name:"Cost of Goods Sold",defaultVatCode:"1"},
  {code:"4010",name:"Purchases — Raw Materials",defaultVatCode:"1"},
  {code:"4020",name:"Purchases — Goods for Resale",defaultVatCode:"1"},
  {code:"4030",name:"Freight & Import Costs",defaultVatCode:"1"},
  {code:"4100",name:"Change in Inventory"},
  {code:"4500",name:"Subcontractors",defaultVatCode:"1"},
  {code:"4600",name:"Direct Labour Costs"},
  // ── 5000s PAYROLL & SALARIES ─────────────────────────────────
  {code:"5000",name:"Salaries & Wages"},
  {code:"5010",name:"Salaries — Office Staff"},
  {code:"5020",name:"Salaries — Production Staff"},
  {code:"5030",name:"Temporary / Contract Labour"},
  {code:"5100",name:"Employer Social Security Tax"},
  {code:"5200",name:"Pension Contributions — Employer"},
  {code:"5300",name:"Holiday Pay Expense"},
  {code:"5400",name:"Employee Benefits"},
  {code:"5900",name:"Other Personnel Costs"},
  // ── 6000s DEPRECIATION ───────────────────────────────────────
  {code:"6000",name:"Depreciation — Buildings"},
  {code:"6010",name:"Depreciation — Machinery & Equipment"},
  {code:"6020",name:"Depreciation — Vehicles"},
  {code:"6030",name:"Depreciation — IT Equipment"},
  {code:"6040",name:"Depreciation — Intangibles"},
  {code:"6100",name:"Write-down of Assets"},
  {code:"6200",name:"Loss on Asset Disposal"},
  // ── 7000s OPERATING EXPENSES ─────────────────────────────────
  {code:"7000",name:"Transport & Freight Expenses",defaultVatCode:"1"},
  {code:"7020",name:"Fuel",defaultVatCode:"1"},
  {code:"7040",name:"Vehicle Running Costs",defaultVatCode:"1"},
  // Office & Admin (7100–7199)
  {code:"7100",name:"Office Supplies",defaultVatCode:"1"},
  {code:"7110",name:"Printing & Stationery",defaultVatCode:"1"},
  {code:"7120",name:"Postage & Courier",defaultVatCode:"1"},
  {code:"7130",name:"Cleaning & Caretaking",defaultVatCode:"1"},
  {code:"7140",name:"Electricity & Utilities",defaultVatCode:"1"},
  {code:"7150",name:"Rent — Office"},
  {code:"7160",name:"Lease Costs",defaultVatCode:"1"},
  {code:"7180",name:"Waste & Environmental Fees",defaultVatCode:"1"},
  // Sales & Marketing (7200–7299)
  {code:"7200",name:"Advertising & Marketing",defaultVatCode:"1"},
  {code:"7210",name:"Online Advertising",defaultVatCode:"1"},
  {code:"7220",name:"Trade Fairs & Events",defaultVatCode:"1"},
  {code:"7230",name:"Samples & Promotional Items",defaultVatCode:"1"},
  {code:"7260",name:"Sales Commission",defaultVatCode:"1"},
  // Travel & Entertainment (7300–7399)
  {code:"7300",name:"Travel Expenses",defaultVatCode:"1"},
  {code:"7310",name:"Accommodation",defaultVatCode:"13"},
  {code:"7320",name:"Meals & Entertainment"},
  {code:"7330",name:"Subsistence Allowance"},
  // IT & Telecom (7400–7499)
  {code:"7400",name:"IT & Software Costs",defaultVatCode:"1"},
  {code:"7410",name:"Phone & Mobile",defaultVatCode:"1"},
  {code:"7420",name:"Internet & Broadband",defaultVatCode:"1"},
  {code:"7430",name:"Cloud & SaaS Subscriptions",defaultVatCode:"1"},
  // Insurance & Fees (7500–7599)
  {code:"7500",name:"Insurance Premiums"},
  {code:"7510",name:"Legal & Professional Fees",defaultVatCode:"1"},
  {code:"7520",name:"Accounting & Audit Fees",defaultVatCode:"1"},
  {code:"7530",name:"Consulting Fees",defaultVatCode:"1"},
  {code:"7540",name:"Membership Fees & Subscriptions"},
  {code:"7550",name:"Public Duties & Licence Fees"},
  // Repairs & Maintenance (7600–7699)
  {code:"7600",name:"Repairs & Maintenance",defaultVatCode:"1"},
  {code:"7610",name:"Maintenance — Buildings",defaultVatCode:"1"},
  {code:"7620",name:"Maintenance — Equipment",defaultVatCode:"1"},
  // Finance & Bank (7700–7799)
  {code:"7700",name:"Bank Charges"},
  {code:"7710",name:"Payment Transaction Fees"},
  {code:"7720",name:"Interest Expense — Short-term"},
  // Other Admin (7800–7899)
  {code:"7800",name:"Other Administrative Expenses",defaultVatCode:"1"},
  {code:"7830",name:"Bad Debt Write-off"},
  {code:"7890",name:"Miscellaneous Expenses"},
  // Extraordinary (7900–7999)
  {code:"7900",name:"Extraordinary Expenses"},
  // ── 8000s FINANCE ITEMS ───────────────────────────────────────
  {code:"8000",name:"Interest Income"},
  {code:"8010",name:"Dividend Income"},
  {code:"8020",name:"Gain on Sale of Investments"},
  {code:"8030",name:"Currency Gain"},
  {code:"8100",name:"Interest Expense — Long-term"},
  {code:"8110",name:"Currency Loss"},
  {code:"8120",name:"Loss on Sale of Investments"},
  {code:"8300",name:"Extraordinary Income"},
  {code:"8320",name:"Extraordinary Expense"},
  {code:"8800",name:"Income Tax Expense"},
  {code:"8810",name:"Deferred Tax Expense"},
  // ── 9000s INTERNAL / CLEARING ─────────────────────────────────
  {code:"9000",name:"Internal Settlement Account"},
  {code:"9100",name:"Clearing Account"},
  {code:"9200",name:"Opening Balance Account"},
].map(a=>({...a,matchable:a.code==="1500"||a.code==="2400"}));

export { DEFAULT_ACCOUNTS };
