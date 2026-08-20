const T = {
  // --- COLOR PALETTE — "Watery Glass, Teal & Coral" ---
  bg:"#F3FAF9",              // soft, pale aqua-white background
  bgGradient:"radial-gradient(900px 500px at 85% -10%, rgba(45,212,191,0.16), transparent 60%), radial-gradient(700px 500px at -5% 30%, rgba(13,148,136,0.10), transparent 60%), linear-gradient(160deg,#F3FAF9 0%,#F8FBFB 45%,#FCFEFE 100%)",
  card:"#FFFFFF",            // pure white for cards
  cardBg:"#FFFFFF",          // alias, matches spec naming
  cardBgGlass:"rgba(255,255,255,0.72)", // translucent glass layer — pair with backdrop-filter:blur(16px)
  border:"#E1EEEB",          // crisp, ultra-light water-grey border
  borderGlass:"rgba(19,44,40,0.08)", // for glass panels sitting over the gradient background
  borderActive:"#B9E0D6",    // slightly deeper border for active/focus states
  // Brand
  header:"#0D7377",
  sidebar:"#0A5C60",
  accent:"#0D9488",          // teal — primary brand color
  accentHover:"#0B7A70",     // deeper teal for hover/active
  accentLight:"#E6F5F3",     // super-soft teal tint for highlights/badges (accentSubtle)
  accentMid:"#99DED4",
  accentGradient:"linear-gradient(135deg,#0D9488,#2DD4BF)", // teal gradient, used for active chips/avatars
  // Coral — secondary accent, used sparingly (a few chips/badges) to keep a
  // nod to the original brand orange without it being the primary color
  coral:"#FF6B4A",
  coralLight:"#FFEDE7",
  // Aquatic teal — used for positive/success indicators
  waterTeal:"#14B8A6",
  waterTealSubtle:"#E6F4F1", // light glassy teal, used for alternating row tint
  // Semantic (danger/error stays a true red — kept visually distinct from the
  // primary orange so "delete" and "save" buttons never read as the same action)
  red:"#DC2626",redLight:"#FEF2F2",redMid:"#FECACA",
  green:"#14B8A6",greenBg:"#E6F4F1",   // now aliased to waterTeal for positive values
  blue:"#0D7377",blueBg:"#E8F4F4",
  orange:"#D97706",orangeBg:"#FFFBEB",
  purple:"#7C3AED",purpleBg:"#EDE9FE",
  // Typography colors
  text:"#1F2937",sub:"#6B7280",muted:"#9CA3AF",
  // --- SPACING SCALE (4px grid) — for new/updated components going forward ---
  spacing:{xs:"4px",sm:"8px",md:"12px",lg:"16px",xl:"24px",xxl:"32px"},
  // --- CORNER SCALE ---
  radius:{sm:"6px",md:"10px",lg:"14px",xl:"18px"},
  // --- TYPE SCALE ---
  type:{xs:"11px",sm:"13px",md:"15px",lg:"18px",xl:"22px"},
};
const inp={background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,color:T.text,padding:"10px 13px",width:"100%",fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit"};
const btnRed={background:T.accent,color:"#fff",border:"none",borderRadius:12,padding:"11px 18px",fontWeight:700,fontSize:13,cursor:"pointer",width:"100%",fontFamily:"inherit"};
const btnGhost={background:"#fff",color:T.accent,border:`1.5px solid ${T.accent}`,borderRadius:12,padding:"10px 18px",fontWeight:700,fontSize:13,cursor:"pointer",width:"100%",fontFamily:"inherit"};
const btnSm={background:T.accentLight,color:T.accent,border:"none",borderRadius:8,padding:"6px 12px",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"};

const SERIES={
  "1000":{name:"Intangible Assets",color:"#0369A1",bg:"#EFF6FF",icon:"💡"},
  "1100":{name:"Property & Real Estate",color:"#0369A1",bg:"#EFF6FF",icon:"🏠"},
  "1200":{name:"Vehicles, Fixtures & Machinery",color:"#0369A1",bg:"#EFF6FF",icon:"⚙️"},
  "1300":{name:"Financial Fixed Assets",color:"#0369A1",bg:"#EFF6FF",icon:"🏢"},
  "1400":{name:"Inventory & Stock",color:"#059669",bg:"#ECFDF5",icon:"📦"},
  "1500":{name:"Accounts Receivable (AR)",color:"#0D7377",bg:"#E8F4F4",icon:"📥"},
  "1600":{name:"VAT & Accrued Public Grants",color:"#0D7377",bg:"#E8F4F4",icon:"📋"},
  "1700":{name:"Prepayments & Accrued Income",color:"#0D7377",bg:"#E8F4F4",icon:"⏳"},
  "1800":{name:"Short-term Investments",color:"#0D7377",bg:"#E8F4F4",icon:"📈"},
  "1900":{name:"Bank & Cash",color:"#0D7377",bg:"#E8F4F4",icon:"🏧"},
  "2000":{name:"Equity",color:"#7C3AED",bg:"#EDE9FE",icon:"📊"},
  "2100":{name:"Provisions for Liabilities",color:"#7C3AED",bg:"#EDE9FE",icon:"🏦"},
  "2200":{name:"Other Long-term Debt",color:"#7C3AED",bg:"#EDE9FE",icon:"🔒"},
  "2300":{name:"Convertible Loans & Credit Institution Debt",color:"#7C3AED",bg:"#EDE9FE",icon:"📝"},
  "2400":{name:"Accounts Payable (AP)",color:"#DC2626",bg:"#FEF2F2",icon:"📤"},
  "2500":{name:"Tax Payable",color:"#DC2626",bg:"#FEF2F2",icon:"🧾"},
  "2600":{name:"Withholding Tax & Other Deductions",color:"#DC2626",bg:"#FEF2F2",icon:"🏛️"},
  "2700":{name:"Public Duties Payable (incl. VAT)",color:"#DC2626",bg:"#FEF2F2",icon:"🧾"},
  "2800":{name:"Dividend",color:"#DC2626",bg:"#FEF2F2",icon:"💳"},
  "2900":{name:"Other Current Liabilities",color:"#DC2626",bg:"#FEF2F2",icon:"📌"},
  "3000":{name:"Sales Revenue",color:"#059669",bg:"#ECFDF5",icon:"💰"},
  "3900":{name:"Other Operating Income",color:"#059669",bg:"#ECFDF5",icon:"💹"},
  "4000":{name:"Cost of Goods Sold",color:"#D97706",bg:"#FFFBEB",icon:"🛒"},
  "5000":{name:"Payroll & Salaries",color:"#D97706",bg:"#FFFBEB",icon:"👥"},
  "6000":{name:"Depreciation & Write-downs",color:"#D97706",bg:"#FFFBEB",icon:"📉"},
  "6100":{name:"Freight & Transport (Sales)",color:"#D97706",bg:"#FFFBEB",icon:"🚚"},
  "6200":{name:"Energy, Fuel & Water (Production)",color:"#D97706",bg:"#FFFBEB",icon:"⚡"},
  "6300":{name:"Premises Cost",color:"#D97706",bg:"#FFFBEB",icon:"🏭"},
  "6400":{name:"Machine & Equipment Rental",color:"#D97706",bg:"#FFFBEB",icon:"🔩"},
  "6500":{name:"Tools & Supplies (Non-capitalized)",color:"#D97706",bg:"#FFFBEB",icon:"🧰"},
  "6600":{name:"Repairs & Maintenance",color:"#D97706",bg:"#FFFBEB",icon:"🔧"},
  "6700":{name:"External / Purchased Services",color:"#D97706",bg:"#FFFBEB",icon:"🤝"},
  "6800":{name:"Office Costs & Printed Matter",color:"#D97706",bg:"#FFFBEB",icon:"🖇️"},
  "6900":{name:"Telephone & Postage",color:"#D97706",bg:"#FFFBEB",icon:"📱"},
  "7000":{name:"Vehicle Costs",color:"#D97706",bg:"#FFFBEB",icon:"🚗"},
  "7100":{name:"Travel & Per Diem",color:"#D97706",bg:"#FFFBEB",icon:"✈️"},
  "7200":{name:"Commission Expense",color:"#D97706",bg:"#FFFBEB",icon:"🤲"},
  "7300":{name:"Sales, Advertising & Entertainment",color:"#D97706",bg:"#FFFBEB",icon:"📢"},
  "7400":{name:"Membership Fees & Gifts",color:"#D97706",bg:"#FFFBEB",icon:"🎁"},
  "7500":{name:"Insurance & Service Costs",color:"#D97706",bg:"#FFFBEB",icon:"🛡️"},
  "7600":{name:"License & Patent Costs",color:"#D97706",bg:"#FFFBEB",icon:"📜"},
  "7700":{name:"Other Costs",color:"#D97706",bg:"#FFFBEB",icon:"💸"},
  "7800":{name:"Losses",color:"#D97706",bg:"#FFFBEB",icon:"⚠️"},
  "7900":{name:"Accruals",color:"#D97706",bg:"#FFFBEB",icon:"📁"},
  "8000":{name:"Finance Income",color:"#059669",bg:"#ECFDF5",icon:"📊"},
  "8100":{name:"Finance Expenses",color:"#D97706",bg:"#FFFBEB",icon:"💱"},
  "8200":{name:"Group Transactions",color:"#6B7280",bg:"#F9FAFB",icon:"🔗"},
  "8300":{name:"Tax on Ordinary Result",color:"#6B7280",bg:"#F9FAFB",icon:"🧾"},
  "8400":{name:"Extraordinary Income",color:"#059669",bg:"#ECFDF5",icon:"⭐"},
  "8500":{name:"Extraordinary Expense",color:"#D97706",bg:"#FFFBEB",icon:"⭐"},
  "8600":{name:"Tax on Extraordinary Result",color:"#6B7280",bg:"#F9FAFB",icon:"🧾"},
  "8800":{name:"Annual Result",color:"#6B7280",bg:"#F9FAFB",icon:"🏁"},
  "8900":{name:"Transfers & Allocations",color:"#6B7280",bg:"#F9FAFB",icon:"🔀"},
  "9000":{name:"Internal / Clearing",color:"#6B7280",bg:"#F9FAFB",icon:"🔄"},
};

// Norwegian NS 4102 — maps any account code to its SERIES group key
const getSK=(code)=>{
  const n=parseInt(code);
  if(isNaN(n))return null;
  // 1xxx — Assets (balance sheet)
  if(n>=1000&&n<1100)return"1000";
  if(n>=1100&&n<1200)return"1100";
  if(n>=1200&&n<1300)return"1200";
  if(n>=1300&&n<1400)return"1300";
  if(n>=1400&&n<1500)return"1400";
  if(n>=1500&&n<1600)return"1500";
  if(n>=1600&&n<1700)return"1600";
  if(n>=1700&&n<1800)return"1700";
  if(n>=1800&&n<1900)return"1800";
  if(n>=1900&&n<2000)return"1900";
  // 2xxx — Equity & Liabilities (balance sheet)
  if(n>=2000&&n<2100)return"2000";
  if(n>=2100&&n<2200)return"2100";
  if(n>=2200&&n<2300)return"2200";
  if(n>=2300&&n<2400)return"2300";
  if(n>=2400&&n<2500)return"2400";
  if(n>=2500&&n<2600)return"2500";
  if(n>=2600&&n<2700)return"2600";
  if(n>=2700&&n<2800)return"2700";
  if(n>=2800&&n<2900)return"2800";
  if(n>=2900&&n<3000)return"2900";
  // 3xxx — Revenue (income statement)
  if(n>=3000&&n<3900)return"3000";
  if(n>=3900&&n<4000)return"3900";
  // 4xxx — Cost of goods sold (income statement)
  if(n>=4000&&n<5000)return"4000";
  // 5xxx — Payroll (income statement)
  if(n>=5000&&n<6000)return"5000";
  // 6xxx — sub-grouped by hundred, matching the real NS 4102 breakdown
  // (only 6000-6099 is depreciation — the rest is nine unrelated categories)
  if(n>=6000&&n<6100)return"6000";
  if(n>=6100&&n<6200)return"6100";
  if(n>=6200&&n<6300)return"6200";
  if(n>=6300&&n<6400)return"6300";
  if(n>=6400&&n<6500)return"6400";
  if(n>=6500&&n<6600)return"6500";
  if(n>=6600&&n<6700)return"6600";
  if(n>=6700&&n<6800)return"6700";
  if(n>=6800&&n<6900)return"6800";
  if(n>=6900&&n<7000)return"6900";
  // 7xxx — Other operating expenses (income statement) — sub-grouped by hundred
  if(n>=7000&&n<7100)return"7000";
  if(n>=7100&&n<7200)return"7100";
  if(n>=7200&&n<7300)return"7200";
  if(n>=7300&&n<7400)return"7300";
  if(n>=7400&&n<7500)return"7400";
  if(n>=7500&&n<7600)return"7500";
  if(n>=7600&&n<7700)return"7600";
  if(n>=7700&&n<7800)return"7700";
  if(n>=7800&&n<7900)return"7800";
  if(n>=7900&&n<8000)return"7900";
  // 8xxx — Finance items (income statement / balance)
  if(n>=8000&&n<8100)return"8000";
  if(n>=8100&&n<8200)return"8100";
  if(n>=8200&&n<8300)return"8200";
  if(n>=8300&&n<8400)return"8300";
  if(n>=8400&&n<8500)return"8400";
  if(n>=8500&&n<8600)return"8500";
  if(n>=8600&&n<8800)return"8600";
  if(n>=8800&&n<8900)return"8800";
  if(n>=8900&&n<9000)return"8900";
  // 9xxx — Internal/clearing
  if(n>=9000&&n<=9999)return"9000";
  return null;
};

export { T, inp, btnRed, btnGhost, btnSm, SERIES, getSK };
