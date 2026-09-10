// Generates a SAF-T Financial XML from a synthetic dataset and validates it
// against Skatteetaten's official Norwegian_SAF-T_Financial_Schema_v_1.30.xsd.
//
//   node scripts/validate-saft.mjs
//
// Exit 0 = valid. Needs `xmllint` on PATH (ships with macOS / most Linux).
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSAFTXml } from "../src/lib/saft.js";

const here = dirname(fileURLToPath(import.meta.url));
const xsd = join(here, "saft", "Norwegian_SAF-T_Financial_Schema_v_1.30.xsd");

// Dataset deliberately exercises: every account class, a customer + supplier
// (one with an org number, one without), credit-side balances, output & input
// VAT, an opening-period transaction, and XML-special characters.
const accounts = [
  { code:"1500", name:"Kundefordringer" }, { code:"1920", name:"Bankinnskudd" },
  { code:"2400", name:"Leverandørgjeld" }, { code:"2710", name:"Inngående mva" },
  { code:"2700", name:"Utgående mva" },    { code:"3000", name:"Salgsinntekt" },
  { code:"4000", name:"Varekjøp" },        { code:"6300", name:'Leie lokale & "annet"' },
];
const projects = [{ id:"proj_1", number:"01", name:"Nybygg Storgata" }];
const contacts = [
  { id:"10001", type:"customer", name:"Kunde & Co AS", orgNumber:"912 345 678", address:"Storgata 1, 0155 OSLO", isCompany:true },
  { id:"20001", type:"supplier", name:"Leverandør <Test> AS", orgNumber:"923456789", address:"Bakkeveien 9, 5003 BERGEN", isCompany:true },
  { id:"20002", type:"supplier", name:"Person uten orgnr", orgNumber:"", address:"", isCompany:false },
];
const transactions = [
  { bilag:1, date:"2026-02-03", debitCode:"1500", creditCode:"3000", amount:12500, projectId:"proj_1", description:"Faktura 1001", contactId:"10001", invoiceNo:"1001", dueDate:"2026-03-05", vatCode:"3", vatPct:25, vatAmount:2500 },
  { bilag:2, date:"2026-02-10", debitCode:"4000", creditCode:"2400", amount:6250, description:"Innkjøp varer", contactId:"20001", invoiceNo:"INV-77", dueDate:"2026-03-10", vatCode:"1", vatPct:25, vatAmount:1250 },
  { bilag:3, date:"2026-03-01", debitCode:"6300", creditCode:"1920", amount:9000, description:"Husleie", contactId:null },
  { bilag:4, date:"2026-03-06", debitCode:"1920", creditCode:"1500", amount:12500, description:"Innbetaling", contactId:"10001" },
  { bilag:5, date:"2026-01-05", debitCode:"2400", creditCode:"1920", amount:1000, description:"Delbetaling", contactId:"20002" },
];

const xml = buildSAFTXml({
  accounts, contacts, transactions,
  companyProfile:{ orgNumber:"887124132", companyName:"RedRock Test AS", address:"Testveien 4, 0123 OSLO", phone:"22334455", bankAccount:"1234 56 78901" },
  dateFrom:"2026-01-01", dateTo:"2026-12-31", userEmail:"test@example.com", projects,
});

const dir = mkdtempSync(join(tmpdir(), "saft-"));
const out = join(dir, "out.xml");
writeFileSync(out, xml);
try {
  execFileSync("xmllint", ["--noout", "--schema", xsd, out], { stdio:["ignore","pipe","pipe"] });
  console.log("✓ SAF-T output validates against Norwegian_SAF-T_Financial_Schema_v_1.30.xsd");
} catch (e) {
  console.error("✗ SAF-T validation FAILED:\n" + (e.stderr?.toString() || e.message));
  process.exit(1);
}
