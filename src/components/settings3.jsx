import { useState } from "react";
import { T, inp } from "../lib/theme.js";
import { getAnthropicKey, setAnthropicKey, fmt } from "../lib/utils.js";
import { AccDrop, FlexDateInput } from "./ledger.jsx";

function CustomerImportScreen({contacts,setContacts}){
  const[importType,setImportType]=useState(null); // null | "customer" | "supplier"
  const[importing,setImporting]=useState(false);
  const[importError,setImportError]=useState("");
  const[importResult,setImportResult]=useState(null);
  const[howTab,setHowTab]=useState("read");

  const doImport=async(file,type)=>{
    setImportError("");setImportResult(null);setImporting(true);
    try{
      const isCsv=/\.csv$/i.test(file.name);
      const wb=isCsv?XLSX.read(await file.text(),{type:"string"}):XLSX.read(await file.arrayBuffer(),{type:"array"});
      const json=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});
      if(!json.length){setImportError("That file appears to be empty.");setImporting(false);return;}
      const existingNums=contacts.filter(c=>c.type===type).map(c=>parseInt((c.id||"").slice(1))||0);
      let next=(existingNums.length?Math.max(...existingNums):0)+1;
      const prefix=type==="customer"?"C":"S";
      const newContacts=[];let skipped=0;
      json.forEach(row=>{
        const name=String(row.Name||row.name||row.Navn||"").trim();
        if(!name){skipped++;return;}
        newContacts.push({
          id:`${prefix}${String(next++).padStart(3,"0")}`,type,name,
          email:String(row.Email||row.email||row["E-post"]||"").trim(),
          phone:String(row.Phone||row.phone||row.Telefon||"").trim(),
          address:String(row.Address||row.address||row.Adresse||"").trim(),
          paymentTermsDays:30,
        });
      });
      if(!newContacts.length){setImportError(`No usable rows found${skipped?` (${skipped} skipped — missing a name)`:""}.`);setImporting(false);return;}
      setContacts(p=>[...p,...newContacts]);
      setImportResult({count:newContacts.length,skipped});
    }catch(e){setImportError("Couldn't read that file. Make sure it's a CSV or Excel export.");}
    setImporting(false);
  };

  if(!importType){
    return(
      <div style={{maxWidth:1000}}>
        <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 16px"}}>Import</h1>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          {[["customer","Customer","Import your customers here.","ti-user"],["supplier","Supplier","Import your suppliers here.","ti-file-invoice"]].map(([id,label,desc,icon])=>(
            <div key={id} style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:24,display:"flex",gap:18,alignItems:"center"}}>
              <div style={{width:56,height:56,borderRadius:"50%",background:T.accentLight,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <i className={`ti ${icon}`} style={{fontSize:26,color:T.accent}}/>
              </div>
              <div>
                <div style={{fontSize:15,fontWeight:800,color:T.text,marginBottom:4}}>{label}</div>
                <div style={{fontSize:12,color:T.muted,marginBottom:10}}>{desc}</div>
                <button onClick={()=>{setImportType(id);setImportResult(null);setImportError("");}} style={{background:T.accentLight,color:T.accent,border:"none",borderRadius:8,padding:"8px 16px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Go to import →</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return(
    <div style={{maxWidth:1000}}>
      <div onClick={()=>setImportType(null)} style={{fontSize:11,color:T.accent,fontWeight:600,cursor:"pointer",marginBottom:8,display:"flex",alignItems:"center",gap:4}}><i className="ti ti-chevron-left" style={{fontSize:12}}/>Import</div>
      <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 16px"}}>Import — {importType==="customer"?"Customer":"Supplier"}</h1>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:20}}>
          <div style={{fontSize:14,fontWeight:800,color:T.text,marginBottom:14}}>Choose import file</div>
          <label style={{display:"block",border:`2px dashed ${T.border}`,borderRadius:10,padding:"36px 16px",textAlign:"center",cursor:importing?"wait":"pointer",background:T.bg}}>
            <i className="ti ti-cloud-upload" style={{fontSize:26,color:T.muted,display:"block",marginBottom:8}}/>
            <div style={{fontSize:12,color:T.sub}}>{importing?"Importing…":"Allowed formats are text/csv, .xls and .xlsx."}</div>
            <input type="file" accept=".csv,.xlsx,.xls" disabled={importing} style={{display:"none"}} onChange={e=>{if(e.target.files[0])doImport(e.target.files[0],importType);e.target.value="";}}/>
          </label>
          {importError&&<div style={{background:T.redLight,color:T.red,borderRadius:8,padding:"10px 14px",fontSize:12,marginTop:14}}>{importError}</div>}
          {importResult&&<div style={{background:T.greenBg,color:T.green,borderRadius:8,padding:"10px 14px",fontSize:12,marginTop:14}}>Imported {importResult.count} {importType}{importResult.count===1?"":"s"}{importResult.skipped?` (${importResult.skipped} skipped — missing a name)`:""}.</div>}
        </div>
        <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:20}}>
          <div style={{fontSize:14,fontWeight:800,color:T.text,marginBottom:14}}>How does import work?</div>
          <div style={{display:"flex",gap:6,marginBottom:14}}>
            <button onClick={()=>setHowTab("read")} style={{background:howTab==="read"?T.accent:"none",color:howTab==="read"?"#fff":T.sub,border:`1px solid ${howTab==="read"?T.accent:T.border}`,borderRadius:7,padding:"6px 12px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Read how it's done</button>
          </div>
          <p style={{fontSize:12,color:T.sub,marginBottom:14}}>Choose the file to import. You don't need to prepare the file in advance — matching columns like Name, Email, Phone, and Address will be picked up automatically.</p>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {[["1","Content","Column headers like Name/Email/Phone/Address are matched automatically."],["2","Validation","Rows missing a name are skipped and reported after import."],["3","Result","See exactly how many were imported and how many were skipped."]].map(([n,t,d])=>(
              <div key={n} style={{display:"flex",gap:10}}>
                <div style={{fontSize:18,fontWeight:800,color:n==="3"?T.green:n==="2"?T.orange:T.accent,width:20,flexShrink:0}}>{n}</div>
                <div><div style={{fontSize:12,fontWeight:700,color:T.text}}>{t}</div><div style={{fontSize:11,color:T.muted}}>{d}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Customer settings — auto-numbering prefixes (informational, since we use
// C001/S001 rather than a raw numeric series) and default terms applied to
// every new customer/supplier going forward.
// Voucher settings — how vouchers get received and split, matching the
// Bilagsinnstillinger reference. Approval/attestation workflow is a genuine
// scaffolding note since it needs a real multi-user routing decision.
function VoucherSettingsScreen({companyProfile}){
  const[splitElectronic,setSplitElectronic]=useState(()=>{try{return localStorage.getItem("rr_voucher_split")==="1";}catch{return false;}});
  const[emailNoAttachment,setEmailNoAttachment]=useState(()=>{try{return localStorage.getItem("rr_voucher_email_no_att")==="1";}catch{return false;}});
  const[apiKey,setApiKeyState]=useState(()=>getAnthropicKey());
  const[showKey,setShowKey]=useState(false);
  const[keySaved,setKeySaved]=useState(false);
  const saveKey=()=>{setAnthropicKey(apiKey.trim());setKeySaved(true);setTimeout(()=>setKeySaved(false),1800);};
  const inboxEmail=companyProfile&&companyProfile.companyName?`${companyProfile.companyName.toLowerCase().replace(/[^a-z0-9]/g,"")}@redrock-inbox.com`:"yourcompany@redrock-inbox.com";
  return(
    <div style={{maxWidth:800}}>
      <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 16px"}}>Voucher settings</h1>
      <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:20,marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:800,color:T.text,marginBottom:8}}>AI features</div>
        <p style={{fontSize:12,color:T.muted,marginBottom:12}}>"Extract text from image", AI Bookkeeping, and the Assistant chat all call Anthropic's API directly from your browser — that needs your own Anthropic API key. It's stored only in this browser (never sent to us or to Supabase), so each device/team member needs to add their own once. Get a key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" style={{color:T.accent}}>console.anthropic.com</a>.</p>
        <div style={{display:"flex",gap:8,marginBottom:6}}>
          <input type={showKey?"text":"password"} placeholder="sk-ant-…" value={apiKey} onChange={e=>setApiKeyState(e.target.value)} style={{...inp,flex:1,fontFamily:"monospace",fontSize:12}}/>
          <button onClick={()=>setShowKey(s=>!s)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"0 12px",fontSize:12,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>{showKey?"Hide":"Show"}</button>
          <button onClick={saveKey} style={{background:keySaved?T.green:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"0 16px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{keySaved?"✓ Saved":"Save"}</button>
        </div>
        {getAnthropicKey()&&<div style={{fontSize:11,color:T.green,fontWeight:600}}>✓ A key is set on this browser.</div>}
      </div>
      <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:20,marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:800,color:T.text,marginBottom:16}}>Voucher inbox</div>
        <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:T.text,cursor:"pointer",marginBottom:12}}>
          <input type="checkbox" checked={splitElectronic} onChange={e=>{setSplitElectronic(e.target.checked);try{localStorage.setItem("rr_voucher_split",e.target.checked?"1":"0");}catch{}}}/>
          Split multi-page electronic vouchers automatically
        </label>
        <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:T.text,cursor:"pointer",marginBottom:14}}>
          <input type="checkbox" checked={emailNoAttachment} onChange={e=>{setEmailNoAttachment(e.target.checked);try{localStorage.setItem("rr_voucher_email_no_att",e.target.checked?"1":"0");}catch{}}}/>
          Allow emails to be received without an attachment
        </label>
        <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Email address for receiving invoices and vouchers</div>
        <div style={{...inp,background:T.bg,color:T.sub}}>{inboxEmail}</div>
        <p style={{fontSize:11,color:T.muted,marginTop:6}}>Forward supplier invoices to this address and they'll land directly in your Inbox — this is scaffolding for now since it needs a real inbound-email service wired up.</p>
      </div>
      <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:20}}>
        <div style={{fontSize:14,fontWeight:800,color:T.text,marginBottom:8}}>Approval workflow</div>
        <p style={{fontSize:12,color:T.muted}}>Requiring a second person to approve a voucher before it posts needs a real decision about who approves what — this is a genuine feature to plan, not something to fake with a checkbox. Worth a proper conversation once the accountant-portal work (multiple staff, multiple clients) is further along.</p>
      </div>
    </div>
  );
}

// Invoice settings — numbering, default terms, and footer text that gets
// stamped on every new invoice.
function InvoiceSettingsScreen({companyProfile,saveCompanyProfile}){
  const[footerText,setFooterText]=useState(()=>{try{return localStorage.getItem("rr_invoice_footer")||"";}catch{return"";}});
  const saveFooter=(v)=>{setFooterText(v);try{localStorage.setItem("rr_invoice_footer",v);}catch{}};
  return(
    <div style={{maxWidth:800}}>
      <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 16px"}}>Invoice settings</h1>
      <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:20,marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:800,color:T.text,marginBottom:16}}>Defaults for new invoices</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Default VAT %</div>
            <div style={{...inp,background:T.bg,color:T.sub}}>{companyProfile&&companyProfile.vatPct!=null?companyProfile.vatPct:0}% — set in Company information</div>
          </div>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Numbering</div>
            <div style={{...inp,background:T.bg,color:T.sub}}>Sequential, continues automatically</div>
          </div>
        </div>
      </div>
      <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:20}}>
        <div style={{fontSize:14,fontWeight:800,color:T.text,marginBottom:12}}>Invoice footer text</div>
        <textarea value={footerText} onChange={e=>saveFooter(e.target.value)} placeholder="e.g. Thank you for your business — payment details, terms, or a note to include on every invoice PDF." style={{...inp,minHeight:80,resize:"vertical"}}/>
      </div>
    </div>
  );
}

// Accounting settings — points to the real period-lock and fiscal-year
// controls that already exist elsewhere, rather than duplicating them.
function AccountingSettingsScreen({onNavigate}){
  return(
    <div style={{maxWidth:800}}>
      <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 16px"}}>Accounting settings</h1>
      <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
        {[
          {icon:"ti-lock",label:"Period close",desc:"Lock past periods against further edits",action:()=>onNavigate&&onNavigate("Settings")},
          {icon:"ti-calendar",label:"Fiscal year",desc:"Set which month your fiscal year starts",action:()=>onNavigate&&onNavigate("CompanyInfo")},
          {icon:"ti-list-numbers",label:"Chart of accounts",desc:"Manage account numbers, types, and defaults",action:()=>onNavigate&&onNavigate("Accounts")},
          {icon:"ti-receipt-tax",label:"VAT codes",desc:"Norwegian mva-koder — rates, direction, and which accounts they settle to",action:()=>onNavigate&&onNavigate("VATCodes")},
        ].map((r,i)=>(
          <div key={r.label} onClick={r.action} style={{display:"flex",alignItems:"center",gap:14,padding:"16px 20px",cursor:"pointer",borderBottom:i<3?`1px solid ${T.border}`:"none"}}>
            <i className={`ti ${r.icon}`} style={{fontSize:20,color:T.accent}}/>
            <div><div style={{fontSize:13,fontWeight:700,color:T.text}}>{r.label}</div><div style={{fontSize:11,color:T.muted,marginTop:2}}>{r.desc}</div></div>
            <span style={{marginLeft:"auto",color:T.muted}}>›</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Opening balance import — for a business switching from a different
// accounting system, this posts a trial balance (from that old system) as
// the starting point here, so every account's real ledger balance matches
// exactly what it was on day one. Accepts CSV/Excel with account code +
// debit/credit columns (any of several common header spellings), or manual
// entry for a handful of accounts. Every row posts as its own transaction
// against a single "Opening Balance Equity" suspense account (2960,
// auto-created) — the same proven pattern already used by the SAF-T
// importer. Since a genuine trial balance always has total debits = total
// credits, once every row is posted the suspense account nets to exactly
// zero on its own; the running "difference" shown here is what validates
// that before anything is posted, catching typos or an incomplete export.
function OpeningBalanceScreen({accounts,contacts,transactions,addTransaction,onSave,onBack}){
  const OPENING_BALANCE_CODE="2960";
  const newRow=()=>({rid:Date.now()+Math.random().toString(36).slice(2),accountCode:"",debit:"",credit:""});
  const[rows,setRows]=useState([newRow()]);
  const[importing,setImporting]=useState(false);
  const[importError,setImportError]=useState("");
  const[posting,setPosting]=useState(false);
  const[posted,setPosted]=useState(false);
  const[asOfDate,setAsOfDate]=useState(new Date().toISOString().slice(0,10));
  const[step,setStep]=useState("balances"); // "balances" | "openItems" | "done"
  // Per-contact open-item breakdown for AR (1500) / AP (2400) — matches how
  // real systems handle this: the trial balance gives one lump AR/AP figure,
  // but the ledger needs it split across actual customers/suppliers to be
  // useful (aged receivables, statements, etc). Only shown if 1500 or 2400
  // actually has a balance in what was just imported.
  const[custOpenItems,setCustOpenItems]=useState([]);
  const[supOpenItems,setSupOpenItems]=useState([]);

  const updateRow=(rid,updates)=>setRows(rows.map(r=>r.rid===rid?{...r,...updates}:r));
  const addRow=()=>setRows([...rows,newRow()]);
  const removeRow=rid=>setRows(rows.length>1?rows.filter(r=>r.rid!==rid):rows);

  const totalDebit=rows.reduce((s,r)=>s+(parseFloat(r.debit)||0),0);
  const totalCredit=rows.reduce((s,r)=>s+(parseFloat(r.credit)||0),0);
  const difference=Math.round((totalDebit-totalCredit)*100)/100;
  const balanced=Math.abs(difference)<0.01&&rows.some(r=>r.accountCode&&(parseFloat(r.debit)||parseFloat(r.credit)));

  const doImport=async(file)=>{
    setImportError("");setImporting(true);
    try{
      const isCsv=/\.csv$/i.test(file.name);
      const wb=isCsv?XLSX.read(await file.text(),{type:"string"}):XLSX.read(await file.arrayBuffer(),{type:"array"});
      const json=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});
      if(!json.length){setImportError("That file appears to be empty.");setImporting(false);return;}
      const newRows=[];
      json.forEach(row=>{
        const code=String(row["Account"]||row["Account Code"]||row["Konto"]||row["Kontonr"]||row["Account no"]||"").trim();
        if(!code)return;
        // Accept either separate Debit/Credit columns, or a single signed
        // "Balance"/"Amount" column (positive = debit, negative = credit) —
        // covers the two most common trial-balance export shapes.
        let debit=parseFloat(row["Debit"]||row["Debet"]||0)||0;
        let credit=parseFloat(row["Credit"]||row["Kredit"]||0)||0;
        if(!debit&&!credit){
          const bal=parseFloat(row["Balance"]||row["Amount"]||row["Sum"]||0)||0;
          if(bal>0)debit=bal;else if(bal<0)credit=-bal;
        }
        if(!debit&&!credit)return;
        newRows.push({rid:Date.now()+Math.random().toString(36).slice(2),accountCode:code,debit:debit||"",credit:credit||""});
      });
      if(!newRows.length){setImportError("No usable rows found. Expected columns like Account/Konto plus Debit/Credit or a single signed Balance column.");setImporting(false);return;}
      setRows(newRows);
    }catch(e){setImportError("Couldn't read that file. Make sure it's a CSV or Excel export.");}
    setImporting(false);
  };

  const ensureOpeningBalanceAccount=async()=>{
    if(accounts.some(a=>a.code===OPENING_BALANCE_CODE))return;
    await onSave([...accounts,{code:OPENING_BALANCE_CODE,name:"Opening balance equity",matchable:false}]);
  };

  const goToOpenItems=()=>{
    const arRow=rows.find(r=>r.accountCode==="1500");
    const apRow=rows.find(r=>r.accountCode==="2400");
    const needsAR=arRow&&(parseFloat(arRow.debit)||0)>0;
    const needsAP=apRow&&(parseFloat(apRow.credit)||0)>0;
    if(needsAR)setCustOpenItems([{rid:Date.now()+"a",contactId:"",amount:""}]);
    if(needsAP)setSupOpenItems([{rid:Date.now()+"b",contactId:"",amount:""}]);
    if(needsAR||needsAP)setStep("openItems");
    else doPost();
  };

  const doPost=async()=>{
    setPosting(true);
    await ensureOpeningBalanceAccount();
    for(const r of rows){
      const debit=parseFloat(r.debit)||0;
      const credit=parseFloat(r.credit)||0;
      if(!r.accountCode||(!debit&&!credit))continue;
      if(debit>0)await addTransaction({date:asOfDate,debitCode:r.accountCode,creditCode:OPENING_BALANCE_CODE,description:"Opening balance import",amount:debit});
      else if(credit>0)await addTransaction({date:asOfDate,debitCode:OPENING_BALANCE_CODE,creditCode:r.accountCode,description:"Opening balance import",amount:credit});
    }
    for(const oi of custOpenItems){
      const amt=parseFloat(oi.amount)||0;
      if(!oi.contactId||!amt)continue;
      await addTransaction({date:asOfDate,debitCode:"1500",creditCode:OPENING_BALANCE_CODE,description:"Opening balance — customer open item",amount:amt,contactId:oi.contactId});
    }
    for(const oi of supOpenItems){
      const amt=parseFloat(oi.amount)||0;
      if(!oi.contactId||!amt)continue;
      await addTransaction({date:asOfDate,debitCode:OPENING_BALANCE_CODE,creditCode:"2400",description:"Opening balance — supplier open item",amount:amt,contactId:oi.contactId});
    }
    setPosting(false);setPosted(true);setStep("done");
  };

  const customers=contacts.filter(c=>c.type==="customer");
  const suppliers=contacts.filter(c=>c.type==="supplier");

  if(step==="done"){
    return(
      <div style={{maxWidth:700}}>
        <div style={{background:T.greenBg,border:`1px solid ${T.green}`,borderRadius:14,padding:24,textAlign:"center"}}>
          <i className="ti ti-circle-check" style={{fontSize:36,color:T.green,marginBottom:10,display:"block"}}/>
          <div style={{fontSize:16,fontWeight:800,color:T.text,marginBottom:6}}>Opening balance posted</div>
          <div style={{fontSize:13,color:T.sub}}>Every account now carries its imported balance as of {asOfDate}. Check Trial Balance to confirm it matches your old system exactly.</div>
        </div>
        <button onClick={onBack} style={{marginTop:16,background:T.accent,color:"#fff",border:"none",borderRadius:10,padding:"11px 20px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Back to settings</button>
      </div>
    );
  }

  if(step==="openItems"){
    return(
      <div style={{maxWidth:900}}>
        <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 6px"}}>Break down open balances</h1>
        <p style={{fontSize:12,color:T.muted,marginBottom:20}}>Your imported trial balance has a lump Accounts Receivable/Payable figure — split it across the actual customers/suppliers who owe or are owed money, so aged reports work correctly from day one.</p>
        {custOpenItems.length>0&&(
          <div style={{marginBottom:20}}>
            <div style={{fontSize:13,fontWeight:800,marginBottom:8}}>Customer open items (Accounts Receivable)</div>
            {custOpenItems.map(oi=>(
              <div key={oi.rid} style={{display:"grid",gridTemplateColumns:"2fr 1fr 40px",gap:8,marginBottom:6}}>
                <select value={oi.contactId} onChange={e=>setCustOpenItems(custOpenItems.map(x=>x.rid===oi.rid?{...x,contactId:e.target.value}:x))} style={{...inp}}>
                  <option value="">— Select customer —</option>
                  {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input type="number" placeholder="Amount owed" value={oi.amount} onChange={e=>setCustOpenItems(custOpenItems.map(x=>x.rid===oi.rid?{...x,amount:e.target.value}:x))} style={{...inp}}/>
                <button onClick={()=>setCustOpenItems(custOpenItems.filter(x=>x.rid!==oi.rid))} style={{background:"none",border:"none",color:T.red,cursor:"pointer"}}><i className="ti ti-trash" style={{fontSize:14}}/></button>
              </div>
            ))}
            <button onClick={()=>setCustOpenItems([...custOpenItems,{rid:Date.now()+Math.random(),contactId:"",amount:""}])} style={{background:"none",border:"none",color:T.accent,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Add customer</button>
          </div>
        )}
        {supOpenItems.length>0&&(
          <div style={{marginBottom:20}}>
            <div style={{fontSize:13,fontWeight:800,marginBottom:8}}>Supplier open items (Accounts Payable)</div>
            {supOpenItems.map(oi=>(
              <div key={oi.rid} style={{display:"grid",gridTemplateColumns:"2fr 1fr 40px",gap:8,marginBottom:6}}>
                <select value={oi.contactId} onChange={e=>setSupOpenItems(supOpenItems.map(x=>x.rid===oi.rid?{...x,contactId:e.target.value}:x))} style={{...inp}}>
                  <option value="">— Select supplier —</option>
                  {suppliers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input type="number" placeholder="Amount owed" value={oi.amount} onChange={e=>setSupOpenItems(supOpenItems.map(x=>x.rid===oi.rid?{...x,amount:e.target.value}:x))} style={{...inp}}/>
                <button onClick={()=>setSupOpenItems(supOpenItems.filter(x=>x.rid!==oi.rid))} style={{background:"none",border:"none",color:T.red,cursor:"pointer"}}><i className="ti ti-trash" style={{fontSize:14}}/></button>
              </div>
            ))}
            <button onClick={()=>setSupOpenItems([...supOpenItems,{rid:Date.now()+Math.random(),contactId:"",amount:""}])} style={{background:"none",border:"none",color:T.accent,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Add supplier</button>
          </div>
        )}
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>setStep("balances")} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:10,padding:"11px 20px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",color:T.sub}}>‹ Back</button>
          <button onClick={doPost} disabled={posting} style={{background:T.accent,color:"#fff",border:"none",borderRadius:10,padding:"11px 20px",fontWeight:700,fontSize:13,cursor:posting?"wait":"pointer",fontFamily:"inherit"}}>{posting?"Posting…":"Post opening balance"}</button>
        </div>
      </div>
    );
  }

  return(
    <div style={{maxWidth:1000}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Opening balance</h1>
        <button onClick={onBack} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>‹ Back to settings</button>
      </div>
      <p style={{fontSize:12,color:T.muted,marginBottom:16}}>Switching from another system? Import its trial balance here so every account starts with the correct real balance — not just a fresh, empty ledger.</p>

      <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:16}}>
        <div>
          <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>As-of date</div>
          <FlexDateInput value={asOfDate} onChange={setAsOfDate}/>
        </div>
        <label style={{marginTop:17,background:T.accentLight,color:T.accent,border:"none",borderRadius:8,padding:"10px 16px",fontSize:12,fontWeight:700,cursor:importing?"wait":"pointer",fontFamily:"inherit",display:"inline-flex",alignItems:"center",gap:6}}>
          <i className="ti ti-upload" style={{fontSize:14}}/>{importing?"Reading…":"Import CSV / Excel"}
          <input type="file" accept=".csv,.xlsx,.xls" disabled={importing} style={{display:"none"}} onChange={e=>{if(e.target.files[0])doImport(e.target.files[0]);e.target.value="";}}/>
        </label>
      </div>
      {importError&&<div style={{background:T.redLight,color:T.red,borderRadius:8,padding:"9px 12px",fontSize:12,marginBottom:14}}>{importError}</div>}
      <div style={{fontSize:11,color:T.muted,background:T.bg,borderRadius:8,padding:"9px 12px",marginBottom:16}}>
        Expects columns like <strong>Account</strong> (or Konto) plus either <strong>Debit</strong>/<strong>Credit</strong> columns, or a single signed <strong>Balance</strong> column. Or just type rows in manually below.
      </div>

      <div style={{border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"1.6fr 1fr 1fr 40px",gap:8,padding:"8px 10px",background:T.bg,borderBottom:`1px solid ${T.border}`}}>
          {["Account","Debit","Credit",""].map(h=><div key={h} style={{fontSize:10,color:T.muted,fontWeight:700,textTransform:"uppercase"}}>{h}</div>)}
        </div>
        {rows.map((r,i)=>{
          const matched=accounts.find(a=>a.code===r.accountCode);
          return(
            <div key={r.rid} style={{display:"grid",gridTemplateColumns:"1.6fr 1fr 1fr 40px",gap:8,padding:"7px 10px",alignItems:"center",borderBottom:i<rows.length-1?`1px solid ${T.border}`:"none",background:i%2===0?"#fff":T.bg}}>
              <AccDrop value={r.accountCode} onChange={v=>updateRow(r.rid,{accountCode:v})} accounts={accounts}/>
              <input type="number" placeholder="0" value={r.debit} onChange={e=>updateRow(r.rid,{debit:e.target.value,credit:e.target.value?"":r.credit})} style={{...inp,fontSize:12,padding:"7px 9px"}}/>
              <input type="number" placeholder="0" value={r.credit} onChange={e=>updateRow(r.rid,{credit:e.target.value,debit:e.target.value?"":r.debit})} onKeyDown={e=>{if(e.key==="Enter"&&i===rows.length-1){e.preventDefault();addRow();}}} style={{...inp,fontSize:12,padding:"7px 9px"}}/>
              <button onClick={()=>removeRow(r.rid)} style={{background:"none",border:"none",color:T.red,cursor:"pointer"}}><i className="ti ti-trash" style={{fontSize:14}}/></button>
              {r.accountCode&&!matched&&<div style={{gridColumn:"1 / -1",fontSize:11,color:T.orange,marginTop:-3}}>Account {r.accountCode} doesn't exist in your chart of accounts yet — add it first, or pick an existing one.</div>}
            </div>
          );
        })}
        <button onClick={addRow} style={{background:"none",border:"none",borderTop:`1px solid ${T.border}`,color:T.accent,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:"8px 10px",width:"100%",textAlign:"left"}}>+ Add row</button>
      </div>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:16,background:Math.abs(difference)<0.01?T.greenBg:T.redLight,borderRadius:10,padding:"12px 16px"}}>
        <div style={{fontSize:12,color:T.sub}}>Debit: <strong>{fmt(totalDebit)}</strong> · Credit: <strong>{fmt(totalCredit)}</strong></div>
        <div style={{fontSize:13,fontWeight:800,color:Math.abs(difference)<0.01?T.green:T.red}}>
          {Math.abs(difference)<0.01?"✓ Balanced":`Difference: ${fmt(difference)}`}
        </div>
      </div>
      {Math.abs(difference)>=0.01&&<div style={{fontSize:11,color:T.muted,marginTop:6}}>A real trial balance always has debits = credits — if this isn't zero, double-check for a missing row or typo before posting.</div>}

      <button onClick={goToOpenItems} disabled={!balanced||posting} style={{marginTop:16,background:balanced?T.accent:T.border,color:balanced?"#fff":T.muted,border:"none",borderRadius:10,padding:"12px 24px",fontWeight:700,fontSize:14,cursor:balanced?"pointer":"default",fontFamily:"inherit"}}>
        {posting?"Posting…":"Continue"}
      </button>
    </div>
  );
}

// Project/department tracking — toggle it on, manage the list. Deliberately
// much simpler than MoneySourcesPanel (no balances/matching) since a
// project here is just a tag transactions carry, used to filter Resultat.
function ProjectTrackingScreen({companyProfile,saveCompanyProfile,projects,saveProjects,onBack}){
  const[newName,setNewName]=useState("");
  const[editingNumberId,setEditingNumberId]=useState(null);
  const nextNumber=()=>{
    const nums=projects.map(p=>parseInt(p.number)||0);
    return String((nums.length?Math.max(...nums):0)+1).padStart(3,"0");
  };
  const addProject=()=>{
    if(!newName.trim())return;
    saveProjects([...projects,{id:"proj_"+Date.now().toString(36),number:nextNumber(),name:newName.trim(),inactive:false}]);
    setNewName("");
  };
  const updateNumber=(id,number)=>saveProjects(projects.map(p=>p.id===id?{...p,number}:p));
  const toggleInactive=id=>saveProjects(projects.map(p=>p.id===id?{...p,inactive:!p.inactive}:p));
  const removeProject=id=>{if(confirm("Remove this project? Transactions already tagged with it keep the tag, but it won't be selectable for new ones."))saveProjects(projects.filter(p=>p.id!==id));};

  return(
    <div style={{maxWidth:700}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Project tracking</h1>
        <button onClick={onBack} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>‹ Back to settings</button>
      </div>
      <p style={{fontSize:12,color:T.muted,marginBottom:16}}>Tag entries by project or department, then filter your Income Statement to see results for just one of them.</p>

      <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:16,marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:T.text}}>Show project field in entries</div>
          <div style={{fontSize:11,color:T.muted,marginTop:2}}>When on, New Entry and Register Voucher show a Project selector on every line.</div>
        </div>
        <label style={{position:"relative",display:"inline-block",width:44,height:24,flexShrink:0}}>
          <input type="checkbox" checked={!!companyProfile.trackProjects} onChange={e=>saveCompanyProfile({...companyProfile,trackProjects:e.target.checked})} style={{opacity:0,width:0,height:0}}/>
          <span style={{position:"absolute",inset:0,background:companyProfile.trackProjects?T.accent:T.border,borderRadius:24,cursor:"pointer",transition:"background .15s"}}/>
          <span style={{position:"absolute",top:3,left:companyProfile.trackProjects?23:3,width:18,height:18,background:"#fff",borderRadius:"50%",transition:"left .15s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
        </label>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <input placeholder="New project or department name" value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addProject()} style={{...inp,flex:1}}/>
        <button onClick={addProject} style={{background:T.accent,color:"#fff",border:"none",borderRadius:10,padding:"0 18px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Add</button>
      </div>

      <div style={{border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
        {!projects.length&&<div style={{padding:20,textAlign:"center",fontSize:12,color:T.muted}}>No projects yet — add one above.</div>}
        {projects.map((p,i)=>(
          <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",borderBottom:i<projects.length-1?`1px solid ${T.border}`:"none",opacity:p.inactive?0.5:1}}>
            {editingNumberId===p.id?(
              <input autoFocus value={p.number||""} onChange={e=>updateNumber(p.id,e.target.value)} onBlur={()=>setEditingNumberId(null)} onKeyDown={e=>e.key==="Enter"&&setEditingNumberId(null)} style={{width:52,fontSize:11,fontWeight:700,color:T.accent,background:T.accentLight,border:`1px solid ${T.accent}`,borderRadius:6,padding:"3px 6px",fontFamily:"inherit"}}/>
            ):(
              <span onClick={()=>setEditingNumberId(p.id)} title="Click to edit number" style={{fontSize:11,fontWeight:700,color:T.accent,background:T.accentLight,borderRadius:6,padding:"3px 8px",cursor:"pointer",flexShrink:0}}>{p.number||"—"}</span>
            )}
            <span style={{flex:1,fontSize:13,fontWeight:600,color:T.text}}>{p.name}{p.inactive&&" (inactive)"}</span>
            <button onClick={()=>toggleInactive(p.id)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:7,padding:"5px 10px",fontSize:11,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>{p.inactive?"Reactivate":"Deactivate"}</button>
            <button onClick={()=>removeProject(p.id)} style={{background:"none",border:"none",color:T.red,cursor:"pointer",padding:4}}><i className="ti ti-trash" style={{fontSize:14}}/></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// VAT codes reference — the real Norwegian mva-koder (Skatteetaten/Tripletex
// standard), each with its rate, direction, and which GL account its VAT
// amount settles to. Pulled from an actual verified company setup, not
// guessed — see the account-linking note per code.

export { CustomerImportScreen, VoucherSettingsScreen, InvoiceSettingsScreen, AccountingSettingsScreen, OpeningBalanceScreen, ProjectTrackingScreen };
