import React, { useState, useMemo, useEffect, useRef } from "react";
import { T, SERIES, getSK, inp, btnRed, btnGhost, btnSm } from "../lib/theme.js";
import { isIncomeSK, MVA_CODES, SALES_ACCOUNT_VAT_RATE, vatCodeForRate, vatCodeOptions, findVatCode, accountsForSK, callClaudeAPI, fmt, fmtB, openHtmlInNewTab } from "../lib/utils.js";
import { Card, AccDrop, isDateClosed, getPeriodClose, sign, selSm, FlexDateInput, NewContactModal, VatDrop, SaveFlashButton } from "./ledger.jsx";
import { getSignedUrl } from "../lib/storage.js";

import { ResizableSplit, SignedFileViewer } from "./shell.jsx";
import { BankAccountDetailsModal, ConicChart } from "./reports.jsx";

function VATCodesScreen({accounts}){
  const nameFor=code=>{const a=accounts.find(x=>x.code===code);return a?a.name:null;};
  const outputCodes=MVA_CODES.filter(c=>c.direction==="output");
  const inputCodes=MVA_CODES.filter(c=>c.direction==="input");
  const Table=({codes})=>(
    <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden",marginBottom:20}}>
      <table style={{width:"100%",fontSize:13,borderCollapse:"collapse"}}>
        <thead><tr style={{background:T.bg,color:T.sub,fontSize:11}}>
          <td style={{padding:"9px 16px",fontWeight:700}}>Kode</td><td style={{fontWeight:700}}>Navn</td><td style={{textAlign:"right",fontWeight:700}}>Sats</td><td style={{fontWeight:700,padding:"9px 16px"}}>Settles to account</td>
        </tr></thead>
        <tbody>
          {codes.map(c=>(
            <tr key={c.code} style={{borderTop:`1px solid ${T.border}`}}>
              <td style={{padding:"9px 16px",fontWeight:700,color:T.accent}}>{c.code}</td>
              <td style={{color:T.text}}>{c.name}</td>
              <td style={{textAlign:"right",color:T.sub}}>{c.rate}%</td>
              <td style={{padding:"9px 16px",color:T.sub}}>
                {c.settleAccount?(
                  <>{c.settleAccount} {nameFor(c.settleAccount)||<span style={{color:T.orange}}>— not in your chart yet</span>}</>
                ):<span style={{color:T.muted}}>— (no VAT, nothing to settle)</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return(
    <div style={{maxWidth:900}}>
      <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 8px"}}>VAT codes</h1>
      <p style={{fontSize:12,color:T.muted,marginBottom:20}}>The standard Norwegian mva-koder — the same set Skatteetaten and Tripletex use. Picking a sale or expense account with a matching rate auto-suggests the right code's rate; this page is the reference for which account each code's VAT amount belongs to.</p>

      <div style={{fontSize:12,fontWeight:800,color:T.green,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>Utgående avgift (sales)</div>
      <Table codes={outputCodes}/>

      <div style={{fontSize:12,fontWeight:800,color:"#D97706",textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>Inngående avgift (purchases)</div>
      <Table codes={inputCodes}/>

      <div style={{background:T.bg,border:`1px dashed ${T.border}`,borderRadius:10,padding:"14px 16px",fontSize:11,color:T.muted}}>
        VAT is currently tracked as a rate + amount on the sale/purchase entry itself, not posted as separate lines to the settlement accounts above — simpler day to day, and your VAT reports already total correctly from it. Posting real separate VAT lines to 2700-2712 is a bigger structural change worth planning deliberately, not something to bolt on here.
      </div>
    </div>
  );
}

// Bank settings — payment account agreements, matching Bankinnstillinger.
// Honest about what needs a real bank API vs. what's genuinely usable now.
function BankSettingsScreen({accounts,onSaveAccounts}){
  const bankAccounts=accounts.filter(a=>getSK(a.code)==="1900");
  const[editingAccount,setEditingAccount]=useState(null);
  const bankDetailsFor=(a)=>{
    try{
      const parsed=JSON.parse(a.notes||"{}");
      const defaultVisible=!/cash/i.test(a.name);
      return{branch:parsed.branch||"",accountNumber:parsed.accountNumber||"",bankName:parsed.bankName||"",iban:parsed.iban||"",visibleInReconciliation:parsed.visibleInReconciliation!==undefined?parsed.visibleInReconciliation:defaultVisible};
    }catch{return{branch:"",accountNumber:"",bankName:"",iban:"",visibleInReconciliation:!/cash/i.test(a.name)};}
  };
  const saveBankDetails=(code,details)=>{
    if(!onSaveAccounts)return;
    const updated=accounts.map(a=>a.code===code?{...a,notes:JSON.stringify(details)}:a);
    onSaveAccounts(updated);
    setEditingAccount(null);
  };
  return(
    <div style={{maxWidth:800}}>
      <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 16px"}}>Bank settings</h1>
      {editingAccount&&(
        <BankAccountDetailsModal account={editingAccount} initial={bankDetailsFor(editingAccount)} onSave={details=>saveBankDetails(editingAccount.code,details)} onClose={()=>setEditingAccount(null)}/>
      )}
      <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden",marginBottom:16}}>
        <table style={{width:"100%",fontSize:13,borderCollapse:"collapse"}}>
          <thead><tr style={{background:T.bg,color:T.sub}}><td style={{padding:"10px 16px",fontWeight:700}}>Account</td><td style={{fontWeight:700}}>Bank</td><td style={{fontWeight:700}}>IBAN</td><td style={{fontWeight:700}}>In reconciliation</td><td style={{fontWeight:700,padding:"10px 16px"}}></td></tr></thead>
          <tbody>
            {bankAccounts.map(a=>{
              const d=bankDetailsFor(a);
              return(
                <tr key={a.code} onClick={()=>setEditingAccount(a)} style={{borderBottom:`1px solid ${T.border}`,cursor:"pointer"}}>
                  <td style={{padding:"10px 16px",color:T.text,fontWeight:600}}>{a.code} {a.name}</td>
                  <td style={{color:T.sub}}>{d.bankName||<span style={{color:T.muted}}>—</span>}{d.branch?` · ${d.branch}`:""}</td>
                  <td style={{color:T.sub,fontSize:11}}>{d.iban||<span style={{color:T.muted}}>—</span>}</td>
                  <td style={{padding:"10px 16px"}}>
                    <span style={{fontSize:11,fontWeight:700,color:d.visibleInReconciliation?T.green:T.muted,background:d.visibleInReconciliation?T.greenBg:T.bg,padding:"3px 9px",borderRadius:8}}>{d.visibleInReconciliation?"Visible":"Hidden"}</span>
                  </td>
                  <td style={{padding:"10px 16px",textAlign:"right",color:T.accent,fontSize:12,fontWeight:600}}>Edit ›</td>
                </tr>
              );
            })}
            {!bankAccounts.length&&<tr><td colSpan="5" style={{padding:"20px",textAlign:"center",color:T.muted}}>No bank accounts yet — add one from Chart of Accounts (1900 series).</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{background:T.bg,border:`1px dashed ${T.border}`,borderRadius:10,padding:"14px 16px",fontSize:11,color:T.muted}}>
        Direct bank connections (auto-approving payments, live balance sync) need a real bank API agreement — that's a separate integration to set up per bank, not something to fake here. Statement import via CSV/Excel already works from Bank → Bank reconciliation.
      </div>
    </div>
  );
}

// POS settings — default sale/payment accounts and receipt text.
function POSSettingsScreen({accounts}){
  const[receiptFooter,setReceiptFooter]=useState(()=>{try{return localStorage.getItem("rr_pos_receipt_footer")||"";}catch{return"";}});
  const saveFooter=(v)=>{setReceiptFooter(v);try{localStorage.setItem("rr_pos_receipt_footer",v);}catch{}};
  return(
    <div style={{maxWidth:800}}>
      <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 16px"}}>Point of sale settings</h1>
      <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:20}}>
        <div style={{fontSize:14,fontWeight:800,color:T.text,marginBottom:12}}>Receipt footer text</div>
        <textarea value={receiptFooter} onChange={e=>saveFooter(e.target.value)} placeholder="e.g. Thank you for shopping with us — return policy, contact info, etc." style={{...inp,minHeight:80,resize:"vertical"}}/>
        <p style={{fontSize:11,color:T.muted,marginTop:8}}>Manage which accounts each product sells against from Point of Sale → Products.</p>
      </div>
    </div>
  );
}

// SAF-T import — Standard Audit File for Tax, the international standard
// format for exporting a full chart of accounts + contacts + journal from
// one accounting system to migrate into another. Parsed with the browser's
// native DOMParser (no library needed) against the well-documented SAF-T
// schema: Header, MasterFiles/GeneralLedgerAccounts, MasterFiles/Customers,
// MasterFiles/Suppliers, GeneralLedgerEntries/Journal/Transaction/Line.
function SAFTImportScreen({accounts,setAccounts,contacts,setContacts,addTransaction}){
  const[parsing,setParsing]=useState(false);
  const[parseError,setParseError]=useState("");
  const[parsed,setParsed]=useState(null); // {companyName, accounts, customers, suppliers, transactions}
  const[opts,setOpts]=useState({
    createVouchers:true,
    createContacts:true,createContactsCustomers:true,createContactsSuppliers:true,
    overwriteContacts:false,contactsWithTxnsOnly:false,
    createAccounts:true,accountsWithTxnsOnly:false,overwriteAccountNames:false,
    openingBalanceAccounts:false,openingBalanceAR:false,openingBalanceAP:false,
  });
  const[importing,setImporting]=useState(false);
  const[importResult,setImportResult]=useState(null);
  const[accountMap,setAccountMap]=useState({}); // importedCode -> existing account code to post against instead

  const text=(el,tag)=>{const n=el.getElementsByTagName(tag)[0];return n?n.textContent.trim():"";};
  const num=(el,tag)=>{const v=text(el,tag);return v?parseFloat(v):null;};

  const parseFile=async(file)=>{
    setParsing(true);setParseError("");setParsed(null);setImportResult(null);setAccountMap({});
    try{
      const xmlText=await file.text();
      const doc=new DOMParser().parseFromString(xmlText,"text/xml");
      if(doc.getElementsByTagName("parsererror").length)throw new Error("Invalid XML");

      const companyName=text(doc,"CompanyName")||text(doc,"CompanyID")||"Unknown company";

      const glAccounts=Array.from(doc.getElementsByTagName("Account")).map(a=>({
        code:text(a,"AccountID"),
        name:text(a,"AccountDescription")||text(a,"AccountName"),
        openingDebit:num(a,"OpeningDebitBalance"),
        openingCredit:num(a,"OpeningCreditBalance"),
      })).filter(a=>a.code&&a.name);

      const parseParty=(tag)=>Array.from(doc.getElementsByTagName(tag)).map(c=>({
        name:text(c,"CompanyName")||text(c,"Name"),
        id:text(c,"CustomerID")||text(c,"SupplierID"),
        address:text(c,"StreetName")||"",
        email:text(c,"Email")||"",
        phone:text(c,"Telephone")||"",
        openingDebit:num(c,"OpeningDebitBalance"),
        openingCredit:num(c,"OpeningCreditBalance"),
        hasTxns:!!c.getElementsByTagName("InvoiceNo").length,
      })).filter(c=>c.name);
      const customers=parseParty("Customer");
      const suppliers=parseParty("Supplier");

      const transactions=Array.from(doc.getElementsByTagName("Transaction")).map(t=>{
        const date=text(t,"TransactionDate")||text(t,"PostingDate");
        const description=text(t,"Description");
        const lines=Array.from(t.getElementsByTagName("Line")).map(l=>({
          accountId:text(l,"AccountID"),
          debit:parseFloat(text(l,"DebitAmount")||text(l.getElementsByTagName("DebitAmount")[0],"Amount"))||0,
          credit:parseFloat(text(l,"CreditAmount")||text(l.getElementsByTagName("CreditAmount")[0],"Amount"))||0,
        }));
        return{date,description,lines};
      }).filter(t=>t.date&&t.lines.length);

      const accountsWithTxns=new Set();
      transactions.forEach(t=>t.lines.forEach(l=>accountsWithTxns.add(l.accountId)));

      setParsed({companyName,accounts:glAccounts,customers,suppliers,transactions,accountsWithTxns});
    }catch(e){
      setParseError("Couldn't parse this file as SAF-T XML. Double-check it's an unmodified export from your previous system.");
    }
    setParsing(false);
  };

  const resolveCode=code=>accountMap[code]||code;

  // Every opening balance is posted against a single suspense/equity account
  // so the whole import always nets to zero, exactly like Tripletex's own
  // "opening balance" mechanism — auto-created if it doesn't exist yet.
  const OPENING_BALANCE_CODE="2960";
  const ensureOpeningBalanceAccount=async(currentAccounts)=>{
    if(currentAccounts.some(a=>a.code===OPENING_BALANCE_CODE))return currentAccounts;
    const updated=[...currentAccounts,{code:OPENING_BALANCE_CODE,name:"Opening balance equity",matchable:false}];
    setAccounts(updated);
    return updated;
  };

  const doImport=async()=>{
    if(!parsed)return;
    setImporting(true);
    let accountsAdded=0,accountsUpdated=0,contactsAdded=0,contactsUpdated=0,txnsAdded=0,openingBalancesAdded=0;

    let currentAccounts=accounts;
    if(opts.createAccounts){
      const byCode={};currentAccounts.forEach(a=>{byCode[a.code]=a;});
      const relevantParsed=opts.accountsWithTxnsOnly?parsed.accounts.filter(a=>parsed.accountsWithTxns.has(a.code)):parsed.accounts;
      const toAdd=[],toUpdate=new Map();
      relevantParsed.forEach(a=>{
        if(accountMap[a.code])return; // mapped to an existing account — don't create a duplicate
        if(!byCode[a.code])toAdd.push({code:a.code,name:a.name,matchable:false});
        else if(opts.overwriteAccountNames&&byCode[a.code].name!==a.name)toUpdate.set(a.code,a.name);
      });
      if(toAdd.length||toUpdate.size){
        currentAccounts=currentAccounts.map(a=>toUpdate.has(a.code)?{...a,name:toUpdate.get(a.code)}:a).concat(toAdd);
        setAccounts(currentAccounts);
        accountsAdded=toAdd.length;accountsUpdated=toUpdate.size;
      }
    }

    if(opts.createContacts){
      let nextC=Math.max(0,...contacts.filter(c=>c.type==="customer").map(c=>parseInt((c.id||"").slice(1))||0))+1;
      let nextS=Math.max(0,...contacts.filter(c=>c.type==="supplier").map(c=>parseInt((c.id||"").slice(1))||0))+1;
      const byName={};contacts.forEach(c=>{byName[c.type+"|"+c.name]=c;});
      const newContacts=[];const updatedContacts=[];
      const addParty=(list,type)=>list.forEach(p=>{
        if(opts.contactsWithTxnsOnly&&!p.hasTxns)return;
        const existing=byName[type+"|"+p.name];
        if(existing){
          if(opts.overwriteContacts)updatedContacts.push({...existing,email:p.email||existing.email,phone:p.phone||existing.phone,address:p.address||existing.address});
          return;
        }
        const id=type==="customer"?`C${String(nextC++).padStart(3,"0")}`:`S${String(nextS++).padStart(3,"0")}`;
        newContacts.push({id,type,name:p.name,email:p.email,phone:p.phone,address:p.address,paymentTermsDays:30});
      });
      if(opts.createContactsCustomers)addParty(parsed.customers,"customer");
      if(opts.createContactsSuppliers)addParty(parsed.suppliers,"supplier");
      if(newContacts.length||updatedContacts.length){
        const updatedIds=new Set(updatedContacts.map(c=>c.id));
        setContacts([...contacts.filter(c=>!updatedIds.has(c.id)),...updatedContacts,...newContacts]);
        contactsAdded=newContacts.length;contactsUpdated=updatedContacts.length;
      }
    }

    if(opts.createVouchers){
      for(const t of parsed.transactions){
        const debitLine=t.lines.find(l=>l.debit>0);
        const creditLine=t.lines.find(l=>l.credit>0);
        if(!debitLine||!creditLine)continue;
        const amount=debitLine.debit||creditLine.credit;
        if(!amount)continue;
        await addTransaction({date:t.date.slice(0,10),debitCode:resolveCode(debitLine.accountId),creditCode:resolveCode(creditLine.accountId),description:t.description||"Imported from SAF-T",amount});
        txnsAdded++;
      }
    }

    if(opts.openingBalanceAccounts||opts.openingBalanceAR||opts.openingBalanceAP){
      currentAccounts=await ensureOpeningBalanceAccount(currentAccounts);
      const today=new Date().toISOString().slice(0,10);
      if(opts.openingBalanceAccounts){
        for(const a of parsed.accounts){
          const debit=a.openingDebit||0,credit=a.openingCredit||0;
          const net=debit-credit;
          if(!net)continue;
          const code=resolveCode(a.code);
          if(net>0)await addTransaction({date:today,debitCode:code,creditCode:OPENING_BALANCE_CODE,description:"Opening balance (SAF-T import)",amount:net});
          else await addTransaction({date:today,debitCode:OPENING_BALANCE_CODE,creditCode:code,description:"Opening balance (SAF-T import)",amount:-net});
          openingBalancesAdded++;
        }
      }
      if(opts.openingBalanceAR){
        for(const c of parsed.customers){
          const net=(c.openingDebit||0)-(c.openingCredit||0);
          if(!net)continue;
          const contact=contacts.find(x=>x.type==="customer"&&x.name===c.name);
          await addTransaction({date:today,debitCode:"1500",creditCode:OPENING_BALANCE_CODE,description:`Opening balance — ${c.name}`,amount:net,contactId:contact?contact.id:undefined});
          openingBalancesAdded++;
        }
      }
      if(opts.openingBalanceAP){
        for(const s of parsed.suppliers){
          const net=(s.openingCredit||0)-(s.openingDebit||0);
          if(!net)continue;
          const contact=contacts.find(x=>x.type==="supplier"&&x.name===s.name);
          await addTransaction({date:today,debitCode:OPENING_BALANCE_CODE,creditCode:"2400",description:`Opening balance — ${s.name}`,amount:net,contactId:contact?contact.id:undefined});
          openingBalancesAdded++;
        }
      }
    }

    setImportResult({accountsAdded,accountsUpdated,contactsAdded,contactsUpdated,txnsAdded,openingBalancesAdded});
    setImporting(false);
  };

  return(
    <div style={{maxWidth:800}}>
      <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 8px"}}>Import account information (SAF-T)</h1>
      <p style={{fontSize:12,color:T.muted,marginBottom:16}}>SAF-T (Standard Audit File for Tax) is the standard export format most accounting systems support — this lets you bring your chart of accounts, customers, suppliers, opening balances, and journal entries in from a previous system.</p>

      {!parsed&&(
        <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:20}}>
          <label style={{display:"block",border:`2px dashed ${T.border}`,borderRadius:10,padding:"40px 16px",textAlign:"center",cursor:parsing?"wait":"pointer",background:T.bg}}>
            <i className="ti ti-file-upload" style={{fontSize:28,color:T.muted,display:"block",marginBottom:8}}/>
            <div style={{fontSize:13,color:T.sub,fontWeight:600}}>{parsing?"Reading file…":"Choose SAF-T file (.xml)"}</div>
            <div style={{fontSize:11,color:T.muted,marginTop:4}}>Exported from your previous accounting system</div>
            <input type="file" accept=".xml" disabled={parsing} style={{display:"none"}} onChange={e=>{if(e.target.files[0])parseFile(e.target.files[0]);e.target.value="";}}/>
          </label>
          {parseError&&<div style={{background:T.redLight,color:T.red,borderRadius:8,padding:"10px 14px",fontSize:12,marginTop:14}}>{parseError}</div>}
        </div>
      )}

      {parsed&&!importResult&&(
        <>
        <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:20,marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:800,color:T.text,marginBottom:4}}>Found in {parsed.companyName}</div>
          <div style={{display:"flex",gap:20,marginBottom:18,fontSize:12,color:T.sub,flexWrap:"wrap"}}>
            <span>{parsed.accounts.length} accounts</span>
            <span>{parsed.customers.length} customers</span>
            <span>{parsed.suppliers.length} suppliers</span>
            <span>{parsed.transactions.length} journal entries</span>
          </div>

          <div style={{fontSize:11,fontWeight:800,color:T.muted,textTransform:"uppercase",marginBottom:8}}>Settings</div>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:T.text,cursor:"pointer"}}>
              <input type="checkbox" checked={opts.createVouchers} onChange={e=>setOpts(o=>({...o,createVouchers:e.target.checked}))}/>
              Create vouchers from journal entries ({parsed.transactions.length} found)
            </label>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:T.text,cursor:"pointer"}}>
              <input type="checkbox" checked={opts.createContacts} onChange={e=>setOpts(o=>({...o,createContacts:e.target.checked}))}/>
              Create customers and suppliers
            </label>
            {opts.createContacts&&(
              <div style={{marginLeft:26,display:"flex",flexDirection:"column",gap:8}}>
                <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:T.sub,cursor:"pointer"}}>
                  <input type="checkbox" checked={opts.createContactsCustomers} onChange={e=>setOpts(o=>({...o,createContactsCustomers:e.target.checked}))}/>
                  Customers ({parsed.customers.length})
                </label>
                <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:T.sub,cursor:"pointer"}}>
                  <input type="checkbox" checked={opts.createContactsSuppliers} onChange={e=>setOpts(o=>({...o,createContactsSuppliers:e.target.checked}))}/>
                  Suppliers ({parsed.suppliers.length})
                </label>
                <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:T.sub,cursor:"pointer"}}>
                  <input type="checkbox" checked={opts.overwriteContacts} onChange={e=>setOpts(o=>({...o,overwriteContacts:e.target.checked}))}/>
                  Overwrite existing customers/suppliers with matching names
                </label>
                <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:T.sub,cursor:"pointer"}}>
                  <input type="checkbox" checked={opts.contactsWithTxnsOnly} onChange={e=>setOpts(o=>({...o,contactsWithTxnsOnly:e.target.checked}))}/>
                  Import only customers/suppliers with transactions
                </label>
              </div>
            )}
          </div>

          <div style={{fontSize:11,fontWeight:800,color:T.muted,textTransform:"uppercase",marginBottom:8}}>Accounts</div>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:T.text,cursor:"pointer"}}>
              <input type="checkbox" checked={opts.createAccounts} onChange={e=>setOpts(o=>({...o,createAccounts:e.target.checked}))}/>
              Create new accounts ({parsed.accounts.length} found)
            </label>
            {opts.createAccounts&&(
              <div style={{marginLeft:26,display:"flex",flexDirection:"column",gap:8}}>
                <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:T.sub,cursor:"pointer"}}>
                  <input type="checkbox" checked={opts.accountsWithTxnsOnly} onChange={e=>setOpts(o=>({...o,accountsWithTxnsOnly:e.target.checked}))}/>
                  Import only accounts with transactions ({parsed.accountsWithTxns?parsed.accountsWithTxns.size:0})
                </label>
                <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:T.sub,cursor:"pointer"}}>
                  <input type="checkbox" checked={opts.overwriteAccountNames} onChange={e=>setOpts(o=>({...o,overwriteAccountNames:e.target.checked}))}/>
                  Overwrite existing names on accounts
                </label>
              </div>
            )}
          </div>

          <div style={{fontSize:11,fontWeight:800,color:T.muted,textTransform:"uppercase",marginBottom:8}}>Opening balance</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:T.text,cursor:"pointer"}}>
              <input type="checkbox" checked={opts.openingBalanceAccounts} onChange={e=>setOpts(o=>({...o,openingBalanceAccounts:e.target.checked}))}/>
              Create an opening balance for every account from the import file
            </label>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:T.text,cursor:"pointer"}}>
              <input type="checkbox" checked={opts.openingBalanceAR} onChange={e=>setOpts(o=>({...o,openingBalanceAR:e.target.checked}))}/>
              Create an opening balance on accounts receivable from customers
            </label>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:T.text,cursor:"pointer"}}>
              <input type="checkbox" checked={opts.openingBalanceAP} onChange={e=>setOpts(o=>({...o,openingBalanceAP:e.target.checked}))}/>
              Create an opening balance on accounts payable to suppliers
            </label>
            {(opts.openingBalanceAccounts||opts.openingBalanceAR||opts.openingBalanceAP)&&(
              <div style={{fontSize:11,color:T.muted,background:T.bg,borderRadius:8,padding:"9px 12px"}}>Every opening balance is posted against a suspense account ({OPENING_BALANCE_CODE} · Opening balance equity, created automatically) so the import always nets to zero — move it into real equity yourself afterward if needed.</div>
            )}
          </div>
        </div>

        {/* Mapping of accounts — redirect an imported code onto one of your
            existing accounts instead of creating a duplicate. */}
        <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:20,marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:800,color:T.text,marginBottom:4}}>Mapping of accounts</div>
          <div style={{fontSize:11,color:T.muted,marginBottom:14}}>Optional — for any imported account code that should actually post against one of your existing accounts, map it here instead of letting the import create a new one.</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 30px",gap:8,marginBottom:6,fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase"}}>
            <div>Imported account</div><div>Maps to (your account)</div><div></div>
          </div>
          {Object.keys(accountMap).length===0&&<div style={{fontSize:12,color:T.muted,padding:"8px 0"}}>No mappings yet.</div>}
          {Object.entries(accountMap).map(([from,to])=>(
            <div key={from} style={{display:"grid",gridTemplateColumns:"1fr 1fr 30px",gap:8,alignItems:"center",marginBottom:6}}>
              <select value={from} onChange={e=>{const v=e.target.value;setAccountMap(m=>{const n={...m};delete n[from];n[v]=to;return n;});}} style={{...inp,fontSize:12}}>
                {parsed.accounts.map(a=><option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
              </select>
              <AccDrop value={to} onChange={v=>setAccountMap(m=>({...m,[from]:v}))} accounts={accounts}/>
              <button onClick={()=>setAccountMap(m=>{const n={...m};delete n[from];return n;})} style={{background:"none",border:"none",color:T.red,cursor:"pointer",fontSize:14}}>✕</button>
            </div>
          ))}
          <button onClick={()=>{
            const unmapped=parsed.accounts.find(a=>!(a.code in accountMap));
            if(unmapped)setAccountMap(m=>({...m,[unmapped.code]:""}));
          }} style={{background:"none",border:"none",color:T.accent,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",padding:0,marginTop:4}}>+ New row</button>
        </div>

        <div style={{display:"flex",gap:8}}>
          <button onClick={doImport} disabled={importing} style={{background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"10px 20px",fontSize:13,fontWeight:700,cursor:importing?"wait":"pointer",fontFamily:"inherit"}}>{importing?"Importing…":"Import account information"}</button>
          <button onClick={()=>{setParsed(null);setAccountMap({});}} disabled={importing} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 20px",fontSize:13,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
        </div>
        </>
      )}

      {importResult&&(
        <div style={{background:T.greenBg,border:`1px solid ${T.green}`,borderRadius:12,padding:20}}>
          <div style={{fontSize:14,fontWeight:800,color:T.green,marginBottom:8}}>Import complete</div>
          <div style={{fontSize:13,color:T.text,lineHeight:1.8}}>
            {importResult.accountsAdded} account{importResult.accountsAdded===1?"":"s"} added{importResult.accountsUpdated>0&&`, ${importResult.accountsUpdated} updated`} · {importResult.contactsAdded} contact{importResult.contactsAdded===1?"":"s"} added{importResult.contactsUpdated>0&&`, ${importResult.contactsUpdated} updated`} · {importResult.txnsAdded} voucher{importResult.txnsAdded===1?"":"s"} created{importResult.openingBalancesAdded>0&&<><br/>{importResult.openingBalancesAdded} opening balance entr{importResult.openingBalancesAdded===1?"y":"ies"} posted against {OPENING_BALANCE_CODE} · Opening balance equity</>}
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerSettingsScreen({contacts}){
  const[defaultTerms,setDefaultTerms]=useState(()=>{try{return localStorage.getItem("rr_default_payment_terms")||"14";}catch{return"14";}});
  const saveDefaultTerms=(v)=>{setDefaultTerms(v);try{localStorage.setItem("rr_default_payment_terms",v);}catch{}};
  const customerCount=contacts.filter(c=>c.type==="customer").length;
  const supplierCount=contacts.filter(c=>c.type==="supplier").length;
  return(
    <div style={{maxWidth:800}}>
      <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 16px"}}>Customer settings</h1>
      <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:20,marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:800,color:T.text,marginBottom:16}}>Settings for new customers/suppliers</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Customer numbering</div>
            <div style={{...inp,background:T.bg,color:T.sub}}>C001, C002, … (next: C{String(customerCount+1).padStart(3,"0")})</div>
          </div>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Supplier numbering</div>
            <div style={{...inp,background:T.bg,color:T.sub}}>S001, S002, … (next: S{String(supplierCount+1).padStart(3,"0")})</div>
          </div>
        </div>
        <p style={{fontSize:11,color:T.muted,marginTop:8}}>Numbering is automatic and can't be changed — it's how the app tells customers and suppliers apart internally.</p>
      </div>
      <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:20}}>
        <div style={{fontSize:14,fontWeight:800,color:T.text,marginBottom:16}}>Default payment terms</div>
        <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Due date is</div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <input type="number" value={defaultTerms} onChange={e=>saveDefaultTerms(e.target.value)} style={{...inp,width:80}}/>
          <span style={{fontSize:13,color:T.sub}}>days after the invoice date, for any new customer that doesn't have their own terms set.</span>
        </div>
      </div>
    </div>
  );
}

function CustomersRegisterScreen({contacts,setContacts,transactions,mergeContacts,onOpenReskontro,autoOpenNew,companyProfile,onNavigateImport}){
  const[type,setType]=useState("customer");
  const[search,setSearch]=useState("");
  const[editingId,setEditingId]=useState(null);
  const[showNew,setShowNew]=useState(false);
  useEffect(()=>{if(autoOpenNew)setShowNew(true);},[autoOpenNew]);
  const[form,setForm]=useState({name:"",email:"",phone:"",address:"",accountNo:"",paymentTermsDays:"30",creditLimit:""});

  const list=contacts.filter(c=>c.type===type&&(!search||c.name.toLowerCase().includes(search.toLowerCase())||(c.email||"").toLowerCase().includes(search.toLowerCase())));
  const code=type==="customer"?"1500":"2400";
  const getBalance=cid=>transactions.filter(t=>t.contactId===cid).reduce((s,t)=>t.debitCode===code?s+t.amount:t.creditCode===code?s-t.amount:s,0);

  const nextId=()=>{
    const prefix=type==="customer"?"C":"S";
    const nums=contacts.filter(c=>c.type===type).map(c=>parseInt((c.id||"").slice(1))||0);
    return`${prefix}${String((nums.length?Math.max(...nums):0)+1).padStart(3,"0")}`;
  };

  const startEdit=(c)=>{setEditingId(c.id);setForm({name:c.name||"",email:c.email||"",phone:c.phone||"",address:c.address||"",accountNo:c.accountNo||"",paymentTermsDays:c.paymentTermsDays!=null?String(c.paymentTermsDays):"30",creditLimit:c.creditLimit!=null?String(c.creditLimit):""});setShowNew(false);};
  const startNew=()=>{setEditingId(null);setForm({name:"",email:"",phone:"",address:"",accountNo:"",paymentTermsDays:"30",creditLimit:""});setShowNew(true);};
  const save=()=>{
    if(!form.name.trim())return;
    const cleaned={...form,paymentTermsDays:parseInt(form.paymentTermsDays)||30,creditLimit:form.creditLimit===""?null:parseFloat(form.creditLimit)};
    if(editingId){
      setContacts(contacts.map(c=>c.id===editingId?{...c,...cleaned}:c));
      setEditingId(null);
    }else{
      setContacts([...contacts,{id:nextId(),type,...cleaned}]);
      setShowNew(false);
    }
  };
  const cancel=()=>{setEditingId(null);setShowNew(false);};

  const exportContacts=()=>{
    const aoa=[["Type","Name","Email","Phone","Address","Account no.","Payment terms (days)","Credit limit"],
      ...contacts.map(c=>[c.type,c.name,c.email||"",c.phone||"",c.address||"",c.accountNo||"",c.paymentTermsDays!=null?c.paymentTermsDays:30,c.creditLimit!=null?c.creditLimit:""])];
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb,ws,"Contacts");
    XLSX.writeFile(wb,"Contacts.xlsx");
  };
  const[importing,setImporting]=useState(false);
  const[importError,setImportError]=useState("");
  const[showMerge,setShowMerge]=useState(false);
  const[mergeKeepId,setMergeKeepId]=useState("");
  const[mergeRemoveId,setMergeRemoveId]=useState("");
  const[merging,setMerging]=useState(false);
  // Column matching used to require an exact header spelling ("Name"/"name"
  // only) — any real export using something like "Kunde-/leverandørnavn",
  // "Company", or "Leverandør" silently skipped every row. Headers are now
  // normalized (lowercased, trimmed, punctuation stripped) and matched
  // against a real synonym list, matching the same fix applied to the other
  // import screen (Settings → Import). Rows with no recognizable Type column
  // now default to whichever tab (Customers/Suppliers) you imported from,
  // instead of silently defaulting everything to "customer".
  const normImportKey=s=>String(s||"").toLowerCase().trim().replace(/[^a-z0-9]/g,"");
  const IMPORT_SYNONYMS={
    name:["name","navn","companyname","company","business","businessname","firma","firmanavn","supplier","suppliername","leverandor","leverandornavn","customer","customername","kunde","kundenavn","contactname","kontaktnavn","organisasjon","virksomhet"],
    email:["email","emailaddress","epost","epostadresse","mail"],
    phone:["phone","phonenumber","telefon","tlf","mobil","mobile"],
    address:["address","adresse","gateadresse","street","streetaddress"],
    accountNo:["accountno","accountnumber","kontonummer","iban"],
    paymentTermsDays:["paymentterms","paymenttermsdays","betalingsbetingelser"],
    creditLimit:["creditlimit","kredittgrense"],
    type:["type","kundeleverandor","kundetype"],
  };
  const findImportField=(normRow,field)=>{
    for(const syn of IMPORT_SYNONYMS[field]){if(normRow[syn]!=null)return String(normRow[syn]).trim();}
    return"";
  };
  // Some real exports put a report title ("Customers/suppliers") or a blank
  // row above the actual column headers — sheet_to_json always treated row 1
  // as the header row regardless, turning every real header into a
  // meaningless "__EMPTY" placeholder and silently skipping every row. Scan
  // the first several rows and use whichever one actually looks like a
  // header row (most cells matching a known field name), falling back to
  // row 0 so a normal file's behavior is unchanged.
  const findImportHeaderRowIndex=(rawRows)=>{
    const allSynonyms=Object.values(IMPORT_SYNONYMS).flat();
    let best=0,bestScore=0;
    for(let i=0;i<Math.min(10,rawRows.length);i++){
      const score=(rawRows[i]||[]).filter(cell=>allSynonyms.includes(normImportKey(cell))).length;
      if(score>bestScore){bestScore=score;best=i;}
    }
    return best;
  };
  const importContacts=async(file)=>{
    setImportError("");setImporting(true);
    try{
      const isCsv=/\.csv$/i.test(file.name);
      const wb=isCsv?XLSX.read(await file.text(),{type:"string"}):XLSX.read(await file.arrayBuffer(),{type:"array"});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rawRows=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
      const headerRowIdx=findImportHeaderRowIndex(rawRows);
      const json=XLSX.utils.sheet_to_json(ws,{range:headerRowIdx,defval:""});
      if(!json.length){setImportError("That file appears to be empty.");setImporting(false);return;}
      const originalHeaders=Object.keys(json[0]||{});
      const existingCustomerNums=contacts.filter(c=>c.type==="customer").map(c=>parseInt((c.id||"").slice(1))||0);
      const existingSupplierNums=contacts.filter(c=>c.type==="supplier").map(c=>parseInt((c.id||"").slice(1))||0);
      let nextC=(existingCustomerNums.length?Math.max(...existingCustomerNums):0)+1;
      let nextS=(existingSupplierNums.length?Math.max(...existingSupplierNums):0)+1;
      const newContacts=[];
      let skipped=0;
      json.forEach(row=>{
        const normRow={};
        Object.keys(row).forEach(k=>{normRow[normImportKey(k)]=row[k];});
        const name=findImportField(normRow,"name");
        if(!name){skipped++;return;}
        const typeVal=findImportField(normRow,"type").toLowerCase();
        const rowType=typeVal.includes("supplier")||typeVal.includes("leverand")?"supplier":typeVal.includes("customer")||typeVal.includes("kunde")?"customer":type;
        const id=rowType==="customer"?`C${String(nextC++).padStart(3,"0")}`:`S${String(nextS++).padStart(3,"0")}`;
        newContacts.push({
          id,type:rowType,name,
          email:findImportField(normRow,"email"),
          phone:findImportField(normRow,"phone"),
          address:findImportField(normRow,"address"),
          accountNo:findImportField(normRow,"accountNo"),
          paymentTermsDays:parseInt(findImportField(normRow,"paymentTermsDays"))||30,
          creditLimit:(()=>{const v=findImportField(normRow,"creditLimit");return v?parseFloat(v):null;})(),
        });
      });
      if(!newContacts.length){
        setImportError(`No usable rows found${skipped?` (${skipped} skipped — missing a name)`:""}. This file's column headers were: ${originalHeaders.join(", ")||"(none detected)"}. None of them matched a recognized Name column — rename one to "Name" and try again.`);
        setImporting(false);return;
      }
      setContacts([...contacts,...newContacts]);
      alert(`Imported ${newContacts.length} contact${newContacts.length===1?"":"s"}${skipped?` (${skipped} skipped — missing a name)`:""}.`);
    }catch(e){setImportError("Couldn't read that file. Make sure it's a CSV or Excel export.");}
    setImporting(false);
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Customers and suppliers</h1>
        <div style={{display:"flex",gap:8}}>
          <button onClick={exportContacts} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 14px",fontWeight:600,fontSize:12,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}><i className="ti ti-download" style={{fontSize:13,marginRight:5}}/>Export</button>
          <label style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 14px",fontWeight:600,fontSize:12,color:T.sub,cursor:importing?"wait":"pointer",fontFamily:"inherit"}}>
            <i className="ti ti-upload" style={{fontSize:13,marginRight:5}}/>{importing?"Importing…":"Import"}
            <input type="file" accept=".csv,.xlsx,.xls" disabled={importing} style={{display:"none"}} onChange={e=>{if(e.target.files[0])importContacts(e.target.files[0]);e.target.value="";}}/>
          </label>
          {mergeContacts&&<button onClick={()=>setShowMerge(true)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 14px",fontWeight:600,fontSize:12,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}><i className="ti ti-git-merge" style={{fontSize:13,marginRight:5}}/>Merge</button>}
          <button onClick={startNew} style={{background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"9px 16px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}><i className="ti ti-plus" style={{fontSize:13,marginRight:5}}/>New {type==="customer"?"customer":"supplier"}</button>
        </div>
      </div>
      {importError&&<div style={{background:T.redLight,color:T.red,borderRadius:8,padding:"10px 14px",fontSize:12,marginBottom:14}}>{importError}</div>}

      {showMerge&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>!merging&&setShowMerge(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:T.radius.xl,maxWidth:440,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",padding:24}}>
            <div style={{fontSize:15,fontWeight:800,color:T.text,marginBottom:4}}>Merge duplicate contacts</div>
            <p style={{fontSize:11,color:T.muted,marginBottom:16}}>Every transaction on the duplicate gets reassigned to the one you keep, then the duplicate is removed. This can't be undone.</p>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Duplicate (will be removed)</div>
              <select value={mergeRemoveId} onChange={e=>setMergeRemoveId(e.target.value)} style={{...inp}}>
                <option value="">— Select —</option>
                {contacts.filter(c=>c.id!==mergeKeepId).map(c=><option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
              </select>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Merge into (will be kept)</div>
              <select value={mergeKeepId} onChange={e=>setMergeKeepId(e.target.value)} style={{...inp}}>
                <option value="">— Select —</option>
                {contacts.filter(c=>c.id!==mergeRemoveId).map(c=><option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
              </select>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={async()=>{
                if(!mergeKeepId||!mergeRemoveId)return;
                setMerging(true);
                const result=await mergeContacts(mergeKeepId,mergeRemoveId);
                setMerging(false);
                if(result.error){alert(result.error);return;}
                alert(`Merged — ${result.count} transaction${result.count===1?"":"s"} reassigned.`);
                setShowMerge(false);setMergeKeepId("");setMergeRemoveId("");
              }} disabled={!mergeKeepId||!mergeRemoveId||merging} style={{flex:1,background:mergeKeepId&&mergeRemoveId?T.accent:T.border,color:mergeKeepId&&mergeRemoveId?"#fff":T.muted,border:"none",borderRadius:8,padding:"11px",fontWeight:700,fontSize:13,cursor:mergeKeepId&&mergeRemoveId?"pointer":"default",fontFamily:"inherit"}}>{merging?"Merging…":"Merge"}</button>
              <button onClick={()=>{setShowMerge(false);setMergeKeepId("");setMergeRemoveId("");}} disabled={merging} style={{flex:1,background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"11px",fontWeight:600,fontSize:13,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <button onClick={()=>setType("customer")} style={{background:type==="customer"?T.accent:"none",color:type==="customer"?"#fff":T.sub,border:`1px solid ${type==="customer"?T.accent:T.border}`,borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Customers</button>
        <button onClick={()=>setType("supplier")} style={{background:type==="supplier"?T.accent:"none",color:type==="supplier"?"#fff":T.sub,border:`1px solid ${type==="supplier"?T.accent:T.border}`,borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Suppliers</button>
        <div style={{flex:1}}/>
        <input placeholder="Search name or email" value={search} onChange={e=>setSearch(e.target.value)} style={{...inp,width:220}}/>
      </div>

      {showNew&&(
        <NewContactModal
          defaultType={type}
          country={companyProfile&&companyProfile.country==="NO"?"NO":"PK"}
          onSave={contact=>{setContacts([...contacts,{id:nextId(),...contact}]);setShowNew(false);}}
          onClose={()=>setShowNew(false)}
          onBulkImport={onNavigateImport?()=>{setShowNew(false);onNavigateImport();}:undefined}
        />
      )}
      {editingId&&(
        <div onClick={cancel} style={{position:"fixed",inset:0,background:"rgba(15,23,32,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:480,maxHeight:"88vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.28)",padding:20}}>
            <div style={{fontSize:16,fontWeight:800,color:T.text,marginBottom:14}}>Edit {type}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <input placeholder="Name" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} style={inp}/>
              <input placeholder="Email" type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} style={inp}/>
              <input placeholder="Phone" value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))} style={inp}/>
              <input placeholder="Account no. / IBAN (optional)" value={form.accountNo} onChange={e=>setForm(p=>({...p,accountNo:e.target.value}))} style={inp}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <input placeholder="Address" value={form.address} onChange={e=>setForm(p=>({...p,address:e.target.value}))} style={inp}/>
              <div>
                <select value={form.paymentTermsDays} onChange={e=>setForm(p=>({...p,paymentTermsDays:e.target.value}))} style={inp}>
                  <option value="0">Due immediately</option>
                  <option value="7">Net 7</option>
                  <option value="15">Net 15</option>
                  <option value="30">Net 30</option>
                  <option value="45">Net 45</option>
                  <option value="60">Net 60</option>
                </select>
              </div>
            </div>
            {type==="customer"&&(
              <input type="number" placeholder="Credit limit (optional — warns before invoicing past it)" value={form.creditLimit} onChange={e=>setForm(p=>({...p,creditLimit:e.target.value}))} style={{...inp,marginBottom:10}}/>
            )}
            <div style={{display:"flex",gap:8,marginTop:6}}>
              <button onClick={save} style={{flex:1,background:T.accent,color:"#fff",border:"none",borderRadius:10,padding:"11px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Save</button>
              <button onClick={cancel} style={{flex:1,background:"none",border:`1px solid ${T.border}`,borderRadius:10,padding:"11px",fontWeight:600,fontSize:13,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        <div style={{display:"grid",gridTemplateColumns:"70px 1.6fr 1fr 1fr 90px",gap:8,padding:"0 14px",marginBottom:2}}>
          {["ID","Name","Contact","Terms","Balance"].map(h=><div key={h} style={{fontSize:10,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:0.3,textAlign:h==="Balance"?"right":"left"}}>{h}</div>)}
        </div>
        {list.map(c=>{
          const bal=getBalance(c.id);
          const termsLabel=c.paymentTermsDays===0||c.paymentTermsDays==null?(c.paymentTermsDays===0?"Due immediately":"Net 30"):`Net ${c.paymentTermsDays}`;
          return(
            <div key={c.id} style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:"12px 14px",display:"grid",gridTemplateColumns:"70px 1.6fr 1fr 1fr 90px",gap:8,alignItems:"center",boxShadow:"0 1px 3px rgba(0,0,0,0.03)"}}>
              <div style={{fontSize:11,fontWeight:800,color:T.accent,background:T.accentLight,borderRadius:6,padding:"3px 7px",width:"fit-content"}}>{c.id}</div>
              <div>
                <div onClick={()=>onOpenReskontro&&onOpenReskontro(type)} style={{cursor:"pointer",fontWeight:700,fontSize:13,color:T.text}}>{c.name}</div>
                {c.address&&<div style={{fontSize:11,color:T.muted,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.address}</div>}
              </div>
              <div style={{fontSize:12,color:T.sub}}>
                {c.email&&<div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.email}</div>}
                {c.phone&&<div style={{color:T.muted,fontSize:11,marginTop:1}}>{c.phone}</div>}
                {!c.email&&!c.phone&&<span style={{color:T.muted}}>—</span>}
              </div>
              <div style={{fontSize:11,color:T.sub}}>
                <div>{termsLabel}</div>
                {type==="customer"&&c.creditLimit!=null&&<div style={{color:T.muted,marginTop:1}}>Limit {fmt(c.creditLimit)}</div>}
              </div>
              <div style={{textAlign:"right",display:"flex",alignItems:"center",justifyContent:"flex-end",gap:8}}>
                <span style={{fontWeight:700,fontSize:12,color:bal>=0?T.green:T.red}}>{sign(bal)}</span>
                <button onClick={()=>startEdit(c)} title="Edit" style={{background:"none",border:"none",color:T.muted,cursor:"pointer",padding:2}}><i className="ti ti-pencil" style={{fontSize:13}}/></button>
              </div>
            </div>
          );
        })}
        {!list.length&&<div style={{background:"#fff",border:`1px dashed ${T.border}`,borderRadius:12,padding:"28px 0",textAlign:"center",color:T.muted,fontSize:12}}>No {type==="customer"?"customers":"suppliers"} yet.</div>}
      </div>
    </div>
  );
}

// Company information — full details screen, matching Tripletex's Company
// information layout: identity/address on the left, contact/business details
// on the right. Separate from the smaller invoice-header card in Settings.
function CompanyInfoScreen({companyProfile,saveCompanyProfile,requestRedrockAccess,isViewingOwnBooks=true}){
  const[form,setForm]=useState(companyProfile);
  const[saved,setSaved]=useState(false);
  const[requestNote,setRequestNote]=useState("");
  const[requestSent,setRequestSent]=useState(false);
  const[requesting,setRequesting]=useState(false);
  const sendAccessRequest=async()=>{
    setRequesting(true);
    const result=await requestRedrockAccess(requestNote);
    setRequesting(false);
    if(result.error){alert(result.error);return;}
    setRequestSent(true);
  };
  const save=()=>{saveCompanyProfile(form);setSaved(true);setTimeout(()=>setSaved(false),1800);};
  const set=(k)=>e=>setForm(p=>({...p,[k]:e.target.value}));

  return(
    <div style={{maxWidth:900}}>
      <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 16px"}}>Company information</h1>
      <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:14,padding:20}}>
        <div style={{fontSize:14,fontWeight:800,color:T.text,marginBottom:16}}>Company details</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"14px 32px"}}>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Name</div>
            <input value={form.companyName} onChange={set("companyName")} style={inp}/>
          </div>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Telephone number</div>
            <input value={form.phone||""} onChange={set("phone")} style={inp}/>
          </div>

          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Address</div>
            <input value={form.address} onChange={set("address")} style={inp}/>
          </div>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Telephone no. mobile</div>
            <input value={form.mobile} onChange={set("mobile")} style={inp}/>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Postcode</div>
              <input value={form.postcode||""} onChange={set("postcode")} style={inp}/>
            </div>
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>City</div>
              <input value={form.city||""} onChange={set("city")} style={inp}/>
            </div>
          </div>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Fax number</div>
            <input value={form.faxNumber||""} onChange={set("faxNumber")} style={inp}/>
          </div>

          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Organisation number</div>
            <input value={form.orgNumber} onChange={set("orgNumber")} style={inp}/>
          </div>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Email address</div>
            <input type="email" value={form.email} onChange={set("email")} style={inp}/>
          </div>

          <div></div>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Website</div>
            <input value={form.website||""} onChange={set("website")} style={inp}/>
          </div>

          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Bank account (for invoices)</div>
            <input value={form.bankAccount} onChange={set("bankAccount")} style={inp}/>
          </div>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Form of business organization</div>
            <select value={form.formOfBusiness||""} onChange={set("formOfBusiness")} style={inp}>
              <option value="">—</option>
              <option>Sole proprietorship</option>
              <option>Partnership</option>
              <option>Private limited company</option>
              <option>Public limited company</option>
              <option>Non-profit / NGO</option>
            </select>
          </div>

          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Country</div>
            <select value={form.country||"PK"} onChange={e=>{const country=e.target.value;setForm(p=>({...p,country,currency:country==="NO"?"NOK":"PKR"}));}} style={inp}>
              <option value="PK">Pakistan</option>
              <option value="NO">Norway</option>
            </select>
            <div style={{fontSize:10,color:T.muted,marginTop:4}}>{form.country==="NO"?"VAT/MVA features are enabled.":"VAT features are hidden — Pakistani tax filing isn't built yet."}</div>
          </div>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Default VAT %</div>
            <input type="number" value={form.vatPct} onChange={e=>setForm(p=>({...p,vatPct:parseFloat(e.target.value)||0}))} style={inp}/>
          </div>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Currency</div>
            <select value={form.currency||"PKR"} onChange={set("currency")} style={inp}>
              <option>PKR</option><option>NOK</option><option>USD</option><option>EUR</option><option>GBP</option>
            </select>
          </div>

          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Fiscal year starts</div>
            <select value={form.fiscalYearStartMonth||1} onChange={e=>setForm(p=>({...p,fiscalYearStartMonth:parseInt(e.target.value)}))} style={inp}>
              {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m,i)=><option key={i} value={i+1}>{m}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Language</div>
            <select value={form.language||"English"} onChange={set("language")} style={inp}>
              <option>English</option><option>Norwegian</option><option>Urdu</option>
            </select>
          </div>
        </div>

        <div style={{marginTop:20,display:"flex",alignItems:"center",gap:12}}>
          {form.logoDataUrl?(
            <img src={form.logoDataUrl} style={{width:48,height:48,objectFit:"contain",borderRadius:8,border:`1px solid ${T.border}`}}/>
          ):(
            <div style={{width:48,height:48,borderRadius:8,border:`1px dashed ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:T.muted}}>No logo</div>
          )}
          <label style={{fontSize:12,fontWeight:700,color:T.accent,cursor:"pointer"}}>
            {form.logoDataUrl?"Change logo":"Upload logo"}
            <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{
              const file=e.target.files[0];
              if(!file)return;
              const reader=new FileReader();
              reader.onload=ev=>setForm(p=>({...p,logoDataUrl:ev.target.result}));
              reader.readAsDataURL(file);
            }}/>
          </label>
        </div>

        <button onClick={save} style={{marginTop:20,background:saved?T.green:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"10px 24px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>{saved?"✓ Saved":"Save"}</button>
      </div>

      {isViewingOwnBooks&&requestRedrockAccess&&(
        <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:20,marginTop:16}}>
          <div style={{fontSize:14,fontWeight:800,color:T.text,marginBottom:6}}>Give your accountant access</div>
          <p style={{fontSize:12,color:T.muted,marginBottom:14}}>If Redrock Ledger manages your books, request access here — they'll see the request and can assign the right person on their team to your account.</p>
          {requestSent?(
            <div style={{background:T.greenBg,color:T.green,borderRadius:8,padding:"10px 14px",fontSize:12,fontWeight:600}}>✓ Request sent — Redrock will follow up once access is set up.</div>
          ):(
            <>
              <textarea value={requestNote} onChange={e=>setRequestNote(e.target.value)} placeholder="Optional note (e.g. which accountant you spoke with)" style={{...inp,minHeight:60,resize:"vertical",marginBottom:10}}/>
              <button onClick={sendAccessRequest} disabled={requesting} style={{background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"9px 18px",fontSize:13,fontWeight:700,cursor:requesting?"wait":"pointer",fontFamily:"inherit"}}>{requesting?"Sending…":"Request access"}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// New voucher — Tripletex-style registration screen. Pick a voucher type
// (supplier invoice or receipt), fill it in on the left, attach or pick a
// document from the Inbox and preview it on the right, then post.
function NewVoucherScreen({accounts,contacts,inboxFiles,uploadInboxFile,addTransaction,onDone}){
  const[voucherType,setVoucherType]=useState("supplier"); // "supplier" | "receipt"
  const suppliers=contacts.filter(c=>c.type==="supplier");
  const expenseAccounts=accounts.filter(a=>a.code.startsWith("4")||a.code.startsWith("5")||a.code.startsWith("6")||a.code.startsWith("7"));
  const today=new Date().toISOString().slice(0,10);

  const[supplierId,setSupplierId]=useState(suppliers[0]?suppliers[0].id:"");
  const[invoiceNo,setInvoiceNo]=useState("");
  const[date,setDate]=useState(today);
  const[dueDate,setDueDate]=useState(today);
  const[expenseAccount,setExpenseAccount]=useState(expenseAccounts[0]?expenseAccounts[0].code:"");
  const[amount,setAmount]=useState("");
  const[vatPct,setVatPct]=useState("0");
  const[description,setDescription]=useState("");
  const[attachedFileId,setAttachedFileId]=useState(null);
  const[uploading,setUploading]=useState(false);
  const[saving,setSaving]=useState(false);

  // Receipt mode is plain double-entry — any debit account, any credit
  // account, no "paid from" assumption baked in.
  const[debitCode,setDebitCode]=useState(expenseAccounts[0]?expenseAccounts[0].code:"");
  const[creditCode,setCreditCode]=useState(accounts[0]?accounts[0].code:"");
  const[receiptContactId,setReceiptContactId]=useState("");
  const receiptNeedContact=debitCode==="1500"||creditCode==="1500"||debitCode==="2400"||creditCode==="2400";
  const receiptContactType=(debitCode==="1500"||creditCode==="1500")?"customer":"supplier";

  const attachedFile=inboxFiles.find(f=>f.id===attachedFileId);
  const grossAmount=parseFloat(amount)||0;
  const vatRate=parseFloat(vatPct)||0;
  const vatAmount=grossAmount-(grossAmount/(1+vatRate/100));
  const netAmount=grossAmount-vatAmount;
  const valid=voucherType==="supplier"
    ?(grossAmount>0&&expenseAccount&&supplierId)
    :(grossAmount>0&&debitCode&&creditCode&&debitCode!==creditCode);

  const handleUpload=async(file)=>{
    setUploading(true);
    const newFile=await uploadInboxFile(file);
    if(newFile)setAttachedFileId(newFile.id);
    setUploading(false);
  };

  const handlePost=async()=>{
    if(!valid||saving)return;
    setSaving(true);
    const supplier=contacts.find(c=>c.id===supplierId);
    const desc=description||(voucherType==="supplier"?`${supplier?supplier.name:"Supplier"} invoice${invoiceNo?" "+invoiceNo:""}`:"Receipt");
    const form=voucherType==="supplier"
      ?{date,dueDate,invoiceNo,debitCode:expenseAccount,creditCode:"2400",description:desc,amount:grossAmount,contactId:supplierId,attachmentId:attachedFileId||undefined,vatPct:vatRate,vatAmount:Math.round(vatAmount*100)/100}
      :{date,debitCode,creditCode,description:desc,amount:grossAmount,attachmentId:attachedFileId||undefined,contactId:receiptNeedContact&&receiptContactId?receiptContactId:undefined};
    await addTransaction(form);
    setSaving(false);
    if(onDone)onDone();
  };

  return(
    <ResizableSplit left={(
      <div>
        <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 16px"}}>New voucher</h1>
        <div style={{display:"flex",gap:8,marginBottom:18}}>
          <button onClick={()=>setVoucherType("supplier")} style={{background:voucherType==="supplier"?T.accent:"none",color:voucherType==="supplier"?"#fff":T.sub,border:`1px solid ${voucherType==="supplier"?T.accent:T.border}`,borderRadius:8,padding:"8px 16px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Supplier invoice</button>
          <button onClick={()=>setVoucherType("receipt")} style={{background:voucherType==="receipt"?T.accent:"none",color:voucherType==="receipt"?"#fff":T.sub,border:`1px solid ${voucherType==="receipt"?T.accent:T.border}`,borderRadius:8,padding:"8px 16px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Receipt</button>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {voucherType==="supplier"?(
            <>
              <div>
                <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Supplier</div>
                <select value={supplierId} onChange={e=>setSupplierId(e.target.value)} style={{...inp}}>
                  {!suppliers.length&&<option value="">No suppliers yet</option>}
                  {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Invoice date</div>
                  <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{...inp}}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Due date</div>
                  <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} style={{...inp}}/>
                </div>
              </div>
              <div>
                <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Invoice number</div>
                <input value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)} style={{...inp}}/>
              </div>
              <div style={{background:T.bg,borderRadius:10,padding:12,border:`1px solid ${T.border}`}}>
                <div style={{fontSize:11,fontWeight:800,color:T.text,marginBottom:10,textTransform:"uppercase",letterSpacing:0.5}}>Costs</div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <div>
                    <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Cost account</div>
                    <AccDrop value={expenseAccount} onChange={code=>{
                      setExpenseAccount(code);
                      const acc=accounts.find(a=>a.code===code);
                      if(acc&&acc.defaultVatPct!=null)setVatPct(String(acc.defaultVatPct));
                    }} accounts={expenseAccounts}/>
                    {(()=>{const acc=accounts.find(a=>a.code===expenseAccount);return acc&&acc.notes?<div style={{fontSize:10,color:T.muted,marginTop:4}}>ℹ️ {acc.notes}</div>:null;})()}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div>
                      <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Amount incl. VAT</div>
                      <input type="number" placeholder="0" value={amount} onChange={e=>setAmount(e.target.value)} style={{...inp}}/>
                    </div>
                    <div>
                      <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>VAT %</div>
                      <select value={vatPct} onChange={e=>setVatPct(e.target.value)} style={{...inp}}>
                        {vatCodeOptions("input").map(c=><option key={c.code} value={c.rate}>{c.code}: ({c.rate}%) {c.name}</option>)}
                      </select>
                    </div>
                  </div>
                  {vatRate>0&&(
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:T.muted,paddingTop:6,borderTop:`1px solid ${T.border}`}}>
                      <span>Net: {fmt(netAmount)}</span>
                      <span>VAT: {fmt(vatAmount)}</span>
                    </div>
                  )}
                  <div>
                    <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Description</div>
                    <input value={description} onChange={e=>setDescription(e.target.value)} style={{...inp}}/>
                  </div>
                </div>
              </div>
            </>
          ):(
            <>
              <div style={{display:"grid",gridTemplateColumns:"20% 1fr",gap:10}}>
                <div>
                  <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Date</div>
                  <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{...inp}}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Description</div>
                  <input value={description} onChange={e=>setDescription(e.target.value)} style={{...inp}}/>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                <div>
                  <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Debit account</div>
                  <select value={debitCode} onChange={e=>setDebitCode(e.target.value)} style={{...inp}}>
                    {accounts.map(a=><option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Credit account</div>
                  <select value={creditCode} onChange={e=>setCreditCode(e.target.value)} style={{...inp}}>
                    {accounts.map(a=><option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Amount</div>
                  <input type="number" placeholder="0" value={amount} onChange={e=>setAmount(e.target.value)} style={{...inp}}/>
                </div>
              </div>
              {debitCode===creditCode&&<div style={{fontSize:11,color:T.red}}>Debit and credit can't be the same account.</div>}
              {receiptNeedContact&&(
                <div>
                  <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>{receiptContactType==="customer"?"Customer":"Supplier"}</div>
                  <ContactSearchInline contacts={contacts} value={receiptContactId} onChange={setReceiptContactId} type={receiptContactType}/>
                </div>
              )}
            </>
          )}
          <button onClick={handlePost} disabled={!valid||saving} style={{background:valid?T.accent:T.border,color:valid?"#fff":T.muted,border:"none",borderRadius:10,padding:"12px",fontWeight:700,fontSize:14,cursor:valid?"pointer":"default",fontFamily:"inherit"}}>{saving?"Posting…":"Post voucher"}</button>
        </div>
      </div>
    )} right={(
      <div style={{background:T.bg,borderRadius:12,padding:16,border:`1px solid ${T.border}`}}>
        <div style={{fontSize:11,color:T.muted,marginBottom:10,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>Document</div>
        {attachedFile?(
          <>
            <div style={{background:"#fff",borderRadius:8,height:440,display:"flex",alignItems:"center",justifyContent:"center",border:`1px solid ${T.border}`,marginBottom:10}}>
              <SignedFileViewer storagePath={attachedFile.storagePath} type={attachedFile.type} name={attachedFile.name} style={{width:"100%",height:"100%",borderRadius:8}}/>
            </div>
            <div style={{fontSize:11,color:T.sub,marginBottom:8,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{attachedFile.name}</div>
            <button onClick={()=>setAttachedFileId(null)} style={{width:"100%",background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px",fontSize:12,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Remove</button>
          </>
        ):(
          <>
            <label style={{display:"block",background:"#fff",border:`1px dashed ${T.border}`,borderRadius:8,padding:"30px 10px",textAlign:"center",cursor:uploading?"wait":"pointer",marginBottom:10}}>
              <div style={{fontSize:12,color:T.sub,fontWeight:600}}>{uploading?"Uploading…":"Upload a document"}</div>
              <input type="file" accept="image/*,.pdf" disabled={uploading} style={{display:"none"}} onChange={e=>{if(e.target.files[0])handleUpload(e.target.files[0]);}}/>
            </label>
            {inboxFiles.length>0&&(
              <select value="" onChange={e=>{if(e.target.value)setAttachedFileId(parseInt(e.target.value));}} style={{...inp,fontSize:12}}>
                <option value="">— or pick from Inbox —</option>
                {inboxFiles.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            )}
          </>
        )}
      </div>
    )}/>
  );
}

// Register voucher queue — the real batch flow: step through every selected
// file with Previous/Next, "Remove from queue" (skips without deleting), and
// per-item Create. Each file keeps its own draft as you navigate away and back.
function RegisterVoucherQueueScreen({fileIds,inboxFiles,accounts,contacts,addTransaction,onDone,renameInboxFileEntry,setAccounts,projects=[],trackProjects=false,saveProjects}){
  const[queue,setQueue]=useState(fileIds);
  const[idx,setIdx]=useState(0);
  const[formsByFile,setFormsByFile]=useState({});
  const[postedIds,setPostedIds]=useState([]);
  const[posting,setPosting]=useState(false);
  const[editingName,setEditingName]=useState(false);
  const[nameDraft,setNameDraft]=useState("");
  const[autoFilling,setAutoFilling]=useState(false);

  const suppliers=contacts.filter(c=>c.type==="supplier");
  const customers=contacts.filter(c=>c.type==="customer");
  const expenseAccounts=accounts.filter(a=>a.code.startsWith("4")||a.code.startsWith("5")||a.code.startsWith("6")||a.code.startsWith("7"));
  const incomeAccounts=accounts.filter(a=>a.code.startsWith("3"));
  const today=new Date().toISOString().slice(0,10);
  const currentFileId=queue[idx];
  const currentFile=inboxFiles.find(f=>f.id===currentFileId);

  const CURRENCIES=["PKR","USD","EUR","GBP","AED","SAR","NOK"];
  const newIncomeLine=()=>({lid:Date.now()+Math.random().toString(36).slice(2),accountCode:incomeAccounts[0]?incomeAccounts[0].code:"",vatCode:"5",amount:"",description:""});
  const defaultForm=(fid)=>{
    const f=inboxFiles.find(x=>x.id===fid);
    return{voucherType:"supplier",supplierId:suppliers[0]?suppliers[0].id:"",customerId:customers[0]?customers[0].id:"",invoiceNo:"",date:today,dueDate:today,currency:"PKR",expenseAccount:expenseAccounts[0]?expenseAccounts[0].code:"",incomeLines:[{...newIncomeLine(),description:f?f.name.replace(/\.[^.]+$/,""):""}],amount:"",vatPct:"0",description:f?f.name.replace(/\.[^.]+$/,""):"",debitCode:expenseAccounts[0]?expenseAccounts[0].code:"",creditCode:accounts[0]?accounts[0].code:""};
  };
  const form=formsByFile[currentFileId]||defaultForm(currentFileId);
  const setForm=(updates)=>setFormsByFile(p=>({...p,[currentFileId]:{...(p[currentFileId]||defaultForm(currentFileId)),...updates}}));
  const incomeLines=form.incomeLines||[newIncomeLine()];
  const setIncomeLines=lines=>setForm({incomeLines:lines});
  const updateIncomeLine=(lid,updates)=>setIncomeLines(incomeLines.map(l=>l.lid===lid?{...l,...updates}:l));
  const addIncomeLine=()=>setIncomeLines([...incomeLines,newIncomeLine()]);
  const copyIncomeLine=(lid)=>{
    const src=incomeLines.find(l=>l.lid===lid);
    if(!src)return;
    setIncomeLines([...incomeLines,{...src,lid:Date.now()+Math.random().toString(36).slice(2)}]);
  };
  const removeIncomeLine=(lid)=>{if(incomeLines.length>1)setIncomeLines(incomeLines.filter(l=>l.lid!==lid));};

  // General/receipt voucher — same multi-line pattern as incomeLines, but
  // each line carries its OWN debit account, credit account, and a VAT code
  // for each side independently (an expense debit and an income credit can
  // have genuinely different VAT treatment). Every line is a complete,
  // self-balanced Dr/Cr pair — multiple lines just mean multiple pairs
  // posted together and linked by one groupRef, same as incomeLines does.
  const newGeneralLine=()=>({lid:Date.now()+Math.random().toString(36).slice(2),description:"",debitCode:expenseAccounts[0]?expenseAccounts[0].code:"",debitVatCode:"0",creditCode:accounts[0]?accounts[0].code:"",creditVatCode:"0",amount:""});
  const generalLines=form.generalLines||[newGeneralLine()];
  const setGeneralLines=lines=>setForm({generalLines:lines});
  const updateGeneralLine=(lid,updates)=>setGeneralLines(generalLines.map(l=>l.lid===lid?{...l,...updates}:l));
  const addGeneralLine=()=>setGeneralLines([...generalLines,newGeneralLine()]);
  const copyGeneralLine=(lid)=>{
    const src=generalLines.find(l=>l.lid===lid);
    if(!src)return;
    setGeneralLines([...generalLines,{...src,lid:Date.now()+Math.random().toString(36).slice(2)}]);
  };
  const removeGeneralLine=(lid)=>{if(generalLines.length>1)setGeneralLines(generalLines.filter(l=>l.lid!==lid));};
  const[formExpanded,setFormExpanded]=useState(false);
  const generalTotal=generalLines.reduce((s,l)=>s+(parseFloat(l.amount)||0),0);

  // Display options — which optional columns show on the line editor below.
  // Persisted per-browser so the choice sticks between entries, matching the
  // "Visningsvalg" pattern but scoped to what this app's lines actually have:
  // VAT codes and description are the two genuinely optional ones (debit/
  // credit account and amount are never optional — a line is meaningless
  // without them).
  const[displayOpts,setDisplayOpts]=useState(()=>{
    try{return JSON.parse(localStorage.getItem("rr_voucher_display_opts")||"")||{showVat:true,showDescription:true};}catch{return{showVat:true,showDescription:true};}
  });
  const[showDisplayMenu,setShowDisplayMenu]=useState(false);
  const toggleDisplayOpt=key=>{
    const next={...displayOpts,[key]:!displayOpts[key]};
    setDisplayOpts(next);
    try{localStorage.setItem("rr_voucher_display_opts",JSON.stringify(next));}catch{}
  };
  const lineGridCols=[displayOpts.showDescription?"1.3fr":null,"1fr",displayOpts.showVat?"0.8fr":null,"1fr",displayOpts.showVat?"0.8fr":null,"0.9fr",trackProjects?"1fr":null,"56px"].filter(Boolean).join(" ");
  // Per-line VAT split (excl./VAT/incl.), grouped by MVA code for the
  // breakdown table under the lines — same shape as the reference dialog.
  const incomeLineCalc=(l)=>{
    const gross=parseFloat(l.amount)||0;
    const vc=findVatCode(l.vatCode,"output");
    const rate=vc?vc.rate:0;
    const excl=gross/(1+rate/100);
    return{gross,excl,vat:gross-excl,rate};
  };
  const incomeVatBreakdown=useMemo(()=>{
    const byCode={};
    incomeLines.forEach(l=>{
      const{gross,excl,vat}=incomeLineCalc(l);
      if(!byCode[l.vatCode])byCode[l.vatCode]={code:l.vatCode,excl:0,vat:0,gross:0};
      byCode[l.vatCode].excl+=excl;byCode[l.vatCode].vat+=vat;byCode[l.vatCode].gross+=gross;
    });
    return Object.values(byCode);
  },[incomeLines]);
  const incomeTotal=incomeVatBreakdown.reduce((s,r)=>s+r.gross,0);
  const[showLineOptions,setShowLineOptions]=useState(false);
  const[showDept,setShowDept]=useState(false);
  const[showEmployee,setShowEmployee]=useState(false);

  const grossAmount=form.voucherType==="income"?incomeTotal:(parseFloat(form.amount)||0);
  const vatRate=parseFloat(form.vatPct)||0;
  const vatAmount=grossAmount-(grossAmount/(1+vatRate/100));
  const netAmount=grossAmount-vatAmount;
  const valid=form.voucherType==="supplier"?(grossAmount>0&&form.expenseAccount&&form.supplierId)
    :form.voucherType==="income"?(incomeTotal>0&&incomeLines.every(l=>l.accountCode&&parseFloat(l.amount)>0)&&form.customerId)
    :generalLines.every(l=>l.debitCode&&l.creditCode&&l.debitCode!==l.creditCode&&parseFloat(l.amount)>0);
  const alreadyPosted=postedIds.includes(currentFileId);

  const goto=(newIdx)=>{if(newIdx>=0&&newIdx<queue.length)setIdx(newIdx);};
  const removeFromQueue=()=>{
    const newQueue=queue.filter(id=>id!==currentFileId);
    if(!newQueue.length){onDone();return;}
    setQueue(newQueue);
    setIdx(i=>Math.min(i,newQueue.length-1));
  };
  const postCurrent=async()=>{
    if(!valid||alreadyPosted||posting)return;
    setPosting(true);
    const supplier=contacts.find(c=>c.id===form.supplierId);
    const customer=contacts.find(c=>c.id===form.customerId);
    if(form.voucherType==="income"){
      // One ledger entry per income line (Dr 1500 Accounts Receivable / Cr the
      // line's income account), sharing a groupRef so opening any one of them
      // shows the whole invoice — same pattern as the manual multi-line entry.
      const groupRef=incomeLines.length>1?`grp-${Date.now()}`:null;
      for(const l of incomeLines){
        const{gross,vat}=incomeLineCalc(l);
        const desc=l.description||form.description||`${customer?customer.name:"Customer"} sale${form.invoiceNo?" "+form.invoiceNo:""}`;
        const lineVc=findVatCode(l.vatCode,"output");
        await addTransaction({date:form.date,dueDate:form.dueDate,invoiceNo:form.invoiceNo,debitCode:"1500",creditCode:l.accountCode,description:desc,amount:gross,contactId:form.customerId,attachmentId:currentFileId,vatPct:lineVc?lineVc.rate:0,vatCode:l.vatCode,vatAmount:Math.round(vat*100)/100,currency:form.currency,groupRef});
      }
    } else if(form.voucherType==="supplier"){
      const desc=form.description||`${supplier?supplier.name:"Supplier"} invoice${form.invoiceNo?" "+form.invoiceNo:""}`;
      await addTransaction({date:form.date,dueDate:form.dueDate,invoiceNo:form.invoiceNo,debitCode:form.expenseAccount,creditCode:"2400",description:desc,amount:grossAmount,contactId:form.supplierId,attachmentId:currentFileId,vatPct:vatRate,vatAmount:Math.round(vatAmount*100)/100});
    } else {
      // General voucher — one ledger entry per line, sharing a groupRef
      // when there's more than one, exactly like the income-lines path above.
      const groupRef=generalLines.length>1?`grp-${Date.now()}`:null;
      for(const l of generalLines){
        const amt=parseFloat(l.amount)||0;
        const debitVc=findVatCode(l.debitVatCode,"input");
        const creditVc=findVatCode(l.creditVatCode,"output");
        const desc=l.description||form.description||"Voucher entry";
        await addTransaction({date:form.date,debitCode:l.debitCode,creditCode:l.creditCode,description:desc,amount:amt,attachmentId:currentFileId,vatCode:l.debitVatCode||l.creditVatCode,vatPct:debitVc?debitVc.rate:(creditVc?creditVc.rate:0),groupRef});
      }
    }
    setPosting(false);
    // Remove it from the queue entirely — once it's posted there's nothing
    // left to do with it here, so it shouldn't still show up when paging
    // back and forth.
    const postedFileId=currentFileId;
    const newQueue=queue.filter(id=>id!==postedFileId);
    if(!newQueue.length){onDone();return;}
    setQueue(newQueue);
    setIdx(i=>Math.min(i,newQueue.length-1));
  };

  if(!currentFile)return null;
  const navBtn={background:"none",border:`1px solid ${T.border}`,borderRadius:6,width:28,height:28,cursor:"pointer",color:T.sub,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0};

  const startNameEdit=()=>{setNameDraft(currentFile.name);setEditingName(true);};
  const commitNameEdit=async()=>{
    const trimmed=nameDraft.trim();
    if(trimmed&&trimmed!==currentFile.name&&renameInboxFileEntry)await renameInboxFileEntry(currentFile.id,trimmed);
    setEditingName(false);
  };

  // OCR-style auto-fill — reads the current document with Claude vision and
  // pulls out the date (and total, if visible) straight into the form, the
  // same way a real bookkeeper would glance at the invoice before typing.
  const autoFillFromDocument=async()=>{
    if(!currentFile||autoFilling)return;
    if(!(currentFile.type||"").startsWith("image")){alert("Auto-fill currently only reads image files.");return;}
    setAutoFilling(true);
    try{
      const url=await getSignedUrl(currentFile.storagePath);
      if(!url)throw new Error("no url");
      const resp=await fetch(url);
      const blob=await resp.blob();
      const base64=await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(reader.result.split(",")[1]);
        reader.onerror=reject;
        reader.readAsDataURL(blob);
      });
      const{data,error}=await callClaudeAPI({
        model:"claude-sonnet-4-6",max_tokens:300,
        messages:[{role:"user",content:[
          {type:"image",source:{type:"base64",media_type:blob.type||"image/jpeg",data:base64}},
          {type:"text",text:"Look at this invoice or receipt image. Find the invoice/receipt date and the total amount due. Return ONLY valid JSON, no markdown: {\"date\":\"YYYY-MM-DD\" or \"\" if not found,\"amount\":number or null}"},
        ]}],
      });
      if(error==="NO_KEY"){alert("Add your Anthropic API key in Company → Settings to use auto-fill.");setAutoFilling(false);return;}
      if(error){alert("Couldn't read the document: "+error);setAutoFilling(false);return;}
      const text=data.content.map(b=>b.text||"").join("");
      const clean=text.replace(/```json|```/g,"").trim();
      const parsed=JSON.parse(clean);
      const updates={};
      if(parsed.date)updates.date=parsed.date;
      if(parsed.amount!=null&&!isNaN(parsed.amount)&&parsed.amount>0)updates.amount=String(parsed.amount);
      if(Object.keys(updates).length)setForm(updates);
      else alert("Couldn't find a date on this document — try a clearer photo.");
    }catch(e){
      alert("Couldn't read that document clearly.");
    }
    setAutoFilling(false);
  };

  return(
    <div style={{background:"#fff",borderRadius:12,border:`1px solid ${T.border}`,display:"flex",flexDirection:"column",height:"calc(100vh - 140px)",marginRight:-32}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"16px 24px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
        <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Register voucher</h1>
        <div style={{display:"flex",gap:8}}>
          <button onClick={removeFromQueue} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 14px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Remove from queue</button>
          <button onClick={onDone} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 14px",fontSize:12,fontWeight:600,color:T.muted,cursor:"pointer",fontFamily:"inherit"}}>✕ Close</button>
        </div>
      </div>

      <div style={{flex:1,minHeight:0,display:"flex"}}>
      <ResizableSplit defaultRightWidth={560} minRightWidth={360} maxRightWidth={1000} collapsible collapseLabel="Hide document" expandLabel="Show document" left={(
        <div style={{padding:24,height:"100%",overflowY:"auto"}}>
          <div style={{maxWidth:formExpanded?"none":920,display:"flex",justifyContent:"flex-end",marginBottom:4}}>
            <button onClick={()=>setFormExpanded(e=>!e)} style={{background:"none",border:"none",color:T.sub,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:4}}>
              <i className={`ti ${formExpanded?"ti-arrows-minimize":"ti-arrows-maximize"}`} style={{fontSize:13}}/>{formExpanded?"Narrower":"Wider"}
            </button>
          </div>
          <div style={{maxWidth:formExpanded?"none":920}}>
          <div style={{display:"flex",alignItems:"flex-end",gap:10,marginBottom:16,flexWrap:"wrap"}}>
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Select type of voucher</div>
              <select value={form.voucherType} onChange={e=>setForm({voucherType:e.target.value})} style={{...inp,width:300}}>
                <option value="supplier">Expense invoice (supplier)</option>
                <option value="income">Income (sale to customer)</option>
                <option value="receipt">Simple entry</option>
              </select>
            </div>
            <button onClick={autoFillFromDocument} disabled={autoFilling} title="Read the date and amount off this document" style={{background:T.accentLight,color:T.accent,border:"none",borderRadius:8,padding:"9px 14px",fontSize:12,fontWeight:700,cursor:autoFilling?"wait":"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{autoFilling?"Reading…":"✨ Auto-fill from document"}</button>
          </div>

          {form.voucherType==="supplier"?(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr 1fr",gap:8}}>
                <div>
                  <div style={{fontSize:10,color:T.sub,marginBottom:3,fontWeight:600}}>Supplier</div>
                  <select value={form.supplierId} onChange={e=>setForm({supplierId:e.target.value})} style={{...inp,padding:"8px 10px",fontSize:12}}>
                    {!suppliers.length&&<option value="">No suppliers yet</option>}
                    {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{fontSize:10,color:T.sub,marginBottom:3,fontWeight:600}}>Invoice date</div>
                  <FlexDateInput value={form.date} onChange={v=>setForm({date:v})}/>
                </div>
                <div>
                  <div style={{fontSize:10,color:T.sub,marginBottom:3,fontWeight:600}}>Due date</div>
                  <FlexDateInput value={form.dueDate} onChange={v=>setForm({dueDate:v})}/>
                </div>
              </div>
              <div>
                <div style={{fontSize:10,color:T.sub,marginBottom:3,fontWeight:600}}>Invoice number</div>
                <input value={form.invoiceNo} onChange={e=>setForm({invoiceNo:e.target.value})} style={{...inp,padding:"8px 10px",fontSize:12}}/>
              </div>

              <div style={{fontSize:10,fontWeight:800,color:T.muted,marginTop:6,textTransform:"uppercase",letterSpacing:0.5}}>Cost posting</div>
              <div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr 1fr",gap:8}}>
                <div>
                  <div style={{fontSize:10,color:T.sub,marginBottom:3,fontWeight:600}}>Cost account</div>
                  <AccDrop value={form.expenseAccount} onChange={code=>{
                    const acc=accounts.find(a=>a.code===code);
                    if(acc&&acc.defaultVatCode){setForm({expenseAccount:code,vatPct:String(acc.defaultVatPct)});return;}
                    setForm(acc&&acc.defaultVatPct!=null?{expenseAccount:code,vatPct:String(acc.defaultVatPct)}:{expenseAccount:code});
                  }} accounts={expenseAccounts} onCreateAccount={a=>setAccounts&&setAccounts([...accounts,{code:a.code,name:a.name}])}/>
                </div>
                {(()=>{
                  const costAcc=accounts.find(a=>a.code===form.expenseAccount);
                  const costLocked=!!(costAcc&&costAcc.vatLocked&&costAcc.defaultVatCode);
                  return(
                    <div>
                      <div style={{fontSize:10,color:T.sub,marginBottom:3,fontWeight:600}}>VAT %{costLocked&&<span title="Locked on this account" style={{marginLeft:4,color:T.muted}}><i className="ti ti-lock" style={{fontSize:9}}/></span>}</div>
                      <select value={form.vatPct} disabled={costLocked} onChange={e=>setForm({vatPct:e.target.value})} style={{...inp,padding:"8px 10px",fontSize:12,opacity:costLocked?0.6:1}}>
                        {vatCodeOptions("input").map(c=><option key={c.code} value={c.rate}>{c.code}: ({c.rate}%) {c.name}</option>)}
                      </select>
                    </div>
                  );
                })()}
                <div>
                  <div style={{fontSize:10,color:T.sub,marginBottom:3,fontWeight:600}}>Amount incl. VAT</div>
                  <input type="number" placeholder="0" value={form.amount} onChange={e=>setForm({amount:e.target.value})} style={{...inp,padding:"8px 10px",fontSize:12}}/>
                </div>
              </div>
              {(()=>{const acc=accounts.find(a=>a.code===form.expenseAccount);return acc&&acc.notes?<div style={{fontSize:10,color:T.muted,marginTop:-4}}>ℹ️ {acc.notes}</div>:null;})()}
              {vatRate>0&&(
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.muted}}>
                  <span>Net: {fmt(netAmount)}</span><span>VAT: {fmt(vatAmount)}</span>
                </div>
              )}
              <div>
                <div style={{fontSize:10,color:T.sub,marginBottom:3,fontWeight:600}}>Description</div>
                <input value={form.description} onChange={e=>setForm({description:e.target.value})} style={{...inp,padding:"8px 10px",fontSize:12}}/>
              </div>
            </div>
          ):form.voucherType==="income"?(
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div>
                <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Customer</div>
                <select value={form.customerId} onChange={e=>setForm({customerId:e.target.value})} style={{...inp}}>
                  {!customers.length&&<option value="">No customers yet</option>}
                  {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {/* Date, due date and invoice number share one row */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                <div>
                  <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Date</div>
                  <FlexDateInput value={form.date} onChange={v=>setForm({date:v})}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Due date</div>
                  <FlexDateInput value={form.dueDate} onChange={v=>setForm({dueDate:v})}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Invoice number</div>
                  <input value={form.invoiceNo} onChange={e=>setForm({invoiceNo:e.target.value})} style={{...inp}}/>
                </div>
              </div>
              <div>
                <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Currency</div>
                <select value={form.currency||"PKR"} onChange={e=>setForm({currency:e.target.value})} style={{...inp,width:140}}>
                  {CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div style={{background:T.bg,borderRadius:10,padding:12,border:`1px solid ${T.border}`,position:"relative"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{fontSize:11,fontWeight:800,color:T.text,textTransform:"uppercase",letterSpacing:0.5}}>Income</div>
                  <button onClick={()=>setShowLineOptions(o=>!o)} title="Display options" style={{background:"none",border:"none",cursor:"pointer",color:T.sub,fontSize:15,padding:2}}><i className="ti ti-settings"/></button>
                </div>
                {showLineOptions&&(<>
                  <div onClick={()=>setShowLineOptions(false)} style={{position:"fixed",inset:0,zIndex:290}}/>
                  <div style={{position:"absolute",right:12,top:36,background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,zIndex:300,minWidth:200,boxShadow:"0 8px 24px rgba(0,0,0,0.14)",padding:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <span style={{fontSize:12,fontWeight:800,color:T.text}}>Display options</span>
                      <span style={{fontSize:11,color:T.accent,fontWeight:700,cursor:"pointer"}} onClick={()=>{setShowDept(false);setShowEmployee(false);}}>Reset</span>
                    </div>
                    {[["Department",showDept,setShowDept],["Employee",showEmployee,setShowEmployee]].map(([label,val,setter])=>(
                      <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0"}}>
                        <span style={{fontSize:12,color:T.text}}>{label}</span>
                        <button onClick={()=>setter(v=>!v)} style={{width:34,height:19,borderRadius:10,border:"none",background:val?T.accent:T.border,position:"relative",cursor:"pointer",flexShrink:0}}>
                          <span style={{position:"absolute",top:2,left:val?17:2,width:15,height:15,borderRadius:"50%",background:"#fff",transition:"left 0.15s"}}/>
                        </button>
                      </div>
                    ))}
                  </div>
                </>)}

                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {incomeLines.map((l,li)=>{
                    const calc=incomeLineCalc(l);
                    const lineAcc=accounts.find(a=>a.code===l.accountCode);
                    const lineLocked=!!(lineAcc&&lineAcc.vatLocked&&lineAcc.defaultVatCode);
                    return(
                      <div key={l.lid} style={{paddingBottom:10,borderBottom:li<incomeLines.length-1?`1px solid ${T.border}`:"none"}}>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:8}}>
                          <div>
                            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Income account</div>
                            <AccDrop value={l.accountCode} onChange={code=>{
                              const acc=accounts.find(a=>a.code===code);
                              // Prefer the account's real VAT code (set on the
                              // account itself) over the static rate-lookup
                              // table — it's accurate even when several codes
                              // share the same percentage.
                              if(acc&&acc.defaultVatCode){updateIncomeLine(l.lid,{accountCode:code,vatCode:acc.defaultVatCode});return;}
                              const suggestedRate=acc&&acc.defaultVatPct!=null?acc.defaultVatPct:SALES_ACCOUNT_VAT_RATE[code];
                              const matchCode=suggestedRate!=null?vatCodeForRate(suggestedRate,"output"):null;
                              updateIncomeLine(l.lid,matchCode?{accountCode:code,vatCode:matchCode.code}:{accountCode:code});
                            }} accounts={incomeAccounts} onCreateAccount={a=>setAccounts&&setAccounts([...accounts,{code:a.code,name:a.name}])}/>
                          </div>
                          <div>
                            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>VAT code{lineLocked&&<span title="Locked on this account" style={{marginLeft:4,color:T.muted}}><i className="ti ti-lock" style={{fontSize:10}}/></span>}</div>
                            <VatDrop value={l.vatCode} disabled={lineLocked} onChange={code=>updateIncomeLine(l.lid,{vatCode:code})} options={vatCodeOptions("output")}/>
                          </div>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:8}}>
                          <div>
                            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Amount</div>
                            <input type="number" placeholder="0" value={l.amount} onChange={e=>updateIncomeLine(l.lid,{amount:e.target.value})} style={{...inp}}/>
                          </div>
                          <div>
                            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Description</div>
                            <div style={{display:"flex",gap:6}}>
                              <input value={l.description} onChange={e=>updateIncomeLine(l.lid,{description:e.target.value})} style={{...inp,flex:1}}/>
                              <button onClick={()=>copyIncomeLine(l.lid)} title="Copy line" style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:8,width:38,cursor:"pointer",color:T.sub,flexShrink:0}}><i className="ti ti-copy" style={{fontSize:13}}/></button>
                              {incomeLines.length>1&&<button onClick={()=>removeIncomeLine(l.lid)} title="Remove line" style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:8,width:38,cursor:"pointer",color:T.red,flexShrink:0}}><i className="ti ti-trash" style={{fontSize:13}}/></button>}
                            </div>
                          </div>
                        </div>
                        {(showDept||showEmployee)&&(
                          <div style={{display:"grid",gridTemplateColumns:showDept&&showEmployee?"1fr 1fr":"1fr",gap:10}}>
                            {showDept&&<div><div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Department</div><input value={l.department||""} onChange={e=>updateIncomeLine(l.lid,{department:e.target.value})} style={{...inp}}/></div>}
                            {showEmployee&&<div><div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Employee</div><input value={l.employee||""} onChange={e=>updateIncomeLine(l.lid,{employee:e.target.value})} style={{...inp}}/></div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button onClick={addIncomeLine} style={{background:"none",border:"none",color:T.accent,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",textAlign:"left",padding:0,display:"flex",alignItems:"center",gap:4}}><i className="ti ti-plus" style={{fontSize:13}}/>Add line</button>
                </div>

                {/* VAT breakdown — one row per code used, then totals, exactly
                    the "excl. VAT / VAT / incl. VAT" shape from the reference. */}
                {incomeTotal>0&&(
                  <div style={{marginTop:12,paddingTop:10,borderTop:`1px solid ${T.border}`}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:4,marginBottom:4}}>
                      {["VAT code","Excl. VAT","VAT","Incl. VAT"].map(h=>(
                        <div key={h} style={{fontSize:9,color:T.muted,fontWeight:700,textTransform:"uppercase",textAlign:h==="VAT code"?"left":"right"}}>{h}</div>
                      ))}
                    </div>
                    {incomeVatBreakdown.map(r=>(
                      <div key={r.code} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:4,fontSize:12,color:T.text,padding:"3px 0"}}>
                        <div>{r.code}</div>
                        <div style={{textAlign:"right"}}>{fmt(r.excl)}</div>
                        <div style={{textAlign:"right"}}>{fmt(r.vat)}</div>
                        <div style={{textAlign:"right",fontWeight:700}}>{fmt(r.gross)}</div>
                      </div>
                    ))}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:4,fontSize:12,fontWeight:800,color:T.text,padding:"6px 0 0",marginTop:4,borderTop:`1px solid ${T.border}`}}>
                      <div>Total</div>
                      <div style={{textAlign:"right"}}>{fmt(incomeVatBreakdown.reduce((s,r)=>s+r.excl,0))}</div>
                      <div style={{textAlign:"right"}}>{fmt(incomeVatBreakdown.reduce((s,r)=>s+r.vat,0))}</div>
                      <div style={{textAlign:"right"}}>{fmt(incomeTotal)}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div style={{display:"grid",gridTemplateColumns:"20% 1fr",gap:10}}>
                <div>
                  <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Date</div>
                  <FlexDateInput value={form.date} onChange={v=>setForm({date:v})}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Voucher description (optional — falls back to each line's own)</div>
                  <input value={form.description} onChange={e=>setForm({description:e.target.value})} style={{...inp}}/>
                </div>
              </div>

              <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8,position:"relative"}}>
                <button onClick={()=>setShowDisplayMenu(s=>!s)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5}}>
                  <i className="ti ti-adjustments-horizontal" style={{fontSize:13}}/>Display options
                </button>
                {showDisplayMenu&&(
                  <>
                    <div onClick={()=>setShowDisplayMenu(false)} style={{position:"fixed",inset:0,zIndex:298}}/>
                    <div style={{position:"absolute",top:"calc(100% + 4px)",right:0,background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,zIndex:299,minWidth:200,boxShadow:"0 8px 24px rgba(0,0,0,0.14)",padding:10}}>
                      {[["showDescription","Line description"],["showVat","VAT code columns"]].map(([key,label])=>(
                        <label key={key} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 6px",fontSize:12,color:T.text,cursor:"pointer"}}>
                          <input type="checkbox" checked={!!displayOpts[key]} onChange={()=>toggleDisplayOpt(key)} style={{accentColor:T.accent}}/>
                          {label}
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div style={{border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
                <div style={{display:"grid",gridTemplateColumns:lineGridCols,gap:8,padding:"8px 10px",background:T.bg,borderBottom:`1px solid ${T.border}`}}>
                  {[displayOpts.showDescription?"Description":null,"Debit account",displayOpts.showVat?"VAT (debit)":null,"Credit account",displayOpts.showVat?"VAT (credit)":null,"Amount",trackProjects?"Dimension":null,""].filter(h=>h!==null).map(h=>(
                    <div key={h} style={{fontSize:10,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:0.3}}>{h}</div>
                  ))}
                </div>
                {generalLines.map((l,i)=>(
                  <div key={l.lid} style={{display:"grid",gridTemplateColumns:lineGridCols,gap:8,padding:"8px 10px",alignItems:"center",borderBottom:i<generalLines.length-1?`1px solid ${T.border}`:"none",background:i%2===0?"#fff":T.bg}}>
                    {displayOpts.showDescription&&<input placeholder="Line description" value={l.description} onChange={e=>updateGeneralLine(l.lid,{description:e.target.value})} style={{...inp,fontSize:12,padding:"7px 9px"}}/>}
                    <AccDrop value={l.debitCode} onChange={v=>updateGeneralLine(l.lid,{debitCode:v})} accounts={accounts} onCreateAccount={a=>setAccounts&&setAccounts([...accounts,{code:a.code,name:a.name}])}/>
                    {displayOpts.showVat&&(
                      <VatDrop value={l.debitVatCode} onChange={code=>updateGeneralLine(l.lid,{debitVatCode:code})} options={vatCodeOptions("input")}/>
                    )}
                    <AccDrop value={l.creditCode} onChange={v=>updateGeneralLine(l.lid,{creditCode:v})} accounts={accounts} onCreateAccount={a=>setAccounts&&setAccounts([...accounts,{code:a.code,name:a.name}])}/>
                    {displayOpts.showVat&&(
                      <VatDrop value={l.creditVatCode} onChange={code=>updateGeneralLine(l.lid,{creditVatCode:code})} options={vatCodeOptions("output")}/>
                    )}
                    <input type="number" placeholder="0" value={l.amount} onChange={e=>updateGeneralLine(l.lid,{amount:e.target.value})} onKeyDown={e=>{if(e.key==="Enter"&&i===generalLines.length-1){e.preventDefault();addGeneralLine();}}} style={{...inp,fontSize:12,padding:"7px 9px"}}/>
                    {trackProjects&&(
                      <select value={l.projectId||""} onChange={e=>{
                        if(e.target.value==="__new__"){
                          const name=prompt("New project or department name:");
                          if(name&&name.trim()&&saveProjects){
                            const nums=projects.map(p=>parseInt(p.number)||0);
                            const number=String((nums.length?Math.max(...nums):0)+1).padStart(3,"0");
                            const newProj={id:"proj_"+Date.now().toString(36),number,name:name.trim(),inactive:false};
                            saveProjects([...projects,newProj]);
                            updateGeneralLine(l.lid,{projectId:newProj.id});
                          }
                          return;
                        }
                        updateGeneralLine(l.lid,{projectId:e.target.value});
                      }} style={{...inp,fontSize:11,padding:"7px 8px"}}>
                        <option value="">— None —</option>
                        {projects.filter(p=>!p.inactive).map(p=><option key={p.id} value={p.id}>{p.number?p.number+" — ":""}{p.name}</option>)}
                        {saveProjects&&<option value="__new__">+ New…</option>}
                      </select>
                    )}
                    <div style={{display:"flex",gap:4,justifyContent:"center"}}>
                      <button onClick={()=>copyGeneralLine(l.lid)} title="Copy this line" style={{background:"none",border:"none",color:T.sub,cursor:"pointer",padding:4}}><i className="ti ti-copy" style={{fontSize:14}}/></button>
                      <button onClick={()=>removeGeneralLine(l.lid)} disabled={generalLines.length<=1} title="Remove this line" style={{background:"none",border:"none",color:generalLines.length<=1?T.muted:T.red,cursor:generalLines.length<=1?"default":"pointer",padding:4,opacity:generalLines.length<=1?0.4:1}}><i className="ti ti-trash" style={{fontSize:14}}/></button>
                    </div>
                    {l.debitCode===l.creditCode&&l.debitCode&&<div style={{gridColumn:"1 / -1",fontSize:11,color:T.red,marginTop:-4}}>Debit and credit can't be the same account on this line.</div>}
                  </div>
                ))}
                <button onClick={addGeneralLine} style={{background:"none",border:"none",borderTop:`1px solid ${T.border}`,color:T.accent,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:"8px 10px",width:"100%",display:"flex",alignItems:"center",gap:5}}>
                  <i className="ti ti-plus" style={{fontSize:13}}/>Add line
                </button>
              </div>

              <div style={{display:"flex",justifyContent:"flex-end",gap:24,padding:"4px 4px 0",fontSize:12,color:T.sub}}>
                <span>Lines: <strong style={{color:T.text}}>{generalLines.length}</strong></span>
                <span>Total: <strong style={{color:T.text}}>{fmt(generalTotal)}</strong></span>
              </div>
            </div>
          )}

          <button onClick={postCurrent} disabled={!valid||alreadyPosted||posting} style={{marginTop:20,background:alreadyPosted?T.greenBg:(valid?T.accent:T.border),color:alreadyPosted?T.green:(valid?"#fff":T.muted),border:"none",borderRadius:10,padding:"12px 24px",fontWeight:700,fontSize:14,cursor:valid&&!alreadyPosted?"pointer":"default",fontFamily:"inherit"}}>
            {alreadyPosted?"✓ Already posted":posting?"Creating…":"Create"}
          </button>
          </div>
        </div>
      )} right={(
        <div style={{background:T.bg,display:"flex",flexDirection:"column",height:"100%",borderLeft:`1px solid ${T.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"10px 14px",borderBottom:`1px solid ${T.border}`,background:"#fff",flexShrink:0}}>
            <button onClick={()=>goto(0)} disabled={idx===0} style={{...navBtn,opacity:idx===0?0.4:1}}>«</button>
            <button onClick={()=>goto(idx-1)} disabled={idx===0} style={{...navBtn,opacity:idx===0?0.4:1}}>‹</button>
            <span style={{fontSize:11,fontWeight:700,color:T.text,minWidth:40,textAlign:"center",flexShrink:0}}>{idx+1}/{queue.length}</span>
            <button onClick={()=>goto(idx+1)} disabled={idx===queue.length-1} style={{...navBtn,opacity:idx===queue.length-1?0.4:1}}>›</button>
            <button onClick={()=>goto(queue.length-1)} disabled={idx===queue.length-1} style={{...navBtn,opacity:idx===queue.length-1?0.4:1}}>»</button>
            <div style={{flex:1}}/>
            {alreadyPosted&&<span style={{fontSize:11,color:T.green,fontWeight:700,flexShrink:0}}>✓ Posted</span>}
          </div>
          <div style={{flex:1,minHeight:0,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
            <SignedFileViewer storagePath={currentFile.storagePath} type={currentFile.type} name={currentFile.name} style={{width:"100%",height:"100%",background:"#fff"}}/>
          </div>
        </div>
      )}/>
      </div>
    </div>
  );
}

const MONTH_NAMES=["January","February","March","April","May","June","July","August","September","October","November","December"];
const monthsBetween=(from,to)=>{
  const[fy,fm]=from.split("-").map(Number);
  const[ty,tm]=to.split("-").map(Number);
  return Math.max(1,(ty-fy)*12+(tm-fm)+1);
};
const monthRangeLabel=(from,to)=>{
  const[fy,fm]=from.split("-").map(Number);
  const[ty,tm]=to.split("-").map(Number);
  if(from===to)return`${MONTH_NAMES[fm-1]} ${fy}`;
  if(fy===ty)return`${MONTH_NAMES[fm-1]}–${MONTH_NAMES[tm-1]} ${fy}`;
  return`${MONTH_NAMES[fm-1]} ${fy} – ${MONTH_NAMES[tm-1]} ${ty}`;
};

// Printable invoice — company (issuer) on the left, INVOICE details on the
// right, line items table, total. English labels throughout.
function InvoicePrintView({invoice,contact,companyProfile,elementId}){
  return(
    <div id={elementId} style={{background:"#fff",padding:32,fontFamily:"system-ui,sans-serif",color:"#111827",maxWidth:750,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",borderBottom:"2px solid #111827",paddingBottom:16,marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          {companyProfile.logoDataUrl&&<img src={companyProfile.logoDataUrl} style={{width:56,height:56,objectFit:"contain"}}/>}
          <div>
            <div style={{fontSize:22,fontWeight:800}}>{companyProfile.companyName||"Your Company Name"}</div>
            <div style={{fontSize:12,color:"#555",marginTop:6,lineHeight:1.6}}>
              {companyProfile.address&&<div>{companyProfile.address}</div>}
              {companyProfile.mobile&&<div>Mobile: {companyProfile.mobile}</div>}
              {companyProfile.email&&<div>Email: {companyProfile.email}</div>}
              {companyProfile.orgNumber&&<div>Org. number: {companyProfile.orgNumber}</div>}
            </div>
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:26,fontWeight:900,letterSpacing:1}}>INVOICE</div>
          <div style={{fontSize:12,color:"#555",marginTop:6,lineHeight:1.6}}>
            <div>Invoice no.: <strong>{invoice.invoiceNo}</strong></div>
            <div>Invoice date: {invoice.date}</div>
            {invoice.dueDate&&<div>Due date: {invoice.dueDate}</div>}
            {companyProfile.bankAccount&&<div>Bank account: {companyProfile.bankAccount}</div>}
          </div>
        </div>
      </div>

      <div style={{marginBottom:24}}>
        <div style={{fontSize:11,color:"#888",marginBottom:4}}>BILL TO</div>
        <div style={{fontSize:14,fontWeight:700}}>{contact?contact.name:"Customer"}</div>
      </div>

      <table style={{width:"100%",fontSize:13,borderCollapse:"collapse",marginBottom:16}}>
        <thead><tr style={{borderBottom:"1px solid #111827",color:"#555"}}>
          <td style={{padding:"6px 0"}}>Description</td>
          <td style={{textAlign:"right"}}>Qty</td>
          <td style={{textAlign:"right"}}>Unit price</td>
          <td style={{textAlign:"right"}}>Amount</td>
        </tr></thead>
        <tbody>
          {invoice.lines.map((l,i)=>(
            <tr key={i} style={{borderBottom:"1px solid #eee"}}>
              <td style={{padding:"8px 0"}}>{l.description}</td>
              <td style={{textAlign:"right"}}>{l.qty}</td>
              <td style={{textAlign:"right"}}>{fmt(l.unitPrice)}</td>
              <td style={{textAlign:"right"}}>{fmt(l.qty*l.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{display:"flex",justifyContent:"flex-end"}}>
        <div style={{width:220}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0"}}><span>Subtotal</span><span>{fmt(invoice.subtotal)}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0"}}><span>VAT ({invoice.vatPct}%)</span><span>{fmt(invoice.vatAmount)}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:15,fontWeight:800,borderTop:"2px solid #111827",padding:"8px 0 0",marginTop:6}}><span>Total</span><span>{fmt(invoice.total)}</span></div>
        </div>
      </div>
      {companyProfile.bankAccount&&<div style={{marginTop:20,fontSize:12,color:"#555"}}>Please pay to bank account {companyProfile.bankAccount}.</div>}
    </div>
  );
}

// Invoice creation form — customer picker, sale account restricted to the
// 3xxx series, a month-range period (one or more months), auto-generated
// but editable description, and a live preview before posting.
function InvoiceFormScreen({accounts,contacts,companyProfile,nextInvoiceNo,createInvoice,transactions=[],onDone,posProducts=[],onManageProducts}){
  const customers=contacts.filter(c=>c.type==="customer");
  const saleAccounts=accounts.filter(a=>a.code.startsWith("3"));
  const today=new Date().toISOString().slice(0,10);
  const curMonth=today.slice(0,7);

  const[customerId,setCustomerId]=useState(customers[0]?customers[0].id:"");
  const[saleAccount,setSaleAccount]=useState(saleAccounts[0]?saleAccounts[0].code:"");
  const[productId,setProductId]=useState("");
  const productsForAccount=posProducts.filter(p=>p.active&&p.saleAccount===saleAccount);
  const[periodFrom,setPeriodFrom]=useState(curMonth);
  const[periodTo,setPeriodTo]=useState(curMonth);
  const[unitPrice,setUnitPrice]=useState("");
  const[description,setDescription]=useState("");
  const[descTouched,setDescTouched]=useState(false);
  const[date,setDate]=useState(today);
  const[dueDate,setDueDate]=useState(today);
  const[vatPct,setVatPct]=useState(companyProfile.vatPct||0);
  const[discountType,setDiscountType]=useState("pct"); // "pct" | "fixed"
  const[discountValue,setDiscountValue]=useState("");
  const[saving,setSaving]=useState(false);

  const contact=customers.find(c=>c.id===customerId);
  // Auto-suggest the due date from this customer's payment terms — still
  // freely editable afterward, this just saves re-typing the common case.
  useEffect(()=>{
    const termDays=contact&&contact.paymentTermsDays!=null?contact.paymentTermsDays:30;
    const d=new Date(date);d.setDate(d.getDate()+termDays);
    setDueDate(d.toISOString().slice(0,10));
  },[customerId,date]);
  // Picking a product pre-fills its defined rate — still freely editable
  // afterward for a one-off override. Changing the sale account clears the
  // product choice, since a product only makes sense against the account
  // it's actually set up to sell against.
  useEffect(()=>{
    if(productId&&!productsForAccount.some(p=>p.id===productId))setProductId("");
  },[saleAccount]);
  useEffect(()=>{
    if(!productId)return;
    const p=posProducts.find(x=>x.id===productId);
    if(p)setUnitPrice(String(p.price));
  },[productId]);
  const qty=monthsBetween(periodFrom,periodTo);
  const price=parseFloat(unitPrice)||0;
  const rawSubtotal=qty*price;
  const discountAmount=discountType==="pct"?rawSubtotal*(parseFloat(discountValue)||0)/100:Math.min(rawSubtotal,parseFloat(discountValue)||0);
  const subtotal=rawSubtotal-discountAmount;
  const vatAmount=subtotal*(parseFloat(vatPct)||0)/100;
  const total=subtotal+vatAmount;
  const autoDesc=contact?`${contact.name} — ${qty} month${qty>1?"s":""} (${monthRangeLabel(periodFrom,periodTo)})`:"";
  const effectiveDesc=descTouched?description:autoDesc;

  const valid=customerId&&saleAccount&&price>0&&periodFrom&&periodTo&&periodTo>=periodFrom;

  const handleCreate=async()=>{
    if(!valid||saving)return;
    // Credit limit check — outstanding AR balance plus this new invoice,
    // compared against whatever limit's set on the customer (if any).
    if(contact&&contact.creditLimit!=null){
      const outstanding=transactions.filter(t=>t.contactId===customerId&&(t.debitCode==="1500"||t.creditCode==="1500")).reduce((s,t)=>s+(t.debitCode==="1500"?t.amount:-t.amount),0);
      const projected=outstanding+total;
      if(projected>contact.creditLimit&&!window.confirm(`${contact.name}'s outstanding balance is ${fmt(outstanding)}. This invoice would bring it to ${fmt(projected)}, over their ${fmt(contact.creditLimit)} credit limit. Create it anyway?`))return;
    }
    setSaving(true);
    const form={
      customerId,saleAccount,date,dueDate,periodFrom,periodTo,
      description:effectiveDesc,vatPct:parseFloat(vatPct)||0,
      lines:[{description:effectiveDesc,qty,unitPrice:price,discountType:discountAmount>0?discountType:null,discountValue:discountAmount>0?parseFloat(discountValue)||0:0,discountAmount}],
      subtotal,vatAmount,total,
    };
    const inv=await createInvoice(form);
    setSaving(false);
    if(inv&&onDone)onDone(inv);
  };

  return(
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,alignItems:"start"}}>
      <div>
        <h1 style={{fontSize:18,fontWeight:800,color:T.text,margin:"0 0 3px"}}>New invoice</h1>
        <p style={{fontSize:11,color:T.muted,margin:"0 0 14px"}}>Invoice no. {nextInvoiceNo} · posts to Receivable (1500) automatically</p>

        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr 1fr",gap:8}}>
            <div>
              <div style={{fontSize:10,color:T.sub,marginBottom:3,fontWeight:600}}>Customer</div>
              <select value={customerId} onChange={e=>setCustomerId(e.target.value)} style={{...inp,padding:"9px 12px",fontSize:13}}>
                {!customers.length&&<option value="">No customers yet</option>}
                {customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.email?" ✉":""}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:10,color:T.sub,marginBottom:3,fontWeight:600}}>Invoice date</div>
              <FlexDateInput value={date} onChange={setDate} style={{}}/>
            </div>
            <div>
              <div style={{fontSize:10,color:T.sub,marginBottom:3,fontWeight:600}}>Due date</div>
              <FlexDateInput value={dueDate} onChange={setDueDate} style={{}}/>
            </div>
          </div>
          {contact&&(contact.email?<div style={{fontSize:11,color:T.green,marginTop:-4}}>✉ {contact.email} — can be emailed after posting</div>:<div style={{fontSize:11,color:T.muted,marginTop:-4}}>No email on file — add one in Customers to enable emailing this invoice</div>)}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div>
              <div style={{fontSize:10,color:T.sub,marginBottom:3,fontWeight:600}}>Sale account (3xxx series)</div>
              <AccDrop value={saleAccount} onChange={setSaleAccount} accounts={saleAccounts}/>
            </div>
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:3}}>
                <div style={{fontSize:10,color:T.sub,fontWeight:600}}>Product</div>
                {onManageProducts&&<button onClick={onManageProducts} style={{background:"none",border:"none",color:T.accent,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:0}}>Add / edit</button>}
              </div>
              <select value={productId} onChange={e=>setProductId(e.target.value)} style={{...inp,padding:"9px 12px",fontSize:13}}>
                <option value="">No product — set price manually</option>
                {productsForAccount.map(p=><option key={p.id} value={p.id}>{p.name} — {fmt(p.price)}</option>)}
              </select>
            </div>
          </div>
          {saleAccount&&!productsForAccount.length&&<div style={{fontSize:11,color:T.muted,marginTop:-4}}>No products set up for this account yet.</div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div>
              <div style={{fontSize:10,color:T.sub,marginBottom:3,fontWeight:600}}>From month</div>
              <input type="month" value={periodFrom} onChange={e=>{setPeriodFrom(e.target.value);if(e.target.value>periodTo)setPeriodTo(e.target.value);}} style={{...inp,padding:"9px 12px",fontSize:13}}/>
            </div>
            <div>
              <div style={{fontSize:10,color:T.sub,marginBottom:3,fontWeight:600}}>To month</div>
              <input type="month" value={periodTo} min={periodFrom} onChange={e=>setPeriodTo(e.target.value)} style={{...inp,padding:"9px 12px",fontSize:13}}/>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div>
              <div style={{fontSize:10,color:T.sub,marginBottom:3,fontWeight:600}}>Monthly rate</div>
              <input type="number" placeholder="0" value={unitPrice} onChange={e=>setUnitPrice(e.target.value)} style={{...inp,padding:"9px 12px",fontSize:13}}/>
            </div>
            <div>
              <div style={{fontSize:10,color:T.sub,marginBottom:3,fontWeight:600}}>VAT %</div>
              <input type="number" value={vatPct} onChange={e=>setVatPct(e.target.value)} style={{...inp,padding:"9px 12px",fontSize:13}}/>
            </div>
          </div>
          {productId&&<div style={{fontSize:10,color:T.muted,marginTop:-4}}>Rate filled from the product's price — edit freely for a one-off override.</div>}
          <div>
            <div style={{fontSize:10,color:T.sub,marginBottom:3,fontWeight:600}}>Description</div>
            <input value={effectiveDesc} onChange={e=>{setDescription(e.target.value);setDescTouched(true);}} style={{...inp,padding:"9px 12px",fontSize:13}}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div>
              <div style={{fontSize:10,color:T.sub,marginBottom:3,fontWeight:600}}>Discount (optional)</div>
              <input type="number" placeholder="0" value={discountValue} onChange={e=>setDiscountValue(e.target.value)} style={{...inp,padding:"9px 12px",fontSize:13}}/>
            </div>
            <div>
              <div style={{fontSize:10,color:T.sub,marginBottom:3,fontWeight:600}}>Discount type</div>
              <select value={discountType} onChange={e=>setDiscountType(e.target.value)} style={{...inp,padding:"9px 12px",fontSize:13}}>
                <option value="pct">Percent (%)</option>
                <option value="fixed">Fixed amount</option>
              </select>
            </div>
          </div>
          {discountAmount>0&&(
            <div style={{fontSize:11,color:T.muted,display:"flex",justifyContent:"space-between"}}>
              <span>Discount applied: −{fmt(discountAmount)}</span><span>Subtotal after discount: {fmt(subtotal)}</span>
            </div>
          )}
          <button onClick={handleCreate} disabled={!valid||saving} style={{background:valid?T.accent:T.border,color:valid?"#fff":T.muted,border:"none",borderRadius:10,padding:"11px",fontWeight:700,fontSize:13,cursor:valid?"pointer":"default",fontFamily:"inherit"}}>{saving?"Creating…":`Create invoice · ${fmt(total)}`}</button>
        </div>
      </div>

      <div style={{background:T.bg,borderRadius:12,padding:16,border:`1px solid ${T.border}`}}>
        <div style={{fontSize:11,color:T.muted,marginBottom:10,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>Preview</div>
        <div style={{transform:"scale(0.82)",transformOrigin:"top left",width:"122%"}}>
          <InvoicePrintView
            invoice={{invoiceNo:nextInvoiceNo,date,dueDate,lines:[{description:effectiveDesc||"—",qty,unitPrice:price}],subtotal,vatPct:parseFloat(vatPct)||0,vatAmount,total}}
            contact={contact}
            companyProfile={companyProfile}
          />
        </div>
      </div>
    </div>
  );
}

// Invoice overview — Tripletex-style aging donut (overdue >30 / 1-30 / not
// yet due) plus outstanding total and the invoice list.
function InvoiceOverviewScreen({invoices,contacts,accounts,companyProfile,updateInvoiceStatus,deleteInvoice,registerInvoicePayment,createCreditNote,getInvoicePaid,onNewInvoice}){
  const getContactName=id=>{const c=contacts.find(x=>x.id===id);return c?c.name:"Unknown";};
  const today=new Date().toISOString().slice(0,10);
  const daysOverdue=(inv)=>inv.dueDate?Math.floor((new Date(today)-new Date(inv.dueDate))/86400000):0;

  // PDF download: render the invoice off-screen, then hand it to html2pdf.
  const[pdfInvoice,setPdfInvoice]=useState(null);
  const[pdfBusy,setPdfBusy]=useState(false);
  useEffect(()=>{
    if(!pdfInvoice)return;
    const t=setTimeout(()=>{
      const el=document.getElementById("invoice-pdf-target");
      if(!el||!window.html2pdf){setPdfBusy(false);setPdfInvoice(null);return;}
      window.html2pdf().from(el).set({
        margin:0,
        filename:`${pdfInvoice.status==="credit_note"?"CreditNote":"Invoice"}_${pdfInvoice.invoiceNo}.pdf`,
        html2canvas:{scale:2},
        jsPDF:{unit:"pt",format:"a4",orientation:"portrait"},
      }).save().then(()=>{setPdfBusy(false);setPdfInvoice(null);});
    },80);
    return()=>clearTimeout(t);
  },[pdfInvoice]);
  const downloadPdf=(inv)=>{setPdfBusy(true);setPdfInvoice(inv);};

  // Send by email — mailto only for now. It can't attach the PDF (browsers
  // don't allow that from a web page), so it opens the user's own mail app
  // pre-filled with the invoice summary and a reminder to attach the PDF
  // they just downloaded. Real automatic sending needs a small backend
  // (Supabase Edge Function + an email provider) — see roadmap.
  const emailInvoice=(inv)=>{
    const contact=contacts.find(c=>c.id===inv.customerId);
    if(!contact||!contact.email){alert("This customer has no email on file yet. Add one in Customers.");return;}
    const isCN=inv.status==="credit_note";
    const subject=encodeURIComponent(`${isCN?"Credit note":"Invoice"} #${inv.invoiceNo} from ${companyProfile.companyName||"us"}`);
    const body=encodeURIComponent(
      `Hi ${contact.name},\n\n`+
      `Please find ${isCN?"credit note":"invoice"} #${inv.invoiceNo} dated ${inv.date}${inv.dueDate?` (due ${inv.dueDate})`:""}.\n\n`+
      `Total: ${fmt(Math.abs(inv.total))}\n\n`+
      `(Please attach the downloaded PDF before sending — this draft can't attach it automatically.)\n\n`+
      `Thank you,\n${companyProfile.companyName||""}`
    );
    window.location.href=`mailto:${contact.email}?subject=${subject}&body=${body}`;
  };

  // Bulk reminders — mailto: links genuinely can't be sent silently in the
  // background (no backend mail service here), so this is honest about what
  // it actually does: a focused worklist of every overdue invoice, one click
  // to open each reminder draft, marking it done as you go through the list.
  const[showReminders,setShowReminders]=useState(false);
  const[remindersSent,setRemindersSent]=useState({});
  const overdueInvoices=useMemo(()=>invoices.filter(inv=>inv.status!=="paid"&&inv.status!=="credited"&&inv.status!=="credit_note"&&daysOverdue(inv)>0),[invoices]);
  const sendReminder=(inv)=>{
    const contact=contacts.find(c=>c.id===inv.customerId);
    if(!contact||!contact.email){alert("This customer has no email on file yet. Add one in Customers.");return;}
    const days=daysOverdue(inv);
    const subject=encodeURIComponent(`Reminder: Invoice #${inv.invoiceNo} is ${days} day${days===1?"":"s"} overdue`);
    const body=encodeURIComponent(
      `Hi ${contact.name},\n\n`+
      `This is a friendly reminder that invoice #${inv.invoiceNo}, dated ${inv.date} and due ${inv.dueDate}, is now ${days} day${days===1?"":"s"} overdue.\n\n`+
      `Amount due: ${fmt(inv.total)}\n\n`+
      `If you've already sent payment, please disregard this note.\n\n`+
      `Thank you,\n${companyProfile.companyName||""}`
    );
    window.location.href=`mailto:${contact.email}?subject=${subject}&body=${body}`;
    setRemindersSent(p=>({...p,[inv.id]:true}));
  };

  // Payment registration modal state
  const bankAccounts=accounts?accounts.filter(a=>getSK(a.code)==="1900"):[];
  const[payingInv,setPayingInv]=useState(null);
  const[payBank,setPayBank]=useState("");
  const[payDate,setPayDate]=useState(today);
  const[payAmount,setPayAmount]=useState("");
  const[payBusy,setPayBusy]=useState(false);
  const[search,setSearch]=useState("");
  const[statusFilter,setStatusFilter]=useState("all"); // all | draft | sent | paid | overdue
  const openPayModal=(inv)=>{
    const alreadyPaid=getInvoicePaid?getInvoicePaid(inv):0;
    setPayingInv(inv);setPayBank(bankAccounts[0]?bankAccounts[0].code:"");setPayDate(today);setPayAmount(String(Math.round((inv.total-alreadyPaid)*100)/100));
  };
  const submitPayment=async()=>{
    if(!payingInv||!payBank||!parseFloat(payAmount)||payBusy)return;
    setPayBusy(true);
    await registerInvoicePayment(payingInv,payBank,payDate,parseFloat(payAmount));
    setPayBusy(false);
    setPayingInv(null);
  };

  const isCN=(inv)=>inv.status==="credit_note";
  const filteredInvoices=useMemo(()=>[...invoices].sort((a,b)=>b.invoiceNo-a.invoiceNo).filter(inv=>{
    if(search){
      const q=search.toLowerCase();
      const custName=getContactName(inv.customerId).toLowerCase();
      if(!custName.includes(q)&&!String(inv.invoiceNo).includes(q))return false;
    }
    if(statusFilter==="all")return true;
    if(statusFilter==="overdue")return!isCN(inv)&&inv.status!=="paid"&&inv.status!=="credited"&&daysOverdue(inv)>0;
    return inv.status===statusFilter;
  }),[invoices,search,statusFilter,contacts]);
  const open=invoices.filter(i=>i.status!=="paid"&&i.status!=="credited"&&!isCN(i));
  const over30=open.filter(i=>daysOverdue(i)>30).reduce((s,i)=>s+i.total,0);
  const over1to30=open.filter(i=>{const d=daysOverdue(i);return d>0&&d<=30;}).reduce((s,i)=>s+i.total,0);
  const notDue=open.filter(i=>daysOverdue(i)<=0).reduce((s,i)=>s+i.total,0);
  const outstanding=over30+over1to30+notDue;
  const donutData=[
    {label:"Overdue (30+ days)",value:over30,color:"#D0021B"},
    {label:"Overdue (1-30 days)",value:over1to30,color:"#EF9F27"},
    {label:"Not yet due",value:notDue,color:"#5DCAA5"},
  ];

  return(
    <div>
      {pdfInvoice&&(
        <div style={{position:"fixed",left:-9999,top:0}}>
          <InvoicePrintView
            elementId="invoice-pdf-target"
            invoice={pdfInvoice}
            contact={contacts.find(c=>c.id===pdfInvoice.customerId)}
            companyProfile={companyProfile}
          />
        </div>
      )}

      {payingInv&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:14,padding:22,width:340,boxShadow:"0 12px 40px rgba(0,0,0,0.25)"}}>
            <div style={{fontSize:15,fontWeight:800,color:T.text,marginBottom:4}}>Register payment</div>
            <div style={{fontSize:12,color:T.muted,marginBottom:14}}>Invoice #{payingInv.invoiceNo} · {getContactName(payingInv.customerId)} · total {fmt(payingInv.total)}</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div>
                <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Received into</div>
                <select value={payBank} onChange={e=>setPayBank(e.target.value)} style={{...inp}}>
                  {bankAccounts.map(a=><option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
                  {!bankAccounts.length&&<option value="">No bank accounts</option>}
                </select>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div>
                  <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Date</div>
                  <input type="date" value={payDate} onChange={e=>setPayDate(e.target.value)} style={{...inp}}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Amount</div>
                  <input type="number" value={payAmount} onChange={e=>setPayAmount(e.target.value)} style={{...inp}}/>
                </div>
              </div>
              {parseFloat(payAmount)>0&&Math.abs(parseFloat(payAmount)-payingInv.total)>=1&&(
                <div style={{fontSize:11,color:T.sub,background:T.bg,borderRadius:8,padding:"8px 10px"}}>Partial payment — the entry will post, but the invoice stays open until you match the remainder manually in Reskontro.</div>
              )}
              <div style={{display:"flex",gap:8}}>
                <button onClick={submitPayment} disabled={payBusy} style={{flex:1,background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"10px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>{payBusy?"Posting…":"Register payment"}</button>
                <button onClick={()=>setPayingInv(null)} style={{flex:1,background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"10px",fontWeight:600,fontSize:13,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Invoice overview</h1>
        <div style={{display:"flex",gap:8}}>
          {overdueInvoices.length>0&&<button onClick={()=>setShowReminders(true)} style={{background:"none",border:`1px solid ${T.red}`,color:T.red,borderRadius:8,padding:"9px 16px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}><i className="ti ti-mail-exclamation" style={{fontSize:13,marginRight:5}}/>Send reminders ({overdueInvoices.length})</button>}
          <button onClick={onNewInvoice} style={{background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"9px 16px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}><i className="ti ti-plus" style={{fontSize:13,marginRight:5}}/>New invoice</button>
        </div>
      </div>

      {showReminders&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setShowReminders(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:T.radius.xl,maxWidth:560,width:"100%",maxHeight:"80vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",padding:24}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontSize:15,fontWeight:800,color:T.text}}>Overdue invoices — {overdueInvoices.length}</div>
              <button onClick={()=>setShowReminders(false)} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:16}}>✕</button>
            </div>
            <p style={{fontSize:11,color:T.muted,marginBottom:16}}>Each "Send" opens a pre-filled reminder email in your mail app — click through the list, one send per customer. Nothing goes out silently in the background.</p>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {overdueInvoices.map(inv=>{
                const contact=contacts.find(c=>c.id===inv.customerId);
                const sent=remindersSent[inv.id];
                return(
                  <div key={inv.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 14px"}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:T.text}}>#{inv.invoiceNo} — {contact?contact.name:"Unknown"}</div>
                      <div style={{fontSize:11,color:T.red}}>{daysOverdue(inv)} days overdue · {fmt(inv.total)}{!contact||!contact.email?" · no email on file":""}</div>
                    </div>
                    <button onClick={()=>sendReminder(inv)} disabled={!contact||!contact.email} style={{background:sent?T.greenBg:T.accentLight,color:sent?T.green:T.accent,border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:contact&&contact.email?"pointer":"default",fontFamily:"inherit",opacity:contact&&contact.email?1:0.5}}>{sent?"✓ Sent":"Send"}</button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:14,padding:20,marginBottom:20,display:"flex",gap:24,alignItems:"center"}}>
        <ConicChart data={donutData.filter(d=>d.value>0)} size={120}/>
        <div style={{display:"flex",flexDirection:"column",gap:10,flex:1}}>
          {donutData.map(d=>(
            <div key={d.label} style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
              <span style={{display:"flex",alignItems:"center",gap:6,color:T.sub}}><span style={{width:9,height:9,borderRadius:2,background:d.color,display:"inline-block"}}/>{d.label}</span>
              <span style={{fontWeight:700,color:T.text}}>{fmt(d.value)}</span>
            </div>
          ))}
          <div style={{display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:800,borderTop:`1px solid ${T.border}`,paddingTop:10,marginTop:2}}>
            <span>Outstanding</span><span>{fmt(outstanding)}</span>
          </div>
        </div>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"center",flexWrap:"wrap"}}>
        {[["all","All"],["draft","Draft"],["sent","Sent"],["paid","Paid"],["overdue","Overdue"]].map(([id,label])=>(
          <button key={id} onClick={()=>setStatusFilter(id)} style={{background:statusFilter===id?T.accent:"none",color:statusFilter===id?"#fff":T.sub,border:`1px solid ${statusFilter===id?T.accent:T.border}`,borderRadius:8,padding:"6px 13px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{label}{id==="overdue"&&overdueInvoices.length>0?` (${overdueInvoices.length})`:""}</button>
        ))}
        <div style={{flex:1}}/>
        <input placeholder="Search customer or invoice #" value={search} onChange={e=>setSearch(e.target.value)} style={{...inp,width:220,padding:"7px 12px",fontSize:12}}/>
      </div>

      <div style={{background:"#fff",borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden"}}>
      <table className="rr-sticky-thead" style={{width:"100%",fontSize:13,borderCollapse:"collapse"}}>
        <thead><tr style={{color:T.sub,background:T.bg}}>
          <td style={{padding:"11px 14px",fontWeight:700}}>Invoice</td><td style={{fontWeight:700}}>Customer</td><td style={{fontWeight:700}}>Date</td><td style={{fontWeight:700}}>Due date</td><td style={{textAlign:"right",fontWeight:700}}>Total</td><td style={{fontWeight:700}}>Status</td><td style={{padding:"11px 14px"}}></td>
        </tr></thead>
        <tbody>
          {filteredInvoices.map(inv=>{
            const cn=isCN(inv);
            const overdue=!cn&&inv.status!=="paid"&&inv.status!=="credited"&&daysOverdue(inv)>0;
            const canPay=!cn&&inv.status!=="paid"&&inv.status!=="credited";
            const paidSoFar=cn||!getInvoicePaid?0:getInvoicePaid(inv);
            const remaining=inv.total-paidSoFar;
            return(
              <tr key={inv.id} className="rr-table-row" style={{background:"#fff",borderBottom:`1px solid ${T.border}`,opacity:inv.status==="credited"?0.55:1}}>
                <td style={{padding:"11px 14px",color:cn?T.red:T.accent,fontWeight:700}}>{cn?"CN":"#"}{inv.invoiceNo}</td>
                <td style={{color:T.text}}>{getContactName(inv.customerId)}</td>
                <td style={{color:T.text}}>{inv.date}</td>
                <td style={{color:overdue?T.red:T.text,fontWeight:overdue?700:400}}>{inv.dueDate||"—"}</td>
                <td style={{textAlign:"right",fontWeight:700,color:cn?T.red:T.text}}>
                  {cn?"−":""}{fmt(Math.abs(inv.total))}
                  {paidSoFar>0&&inv.status!=="paid"&&<div style={{fontSize:10,color:T.green,fontWeight:600}}>Paid {fmt(paidSoFar)} · Remaining {fmt(remaining)}</div>}
                </td>
                <td>
                  {cn?<span style={{fontSize:11,color:T.red,fontWeight:700}}>Credit note</span>
                    :inv.status==="credited"?<span style={{fontSize:11,color:T.muted,fontWeight:700}}>Credited</span>
                    :inv.status==="partial"?(
                      <span title={`${fmt(paidSoFar)} of ${fmt(inv.total)} paid`} style={{fontSize:11,color:T.orange,fontWeight:700,background:T.orangeBg,padding:"3px 8px",borderRadius:6}}>Partial</span>
                    ):(
                    <select value={inv.status} onChange={e=>updateInvoiceStatus(inv.id,e.target.value)} style={{fontSize:11,border:`1px solid ${T.border}`,borderRadius:6,padding:"3px 6px",fontFamily:"inherit",background:inv.status==="paid"?T.greenBg:inv.status==="sent"?T.accentLight:"#fff",color:inv.status==="paid"?T.green:T.sub}}>
                      <option value="draft">Draft</option>
                      <option value="sent">Sent</option>
                      <option value="paid">Paid</option>
                    </select>
                  )}
                </td>
                <td style={{textAlign:"right",whiteSpace:"nowrap",padding:"11px 14px"}}>
                  <button onClick={()=>downloadPdf(inv)} disabled={pdfBusy} title="Download PDF" style={{background:"none",border:`1px solid ${T.border}`,borderRadius:6,color:T.sub,cursor:pdfBusy?"wait":"pointer",fontSize:11,fontWeight:600,padding:"4px 8px",marginRight:4,fontFamily:"inherit"}}><i className="ti ti-download" style={{fontSize:11}}/></button>
                  <button onClick={()=>emailInvoice(inv)} title="Email to customer" style={{background:"none",border:`1px solid ${T.border}`,borderRadius:6,color:T.sub,cursor:"pointer",fontSize:11,fontWeight:600,padding:"4px 8px",marginRight:4,fontFamily:"inherit"}}><i className="ti ti-mail" style={{fontSize:11}}/></button>
                  {canPay&&<button onClick={()=>openPayModal(inv)} title="Register payment" style={{background:T.accentLight,border:"none",borderRadius:6,color:T.accent,cursor:"pointer",fontSize:11,fontWeight:700,padding:"4px 8px",marginRight:4,fontFamily:"inherit"}}>Pay</button>}
                  {canPay&&<button onClick={()=>window.confirm(`Create a credit note reversing invoice #${inv.invoiceNo}? The original stays on record.`)&&createCreditNote(inv)} title="Credit note" style={{background:"none",border:`1px solid ${T.border}`,borderRadius:6,color:T.sub,cursor:"pointer",fontSize:11,fontWeight:600,padding:"4px 8px",marginRight:4,fontFamily:"inherit"}}>CN</button>}
                  <button onClick={()=>window.confirm("Delete this invoice? This also removes its ledger entry. For posted invoices, prefer a credit note instead.")&&deleteInvoice(inv.id)} title="Delete" style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:13}}>✕</button>
                </td>
              </tr>
            );
          })}
          {!filteredInvoices.length&&<tr><td colSpan="7" style={{padding:"24px 0",textAlign:"center",color:T.muted}}>{invoices.length?"No invoices match your filter.":"No invoices yet. Create your first one."}</td></tr>}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// Recurring invoices — a saved template plus a manual "Generate this month"
// action. No server-side scheduler exists in this static-site architecture,
// so this is honestly not "fully automatic" — it's one click, not zero.
function RecurringInvoicesScreen({recurringInvoices,contacts,accounts,createRecurringInvoice,updateRecurringInvoice,deleteRecurringInvoice,generateRecurringInvoicesForMonth}){
  const customers=contacts.filter(c=>c.type==="customer");
  const saleAccounts=accounts.filter(a=>a.code.startsWith("3"));
  const[showNew,setShowNew]=useState(false);
  const[form,setForm]=useState({customerId:customers[0]?customers[0].id:"",saleAccount:saleAccounts[0]?saleAccounts[0].code:"",monthlyRate:"",description:"",vatPct:0});
  const[genMonth,setGenMonth]=useState(()=>new Date().toISOString().slice(0,7));
  const[generating,setGenerating]=useState(false);
  const[genResult,setGenResult]=useState(null);

  const getContactName=id=>{const c=contacts.find(x=>x.id===id);return c?c.name:"Unknown";};

  const handleCreate=()=>{
    if(!form.customerId||!form.saleAccount||!parseFloat(form.monthlyRate))return;
    createRecurringInvoice({...form,monthlyRate:parseFloat(form.monthlyRate),vatPct:parseFloat(form.vatPct)||0});
    setForm({customerId:customers[0]?customers[0].id:"",saleAccount:saleAccounts[0]?saleAccounts[0].code:"",monthlyRate:"",description:"",vatPct:0});
    setShowNew(false);
  };

  const handleGenerate=async()=>{
    setGenerating(true);
    const result=await generateRecurringInvoicesForMonth(genMonth);
    setGenResult(result);
    setGenerating(false);
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Recurring invoices</h1>
        <button onClick={()=>setShowNew(s=>!s)} style={{background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"9px 16px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>{showNew?"Cancel":"+ New template"}</button>
      </div>

      <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:16,marginBottom:20}}>
        <div style={{fontSize:12,fontWeight:800,color:T.text,marginBottom:6}}>Generate invoices for a month</div>
        <p style={{fontSize:11,color:T.muted,marginBottom:10}}>No automatic scheduler — this creates real invoices for every active template not yet generated for the month you pick.</p>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <input type="month" value={genMonth} onChange={e=>{setGenMonth(e.target.value);setGenResult(null);}} style={{...inp,width:160}}/>
          <button onClick={handleGenerate} disabled={generating} style={{background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"9px 16px",fontWeight:700,fontSize:13,cursor:generating?"wait":"pointer",fontFamily:"inherit"}}>{generating?"Generating…":"Generate"}</button>
          {genResult&&<span style={{fontSize:12,color:T.green,fontWeight:600}}>✓ Created {genResult.created}, skipped {genResult.skipped} (already generated)</span>}
        </div>
      </div>

      {showNew&&(
        <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:12,padding:16,marginBottom:20}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Customer</div>
              <select value={form.customerId} onChange={e=>setForm(p=>({...p,customerId:e.target.value}))} style={{...inp}}>
                {!customers.length&&<option value="">No customers yet</option>}
                {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Sale account (3xxx)</div>
              <AccDrop value={form.saleAccount} onChange={v=>setForm(p=>({...p,saleAccount:v}))} accounts={saleAccounts}/>
            </div>
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Monthly rate</div>
              <input type="number" placeholder="0" value={form.monthlyRate} onChange={e=>setForm(p=>({...p,monthlyRate:e.target.value}))} style={{...inp}}/>
            </div>
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>VAT %</div>
              <input type="number" value={form.vatPct} onChange={e=>setForm(p=>({...p,vatPct:e.target.value}))} style={{...inp}}/>
            </div>
          </div>
          <input placeholder="Description (optional, auto-generated if blank)" value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} style={{...inp,marginBottom:10}}/>
          <button onClick={handleCreate} style={{background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"9px 16px",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Save template</button>
        </div>
      )}

      <div style={{background:"#fff",borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden"}}>
      <table className="rr-sticky-thead" style={{width:"100%",fontSize:13,borderCollapse:"collapse"}}>
        <thead><tr style={{color:T.sub,background:T.bg}}>
          <td style={{padding:"11px 14px",fontWeight:700}}>Customer</td><td style={{fontWeight:700}}>Account</td><td style={{textAlign:"right",fontWeight:700}}>Monthly rate</td><td style={{fontWeight:700}}>Last generated</td><td style={{fontWeight:700}}>Active</td><td style={{padding:"11px 14px"}}></td>
        </tr></thead>
        <tbody>
          {recurringInvoices.map(r=>(
            <tr key={r.id} className="rr-table-row" style={{background:"#fff",borderBottom:`1px solid ${T.border}`}}>
              <td style={{padding:"11px 14px",fontWeight:600,color:T.text}}>{getContactName(r.customerId)}</td>
              <td style={{color:T.text}}>{r.saleAccount}</td>
              <td style={{textAlign:"right",fontWeight:700,color:T.text}}>{fmt(r.monthlyRate)}</td>
              <td style={{color:T.text}}>{r.lastGeneratedPeriod||"—"}</td>
              <td><input type="checkbox" checked={r.active} onChange={()=>updateRecurringInvoice(r.id,{active:!r.active})}/></td>
              <td style={{textAlign:"right",padding:"11px 14px"}}><button onClick={()=>window.confirm("Delete this recurring template?")&&deleteRecurringInvoice(r.id)} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:13}}>✕</button></td>
            </tr>
          ))}
          {!recurringInvoices.length&&<tr><td colSpan="6" style={{padding:"24px 0",textAlign:"center",color:T.muted}}>No recurring templates yet.</td></tr>}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// Employees — master data only. See roadmap for why payroll processing
// (tax tables, statutory filing) isn't part of this.
function EmployeesScreen({employees,createEmployee,updateEmployee,deleteEmployee,autoOpenNew}){
  const[showNew,setShowNew]=useState(false);
  useEffect(()=>{if(autoOpenNew)setShowNew(true);},[autoOpenNew]);
  const[editingId,setEditingId]=useState(null);
  const[form,setForm]=useState({name:"",role:"",email:"",phone:"",startDate:"",salary:"",notes:""});
  const[showInactive,setShowInactive]=useState(false);

  const startNew=()=>{setEditingId(null);setForm({name:"",role:"",email:"",phone:"",startDate:"",salary:"",notes:""});setShowNew(true);};
  const startEdit=(e)=>{setEditingId(e.id);setForm({name:e.name||"",role:e.role||"",email:e.email||"",phone:e.phone||"",startDate:e.startDate||"",salary:e.salary||"",notes:e.notes||""});setShowNew(false);};
  const cancel=()=>{setEditingId(null);setShowNew(false);};
  const save=()=>{
    if(!form.name.trim())return;
    const payload={...form,salary:form.salary?parseFloat(form.salary):null};
    if(editingId){updateEmployee(editingId,payload);setEditingId(null);}
    else{createEmployee(payload);setShowNew(false);}
  };

  const shown=employees.filter(e=>showInactive||e.active);

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Employees</h1>
        <button onClick={startNew} style={{background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"9px 16px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}><i className="ti ti-plus" style={{fontSize:13,marginRight:5}}/>New employee</button>
      </div>

      {(showNew||editingId)&&(
        <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:12,padding:16,marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:800,color:T.text,marginBottom:10}}>{editingId?"Edit employee":"New employee"}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <input placeholder="Name" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} style={inp}/>
            <input placeholder="Role / title" value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))} style={inp}/>
            <input placeholder="Email" type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} style={inp}/>
            <input placeholder="Phone" value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))} style={inp}/>
            <div>
              <div style={{fontSize:10,color:T.muted,marginBottom:3}}>Start date</div>
              <input type="date" value={form.startDate} onChange={e=>setForm(p=>({...p,startDate:e.target.value}))} style={inp}/>
            </div>
            <div>
              <div style={{fontSize:10,color:T.muted,marginBottom:3}}>Salary</div>
              <input type="number" placeholder="0" value={form.salary} onChange={e=>setForm(p=>({...p,salary:e.target.value}))} style={inp}/>
            </div>
          </div>
          <input placeholder="Notes (optional)" value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} style={{...inp,marginBottom:10}}/>
          <div style={{display:"flex",gap:8}}>
            <button onClick={save} style={{background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"9px 16px",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Save</button>
            <button onClick={cancel} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 16px",fontWeight:600,fontSize:12,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
          </div>
        </div>
      )}

      <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:T.sub,marginBottom:12,cursor:"pointer"}}>
        <input type="checkbox" checked={showInactive} onChange={e=>setShowInactive(e.target.checked)}/> Show inactive employees too
      </label>

      <div style={{background:"#fff",borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden"}}>
      <table className="rr-sticky-thead" style={{width:"100%",fontSize:13,borderCollapse:"collapse"}}>
        <thead><tr style={{color:T.sub,background:T.bg}}>
          <td style={{padding:"11px 14px",fontWeight:700}}>Name</td><td style={{fontWeight:700}}>Role</td><td style={{fontWeight:700}}>Contact</td><td style={{fontWeight:700}}>Start date</td><td style={{textAlign:"right",fontWeight:700}}>Salary</td><td style={{padding:"11px 14px"}}></td>
        </tr></thead>
        <tbody>
          {shown.map(e=>(
            <tr key={e.id} className="rr-table-row" style={{background:"#fff",borderBottom:`1px solid ${T.border}`,opacity:e.active?1:0.5}}>
              <td style={{padding:"11px 14px",fontWeight:700,color:T.text}}>{e.name}</td>
              <td style={{color:T.text}}>{e.role||"—"}</td>
              <td style={{color:T.text,fontSize:12}}>{e.email||e.phone||"—"}</td>
              <td style={{color:T.text}}>{e.startDate||"—"}</td>
              <td style={{textAlign:"right",fontWeight:600,color:T.text}}>{e.salary?fmt(e.salary):"—"}</td>
              <td style={{textAlign:"right",whiteSpace:"nowrap",padding:"11px 14px"}}>
                <button onClick={()=>startEdit(e)} title="Edit" style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:13,marginRight:6}}>✏️</button>
                <button onClick={()=>updateEmployee(e.id,{active:!e.active})} title={e.active?"Mark inactive":"Mark active"} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:12,marginRight:6}}>{e.active?"⏸":"▶"}</button>
                <button onClick={()=>window.confirm(`Remove ${e.name} from employees?`)&&deleteEmployee(e.id)} title="Delete" style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:13}}>✕</button>
              </td>
            </tr>
          ))}
          {!shown.length&&<tr><td colSpan="6" style={{padding:"24px 0",textAlign:"center",color:T.muted}}>No employees yet.</td></tr>}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// Point of Sale — checkout: tap products to build a cart, choose how it was
// paid, complete the sale. No barcode scanner or receipt printer hardware —
// that needs device-specific integration this environment can't set up.
function POSScreen({posProducts,accounts,transactions=[],completeSale,onManageProducts}){
  const[cart,setCart]=useState([]); // [{id,name,price,saleAccount,qty}]
  const bankAccounts=accounts.filter(a=>getSK(a.code)==="1900"||a.code==="1001");
  const[payAccount,setPayAccount]=useState(bankAccounts[0]?bankAccounts[0].code:"");
  const[completing,setCompleting]=useState(false);
  const[lastSaleTotal,setLastSaleTotal]=useState(null);

  // Today's sales — every transaction posted by completeSale carries the
  // "POS sale —" description prefix, which is how we tell POS sales apart
  // from other entries touching the same bank/cash account.
  const todaysSales=useMemo(()=>{
    const today=new Date().toISOString().slice(0,10);
    const sales=transactions.filter(t=>t.date===today&&t.description&&t.description.startsWith("POS sale"));
    const refunds=transactions.filter(t=>t.date===today&&t.description&&t.description.startsWith("POS refund"));
    return{count:sales.length,total:sales.reduce((s,t)=>s+t.amount,0)-refunds.reduce((s,t)=>s+t.amount,0),refundCount:refunds.length,refundTotal:refunds.reduce((s,t)=>s+t.amount,0)};
  },[transactions]);

  const[saleMode,setSaleMode]=useState("sale"); // "sale" | "refund"
  const addToCart=(p)=>setCart(prev=>{
    const existing=prev.find(i=>i.id===p.id);
    if(existing)return prev.map(i=>i.id===p.id?{...i,qty:i.qty+1}:i);
    return[...prev,{id:p.id,name:p.name,price:p.price,saleAccount:p.saleAccount,qty:1}];
  });
  const changeQty=(id,delta)=>setCart(prev=>prev.map(i=>i.id===id?{...i,qty:Math.max(0,i.qty+delta)}:i).filter(i=>i.qty>0));
  const removeFromCart=(id)=>setCart(prev=>prev.filter(i=>i.id!==id));
  const total=cart.reduce((s,i)=>s+i.price*i.qty,0);

  const checkout=async()=>{
    if(!cart.length||!payAccount||completing)return;
    setCompleting(true);
    await completeSale(cart,payAccount,saleMode);
    setCompleting(false);
    setLastSaleTotal(total);
    setCart([]);
    setTimeout(()=>setLastSaleTotal(null),3000);
  };

  const activeProducts=posProducts.filter(p=>p.active);

  return(
    <div style={{display:"grid",gridTemplateColumns:"1fr 320px",gap:24,alignItems:"start"}}>
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Point of sale</h1>
          <button onClick={onManageProducts} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Manage products</button>
        </div>
        <div style={{background:T.waterTealSubtle,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 16px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:12,color:T.sub,fontWeight:600}}>Today's sales</span>
          <span style={{fontSize:14,fontWeight:800,color:T.waterTeal}}>{fmt(todaysSales.total)} <span style={{fontSize:11,fontWeight:600,color:T.muted}}>({todaysSales.count} line{todaysSales.count===1?"":"s"})</span></span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
          {activeProducts.map(p=>(
            <button key={p.id} onClick={()=>addToCart(p)} style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:16,cursor:"pointer",textAlign:"left",fontFamily:"inherit"}}>
              <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:4}}>{p.name}</div>
              <div style={{fontSize:14,fontWeight:800,color:T.accent}}>{fmt(p.price)}</div>
            </button>
          ))}
          {!activeProducts.length&&<div style={{gridColumn:"1/-1",textAlign:"center",color:T.muted,padding:30,fontSize:13}}>No products yet — add some from "Manage products".</div>}
        </div>
      </div>

      <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:14,padding:18,position:"sticky",top:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:13,fontWeight:800,color:T.text}}>Cart</div>
          <div style={{display:"flex",gap:4}}>
            <button onClick={()=>setSaleMode("sale")} style={{background:saleMode==="sale"?T.accent:"none",color:saleMode==="sale"?"#fff":T.sub,border:`1px solid ${saleMode==="sale"?T.accent:T.border}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Sale</button>
            <button onClick={()=>setSaleMode("refund")} style={{background:saleMode==="refund"?T.red:"none",color:saleMode==="refund"?"#fff":T.sub,border:`1px solid ${saleMode==="refund"?T.red:T.border}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Refund</button>
          </div>
        </div>
        {lastSaleTotal!=null&&<div style={{background:T.greenBg,color:T.green,borderRadius:8,padding:"10px 12px",fontSize:12,fontWeight:700,marginBottom:12}}>✓ {saleMode==="refund"?"Refund":"Sale"} completed — {fmt(lastSaleTotal)}</div>}
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16,maxHeight:320,overflowY:"auto"}}>
          {cart.map(i=>(
            <div key={i.id} style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:600,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{i.name}</div>
                <div style={{fontSize:11,color:T.muted}}>{fmt(i.price)} each</div>
              </div>
              <button onClick={()=>changeQty(i.id,-1)} style={{width:22,height:22,borderRadius:6,border:`1px solid ${T.border}`,background:"#fff",cursor:"pointer",fontSize:13}}>−</button>
              <span style={{fontSize:12,fontWeight:700,width:20,textAlign:"center"}}>{i.qty}</span>
              <button onClick={()=>changeQty(i.id,1)} style={{width:22,height:22,borderRadius:6,border:`1px solid ${T.border}`,background:"#fff",cursor:"pointer",fontSize:13}}>+</button>
              <button onClick={()=>removeFromCart(i.id)} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:12}}>✕</button>
            </div>
          ))}
          {!cart.length&&<div style={{textAlign:"center",color:T.muted,fontSize:12,padding:"20px 0"}}>Cart is empty</div>}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:16,fontWeight:900,color:T.text,borderTop:`2px solid ${T.border}`,paddingTop:12,marginBottom:14}}>
          <span>Total</span><span>{fmt(total)}</span>
        </div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>{saleMode==="refund"?"Refunded from":"Paid into"}</div>
          <AccDrop value={payAccount} onChange={setPayAccount} accounts={bankAccounts}/>
        </div>
        <button onClick={checkout} disabled={!cart.length||!payAccount||completing} style={{width:"100%",background:!cart.length||!payAccount?T.border:(saleMode==="refund"?T.red:T.accent),color:cart.length&&payAccount?"#fff":T.muted,border:"none",borderRadius:10,padding:"12px",fontWeight:700,fontSize:14,cursor:cart.length&&payAccount?"pointer":"default",fontFamily:"inherit"}}>{completing?"Completing…":saleMode==="refund"?"Complete refund":"Complete sale"}</button>
      </div>
    </div>
  );
}

// POS product catalog — name, price, which sale account it posts to.
function POSProductsScreen({posProducts,accounts,createPosProduct,updatePosProduct,deletePosProduct,onBack}){
  const saleAccounts=accounts.filter(a=>a.code.startsWith("3"));
  const[showNew,setShowNew]=useState(false);
  const[form,setForm]=useState({name:"",price:"",saleAccount:saleAccounts[0]?saleAccounts[0].code:""});
  const[editingId,setEditingId]=useState(null);
  const[editForm,setEditForm]=useState({name:"",price:"",saleAccount:""});

  const save=()=>{
    if(!form.name.trim()||!parseFloat(form.price)||!form.saleAccount)return;
    createPosProduct({name:form.name,price:parseFloat(form.price),saleAccount:form.saleAccount});
    setForm({name:"",price:"",saleAccount:saleAccounts[0]?saleAccounts[0].code:""});
    setShowNew(false);
  };
  const startEdit=p=>{setEditingId(p.id);setEditForm({name:p.name,price:String(p.price),saleAccount:p.saleAccount});};
  const saveEdit=()=>{
    if(!editForm.name.trim()||!parseFloat(editForm.price)||!editForm.saleAccount)return;
    updatePosProduct(editingId,{name:editForm.name,price:parseFloat(editForm.price),saleAccount:editForm.saleAccount});
    setEditingId(null);
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>POS products</h1>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setShowNew(s=>!s)} style={{background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"9px 16px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>{showNew?"Cancel":"+ New product"}</button>
          <button onClick={onBack} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 16px",fontWeight:600,fontSize:12,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>‹ Back to POS</button>
        </div>
      </div>
      {showNew&&(
        <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:12,padding:16,marginBottom:20}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
            <input placeholder="Product name" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} style={inp}/>
            <input type="number" placeholder="Price" value={form.price} onChange={e=>setForm(p=>({...p,price:e.target.value}))} style={inp}/>
            <AccDrop value={form.saleAccount} onChange={v=>setForm(p=>({...p,saleAccount:v}))} accounts={saleAccounts}/>
          </div>
          <button onClick={save} style={{background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"9px 16px",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Save</button>
        </div>
      )}
      <div style={{background:"#fff",borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden"}}>
      <table className="rr-sticky-thead" style={{width:"100%",fontSize:13,borderCollapse:"collapse"}}>
        <thead><tr style={{color:T.sub,background:T.bg}}>
          <td style={{padding:"11px 14px",fontWeight:700}}>Name</td><td style={{textAlign:"right",fontWeight:700}}>Price</td><td style={{fontWeight:700}}>Sale account</td><td style={{fontWeight:700}}>Active</td><td style={{padding:"11px 14px"}}></td>
        </tr></thead>
        <tbody>
          {posProducts.map(p=>{
            if(editingId===p.id)return(
              <tr key={p.id} style={{background:T.accentLight,borderBottom:`1px solid ${T.border}`}}>
                <td style={{padding:"7px 14px"}}><input value={editForm.name} onChange={e=>setEditForm(f=>({...f,name:e.target.value}))} style={{...inp,fontSize:12,padding:"6px 8px"}}/></td>
                <td style={{padding:"7px 8px"}}><input type="number" value={editForm.price} onChange={e=>setEditForm(f=>({...f,price:e.target.value}))} style={{...inp,fontSize:12,padding:"6px 8px",textAlign:"right"}}/></td>
                <td style={{padding:"7px 8px"}}>
                  <AccDrop value={editForm.saleAccount} onChange={v=>setEditForm(f=>({...f,saleAccount:v}))} accounts={saleAccounts}/>
                </td>
                <td><input type="checkbox" checked={p.active} onChange={()=>updatePosProduct(p.id,{active:!p.active})}/></td>
                <td style={{textAlign:"right",padding:"7px 14px",whiteSpace:"nowrap"}}>
                  <button onClick={saveEdit} style={{background:T.accent,color:"#fff",border:"none",borderRadius:6,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginRight:4}}>Save</button>
                  <button onClick={()=>setEditingId(null)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:6,padding:"5px 10px",fontSize:11,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                </td>
              </tr>
            );
            return(
              <tr key={p.id} className="rr-table-row" style={{background:"#fff",borderBottom:`1px solid ${T.border}`,opacity:p.active?1:0.5}}>
                <td style={{padding:"11px 14px",fontWeight:700,color:T.text}}>{p.name}</td>
                <td style={{textAlign:"right",fontWeight:600,color:T.text}}>{fmt(p.price)}</td>
                <td style={{color:T.text}}>{p.saleAccount}</td>
                <td><input type="checkbox" checked={p.active} onChange={()=>updatePosProduct(p.id,{active:!p.active})}/></td>
                <td style={{textAlign:"right",padding:"11px 14px",whiteSpace:"nowrap"}}>
                  <button onClick={()=>startEdit(p)} style={{background:"none",border:"none",color:T.accent,cursor:"pointer",fontSize:12,fontWeight:700,marginRight:8,fontFamily:"inherit"}}>Edit</button>
                  <button onClick={()=>window.confirm(`Delete ${p.name}?`)&&deletePosProduct(p.id)} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:13}}>✕</button>
                </td>
              </tr>
            );
          })}
          {!posProducts.length&&<tr><td colSpan="5" style={{padding:"24px 0",textAlign:"center",color:T.muted}}>No products yet.</td></tr>}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// Payroll — gross-pay runs, no statutory tax withholding tables (jurisdiction-
// specific, needs a real market decision — see roadmap). Posts a real Dr
// Salary Expense / Cr Bank (and Cr deductions account, if used) per employee.
function PayrollScreen({employees,payrollRuns,accounts,createPayrollRun,deletePayrollRun,companyProfile={}}){
  const printPayslip=(run,line)=>{
    const html=`<!DOCTYPE html><html><head><title>Payslip — ${line.employeeName}</title><style>
      body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:36px;}
      h1{font-size:18px;font-weight:bold;margin-bottom:2px;}
      .sub{font-size:12px;color:#666;margin-bottom:24px;}
      table{width:100%;border-collapse:collapse;margin-top:14px;}
      td{padding:8px 10px;border-bottom:1px solid #eee;font-size:12px;}
      .total-row td{font-weight:bold;border-top:2px solid #333;font-size:14px;}
      @media print{.btn-bar{display:none;}}
    </style></head><body>
      <h1>${companyProfile.companyName||"Payslip"}</h1>
      <div class="sub">Payslip — ${line.employeeName} — ${run.period}</div>
      <table>
        <tr><td>Pay period</td><td style="text-align:right">${run.period}</td></tr>
        <tr><td>Payment date</td><td style="text-align:right">${run.runDate}</td></tr>
        <tr><td>Gross pay</td><td style="text-align:right">${fmt(line.grossPay)}</td></tr>
        <tr><td>Deductions</td><td style="text-align:right">${fmt(line.deductions)}</td></tr>
        <tr class="total-row"><td>Net pay</td><td style="text-align:right">${fmt(line.netPay)}</td></tr>
      </table>
      <p style="font-size:10px;color:#999;margin-top:20px;">No statutory tax withholding is calculated automatically — gross pay only.</p>
      <div class="btn-bar" style="margin-top:24px;"><button onclick="window.print()" style="padding:10px 20px;background:${T.accent};color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;">Print / Save as PDF</button></div>
    </body></html>`;
    openHtmlInNewTab(html);
  };
  const activeEmployees=employees.filter(e=>e.active);
  const bankAccounts=accounts.filter(a=>getSK(a.code)==="1900"||a.code==="1001");
  const salaryAccounts=accounts.filter(a=>a.code.startsWith("5")||a.code.startsWith("4"));
  const liabAccounts=accounts.filter(a=>getSK(a.code)==="2000"||getSK(a.code)==="2400"||a.code.startsWith("24"));
  const today=new Date().toISOString().slice(0,10);

  const[period,setPeriod]=useState(()=>new Date().toISOString().slice(0,7));
  const[payAccount,setPayAccount]=useState(bankAccounts[0]?bankAccounts[0].code:"");
  const[salaryAccount,setSalaryAccount]=useState(salaryAccounts[0]?salaryAccounts[0].code:"");
  const[deductionsAccount,setDeductionsAccount]=useState("");
  const[lineOverrides,setLineOverrides]=useState({}); // employeeId -> {gross,deductions}
  const[expandedRuns,setExpandedRuns]=useState(new Set());
  const toggleExpandRun=(id)=>setExpandedRuns(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);return n;});
  const[running,setRunning]=useState(false);
  const[showRun,setShowRun]=useState(false);

  const getLine=(emp)=>{
    const o=lineOverrides[emp.id]||{};
    const gross=o.gross!=null?o.gross:(emp.salary||0);
    const deductions=o.deductions!=null?o.deductions:0;
    return{gross,deductions,net:gross-deductions};
  };
  const setLine=(empId,field,value)=>setLineOverrides(p=>({...p,[empId]:{...p[empId],[field]:parseFloat(value)||0}}));

  const totalNet=activeEmployees.reduce((s,e)=>s+getLine(e).net,0);
  const valid=activeEmployees.length>0&&payAccount&&salaryAccount;

  const runPayroll=async()=>{
    if(!valid||running)return;
    setRunning(true);
    const lines=activeEmployees.map(e=>{const l=getLine(e);return{employeeId:e.id,employeeName:e.name,grossPay:l.gross,deductions:l.deductions,netPay:l.net};});
    await createPayrollRun(period,today,payAccount,salaryAccount,lines,deductionsAccount||null);
    setRunning(false);
    setLineOverrides({});
    setShowRun(false);
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Payroll</h1>
        <button onClick={()=>setShowRun(s=>!s)} style={{background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"9px 16px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>{showRun?"Cancel":"+ Run payroll"}</button>
      </div>
      <p style={{fontSize:11,color:T.muted,marginBottom:16}}>Gross pay only — no statutory tax withholding tables are calculated automatically. Enter net deductions manually if needed.</p>

      {showRun&&(
        <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:12,padding:16,marginBottom:20}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Period</div>
              <input type="month" value={period} onChange={e=>setPeriod(e.target.value)} style={inp}/>
            </div>
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Pay from</div>
              <AccDrop value={payAccount} onChange={setPayAccount} accounts={bankAccounts}/>
            </div>
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Salary expense account</div>
              <AccDrop value={salaryAccount} onChange={setSalaryAccount} accounts={salaryAccounts}/>
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Deductions payable account (optional)</div>
            <select value={deductionsAccount} onChange={e=>setDeductionsAccount(e.target.value)} style={{...inp,width:260}}>
              <option value="">— none, net pay only —</option>
              {liabAccounts.map(a=><option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
            </select>
          </div>
          <table style={{width:"100%",fontSize:13,borderCollapse:"collapse",marginBottom:14}}>
            <thead><tr style={{color:T.muted,fontSize:11}}>
              <td style={{padding:"6px 0"}}>Employee</td><td style={{textAlign:"right"}}>Gross</td><td style={{textAlign:"right"}}>Deductions</td><td style={{textAlign:"right"}}>Net</td>
            </tr></thead>
            <tbody>
              {activeEmployees.map(e=>{
                const l=getLine(e);
                return(
                  <tr key={e.id} style={{borderTop:`1px solid ${T.border}`}}>
                    <td style={{padding:"8px 0",fontWeight:600}}>{e.name}</td>
                    <td style={{textAlign:"right"}}><input type="number" value={l.gross} onChange={ev=>setLine(e.id,"gross",ev.target.value)} style={{...inp,width:100,textAlign:"right",padding:"5px 8px"}}/></td>
                    <td style={{textAlign:"right"}}><input type="number" value={l.deductions} onChange={ev=>setLine(e.id,"deductions",ev.target.value)} style={{...inp,width:100,textAlign:"right",padding:"5px 8px"}}/></td>
                    <td style={{textAlign:"right",fontWeight:700}}>{fmt(l.net)}</td>
                  </tr>
                );
              })}
              {!activeEmployees.length&&<tr><td colSpan="4" style={{padding:"16px 0",textAlign:"center",color:T.muted}}>No active employees. Add some in Employees first.</td></tr>}
            </tbody>
          </table>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:14,fontWeight:800,color:T.text}}>Total net pay: {fmt(totalNet)}</div>
            <button onClick={runPayroll} disabled={!valid||running} style={{background:valid?T.accent:T.border,color:valid?"#fff":T.muted,border:"none",borderRadius:10,padding:"10px 20px",fontWeight:700,fontSize:13,cursor:valid?"pointer":"default",fontFamily:"inherit"}}>{running?"Posting…":"Run payroll"}</button>
          </div>
        </div>
      )}

      <div style={{fontSize:12,fontWeight:800,color:T.text,marginBottom:8}}>Past runs</div>
      <div style={{background:"#fff",borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden"}}>
      <table className="rr-sticky-thead" style={{width:"100%",fontSize:13,borderCollapse:"collapse"}}>
        <thead><tr style={{color:T.sub,background:T.bg}}>
          <td style={{padding:"11px 14px"}}></td><td style={{fontWeight:700}}>Period</td><td style={{fontWeight:700}}>Date</td><td style={{textAlign:"right",fontWeight:700}}>Gross</td><td style={{textAlign:"right",fontWeight:700}}>Deductions</td><td style={{textAlign:"right",fontWeight:700}}>Net</td><td style={{fontWeight:700}}>Employees</td><td style={{padding:"11px 14px"}}></td>
        </tr></thead>
        <tbody>
          {payrollRuns.map(r=>{
            const isExpanded=expandedRuns.has(r.id);
            return(
            <React.Fragment key={r.id}>
            <tr className="rr-table-row" style={{background:"#fff",borderBottom:`1px solid ${T.border}`,cursor:"pointer"}} onClick={()=>toggleExpandRun(r.id)}>
              <td style={{padding:"11px 14px"}}><i className={isExpanded?"ti ti-chevron-down":"ti ti-chevron-right"} style={{fontSize:13,color:T.muted}}/></td>
              <td style={{fontWeight:700,color:T.text}}>{r.period}</td>
              <td style={{color:T.text}}>{r.runDate}</td>
              <td style={{textAlign:"right",color:T.text}}>{fmt(r.totalGross)}</td>
              <td style={{textAlign:"right",color:T.text}}>{fmt(r.totalDeductions)}</td>
              <td style={{textAlign:"right",fontWeight:700,color:T.text}}>{fmt(r.totalNet)}</td>
              <td style={{color:T.text}}>{r.lines.length}</td>
              <td style={{textAlign:"right",padding:"11px 14px"}} onClick={e=>e.stopPropagation()}><button onClick={()=>window.confirm("Delete this payroll run record? This does NOT reverse its ledger entries — reverse those separately in Entries if needed.")&&deletePayrollRun(r.id)} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:13}}>✕</button></td>
            </tr>
            {isExpanded&&r.lines.map(line=>(
              <tr key={line.id} style={{background:T.bg,borderBottom:`1px solid ${T.border}`}}>
                <td></td>
                <td colSpan="2" style={{padding:"7px 14px",fontSize:12,color:T.text}}>{line.employeeName}</td>
                <td style={{textAlign:"right",fontSize:12,color:T.text}}>{fmt(line.grossPay)}</td>
                <td style={{textAlign:"right",fontSize:12,color:T.text}}>{fmt(line.deductions)}</td>
                <td style={{textAlign:"right",fontSize:12,fontWeight:700,color:T.text}}>{fmt(line.netPay)}</td>
                <td></td>
                <td style={{textAlign:"right",padding:"7px 14px"}}><button onClick={()=>printPayslip(r,line)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:6,padding:"3px 9px",fontSize:11,fontWeight:600,color:T.accent,cursor:"pointer",fontFamily:"inherit"}}>Payslip</button></td>
              </tr>
            ))}
            </React.Fragment>
            );
          })}
          {!payrollRuns.length&&<tr><td colSpan="8" style={{padding:"24px 0",textAlign:"center",color:T.muted}}>No payroll runs yet.</td></tr>}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// Quote creation — mirrors invoice creation, but nothing here touches the
// ledger. Only converting a quote to an invoice posts a real transaction.
function QuoteFormScreen({accounts,contacts,companyProfile,nextQuoteNo,createQuote,onDone}){
  const customers=contacts.filter(c=>c.type==="customer");
  const saleAccounts=accounts.filter(a=>a.code.startsWith("3"));
  const today=new Date().toISOString().slice(0,10);
  const validDefault=(()=>{const d=new Date();d.setDate(d.getDate()+30);return d.toISOString().slice(0,10);})();

  const[customerId,setCustomerId]=useState(customers[0]?customers[0].id:"");
  const[saleAccount,setSaleAccount]=useState(saleAccounts[0]?saleAccounts[0].code:"");
  const[date,setDate]=useState(today);
  const[validUntil,setValidUntil]=useState(validDefault);
  const[description,setDescription]=useState("");
  const[qty,setQty]=useState("1");
  const[unitPrice,setUnitPrice]=useState("");
  const[vatPct,setVatPct]=useState(companyProfile.vatPct||0);
  const[saving,setSaving]=useState(false);

  const contact=customers.find(c=>c.id===customerId);
  const q=parseFloat(qty)||0;
  const price=parseFloat(unitPrice)||0;
  const subtotal=q*price;
  const vatAmount=subtotal*(parseFloat(vatPct)||0)/100;
  const total=subtotal+vatAmount;
  const valid=customerId&&saleAccount&&price>0&&q>0;

  const handleCreate=async()=>{
    if(!valid||saving)return;
    setSaving(true);
    const desc=description||`${contact?contact.name:"Customer"} quote`;
    const form={customerId,saleAccount,date,validUntil,lines:[{description:desc,qty:q,unitPrice:price}],vatPct:parseFloat(vatPct)||0,subtotal,vatAmount,total};
    const quote=await createQuote(form);
    setSaving(false);
    if(quote&&onDone)onDone(quote);
  };

  return(
    <div style={{maxWidth:500}}>
      <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 4px"}}>New quote</h1>
      <p style={{fontSize:12,color:T.muted,margin:"0 0 20px"}}>Quote no. {nextQuoteNo} — doesn't touch the ledger until converted to an invoice</p>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div>
          <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Customer</div>
          <select value={customerId} onChange={e=>setCustomerId(e.target.value)} style={{...inp}}>
            {!customers.length&&<option value="">No customers yet</option>}
            {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Sale account (3xxx)</div>
          <AccDrop value={saleAccount} onChange={setSaleAccount} accounts={saleAccounts}/>
        </div>
        <div>
          <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Description</div>
          <input value={description} onChange={e=>setDescription(e.target.value)} placeholder="What's being quoted" style={{...inp}}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Quantity</div>
            <input type="number" value={qty} onChange={e=>setQty(e.target.value)} style={{...inp}}/>
          </div>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Unit price</div>
            <input type="number" placeholder="0" value={unitPrice} onChange={e=>setUnitPrice(e.target.value)} style={{...inp}}/>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Date</div>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{...inp}}/>
          </div>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Valid until</div>
            <input type="date" value={validUntil} onChange={e=>setValidUntil(e.target.value)} style={{...inp}}/>
          </div>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>VAT %</div>
            <input type="number" value={vatPct} onChange={e=>setVatPct(e.target.value)} style={{...inp}}/>
          </div>
        </div>
        <button onClick={handleCreate} disabled={!valid||saving} style={{background:valid?T.accent:T.border,color:valid?"#fff":T.muted,border:"none",borderRadius:10,padding:"12px",fontWeight:700,fontSize:14,cursor:valid?"pointer":"default",fontFamily:"inherit"}}>{saving?"Saving…":`Save quote · ${fmt(total)}`}</button>
      </div>
    </div>
  );
}

// Quote overview — list with status, and the one action that matters:
// converting an accepted quote into a real invoice (which is what actually
// posts to the ledger — the quote itself never does).
function QuoteOverviewScreen({quotes,contacts,createQuote,updateQuoteStatus,deleteQuote,convertQuoteToInvoice,onNewQuote,onViewInvoice}){
  const getContactName=id=>{const c=contacts.find(x=>x.id===id);return c?c.name:"Unknown";};
  const[converting,setConverting]=useState(null);

  const doConvert=async(q)=>{
    if(!window.confirm(`Convert quote #${q.quoteNo} into a real invoice? This will post to the ledger.`))return;
    setConverting(q.id);
    const inv=await convertQuoteToInvoice(q);
    setConverting(null);
    if(inv&&onViewInvoice)onViewInvoice();
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Quotes</h1>
        <button onClick={onNewQuote} style={{background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"9px 16px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}><i className="ti ti-plus" style={{fontSize:13,marginRight:5}}/>New quote</button>
      </div>
      <div style={{background:"#fff",borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden"}}>
      <table className="rr-sticky-thead" style={{width:"100%",fontSize:13,borderCollapse:"collapse"}}>
        <thead><tr style={{color:T.sub,background:T.bg}}>
          <td style={{padding:"11px 14px",fontWeight:700}}>Quote</td><td style={{fontWeight:700}}>Customer</td><td style={{fontWeight:700}}>Date</td><td style={{fontWeight:700}}>Valid until</td><td style={{textAlign:"right",fontWeight:700}}>Total</td><td style={{fontWeight:700}}>Status</td><td style={{padding:"11px 14px"}}></td>
        </tr></thead>
        <tbody>
          {[...quotes].sort((a,b)=>b.quoteNo-a.quoteNo).map(q=>(
            <tr key={q.id} className="rr-table-row" style={{background:"#fff",borderBottom:`1px solid ${T.border}`,opacity:q.status==="converted"||q.status==="declined"?0.6:1}}>
              <td style={{padding:"11px 14px",color:T.accent,fontWeight:700}}>#{q.quoteNo}</td>
              <td style={{color:T.text}}>{getContactName(q.customerId)}</td>
              <td style={{color:T.text}}>{q.date}</td>
              <td style={{color:T.text}}>{q.validUntil||"—"}</td>
              <td style={{textAlign:"right",fontWeight:700,color:T.text}}>{fmt(q.total)}</td>
              <td>
                {q.status==="converted"?<span style={{fontSize:11,color:T.green,fontWeight:700}}>✓ Converted</span>:(
                  <select value={q.status} onChange={e=>updateQuoteStatus(q.id,e.target.value)} style={{fontSize:11,border:`1px solid ${T.border}`,borderRadius:6,padding:"3px 6px",fontFamily:"inherit"}}>
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="accepted">Accepted</option>
                    <option value="declined">Declined</option>
                  </select>
                )}
              </td>
              <td style={{textAlign:"right",whiteSpace:"nowrap",padding:"11px 14px"}}>
                {q.status!=="converted"&&(
                  <button onClick={()=>doConvert(q)} disabled={converting===q.id} style={{background:T.accentLight,border:"none",borderRadius:6,color:T.accent,cursor:"pointer",fontSize:11,fontWeight:700,padding:"4px 8px",marginRight:6,fontFamily:"inherit"}}>{converting===q.id?"Converting…":"Convert"}</button>
                )}
                <button onClick={()=>window.confirm("Delete this quote?")&&deleteQuote(q.id)} title="Delete" style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:13}}>✕</button>
              </td>
            </tr>
          ))}
          {!quotes.length&&<tr><td colSpan="7" style={{padding:"24px 0",textAlign:"center",color:T.muted}}>No quotes yet.</td></tr>}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// Audit trail — who changed which bilag, when, old vs new values. Read-only
// by design: the audit_log table has no update/delete policy, so nothing in
// the app (or anyone with database access through the app) can rewrite history.
function AuditLogScreen({auditLog,transactions}){
  const[filter,setFilter]=useState("");
  const getBilagLabel=(entry)=>entry.bilag?fmtB(entry.bilag):(entry.entityType==="invoice"?`Invoice #${entry.entityId}`:`#${entry.entityId}`);
  const shown=auditLog.filter(a=>!filter||getBilagLabel(a).toLowerCase().includes(filter.toLowerCase())||(a.action||"").includes(filter.toLowerCase()));

  const renderValue=(v)=>{
    if(!v)return"—";
    return Object.entries(v).map(([k,val])=>`${k}: ${val}`).join(", ");
  };

  const actionStyle=(a)=>({create:T.green,update:T.blue,delete:T.red,status_change:"#D97706",reverse:"#D97706",match:T.green,unmatch:T.red}[a]||T.sub);

  return(
    <div>
      <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 6px"}}>Audit trail</h1>
      <p style={{fontSize:11,color:T.muted,marginBottom:16}}>Read-only history of every create, edit, and delete on transactions and invoice status. Nothing here can be altered after the fact.</p>
      <input placeholder="Search by bilag or action" value={filter} onChange={e=>setFilter(e.target.value)} style={{...inp,width:260,marginBottom:16}}/>
      <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
        <thead><tr style={{color:T.muted,fontSize:11}}>
          <td style={{padding:"6px 0"}}>When</td><td>Entity</td><td>Action</td><td>Before</td><td>After</td>
        </tr></thead>
        <tbody>
          {shown.slice(0,300).map(a=>(
            <tr key={a.id} style={{borderTop:`1px solid ${T.border}`}}>
              <td style={{padding:"7px 0",color:T.sub,whiteSpace:"nowrap"}}>{new Date(a.createdAt).toLocaleString()}</td>
              <td style={{color:T.accent,fontWeight:700}}>{getBilagLabel(a)}</td>
              <td style={{color:actionStyle(a.action),fontWeight:700,textTransform:"capitalize"}}>{a.action.replace("_"," ")}</td>
              <td style={{color:T.muted,maxWidth:220}}>{renderValue(a.oldValues)}</td>
              <td style={{color:T.text,maxWidth:220}}>{renderValue(a.newValues)}</td>
            </tr>
          ))}
          {!shown.length&&<tr><td colSpan="5" style={{padding:"24px 0",textAlign:"center",color:T.muted}}>No audit history yet — it starts recording from here forward.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function AccDropReskontro({value,onChange,accounts,contacts,onContactSelect,side}){
  const[open,setOpen]=useState(false);
  const[q,setQ]=useState("");

  // Determine display label for current value
  const selAcc=accounts.find(a=>a.code===value);
  // Check if value matches a contact id (starts with C or S)
  const selContact=contacts.find(c=>c.id===value);
  const displayLabel=selContact
    ?`${selContact.id} — ${selContact.name}`
    :selAcc?`${selAcc.code} — ${selAcc.name}`:null;

  const ql=q.toLowerCase();

  // Contacts filtered
  const filteredContacts=contacts.filter(c=>!c.inactive&&(!q||c.name.toLowerCase().includes(ql)||c.id.toLowerCase().includes(ql))).slice(0,20);

  // Accounts filtered (grouped)
  const filteredAccs=useMemo(()=>{
    const all=[];
    Object.entries(SERIES).forEach(([key,s])=>{
      const grp=accounts.filter(a=>getSK(a.code)===key).sort((a,b)=>a.code.localeCompare(b.code));
      grp.forEach(a=>{if(!q||a.code.includes(q)||a.name.toLowerCase().includes(ql))all.push({...a,groupKey:key});});
    });
    return all;
  },[accounts,q,ql]);

  const pickContact=(c)=>{
    const code=c.type==="customer"?"1500":"2400";
    onChange(code);
    if(onContactSelect)onContactSelect(c.id);
    setOpen(false);setQ("");
  };
  const pickAcc=(a)=>{
    onChange(a.code);
    setOpen(false);setQ("");
  };

  return(
    <div style={{position:"relative"}}>
      <div onClick={()=>{setOpen(o=>!o);setQ("");}} style={{...selSm,display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",userSelect:"none",minHeight:36,border:`1.5px solid ${T.accent}`,background:T.accentLight}}>
        {displayLabel
          ?<span style={{fontSize:9,color:T.text,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{displayLabel}</span>
          :<span style={{fontSize:9,color:T.accent,fontWeight:600}}>— Select Contact / Account —</span>}
        <span style={{fontSize:8,color:T.accent,marginLeft:4,flexShrink:0}}>{open?"▲":"▼"}</span>
      </div>
      {open&&(
        <>
          <div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:298}}/>
          <div style={{position:"absolute",top:"calc(100% + 3px)",left:0,right:0,background:"#fff",border:`1.5px solid ${T.accent}`,borderRadius:10,zIndex:299,boxShadow:"0 8px 24px rgba(13,115,119,0.18)",overflow:"hidden",maxHeight:280}}>
            <div style={{padding:"6px 8px",borderBottom:`1px solid ${T.border}`}}>
              <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search contacts or accounts…" style={{...inp,fontSize:9,padding:"5px 8px",margin:0}}/>
            </div>
            <div style={{overflowY:"auto",maxHeight:230}}>
              {/* Contacts section */}
              {filteredContacts.length>0&&(
                <>
                  <div style={{padding:"5px 10px 3px",fontSize:8,fontWeight:800,color:T.accent,textTransform:"uppercase",letterSpacing:0.8,background:T.accentLight}}>👥 Contacts (Reskontro)</div>
                  {filteredContacts.map((c,i)=>{
                    const isCust=c.type==="customer";
                    return(
                      <div key={c.id} onClick={()=>pickContact(c)} style={{padding:"8px 10px",fontSize:9,cursor:"pointer",background:"#fff",borderBottom:`0.5px solid ${T.border}`,display:"flex",gap:6,alignItems:"center"}}>
                        <span style={{fontSize:8,fontWeight:800,color:isCust?T.blue:T.red,background:isCust?T.blueBg:T.redLight,padding:"1px 5px",borderRadius:4,flexShrink:0}}>{isCust?"AR 1500":"AP 2400"}</span>
                        <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:600,color:T.text}}>{c.name}</span>
                        <span style={{fontSize:8,color:T.muted,flexShrink:0}}>{c.id}</span>
                      </div>
                    );
                  })}
                </>
              )}
              {/* Accounts section */}
              {filteredAccs.length>0&&(
                <>
                  <div style={{padding:"5px 10px 3px",fontSize:8,fontWeight:800,color:T.sub,textTransform:"uppercase",letterSpacing:0.8,background:T.bg}}>📋 Accounts</div>
                  {filteredAccs.map((a,i)=>(
                    <div key={a.code} onClick={()=>pickAcc(a)} style={{padding:"8px 10px",fontSize:9,cursor:"pointer",background:a.code===value?"#EBF4FF":"#fff",fontWeight:a.code===value?700:400,color:T.text,borderBottom:i<filteredAccs.length-1?`0.5px solid ${T.border}`:"none",display:"flex",gap:6,alignItems:"center"}}>
                      <span style={{color:(SERIES[a.groupKey]?SERIES[a.groupKey].color:undefined)||T.muted,fontWeight:700,minWidth:32,flexShrink:0}}>{a.code}</span>
                      <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</span>
                    </div>
                  ))}
                </>
              )}
              {!filteredContacts.length&&!filteredAccs.length&&(
                <div style={{padding:"16px 12px",fontSize:9,color:T.muted,textAlign:"center"}}>No results found</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── New Entry Form ───────────────────────────────────────────────────────────
// Inline contact search for entry form
function AccountSwitcherDropdown({accounts,value,onChange}){
  const[q,setQ]=useState("");
  const[open,setOpen]=useState(false);
  const current=accounts.find(a=>a.code===value);
  const filtered=useMemo(()=>{
    if(!q.trim())return accounts.slice(0,30);
    const ql=q.toLowerCase();
    return accounts.filter(a=>a.code.includes(q)||a.name.toLowerCase().includes(ql)).slice(0,30);
  },[accounts,q]);
  return(
    <div style={{position:"relative",width:220}}>
      <div onClick={()=>setOpen(o=>!o)} style={{...inp,display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}}>
        <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:13}}>{current?`${current.code} ${current.name}`:"Select account"}</span>
        <span style={{fontSize:9,color:T.muted,flexShrink:0,marginLeft:6}}>▾</span>
      </div>
      {open&&(
        <>
          <div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:298}}/>
          <div style={{position:"absolute",top:"calc(100% + 3px)",left:0,right:0,background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,zIndex:299,boxShadow:"0 8px 24px rgba(0,0,0,0.14)",overflow:"hidden"}}>
            <div style={{padding:8,borderBottom:`1px solid ${T.border}`}}>
              <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search account code or name…" style={{...inp,fontSize:12,padding:"7px 10px"}}/>
            </div>
            <div style={{overflowY:"auto",maxHeight:240}}>
              {filtered.length===0&&<div style={{padding:"10px 12px",fontSize:11,color:T.muted}}>No accounts found</div>}
              {filtered.map((a,i)=>(
                <div key={a.code} onClick={()=>{onChange(a.code);setOpen(false);setQ("");}} style={{padding:"8px 12px",cursor:"pointer",borderBottom:i<filtered.length-1?`1px solid ${T.border}`:"none",background:a.code===value?T.accentLight:"#fff",fontSize:12,color:a.code===value?T.accent:T.text,fontWeight:a.code===value?700:400}}>
                  {a.code} {a.name}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ContactSearchInline({contacts,value,onChange,type}){
  const[q,setQ]=useState("");
  const[open,setOpen]=useState(false);
  const isAll=type==="all";
  const isC=type==="customer";
  const filtered=useMemo(()=>{
    if(!q.trim())return contacts.slice(0,12);
    const ql=q.toLowerCase();
    return contacts.filter(c=>c.name.toLowerCase().includes(ql)||c.id.toLowerCase().includes(ql)).slice(0,10);
  },[contacts,q]);
  return(
    <div style={{position:"relative"}}>
      <input value={q} onChange={e=>{setQ(e.target.value);setOpen(true);}} onFocus={()=>setOpen(true)}
        placeholder={isAll?"Search all contacts (customers & suppliers)…":`Search ${isC?"customer":"supplier"}…`}
        style={{...inp,fontSize:12,padding:"8px 12px"}}/>
      {open&&(
        <>
          <div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:298}}/>
          <div style={{position:"absolute",top:"calc(100% + 3px)",left:0,right:0,background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,zIndex:299,boxShadow:"0 8px 24px rgba(0,0,0,0.14)",overflow:"hidden",maxHeight:200}}>
            <div style={{overflowY:"auto",maxHeight:200}}>
              {filtered.length===0&&<div style={{padding:"10px 12px",fontSize:9,color:T.muted}}>No contacts found</div>}
              {filtered.map((c,i)=>{const cIsC=c.type==="customer";return(
                <div key={c.id} onClick={()=>{onChange(c.id);setOpen(false);setQ("");}} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",cursor:"pointer",borderBottom:i<filtered.length-1?`0.5px solid ${T.border}`:"none",background:"#fff"}}>
                  <span style={{fontSize:9,fontWeight:800,color:isAll?(cIsC?T.blue:T.red):(isC?T.blue:T.red),background:isAll?(cIsC?T.blueBg:T.redLight):(isC?T.blueBg:T.redLight),padding:"1px 6px",borderRadius:4,flexShrink:0}}>{isAll?(cIsC?"AR":"AP"):(isC?"AR":"AP")}</span>
                  <span style={{fontSize:12,fontWeight:600,flex:1,color:T.text}}>{c.name}</span>
                  <span style={{fontSize:9,color:T.muted,fontWeight:700}}>{c.id}</span>
                </div>
              );})}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function NewEntryForm({accounts,contacts,setContacts,nextBilag,onSave,addEntryComment,feat={},sinkingFunds=[],saveSinkingFunds,inboxFiles=[],uploadInboxFile,transactions=[],moneySources=[],tagTransaction,isDesktop=false,projects=[],trackProjects=false,saveProjects,initialEntryMode="receipt"}){
  const lastDebit=(()=>{try{return localStorage.getItem("rr_last_debit_code")||"";}catch{return"";}})();
  const lastCredit=(()=>{try{return localStorage.getItem("rr_last_credit_code")||"";}catch{return"";}})();
  const emptyTxn={date:new Date().toISOString().split("T")[0],debitCode:lastDebit,creditCode:lastCredit,description:"",amount:"",contactId:"",sfFundId:"",attachmentId:"",moneySourceId:"",projectId:"",notes:""};
  const[form,setForm]=useState(()=>{
    let pending=null;
    try{pending=localStorage.getItem("rr_pending_attachment");}catch{}
    // File ids are UUIDs (e.g. "a1b2c3d4-...") — parseInt() used to silently
    // truncate them to garbage (stops at the first non-digit character),
    // breaking the attachment link without any visible error.
    if(pending){
      try{localStorage.removeItem("rr_pending_attachment");}catch{}
      let suggestion=null;
      try{
        const raw=localStorage.getItem("rr_pending_attachment_suggestion");
        if(raw){suggestion=JSON.parse(raw);localStorage.removeItem("rr_pending_attachment_suggestion");}
      }catch{}
      return{
        ...emptyTxn,attachmentId:pending,
        amount:suggestion&&suggestion.amount!=null?String(suggestion.amount):emptyTxn.amount,
        description:suggestion&&suggestion.supplier?suggestion.supplier:emptyTxn.description,
        invoiceNo:suggestion&&suggestion.invoiceNo?suggestion.invoiceNo:"",
      };
    }
    return emptyTxn;
  });
  const[showAddContact,setShowAddContact]=useState(false);
  const[showEntryPreview,setShowEntryPreview]=useState(true);
  const[newContact,setNewContact]=useState({name:"",phone:"",email:"",address:"",accountNo:"",type:"supplier"});
  const[entryMode,setEntryMode]=useState(initialEntryMode); // "receipt" | "supplier" | "customer"
  const[invContactId,setInvContactId]=useState("");
  const[invoiceNo,setInvoiceNo]=useState("");
  const[invDueDate,setInvDueDate]=useState("");
  const[invAmount,setInvAmount]=useState("");
  const[invAccountCode,setInvAccountCode]=useState("");
  const[invDescription,setInvDescription]=useState("");
  const[invExtraLines,setInvExtraLines]=useState([]); // [{accountCode,amount}]
  const[invAttachmentIds,setInvAttachmentIds]=useState([]);
  const[invAttOpen,setInvAttOpen]=useState(true);
  const[uploadingInvAtt,setUploadingInvAtt]=useState(false);
  const[invRegisterPayment,setInvRegisterPayment]=useState(""); // "" = no payment (AP/AR open item), else account code (Cash or a bank) to settle against
  const resetInvoiceForm=()=>{setInvContactId("");setInvoiceNo("");setInvDueDate("");setInvAmount("");setInvAccountCode("");setInvDescription("");setInvExtraLines([]);setInvAttachmentIds([]);setInvRegisterPayment("");};
  const invIsCustomer=entryMode==="customer";
  const reskontroMode=false; // legacy manual contact-tagging toggle retired in favor of the entryMode dropdown
  const[entrySaved,setEntrySaved]=React.useState(false);
  const[saving,setSaving]=React.useState(false);
  const[showAttachPopover,setShowAttachPopover]=useState(false);
  const[uploadingReceipt,setUploadingReceipt]=useState(false);
  const uploadToInbox=async(file)=>{
    setUploadingReceipt(true);
    const newFile=await uploadInboxFile(file);
    if(newFile)setForm(p=>({...p,attachmentId:newFile.id}));
    setUploadingReceipt(false);
  };
  const getName=code=>((accounts.find(a=>a.code===code))||{name:code}).name;

  // Determine if contact selector should show and what type.
  // Contact is auto-typed (Customer/Supplier) when the entry touches AR (1500) or AP (2400);
  // otherwise the picker is still shown, but optional and lists all contacts.
  const autoNeedContact=form.debitCode==="1500"||form.creditCode==="1500"||form.debitCode==="2400"||form.creditCode==="2400";
  const needContact=autoNeedContact; // only show the contact picker when the entry actually touches AR (1500) or AP (2400)
  const contactType=form.debitCode==="1500"||form.creditCode==="1500"?"customer":"supplier";
  const contactMode=autoNeedContact?contactType:"all";
  // AR/AP entries filter contacts by type; otherwise show everyone (customers & suppliers)
  const filteredContacts=(reskontroMode||!autoNeedContact)?contacts.filter(c=>!c.inactive):contacts.filter(c=>c.type===contactType);

  const valid=form.debitCode&&form.creditCode&&form.description&&parseFloat(form.amount)>0;

  const save=async()=>{
    // saving guards against a double-click firing this twice before the
    // first await resolves — the button below also disables on `saving`,
    // but that alone isn't enough since a fast second click can land before
    // the first render pass reflects the disabled state.
    if(!valid||saving)return;
    if(isDateClosed(form.date)){
      alert(`Period is closed up to ${getPeriodClose()}. This date cannot accept new entries.`);
      return;
    }
    // Duplicate check — same date, amount, and description already recorded.
    // A real mistake (double-clicking Save, re-entering a receipt already
    // logged) shows up exactly this way; a legitimate repeat is rare enough
    // that a confirm dialog is the right amount of friction, not a hard block.
    const amountNum=parseFloat(form.amount);
    const possibleDupe=transactions.find(t=>t.date===form.date&&Math.abs(t.amount-amountNum)<0.01&&t.description.trim().toLowerCase()===form.description.trim().toLowerCase());
    if(possibleDupe&&!window.confirm(`This looks like a duplicate of ${fmtB(possibleDupe.bilag)} — same date, amount, and description. Save it anyway?`))return;
    setSaving(true);
    try{
      // Remember what was used this time, so the next New Entry starts pre-filled
      // with the same accounts — most entries in a row tend to repeat a pattern.
      try{localStorage.setItem("rr_last_debit_code",form.debitCode);localStorage.setItem("rr_last_credit_code",form.creditCode);}catch{}
      const amount=parseFloat(form.amount);
      const lines=form.lines||[];
      const extraLines=lines.slice(1).filter(l=>l.debitCode&&l.creditCode&&parseFloat(l.amount)>0);
      // Multi-line entries share one groupRef so opening any line shows the whole entry
      const groupRef=extraLines.length>0?`grp-${Date.now()}`:null;
      const line0=lines[0]||{};
      const vc0=findVatCode(line0.debitVatCode,"input")||findVatCode(line0.creditVatCode,"output");
      // Save primary entry
      const primaryResult=await onSave({...form,amount,lines:undefined,groupRef,moneySourceId:form.moneySourceId||null,vatCode:(line0.debitVatCode&&line0.debitVatCode!=="0")?line0.debitVatCode:(line0.creditVatCode!=="0"?line0.creditVatCode:null),vatPct:vc0?vc0.rate:null});
      // A comment is extra context on top of the required description — saved
      // as an entry comment (same thread DetailModal shows later) instead of
      // a new column, so it's visible wherever comments already render.
      if(form.notes&&form.notes.trim()&&addEntryComment&&primaryResult&&primaryResult.id){
        addEntryComment(primaryResult.id,form.notes.trim());
      }
      // Save each extra line as its own entry, linked via groupRef
      for(const l of extraLines){
        const vc=findVatCode(l.debitVatCode,"input")||findVatCode(l.creditVatCode,"output");
        await onSave({
          date:l.date||form.date,
          debitCode:l.debitCode,
          creditCode:l.creditCode,
          description:l.description||form.description,
          amount:parseFloat(l.amount),
          contactId:form.contactId||null,
          sfFundId:form.sfFundId||null,
          groupRef,
          moneySourceId:form.moneySourceId||null,
          projectId:form.projectId||null,
          vatCode:(l.debitVatCode&&l.debitVatCode!=="0")?l.debitVatCode:(l.creditVatCode&&l.creditVatCode!=="0"?l.creditVatCode:null),
          vatPct:vc?vc.rate:null,
        });
      }
      setEntrySaved(true);setTimeout(()=>setEntrySaved(false),1800);
      if(form.sfFundId&&saveSinkingFunds){
        const updated=(sinkingFunds||[]).map(f=>f.id===form.sfFundId?{...f,saved:(f.saved||0)+amount}:f);
        saveSinkingFunds(updated);
      }
      setForm(emptyTxn);
    } finally {
      setSaving(false);
    }
  };

  const saveNewContact=()=>{
    if(!newContact.name.trim())return;
    const typeToUse=autoNeedContact?contactType:(newContact.type||"supplier");
    const prefix=typeToUse==="customer"?"C":"S";
    const existing=contacts.filter(c=>c.type===typeToUse);
    const nums=existing.map(c=>parseInt(c.id.slice(1))||0);
    const nextNum=(nums.length?Math.max(...nums):0)+1;
    const id=`${prefix}${String(nextNum).padStart(3,"0")}`;
    const c={id,type:typeToUse,name:newContact.name,notes:[newContact.phone,newContact.email,newContact.address,newContact.accountNo].filter(Boolean).join(" | ")};
    const updated=[...contacts,c];
    setContacts(updated);
    setForm(f=>({...f,contactId:id}));
    setNewContact({name:"",phone:"",email:"",address:"",accountNo:"",type:"supplier"});
    setShowAddContact(false);
  };

  const[calcExpr,setCalcExpr]=useState("");
  const[calcResult,setCalcResult]=useState(null);

  const handleAmountChange=(val)=>{
    setForm(p=>({...p,amount:val}));
    // Try evaluating expression
    if(/[+\-*/]/.test(val)){
      try{
        // eslint-disable-next-line no-new-func
        const result=Function(`"use strict";return(${val})`)();
        if(isFinite(result)&&result>0)setCalcResult(result);
        else setCalcResult(null);
      }catch{setCalcResult(null);}
    } else {setCalcResult(null);}
  };

  // Sinking fund detection
  const isSFAccount=(code)=>code&&code.startsWith("1009");
  const needSF=isSFAccount(form.debitCode)||isSFAccount(form.creditCode);

  // Load funds from prop
  const sfFunds=sinkingFunds||[];

  const saveInvoice=()=>{
    if(!invContactId||!invAccountCode||!parseFloat(invAmount)||saving)return;
    if(isDateClosed(form.date)){
      alert(`Period is closed up to ${getPeriodClose()}. This date cannot accept new entries.`);
      return;
    }
    setSaving(true);
    const contactCode=invIsCustomer?"1500":"2400";
    const allLines=[{accountCode:invAccountCode,amount:invAmount},...invExtraLines.filter(l=>l.accountCode&&parseFloat(l.amount))];
    const invTotal=allLines.reduce((s,l)=>s+parseFloat(l.amount||0),0);
    const hasPayment=!!invRegisterPayment&&Math.abs(invTotal)>0;
    const groupRef=(allLines.length+(hasPayment?1:0))>1?`grp-${Date.now()}`:null;
    allLines.forEach((l,idx)=>{
      const amt=parseFloat(l.amount);
      const isReverse=amt<0; // negative amount = kreditnote/kreditnota, reverses the normal debit/credit
      const absAmt=Math.abs(amt);
      let debitCode,creditCode;
      if(invIsCustomer){
        // Normal sale: Customer debit / Sales credit. Kreditnota: reversed.
        debitCode=isReverse?l.accountCode:contactCode;
        creditCode=isReverse?contactCode:l.accountCode;
      } else {
        // Normal purchase: Expense debit / Supplier credit. Kreditnote: reversed.
        debitCode=isReverse?contactCode:l.accountCode;
        creditCode=isReverse?l.accountCode:contactCode;
      }
      onSave({
        date:form.date,
        debitCode,creditCode,
        description:invDescription||`${invIsCustomer?"Sale":"Purchase"}${invoiceNo?" · "+invoiceNo:""}`,
        amount:absAmt,
        contactId:invContactId,
        invoiceNo:invoiceNo||null,
        dueDate:invDueDate||null,
        groupRef,
        attachmentIds:idx===0?invAttachmentIds:undefined,
      });
    });
    if(hasPayment){
      // Payment leg, settling the full invoice total on the same date —
      // purchase → Supplier debited / Bank or Cash credited.
      // sale → Bank or Cash debited / Customer credited.
      const debitCode=invIsCustomer?invRegisterPayment:contactCode;
      const creditCode=invIsCustomer?contactCode:invRegisterPayment;
      onSave({
        date:form.date,
        debitCode,creditCode,
        description:`Payment${invoiceNo?" · "+invoiceNo:""}`,
        amount:Math.abs(invTotal),
        contactId:invContactId,
        groupRef,
      });
    }
    setEntrySaved(true);setTimeout(()=>setEntrySaved(false),1800);
    resetInvoiceForm();
    setSaving(false);
  };

  const inpSm={...inp,fontSize:14,padding:"9px 12px"};

  return(
    <div style={{display:"flex",gap:20,alignItems:"flex-start",flexDirection:isDesktop?"row":"column"}}>
    <Card style={{flex:1,marginBottom:0,minWidth:0}}>
      {/* Bilag + Date — Entry type is its own row of buttons below, since it's
          the first real decision (what kind of entry this is), not something
          to bury in a dropdown. On mobile, a compact attachment icon sits
          right after Date instead of a permanent dashed drop-zone lower down
          — tapping it opens a small popover with the same upload/pick-file
          options, so attaching a receipt doesn't cost a full section of
          space it needs the rest of the time. */}
      {/* Desktop: a plain bordered "voucher details" panel — bilag number,
          date, and the entry-type switcher grouped as one labeled section,
          matching how other accounting software separates header fields
          from the postings table below, instead of a colored floating
          badge. Mobile keeps the compact accent badge + inline attach
          icon, which fits its single-line header better. */}
      {isDesktop?(
        <div style={{border:`1px solid ${T.border}`,borderRadius:10,marginBottom:16,overflow:"hidden"}}>
          <div style={{padding:"9px 14px",borderBottom:`1px solid ${T.border}`,background:T.bg,fontSize:12,fontWeight:700,color:T.sub}}>Voucher details</div>
          <div style={{display:"flex",gap:28,padding:"14px 14px",flexWrap:"wrap"}}>
            <div>
              <div style={{fontSize:10,color:T.muted,fontWeight:600,marginBottom:5,textTransform:"uppercase",letterSpacing:0.4}}>Bilag</div>
              <div style={{fontSize:13,fontWeight:700,color:T.text,padding:"9px 0"}}>{fmtB(nextBilag)}</div>
            </div>
            <div>
              <div style={{fontSize:10,color:T.muted,fontWeight:600,marginBottom:5,textTransform:"uppercase",letterSpacing:0.4}}>Date</div>
              <FlexDateInput value={form.date} onChange={v=>setForm(p=>({...p,date:v}))} style={{width:150}}/>
            </div>
            <div style={{flex:"0 0 auto"}}>
              <div style={{fontSize:10,color:T.muted,fontWeight:600,marginBottom:5,textTransform:"uppercase",letterSpacing:0.4}}>Entry type</div>
              <div style={{display:"flex",gap:8}}>
                {[["receipt","Receipt"],["supplier","Supplier Invoice"],["customer","Customer Sale"]].map(([val,label])=>(
                  <button key={val} onClick={()=>setEntryMode(val)} style={{background:entryMode===val?T.accent:"none",color:entryMode===val?"#fff":T.sub,border:`1px solid ${entryMode===val?T.accent:T.border}`,borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{label}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ):(
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <div style={{background:T.accentLight,borderRadius:8,padding:"4px 10px",flexShrink:0}}>
          <div style={{fontSize:9,color:T.muted,fontWeight:700,letterSpacing:0.5}}>BILAG</div>
          <div style={{fontSize:15,fontWeight:900,color:T.accent}}>{fmtB(nextBilag)}</div>
        </div>
        <FlexDateInput value={form.date} onChange={v=>setForm(p=>({...p,date:v}))} style={{width:isDesktop?150:0,flex:isDesktop?"none":1,minWidth:0}}/>
        {!isDesktop&&entryMode==="receipt"&&(
          <div style={{position:"relative",flexShrink:0}}>
            <button onClick={()=>setShowAttachPopover(s=>!s)} style={{width:40,height:40,borderRadius:10,border:`1px solid ${form.attachmentId?T.accent:T.border}`,background:form.attachmentId?T.accentLight:"#fff",color:T.accent,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit"}}>
              <i className="ti ti-paperclip" style={{fontSize:18}}/>
            </button>
            {form.attachmentId&&<div style={{position:"absolute",top:-3,right:-3,width:13,height:13,borderRadius:"50%",background:T.accent,border:"2px solid #fff"}}/>}
            {showAttachPopover&&(
              <>
                <div onClick={()=>setShowAttachPopover(false)} style={{position:"fixed",inset:0,zIndex:198}}/>
                <div style={{position:"absolute",right:0,top:46,zIndex:199,background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,boxShadow:"0 10px 30px rgba(20,40,50,0.15)",padding:12,width:230}}>
                  {form.attachmentId?(()=>{
                    const f=inboxFiles.find(x=>x.id===form.attachmentId);
                    return(
                      <div style={{display:"flex",alignItems:"center",gap:8,background:T.bg,border:`1px solid ${T.accent}`,borderRadius:9,padding:"7px 9px"}}>
                        <span style={{fontSize:12,fontWeight:600,color:T.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f?f.name:"Attachment"}</span>
                        <button onClick={()=>{setForm(p=>({...p,attachmentId:""}));setShowAttachPopover(false);}} style={{background:T.redLight,border:"none",borderRadius:6,cursor:"pointer",color:T.red,fontSize:10,padding:"4px 8px",fontWeight:700,fontFamily:"inherit"}}>Remove</button>
                      </div>
                    );
                  })():(<>
                    <label style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,border:`1.5px dashed ${T.border}`,borderRadius:9,padding:"14px 8px",cursor:uploadingReceipt?"wait":"pointer",background:T.bg}}>
                      <i className="ti ti-upload" style={{fontSize:17,color:T.accent}}/>
                      <span style={{fontSize:10.5,fontWeight:700,color:T.accent}}>{uploadingReceipt?"Uploading…":"Tap to upload"}</span>
                      <input type="file" accept="image/*,.pdf,.doc,.docx,.xlsx,.csv" disabled={uploadingReceipt} style={{display:"none"}} onChange={e=>{if(e.target.files[0]){uploadToInbox(e.target.files[0]);setShowAttachPopover(false);}}}/>
                    </label>
                    {inboxFiles.length>0&&(
                      <select value="" disabled={uploadingReceipt} onChange={e=>{if(e.target.value){setForm(p=>({...p,attachmentId:parseInt(e.target.value)}));setShowAttachPopover(false);}}} style={{...selSm,width:"100%",marginTop:8,fontSize:11}}>
                        <option value="">— or pick from Inbox —</option>
                        {inboxFiles.map(f=>(<option key={f.id} value={f.id}>{f.name}</option>))}
                      </select>
                    )}
                  </>)}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      )}
      {/* Mobile only — desktop's entry-type switcher now lives inside the
          Voucher details panel above, next to Bilag/Date. */}
      {!isDesktop&&(
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        {[["receipt","Receipt"],["supplier","Supplier Invoice"],["customer","Customer Sale"]].map(([val,label])=>(
          <button key={val} onClick={()=>setEntryMode(val)} style={{flex:1,padding:"9px 6px",borderRadius:9,border:`1.5px solid ${entryMode===val?T.accent:T.border}`,background:entryMode===val?T.accentLight:"#fff",color:entryMode===val?T.accent:T.sub,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{label}</button>
        ))}
      </div>
      )}

      {entryMode==="receipt"&&(
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <input placeholder="Comment (optional) — extra context for this entry" value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} style={{...inpSm}}/>
        {trackProjects&&(
          <select value={form.projectId||""} onChange={e=>{
            if(e.target.value==="__new__"){
              const name=prompt("New project or department name:");
              if(name&&name.trim()&&saveProjects){
                const nums=projects.map(p=>parseInt(p.number)||0);
                const number=String((nums.length?Math.max(...nums):0)+1).padStart(3,"0");
                const newProj={id:"proj_"+Date.now().toString(36),number,name:name.trim(),inactive:false};
                saveProjects([...projects,newProj]);
                setForm(p=>({...p,projectId:newProj.id}));
              }
              return;
            }
            setForm(p=>({...p,projectId:e.target.value}));
          }} style={{...inpSm}}>
            <option value="">— No project —</option>
            {projects.filter(p=>!p.inactive).map(p=><option key={p.id} value={p.id}>{p.number?p.number+" — ":""}{p.name}</option>)}
            {saveProjects&&<option value="__new__">+ New project / department…</option>}
          </select>
        )}

        {/* Desktop: one line = one horizontal row (date, description, debit,
            credit, amount together), scrolling sideways past the fold
            rather than wrapping. Mobile: the same fields stacked as two
            compact rows per line (date+description, then debit/credit/
            amount) with hairline dividers instead of boxed cells — no
            horizontal scroll, matches the rest of the app's density. */}
        {isDesktop?(
        <div style={{border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden"}}>
          <div style={{padding:"9px 14px",borderBottom:`1px solid ${T.border}`,background:T.bg,fontSize:12,fontWeight:700,color:T.sub}}>Postings</div>
          <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch",padding:"12px 14px 14px"}}>
          <div style={{display:"flex",gap:6,marginBottom:8,minWidth:626,paddingBottom:6,borderBottom:`1px solid ${T.border}`}}>
            <div style={{flex:"0 0 96px",fontSize:10,color:T.muted,fontWeight:700}}>Date</div>
            <div style={{flex:"0 0 150px",fontSize:10,color:T.muted,fontWeight:700}}>Description</div>
            <div style={{flex:"0 0 128px",fontSize:10,color:T.muted,fontWeight:700}}>Debit</div>
            <div style={{flex:"0 0 128px",fontSize:10,color:T.muted,fontWeight:700}}>Credit</div>
            <div style={{flex:"0 0 78px",fontSize:10,color:T.muted,fontWeight:700}}>Amount</div>
          </div>
          {(form.lines||[{debitCode:form.debitCode,creditCode:form.creditCode}]).map((line,li)=>(
            <div key={li} style={{display:"flex",gap:6,alignItems:"flex-start",marginBottom:6,minWidth:626}}>
              <div style={{flex:"0 0 96px",minWidth:0}}>
                <FlexDateInput value={li===0?form.date:(line.date||form.date)} onChange={v=>{
                  if(li===0){setForm(p=>({...p,date:v}));return;}
                  const lines=[...(form.lines||[{debitCode:form.debitCode,creditCode:form.creditCode}])];
                  lines[li]={...lines[li],date:v};
                  setForm(p=>({...p,lines}));
                }} style={{fontSize:11}}/>
              </div>
              <div style={{flex:"0 0 150px",minWidth:0}}>
                <input placeholder="Description" value={li===0?form.description:(line.description||"")} onChange={e=>{
                  if(li===0){setForm(p=>({...p,description:e.target.value}));return;}
                  const lines=[...(form.lines||[])];
                  lines[li]={...lines[li],description:e.target.value};
                  setForm(p=>({...p,lines}));
                }} style={{...inpSm,fontSize:11,padding:"7px 8px"}}/>
              </div>
              <div style={{flex:"0 0 128px",minWidth:0}}>
                <AccDrop value={line.debitCode||""} onChange={v=>{
                  const lines=[...(form.lines||[{debitCode:form.debitCode,creditCode:form.creditCode}])];
                  lines[li]={...lines[li],debitCode:v};
                  setForm(p=>({...p,lines,debitCode:li===0?v:p.debitCode,contactId:li===0?"":p.contactId}));
                }} accounts={accounts}/>
                <VatDrop value={line.debitVatCode||"0"} onChange={code=>{
                  const lines=[...(form.lines||[{debitCode:form.debitCode,creditCode:form.creditCode}])];
                  lines[li]={...lines[li],debitVatCode:code};
                  setForm(p=>({...p,lines}));
                }} options={vatCodeOptions("input")}/>
              </div>
              <div style={{flex:"0 0 128px",minWidth:0}}>
                <AccDrop value={line.creditCode||""} onChange={v=>{
                  const lines=[...(form.lines||[{debitCode:form.debitCode,creditCode:form.creditCode}])];
                  lines[li]={...lines[li],creditCode:v};
                  setForm(p=>({...p,lines,creditCode:li===0?v:p.creditCode,contactId:li===0?"":p.contactId}));
                }} accounts={accounts}/>
                <VatDrop value={line.creditVatCode||"0"} onChange={code=>{
                  const lines=[...(form.lines||[{debitCode:form.debitCode,creditCode:form.creditCode}])];
                  lines[li]={...lines[li],creditVatCode:code};
                  setForm(p=>({...p,lines}));
                }} options={vatCodeOptions("output")}/>
              </div>
              <div style={{flex:"0 0 78px",minWidth:0,display:"flex",gap:4,alignItems:"flex-start"}}>
                {li===0?(
                  <input placeholder="0" value={form.amount} onChange={e=>handleAmountChange(e.target.value)} style={{...inpSm,fontSize:11,padding:"7px 8px",flex:1,minWidth:0}}/>
                ):(
                  <input type="number" placeholder="0" value={line.amount||""} onChange={e=>{
                    const lines=[...(form.lines||[])];
                    lines[li]={...lines[li],amount:e.target.value};
                    setForm(p=>({...p,lines}));
                  }} style={{...inpSm,fontSize:11,padding:"7px 8px",flex:1,minWidth:0}}/>
                )}
                {li>0&&(
                  <button onClick={()=>{
                    const lines=[...(form.lines||[])];
                    lines.splice(li,1);
                    setForm(p=>({...p,lines}));
                  }} style={{flexShrink:0,background:T.redLight,border:"none",borderRadius:6,color:T.red,fontSize:14,fontWeight:900,cursor:"pointer",width:24,height:32,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>−</button>
                )}
              </div>
            </div>
          ))}
          </div>
          {/* Running totals — since each line's single Amount posts to both
              its debit and credit side, Debit and Credit always match; shown
              anyway (same convention as a real double-entry voucher screen)
              so the balance is visibly confirmed before saving. */}
          {(()=>{
            const lines=form.lines||[{debitCode:form.debitCode,creditCode:form.creditCode}];
            const total=lines.reduce((s,l,li)=>s+(parseFloat(li===0?form.amount:l.amount)||0),0);
            return(
              <div style={{display:"flex",gap:6,padding:"9px 14px",borderTop:`1px solid ${T.border}`,background:T.bg,minWidth:626}}>
                <div style={{flex:"0 0 96px"}}/>
                <div style={{flex:"0 0 150px"}}/>
                <div style={{flex:"0 0 128px",fontSize:12,fontWeight:700,color:T.text}}>{fmt(total)}</div>
                <div style={{flex:"0 0 128px",fontSize:12,fontWeight:700,color:T.text}}>{fmt(total)}</div>
                <div style={{flex:"0 0 78px",fontSize:11,color:T.muted}}>Balanced</div>
              </div>
            );
          })()}
        </div>
        ):(
        <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
          {(form.lines||[{debitCode:form.debitCode,creditCode:form.creditCode}]).map((line,li)=>(
            <div key={li} style={{borderTop:li===0?"none":`1px solid #F0F4F3`}}>
              <div style={{display:"flex",gap:12,padding:"8px 12px",alignItems:"center"}}>
                <div style={{width:76,flexShrink:0}}>
                  <FlexDateInput value={li===0?form.date:(line.date||form.date)} onChange={v=>{
                    if(li===0){setForm(p=>({...p,date:v}));return;}
                    const lines=[...(form.lines||[{debitCode:form.debitCode,creditCode:form.creditCode}])];
                    lines[li]={...lines[li],date:v};
                    setForm(p=>({...p,lines}));
                  }} style={{fontSize:11}}/>
                </div>
                <input placeholder="Description" value={li===0?form.description:(line.description||"")} onChange={e=>{
                  if(li===0){setForm(p=>({...p,description:e.target.value}));return;}
                  const lines=[...(form.lines||[])];
                  lines[li]={...lines[li],description:e.target.value};
                  setForm(p=>({...p,lines}));
                }} style={{...inpSm,fontSize:12,padding:"7px 8px",flex:1,minWidth:0}}/>
                {li>0&&(
                  <button onClick={()=>{
                    const lines=[...(form.lines||[])];
                    lines.splice(li,1);
                    setForm(p=>({...p,lines}));
                  }} style={{flexShrink:0,background:T.redLight,border:"none",borderRadius:6,color:T.red,fontSize:14,fontWeight:900,cursor:"pointer",width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>−</button>
                )}
              </div>
              <div style={{display:"flex",gap:8,padding:"0 12px 9px",alignItems:"flex-start"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:8,color:T.red,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Dr</div>
                  <AccDrop value={line.debitCode||""} onChange={v=>{
                    const lines=[...(form.lines||[{debitCode:form.debitCode,creditCode:form.creditCode}])];
                    lines[li]={...lines[li],debitCode:v};
                    setForm(p=>({...p,lines,debitCode:li===0?v:p.debitCode,contactId:li===0?"":p.contactId}));
                  }} accounts={accounts}/>
                  <VatDrop value={line.debitVatCode||"0"} onChange={code=>{
                    const lines=[...(form.lines||[{debitCode:form.debitCode,creditCode:form.creditCode}])];
                    lines[li]={...lines[li],debitVatCode:code};
                    setForm(p=>({...p,lines}));
                  }} options={vatCodeOptions("input")}/>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:8,color:T.green,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Cr</div>
                  <AccDrop value={line.creditCode||""} onChange={v=>{
                    const lines=[...(form.lines||[{debitCode:form.debitCode,creditCode:form.creditCode}])];
                    lines[li]={...lines[li],creditCode:v};
                    setForm(p=>({...p,lines,creditCode:li===0?v:p.creditCode,contactId:li===0?"":p.contactId}));
                  }} accounts={accounts}/>
                  <VatDrop value={line.creditVatCode||"0"} onChange={code=>{
                    const lines=[...(form.lines||[{debitCode:form.debitCode,creditCode:form.creditCode}])];
                    lines[li]={...lines[li],creditVatCode:code};
                    setForm(p=>({...p,lines}));
                  }} options={vatCodeOptions("output")}/>
                </div>
                <div style={{width:80,flexShrink:0}}>
                  <div style={{fontSize:8,color:T.muted,fontWeight:700,textTransform:"uppercase",marginBottom:2,textAlign:"right"}}>Amount</div>
                  {li===0?(
                    <input placeholder="0" value={form.amount} onChange={e=>handleAmountChange(e.target.value)} style={{...inpSm,fontSize:13,fontWeight:700,padding:"7px 8px",width:"100%",textAlign:"right"}}/>
                  ):(
                    <input type="number" placeholder="0" value={line.amount||""} onChange={e=>{
                      const lines=[...(form.lines||[])];
                      lines[li]={...lines[li],amount:e.target.value};
                      setForm(p=>({...p,lines}));
                    }} style={{...inpSm,fontSize:13,fontWeight:700,padding:"7px 8px",width:"100%",textAlign:"right"}}/>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
        <div>
          {calcResult&&(
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <span style={{fontSize:11,color:T.muted}}>= {fmt(calcResult)}</span>
              <button onClick={()=>{setForm(p=>({...p,amount:String(calcResult)}));setCalcResult(null);}} style={{fontSize:10,background:T.accentLight,color:T.accent,border:"none",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontWeight:700,fontFamily:"inherit"}}>Use this</button>
            </div>
          )}
          {/* Add line */}
          <button onClick={()=>{
            const lines=[...(form.lines||[{debitCode:form.debitCode,creditCode:form.creditCode}]),{debitCode:"",creditCode:"",amount:""}];
            setForm(p=>({...p,lines}));
          }} style={{fontSize:11,color:T.accent,background:T.accentLight,border:"none",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>+ Add line</button>
        </div>

        {/* Sinking fund picker — when 1009x account selected */}
        {needSF&&(
          <div style={{background:T.accentLight,border:`1.5px solid ${T.accent}`,borderRadius:12,padding:"12px 14px"}}>
            <div style={{fontSize:10,color:T.accent,fontWeight:800,textTransform:"uppercase",letterSpacing:0.8,marginBottom:8}}>{isDesktop?"Sinking Fund Target":"🎯 Sinking Fund Target"}</div>
            <select value={form.sfFundId||""} onChange={e=>setForm(p=>({...p,sfFundId:e.target.value}))} style={{...selSm,width:"100%",marginBottom:form.sfFundId?"8px":"0"}}>
              <option value="">— Select a fund —</option>
              {sfFunds.map(f=>(
                <option key={f.id} value={f.id}>{f.icon} {f.name} · saved {fmt(f.saved||0)} of {fmt(f.goal||0)}</option>
              ))}
            </select>
            {!sfFunds.length&&<div style={{fontSize:11,color:T.muted,marginTop:4}}>No funds yet. Create one in Sinking Funds first.</div>}
            {form.sfFundId&&sfFunds.find(f=>f.id===form.sfFundId)&&(()=>{
              const f=sfFunds.find(x=>x.id===form.sfFundId);
              const pct=Math.min(100,Math.round(((f.saved||0)/(f.goal||1))*100));
              return(
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:11,color:T.sub}}>{f.icon} {f.name}</span>
                    <span style={{fontSize:11,fontWeight:700,color:T.accent}}>{pct}%</span>
                  </div>
                  <div style={{background:"rgba(255,255,255,0.5)",borderRadius:4,height:5,overflow:"hidden"}}>
                    <div style={{width:`${pct}%`,height:"100%",background:f.color||T.accent,borderRadius:4}}/>
                  </div>
                  <div style={{fontSize:10,color:T.muted,marginTop:4}}>This amount will be added to the fund on save</div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Smart contact selector — only when 1500 or 2400 */}
        {needContact&&(
          <div>
            <div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:3,textTransform:"uppercase",letterSpacing:0.5}}>
              {isDesktop
                ?(reskontroMode?"Reskontro — All Contacts":autoNeedContact?(contactType==="customer"?"Customer (AR · 1500)":"Supplier (AP · 2400)"):"Contact (optional)")
                :(reskontroMode?"👥 Reskontro — All Contacts":autoNeedContact?(contactType==="customer"?"👤 Customer (AR · 1500)":"👤 Supplier (AP · 2400)"):"👥 Contact (optional)")}
            </div>
            <div style={{display:"flex",gap:6}}>
              <div style={{flex:1,position:"relative"}}>
                {(()=>{if(form.contactId){const selC=contacts.find(c=>c.id===form.contactId);const isCust=(selC?selC.type:undefined)==="customer";return(
                  <div style={{background:isCust?T.blueBg:T.redLight,border:`1px solid ${isCust?T.blue:T.red}`,borderRadius:10,padding:"8px 12px",display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:9,fontWeight:800,color:isCust?T.blue:T.red,background:"#fff",padding:"1px 6px",borderRadius:4}}>{isCust?"AR":"AP"}</span>
                    <span style={{fontSize:12,fontWeight:700,flex:1,color:isCust?T.blue:T.red}}>{(selC?selC.name:undefined)||form.contactId}</span>
                    <span style={{fontSize:10,color:T.muted}}>{form.contactId}</span>
                    <button onClick={()=>setForm(p=>({...p,contactId:""}))} style={{background:"none",border:"none",cursor:"pointer",color:T.muted,fontSize:13,padding:"0 2px"}}>✕</button>
                  </div>
                );}return(<ContactSearchInline contacts={filteredContacts} value={form.contactId} onChange={v=>setForm(p=>({...p,contactId:v}))} type={reskontroMode?"all":contactMode}/>);})()}
              </div>
              <button onClick={()=>setShowAddContact(s=>!s)} style={{background:showAddContact?T.redLight:T.blueBg,color:showAddContact?T.red:T.blue,border:"none",borderRadius:8,padding:"0 10px",fontWeight:700,fontSize:11,cursor:"pointer",flexShrink:0,fontFamily:"inherit"}}>+ Add</button>
            </div>

            {/* Add new contact inline */}
            {showAddContact&&(
              <div style={{background:T.bg,borderRadius:10,padding:"10px 12px",marginTop:6,border:`1px solid ${T.border}`}}>
                <div style={{fontSize:10,fontWeight:800,color:T.blue,marginBottom:8,textTransform:"uppercase",letterSpacing:0.5}}>New {autoNeedContact?contactType:"contact"}</div>
                {!autoNeedContact&&(
                  <div style={{display:"flex",gap:6,marginBottom:6}}>
                    {["supplier","customer"].map(t=>(
                      <button key={t} onClick={()=>setNewContact(p=>({...p,type:t}))} style={{flex:1,background:newContact.type===t?(t==="customer"?T.blueBg:T.redLight):T.bg,color:newContact.type===t?(t==="customer"?T.blue:T.red):T.sub,border:`1px solid ${newContact.type===t?(t==="customer"?T.blue:T.red):T.border}`,borderRadius:8,padding:"6px 8px",fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"inherit",textTransform:"capitalize"}}>{t}</button>
                    ))}
                  </div>
                )}
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  <input placeholder="Name *" value={newContact.name} onChange={e=>setNewContact(p=>({...p,name:e.target.value}))} style={{...inp,fontSize:13,padding:"8px 10px"}}/>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                    <input placeholder="Phone (opt)" value={newContact.phone} onChange={e=>setNewContact(p=>({...p,phone:e.target.value}))} style={{...inp,fontSize:12,padding:"7px 10px"}}/>
                    <input placeholder="Email (opt)" value={newContact.email} onChange={e=>setNewContact(p=>({...p,email:e.target.value}))} style={{...inp,fontSize:12,padding:"7px 10px"}}/>
                  </div>
                  <input placeholder="Account No (opt)" value={newContact.accountNo} onChange={e=>setNewContact(p=>({...p,accountNo:e.target.value}))} style={{...inp,fontSize:12,padding:"7px 10px"}}/>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={saveNewContact} style={{background:T.blue,color:"#fff",border:"none",borderRadius:8,padding:"8px 14px",fontWeight:700,fontSize:12,cursor:"pointer",flex:1,fontFamily:"inherit"}}>Save</button>
                    <button onClick={()=>setShowAddContact(false)} style={{background:T.bg,color:T.sub,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 14px",fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {feat.tags!==false&&<input placeholder="Tags (optional): rent, office, client-a" value={form.tags||""} onChange={e=>setForm(p=>({...p,tags:e.target.value}))} style={{...inpSm,fontSize:13}}/>}
        {moneySources&&moneySources.length>0&&(isDesktop?(
          <div>
            <div style={{fontSize:10,color:T.muted,fontWeight:600,marginBottom:5,textTransform:"uppercase",letterSpacing:0.4}}>Whose</div>
            <select value={form.moneySourceId||""} onChange={e=>setForm(p=>({...p,moneySourceId:e.target.value||""}))} style={{...selSm,width:"100%"}}>
              <option value="">— Select source (optional) —</option>
              {moneySources.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        ):(
          <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:12,padding:"10px 12px"}}>
            <div style={{fontSize:10,color:T.muted,fontWeight:800,textTransform:"uppercase",letterSpacing:0.8,marginBottom:6}}>👥 Whose</div>
            <select value={form.moneySourceId||""} onChange={e=>setForm(p=>({...p,moneySourceId:e.target.value||""}))} style={{...selSm,width:"100%"}}>
              <option value="">— Select source (optional) —</option>
              {moneySources.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        ))}
        {/* Desktop: a normal-sized, left-aligned primary button — matching
            how a save/create action sits in the rest of the desktop app's
            forms, instead of a full-width mobile "tap target" button. */}
        <button disabled={!valid||saving} style={isDesktop?{background:entrySaved?"#059669":T.accent,color:"#fff",border:"none",borderRadius:8,padding:"10px 22px",fontSize:13,fontWeight:700,cursor:valid&&!saving?"pointer":"default",opacity:valid&&!saving?1:0.5,alignSelf:"flex-start",fontFamily:"inherit",transition:"background 0.2s"}:{...btnRed,opacity:valid&&!saving?1:0.5,marginTop:4,background:entrySaved?"#059669":T.accent,transition:"background 0.2s",cursor:valid&&!saving?"pointer":"default"}} onClick={save}>{entrySaved?"✓ Saved!":saving?"Saving…":"Save Entry"}</button>
      </div>
      )}

      {entryMode!=="receipt"&&(()=>{
        const contactList=contacts.filter(c=>c.type===(invIsCustomer?"customer":"supplier")&&!c.inactive);
        const filteredAccounts=accounts; // show the full chart of accounts (all series, incl. 2xxx) so any account can be picked as the offsetting line
        const bankAccounts=accounts.filter(a=>getSK(a.code)==="1900");
        const invValid=invContactId&&invAccountCode&&parseFloat(invAmount);
        return(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {/* Supplier/Customer selector */}
            <div>
              <div style={{fontSize:9,fontWeight:800,color:invIsCustomer?T.blue:T.red,marginBottom:3,textTransform:"uppercase"}}>{isDesktop?(invIsCustomer?"Customer":"Supplier"):(invIsCustomer?"👤 Customer":"👤 Supplier")}</div>
              {invContactId?(()=>{const c=contactList.find(x=>x.id===invContactId)||contacts.find(x=>x.id===invContactId);return(
                <div style={{background:invIsCustomer?T.blueBg:T.redLight,border:`1px solid ${invIsCustomer?T.blue:T.red}`,borderRadius:10,padding:"8px 12px",display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:12,fontWeight:700,flex:1,color:invIsCustomer?T.blue:T.red}}>{c?c.name:invContactId}</span>
                  <span style={{fontSize:10,color:T.muted}}>{invContactId}</span>
                  <button onClick={()=>setInvContactId("")} style={{background:"none",border:"none",cursor:"pointer",color:T.muted,fontSize:13,padding:"0 2px"}}>✕</button>
                </div>
              );})():(
                <ContactSearchInline contacts={contactList} value={invContactId} onChange={setInvContactId} type={invIsCustomer?"customer":"supplier"}/>
              )}
            </div>

            {/* Invoice No + Due date — compact, no Amount here (amount now lives with the account line below) */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div>
                <div style={{fontSize:9,color:T.muted,fontWeight:700,marginBottom:3,textTransform:"uppercase"}}>Invoice No</div>
                <input placeholder="e.g. INV-1042" value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)} style={{...inpSm,fontSize:12,padding:"7px 10px"}}/>
              </div>
              <div>
                <div style={{fontSize:9,color:T.muted,fontWeight:700,marginBottom:3,textTransform:"uppercase"}}>Due date</div>
                <input type="date" value={invDueDate} onChange={e=>setInvDueDate(e.target.value)} style={{...inpSm,fontSize:12,padding:"7px 10px"}}/>
              </div>
            </div>

            {/* Account (70%) + Amount (30%) — same row, no separate date/description per line */}
            <div style={{display:"flex",gap:8}}>
              <div style={{flex:7}}>
                <div style={{fontSize:9,color:invIsCustomer?T.green:T.red,fontWeight:700,marginBottom:3,textTransform:"uppercase"}}>{invIsCustomer?"Sales Account":"Expense Account"}</div>
                <AccDrop value={invAccountCode} onChange={setInvAccountCode} accounts={filteredAccounts}/>
              </div>
              <div style={{flex:3}}>
                <div style={{fontSize:9,color:T.muted,fontWeight:700,marginBottom:3,textTransform:"uppercase"}}>Amount{invAmount&&parseFloat(invAmount)<0?" (cr.note)":""}</div>
                <input placeholder="0" type="number" value={invAmount} onChange={e=>setInvAmount(e.target.value)} style={{...inpSm,fontSize:12,padding:"7px 8px"}}/>
              </div>
            </div>
            <input placeholder="Description" value={invDescription} onChange={e=>setInvDescription(e.target.value)} style={{...inpSm,fontSize:12,padding:"7px 10px"}}/>

            {/* Additional lines — account (70%) + amount (30%) only, no date/description per line */}
            {invExtraLines.map((l,li)=>(
              <div key={li} style={{display:"flex",gap:6,alignItems:"flex-end",background:T.bg,border:`1px solid ${T.border}`,borderRadius:10,padding:"8px 10px"}}>
                <div style={{flex:7}}>
                  <div style={{fontSize:8,color:T.muted,fontWeight:700,marginBottom:2,textTransform:"uppercase"}}>Account</div>
                  <AccDrop value={l.accountCode} onChange={v=>setInvExtraLines(p=>p.map((x,i)=>i===li?{...x,accountCode:v}:x))} accounts={filteredAccounts}/>
                </div>
                <div style={{flex:3}}>
                  <div style={{fontSize:8,color:T.muted,fontWeight:700,marginBottom:2,textTransform:"uppercase"}}>Amount</div>
                  <input type="number" placeholder="0" value={l.amount} onChange={e=>setInvExtraLines(p=>p.map((x,i)=>i===li?{...x,amount:e.target.value}:x))} style={{...inpSm,fontSize:12,padding:"7px 8px"}}/>
                </div>
                <button onClick={()=>setInvExtraLines(p=>p.filter((_,i)=>i!==li))} style={{background:T.redLight,color:T.red,border:"none",borderRadius:8,width:30,height:34,cursor:"pointer",fontWeight:800,flexShrink:0}}>−</button>
              </div>
            ))}
            <button onClick={()=>setInvExtraLines(p=>[...p,{accountCode:"",amount:""}])} style={{...btnGhost,padding:"7px",fontSize:11,color:T.accent,borderColor:T.accent}}>+ Add Line</button>

            {/* Running Debit / Credit / Difference — debit is what's entered across the
                cost-account line(s) above; credit is the same total, since that's exactly
                what's now payable to the supplier. Shown here purely as a running-total
                confirmation before posting. */}
            {(()=>{
              const invTotal=[invAmount,...invExtraLines.map(l=>l.amount)].reduce((s,a)=>s+(parseFloat(a)||0),0);
              return(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,background:T.bg,border:`1px solid ${T.border}`,borderRadius:10,padding:"8px 10px"}}>
                  <div>
                    <div style={{fontSize:8,color:T.muted,fontWeight:700,textTransform:"uppercase"}}>Debit</div>
                    <div style={{fontSize:12,fontWeight:700,color:T.text}}>{fmt(Math.abs(invTotal))}</div>
                  </div>
                  <div>
                    <div style={{fontSize:8,color:T.muted,fontWeight:700,textTransform:"uppercase"}}>Credit ({invIsCustomer?"AR":"AP"})</div>
                    <div style={{fontSize:12,fontWeight:700,color:T.text}}>{fmt(Math.abs(invTotal))}</div>
                  </div>
                  <div>
                    <div style={{fontSize:8,color:T.muted,fontWeight:700,textTransform:"uppercase"}}>Difference</div>
                    <div style={{fontSize:12,fontWeight:700,color:T.green}}>{fmt(0)}</div>
                  </div>
                </div>
              );
            })()}

            {/* Payment — a single clean dropdown. Nothing selected → posts as a
                plain open item to Accounts Payable/Receivable. Pick Cash or a
                bank → settles the full amount immediately against that account,
                same date as the invoice. */}
            <div>
              <div style={{fontSize:9,color:T.muted,fontWeight:700,marginBottom:3,textTransform:"uppercase"}}>Register Payment</div>
              <select value={invRegisterPayment} onChange={e=>setInvRegisterPayment(e.target.value)} style={{...selSm,width:"100%",fontSize:12,padding:"8px 10px"}}>
                <option value="">No payment — keep as open item ({invIsCustomer?"Accounts Receivable":"Accounts Payable"})</option>
                {accounts.filter(a=>a.code==="1001").map(a=><option key={a.code} value={a.code}>{isDesktop?"":"💵 "}{a.name}</option>)}
                {bankAccounts.map(a=><option key={a.code} value={a.code}>{isDesktop?"":"🏦 "}{a.code} {a.name}</option>)}
              </select>
              {invRegisterPayment&&(
                <div style={{fontSize:10,color:T.muted,marginTop:5}}>{invIsCustomer?"Records a receipt: selected account debited, Customer credited.":"Records a payment: Supplier debited, selected account credited."} Same date as the invoice, full amount.</div>
              )}
            </div>

            {feat.tags!==false&&<input placeholder="Tags (optional): rent, office, client-a" value={form.tags||""} onChange={e=>setForm(p=>({...p,tags:e.target.value}))} style={{...inpSm,fontSize:13}}/>}
            <button disabled={!invValid||saving} style={{...btnRed,opacity:invValid&&!saving?1:0.5,marginTop:4,background:entrySaved?"#059669":T.accent,transition:"background 0.2s",cursor:invValid&&!saving?"pointer":"default"}} onClick={saveInvoice}>{entrySaved?"✓ Saved!":saving?"Saving…":`Save ${invIsCustomer?"Sale":"Purchase"}`}</button>
          </div>
        );
      })()}
    </Card>

    <div style={isDesktop?{width:320,flexShrink:0,position:"sticky",top:16}:{width:"100%"}}>
      {/* Mobile only — desktop gets the richer live-preview panel below
          instead, which now includes this same upload/pick-file capability
          in its own empty state, so the two don't duplicate each other.
          Receipt mode's attachment now lives in the popover next to Date
          above, so this card only handles Supplier/Customer mode. */}
      {!isDesktop&&entryMode!=="receipt"&&(
      <Card style={{marginBottom:0}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
          <span style={{fontSize:12}}>📎</span>
          <div style={{fontSize:10,color:T.muted,fontWeight:700,flex:1,textTransform:"uppercase",letterSpacing:0.5}}>{invAttachmentIds.length?`${invAttachmentIds.length} file${invAttachmentIds.length>1?"s":""} attached`:"Attachment (optional)"}</div>
        </div>
        {invAttachmentIds.length>0&&(
          <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:8}}>
            {invAttachmentIds.map(fid=>{
              const f=inboxFiles.find(x=>x.id===fid);
              return(
                <div key={fid} style={{display:"flex",alignItems:"center",gap:8,background:T.bg,border:`1px solid ${T.accent}`,borderRadius:8,padding:"6px 8px"}}>
                  <div style={{width:26,height:26,borderRadius:6,background:T.accentLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}>{(f&&f.type&&f.type.startsWith("image"))?"🖼️":(f&&f.type&&f.type.includes("pdf"))?"📕":"📄"}</div>
                  <span style={{fontSize:11,fontWeight:600,color:T.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f?f.name:"Attachment"}</span>
                  <button onClick={()=>setInvAttachmentIds(p=>p.filter(x=>x!==fid))} style={{background:T.redLight,border:"none",borderRadius:6,cursor:"pointer",color:T.red,fontSize:10,fontWeight:700,padding:"3px 7px",fontFamily:"inherit"}}>Remove</button>
                </div>
              );
            })}
          </div>
        )}
        <label style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,border:`1.5px dashed ${T.border}`,borderRadius:8,padding:"20px 9px",cursor:uploadingInvAtt?"wait":"pointer",background:T.bg}}>
          <span style={{fontSize:22}}>{uploadingInvAtt?"⏳":"📎"}</span>
          <span style={{fontSize:11,fontWeight:700,color:T.accent}}>{uploadingInvAtt?"Uploading…":"Tap to upload a file"}</span>
          <input type="file" accept="image/*,.pdf,.doc,.docx,.xlsx,.csv" disabled={uploadingInvAtt} style={{display:"none"}} onChange={async e=>{
            if(!e.target.files[0])return;
            setUploadingInvAtt(true);
            const newFile=await uploadInboxFile(e.target.files[0]);
            if(newFile){setInvAttachmentIds(p=>[...p,newFile.id]);setInvAttOpen(true);}
            setUploadingInvAtt(false);
          }}/>
        </label>
        {inboxFiles.filter(f=>!invAttachmentIds.includes(f.id)).length>0&&(
          <select value="" onChange={e=>{if(e.target.value){setInvAttachmentIds(p=>[...p,parseInt(e.target.value)]);setInvAttOpen(true);}}} style={{...selSm,width:"100%",fontSize:11,padding:"7px 8px",marginTop:8}}>
            <option value="">— or pick an existing Inbox file —</option>
            {inboxFiles.filter(f=>!invAttachmentIds.includes(f.id)).map(f=>(<option key={f.id} value={f.id}>{f.name}</option>))}
          </select>
        )}
      </Card>
      )}
      {isDesktop&&(()=>{
        const attached=form.attachmentId?inboxFiles.find(f=>f.id===form.attachmentId):null;
        if(!showEntryPreview)return(
          <div onClick={()=>setShowEntryPreview(true)} title="Show preview" style={{position:"fixed",right:0,top:"50%",transform:"translateY(-50%)",writingMode:"vertical-rl",background:"#EEF2FF",color:"#4F46E5",fontSize:11,fontWeight:700,padding:"14px 6px",borderRadius:"8px 0 0 8px",cursor:"pointer",display:"flex",alignItems:"center",gap:6,zIndex:60,boxShadow:"-2px 0 8px rgba(0,0,0,0.08)"}}>
            <i className="ti ti-chevron-left" style={{fontSize:12,transform:"rotate(90deg)"}}/>Show preview
          </div>
        );
        return(
          <div style={{width:400,flexShrink:0,position:"sticky",top:16,border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden",height:520,background:"#fff"}}>
            {!attached?(
              <div style={{height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:T.muted,gap:10,padding:24,textAlign:"center"}}>
                <i className="ti ti-file-off" style={{fontSize:28}}/>
                <div style={{fontSize:12}}>No document attached to this entry yet.</div>
                <label style={{display:"flex",alignItems:"center",gap:6,border:`1.5px dashed ${T.border}`,borderRadius:10,padding:"10px 16px",cursor:uploadingReceipt?"wait":"pointer",background:T.bg,marginTop:6}}>
                  <i className="ti ti-upload" style={{fontSize:14,color:T.accent}}/>
                  <span style={{fontSize:11,fontWeight:700,color:T.accent}}>{uploadingReceipt?"Uploading…":"Upload a file"}</span>
                  <input type="file" accept="image/*,.pdf,.doc,.docx,.xlsx,.csv" disabled={uploadingReceipt} style={{display:"none"}} onChange={e=>{if(e.target.files[0])uploadToInbox(e.target.files[0]);}}/>
                </label>
                {inboxFiles.length>0&&(
                  <select value="" disabled={uploadingReceipt} onChange={e=>{if(e.target.value)setForm(p=>({...p,attachmentId:parseInt(e.target.value)}));}} style={{...selSm,width:"100%",marginTop:2}}>
                    <option value="">— or pick an existing Inbox file —</option>
                    {inboxFiles.map(f=>(<option key={f.id} value={f.id}>{f.name}</option>))}
                  </select>
                )}
              </div>
            ):(
              <>
                <div style={{padding:"8px 12px",background:T.bg,borderBottom:`1px solid ${T.border}`,fontSize:11,fontWeight:700,color:T.sub,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{attached.name}</div>
                <div style={{height:"calc(100% - 33px)"}}>
                  <SignedFileViewer storagePath={attached.storagePath} type={attached.type} name={attached.name} style={{width:"100%",height:"100%"}}/>
                </div>
              </>
            )}
            <div onClick={()=>setShowEntryPreview(false)} title="Hide preview" style={{position:"absolute",left:-1,top:16,transform:"translateX(-100%)",background:"#EEF2FF",color:"#4F46E5",fontSize:11,fontWeight:700,padding:"14px 6px",borderRadius:"8px 0 0 8px",cursor:"pointer",writingMode:"vertical-rl",display:"flex",alignItems:"center",gap:6}}>
              <i className="ti ti-chevron-right" style={{fontSize:12,transform:"rotate(90deg)"}}/>Hide preview
            </div>
          </div>
        );
      })()}
    </div>
    </div>
  );
}

// ─── Sinking Funds ────────────────────────────────────────────────────────────

const INIT_SF=[
  {id:"SF001",name:"Emergency Fund",goal:500000,saved:180000,color:"#00875A",icon:"🛡️",months:12},
  {id:"SF002",name:"Car Purchase",goal:1200000,saved:340000,color:"#0057B8",icon:"🚗",months:36},
  {id:"SF003",name:"Vacation",goal:150000,saved:62000,color:"#7C3AED",icon:"✈️",months:6},
];

function SinkingFundsScreen({onBack,sinkingFunds,saveSinkingFunds,transactions=[],filterFrom,filterTo,isDesktop=false}){
  // No local funds state — always use parent sinkingFunds directly to avoid sync bugs
  const funds=sinkingFunds||[];
  const[showForm,setShowForm]=useState(false);
  const[editId,setEditId]=useState(null);
  const[form,setForm]=useState({name:"",goal:"",saved:"",icon:"🎯",color:"#0057B8",months:""});
  const[menuOpen,setMenuOpen]=useState(false);
  const[cardMenu,setCardMenu]=useState(null);

  const activeFunds=funds.filter(f=>!f.inactive);
  const totalGoal=activeFunds.reduce((s,f)=>s+(f.goal||0),0);
  const totalSaved=activeFunds.reduce((s,f)=>s+(f.saved||0),0);
  const overallPct=totalGoal>0?Math.min(Math.round((totalSaved/totalGoal)*100),100):0;

  // Detect leftover damage from a fixed bug where a new fund's id could
  // collide with an existing one after a fund was deleted — two funds
  // sharing an id would make lookups (sweeps, edits, deletes) ambiguous.
  const duplicateIdFunds=useMemo(()=>{
    const counts={};
    funds.forEach(f=>{counts[f.id]=(counts[f.id]||0)+1;});
    return funds.filter(f=>counts[f.id]>1);
  },[funds]);
  const fixDuplicateIds=()=>{
    const seen=new Set();
    let maxNum=funds.reduce((max,f)=>{const m=/^SF(\d+)$/.exec(f.id);return m?Math.max(max,parseInt(m[1],10)):max;},0);
    const fixed=funds.map(f=>{
      if(!seen.has(f.id)){seen.add(f.id);return f;}
      maxNum+=1;
      return{...f,id:"SF"+String(maxNum).padStart(3,"0")};
    });
    saveSinkingFunds(fixed);
  };

  // Monthly contribution = sum of all monthly required amounts
  const totalMonthly=activeFunds.reduce((s,f)=>{
    if(!f.months||f.months<=0)return s;
    return s+Math.ceil((f.goal-f.saved)/f.months);
  },0);

  // Monthly income from transactions
  const now=new Date();
  const curFrom=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`;
  const curTo=filterTo||now.toISOString().slice(0,10);
  const monthIncome=useMemo(()=>
    transactions.filter(t=>t.date>=curFrom&&t.date<=curTo&&!t.reversedBy&&!t.reversalOf&&isIncomeSK(t.creditCode)).reduce((s,t)=>s+t.amount,0),
  [transactions,curFrom,curTo]);

  // Last month saved — look at sinking fund transactions from last month
  const lastMonthFrom=new Date(now.getFullYear(),now.getMonth()-1,1).toISOString().slice(0,10);
  const lastMonthTo=new Date(now.getFullYear(),now.getMonth(),0).toISOString().slice(0,10);
  const lastMonthSaved=useMemo(()=>
    transactions.filter(t=>t.date>=lastMonthFrom&&t.date<=lastMonthTo&&(t.debitCode&&t.debitCode.startsWith("1009"))).reduce((s,t)=>s+t.amount,0),
  [transactions,lastMonthFrom,lastMonthTo]);

  // Risk level per fund
  const getRisk=(f)=>{
    if(!f.months||f.months<=0)return{label:"No timeline",color:"#888",bg:"#f3f4f6"};
    const needed=Math.ceil((f.goal-f.saved)/f.months);
    const pct=f.goal>0?(f.saved/f.goal)*100:0;
    const timeRatio=pct/(100/f.months); // how much saved vs how much time passed
    if(pct>=100)return{label:"Complete",color:"#00875A",bg:"#eaf3de"};
    if(needed<=totalMonthly*0.3)return{label:"On track",color:"#3b6d11",bg:"#eaf3de"};
    if(needed<=totalMonthly*0.5)return{label:"At risk",color:"#854f0b",bg:"#faeeda"};
    return{label:"Behind",color:"#a32d2d",bg:"#fcebeb"};
  };

  // Ring SVG gauge (full circle style like uploaded design)
  const RingGauge=({pct,color,size=56})=>{
    const r=23;const cx=size/2;const cy=size/2;
    const circ=2*Math.PI*r;
    const offset=circ*(1-pct/100);
    return(
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1efe8" strokeWidth={5}/>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}/>
        <text x={cx} y={cy+4} textAnchor="middle" fontSize={10} fontWeight={600} fill="#1a1a18" fontFamily="system-ui">{pct}%</text>
      </svg>
    );
  };

  const openNew=()=>{setForm({name:"",goal:"",saved:"",icon:"🎯",color:"#0057B8",months:""});setEditId(null);setShowForm(true);setMenuOpen(false);setCardMenu(null);};
  const openEdit=f=>{setForm({name:f.name,goal:String(f.goal),saved:String(f.saved),icon:f.icon,color:f.color,months:String(f.months||"")});setEditId(f.id);setShowForm(true);setMenuOpen(false);setCardMenu(null);};
  const deleteFund=id=>{
    const f=funds.find(x=>x.id===id);
    if(f&&(f.saved||0)>0){alert("Cannot delete a fund with saved balance. Use Rename or Inactive instead.");setCardMenu(null);return;}
    const newList=funds.filter(x=>x.id!==id);saveSinkingFunds(newList);setCardMenu(null);
  };
  const toggleFundInactive=id=>{
    const newList=funds.map(f=>f.id===id?{...f,inactive:!f.inactive}:f);
    saveSinkingFunds(newList);setCardMenu(null);
  };
  const cancelForm=()=>{setShowForm(false);setEditId(null);};
  const save=()=>{
    if(!form.name.trim()||!parseFloat(form.goal))return;
    const savedVal=form.saved!==""?parseFloat(form.saved):0;
    const monthsVal=form.months?parseInt(form.months):null;
    if(editId){
      const updated=funds.map(f=>f.id===editId?{...f,name:form.name,goal:parseFloat(form.goal),saved:savedVal,icon:form.icon,color:form.color,months:monthsVal}:f);
      saveSinkingFunds(updated);
    } else {
      // Using funds.length+1 for the id collided after any fund got deleted
      // (e.g. 3 funds → delete the 2nd → length is 2 → next new fund reuses
      // an id already taken by the 3rd) — silently pointing budget sweeps,
      // edits, and deletes at the wrong fund. Base it on the highest existing
      // numeric suffix instead, so it's unique no matter what's been removed.
      const maxNum=funds.reduce((max,f)=>{
        const m=/^SF(\d+)$/.exec(f.id);
        return m?Math.max(max,parseInt(m[1],10)):max;
      },0);
      const id="SF"+String(maxNum+1).padStart(3,"0");
      const newList=[...funds,{id,name:form.name,goal:parseFloat(form.goal),saved:savedVal,icon:form.icon,color:form.color,months:monthsVal}];
      saveSinkingFunds(newList);
    }
    cancelForm();
  };

  const COLORS=["#00875A","#0057B8","#7C3AED","#B45309","#0D7377","#1D4ED8"];
  const ICONS=["🛡️","🚗","✈️","🏠","📚","💍","🎯","🏖️","🏥","💻"];
  const contributionPct=monthIncome>0?Math.round((totalMonthly/monthIncome)*100):0;
  const onTrackCount=activeFunds.filter(f=>getRisk(f).label==="On track"||getRisk(f).label==="Complete").length;

  return(
    <div style={isDesktop?{maxWidth:900}:{background:"#f1efe8",minHeight:"100vh",fontFamily:"system-ui,-apple-system,sans-serif",maxWidth:430,margin:"0 auto",paddingBottom:40}}>
      {(menuOpen||cardMenu)&&<div onClick={()=>{setMenuOpen(false);setCardMenu(null);}} style={{position:"fixed",inset:0,zIndex:90}}/>}

      {duplicateIdFunds.length>0&&(
        <div style={{background:T.orangeBg,border:`1px solid ${T.orange}`,borderRadius:10,padding:"12px 16px",marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:700,color:T.orange,marginBottom:8}}>⚠ {duplicateIdFunds.length} fund{duplicateIdFunds.length===1?"":"s"} share an internal ID with another fund (a past bug could cause this after deleting one) — sweeps, edits, or deletes could affect the wrong fund until this is fixed.</div>
          <button onClick={fixDuplicateIds} style={{background:"#fff",border:`1px solid ${T.orange}`,borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,color:T.orange,cursor:"pointer",fontFamily:"inherit"}}>Fix now</button>
        </div>
      )}

      {/* Header */}
      {isDesktop?(
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Sinking funds</h1>
          <div style={{display:"flex",gap:8}}>
            <button onClick={openNew} style={{background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"9px 16px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>+ Add</button>
            <button onClick={onBack} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 16px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>‹ Back to dashboard</button>
          </div>
        </div>
      ):(
        <div style={{background:T.header,padding:"16px",display:"flex",alignItems:"center",gap:12}}>
          <button onClick={onBack} style={{background:"rgba(255,255,255,0.12)",border:"none",borderRadius:10,color:"#fff",fontSize:20,cursor:"pointer",width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
          <div style={{flex:1}}>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",fontWeight:700,letterSpacing:1.5,textTransform:"uppercase"}}>Savings Goals</div>
            <div style={{fontSize:18,fontWeight:700,color:"#fff"}}>Sinking Funds</div>
          </div>
          <button onClick={openNew} style={{background:"rgba(255,255,255,0.15)",border:"0.5px solid rgba(255,255,255,0.3)",borderRadius:9,color:"#fff",cursor:"pointer",padding:"6px 14px",fontSize:12,fontWeight:600,fontFamily:"inherit",display:"flex",alignItems:"center",gap:5}}>
            <span style={{fontSize:16,fontWeight:300}}>+</span> Add
          </button>
        </div>
      )}

      <div style={isDesktop?{}:{padding:"16px"}}>
        {/* Summary stats row — 3 cards like uploaded design */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
          <div style={{background:"#fff",border:"0.5px solid #d3d1c7",borderRadius:10,padding:"12px 10px"}}>
            <div style={{fontSize:10,color:"#888780",marginBottom:4}}>Total saved</div>
            <div style={{fontSize:16,fontWeight:500,color:"#1a1a18"}}>{fmt(totalSaved)}</div>
          </div>
          <div style={{background:"#fff",border:"0.5px solid #d3d1c7",borderRadius:10,padding:"12px 10px"}}>
            <div style={{fontSize:10,color:"#888780",marginBottom:4}}>Last month</div>
            <div style={{fontSize:16,fontWeight:500,color:"#1a1a18"}}>{fmt(lastMonthSaved||0)}</div>
          </div>
          <div style={{background:"#fff",border:"0.5px solid #d3d1c7",borderRadius:10,padding:"12px 10px"}}>
            <div style={{fontSize:10,color:"#888780",marginBottom:4}}>On track</div>
            <div style={{fontSize:16,fontWeight:500,color:"#3b6d11"}}>{onTrackCount} of {activeFunds.length}</div>
          </div>
        </div>

        {/* Monthly contribution card */}
        <div style={{background:"#fff",border:"0.5px solid #d3d1c7",borderRadius:10,padding:"12px 14px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:10,color:"#888780",marginBottom:3}}>Monthly contribution needed</div>
            <div style={{fontSize:18,fontWeight:500,color:"#1a1a18"}}>{fmt(totalMonthly)}<span style={{fontSize:11,color:"#888780",fontWeight:400}}> / mo</span></div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:10,color:"#888780",marginBottom:3}}>% of income</div>
            <div style={{fontSize:18,fontWeight:500,color:contributionPct>30?"#a32d2d":contributionPct>20?"#854f0b":"#3b6d11"}}>{contributionPct}%</div>
          </div>
        </div>

        {/* Add fund form */}
        {showForm&&(
          <div style={{background:"#fff",border:`1.5px solid ${editId?T.orange:T.accent}`,borderRadius:12,padding:"16px",marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <span style={{fontSize:13,fontWeight:700,color:editId?T.orange:T.accent}}>{editId?"Edit Fund":"New Fund"}</span>
              <button onClick={cancelForm} style={{background:"#f1efe8",border:"none",borderRadius:7,color:"#888780",fontSize:14,cursor:"pointer",width:28,height:28}}>✕</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <input placeholder="Fund name" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} style={inp}/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>Goal</div><input type="number" placeholder="500000" value={form.goal} onChange={e=>setForm(p=>({...p,goal:e.target.value}))} style={inp}/></div>
                <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>Saved</div><input type="number" placeholder="0" value={form.saved} onChange={e=>setForm(p=>({...p,saved:e.target.value}))} style={inp}/></div>
              </div>
              <div><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>Months to goal</div><input type="number" placeholder="e.g. 24" value={form.months} onChange={e=>setForm(p=>({...p,months:e.target.value}))} style={inp}/></div>
              {!editId&&(
                <div>
                  <div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>Icon & Color</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
                    {ICONS.map(ic=><button key={ic} onClick={()=>setForm(p=>({...p,icon:ic}))} style={{fontSize:18,background:form.icon===ic?T.accentLight:"#f5f5f5",border:`2px solid ${form.icon===ic?T.accent:"transparent"}`,borderRadius:7,padding:"4px 6px",cursor:"pointer"}}>{ic}</button>)}
                  </div>
                  <div style={{display:"flex",gap:7}}>
                    {COLORS.map(col=><button key={col} onClick={()=>setForm(p=>({...p,color:col}))} style={{width:22,height:22,borderRadius:"50%",background:col,border:`3px solid ${form.color===col?"#111":"transparent"}`,cursor:"pointer"}}/>)}
                  </div>
                </div>
              )}
              <SaveFlashButton onClick={save} label={editId?"Save Changes":"Create Fund"}/>
            </div>
          </div>
        )}

        {/* Fund cards — 2 column grid on mobile, 3 on desktop */}
        <div style={{display:"grid",gridTemplateColumns:isDesktop?"1fr 1fr 1fr":"1fr 1fr",gap:10}}>
          {activeFunds.map(f=>{
            const pct=Math.min(Math.round(((f.saved||0)/(f.goal||1))*100),100);
            const remaining=Math.max(0,f.goal-(f.saved||0));
            const done=pct>=100;
            const monthly=f.months&&f.months>0&&!done?Math.ceil(remaining/f.months):null;
            const risk=getRisk(f);
            const monthsLeft=f.months&&f.months>0?f.months:null;
            return(
              <div key={f.id} style={{background:"#fff",border:"0.5px solid #d3d1c7",borderRadius:12,padding:"12px",transition:"border-color 0.15s",position:"relative"}}>
                {/* Card top: icon + risk badge + ••• */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div style={{width:34,height:34,borderRadius:8,background:f.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{f.icon}</div>
                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                    <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:500,color:risk.color,background:risk.bg}}>{risk.label}</span>
                    <div style={{position:"relative"}}>
                      <button onClick={()=>setCardMenu(cardMenu===f.id?null:f.id)} style={{background:"none",border:"0.5px solid #d3d1c7",borderRadius:6,color:"#888780",fontSize:12,cursor:"pointer",width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900}}>•••</button>
                      {cardMenu===f.id&&(
                        <div style={{position:"absolute",right:0,top:28,background:"#fff",border:"0.5px solid #d3d1c7",borderRadius:10,zIndex:100,minWidth:140,boxShadow:"0 6px 20px rgba(0,0,0,0.1)"}}>
                          <div onClick={()=>openEdit(f)} style={{padding:"10px 14px",fontSize:12,cursor:"pointer",color:T.accent,fontWeight:600,borderBottom:"0.5px solid #d3d1c7"}}>✏️ Edit</div>
                          <div onClick={()=>toggleFundInactive(f.id)} style={{padding:"10px 14px",fontSize:12,cursor:"pointer",color:T.orange,fontWeight:600,borderBottom:"0.5px solid #d3d1c7"}}>{f.inactive?"✅ Reactivate":"⏸ Inactive"}</div>
                          {(!f.saved||f.saved===0)?<div onClick={()=>deleteFund(f.id)} style={{padding:"10px 14px",fontSize:12,cursor:"pointer",color:T.red,fontWeight:600}}>🗑️ Delete</div>:<div style={{padding:"10px 14px",fontSize:10,color:"#888780"}}>Has balance — no delete</div>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Fund name + tenure + target date */}
                <div style={{fontSize:13,fontWeight:500,color:"#1a1a18",marginBottom:2}}>{f.name}</div>
                <div style={{fontSize:11,color:"#888780",marginBottom:10}}>
                  {monthsLeft?(()=>{
                    const d=new Date();d.setMonth(d.getMonth()+monthsLeft);
                    const mo=d.toLocaleString("default",{month:"short",year:"numeric"});
                    return`${monthsLeft}mo · target ${mo}`;
                  })():"No timeline"}
                </div>

                {/* Ring gauge + saved amount */}
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <RingGauge pct={pct} color={done?"#00875A":f.color} size={52}/>
                  <div>
                    <div style={{fontSize:15,fontWeight:500,color:"#1a1a18"}}>{fmt(f.saved||0)}</div>
                    <div style={{fontSize:11,color:"#888780"}}>of {fmt(f.goal)}</div>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{height:5,background:"#f1efe8",borderRadius:3,overflow:"hidden",marginBottom:7}}>
                  <div style={{width:`${pct}%`,height:"100%",background:done?"#00875A":f.color,borderRadius:3,transition:"width 0.4s"}}/>
                </div>

                {/* Footer: monthly / remaining */}
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#888780"}}>
                  <span>{monthly?`${fmt(monthly)}/mo`:"—"}</span>
                  <span>{done?"✓ Complete":`${fmt(remaining)} left`}</span>
                </div>
              </div>
            );
          })}
        </div>

        {!activeFunds.length&&!showForm&&(
          <div style={{textAlign:"center",color:"#888780",padding:40,fontSize:13}}>No funds yet. Tap "+ Add" to create one.</div>
        )}
      </div>
    </div>
  );
}

function AccLedgerTable({selAcc,transactions,rFrom,rTo,getName}){
  if(!selAcc)return null;
  const accTxns=transactions.filter(t=>t.date>=rFrom&&t.date<=rTo&&(t.debitCode===selAcc||t.creditCode===selAcc)).sort((a,b)=>a.date.localeCompare(b.date));
  const opening=transactions.filter(t=>t.date<rFrom&&(t.debitCode===selAcc||t.creditCode===selAcc)).reduce((s,t)=>t.debitCode===selAcc?s+t.amount:s-t.amount,0);
  const periodTotal=accTxns.reduce((s,t)=>s+(t.debitCode===selAcc?t.amount:-t.amount),0);
  const closing=opening+periodTotal;
  return(
    <div style={{marginBottom:10}}>
      <div style={{background:"#EEF4F3",border:`1px solid ${T.border}`,borderBottom:"none",borderRadius:"10px 10px 0 0",display:"flex",justifyContent:"space-between",gap:10,padding:"10px 12px"}}>
        <div style={{fontSize:12,fontWeight:800,color:"#0369A1",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{selAcc} {getName(selAcc)}</div>
        <div style={{fontSize:12,fontWeight:900,color:"#111827",whiteSpace:"nowrap"}}>{sign(closing)}</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"44px 44px 1fr 76px",gap:4,padding:"7px 8px",border:`1px solid ${T.border}`,borderBottom:"none",background:"#EEF4F3"}}>
        {["Date","Bilag","Description","Amount"].map(h=><div key={h} style={{fontSize:9,color:"#111827",fontWeight:800,textTransform:"uppercase",textAlign:h==="Amount"?"right":"left"}}>{h}</div>)}
      </div>
      {accTxns.map((t,i)=>{const mv=t.debitCode===selAcc?t.amount:-t.amount;return(
        <div key={t.id} className="rr-table-row" style={{display:"grid",gridTemplateColumns:"44px 44px 1fr 76px",gap:4,padding:"9px 8px",border:`1px solid ${T.border}`,borderTop:"none",alignItems:"center",background:"#fff"}}>
          <div style={{fontSize:10,color:"#111827"}}>{t.date.slice(5)}</div>
          <div style={{fontSize:10,color:T.blue,fontWeight:700}}>{fmtB(t.bilag)}</div>
          <div style={{fontSize:11,color:"#111827",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</div>
          <div style={{fontSize:11,fontWeight:800,textAlign:"right",color:"#111827"}}>{mv>=0?"+":"−"}{fmt(Math.abs(mv))}</div>
        </div>
      );})}
      {!accTxns.length&&<div style={{textAlign:"center",color:T.muted,padding:20,fontSize:13}}>No transactions in this period</div>}
      <div style={{background:"#fff",border:`1px solid ${T.border}`,borderTop:"none",borderRadius:"0 0 10px 10px",overflow:"hidden"}}>
        {[
          {label:"Incoming Balance",value:opening},
          {label:"This Period",value:periodTotal},
          {label:"Outgoing Balance",value:closing}
        ].map((row,i)=>(
          <div key={row.label} style={{display:"flex",justifyContent:"space-between",padding:"10px 12px",borderBottom:i<2?`1px solid ${T.border}`:"none"}}>
            <div style={{fontSize:12,fontWeight:800,color:"#111827"}}>{row.label}</div>
            <div style={{fontSize:12,fontWeight:900,color:"#111827"}}>{sign(row.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Reports Screen ──────────────────────────────────────────────────────────
// Reports hub — the landing page for the whole Reports area, categorized
// like the Tripletex reference, linking to every report screen that exists.
function ReportsHubScreen({onNavigate}){
  const categories=[
    {label:"Customer",icon:"ti-users",items:[
      {label:"Sales per customer",tab:"SalesPerCustomer"},
      {label:"Balance lists",tab:"BalanceLists"},
    ]},
    {label:"Customer/Supplier Ledger",icon:"ti-list-details",items:[
      {label:"Customer ledger",tab:"Reskontro"},
      {label:"Aged receivables/payables",tab:"AgedReskontro"},
    ]},
    {label:"Result reports",icon:"ti-chart-line",items:[
      {label:"Monthly overview",tab:"MonthlyOverview"},
      {label:"Income statement",tab:"Resultat"},
      {label:"Analytics",tab:"Reports"},
    ]},
    {label:"Tax",icon:"ti-receipt-tax",items:[
      {label:"VAT report",tab:"VATReport"},
    ]},
  ];
  return(
    <div style={{maxWidth:1000}}>
      <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 20px"}}>Reports</h1>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        {categories.map(cat=>(
          <div key={cat.label} style={{background:"rgba(255,255,255,0.72)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",border:`1px solid ${T.borderGlass}`,borderRadius:16,padding:20,boxShadow:"0 10px 30px rgba(20,60,50,0.06)"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
              <i className={`ti ${cat.icon}`} style={{fontSize:16,color:T.accent}}/>
              <span style={{fontSize:14,fontWeight:800,color:T.text}}>{cat.label}</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:2}}>
              {cat.items.map(it=>(
                <div key={it.tab} onClick={()=>onNavigate(it.tab)} style={{padding:"7px 0",fontSize:13,color:T.accent,cursor:"pointer",fontWeight:500}}>{it.label}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Monthly overview — the single-screen "how did this month go" report:
// income, expenses, net profit, and a balance-sheet snapshot (assets /
// liabilities / equity as of month-end), each compared against the prior
// month with a delta and % change. Reuses the same account-grouping
// conventions as the Income Statement and Balance Sheet screens.
function MonthlyOverviewScreen({accounts,transactions,onOpenLedger,budgets=[],moneySources=[]}){
  const[viewMonth,setViewMonth]=useState(()=>new Date().toISOString().slice(0,7));
  const year=parseInt(viewMonth.slice(0,4));
  const monthIdx=parseInt(viewMonth.slice(5,7))-1;
  const lastDay=new Date(year,monthIdx+1,0).getDate();
  const from=`${viewMonth}-01`;
  const to=`${viewMonth}-${String(lastDay).padStart(2,"0")}`;
  const periodLabel=new Date(year,monthIdx,1).toLocaleString("default",{month:"long"})+" "+year;
  const stepMonth=dir=>{let m=monthIdx+dir,y=year;if(m<0){m=11;y-=1;}else if(m>11){m=0;y+=1;}setViewMonth(`${y}-${String(m+1).padStart(2,"0")}`);};

  const prevDate=new Date(year,monthIdx-1,1);
  const prevY=prevDate.getFullYear(),prevM=prevDate.getMonth();
  const prevFrom=`${prevY}-${String(prevM+1).padStart(2,"0")}-01`;
  const prevLastDay=new Date(prevY,prevM+1,0).getDate();
  const prevTo=`${prevY}-${String(prevM+1).padStart(2,"0")}-${String(prevLastDay).padStart(2,"0")}`;
  const prevLabel=new Date(prevY,prevM,1).toLocaleString("default",{month:"long"})+" "+prevY;

  const movement=(code,f,t)=>transactions.filter(tx=>tx.date>=f&&tx.date<=t).reduce((s,tx)=>{if(tx.debitCode===code)return s+tx.amount;if(tx.creditCode===code)return s-tx.amount;return s;},0);
  const balanceAsOf=(code,asOf)=>transactions.filter(tx=>tx.date<=asOf).reduce((s,tx)=>{if(tx.debitCode===code)return s+tx.amount;if(tx.creditCode===code)return s-tx.amount;return s;},0);

  const incomeSKs=["3000","3900"];
  const expenseSKs=["4000","5000","6000","6100","6200","6300","6400","6500","6600","6700","6800","6900","7000","7100","7200","7300","7400","7500","7600","7700","7800","7900"];
  const assetSKs=["1000","1100","1200","1300","1400","1500","1600","1700","1800","1900"];
  const eqLiabSKs=["2000","2100","2200","2300","2400","2500","2600","2700","2800","2900"];

  // Itemized by-account lists (not just category subtotals) — includes any
  // orphan code (used in transactions but missing from the chart) via the
  // same accountsForSK helper the other reports use, so nothing is silently
  // left out here either.
  const itemize=(sks,flip,fn)=>{
    const rows=[];
    sks.forEach(sk=>accountsForSK(accounts,transactions,sk).forEach(a=>{
      const val=fn(a.code)*(flip?-1:1);
      if(val)rows.push({code:a.code,name:a.name,sk,val});
    }));
    return rows.sort((a,b)=>b.val-a.val);
  };
  const expenseRows=itemize(expenseSKs,false,code=>movement(code,from,to));
  const incomeRows=itemize(incomeSKs,true,code=>movement(code,from,to));
  const assetRows=itemize(assetSKs,false,code=>balanceAsOf(code,to)).filter(r=>r.val!==0);
  const eqLiabRows=itemize(eqLiabSKs,true,code=>balanceAsOf(code,to)).filter(r=>r.val!==0);

  const income=incomeRows.reduce((s,r)=>s+r.val,0);
  const incomePrev=itemize(incomeSKs,true,code=>movement(code,prevFrom,prevTo)).reduce((s,r)=>s+r.val,0);
  const expense=expenseRows.reduce((s,r)=>s+r.val,0);
  const expensePrev=itemize(expenseSKs,false,code=>movement(code,prevFrom,prevTo)).reduce((s,r)=>s+r.val,0);
  const net=income-expense, netPrev=incomePrev-expensePrev;
  const assets=assetRows.reduce((s,r)=>s+r.val,0);
  const assetsPrev=itemize(assetSKs,false,code=>balanceAsOf(code,prevTo)).reduce((s,r)=>s+r.val,0);
  const eqLiab=eqLiabRows.reduce((s,r)=>s+r.val,0);
  const eqLiabPrev=itemize(eqLiabSKs,true,code=>balanceAsOf(code,prevTo)).reduce((s,r)=>s+r.val,0);

  // Expense budget remaining this month — sum of what was budgeted for every
  // expense account this month vs. what's actually been spent so far.
  const monthBudgets=budgets.filter(b=>b.year===year&&b.month===monthIdx);
  const budgetedExpense=monthBudgets.filter(b=>expenseSKs.includes(getSK(b.code))).reduce((s,b)=>s+(b.amount||0),0);
  const expenseRemaining=budgetedExpense-expense;

  // Money sources — scoped strictly to income accounts, per the person's
  // request: how much came in via a sale/income account this month, tagged
  // to each source. Deliberately doesn't try to net off "spending" against
  // this — mixing in withdrawals for any purpose made every source look
  // like it was always positive regardless of what actually happened.
  const bankCodes=new Set(accounts.filter(a=>getSK(a.code)==="1900").map(a=>a.code));
  const monthBankTxns=transactions.filter(t=>t.date>=from&&t.date<=to&&(bankCodes.has(t.debitCode)||bankCodes.has(t.creditCode)));
  const sourceRows=moneySources.filter(m=>!m.inactive).map(src=>{
    const tagged=monthBankTxns.filter(t=>t.moneySourceId===src.id);
    const received=tagged.filter(t=>bankCodes.has(t.debitCode)&&isIncomeSK(t.creditCode)).reduce((s,t)=>s+t.amount,0);
    return{id:src.id,name:src.name,received};
  }).filter(r=>r.received>0);

  const Delta=({cur,prev,invert=false})=>{
    const diff=cur-prev;
    const pct=prev!==0?Math.round((diff/Math.abs(prev))*100):null;
    const good=invert?diff<=0:diff>=0;
    if(diff===0)return<span style={{fontSize:11,color:T.muted}}>— no change</span>;
    return<span style={{fontSize:11,color:good?T.green:T.red,fontWeight:700}}>{diff>=0?"▲":"▼"} {fmt(Math.abs(diff))}{pct!=null?` (${Math.abs(pct)}%)`:""}</span>;
  };

  const Kpi=({label,value,prev,invert,sub})=>(
    <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:16,flex:1,minWidth:160}}>
      <div style={{fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",marginBottom:6}}>{label}</div>
      <div style={{fontSize:22,fontWeight:900,color:T.text,marginBottom:4}}>{fmt(value)}</div>
      {prev!=null?(<><Delta cur={value} prev={prev} invert={invert}/><div style={{fontSize:10,color:T.muted,marginTop:2}}>vs {fmt(prev)} in {prevLabel}</div></>):(sub&&<div style={{fontSize:10,color:T.muted,marginTop:2}}>{sub}</div>)}
    </div>
  );

  const ItemList=({rows,color,openable})=>(<>
    {rows.map(r=>(
      <div key={r.code} onClick={()=>openable&&onOpenLedger&&onOpenLedger({code:r.code,name:r.name},from,to)} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderTop:`1px solid ${T.border}`,fontSize:12,cursor:openable?"pointer":"default"}}>
        <span style={{color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingRight:8}}>{r.code} {r.name}</span>
        <span style={{fontWeight:700,color:color||T.text,flexShrink:0}}>{fmt(r.val)}</span>
      </div>
    ))}
  </>);

  return(
    <div style={{maxWidth:1000}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Monthly overview</h1>
        <div style={{display:"flex",alignItems:"center",gap:6,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",background:"#fff"}}>
          <button onClick={()=>stepMonth(-1)} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:T.sub}}>‹</button>
          <span style={{fontSize:13,fontWeight:700,color:T.text,minWidth:120,textAlign:"center"}}>{periodLabel}</span>
          <button onClick={()=>stepMonth(1)} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:T.sub}}>›</button>
        </div>
      </div>
      <div style={{fontSize:11,color:T.muted,marginBottom:14}}>Every figure below is automatically compared against {prevLabel} — no toggle needed. Assets/liabilities/equity are balances as of the end of {periodLabel}, which is how a balance sheet always works (they're running totals, not a monthly flow) — but only accounts with a non-zero balance that month are listed.</div>

      <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:16}}>
        <Kpi label="Income" value={income} prev={incomePrev}/>
        <Kpi label="Expenses" value={expense} prev={expensePrev} invert/>
        <Kpi label="Net profit" value={net} prev={netPrev}/>
        <Kpi label="Total assets (month-end)" value={assets} prev={assetsPrev}/>
        <Kpi label="Equity & liabilities (month-end)" value={eqLiab} prev={eqLiabPrev}/>
      </div>

      {budgetedExpense>0&&(
        <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:24}}>
          <Kpi label="Expense budget remaining" value={expenseRemaining} sub={`${fmt(expense)} spent of ${fmt(budgetedExpense)} budgeted`}/>
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
        <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:16}}>
          <div style={{fontSize:13,fontWeight:800,color:T.green,marginBottom:6,textTransform:"uppercase"}}>Income — every account</div>
          <ItemList rows={incomeRows} color={T.green} openable/>
          {!incomeRows.length&&<div style={{fontSize:12,color:T.muted,padding:"6px 0"}}>No income recorded this month.</div>}
        </div>
        <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:16}}>
          <div style={{fontSize:13,fontWeight:800,color:"#D97706",marginBottom:6,textTransform:"uppercase"}}>Expenses — every account</div>
          <ItemList rows={expenseRows} color="#D97706" openable/>
          {!expenseRows.length&&<div style={{fontSize:12,color:T.muted,padding:"6px 0"}}>No expenses recorded this month.</div>}
        </div>
      </div>

      {sourceRows.length>0&&(
        <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:16,marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:800,color:T.text,marginBottom:6,textTransform:"uppercase"}}>Money sources — this month</div>
          <div style={{fontSize:10,color:T.muted,marginBottom:8}}>Received via a sale/income account and tagged to this source, for {periodLabel} only.</div>
          {sourceRows.map(r=>(
            <div key={r.id} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderTop:`1px solid ${T.border}`,fontSize:12}}>
              <span style={{color:T.text,fontWeight:600}}>{r.name}</span>
              <span style={{fontWeight:800,color:T.green}}>{fmt(r.received)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:16}}>
          <div style={{fontSize:13,fontWeight:800,color:T.text,marginBottom:6,textTransform:"uppercase"}}>Assets — as of {periodLabel} only</div>
          <ItemList rows={assetRows} openable/>
          {!assetRows.length&&<div style={{fontSize:12,color:T.muted,padding:"6px 0"}}>No asset balances this month.</div>}
        </div>
        <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:16}}>
          <div style={{fontSize:13,fontWeight:800,color:T.text,marginBottom:6,textTransform:"uppercase"}}>Equity & liabilities — as of {periodLabel} only</div>
          <ItemList rows={eqLiabRows} openable/>
          {!eqLiabRows.length&&<div style={{fontSize:12,color:T.muted,padding:"6px 0"}}>No equity/liability balances this month.</div>}
        </div>
      </div>
    </div>
  );
}

// Sales per customer — revenue attributed to each customer via contactId,
// for the chosen period, with a running month stepper.
function SalesPerCustomerScreen({transactions,contacts}){
  const today=new Date();
  const[viewMonth,setViewMonth]=useState({y:today.getFullYear(),m:today.getMonth()});
  const stepMonth=(dir)=>setViewMonth(v=>{const d=new Date(v.y,v.m+dir,1);return{y:d.getFullYear(),m:d.getMonth()};});
  const periodLabel=new Date(viewMonth.y,viewMonth.m,1).toLocaleString("default",{month:"long",year:"numeric"});
  const from=`${viewMonth.y}-${String(viewMonth.m+1).padStart(2,"0")}-01`;
  const to=new Date(viewMonth.y,viewMonth.m+1,0).toISOString().slice(0,10);

  const rows=useMemo(()=>{
    const customers=contacts.filter(c=>c.type==="customer");
    return customers.map(c=>{
      const txns=transactions.filter(t=>t.contactId===c.id&&t.date>=from&&t.date<=to&&getSK(t.creditCode)==="3000");
      const total=txns.reduce((s,t)=>s+t.amount,0);
      return{contact:c,count:txns.length,total};
    }).filter(r=>r.count>0).sort((a,b)=>b.total-a.total);
  },[transactions,contacts,from,to]);
  const grandTotal=rows.reduce((s,r)=>s+r.total,0);

  return(
    <div style={{maxWidth:900}}>
      <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 16px"}}>Sales per customer</h1>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:6,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 12px"}}>
          <button onClick={()=>stepMonth(-1)} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:T.sub}}>‹</button>
          <span style={{fontSize:13,fontWeight:700,color:T.text,minWidth:120,textAlign:"center"}}>{periodLabel}</span>
          <button onClick={()=>stepMonth(1)} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:T.sub}}>›</button>
        </div>
      </div>
      <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
        <table style={{width:"100%",fontSize:13,borderCollapse:"collapse"}}>
          <thead><tr style={{background:T.bg,color:T.sub}}><td style={{padding:"10px 16px",fontWeight:700}}>Customer</td><td style={{textAlign:"right",fontWeight:700}}>Invoices</td><td style={{textAlign:"right",fontWeight:700,padding:"10px 16px"}}>Sales</td></tr></thead>
          <tbody>
            {rows.map(r=>(
              <tr key={r.contact.id} style={{borderBottom:`1px solid ${T.border}`}}>
                <td style={{padding:"10px 16px",color:T.text,fontWeight:600}}>{r.contact.name}</td>
                <td style={{textAlign:"right",color:T.sub}}>{r.count}</td>
                <td style={{textAlign:"right",padding:"10px 16px",fontWeight:700,color:T.text}}>{fmt(r.total)}</td>
              </tr>
            ))}
            {!rows.length&&<tr><td colSpan="3" style={{padding:"24px 0",textAlign:"center",color:T.muted}}>No sales recorded for this period.</td></tr>}
            {rows.length>0&&(
              <tr style={{borderTop:`2px solid ${T.border}`}}>
                <td style={{padding:"12px 16px",fontWeight:800,color:T.text}}>Total</td>
                <td/>
                <td style={{textAlign:"right",padding:"12px 16px",fontWeight:800,color:T.text}}>{fmt(grandTotal)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Aged Reskontro — the classic "how overdue is everything" report, split
// into buckets, as its own report rather than buried in the live ledger.
function AgedReskontroScreen({contacts,transactions}){
  const[type,setType]=useState("customer");
  const today=new Date().toISOString().slice(0,10);
  const daysBetween=(d1,d2)=>Math.floor((new Date(d1)-new Date(d2))/86400000);
  const BUCKETS=[["Not yet due",null,0],["1-30 days",1,30],["31-60 days",31,60],["61-90 days",61,90],["90+ days",91,Infinity]];

  const rows=useMemo(()=>{
    const code=type==="customer"?"1500":"2400";
    const inBucket=cc=>getSK(cc)===code;
    const relevant=contacts.filter(c=>c.type===type);
    return relevant.map(c=>{
      const openTxns=transactions.filter(t=>t.contactId===c.id&&(inBucket(t.debitCode)||inBucket(t.creditCode))&&!(t.matchedWith&&t.matchedAccount===code));
      const buckets=BUCKETS.map(()=>0);
      openTxns.forEach(t=>{
        const mv=inBucket(t.debitCode)?t.amount:-t.amount;
        if(!t.dueDate){buckets[0]+=mv;return;}
        const overdue=daysBetween(today,t.dueDate);
        if(overdue<=0)buckets[0]+=mv;
        else{
          const idx=BUCKETS.findIndex(([,lo,hi])=>lo!=null&&overdue>=lo&&overdue<=hi);
          buckets[idx===-1?BUCKETS.length-1:idx]+=mv;
        }
      });
      const total=buckets.reduce((s,b)=>s+b,0);
      return{contact:c,buckets,total};
    }).filter(r=>Math.abs(r.total)>=1).sort((a,b)=>b.total-a.total);
  },[contacts,transactions,type]);

  const columnTotals=BUCKETS.map((_,i)=>rows.reduce((s,r)=>s+r.buckets[i],0));
  const grandTotal=rows.reduce((s,r)=>s+r.total,0);

  return(
    <div style={{maxWidth:1000}}>
      <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 16px"}}>Aged {type==="customer"?"receivables":"payables"}</h1>
      <div style={{display:"flex",gap:6,marginBottom:16}}>
        <button onClick={()=>setType("customer")} style={{background:type==="customer"?T.accent:"none",color:type==="customer"?"#fff":T.sub,border:`1px solid ${type==="customer"?T.accent:T.border}`,borderRadius:7,padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Customers</button>
        <button onClick={()=>setType("supplier")} style={{background:type==="supplier"?T.accent:"none",color:type==="supplier"?"#fff":T.sub,border:`1px solid ${type==="supplier"?T.accent:T.border}`,borderRadius:7,padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Suppliers</button>
      </div>
      <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
        <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
          <thead><tr style={{background:T.bg,color:T.sub}}>
            <td style={{padding:"10px 14px",fontWeight:700}}>{type==="customer"?"Customer":"Supplier"}</td>
            {BUCKETS.map(([label])=><td key={label} style={{textAlign:"right",fontWeight:700}}>{label}</td>)}
            <td style={{textAlign:"right",fontWeight:700,padding:"10px 14px"}}>Total</td>
          </tr></thead>
          <tbody>
            {rows.map(r=>(
              <tr key={r.contact.id} style={{borderBottom:`1px solid ${T.border}`}}>
                <td style={{padding:"9px 14px",color:T.text,fontWeight:600}}>{r.contact.name}</td>
                {r.buckets.map((b,i)=><td key={i} style={{textAlign:"right",color:i>=2&&Math.abs(b)>=1?T.red:T.sub}}>{Math.abs(b)>=1?fmt(b):"—"}</td>)}
                <td style={{textAlign:"right",padding:"9px 14px",fontWeight:700,color:T.text}}>{fmt(r.total)}</td>
              </tr>
            ))}
            {!rows.length&&<tr><td colSpan={BUCKETS.length+2} style={{padding:"24px 0",textAlign:"center",color:T.muted}}>No open items.</td></tr>}
            {rows.length>0&&(
              <tr style={{borderTop:`2px solid ${T.border}`}}>
                <td style={{padding:"12px 14px",fontWeight:800,color:T.text}}>Total</td>
                {columnTotals.map((c,i)=><td key={i} style={{textAlign:"right",fontWeight:800,color:T.text}}>{fmt(c)}</td>)}
                <td style={{textAlign:"right",padding:"12px 14px",fontWeight:800,color:T.text}}>{fmt(grandTotal)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Balance lists (Saldolister) — quick standalone list of every customer,
// supplier, or employee with a nonzero balance/status.

export { VATCodesScreen, BankSettingsScreen, POSSettingsScreen, SAFTImportScreen, CustomerSettingsScreen, CustomersRegisterScreen, CompanyInfoScreen, NewVoucherScreen, RegisterVoucherQueueScreen, InvoicePrintView, InvoiceFormScreen, InvoiceOverviewScreen, RecurringInvoicesScreen, EmployeesScreen, POSScreen, POSProductsScreen, PayrollScreen, QuoteFormScreen, QuoteOverviewScreen, AuditLogScreen, AccDropReskontro, AccountSwitcherDropdown, ContactSearchInline, NewEntryForm, SinkingFundsScreen, AccLedgerTable, ReportsHubScreen, MonthlyOverviewScreen, SalesPerCustomerScreen, AgedReskontroScreen, MONTH_NAMES };
