import { getSK } from "./theme.js";

// Membership checks against either a Set or an Array, safely, regardless of
// which one the caller actually holds. Built after a real bug: attachedTxnIds
// is a Set everywhere in this app except one screen that called .includes()
// on it as if it were an array — Set doesn't have .includes(), Array
// doesn't have .has(), and nothing caught the mismatch until it crashed in
// production. Using this instead of raw .has()/.includes() calls makes
// that specific class of bug structurally impossible to repeat, since the
// check works correctly no matter which collection type shows up.
// Opens a fully-formed HTML string in a new tab as a real, navigable blob
// document instead of the old window.open("","_blank") + document.write()
// pattern. That pattern opens a completely blank page and only writes into
// it afterward — modern browsers (Chrome especially) treat a blank-URL
// window.open as far more suspicious than one given a real URL/document,
// and were blocking it almost every time, not just occasionally. Giving
// window.open a real blob: URL up front is what a normal "open in new tab"
// looks like to a popup blocker, and is dramatically less likely to be
// blocked at all.
export function openHtmlInNewTab(html, windowFeatures) {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = windowFeatures ? window.open(url, "_blank", windowFeatures) : window.open(url, "_blank");
  if (!w) {
    URL.revokeObjectURL(url);
    alert("Your browser blocked this new tab — please allow pop-ups for this site and try again.");
    return null;
  }
  // Revoke well after the tab has had time to load the blob — revoking
  // immediately can blank the tab out before it finishes reading it.
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  return w;
}

export function hasId(collection, id) {
  if (!collection) return false;
  if (typeof collection.has === "function") return collection.has(id);
  if (typeof collection.includes === "function") return collection.includes(id);
  return false;
}

const INCOME_SK=new Set(["3000","3900","8000","8400"]);
const EXPENSE_SK=new Set(["4000","5000","6000","6100","6200","6300","6400","6500","6600","6700","6800","6900","7000","7100","7200","7300","7400","7500","7600","7700","7800","7900","8100","8200","8300","8500","8600"]);

// Real Norwegian MVA-koder (Skatteetaten's standard VAT code list, same set
// Tripletex uses) — the common ones a typical SME actually posts against.
// Each carries its rate, direction (output = charged on sales, input =
// reclaimed on purchases), and the GL account its VAT amount settles to —
// taken directly from a real Regnskapsregler export so the numbers are
// verified against an actual company's setup, not guessed.
const MVA_CODES=[
  {code:"3",name:"Utgående avgift, høy sats",direction:"output",rate:25,settleAccount:"2700"},
  {code:"31",name:"Utgående avgift, middels sats",direction:"output",rate:15,settleAccount:"2701"},
  {code:"33",name:"Utgående avgift, lav sats",direction:"output",rate:12,settleAccount:"2702"},
  {code:"5",name:"Ingen utgående avgift (innenfor mva-loven)",direction:"output",rate:0,settleAccount:null},
  {code:"51",name:"Avgiftsfri innlands omsetning med omvendt avgiftsplikt",direction:"output",rate:0,settleAccount:null},
  {code:"52",name:"Avgiftsfri utførsel av varer og tjenester",direction:"output",rate:0,settleAccount:null},
  {code:"6",name:"Ingen utgående avgift (utenfor mva-loven)",direction:"output",rate:0,settleAccount:null},
  {code:"7",name:"Ingen avgiftsbehandling (inntekter)",direction:"output",rate:0,settleAccount:null},
  {code:"1",name:"Fradrag inngående avgift, høy sats",direction:"input",rate:25,settleAccount:"2710"},
  {code:"11",name:"Fradrag inngående avgift, middels sats",direction:"input",rate:15,settleAccount:"2711"},
  {code:"13",name:"Fradrag inngående avgift, lav sats",direction:"input",rate:12,settleAccount:"2712"},
];
// Which sales accounts the real chart posts each output rate to (from the
// same reference) — used to suggest the right MVA-kode from the account
// picked, instead of asking the person to know the code number by heart.
const SALES_ACCOUNT_VAT_RATE={"3000":25,"3001":15,"3002":12,"3011":11.11,"3100":0,"3200":0};
const vatCodeForRate=(rate,direction)=>MVA_CODES.find(c=>c.direction===direction&&c.rate===rate)||null;
// Sales (output) vs purchase (input) each get their OWN single-digit MVA
// code list — a sale posts against one outgoing code (e.g. "3"), never the
// paired kjøp/salg codes a purchase voucher uses. This mirrors the real
// Norwegian code list (and Tripletex's own dropdown) instead of a single
// generic list shared by both directions.
const vatCodeOptions=(direction)=>MVA_CODES.filter(c=>c.direction===direction);
const findVatCode=(code,direction)=>MVA_CODES.find(c=>c.code===code&&c.direction===direction)||null;

const isIncomeSK=(code)=>INCOME_SK.has(getSK(code));
const isExpenseSK=(code)=>EXPENSE_SK.has(getSK(code));
// Reports (Income Statement, Balance Sheet, Monthly Overview...) group by
// filtering `accounts` for a given series key — but a transaction can
// reference a code that never actually got saved into the chart of accounts
// (see AccountPlanScreen's orphan-detection banner for the same root cause).
// Filtering `accounts` alone silently drops that code's activity from every
// report. This returns the known accounts for a series key PLUS a synthetic
// placeholder entry for any code touched by a transaction but missing from
// the chart, so nothing with real activity is ever left out of a report.
const accountsForSK=(accounts,transactions,sk)=>{
  const known=accounts.filter(a=>getSK(a.code)===sk);
  const knownCodes=new Set(known.map(a=>a.code));
  const orphanCodes=new Set();
  (transactions||[]).forEach(t=>{
    if(t.debitCode&&getSK(t.debitCode)===sk&&!knownCodes.has(t.debitCode))orphanCodes.add(t.debitCode);
    if(t.creditCode&&getSK(t.creditCode)===sk&&!knownCodes.has(t.creditCode))orphanCodes.add(t.creditCode);
  });
  return[...known,...[...orphanCodes].sort().map(code=>({code,name:"(Not in chart of accounts)"}))];
};
// An account's `notes` field sometimes holds structured bank details (branch,
// account number) as JSON rather than free text — see BankAccountDetailsModal.
// This renders whichever it actually is, instead of showing raw JSON.
const displayNotes=(notes)=>{
  if(!notes)return"";
  try{
    const parsed=JSON.parse(notes);
    if(parsed&&typeof parsed==="object"){
      return[parsed.bankName,parsed.branch,parsed.accountNumber].filter(Boolean).join(" · ");
    }
  }catch{}
  return notes;
};
// Every direct browser call to Anthropic's API needs three headers Anthropic
// requires specifically for client-side use — x-api-key, anthropic-version,
// and anthropic-dangerous-direct-browser-access. Without them every call
// fails with a CORS/auth error, which is why "Extract text" and AI
// Bookkeeping never actually worked outside Claude.ai's own preview sandbox
// (which injects a key automatically — a real deployed copy of this app has
// no such thing). This is a "bring your own key" pattern: each person pastes
// their own Anthropic API key in Settings, stored only in their own browser,
// never sent anywhere but api.anthropic.com.
const ANTHROPIC_KEY_STORAGE="rr_anthropic_api_key";
const getAnthropicKey=()=>{try{return localStorage.getItem(ANTHROPIC_KEY_STORAGE)||"";}catch{return"";}};
const setAnthropicKey=(key)=>{try{if(key)localStorage.setItem(ANTHROPIC_KEY_STORAGE,key);else localStorage.removeItem(ANTHROPIC_KEY_STORAGE);}catch{}};
const callClaudeAPI=async(body)=>{
  const key=getAnthropicKey();
  if(!key)return{error:"NO_KEY"};
  try{
    const res=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "x-api-key":key,
        "anthropic-version":"2023-06-01",
        "anthropic-dangerous-direct-browser-access":"true",
      },
      body:JSON.stringify(body),
    });
    const data=await res.json();
    if(!res.ok||data.type==="error")return{error:(data.error&&data.error.message)||`Request failed (${res.status})`};
    return{data};
  }catch(e){return{error:e.message||"Network error"};}
};
const fmt=(n)=>new Intl.NumberFormat("en-PK",{maximumFractionDigits:0}).format(Math.abs(n));
const fmtRs=(n)=>new Intl.NumberFormat("en-PK",{style:"currency",currency:"PKR",maximumFractionDigits:0}).format(Math.abs(n));

// Shared bank-statement helpers — used both by the initial auto-detect parse
// and by the manual column-remap UI in Bank Reconciliation, so both agree on
// exactly how a cell becomes a date/number.
const bankToDateStr=(d)=>{
  if(typeof d==="number"){const dt=XLSX.SSF.parse_date_code(d);return`${dt.y}-${String(dt.m).padStart(2,"0")}-${String(dt.d).padStart(2,"0")}`;}
  const s=String(d).trim();
  // Real Norwegian bank exports (Bokført dato / Rentedato) write dates as
  // dd.mm.yyyy — e.g. "01.07.2026". Date.parse on that format is NOT
  // standardized: V8 silently accepts it but as something else entirely
  // (observed: "01.07.2026" → 2026-01-06, i.e. it got read as some other
  // field order, not July 1st) — no error, just a wrong date shipped into
  // every transaction. Matching the explicit dd.mm.yyyy/dd.mm.yy or
  // dd/mm/yyyy pattern FIRST avoids ever handing an ambiguous string like
  // that to Date.parse; only a genuinely unrecognized format falls through
  // to the old behavior.
  let m=s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
  if(m)return`${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
  m=s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2})$/);
  if(m)return`20${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
  const parsed=Date.parse(s);
  return isNaN(parsed)?null:new Date(parsed).toISOString().slice(0,10);
};
const bankToNum=(v)=>{
  if(typeof v==="number")return v;
  let s=String(v).trim();
  if(!s)return null;
  let neg=false;
  if(/^\(.*\)$/.test(s)){neg=true;s=s.slice(1,-1);}
  if(s.startsWith("-")){neg=true;s=s.slice(1);}
  s=s.replace(/[^\d.,]/g,"");
  if(!s)return null;
  // Real bank exports mix both conventions: "1,234.56" (US/UK — comma
  // thousands, dot decimal) and "1.234,56" (Norwegian and most of Europe —
  // dot thousands, comma decimal). The old version only ever stripped
  // commas and left dots alone, which is exactly backwards for a Norwegian
  // file: "4.402,36" became "4.40236" (a hundredth of the real value), and
  // "-100.000,00" became "-100" (a thousandth). Detect which mark is
  // actually acting as the decimal separator — whichever one appears LAST
  // in the string is the decimal point; the other, if present, is a
  // thousands separator and gets dropped. Same convention-detection
  // parseAmountToken (used for manual entry) already gets right.
  const lastComma=s.lastIndexOf(","),lastDot=s.lastIndexOf(".");
  let decimalSep=null;
  if(lastComma>-1&&lastDot>-1)decimalSep=lastComma>lastDot?",":".";
  else if(lastComma>-1)decimalSep=(s.length-lastComma-1)===2?",":null;
  else if(lastDot>-1)decimalSep=(s.length-lastDot-1)===2?".":null;
  let intPart=s,fracPart="";
  if(decimalSep){const idx=s.lastIndexOf(decimalSep);intPart=s.slice(0,idx);fracPart=s.slice(idx+1);}
  intPart=intPart.replace(/[.,]/g,"");
  const n=parseFloat(intPart+(fracPart?"."+fracPart:""));
  if(isNaN(n))return null;
  return neg?-n:n;
};
// Turns raw sheet rows + a column mapping into the {date,description,amount,balance}
// rows the import preview/commit expects. cols uses -1 for "not selected".
const buildBankRows=(rawRows,cols,dataStart=0)=>{
  const{dateCol,descCol,amountCol,debitCol,creditCol,balanceCol}=cols;
  let out=rawRows.map((r,i)=>{
    const date=bankToDateStr(r[dateCol]);
    const description=String(r[descCol]||"").trim();
    let amount=null;
    if(amountCol>=0)amount=bankToNum(r[amountCol]);
    else if(debitCol>=0||creditCol>=0){
      const dr=debitCol>=0?bankToNum(r[debitCol]):null;
      const cr=creditCol>=0?bankToNum(r[creditCol]):null;
      amount=(cr||0)-(dr||0);
    }
    return{rowNum:dataStart+i+1,date,description,amount,balance:balanceCol>=0?bankToNum(r[balanceCol]):null,raw:r};
  });
  const skippedNoDate=out.filter(r=>!r.date).length;
  out=out.filter(r=>r.date);
  if(out.length&&out.every(r=>r.amount==null)&&out.some(r=>r.balance!=null)){
    out=out.map((r,i)=>i===0?{...r,amount:0}:{...r,amount:Math.round(((r.balance||0)-(out[i-1].balance||0))*100)/100});
    out=out.slice(1);
  }
  const skippedZeroOrBad=out.filter(r=>r.amount==null||r.amount===0).length;
  out=out.filter(r=>r.amount!=null&&r.amount!==0);
  return{rows:out,skippedNoDate,skippedZeroOrBad};
};
const fmtB=(n)=>`B${String(n).padStart(3,"0")}`;

// Real bank exports are rarely comma-CSV in practice — Norwegian bank
// portals (and most of Europe) export semicolon-delimited text, and browser
// File.text() always decodes as UTF-8, which silently mangles Nordic
// characters (ø/å/æ) into replacement characters (�) when the actual file
// is Windows-1252/ISO-8859-1 encoded (extremely common for these exports).
// Neither of those was previously handled: comma-only delimiter detection
// meant a semicolon file's numeric fields (which use "." for thousands and
// "," for decimals, e.g. "4.402,36") would get shredded at every comma, and
// UTF-8-only decoding corrupted description text. This decodes the raw
// bytes, detects mojibake, and falls back to Windows-1252 automatically.
const decodeTextSmart=(buf)=>{
  const utf8=new TextDecoder("utf-8",{fatal:false}).decode(buf);
  if(utf8.includes("�")){
    try{return new TextDecoder("windows-1252").decode(buf);}catch{}
  }
  return utf8;
};
// Detects which of comma/semicolon/tab is actually acting as the field
// separator by counting occurrences in the first non-empty line — semicolon
// wins whenever a file's numbers use commas as decimal separators (as here),
// since those commas would otherwise be mistaken for the delimiter itself.
const detectDelimiter=(text)=>{
  const firstLine=(text.split(/\r\n|\n/).find(l=>l.trim())||"");
  const counts={",":(firstLine.match(/,/g)||[]).length,";":(firstLine.match(/;/g)||[]).length,"\t":(firstLine.match(/\t/g)||[]).length};
  return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][1]>0?Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0]:",";
};
// A small RFC4180-aware delimited-text parser (quoted fields, "" as an
// escaped quote, delimiter of choice) — used instead of handing raw text to
// XLSX's CSV reader so the actual delimiter is never guessed wrong. Returns
// an array of rows, each an array of cell strings, matching the shape
// XLSX.utils.sheet_to_json(ws,{header:1}) already returns elsewhere.
const parseDelimitedText=(text,delim)=>{
  const rows=[];
  let row=[],cell="",inQuotes=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(inQuotes){
      if(c==='"'){
        if(text[i+1]==='"'){cell+='"';i++;}
        else inQuotes=false;
      } else cell+=c;
    } else if(c==='"')inQuotes=true;
    else if(c===delim){row.push(cell);cell="";}
    else if(c==="\n"||c==="\r"){
      if(c==="\r"&&text[i+1]==="\n")i++;
      row.push(cell);cell="";
      if(row.some(v=>v!=="")||rows.length)rows.push(row);
      row=[];
    } else cell+=c;
  }
  if(cell!==""||row.length){row.push(cell);rows.push(row);}
  return rows.filter(r=>r.some(v=>v.trim()!==""));
};

export { INCOME_SK, EXPENSE_SK, MVA_CODES, SALES_ACCOUNT_VAT_RATE, vatCodeForRate, vatCodeOptions, findVatCode, isIncomeSK, isExpenseSK, accountsForSK, displayNotes, ANTHROPIC_KEY_STORAGE, getAnthropicKey, setAnthropicKey, callClaudeAPI, fmt, fmtRs, bankToDateStr, bankToNum, buildBankRows, fmtB, decodeTextSmart, detectDelimiter, parseDelimitedText };
