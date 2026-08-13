// Account series (chart of accounts groupings) and seed data.
// Seed data (INIT_*) is demo/starter data only — once Supabase persistence
// is wired in per client, these become the "new company" defaults rather
// than the live dataset.

export const SERIES = {
  "1000": { name: "Assets", color: "#00875A", bg: "#E6F6F1", icon: "🏦" },
  "1500": { name: "Accounts Receivable", color: "#0057B8", bg: "#EBF2FF", icon: "📥" },
  "1900": { name: "Bank", color: "#1D4ED8", bg: "#DBEAFE", icon: "🏧" },
  "2000": { name: "Equity", color: "#7C3AED", bg: "#EDE9FE", icon: "📊" },
  "2400": { name: "Accounts Payable", color: "#D0021B", bg: "#FFF0F2", icon: "📤" },
  "3000": { name: "Income", color: "#00875A", bg: "#E6F6F1", icon: "💰" },
  "4000": { name: "Expenses", color: "#B45309", bg: "#FFF8EC", icon: "💸" },
};

export const INIT_ACCOUNTS = [
  { code: "1001", name: "Cash in Hand" },
  { code: "1500", name: "Accounts Receivable" },
  { code: "1901", name: "Meezan Bank" },
  { code: "1902", name: "HBL Account" },
  { code: "2001", name: "Share Capital" },
  { code: "2400", name: "Accounts Payable" },
  { code: "3001", name: "Salary Income" },
  { code: "3002", name: "Freelance Income" },
  { code: "4001", name: "Rent" },
  { code: "4002", name: "Food & Groceries" },
  { code: "4003", name: "Transport" },
  { code: "4004", name: "Utilities" },
];

export const INIT_CONTACTS = [
  { id: "C001", type: "customer", name: "Customer A", notes: "" },
  { id: "C002", type: "customer", name: "Customer B", notes: "" },
  { id: "S001", type: "supplier", name: "Ali Traders", notes: "" },
  { id: "S002", type: "supplier", name: "Khan & Co", notes: "" },
];

export const INIT_TXN = [
  { id: 1, bilag: 1, date: "2026-06-01", debitCode: "1901", creditCode: "3001", description: "June Salary", amount: 80000 },
  { id: 2, bilag: 2, date: "2026-06-02", debitCode: "4001", creditCode: "1901", description: "June Rent", amount: 25000 },
  { id: 3, bilag: 3, date: "2026-06-05", debitCode: "4002", creditCode: "1001", description: "Groceries", amount: 8500 },
  { id: 4, bilag: 4, date: "2026-06-10", debitCode: "1901", creditCode: "3002", description: "Website Project", amount: 35000 },
  { id: 5, bilag: 5, date: "2026-06-12", debitCode: "4003", creditCode: "1001", description: "Fuel", amount: 4200 },
  { id: 6, bilag: 6, date: "2026-06-15", debitCode: "4004", creditCode: "1901", description: "Electricity Bill", amount: 6800 },
  { id: 7, bilag: 7, date: "2026-06-18", debitCode: "1901", creditCode: "2400", description: "Supplier Payment Ali", amount: 15000, contactId: "S001" },
  { id: 8, bilag: 8, date: "2026-06-20", debitCode: "1500", creditCode: "3001", description: "Customer A Invoice", amount: 22000, contactId: "C001" },
  { id: 9, bilag: 9, date: "2026-06-22", debitCode: "1901", creditCode: "1500", description: "Customer A Payment", amount: 22000, contactId: "C001" },
];

export const MENU = [
  { id: "Dashboard", icon: "⊞", label: "Home" },
  { id: "Transactions", icon: "✚", label: "New" },
  { id: "Accounts", icon: "◎", label: "Accounts" },
  { id: "Reports", icon: "↗", label: "Reports" },
  { id: "Settings", icon: "⚙", label: "Settings" },
];

export const SIDEBAR = [
  { id: "Dashboard", icon: "⊞", label: "Home" },
  { id: "Entries", icon: "☰", label: "Entries" },
  { id: "Transactions", icon: "✚", label: "New Entry" },
  { id: "Accounts", icon: "◎", label: "Accounts" },
  { id: "Bank", icon: "🏧", label: "Bank" },
  { id: "Reskontro", icon: "👥", label: "Reskontro" },
  { id: "Reports", icon: "↗", label: "Reports" },
  { id: "Settings", icon: "⚙", label: "Settings" },
];
