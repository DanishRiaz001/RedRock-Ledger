import { useState } from "react";
import { T, inp } from "../lib/theme.js";
import { getAnthropicKey, setAnthropicKey } from "../lib/utils.js";

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

// VAT codes reference — the real Norwegian mva-koder (Skatteetaten/Tripletex
// standard), each with its rate, direction, and which GL account its VAT
// amount settles to. Pulled from an actual verified company setup, not
// guessed — see the account-linking note per code.

export { CustomerImportScreen, VoucherSettingsScreen, InvoiceSettingsScreen, AccountingSettingsScreen };
