import React, { useState, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import { T, SERIES, getSK, inp, btnRed, btnGhost, btnSm } from "../lib/theme.js";
import { INCOME_SK, EXPENSE_SK, isIncomeSK, isExpenseSK, vatCodeForRate, vatCodeOptions, findVatCode, accountsForSK, displayNotes, callClaudeAPI, fmt, fmtB, hasId, openHtmlInNewTab } from "../lib/utils.js";
import { sign, fmtBal, selSm, SL, Card, BackHeader, DetailModal, MatchDetailModal, MoneySourcesPanel, isBankReconApproved, setBankReconApproved, AccDrop, VatDrop, SaveFlashButton } from "./ledger.jsx";
import { ResizableSplit } from "./shell.jsx";
import { MONTH_NAMES, AccountSwitcherDropdown } from "./invoicing.jsx";
import { DEFAULT_ACCOUNTS } from "../lib/accounts_data.js";

function AccountPlanScreen({accounts,onSave,onAddAccount,onUpdateAccount,transactions,onBack,isDesktop=false,budgets=[],saveBudget,onNavigate,mergeAccounts}){
  const[list,setList]=useState(accounts.map(a=>({...a})));
  const[editingIdx,setEditingIdx]=useState(null);
  const[editForm,setEditForm]=useState({code:"",name:"",matchable:false,notes:"",defaultVatPct:"",customCategory:"",depreciationCode:""});
  const[origCode,setOrigCode]=useState("");
  const[showNew,setShowNew]=useState(false);
  const[acctImporting,setAcctImporting]=useState(false);
  const[search,setSearch]=useState("");
  const[highlightCode,setHighlightCode]=useState(null); // briefly flash a just-created account so it's obvious it landed
  const[showDupes,setShowDupes]=useState(false);
  const[merging,setMerging]=useState(null);
  const[showResetDefaults,setShowResetDefaults]=useState(false);
  const[resettingDefaults,setResettingDefaults]=useState(false);

  // Restores every standard NS 4102 account's name back to the canonical
  // one (in case it was renamed or accidentally edited) and adds back any
  // standard account that was deleted — without touching accounts that
  // aren't part of the standard chart (a client's own custom additions
  // stay exactly as they are) and without ever deleting anything, so no
  // transaction ever loses the account it posted against.
  const resetToNSDefaults=async()=>{
    setResettingDefaults(true);
    const defaultByCode=new Map(DEFAULT_ACCOUNTS.map(d=>[d.code,d]));
    const currentCodes=new Set(list.map(a=>a.code));
    const restored=list.map(a=>{
      const d=defaultByCode.get(a.code);
      if(!d)return a;
      // Only fills in a VAT code the account doesn't already have — never
      // overwrites one that was deliberately set/customized, same rule the
      // automatic backfill on login uses.
      return a.defaultVatCode?{...a,name:d.name}:{...a,name:d.name,defaultVatCode:d.defaultVatCode||a.defaultVatCode,defaultVatPct:d.defaultVatCode?d.defaultVatPct:a.defaultVatPct};
    });
    const missing=DEFAULT_ACCOUNTS.filter(d=>!currentCodes.has(d.code));
    const merged=[...restored,...missing].sort((a,b)=>a.code.localeCompare(b.code));
    setList(merged);
    await onSave(merged);
    setResettingDefaults(false);
    setShowResetDefaults(false);
  };

  // Duplicate detection — real duplicates in a live chart of accounts almost
  // never share the exact same code (the system usually prevents that); they
  // show up as the SAME account name under two different codes, created by
  // repeated imports/onboarding attempts. Normalize names (lowercase, strip
  // punctuation/whitespace) and group by that instead of by code.
  const duplicateGroups=useMemo(()=>{
    const norm=n=>(n||"").toLowerCase().replace(/[^a-z0-9]/g,"");
    const byName={};
    accounts.forEach(a=>{
      const key=norm(a.name);
      if(!key)return;
      (byName[key]=byName[key]||[]).push(a);
    });
    return Object.values(byName).filter(g=>g.length>1);
  },[accounts]);

  // Keep the local list in sync with the accounts prop. Without this, if the
  // screen is opened before accounts finish loading (e.g. right after login),
  // it captures an empty list once and never updates — appearing permanently
  // empty even after accounts arrive. Skip the resync while a row is actively
  // being edited so we don't clobber unsaved changes.
  useEffect(()=>{
    if(editingIdx===null){
      setList(accounts.map(a=>({...a})));
    }
  },[accounts]);

  const filtered=list.filter(a=>a.code.includes(search)||a.name.toLowerCase().includes(search.toLowerCase()));

  const hasTxns=(code)=>(transactions||[]).some(t=>t.debitCode===code||t.creditCode===code);

  // Safety net: a transaction can reference an account code that never
  // actually got saved into the chart of accounts (e.g. an account-creation
  // save that didn't persist, or a code typed into an import). Those
  // accounts have real activity but would otherwise be invisible here
  // forever — so detect them and offer a one-click way to add them properly.
  const orphanCodes=useMemo(()=>{
    const knownCodes=new Set(list.map(a=>a.code));
    const seen=new Set();
    (transactions||[]).forEach(t=>{
      if(t.debitCode&&!knownCodes.has(t.debitCode))seen.add(t.debitCode);
      if(t.creditCode&&!knownCodes.has(t.creditCode))seen.add(t.creditCode);
    });
    return[...seen].sort();
  },[transactions,list]);
  const[orphanPrefill,setOrphanPrefill]=useState(null); // still used by the general "+ New Account" button to prefill NewAccountModal
  // "+ Add CODE" needs to be a genuine one-click save — it opened a
  // pre-filled modal before, silently requiring a second click inside it
  // to actually finish. Someone reasonably expects a button labeled "+ Add
  // CODE" to just add it; if they didn't notice the second step, the
  // account was never actually created, and the same "missing from chart"
  // warning would come right back after a refresh. This creates it
  // immediately, using the same verified save path as every other account
  // creation flow, with a sensible default name they can rename any time.
  const addOrphanToChart=(code)=>{
    createAccount({code,name:"(Not in chart of accounts)"});
  };
  // Single creation path for all three entry points (desktop link, mobile
  // card, orphan-fix banner) — appends, saves, and flashes the new row so
  // it's obvious it actually landed in the chart, not just a silent no-op.
  const createAccount=(acc)=>{
    const updated=[...list,acc];
    setList(updated);
    if(onAddAccount)onAddAccount(acc);else onSave(updated,null);
    setShowNew(false);
    setOrphanPrefill(null);
    setHighlightCode(acc.code);
    setTimeout(()=>setHighlightCode(null),2500);
  };

  const openEdit=(ri)=>{
    setEditForm({code:list[ri].code,name:list[ri].name,matchable:list[ri].matchable||false,notes:list[ri].notes||"",defaultVatPct:list[ri].defaultVatPct!=null?String(list[ri].defaultVatPct):"",customCategory:list[ri].customCategory||"",currency:list[ri].currency||"",inactive:list[ri].inactive||false,depreciationCode:list[ri].depreciationCode||""});
    setOrigCode(list[ri].code);
    setEditingIdx(ri);
  };

  const cancelEdit=()=>{
    setList(accounts.map(a=>({...a})));
    setEditingIdx(null);
    setEditForm({code:"",name:"",matchable:false,notes:"",defaultVatPct:"",customCategory:"",depreciationCode:""});
    setOrigCode("");
  };

  const saveEdit=()=>{
    if(!editForm.code.trim()||!editForm.name.trim())return;
    const newCode=editForm.code.trim();
    const codeChanged=newCode!==origCode;
    // Check duplicate code (if code changed)
    if(codeChanged&&list.some((a,i)=>i!==editingIdx&&a.code===newCode)){
      alert("Account code "+newCode+" already exists.");return;
    }
    // Base on the original account, not just editForm — openEdit only seeds
    // editForm with the fields shown as inputs in this modal. Any field the
    // account has that isn't one of those (e.g. defaultVatCode/vatLocked,
    // set only via the "New account" flow) would otherwise be silently
    // wiped to null every time an unrelated field gets edited and saved.
    const savedAcc={...list[editingIdx],...editForm,code:newCode,name:editForm.name.trim(),customCategory:(editForm.customCategory||"").trim(),defaultVatPct:(editForm.defaultVatPct===""||editForm.defaultVatPct==null)?null:parseFloat(editForm.defaultVatPct)};
    const updated=list.map((a,i)=>i===editingIdx?savedAcc:a);
    setList(updated);
    if(codeChanged||!onUpdateAccount){
      // A code rename needs the full-list path — setAccounts migrates every
      // transaction referencing the old code onto the new one, which a
      // single-row upsert can't do.
      onSave(updated,codeChanged?origCode:null,codeChanged?newCode:null);
    } else {
      // Same single-row reliability fix as adding an account — editing one
      // account (e.g. toggling Inactive) shouldn't re-save the whole chart.
      onUpdateAccount(savedAcc);
    }
    setEditingIdx(null);
    setEditForm({code:"",name:"",matchable:false,notes:"",defaultVatPct:"",customCategory:"",depreciationCode:""});
    setOrigCode("");
  };

  // Opens the account detail popup — populates editForm from the account so
  // both viewing and editing share one code path (this also fixes the old
  // desktop panel, which showed fields but never actually set editingIdx,
  // so Save silently did nothing).
  const openAccount=(code)=>{
    const ri=list.findIndex(a=>a.code===code);
    if(ri===-1)return;
    openEdit(ri);
    setViewingCode(code);
  };
  const closeAccount=()=>{
    setViewingCode(null);
    setEditingIdx(null);
    setEditForm({code:"",name:"",matchable:false,notes:"",defaultVatPct:"",customCategory:"",depreciationCode:""});
    setOrigCode("");
  };

  const deleteAcc=(ri)=>{
    const code=list[ri].code;
    if(hasTxns(code)){alert("Cannot delete account "+code+" — it has transactions. Edit the name/code instead.");return;}
    if(!window.confirm("Delete account "+code+" — "+list[ri].name+"?"))return;
    const updated=list.filter((_,i)=>i!==ri);
    setList(updated);
    // Pass deleted code so backend removes it
    onSave(updated,code);
    if(editingIdx===ri)setEditingIdx(null);
  };

  const[viewingCode,setViewingCode]=useState(null);
  const[typeFilter,setTypeFilter]=useState("");
  const[allowEditing,setAllowEditing]=useState(false);
  const[showCustomOnly,setShowCustomOnly]=useState(false);
  const[showActiveOnly,setShowActiveOnly]=useState(false);

  if(isDesktop){

    const tableFiltered=filtered
      .filter(a=>!typeFilter||getSK(a.code)===typeFilter)
      .filter(a=>!showCustomOnly||!DEFAULT_ACCOUNTS.some(d=>d.code===a.code))
      .filter(a=>!showActiveOnly||!a.inactive);

    return(
      <div style={{maxWidth:"100%"}}>
        <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 16px"}}>Chart of accounts</h1>
        <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap",marginBottom:20}}>
          <input placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)} style={{...inp,width:200}}/>
          <div>
            <div style={{fontSize:10,color:T.muted,marginBottom:3}}>Type</div>
            <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} style={{...inp,width:170}}>
              <option value="">(All)</option>
              {Object.entries(SERIES).map(([k,s])=><option key={k} value={k}>{s.name}</option>)}
            </select>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:T.text,cursor:"pointer"}}>
            <input type="checkbox" checked={allowEditing} onChange={e=>setAllowEditing(e.target.checked)}/> Allow editing
          </label>
          {mergeAccounts&&duplicateGroups.length>0&&(
            <button onClick={()=>setShowDupes(s=>!s)} style={{background:T.redLight,color:T.red,border:"none",borderRadius:8,padding:"9px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
              <i className="ti ti-alert-triangle" style={{fontSize:13,marginRight:5}}/>{duplicateGroups.length} possible duplicate{duplicateGroups.length>1?"s":""}
            </button>
          )}
          <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:T.text,cursor:"pointer"}}>
            <input type="checkbox" checked={showCustomOnly} onChange={e=>setShowCustomOnly(e.target.checked)}/> Show only custom accounts
          </label>
          <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:T.text,cursor:"pointer"}}>
            <input type="checkbox" checked={showActiveOnly} onChange={e=>setShowActiveOnly(e.target.checked)}/> Show only active accounts
          </label>
        </div>

        {showDupes&&duplicateGroups.length>0&&(
          <div style={{background:"#fff",border:`1px solid ${T.redMid||T.border}`,borderRadius:12,padding:16,marginBottom:20}}>
            <div style={{fontSize:13,fontWeight:800,color:T.text,marginBottom:4}}>Accounts with the same name under different codes</div>
            <div style={{fontSize:11,color:T.muted,marginBottom:14}}>Pick which one to keep — every transaction on the others moves onto it, then the duplicates are removed.</div>
            {duplicateGroups.map((group,gi)=>(
              <div key={gi} style={{border:`1px solid ${T.border}`,borderRadius:10,padding:12,marginBottom:10}}>
                {group.map(a=>{
                  const count=transactions.filter(t=>t.debitCode===a.code||t.creditCode===a.code).length;
                  return(
                    <div key={a.code} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0"}}>
                      <span style={{fontSize:12,fontWeight:700,color:T.accent,background:T.accentLight,borderRadius:6,padding:"2px 8px",minWidth:50,textAlign:"center"}}>{a.code}</span>
                      <span style={{fontSize:13,flex:1,color:T.text}}>{a.name}</span>
                      <span style={{fontSize:11,color:T.muted}}>{count} entr{count===1?"y":"ies"}</span>
                      <button
                        disabled={merging===gi}
                        onClick={async()=>{
                          const others=group.filter(x=>x.code!==a.code);
                          if(!confirm(`Keep ${a.code} and merge ${others.map(o=>o.code).join(", ")} into it? This moves every transaction and can't be undone.`))return;
                          setMerging(gi);
                          for(const o of others){
                            const r=await mergeAccounts(a.code,o.code);
                            if(r&&r.error){alert(r.error);break;}
                          }
                          setMerging(null);
                        }}
                        style={{background:T.accent,color:"#fff",border:"none",borderRadius:7,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:merging===gi?"wait":"pointer",fontFamily:"inherit"}}
                      >{merging===gi?"Merging…":"Keep this one"}</button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {orphanCodes.length>0&&(
          <div style={{background:T.orangeBg,border:`1px solid ${T.orange}`,borderRadius:10,padding:"12px 16px",marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:700,color:T.orange,marginBottom:8}}>⚠ {orphanCodes.length} account code{orphanCodes.length===1?"":"s"} used in transactions but missing from your chart of accounts — add {orphanCodes.length===1?"it":"them"} so they show up properly everywhere:</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {orphanCodes.map(code=>(
                <button key={code} onClick={()=>addOrphanToChart(code)} style={{background:"#fff",border:`1px solid ${T.orange}`,borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,color:T.orange,cursor:"pointer",fontFamily:"inherit"}}>+ Add {code}</button>
              ))}
            </div>
          </div>
        )}

        <div style={{background:"#fff",borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 16px",borderBottom:`1px solid ${T.border}`}}>
            <div style={{fontSize:13,fontWeight:800,color:T.text}}>Chart of accounts</div>
            <div style={{display:"flex",gap:16}}>
              <span onClick={()=>{
                const aoa=[["Code","Name","Type","Balance group","Description","SAF-T (v1.3)","Default VAT","Currency","Show at posting","Matchable","Inactive"],...list.map(a=>[a.code,a.name,parseInt(getSK(a.code))<3000?"Balance sheet":"Income statement",(SERIES[getSK(a.code)]||{}).name||"",a.notes||"",a.saftCode13||"",a.defaultVatPct!=null?a.defaultVatPct:"",a.currency||"PKR",a.showAtPosting!==false?"yes":"no",a.matchable?"yes":"no",a.inactive?"yes":"no"])];
                const wb=XLSX.utils.book_new();
                const ws=XLSX.utils.aoa_to_sheet(aoa);
                XLSX.utils.book_append_sheet(wb,ws,"Chart of accounts");
                XLSX.writeFile(wb,"ChartOfAccounts.xlsx");
              }} style={{fontSize:12,color:T.accent,fontWeight:600,cursor:"pointer"}}>Export</span>
              <label style={{fontSize:12,color:T.accent,fontWeight:600,cursor:acctImporting?"wait":"pointer"}}>
                {acctImporting?"Importing…":"Import account information"}
                <input type="file" accept=".csv,.xlsx,.xls" disabled={acctImporting} style={{display:"none"}} onChange={async e=>{
                  const file=e.target.files[0];e.target.value="";
                  if(!file)return;
                  setAcctImporting(true);
                  try{
                    const isCsv=/\.csv$/i.test(file.name);
                    const wb=isCsv?XLSX.read(await file.text(),{type:"string"}):XLSX.read(await file.arrayBuffer(),{type:"array"});
                    const json=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});
                    const existingCodes=new Set(list.map(a=>a.code));
                    const newAccts=[];let skipped=0;
                    json.forEach(row=>{
                      const code=String(row.Code||row.code||"").trim();
                      const name=String(row.Name||row.name||"").trim();
                      if(!code||!name||existingCodes.has(code)){skipped++;return;}
                      existingCodes.add(code);
                      newAccts.push({code,name,matchable:String(row.Matchable||row.matchable||"").toLowerCase()==="yes"});
                    });
                    if(!newAccts.length){alert(`No new accounts to import${skipped?` (${skipped} skipped — missing data or already exists)`:""}.`);setAcctImporting(false);return;}
                    const updated=[...list,...newAccts];
                    setList(updated);
                    onSave(updated,null);
                    alert(`Imported ${newAccts.length} account${newAccts.length===1?"":"s"}${skipped?` (${skipped} skipped)`:""}.`);
                  }catch(err){alert("Couldn't read that file. Make sure it's a CSV or Excel export.");}
                  setAcctImporting(false);
                }}/>
              </label>
              <span onClick={()=>setShowNew(true)} style={{fontSize:12,color:T.accent,fontWeight:600,cursor:"pointer"}}>New account</span>
            </div>
          </div>
          <table style={{width:"100%",fontSize:10.5,borderCollapse:"collapse",tableLayout:"fixed"}}>
            <colgroup>
              <col style={{width:"8%"}}/>
              <col style={{width:"20%"}}/>
              <col style={{width:"13%"}}/>
              <col style={{width:"16%"}}/>
              <col style={{width:"9%"}}/>
              <col style={{width:"8%"}}/>
              <col style={{width:"7%"}}/>
              <col style={{width:"7%"}}/>
              <col style={{width:"7%"}}/>
              <col style={{width:"5%"}}/>
            </colgroup>
            <thead><tr style={{background:T.bg,color:T.sub}}>
              <td style={{padding:"7px 12px",fontWeight:700,verticalAlign:"middle"}}>Account number</td>
              <td style={{padding:"7px 0",fontWeight:700,verticalAlign:"middle"}}>Name</td>
              <td style={{padding:"7px 0",fontWeight:700,verticalAlign:"middle"}}>Account type</td>
              <td style={{padding:"7px 0",fontWeight:700,verticalAlign:"middle"}}>Balance group</td>
              <td style={{padding:"7px 0",fontWeight:700,verticalAlign:"middle"}}>Description</td>
              <td style={{padding:"7px 0",fontWeight:700,verticalAlign:"middle"}}>SAF-T (v1.3)</td>
              <td style={{padding:"7px 0",textAlign:"center",fontWeight:700,verticalAlign:"middle"}}>VAT code</td>
              <td style={{padding:"7px 0",textAlign:"center",fontWeight:700,verticalAlign:"middle"}}>Currency</td>
              <td style={{padding:"7px 0",textAlign:"center",fontWeight:700,verticalAlign:"middle"}}>Show at<br/>posting</td>
              <td style={{textAlign:"center",fontWeight:700,padding:"7px 12px",verticalAlign:"middle"}}>Inactive</td>
            </tr></thead>
            <tbody>
              {Object.entries(SERIES).map(([key,s])=>{
                const grp=tableFiltered.filter(a=>getSK(a.code)===key).sort((a,b)=>a.code.localeCompare(b.code));
                if(!grp.length)return null;
                return(
                  <React.Fragment key={key}>
                    <tr style={{background:T.bg}}><td colSpan="10" style={{padding:"6px 12px",fontWeight:700,fontSize:10,color:s.color,textTransform:"uppercase",letterSpacing:0.3}}>{s.icon} {s.name}</td></tr>
                    {grp.map(a=>(
                      <tr key={a.code} className="rr-table-row" onClick={()=>openAccount(a.code)} style={{borderBottom:`1px solid ${T.border}`,opacity:a.inactive?0.5:1,cursor:"pointer",background:a.code===highlightCode?T.accentLight:undefined,transition:"background 0.4s"}}>
                        <td style={{padding:"7px 12px",color:T.text}}>{a.code}{a.code===highlightCode&&<span style={{marginLeft:6,fontSize:9,background:T.accent,color:"#fff",borderRadius:5,padding:"1px 6px",fontWeight:700}}>NEW</span>}</td>
                        <td style={{color:T.accent,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={a.name}>{a.name}</td>
                        <td style={{color:T.muted,fontSize:10.5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={a.accountType}>{a.accountType||(parseInt(key)<3000?"Balance sheet":"Income statement")}</td>
                        <td style={{color:T.muted,fontSize:10.5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={a.balanceGroup}>{a.balanceGroup||s.name}</td>
                        <td style={{color:T.muted,fontSize:10.5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={a.notes}>{a.notes||"—"}</td>
                        <td style={{color:T.muted,fontSize:10.5}}>{a.saftCode13||"—"}</td>
                        <td style={{textAlign:"center",color:T.muted,fontSize:10.5}}>{a.defaultVatCode||"—"}</td>
                        <td style={{textAlign:"center",color:T.muted,fontSize:10.5}}>{a.currency&&a.currency!=="PKR"?a.currency:"—"}</td>
                        <td style={{textAlign:"center"}} onClick={e=>e.stopPropagation()}>
                          <input type="checkbox" checked={a.showAtPosting!==false} onChange={e=>onUpdateAccount&&onUpdateAccount({...a,showAtPosting:e.target.checked})}/>
                        </td>
                        <td style={{textAlign:"center",padding:"7px 12px"}} onClick={e=>e.stopPropagation()}>
                          <input type="checkbox" checked={!!a.inactive} onChange={e=>onUpdateAccount&&onUpdateAccount({...a,inactive:e.target.checked})}/>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
              {/* Catch-all — a code outside every recognized range (e.g. an
                  unusual custom code) must still show up somewhere, never
                  silently vanish. */}
              {(()=>{
                const known=new Set();
                Object.keys(SERIES).forEach(key=>tableFiltered.filter(a=>getSK(a.code)===key).forEach(a=>known.add(a.code)));
                const other=tableFiltered.filter(a=>!known.has(a.code)).sort((a,b)=>a.code.localeCompare(b.code));
                if(!other.length)return null;
                return(
                  <React.Fragment key="other">
                    <tr style={{background:T.bg}}><td colSpan="10" style={{padding:"6px 12px",fontWeight:700,fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:0.3}}>❓ Other / Uncategorized</td></tr>
                    {other.map(a=>(
                      <tr key={a.code} className="rr-table-row" onClick={()=>openAccount(a.code)} style={{borderBottom:`1px solid ${T.border}`,opacity:a.inactive?0.5:1,cursor:"pointer"}}>
                        <td style={{padding:"7px 12px",color:T.text}}>{a.code}</td>
                        <td style={{color:T.accent,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={a.name}>{a.name}</td>
                        <td style={{color:T.muted,fontSize:10.5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={a.accountType}>{a.accountType||"—"}</td>
                        <td style={{color:T.muted,fontSize:10.5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={a.balanceGroup}>{a.balanceGroup||"—"}</td>
                        <td style={{color:T.muted,fontSize:10.5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={a.notes}>{a.notes||"—"}</td>
                        <td style={{color:T.muted,fontSize:10.5}}>{a.saftCode13||"—"}</td>
                        <td style={{textAlign:"center",color:T.muted,fontSize:10.5}}>{a.defaultVatCode||"—"}</td>
                        <td style={{textAlign:"center",color:T.muted,fontSize:10.5}}>{a.currency&&a.currency!=="PKR"?a.currency:"—"}</td>
                        <td style={{textAlign:"center"}} onClick={e=>e.stopPropagation()}>
                          <input type="checkbox" checked={a.showAtPosting!==false} onChange={e=>onUpdateAccount&&onUpdateAccount({...a,showAtPosting:e.target.checked})}/>
                        </td>
                        <td style={{textAlign:"center",padding:"7px 12px"}} onClick={e=>e.stopPropagation()}>
                          <input type="checkbox" checked={!!a.inactive} onChange={e=>onUpdateAccount&&onUpdateAccount({...a,inactive:e.target.checked})}/>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })()}
              {!tableFiltered.length&&<tr><td colSpan="10" style={{padding:"24px 0",textAlign:"center",color:T.muted}}>No accounts match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        {viewingCode&&<AccountModal key={viewingCode} account={list.find(a=>a.code===viewingCode)} filtered={filtered} editForm={editForm} setEditForm={setEditForm} saveEdit={saveEdit} onClose={closeAccount} onGoAdjacent={dir=>{const idx=filtered.findIndex(a=>a.code===viewingCode);const next=filtered[idx+dir];if(next)openAccount(next.code);}} hasTxns={hasTxns} deleteAcc={(code)=>{const ri=list.findIndex(a=>a.code===code);deleteAcc(ri);closeAccount();}} budgets={budgets} saveBudget={saveBudget} onNavigate={onNavigate}/>}
        {showNew&&<NewAccountModal existingCodes={new Set(list.map(a=>a.code))} initialCode={orphanPrefill} onCreate={createAccount} onClose={()=>{setShowNew(false);setOrphanPrefill(null);}}/>}
        {showResetDefaults&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>!resettingDefaults&&setShowResetDefaults(false)}>
            <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:14,maxWidth:420,width:"100%",padding:24,boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
              <div style={{fontSize:16,fontWeight:800,color:T.text,marginBottom:6}}>Reset to NS 4102 defaults?</div>
              <div style={{fontSize:12,color:T.sub,marginBottom:18,lineHeight:1.6}}>
                This restores the standard name on every NS 4102 account (undoing any renames) and adds back any standard account that was removed.
                <br/><br/>
                It will <b>not</b> delete any account you added yourself, and it will never remove an account that has transactions posted against it.
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={resetToNSDefaults} disabled={resettingDefaults} style={{flex:1,background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"11px",fontWeight:700,fontSize:13,cursor:resettingDefaults?"wait":"pointer",fontFamily:"inherit"}}>{resettingDefaults?"Resetting…":"Reset to defaults"}</button>
                <button onClick={()=>setShowResetDefaults(false)} disabled={resettingDefaults} style={{flex:1,background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"11px",fontWeight:600,fontSize:13,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return(
    <div style={isDesktop?{maxWidth:800}:{background:T.bg,minHeight:"100vh",fontFamily:"system-ui,sans-serif",maxWidth:430,margin:"0 auto"}}>
      {isDesktop?(
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Account plan</h1>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setShowResetDefaults(true)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}><i className="ti ti-restore" style={{fontSize:13,marginRight:5}}/>Reset to NS defaults</button>
            <button onClick={()=>{
              const aoa=[["Code","Name","Matchable"],...list.map(a=>[a.code,a.name,a.matchable?"yes":"no"])];
              const wb=XLSX.utils.book_new();
              const ws=XLSX.utils.aoa_to_sheet(aoa);
              XLSX.utils.book_append_sheet(wb,ws,"Chart of accounts");
              XLSX.writeFile(wb,"ChartOfAccounts.xlsx");
            }} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}><i className="ti ti-download" style={{fontSize:13,marginRight:5}}/>Export</button>
            <label style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,color:T.sub,cursor:acctImporting?"wait":"pointer",fontFamily:"inherit"}}>
              <i className="ti ti-upload" style={{fontSize:13,marginRight:5}}/>{acctImporting?"Importing…":"Import"}
              <input type="file" accept=".csv,.xlsx,.xls" disabled={acctImporting} style={{display:"none"}} onChange={async e=>{
                const file=e.target.files[0];e.target.value="";
                if(!file)return;
                setAcctImporting(true);
                try{
                  const isCsv=/\.csv$/i.test(file.name);
                  const wb=isCsv?XLSX.read(await file.text(),{type:"string"}):XLSX.read(await file.arrayBuffer(),{type:"array"});
                  const json=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});
                  const existingCodes=new Set(list.map(a=>a.code));
                  const newAccts=[];let skipped=0;
                  json.forEach(row=>{
                    const code=String(row.Code||row.code||"").trim();
                    const name=String(row.Name||row.name||"").trim();
                    if(!code||!name||existingCodes.has(code)){skipped++;return;}
                    existingCodes.add(code);
                    newAccts.push({code,name,matchable:String(row.Matchable||row.matchable||"").toLowerCase()==="yes"});
                  });
                  if(!newAccts.length){alert(`No new accounts to import${skipped?` (${skipped} skipped — missing data or already exists)`:""}.`);setAcctImporting(false);return;}
                  const updated=[...list,...newAccts];
                  setList(updated);
                  onSave(updated,null);
                  alert(`Imported ${newAccts.length} account${newAccts.length===1?"":"s"}${skipped?` (${skipped} skipped)`:""}.`);
                }catch(err){alert("Couldn't read that file. Make sure it's a CSV or Excel export.");}
                setAcctImporting(false);
              }}/>
            </label>
            <button onClick={onBack} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>‹ Back to settings</button>
          </div>
        </div>
      ):<BackHeader title="Account Plan" sub="SETTINGS" onBack={onBack}/>}
      <div style={isDesktop?{}:{padding:16}}>
        <input placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} style={{...inp,marginBottom:12}}/>
        <button style={{...btnRed,marginBottom:14}} onClick={()=>setShowNew(true)}>+ New Account</button>
        {orphanCodes.length>0&&(
          <div style={{background:T.orangeBg,border:`1px solid ${T.orange}`,borderRadius:10,padding:"12px 14px",marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:T.orange,marginBottom:8}}>⚠ {orphanCodes.length} account code{orphanCodes.length===1?"":"s"} used in transactions but missing from your chart — tap to add:</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {orphanCodes.map(code=>(
                <button key={code} onClick={()=>addOrphanToChart(code)} style={{background:"#fff",border:`1px solid ${T.orange}`,borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:700,color:T.orange,cursor:"pointer",fontFamily:"inherit"}}>+ {code}</button>
              ))}
            </div>
          </div>
        )}
        {Object.entries(SERIES).map(([key,s])=>{
          const grp=filtered.filter(a=>getSK(a.code)===key).sort((a,b)=>a.code.localeCompare(b.code));
          if(!grp.length)return null;
          return(<div key={key} style={{marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><span>{s.icon}</span><span style={{fontSize:12,fontWeight:800,color:s.color,textTransform:"uppercase"}}>{s.name}</span></div>
            {grp.map(a=>{const hasT=hasTxns(a.code);const isNew=a.code===highlightCode;return(
              <div key={a.code} onClick={()=>openAccount(a.code)} className="rr-table-row" style={{background:isNew?T.accentLight:T.card,borderRadius:12,border:`1px solid ${isNew?T.accent:T.border}`,padding:"12px 14px",marginBottom:6,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"background 0.4s, border-color 0.4s"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0}}>
                  <span style={{background:s.bg,color:s.color,borderRadius:7,padding:"4px 9px",fontSize:12,fontWeight:800,flexShrink:0}}>{a.code}</span>
                  <span style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</span>
                  {isNew&&<span style={{fontSize:9,background:T.accent,color:"#fff",borderRadius:5,padding:"1px 6px",fontWeight:700,flexShrink:0}}>NEW</span>}
                  {a.matchable&&<span style={{fontSize:9,background:"#DCFCE7",color:T.green,borderRadius:5,padding:"1px 6px",fontWeight:700,flexShrink:0}}>✓ Match</span>}
                  {hasT&&<span style={{fontSize:9,background:"#FEF3C7",color:T.orange,borderRadius:5,padding:"1px 6px",fontWeight:700,flexShrink:0}}>Has Txns</span>}
                </div>
                <i className="ti ti-chevron-right" style={{fontSize:16,color:T.muted,flexShrink:0,marginLeft:8}}/>
              </div>
            );})}
          </div>);
        })}
        {(()=>{
          const known=new Set();
          Object.keys(SERIES).forEach(key=>filtered.filter(a=>getSK(a.code)===key).forEach(a=>known.add(a.code)));
          const other=filtered.filter(a=>!known.has(a.code)).sort((a,b)=>a.code.localeCompare(b.code));
          if(!other.length)return null;
          return(<div style={{marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><span>❓</span><span style={{fontSize:12,fontWeight:800,color:T.muted,textTransform:"uppercase"}}>Other / Uncategorized</span></div>
            {other.map(a=>{const hasT=hasTxns(a.code);return(
              <div key={a.code} onClick={()=>openAccount(a.code)} className="rr-table-row" style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,padding:"12px 14px",marginBottom:6,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0}}>
                  <span style={{background:T.bg,color:T.muted,borderRadius:7,padding:"4px 9px",fontSize:12,fontWeight:800,flexShrink:0}}>{a.code}</span>
                  <span style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</span>
                  {a.matchable&&<span style={{fontSize:9,background:"#DCFCE7",color:T.green,borderRadius:5,padding:"1px 6px",fontWeight:700,flexShrink:0}}>✓ Match</span>}
                  {hasT&&<span style={{fontSize:9,background:"#FEF3C7",color:T.orange,borderRadius:5,padding:"1px 6px",fontWeight:700,flexShrink:0}}>Has Txns</span>}
                </div>
                <i className="ti ti-chevron-right" style={{fontSize:16,color:T.muted,flexShrink:0,marginLeft:8}}/>
              </div>
            );})}
          </div>);
        })()}
        <div style={{display:"flex",gap:8,marginTop:8}}><button style={{...btnGhost,padding:"10px 14px",fontSize:12}} onClick={onBack}>← Back</button></div>
      </div>
      {viewingCode&&<AccountModal key={viewingCode} account={list.find(a=>a.code===viewingCode)} filtered={filtered} editForm={editForm} setEditForm={setEditForm} saveEdit={saveEdit} onClose={closeAccount} onGoAdjacent={dir=>{const idx=filtered.findIndex(a=>a.code===viewingCode);const next=filtered[idx+dir];if(next)openAccount(next.code);}} hasTxns={hasTxns} deleteAcc={(code)=>{const ri=list.findIndex(a=>a.code===code);deleteAcc(ri);closeAccount();}} budgets={budgets} saveBudget={saveBudget} onNavigate={onNavigate}/>}
      {showNew&&<NewAccountModal existingCodes={new Set(list.map(a=>a.code))} initialCode={orphanPrefill} onCreate={createAccount} onClose={()=>{setShowNew(false);setOrphanPrefill(null);}}/>}
    </div>
  );
}

// Centered "New account" popup — replaces the old window.prompt() flow
// (three blocking browser dialogs with no validation) everywhere an account
// gets created: the desktop link, the mobile inline card, and the orphan-code
// quick-add banner. Detects the SAF-T code/category and NS4102 type live from
// the account number as it's typed (same mapping AccountModal already uses),
// offers the right VAT-code list for that type (sales codes for income
// accounts, purchase codes for expense accounts, none for balance-sheet
// accounts), and a "lock" toggle — once locked, entry screens can't override
// the VAT code for this account; unchecking it here is the only way back.
// Searchable "Account group" picker — same interaction pattern as VatDrop
// (ledger.jsx), for browsing the NS4102 account series by name instead of
// needing to already know the numeric ranges. Deliberately does NOT store a
// separate "group" field on the account — every report/VAT-direction/
// balance-vs-income calculation in this app derives an account's group from
// its number via getSK(), so a second, independently-editable group field
// could silently drift out of sync with the number and corrupt those
// calculations. Instead, picking a group here sets the account number to
// that group's starting code, keeping the number as the single source of
// truth while still letting someone browse/select by name.
function AccountGroupDrop({value,onChange,options}){
  const[open,setOpen]=useState(false);
  const[q,setQ]=useState("");
  const containerRef=React.useRef(null);
  const inputRef=React.useRef(null);
  const sel=options.find(o=>o.code===value);
  const displayValue=sel?`${sel.icon} ${sel.code} — ${sel.name}`:"";

  const filtered=useMemo(()=>{
    if(!q)return options;
    const ql=q.toLowerCase();
    return options.filter(o=>o.code.includes(ql)||o.name.toLowerCase().includes(ql));
  },[options,q]);

  const openAndSearch=()=>{setOpen(true);setQ("");};
  const closeAndRevert=()=>{setOpen(false);setQ("");};
  const handleBlur=e=>{
    const next=e.relatedTarget;
    if(next&&containerRef.current&&containerRef.current.contains(next))return;
    closeAndRevert();
  };

  return(
    <div ref={containerRef} style={{position:"relative"}}>
      <input
        ref={inputRef}
        value={open?q:displayValue}
        placeholder="— Select account group —"
        onFocus={openAndSearch}
        onChange={e=>{if(!open)setOpen(true);setQ(e.target.value);}}
        onBlur={handleBlur}
        onKeyDown={e=>{
          if(e.key==="Escape"){closeAndRevert();inputRef.current&&inputRef.current.blur();}
          if(e.key==="Enter"&&open&&filtered.length>0){e.preventDefault();onChange(filtered[0].code);closeAndRevert();}
        }}
        style={{...inp,cursor:"text",paddingRight:20}}
      />
      <span style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",fontSize:9,color:T.muted,pointerEvents:"none"}}>{open?"▲":"▼"}</span>
      {open&&(
        <>
          <div onClick={closeAndRevert} style={{position:"fixed",inset:0,zIndex:298}}/>
          <div style={{position:"absolute",top:"calc(100% + 3px)",left:0,right:0,background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,zIndex:299,boxShadow:"0 8px 24px rgba(0,0,0,0.14)",overflow:"hidden",maxHeight:260}}>
            <div style={{overflowY:"auto",maxHeight:260}}>
              {filtered.length===0&&<div style={{padding:"12px",fontSize:11,color:T.muted,textAlign:"center"}}>No account groups found</div>}
              {filtered.map((o,i)=>(
                <div key={o.code} onMouseDown={e=>{e.preventDefault();onChange(o.code);closeAndRevert();}} style={{padding:"9px 12px",fontSize:12,cursor:"pointer",background:o.code===value?T.accentLight:"#fff",fontWeight:o.code===value?700:400,color:T.text,borderBottom:i<filtered.length-1?`1px solid ${T.border}`:"none"}}>
                  {o.icon} <span style={{fontWeight:700,color:T.accent}}>{o.code}</span> — {o.name}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function NewAccountModal({onCreate,onClose,existingCodes,initialCode}){
  const[code,setCode]=useState(initialCode||"");
  const[name,setName]=useState("");
  const[currency,setCurrency]=useState("PKR");
  const[vatCode,setVatCode]=useState("");
  const[vatLocked,setVatLocked]=useState(false);
  const[notes,setNotes]=useState("");
  const[saftCode13,setSaftCode13]=useState("");
  const[saftCode12,setSaftCode12]=useState("");
  const[showAtPosting,setShowAtPosting]=useState(true);
  const[matchable,setMatchable]=useState(false);
  const[inactive,setInactive]=useState(false);
  const[error,setError]=useState("");

  const sk=code?getSK(code.trim()):null;
  const seriesInfo=sk?SERIES[sk]:null;
  const isBalance=sk&&parseInt(sk)<3000;
  const reportLabel=seriesInfo?(isBalance?"Balance sheet":"Income statement (Resultat)"):code?"Uncategorized":"—";
  const vatDirection=sk&&INCOME_SK.has(sk)?"output":sk&&EXPENSE_SK.has(sk)?"input":null;
  const vatOptions=vatDirection?vatCodeOptions(vatDirection):[];

  // Whichever VAT list applies changed (e.g. the account number moved from
  // an expense range to an income range) — clear a now-invalid selection
  // rather than silently keep a code that no longer matches this account.
  useEffect(()=>{
    if(vatCode&&!vatOptions.some(c=>c.code===vatCode))setVatCode("");
  },[vatDirection]);

  const trimmedCode=code.trim();
  const valid=trimmedCode&&name.trim()&&!existingCodes.has(trimmedCode);

  const submit=()=>{
    if(!trimmedCode||!name.trim()){setError("Account number and name are both required.");return;}
    if(existingCodes.has(trimmedCode)){setError(`Account ${trimmedCode} already exists.`);return;}
    const selectedVat=vatOptions.find(c=>c.code===vatCode);
    onCreate({
      code:trimmedCode,name:name.trim(),matchable,currency,
      notes:notes.trim(),saftCode13:saftCode13.trim(),saftCode12:saftCode12.trim(),
      showAtPosting,inactive,
      defaultVatCode:selectedVat?selectedVat.code:null,
      defaultVatPct:selectedVat?selectedVat.rate:null,
      vatLocked:!!(selectedVat&&vatLocked),
    });
  };

  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(15,23,32,0.5)",zIndex:900,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:440,maxHeight:"88vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.28)"}}>
        <div style={{padding:"18px 20px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:16,fontWeight:800,color:T.text}}>New account</div>
          <button onClick={onClose} style={{background:T.bg,border:"none",borderRadius:8,color:T.sub,fontSize:15,cursor:"pointer",width:30,height:30}}>✕</button>
        </div>
        <div style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
          {error&&<div style={{background:T.redLight,color:T.red,borderRadius:8,padding:"8px 12px",fontSize:12,fontWeight:600}}>{error}</div>}
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Account group</div>
            <AccountGroupDrop value={sk||""} onChange={k=>{setCode(k);setError("");}} options={Object.entries(SERIES).map(([k,s])=>({code:k,name:s.name,icon:s.icon}))}/>
            <div style={{fontSize:10,color:T.muted,marginTop:4}}>Picking a group jumps the number below to its range — you can still type any specific number in that range.</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Number *</div>
              <input autoFocus value={code} onChange={e=>{setCode(e.target.value);setError("");}} placeholder="e.g. 6303" style={inp}/>
            </div>
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Currency</div>
              <select value={currency} onChange={e=>setCurrency(e.target.value)} style={inp}>
                {["PKR","USD","EUR","GBP","AED","SAR","NOK"].map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Name *</div>
            <input value={name} onChange={e=>{setName(e.target.value);setError("");}} placeholder="e.g. Office Rent" style={inp}/>
          </div>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Account type (detected from number)</div>
            <div style={{...inp,background:T.bg,color:T.sub,display:"flex",flexDirection:"column",gap:1,lineHeight:1.3}}>
              <span>{seriesInfo?seriesInfo.icon:""} {seriesInfo?seriesInfo.name:"—"}</span>
              <span style={{fontSize:10,color:T.muted}}>{reportLabel}</span>
            </div>
          </div>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Description</div>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional note" rows={2} style={{...inp,resize:"vertical",fontFamily:"inherit"}}/>
          </div>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>SAF-T code (v1.3)</div>
            <input value={saftCode13} onChange={e=>setSaftCode13(e.target.value)} placeholder="Optional" style={inp}/>
          </div>
          {vatDirection?(
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>VAT code</div>
              <VatDrop value={vatCode} onChange={setVatCode} options={vatOptions}/>
              <label style={{display:"flex",alignItems:"center",gap:8,marginTop:8,fontSize:12,color:vatCode?T.text:T.muted,cursor:vatCode?"pointer":"not-allowed"}}>
                <input type="checkbox" checked={vatLocked} disabled={!vatCode} onChange={e=>setVatLocked(e.target.checked)}/>
                Lock this VAT code — entries against this account can't use a different one
              </label>
            </div>
          ):(
            <div style={{fontSize:11,color:T.muted,background:T.bg,borderRadius:8,padding:"8px 12px"}}>Balance-sheet accounts don't carry a VAT code.</div>
          )}
          <div style={{display:"flex",flexDirection:"column",gap:8,paddingTop:2}}>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:T.text,cursor:"pointer"}}>
              <input type="checkbox" checked={showAtPosting} onChange={e=>setShowAtPosting(e.target.checked)}/>
              Show at posting
            </label>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:T.text,cursor:"pointer"}}>
              <input type="checkbox" checked={matchable} onChange={e=>setMatchable(e.target.checked)}/>
              Open items (matchable in Reskontro)
            </label>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:T.text,cursor:"pointer"}}>
              <input type="checkbox" checked={inactive} onChange={e=>setInactive(e.target.checked)}/>
              Inactive
            </label>
          </div>
        </div>
        <div style={{padding:"14px 20px",borderTop:`1px solid ${T.border}`,display:"flex",gap:8}}>
          <button onClick={submit} disabled={!valid} style={{flex:1,background:valid?T.accent:T.border,color:valid?"#fff":T.muted,border:"none",borderRadius:8,padding:"11px",fontWeight:700,fontSize:13,cursor:valid?"pointer":"default",fontFamily:"inherit"}}>Create</button>
          <button onClick={onClose} style={{flex:1,background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"11px",fontWeight:600,fontSize:13,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// Shared account detail popup — used by both the mobile card list and the
// desktop table in AccountPlanScreen. Opens centered over whatever screen is
// behind it. Shows the account's statutory NS4102 category (which report it
// falls under — Income statement/Resultat or Balance sheet — computed
// automatically from the account code) plus a free-text internal category the
// user sets themselves, and lets them view/edit that account's annual budget
// inline without leaving the popup.
function AccountModal({account,filtered,editForm,setEditForm,saveEdit,onClose,onGoAdjacent,hasTxns,deleteAcc,budgets=[],saveBudget,onNavigate}){
  const year=new Date().getFullYear();
  const budgetRow=(budgets||[]).find(b=>b.year===year&&b.month===-1&&b.code===(account&&account.code));
  const[budgetAmt,setBudgetAmt]=useState(budgetRow?String(budgetRow.amount):"");
  if(!account)return null;
  const hasT=hasTxns(account.code);
  const sk=getSK(account.code);
  const seriesInfo=SERIES[sk];
  const isBalance=sk&&parseInt(sk)<3000;
  const reportLabel=seriesInfo?(isBalance?"Balance sheet":"Income statement (Resultat)"):"Uncategorized";
  const vatDirection=sk&&INCOME_SK.has(sk)?"output":sk&&EXPENSE_SK.has(sk)?"input":null;
  const idx=filtered.findIndex(a=>a.code===account.code);
  const val=(field,fallback)=>editForm[field]!==undefined?editForm[field]:fallback;
  const set=(field)=>e=>setEditForm(f=>({...f,[field]:e.target.type==="checkbox"?e.target.checked:e.target.value}));

  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(15,23,32,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:480,maxHeight:"88vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.28)"}}>
        <div style={{position:"sticky",top:0,background:"#fff",zIndex:1,padding:"18px 20px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{minWidth:0}}>
            <div style={{fontSize:10,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>Account</div>
            <div style={{fontSize:17,fontWeight:800,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{account.code} {account.name}</div>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
            <button onClick={()=>onGoAdjacent(-1)} disabled={idx<=0} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:7,width:28,height:28,cursor:idx>0?"pointer":"default",color:idx>0?T.sub:T.muted,opacity:idx>0?1:0.4}}>‹</button>
            <button onClick={()=>onGoAdjacent(1)} disabled={idx>=filtered.length-1} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:7,width:28,height:28,cursor:idx<filtered.length-1?"pointer":"default",color:idx<filtered.length-1?T.sub:T.muted,opacity:idx<filtered.length-1?1:0.4}}>›</button>
            <button onClick={onClose} style={{background:"none",border:"none",color:T.muted,fontSize:20,cursor:"pointer",lineHeight:1,padding:"0 2px"}}>✕</button>
          </div>
        </div>

        <div style={{padding:20}}>
          {hasT&&<div style={{fontSize:11,color:"#0369A1",background:"#EFF6FF",borderRadius:7,padding:"8px 12px",marginBottom:14}}>ℹ️ This account has transactions. Changing the number moves all of them automatically — name changes are always safe.</div>}

          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Account group</div>
            <AccountGroupDrop value={getSK(val("code",account.code))||""} onChange={k=>setEditForm(f=>({...f,code:k}))} options={Object.entries(SERIES).map(([k,s])=>({code:k,name:s.name,icon:s.icon}))}/>
            {hasT&&<div style={{fontSize:10,color:T.muted,marginTop:4}}>This account has transactions — changing the group moves the account number, which migrates every entry to the new number automatically.</div>}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px 14px",marginBottom:16}}>
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Account number *</div>
              <input value={val("code",account.code)} onChange={set("code")} style={inp}/>
            </div>
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Name *</div>
              <input value={val("name",account.name)} onChange={set("name")} style={inp}/>
            </div>
            <div style={{gridColumn:"1/-1"}}>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Description</div>
              <input value={val("notes",account.notes||"")} onChange={set("notes")} placeholder="Internal note (optional)" style={inp}/>
            </div>
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Category (NS 4102, from resultat & balance report)</div>
              <div style={{...inp,background:T.bg,color:T.sub,display:"flex",flexDirection:"column",gap:1,lineHeight:1.3}}>
                <span>{seriesInfo?seriesInfo.icon:""} {seriesInfo?seriesInfo.name:"—"}</span>
                <span style={{fontSize:10,color:T.muted}}>{reportLabel}</span>
              </div>
            </div>
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Internal category</div>
              <input value={val("customCategory",account.customCategory||"")} onChange={set("customCategory")} placeholder="e.g. Marketing, Travel" style={inp}/>
            </div>
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Depreciation code</div>
              <input value={val("depreciationCode",account.depreciationCode||"")} onChange={set("depreciationCode")} placeholder="e.g. 5yr straight-line, or leave blank" style={inp}/>
            </div>
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>SAF-T code (v1.3)</div>
              <input value={val("saftCode13",account.saftCode13||"")} onChange={set("saftCode13")} placeholder="Optional" style={inp}/>
            </div>
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>VAT code</div>
              <VatDrop
                value={val("defaultVatCode",account.defaultVatCode||"")}
                disabled={val("vatLocked",!!account.vatLocked)&&!!val("defaultVatCode",account.defaultVatCode)}
                options={vatDirection?vatCodeOptions(vatDirection):[]}
                onChange={code=>{
                  const vc=code?findVatCode(code,vatDirection):null;
                  setEditForm(f=>({...f,defaultVatCode:code,defaultVatPct:vc?vc.rate:null}));
                }}
              />
              <label style={{display:"flex",alignItems:"center",gap:8,marginTop:6,fontSize:11,color:val("defaultVatCode",account.defaultVatCode)?T.text:T.muted,cursor:val("defaultVatCode",account.defaultVatCode)?"pointer":"not-allowed"}}>
                <input type="checkbox" checked={val("vatLocked",!!account.vatLocked)} disabled={!val("defaultVatCode",account.defaultVatCode)} onChange={set("vatLocked")}/>
                Lock this VAT code — entries can't use a different one while locked
              </label>
            </div>
            {sk==="1900"&&(
              <div>
                <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Currency</div>
                <select value={val("currency",account.currency||"PKR")} onChange={set("currency")} style={inp}>
                  <option value="PKR">PKR</option><option value="NOK">NOK</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="AED">AED</option>
                </select>
              </div>
            )}
            <div style={{gridColumn:"1/-1",display:"flex",gap:20,paddingTop:4,flexWrap:"wrap"}}>
              <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:T.text,cursor:"pointer"}}>
                <input type="checkbox" checked={val("showAtPosting",account.showAtPosting!==false)} onChange={set("showAtPosting")}/>
                Show at posting
              </label>
              <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:T.text,cursor:"pointer"}}>
                <input type="checkbox" checked={val("matchable",account.matchable||false)} onChange={set("matchable")}/>
                Open items (matchable in Reskontro)
              </label>
              <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:T.text,cursor:"pointer"}}>
                <input type="checkbox" checked={val("inactive",account.inactive||false)} onChange={set("inactive")}/>
                Inactive
              </label>
            </div>
          </div>

          <div style={{background:T.bg,borderRadius:12,padding:14,marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:800,color:T.text,marginBottom:8}}>📊 Budget — {year} (full year)</div>
            <div style={{display:"flex",gap:8}}>
              <input type="number" inputMode="decimal" value={budgetAmt} onChange={e=>setBudgetAmt(e.target.value)} placeholder="Annual budget amount" style={{...inp,flex:1}}/>
              <SaveFlashButton style={{width:"auto",padding:"10px 16px"}} label="Save" onClick={()=>{if(saveBudget)saveBudget(year,-1,account.code,parseFloat(budgetAmt)||0);}}/>
            </div>
            {onNavigate&&<div onClick={()=>onNavigate("Budget")} style={{fontSize:11,color:T.accent,fontWeight:600,cursor:"pointer",marginTop:8}}>Open full Budget screen for month-by-month view →</div>}
          </div>

          <div style={{display:"flex",gap:8}}>
            <SaveFlashButton style={{flex:2}} label="✓ Save account" onClick={()=>{saveEdit();onClose();}}/>
            <button style={{...btnGhost,flex:1}} onClick={onClose}>Cancel</button>
            {!hasT&&<button style={{...btnSm,background:"#FEF2F2",color:T.red,border:`1px solid ${T.red}33`,flex:1}} onClick={()=>deleteAcc(account.code)}>🗑 Delete</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsMenu({accounts,onSave,onAddAccount,onUpdateAccount,contacts,setContacts,transactions,sinkingFunds,saveSinkingFunds,budgets,saveBudget,restoreBudgets,companyProfile,saveCompanyProfile,invoices,quotes,recurringInvoices,employees,onBack,onNavigate,isAdmin=false,isDesktop=false,onWideChange}){
  const[screen,setScreen]=useState(null);
  const[contactType,setContactType]=useState("customer");
  const[newName,setNewName]=useState("");
  const[showNew,setShowNew]=useState(false);

  // The Chart of Accounts table has too many columns to be usable inside
  // Settings' normal narrow max-width — it needs the full screen. Every
  // other Settings sub-screen (company info, contacts, budgets, etc.) is
  // fine at the narrower width, so this reports up to FinanceTracker only
  // when "plan" is the active screen, letting it lift the outer wrapper's
  // max-width just for that one screen instead of widening all of Settings.
  useEffect(()=>{
    if(onWideChange)onWideChange(screen==="plan");
    return()=>{if(onWideChange)onWideChange(false);};
  },[screen]);

  const CURRENCIES=[
    {code:"PKR",name:"Pakistani Rupee",symbol:"Rs"},
    {code:"USD",name:"US Dollar",symbol:"$"},
    {code:"EUR",name:"Euro",symbol:"€"},
    {code:"GBP",name:"British Pound",symbol:"£"},
    {code:"AED",name:"UAE Dirham",symbol:"د.إ"},
    {code:"SAR",name:"Saudi Riyal",symbol:"﷼"},
    {code:"NOK",name:"Norwegian Krone",symbol:"kr"},
  ];
  const[profileData,setProfileData]=useState(()=>{try{return JSON.parse(localStorage.getItem("rr_profile")||"{}")}catch{return{};}});
  const saveProfile=(updates)=>{const n={...profileData,...updates};setProfileData(n);try{localStorage.setItem("rr_profile",JSON.stringify(n));}catch{}};
  const primaryCurrency=(profileData.currencies||["PKR"])[0];

  // Period close state — must be before any early returns (screen checks)
  const periodClose=companyProfile.periodCloseDate||"";
  const[tempPeriodClose,setTempPeriodClose]=useState(null);
  const savePeriodClose=(d)=>{saveCompanyProfile({...companyProfile,periodCloseDate:d});};

  // Setup-checklist dismissal state — also must be before any early returns.
  // (This was previously declared far below, after several `if(screen===...)
  // return(...)` branches. Since those branches return before reaching this
  // hook, React saw a different number of hooks called depending on which
  // settings screen was open, which crashed the whole app with "Rendered
  // fewer hooks than expected" whenever you opened Account Plan, Currency,
  // Period Close, or Backup from the Settings menu.)
  const[checklistDismissed,setChecklistDismissed]=useState(()=>{try{return localStorage.getItem("rr_checklist_dismissed")==="1";}catch{return false;}});

  const nextId=type=>{
    const prefix=type==="customer"?"C":"S";
    const nums=contacts.filter(c=>c.type===type).map(c=>parseInt(c.id.slice(1))||0);
    return`${prefix}${String((nums.length?Math.max(...nums):0)+1).padStart(3,"0")}`;
  };
  const addContact=()=>{
    if(!newName.trim())return;
    setContacts([...contacts,{id:nextId(contactType),type:contactType,name:newName.trim(),notes:""}]);
    setNewName("");setShowNew(false);
  };
  const deleteContact=id=>setContacts(contacts.filter(c=>c.id!==id));

  if(screen==="currency")return(
    <div style={isDesktop?{maxWidth:700}:{background:T.bg,minHeight:"100vh",fontFamily:"system-ui,sans-serif",maxWidth:430,margin:"0 auto",paddingBottom:40}}>
      {isDesktop?(
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Currency</h1>
          <button onClick={()=>setScreen(null)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>‹ Back to settings</button>
        </div>
      ):<BackHeader title="Currency" sub="SETTINGS" onBack={()=>setScreen(null)}/>}
      <div style={isDesktop?{}:{padding:16}}>
        <div style={{background:T.card,borderRadius:14,border:`1px solid ${T.border}`,padding:16,marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:4}}>Primary Currency</div>
          <div style={{fontSize:11,color:T.muted,marginBottom:12}}>Used for all amounts and reports throughout the app.</div>
          <select value={primaryCurrency} onChange={e=>{const c=e.target.value;saveProfile({currencies:[c,...(profileData.currencies||["PKR"]).filter(x=>x!==c)]});}} style={{...inp,fontSize:13,fontWeight:700}}>
            {CURRENCIES.map(c=><option key={c.code} value={c.code}>{c.symbol} {c.code} — {c.name}</option>)}
          </select>
        </div>
        <div style={{background:T.card,borderRadius:14,border:`1px solid ${T.border}`,padding:16}}>
          <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:4}}>Additional Currencies</div>
          <div style={{fontSize:11,color:T.muted,marginBottom:12}}>Enable extra currencies for multi-currency entries.</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {CURRENCIES.filter(c=>c.code!==primaryCurrency).map(c=>{
              const active=(profileData.currencies||["PKR"]).includes(c.code);
              return(
                <button key={c.code} onClick={()=>{const cur=profileData.currencies||["PKR"];const next=active?cur.filter(x=>x!==c.code):[...cur,c.code];saveProfile({currencies:next});}} style={{padding:"6px 12px",borderRadius:8,border:`1.5px solid ${active?T.accent:T.border}`,background:active?T.accentLight:"#fff",color:active?T.accent:T.sub,fontSize:12,fontWeight:active?700:400,cursor:"pointer",fontFamily:"inherit"}}>
                  {c.symbol} {c.code}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  if(screen==="sinkingfunds"){
    const SFSettingsInner=()=>{
      const SF_COLORS=["#00875A","#0057B8","#7C3AED","#B45309","#0D7377","#1D4ED8","#DC2626","#D97706"];
      const SF_ICONS=["🛡️","🚗","✈️","🏠","📚","💍","🎯","🏖️","🏥","💻","🎓","💰","🐾","🎸","🏋️"];
      const emptyForm={name:"",goal:"",saved:"",icon:"🎯",color:"#0057B8",months:""};
      const[sfForm,setSfForm]=useState(emptyForm);
      const[sfEditId,setSfEditId]=useState(null);
      const[sfShowForm,setSfShowForm]=useState(false);
      const[sfSaved,setSfSaved]=React.useState(false);
      const openSfNew=()=>{setSfForm(emptyForm);setSfEditId(null);setSfShowForm(true);};
      const openSfEdit=f=>{setSfForm({name:f.name,goal:String(f.goal),saved:String(f.saved||0),icon:f.icon||"🎯",color:f.color||"#0057B8",months:String(f.months||"")});setSfEditId(f.id);setSfShowForm(true);};
      const cancelSf=()=>{setSfShowForm(false);setSfEditId(null);setSfForm(emptyForm);};
      const saveSf=()=>{
        if(!sfForm.name.trim()||!parseFloat(sfForm.goal))return;
        const list=sinkingFunds||[];
        if(sfEditId){
          const updated=list.map(f=>f.id===sfEditId?{...f,name:sfForm.name,goal:parseFloat(sfForm.goal),saved:parseFloat(sfForm.saved)||0,icon:sfForm.icon,color:sfForm.color,months:sfForm.months?parseInt(sfForm.months):null}:f);
          saveSinkingFunds(updated);
        } else {
          const id="SF"+String(list.length+1).padStart(3,"0");
          saveSinkingFunds([...list,{id,name:sfForm.name,goal:parseFloat(sfForm.goal),saved:parseFloat(sfForm.saved)||0,icon:sfForm.icon,color:sfForm.color,months:sfForm.months?parseInt(sfForm.months):null}]);
        }
        cancelSf();
        setSfSaved(true);setTimeout(()=>setSfSaved(false),1800);
      };
      const deleteSf=id=>{
        const f=(sinkingFunds||[]).find(x=>x.id===id);
        if(f&&(f.saved||0)>0){alert("Cannot delete a fund with saved balance. Make it inactive or rename it instead.");return;}
        if(!window.confirm("Delete this fund?"))return;
        saveSinkingFunds((sinkingFunds||[]).filter(x=>x.id!==id));
      };
      return(
        <div style={isDesktop?{maxWidth:700}:{background:"#f1efe8",minHeight:"100vh",fontFamily:"system-ui,sans-serif",maxWidth:430,margin:"0 auto",paddingBottom:40}}>
          {isDesktop?(
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Sinking funds</h1>
              <div style={{display:"flex",gap:8}}>
                <button onClick={openSfNew} style={{background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Add</button>
                <button onClick={()=>setScreen(null)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>‹ Back to settings</button>
              </div>
            </div>
          ):(
          <div style={{background:T.header,padding:"16px",display:"flex",alignItems:"center",gap:12}}>
            <button onClick={()=>setScreen(null)} style={{background:"rgba(255,255,255,0.12)",border:"none",borderRadius:10,color:"#fff",fontSize:20,cursor:"pointer",width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
            <div style={{flex:1}}>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",fontWeight:700,letterSpacing:1.5,textTransform:"uppercase"}}>Settings</div>
              <div style={{fontSize:17,fontWeight:700,color:"#fff"}}>Sinking Funds</div>
            </div>
            <button onClick={openSfNew} style={{background:"rgba(255,255,255,0.15)",border:"0.5px solid rgba(255,255,255,0.3)",borderRadius:9,color:"#fff",cursor:"pointer",padding:"6px 14px",fontSize:12,fontWeight:600,fontFamily:"inherit"}}>+ Add</button>
          </div>
          )}
          <div style={isDesktop?{}:{padding:16}}>
            {/* Add / Edit Form */}
            {sfShowForm&&(
              <div style={{background:"#fff",borderRadius:14,border:`1.5px solid ${T.accent}`,padding:"14px 16px",marginBottom:14,boxShadow:"0 4px 16px rgba(13,115,119,0.12)"}}>
                <div style={{fontSize:12,fontWeight:800,color:T.accent,marginBottom:12,textTransform:"uppercase",letterSpacing:0.8}}>{sfEditId?"✏️ Edit Fund":"➕ New Fund"}</div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {/* Icon picker */}
                  <div>
                    <div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Icon</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {SF_ICONS.map(ic=>(
                        <button key={ic} onClick={()=>setSfForm(p=>({...p,icon:ic}))} style={{fontSize:18,background:sfForm.icon===ic?T.accentLight:"#f1efe8",border:sfForm.icon===ic?`2px solid ${T.accent}`:"2px solid transparent",borderRadius:8,width:36,height:36,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{ic}</button>
                      ))}
                    </div>
                  </div>
                  {/* Color picker */}
                  <div>
                    <div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Color</div>
                    <div style={{display:"flex",gap:8}}>
                      {SF_COLORS.map(c=>(
                        <button key={c} onClick={()=>setSfForm(p=>({...p,color:c}))} style={{width:26,height:26,borderRadius:"50%",background:c,border:sfForm.color===c?"3px solid #1a1a18":"2px solid transparent",cursor:"pointer",flexShrink:0}}/>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>Fund Name *</div>
                    <input value={sfForm.name} onChange={e=>setSfForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Emergency Fund" style={{...inp,fontSize:13,padding:"9px 12px"}}/>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div>
                      <div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>Goal (PKR) *</div>
                      <input type="number" value={sfForm.goal} onChange={e=>setSfForm(p=>({...p,goal:e.target.value}))} placeholder="500000" style={{...inp,fontSize:13,padding:"9px 12px"}}/>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>Already Saved</div>
                      <input type="number" value={sfForm.saved} onChange={e=>setSfForm(p=>({...p,saved:e.target.value}))} placeholder="0" style={{...inp,fontSize:13,padding:"9px 12px"}}/>
                    </div>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>Target Months (optional)</div>
                    <input type="number" value={sfForm.months} onChange={e=>setSfForm(p=>({...p,months:e.target.value}))} placeholder="e.g. 12" style={{...inp,fontSize:13,padding:"9px 12px"}}/>
                  </div>
                  <div style={{display:"flex",gap:8,marginTop:4}}>
                    <button onClick={saveSf} style={{...btnRed,flex:2,opacity:sfForm.name.trim()&&parseFloat(sfForm.goal)?1:0.5,background:sfSaved?"#059669":T.accent,transition:"background 0.2s"}}>{sfSaved?"✓ Saved!":(sfEditId?"Save Changes":"Add Fund")}</button>
                    <button onClick={cancelSf} style={{background:T.bg,color:T.sub,border:`1px solid ${T.border}`,borderRadius:10,padding:"11px 14px",fontWeight:600,fontSize:13,cursor:"pointer",flex:1,fontFamily:"inherit"}}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            <div style={{fontSize:11,color:"#888780",marginBottom:10}}>All funds including inactive. Inactive funds are hidden from the main screen.</div>
            {(sinkingFunds||[]).map(f=>{
              const pct=f.goal>0?Math.min(100,Math.round(((f.saved||0)/f.goal)*100)):0;
              return(
                <div key={f.id} style={{background:"#fff",border:`1px solid #d3d1c7`,borderRadius:12,padding:"12px 14px",marginBottom:8,opacity:f.inactive?0.65:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:22}}>{f.icon}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:f.inactive?"#888780":"#1a1a18",textDecoration:f.inactive?"line-through":"none"}}>{f.name}</div>
                      <div style={{fontSize:11,color:"#888780"}}>{fmt(f.saved||0)} / {fmt(f.goal)} · {pct}%</div>
                    </div>
                    {f.inactive&&<span style={{fontSize:9,fontWeight:800,color:"#888780",background:"#f1efe8",borderRadius:5,padding:"2px 7px",flexShrink:0}}>INACTIVE</span>}
                  </div>
                  <div style={{display:"flex",gap:6,marginTop:10}}>
                    <button onClick={()=>openSfEdit(f)} style={{flex:1,fontSize:11,background:T.accentLight,color:T.accent,border:"none",borderRadius:7,padding:"6px 0",cursor:"pointer",fontWeight:700,fontFamily:"inherit"}}>✏️ Edit</button>
                    <button onClick={()=>{const updated=(sinkingFunds||[]).map(x=>x.id===f.id?{...x,inactive:!x.inactive}:x);saveSinkingFunds(updated);}} style={{flex:1,fontSize:11,background:f.inactive?"#eaf3de":"#faeeda",color:f.inactive?"#3b6d11":"#854f0b",border:"none",borderRadius:7,padding:"6px 0",cursor:"pointer",fontWeight:700,fontFamily:"inherit"}}>
                      {f.inactive?"✅ Reactivate":"⏸ Inactive"}
                    </button>
                    <button onClick={()=>deleteSf(f.id)} style={{flex:1,fontSize:11,background:"#fcebeb",color:T.red,border:"none",borderRadius:7,padding:"6px 0",cursor:"pointer",fontWeight:700,fontFamily:"inherit"}}>🗑 Delete</button>
                  </div>
                </div>
              );
            })}
            {!(sinkingFunds||[]).length&&!sfShowForm&&(
              <div style={{textAlign:"center",padding:40}}>
                <div style={{fontSize:32,marginBottom:8}}>🎯</div>
                <div style={{fontSize:13,color:"#888780",marginBottom:16}}>No sinking funds yet.</div>
                <button onClick={openSfNew} style={{...btnRed}}>+ Create First Fund</button>
              </div>
            )}
          </div>
        </div>
      );
    };
    return <SFSettingsInner/>;
  }

  if(screen==="periodclose")return(
    <div style={isDesktop?{maxWidth:700}:{background:T.bg,minHeight:"100vh",fontFamily:"system-ui,sans-serif",maxWidth:430,margin:"0 auto",paddingBottom:40}}>
      {isDesktop?(
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Period close</h1>
          <button onClick={()=>setScreen(null)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>‹ Back to settings</button>
        </div>
      ):<BackHeader title="Period Close" sub="SETTINGS" onBack={()=>setScreen(null)}/>}
      <div style={isDesktop?{}:{padding:16}}>
        <div style={{background:T.card,borderRadius:14,border:`1px solid ${T.border}`,padding:"16px",marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:6}}>🔒 Lock Period Until Date</div>
          <div style={{fontSize:12,color:T.muted,marginBottom:14,lineHeight:1.6}}>
            Set a date to lock all periods up to and including that date. No new entries or edits will be allowed on or before this date. To unlock, clear the date and save.
          </div>
          <div style={{fontSize:10,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,marginBottom:5}}>Close Date</div>
          <input type="date" value={tempPeriodClose!==null?tempPeriodClose:periodClose} onChange={e=>setTempPeriodClose(e.target.value)} style={{...inp,marginBottom:12}}/>
          {periodClose&&(
            <div style={{background:"#FEF3C7",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
              <span style={{fontSize:14}}>🔒</span>
              <span style={{fontSize:12,fontWeight:600,color:T.orange}}>Currently locked up to <strong>{periodClose}</strong></span>
            </div>
          )}
          <div style={{display:"flex",gap:8}}>
            <SaveFlashButton onClick={()=>{
              const newDate=tempPeriodClose;
              if(newDate===null)return;
              savePeriodClose(newDate);
              setTempPeriodClose(null);
            }} style={{flex:2}} label="Save"/>
            {periodClose&&<button style={{...btnGhost,flex:1,fontSize:12}} onClick={()=>{
              if(window.confirm("Clear period lock? All dates will be open again.")){
                savePeriodClose("");setTempPeriodClose(null);
              }
            }}>Clear Lock</button>}
          </div>
        </div>
        {periodClose&&(
          <div style={{background:T.accentLight,borderRadius:12,padding:"12px 14px",border:`1px solid ${T.accentMid}`}}>
            <div style={{fontSize:11,color:T.accent,fontWeight:600}}>📋 How it works</div>
            <div style={{fontSize:11,color:T.muted,marginTop:4,lineHeight:1.5}}>Any entry with a date on or before <strong>{periodClose}</strong> will be blocked. You will see an error when trying to add or edit such entries.</div>
          </div>
        )}
      </div>
    </div>
  );

  if(screen==="backup")return(
    <div style={isDesktop?{maxWidth:700}:{background:T.bg,minHeight:"100vh",fontFamily:"system-ui,sans-serif",maxWidth:430,margin:"0 auto",paddingBottom:40}}>
      {isDesktop?(
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Backup and restore</h1>
          <button onClick={()=>setScreen(null)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>‹ Back to settings</button>
        </div>
      ):<BackHeader title="Backup & Restore" sub="DATA" onBack={()=>setScreen(null)}/>}
      <div style={isDesktop?{}:{padding:16}}>
        <div style={{background:T.card,borderRadius:14,border:`1px solid ${T.border}`,padding:"16px",marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:6}}>💾 Export Backup</div>
          <div style={{fontSize:12,color:T.muted,marginBottom:12,lineHeight:1.6}}>Downloads everything as one JSON file — transactions, accounts, contacts, invoices, quotes, recurring invoices, employees, sinking funds, budgets, company profile, and your app profile. Use this to migrate out or keep an offline copy.</div>
          <button style={btnRed} onClick={()=>{
            try{
              const sf=sinkingFunds||[];
              const profile=JSON.parse(localStorage.getItem("rr_profile")||"{}");
              const backup={version:3,date:new Date().toISOString(),accounts,contacts,transactions:transactions||[],invoices:invoices||[],quotes:quotes||[],recurringInvoices:recurringInvoices||[],employees:employees||[],companyProfile:companyProfile||{},sinkingFunds:sf,budgets:budgets||[],profile};
              const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
              const url=URL.createObjectURL(blob);
              const a=document.createElement("a");
              a.href=url;a.download=`redrock_backup_${new Date().toISOString().slice(0,10)}.json`;
              document.body.appendChild(a);a.click();
              setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},100);
            }catch(e){alert("Backup failed: "+e.message);}
          }}>⬇ Download Backup</button>
        </div>
        <div style={{background:T.card,borderRadius:14,border:`1px solid ${T.border}`,padding:"16px",marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:6}}>🔎 Recover local budgets</div>
          <div style={{fontSize:12,color:T.muted,marginBottom:12,lineHeight:1.6}}>Budgets used to be saved only on this device. If you had budgets set before they moved to the cloud, this finds them on this browser and imports them properly — safe to run more than once.</div>
          <button style={{...btnRed,background:T.waterTeal}} onClick={()=>{
            if(!saveBudget){alert("Budget saving isn't available right now.");return;}
            const found=[]; // {year, month, entries:[{code,amount}]}
            for(let i=0;i<localStorage.length;i++){
              const key=localStorage.key(i);
              const m=key&&key.match(/^rr_budgets_(\d{4})(?:-(\d{2}))?$/);
              if(!m)continue;
              const year=parseInt(m[1]);
              const month=m[2]?parseInt(m[2])-1:-1;
              let obj;
              try{obj=JSON.parse(localStorage.getItem(key)||"{}");}catch{continue;}
              const entries=Object.entries(obj).filter(([code,amt])=>code&&parseFloat(amt)>0).map(([code,amt])=>({code,amount:parseFloat(amt)}));
              if(entries.length)found.push({key,year,month,entries});
            }
            if(!found.length){alert("No old local budgets found on this device.");return;}
            const totalEntries=found.reduce((s,f)=>s+f.entries.length,0);
            const monthList=found.map(f=>f.month===-1?String(f.year):`${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][f.month]} ${f.year}`).join(", ");
            if(!window.confirm(`Found ${totalEntries} budget${totalEntries===1?"":"s"} across ${found.length} period${found.length===1?"":"s"} (${monthList}) saved on this device. Import them now?`))return;
            (async()=>{
              for(const f of found){
                for(const e of f.entries){
                  await saveBudget(f.year,f.month,e.code,e.amount);
                }
              }
              alert(`✅ Imported ${totalEntries} budget${totalEntries===1?"":"s"}. Open the Budget screen to check them.`);
            })();
          }}>🔎 Scan and import local budgets</button>
        </div>
        <div style={{background:T.card,borderRadius:14,border:`1px solid ${T.border}`,padding:"16px",marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:6}}>📥 Restore from Backup</div>
          <div style={{fontSize:12,color:T.muted,marginBottom:12,lineHeight:1.6}}>Select a previously exported JSON backup file. This will restore accounts, contacts, sinking funds, budgets and profile.</div>
          <label style={{display:"flex",alignItems:"center",gap:8,background:T.accentLight,border:`1px solid ${T.accentMid}`,borderRadius:10,padding:"12px 14px",cursor:"pointer",fontSize:13,color:T.accent,fontWeight:600}}>
            📂 Choose backup file
            <input type="file" accept=".json" style={{display:"none"}} onChange={e=>{
              const file=e.target.files[0];if(!file)return;
              const r=new FileReader();
              r.onload=ev=>{
                try{
                  const data=JSON.parse(ev.target.result);
                  if(!data.version)throw new Error("Not a valid backup file");
                  if(!window.confirm(`Restore backup from ${(data.date?data.date.slice(0,10):undefined)}?\nThis will overwrite current accounts, contacts, budgets, sinking funds and profile.`))return;
                  if(data.accounts&&data.accounts.length){onSave(data.accounts);}
                  if(data.contacts&&data.contacts.length){setContacts(data.contacts);}
                  if(data.budgets&&restoreBudgets){
                    if(Array.isArray(data.budgets)){
                      restoreBudgets(data.budgets);
                    } else if(typeof data.budgets==="object"&&Object.keys(data.budgets).length){
                      // Legacy backup format had no year/month — nothing reliable to restore from it.
                      console.warn("Skipped legacy-format budgets in backup (no year/month data to restore).");
                    }
                  }
                  if(data.sinkingFunds&&saveSinkingFunds){saveSinkingFunds(data.sinkingFunds);}
                  if(data.profile){try{localStorage.setItem("rr_profile",JSON.stringify(data.profile));}catch{}}
                  alert("✅ Restore complete! Accounts, contacts, budgets and profile restored.");
                  setScreen(null);
                }catch(err){alert("Restore failed: "+err.message);}
              };
              r.readAsText(file);
            }}/>
          </label>
        </div>
      </div>
    </div>
  );

  if(screen==="plan")return(<AccountPlanScreen accounts={accounts} onSave={onSave} onAddAccount={onAddAccount} onUpdateAccount={onUpdateAccount} transactions={transactions} onBack={()=>setScreen(null)} isDesktop={isDesktop} budgets={budgets} saveBudget={saveBudget} onNavigate={onNavigate}/>);
  if(screen==="contacts"){
    const ManageContactsInner=()=>{
      const[cType,setCType]=useState("customer");
      const[cName,setCName]=useState("");
      const[cNotes,setCNotes]=useState("");
      const[showForm,setShowForm]=useState(false);
      const[editId,setEditId]=useState(null);
      const[search,setSearch]=useState("");
      const[saved,setSaved]=useState(false);
      const hasTxns=(id)=>transactions.some(t=>t.contactId===id);
      const nextId=(type)=>{
        const prefix=type==="customer"?"C":"S";
        const nums=contacts.filter(c=>c.type===type).map(c=>parseInt(c.id.slice(1))||0);
        return`${prefix}${String((nums.length?Math.max(...nums):0)+1).padStart(3,"0")}`;
      };
      const openNew=()=>{setCName("");setCNotes("");setEditId(null);setShowForm(true);};
      const openEdit=(c)=>{setCType(c.type);setCName(c.name);setCNotes(c.notes||"");setEditId(c.id);setShowForm(true);};
      const cancelForm=()=>{setShowForm(false);setEditId(null);setCName("");setCNotes("");};
      const saveContact=()=>{
        if(!cName.trim())return;
        if(editId){
          setContacts(contacts.map(c=>c.id===editId?{...c,name:cName.trim(),notes:cNotes.trim()}:c));
        } else {
          setContacts([...contacts,{id:nextId(cType),type:cType,name:cName.trim(),notes:cNotes.trim()}]);
        }
        cancelForm();setSaved(true);setTimeout(()=>setSaved(false),1600);
      };
      const toggleInactive=(id)=>setContacts(contacts.map(c=>c.id===id?{...c,inactive:!c.inactive}:c));
      const deleteContact=(id)=>{
        if(hasTxns(id)){alert("Cannot delete — this contact has transactions. Mark them Inactive instead.");return;}
        if(!window.confirm("Delete this contact?"))return;
        setContacts(contacts.filter(c=>c.id!==id));
      };
      const lists={
        customer:contacts.filter(c=>c.type==="customer"&&(!search||c.name.toLowerCase().includes(search.toLowerCase())||c.id.toLowerCase().includes(search.toLowerCase()))),
        supplier:contacts.filter(c=>c.type==="supplier"&&(!search||c.name.toLowerCase().includes(search.toLowerCase())||c.id.toLowerCase().includes(search.toLowerCase()))),
      };
      return(
        <div style={isDesktop?{maxWidth:700}:{background:T.bg,minHeight:"100vh",fontFamily:"system-ui,sans-serif",maxWidth:430,margin:"0 auto",paddingBottom:40}}>
          {isDesktop?(
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Manage contacts</h1>
              <button onClick={()=>setScreen(null)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>‹ Back to settings</button>
            </div>
          ):<BackHeader title="Manage Contacts" sub="RESKONTRO · SETTINGS" onBack={()=>setScreen(null)}/>}
          <div style={isDesktop?{}:{padding:16}}>
            {saved&&<div style={{background:"#DCFCE7",border:`1px solid ${T.green}`,borderRadius:10,padding:"10px 14px",fontSize:12,color:"#166534",fontWeight:700,marginBottom:12}}>✓ Saved</div>}
            <input placeholder="Search contacts…" value={search} onChange={e=>setSearch(e.target.value)} style={{...inp,marginBottom:10}}/>
            <button onClick={openNew} style={{...btnRed,marginBottom:14}}>+ New Contact</button>
            {showForm&&(
              <div style={{background:T.card,borderRadius:14,border:`1.5px solid ${T.accent}`,padding:"14px 16px",marginBottom:14,boxShadow:"0 4px 16px rgba(13,115,119,0.1)"}}>
                <div style={{fontSize:12,fontWeight:800,color:T.accent,marginBottom:12,textTransform:"uppercase",letterSpacing:0.8}}>{editId?"✏️ Edit Contact":"➕ New Contact"}</div>
                {!editId&&(
                  <div style={{display:"flex",gap:6,marginBottom:10}}>
                    {[["customer","📥 Customer (AR)"],["supplier","📤 Supplier (AP)"]].map(([v,l])=>(
                      <button key={v} onClick={()=>setCType(v)} style={{flex:1,padding:"7px 4px",border:`1.5px solid ${cType===v?T.accent:T.border}`,borderRadius:9,background:cType===v?T.accent:"#fff",color:cType===v?"#fff":T.sub,fontSize:10,fontWeight:cType===v?700:500,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>
                    ))}
                  </div>
                )}
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>Name</div>
                  <input value={cName} onChange={e=>setCName(e.target.value)} placeholder="Contact name…" style={inp}/>
                </div>
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>Notes (optional)</div>
                  <input value={cNotes} onChange={e=>setCNotes(e.target.value)} placeholder="Phone, email, ref…" style={inp}/>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <SaveFlashButton onClick={saveContact} style={{flex:2,padding:"8px"}} label={editId?"✓ Save Changes":"✓ Add Contact"}/>
                  <button style={{...btnGhost,flex:1,padding:"8px"}} onClick={cancelForm}>Cancel</button>
                </div>
              </div>
            )}
            {[["customer","📥 Customers (AR)",T.blue,T.blueBg],["supplier","📤 Suppliers (AP)",T.red,T.redLight]].map(([type,label,color,bg])=>(
              <div key={type} style={{marginBottom:20}}>
                <div style={{fontSize:11,fontWeight:800,color,textTransform:"uppercase",letterSpacing:0.7,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
                  {label}<span style={{background:bg,color,borderRadius:99,padding:"1px 8px",fontSize:10}}>{contacts.filter(c=>c.type===type&&!c.inactive).length} active</span>
                </div>
                {lists[type].length===0&&<div style={{fontSize:12,color:T.muted,padding:"10px 0"}}>No {type}s found.</div>}
                {lists[type].map(c=>(
                  <div key={c.id} style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,padding:"12px 14px",marginBottom:6,display:"flex",alignItems:"center",gap:10,opacity:c.inactive?0.55:1}}>
                    <span style={{fontSize:10,fontWeight:800,color,background:bg,padding:"3px 8px",borderRadius:6,flexShrink:0}}>{c.id}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:c.inactive?T.muted:T.text,textDecoration:c.inactive?"line-through":"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</div>
                      {c.notes&&<div style={{fontSize:10,color:T.muted,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.notes}</div>}
                    </div>
                    {c.inactive&&<span style={{fontSize:9,fontWeight:800,color:T.muted,background:T.border,borderRadius:5,padding:"2px 6px",flexShrink:0}}>INACTIVE</span>}
                    <div style={{display:"flex",gap:6,flexShrink:0}}>
                      {!c.inactive&&<button onClick={()=>openEdit(c)} style={{...btnSm,fontSize:10,padding:"4px 8px"}}>✏️</button>}
                      <button onClick={()=>toggleInactive(c.id)} style={{...btnSm,fontSize:10,padding:"4px 8px",background:c.inactive?"#DCFCE7":T.orangeBg,color:c.inactive?T.green:T.orange}}>
                        {c.inactive?"↩ Activate":"⊘ Inact."}
                      </button>
                      {!hasTxns(c.id)&&!c.inactive&&<button onClick={()=>deleteContact(c.id)} style={{...btnSm,fontSize:10,padding:"4px 8px",background:"#FEF2F2",color:T.red}}>🗑</button>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      );
    };
    return <ManageContactsInner/>;
  }

  const setupSteps=[
    {done:!!companyProfile.companyName,label:"Company name set",action:()=>{}},
    {done:accounts.some(a=>a.matchable),label:"At least one account customized",action:()=>setScreen("plan")},
    {done:invoices.length>0,label:"First invoice created",action:()=>onNavigate&&onNavigate("InvoiceNew")},
    {done:transactions.length>0,label:"First entry recorded",action:()=>onNavigate&&onNavigate(isDesktop?"NewVoucher":"Transactions")},
  ];
  const setupDone=setupSteps.filter(s=>s.done).length;
  const dismissChecklist=()=>{setChecklistDismissed(true);try{localStorage.setItem("rr_checklist_dismissed","1");}catch{}};

  return(
    <div style={isDesktop?{maxWidth:900}:{background:T.bg,minHeight:"100vh",fontFamily:"system-ui,sans-serif",maxWidth:430,margin:"0 auto"}}>
      {isDesktop?(
        <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 16px"}}>Settings</h1>
      ):<BackHeader title="Settings" sub="REDROCK ACCOUNTING" onBack={onBack}/>}
      <div style={isDesktop?{}:{padding:16}}>
        {setupDone<setupSteps.length&&!checklistDismissed&&(
          <div style={{background:"#fff",borderRadius:14,padding:16,marginBottom:16,border:`1px solid ${T.border}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:12,fontWeight:800,color:T.text}}>Getting started ({setupDone}/{setupSteps.length})</div>
              <button onClick={dismissChecklist} style={{background:"none",border:"none",color:T.muted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Dismiss</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {setupSteps.map((s,i)=>(
                <div key={i} onClick={s.done?undefined:s.action} style={{display:"flex",alignItems:"center",gap:8,cursor:s.done?"default":"pointer"}}>
                  <i className={s.done?"ti ti-circle-check-filled":"ti ti-circle"} style={{fontSize:15,color:s.done?T.green:T.border}}/>
                  <span style={{fontSize:12,color:s.done?T.muted:T.text,textDecoration:s.done?"line-through":"none"}}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* All settings as clean navigation cards — no inline forms or stats
            cluttering this landing page. Company info now lives only in its
            own dedicated screen (reached from here or the header), so it
            isn't duplicated in two places. Desktop groups the same items
            into labeled sections in a wider grid; mobile keeps the original
            single-column list untouched. */}
        {(()=>{
        const settingsItems=[
          {icon:"🏢",tiIcon:"ti-building",label:"Company Info",sub:companyProfile.companyName||"Name, address, logo, VAT",action:()=>onNavigate&&onNavigate("CompanyInfo"),bg:T.blueBg,color:T.blue,section:"Company"},
          {icon:"📋",tiIcon:"ti-list-details",label:"Account Plan",sub:`${accounts.length} accounts`,action:()=>setScreen("plan"),bg:T.accentLight,color:T.accent,section:"Company"},
          {icon:"👥",tiIcon:"ti-users",label:"Customers & suppliers",sub:`${contacts.length} contacts`,action:()=>onNavigate?onNavigate("Contacts"):setScreen("contacts"),bg:T.redLight,color:T.red,section:"Company"},
          {icon:"🏷️",tiIcon:"ti-tag",label:"Project Tracking",sub:companyProfile.trackProjects?"On":"Off — tag entries by project/department",action:()=>onNavigate&&onNavigate("ProjectTracking"),bg:"#F3E8FF",color:"#9333EA",section:"Company"},
          {icon:"📥",tiIcon:"ti-file-import",label:"Opening Balance",sub:"Import a trial balance from another system",action:()=>onNavigate&&onNavigate("OpeningBalance"),bg:"#E0F2FE",color:"#0284C7",section:"Accounting"},
          {icon:"💱",tiIcon:"ti-currency-dollar",label:"Currency",sub:`Primary: ${primaryCurrency}`,action:()=>setScreen("currency"),bg:T.greenBg,color:T.green,section:"Accounting"},
          {icon:"🔒",tiIcon:"ti-lock",label:"Period Close",sub:periodClose?`Closed up to ${periodClose}`:"No period locked",action:()=>setScreen("periodclose"),bg:"#FEF3C7",color:T.orange,section:"Accounting"},
          {icon:"🎯",tiIcon:"ti-target",label:"Sinking Funds",sub:"Manage & reactivate funds",action:()=>setScreen("sinkingfunds"),bg:"#f1efe8",color:"#854f0b",section:"Accounting"},
          {icon:"💾",tiIcon:"ti-database-export",label:"Backup & Restore",sub:"Export or import all data",action:()=>setScreen("backup"),bg:T.accentLight,color:T.accent,section:"Data"},
          ...(isAdmin?[{icon:"🐞",tiIcon:"ti-bug",label:"Bug Log",sub:"Errors reported by the app",action:()=>onNavigate&&onNavigate("BugLog"),bg:"#FEE2E2",color:T.red,section:"Data"}]:[]),
        ];
        if(!isDesktop)return(
          <div>
            {settingsItems.map((item,i)=>(
              <div key={i} onClick={item.action} style={{background:T.card,borderRadius:14,border:`1px solid ${T.border}`,padding:"14px 16px",marginBottom:8,cursor:"pointer",display:"flex",alignItems:"center",gap:14,boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
                <div style={{background:item.bg,borderRadius:12,width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>{item.icon}</div>
                <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:700,color:T.text}}>{item.label}</div><div style={{fontSize:11,color:T.sub,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.sub}</div></div>
                <span style={{fontSize:18,color:T.muted}}>›</span>
              </div>
            ))}
          </div>
        );
        const sections=["Company","Accounting","Data"];
        return(
          <div style={{display:"flex",flexDirection:"column",gap:24}}>
            {sections.map(sec=>{
              const items=settingsItems.filter(x=>x.section===sec);
              if(!items.length)return null;
              return(
                <div key={sec}>
                  <div style={{fontSize:11,fontWeight:800,color:T.muted,textTransform:"uppercase",letterSpacing:0.6,marginBottom:10}}>{sec}</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                    {items.map((item,i)=>(
                      <div key={i} className="rr-set-card" onClick={item.action} style={{background:"#fff",borderRadius:14,border:`1px solid ${T.border}`,padding:16,cursor:"pointer",display:"flex",flexDirection:"column",gap:10}}>
                        <div style={{background:item.bg,borderRadius:10,width:38,height:38,display:"flex",alignItems:"center",justifyContent:"center"}}>
                          <i className={`ti ${item.tiIcon}`} style={{fontSize:18,color:item.color}}/>
                        </div>
                        <div>
                          <div style={{fontSize:13,fontWeight:700,color:T.text}}>{item.label}</div>
                          <div style={{fontSize:11,color:T.sub,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
        })()}
      </div>
    </div>
  );
}

// ─── Bank Slider — horizontal scrollable cards for home screen ───────────────

function BankSlider({accounts,transactions,filterFrom,filterTo}){
  const banks=accounts.filter(a=>getSK(a.code)==="1900");
  if(!banks.length)return null;
  const bals=banks.map(a=>{
    // Opening balance = all txns before filterFrom
    const opening=transactions.filter(t=>t.date<filterFrom).reduce((s,t)=>{
      if(t.debitCode===a.code)return s+t.amount;
      if(t.creditCode===a.code)return s-t.amount;
      return s;
    },0);
    // Period movement
    const period=transactions.filter(t=>t.date>=filterFrom&&t.date<=filterTo).reduce((s,t)=>{
      if(t.debitCode===a.code)return s+t.amount;
      if(t.creditCode===a.code)return s-t.amount;
      return s;
    },0);
    return{...a,opening,period,bal:opening+period};
  }).filter(a=>a.bal!==0||a.opening!==0||a.period!==0);
  if(!bals.length)return null;
  return(
    <div style={{marginBottom:14,marginLeft:-16,marginRight:-16,paddingLeft:16,paddingRight:16}}>
      <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:4,paddingRight:16,scrollbarWidth:"none",msOverflowStyle:"none"}}>
        {bals.map(a=>(
          <div key={a.code} style={{minWidth:150,flexShrink:0,background:"linear-gradient(140deg,#1A3A6E,#0057B8)",borderRadius:16,padding:"14px 14px 16px",boxShadow:"0 4px 14px rgba(0,87,184,0.2)"}}>
            <div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontWeight:700,letterSpacing:1.2,marginBottom:2,textTransform:"uppercase"}}>{a.code}</div>
            <div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.85)",marginBottom:8,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div>
            <div style={{fontSize:20,fontWeight:900,color:a.bal>=0?"#4ade80":"#f87171",letterSpacing:-0.5,marginBottom:6}}>{a.bal>=0?"+":"−"}{fmt(Math.abs(a.bal))}</div>
            <div style={{fontSize:9,color:"rgba(255,255,255,0.4)"}}>
              Movement&nbsp;
              <span style={{color:a.period>=0?"#4ade80":"#f87171",fontWeight:700}}>{a.period>=0?"+":"−"}{fmt(Math.abs(a.period))}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Dashboard (Home) ─────────────────────────────────────────────────────────

function MiniBar({data,height=52}){
  const max=Math.max(...data.map(d=>Math.abs(d.val)),1);
  return(
    <div style={{display:"flex",alignItems:"flex-end",gap:6,height}}>
      {data.map((b,i)=>(
        <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
          <div style={{fontSize:9,fontWeight:800,color:b.color}}>{fmt(b.val)}</div>
          <div style={{width:"100%",background:b.color,borderRadius:"3px 3px 0 0",height:`${Math.max((Math.abs(b.val)/max)*(height-18),3)}px`,opacity:0.85}}/>
          <div style={{fontSize:9,color:T.muted,fontWeight:600,textAlign:"center",lineHeight:1.1}}>{b.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Global Period Selector ────────────────────────────────────────────────────
function PeriodSelector({from,to,onChange}){
  const now=new Date();
  const curY=now.getFullYear();
  const[expanded,setExpanded]=useState(false);
  const[viewYear,setViewYear]=useState(parseInt(from.slice(0,4))||curY);
  const[showCustom,setShowCustom]=useState(false);
  const[customFrom,setCustomFrom]=useState(from);
  const[customTo,setCustomTo]=useState(to);
  const MNAMES=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const years=[2023,2024,2025,2026,2027,2028];

  const fromYear=parseInt(from.slice(0,4));
  const fromMonth=parseInt(from.slice(5,7))-1;
  const toYear=parseInt(to.slice(0,4));
  const toMonth=parseInt(to.slice(5,7))-1;
  const isFullYear=from.endsWith("-01-01")&&to.endsWith("-12-31")&&fromYear===toYear;
  const isSingleMonth=!isFullYear&&fromYear===toYear&&fromMonth===toMonth&&from.endsWith("-01");
  const isMonthRange=!isFullYear&&!isSingleMonth&&from.endsWith("-01")&&fromYear===toYear&&(()=>{const last=new Date(toYear,toMonth+1,0).getDate();return to===`${toYear}-${String(toMonth+1).padStart(2,"0")}-${String(last).padStart(2,"0")}`;})();

  const monthStart=(y,m)=>`${y}-${String(m+1).padStart(2,"0")}-01`;
  const monthEnd=(y,m)=>{const last=new Date(y,m+1,0).getDate();return`${y}-${String(m+1).padStart(2,"0")}-${String(last).padStart(2,"0")}`;};

  // Collapsed pill label
  let label;
  if(isFullYear)label=String(fromYear);
  else if(isSingleMonth)label=`${["January","February","March","April","May","June","July","August","September","October","November","December"][fromMonth]} ${fromYear}`;
  else if(isMonthRange)label=fromYear===toYear?`${MNAMES[fromMonth]} - ${MNAMES[toMonth]} ${fromYear}`:`${MNAMES[fromMonth]} ${fromYear} - ${MNAMES[toMonth]} ${toYear}`;
  else label=`${from} → ${to}`;

  // Prev/next only make unambiguous sense for a single month or a full year
  const canStep=isFullYear||isSingleMonth;
  const step=(dir)=>{
    if(isFullYear){const y=fromYear+dir;onChange(`${y}-01-01`,`${y}-12-31`);setViewYear(y);return;}
    if(isSingleMonth){
      let y=fromYear,m=fromMonth+dir;
      if(m<0){m=11;y-=1;}else if(m>11){m=0;y+=1;}
      onChange(monthStart(y,m),monthEnd(y,m));setViewYear(y);
    }
  };

  const selectYear=(y)=>{setViewYear(y);onChange(`${y}-01-01`,`${y}-12-31`);setExpanded(false);setShowCustom(false);};
  const selectFullYear=()=>{onChange(`${viewYear}-01-01`,`${viewYear}-12-31`);setExpanded(false);setShowCustom(false);};
  const applyCustom=()=>{if(customFrom&&customTo){onChange(customFrom,customTo);setExpanded(false);setShowCustom(false);}};

  // Tap-or-drag range selection across the 12-month grid. A plain tap (no drag)
  // selects that one month; dragging across cells picks a range, committed on release.
  const[dragStart,setDragStart]=useState(null);
  const[dragEnd,setDragEnd]=useState(null);
  const dragging=dragStart!==null;
  useEffect(()=>{
    if(!dragging)return;
    const finish=()=>{
      const s=Math.min(dragStart,dragEnd),e=Math.max(dragStart,dragEnd);
      onChange(monthStart(viewYear,s),monthEnd(viewYear,e));
      setDragStart(null);setDragEnd(null);
      setExpanded(false);setShowCustom(false);
    };
    window.addEventListener("pointerup",finish,{once:true});
    return()=>window.removeEventListener("pointerup",finish);
  },[dragging,dragStart,dragEnd,viewYear]);

  const inRange=(i)=>{
    if(dragStart===null)return isMonthRange&&fromYear===viewYear&&toYear===viewYear&&i>=fromMonth&&i<=toMonth;
    const s=Math.min(dragStart,dragEnd),e=Math.max(dragStart,dragEnd);
    return i>=s&&i<=e;
  };
  const isEndpoint=(i)=>{
    if(dragStart!==null)return i===dragStart||i===dragEnd;
    if(isSingleMonth)return fromYear===viewYear&&fromMonth===i;
    if(isMonthRange)return fromYear===viewYear&&toYear===viewYear&&(i===fromMonth||i===toMonth);
    return false;
  };

  return(
    <div style={{background:"#fff",borderBottom:`1px solid ${T.border}`}}>
      {/* Collapsed pill: ‹ Label › */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:14,padding:"9px 12px"}}>
        <button onClick={()=>step(-1)} disabled={!canStep} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",cursor:canStep?"pointer":"default",opacity:canStep?1:0.35,color:T.sub,fontSize:15,flexShrink:0}}>‹</button>
        <button onClick={()=>{setExpanded(e=>!e);setShowCustom(false);}} style={{background:"none",border:"none",display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontFamily:"inherit",padding:"4px 6px"}}>
          <span style={{fontSize:14}}>📅</span>
          <span style={{fontSize:14,fontWeight:700,color:T.text}}>{label}</span>
          <span style={{fontSize:10,color:T.muted,transform:expanded?"rotate(180deg)":"none",transition:"transform 0.15s"}}>▾</span>
        </button>
        <button onClick={()=>step(1)} disabled={!canStep} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",cursor:canStep?"pointer":"default",opacity:canStep?1:0.35,color:T.sub,fontSize:15,flexShrink:0}}>›</button>
      </div>

      {expanded&&(
        <div style={{padding:"4px 14px 14px",borderTop:`1px solid ${T.border}`}}>
          {!showCustom?(
            <>
              {/* Year nav */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 4px 12px"}}>
                <button onClick={()=>setViewYear(y=>y-1)} disabled={!years.includes(viewYear-1)} style={{background:"none",border:"none",cursor:years.includes(viewYear-1)?"pointer":"default",opacity:years.includes(viewYear-1)?1:0.3,fontSize:16,color:T.sub}}>‹</button>
                <select value={viewYear} onChange={e=>setViewYear(parseInt(e.target.value))} style={{fontSize:14,fontWeight:700,color:T.text,background:"none",border:"none",fontFamily:"inherit",outline:"none",cursor:"pointer"}}>
                  {years.map(y=><option key={y} value={y}>{y}</option>)}
                </select>
                <button onClick={()=>setViewYear(y=>y+1)} disabled={!years.includes(viewYear+1)} style={{background:"none",border:"none",cursor:years.includes(viewYear+1)?"pointer":"default",opacity:years.includes(viewYear+1)?1:0.3,fontSize:16,color:T.sub}}>›</button>
              </div>

              {/* 12-month grid — tap one month, or press-drag across several for a range */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,userSelect:"none",touchAction:dragging?"none":"auto"}}>
                {MNAMES.map((name,i)=>{
                  const active=isEndpoint(i);
                  const within=inRange(i)&&!active;
                  return(
                    <button key={i}
                      onPointerDown={e=>{e.preventDefault();setDragStart(i);setDragEnd(i);}}
                      onPointerEnter={()=>{if(dragging)setDragEnd(i);}}
                      style={{
                        padding:"10px 0",borderRadius:8,border:"none",
                        background:active?T.accent:within?T.accentLight:"#F3F4F6",
                        color:active?"#fff":within?T.accent:T.sub,
                        fontSize:12,fontWeight:active?700:500,
                        cursor:"pointer",fontFamily:"inherit",
                      }}>{name}</button>
                  );
                })}
              </div>

              <button onClick={selectFullYear} style={{width:"100%",marginTop:10,background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"8px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Full year</button>
              <button onClick={()=>{setShowCustom(true);setCustomFrom(from);setCustomTo(to);}} style={{width:"100%",marginTop:6,background:"none",border:"none",padding:"6px",fontSize:11,fontWeight:600,color:T.blue,cursor:"pointer",fontFamily:"inherit"}}>Or pick exact custom dates →</button>
            </>
          ):(
            <div style={{padding:"10px 0"}}>
              <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:8}}>
                <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} style={{...selSm,flex:1,padding:"7px 8px",fontSize:12}}/>
                <span style={{fontSize:10,color:T.muted,fontWeight:700}}>→</span>
                <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} style={{...selSm,flex:1,padding:"7px 8px",fontSize:12}}/>
              </div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={applyCustom} style={{flex:1,background:T.blue,color:"#fff",border:"none",borderRadius:8,padding:"8px",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Apply</button>
                <button onClick={()=>setShowCustom(false)} style={{flex:1,background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"8px",fontWeight:600,fontSize:12,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>← Back to grid</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function Dashboard({transactions,accounts,filterFrom,filterTo,setFilterFrom,setFilterTo,onNavigate,feat={},sinkingFunds=[],budgets=[],moneySources=[]}){
  const getName=code=>((accounts.find(a=>a.code===code))||{name:code}).name;
  const[kpiSlide,setKpiSlide]=useState(0); // 0=income, 1=expense
  const[overviewTab,setOverviewTab]=useState("budget");

  const periodTxns=useMemo(()=>transactions.filter(t=>t.date>=filterFrom&&t.date<=filterTo),[transactions,filterFrom,filterTo]);
  const activePeriodTxns=useMemo(()=>periodTxns.filter(t=>!t.reversedBy&&!t.reversalOf),[periodTxns]);
  const totalIncome=useMemo(()=>activePeriodTxns.filter(t=>isIncomeSK(t.creditCode)).reduce((s,t)=>s+t.amount,0),[activePeriodTxns]);
  const totalExpenses=useMemo(()=>activePeriodTxns.filter(t=>isExpenseSK(t.debitCode)).reduce((s,t)=>s+t.amount,0),[activePeriodTxns]);
  const net=totalIncome-totalExpenses;

  // Previous period for % change
  const periodMs=new Date(filterTo)-new Date(filterFrom);
  const prevTo=new Date(new Date(filterFrom)-1).toISOString().split("T")[0];
  const prevFrom=new Date(new Date(filterFrom)-periodMs-1).toISOString().split("T")[0];
  const prevTxns=useMemo(()=>transactions.filter(t=>t.date>=prevFrom&&t.date<=prevTo&&!t.reversedBy&&!t.reversalOf),[transactions,prevFrom,prevTo]);
  const prevIncome=useMemo(()=>prevTxns.filter(t=>isIncomeSK(t.creditCode)).reduce((s,t)=>s+t.amount,0),[prevTxns]);
  const prevExpenses=useMemo(()=>prevTxns.filter(t=>isExpenseSK(t.debitCode)).reduce((s,t)=>s+t.amount,0),[prevTxns]);
  const incomePct=prevIncome>0?Math.round(((totalIncome-prevIncome)/prevIncome)*100):null;
  const expensePct=prevExpenses>0?Math.round(((totalExpenses-prevExpenses)/prevExpenses)*100):null;

  const cashBal=useMemo(()=>accounts.filter(a=>getSK(a.code)==="1900").reduce((s,a)=>s+transactions.reduce((ss,t)=>{if(t.debitCode===a.code)return ss+t.amount;if(t.creditCode===a.code)return ss-t.amount;return ss;},0),0),[accounts,transactions]);
  const arBal=useMemo(()=>accounts.filter(a=>getSK(a.code)==="1500").reduce((s,a)=>s+transactions.reduce((ss,t)=>{if(t.debitCode===a.code)return ss+t.amount;if(t.creditCode===a.code)return ss-t.amount;return ss;},0),0),[accounts,transactions]);
  const apBal=useMemo(()=>accounts.filter(a=>getSK(a.code)==="2400").reduce((s,a)=>s+transactions.reduce((ss,t)=>{if(t.debitCode===a.code)return ss+t.amount;if(t.creditCode===a.code)return ss-t.amount;return ss;},0),0),[accounts,transactions]);

  // Budget data — this period's own budget amounts (best-effort match to a calendar
  // month; rollover isn't factored in here, see the Budget screen for that detail)
  const dashPeriodDate=new Date(filterFrom);
  const dashY=dashPeriodDate.getFullYear(),dashM=dashPeriodDate.getMonth();
  const budgetMap=useMemo(()=>{
    const m={};
    (budgets||[]).filter(b=>b.year===dashY&&b.month===dashM).forEach(b=>{m[b.code]=b.amount;});
    return m;
  },[budgets,dashY,dashM]);
  const expAccounts=accounts.filter(a=>isExpenseSK(a.code));
  const totalBudget=expAccounts.reduce((s,a)=>s+(budgetMap[a.code]||0),0);
  const totalActual=expAccounts.reduce((s,a)=>s+activePeriodTxns.filter(t=>t.debitCode===a.code).reduce((ss,t)=>ss+t.amount,0),0);
  const budgetPct=totalBudget>0?Math.min(100,Math.round((totalActual/totalBudget)*100)):0;

  // Sinking funds
  const sfData=sinkingFunds||[];
  const totalSaved=sfData.reduce((s,f)=>s+(f.saved||0),0);
  const totalGoal=sfData.reduce((s,f)=>s+(f.goal||0),0);
  const sfPct=totalGoal>0?Math.min(100,Math.round((totalSaved/totalGoal)*100)):0;

  // Income/expense comparison bar pct
  const total=totalIncome+totalExpenses;
  const incPct=total>0?Math.round((totalIncome/total)*100):50;

  const PctBadge=({pct,invert=false})=>{
    if(pct===null)return null;
    const good=invert?(pct<=0):(pct>=0);
    return <span style={{fontSize:10,fontWeight:700,color:good?T.green:T.red,background:good?T.greenBg:T.redLight,borderRadius:6,padding:"2px 6px"}}>{pct>=0?"+":""}{pct}%</span>;
  };

  // Touch swipe for income/expense cards
  const slideRef=React.useRef(null);
  const touchStartX=React.useRef(null);
  const onTouchStart=(e)=>{touchStartX.current=e.touches[0].clientX;};
  const onTouchEnd=(e)=>{
    if(touchStartX.current===null)return;
    const dx=e.changedTouches[0].clientX-touchStartX.current;
    if(Math.abs(dx)>40){setKpiSlide(dx<0?1:0);}
    touchStartX.current=null;
  };

  return(
    <div>
      {/* 1 ── Swipeable Income / Expense cards ── */}
      <div ref={slideRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{marginBottom:12,position:"relative",userSelect:"none"}}>
        {/* Cards container */}
        <div style={{overflow:"hidden",borderRadius:18}}>
          <div style={{display:"flex",transition:"transform 0.3s ease",transform:`translateX(${kpiSlide*-100}%)`}}>
            {/* Income card */}
            <div style={{minWidth:"100%",background:`linear-gradient(135deg,${T.accent},#0A9396)`,borderRadius:18,padding:"20px 18px",boxShadow:`0 6px 20px rgba(13,115,119,0.25)`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                <div style={{fontSize:10,color:"rgba(255,255,255,0.6)",fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>Total Income</div>
                <PctBadge pct={incomePct}/>
              </div>
              <div style={{fontSize:30,fontWeight:900,color:"#fff",letterSpacing:-1,marginBottom:10}}>+{fmt(totalIncome)}</div>
              <div style={{background:"rgba(255,255,255,0.15)",borderRadius:6,height:5,overflow:"hidden",marginBottom:8}}>
                <div style={{width:`${incPct}%`,height:"100%",background:"rgba(255,255,255,0.8)",borderRadius:6}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:10,color:"rgba(255,255,255,0.6)"}}>vs expenses: {fmt(totalExpenses)}</span>
                <span style={{fontSize:10,color:"rgba(255,255,255,0.8)",fontWeight:700}}>Net {sign(net)}</span>
              </div>
            </div>
            {/* Expense card */}
            <div style={{minWidth:"100%",background:"linear-gradient(135deg,#B45309,#D97706)",borderRadius:18,padding:"20px 18px",boxShadow:"0 6px 20px rgba(180,83,9,0.25)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                <div style={{fontSize:10,color:"rgba(255,255,255,0.6)",fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>Total Expenses</div>
                <PctBadge pct={expensePct} invert/>
              </div>
              <div style={{fontSize:30,fontWeight:900,color:"#fff",letterSpacing:-1,marginBottom:10}}>−{fmt(totalExpenses)}</div>
              <div style={{background:"rgba(255,255,255,0.15)",borderRadius:6,height:5,overflow:"hidden",marginBottom:8}}>
                <div style={{width:`${100-incPct}%`,height:"100%",background:"rgba(255,255,255,0.8)",borderRadius:6}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:10,color:"rgba(255,255,255,0.6)"}}>vs income: {fmt(totalIncome)}</span>
                <span style={{fontSize:10,color:"rgba(255,255,255,0.8)",fontWeight:700}}>{totalIncome>0?Math.round((totalExpenses/totalIncome)*100):"—"}% of income</span>
              </div>
            </div>
          </div>
        </div>
        {/* Dot indicators */}
        <div style={{display:"flex",justifyContent:"center",gap:5,marginTop:8}}>
          {[0,1].map(i=>(
            <div key={i} onClick={()=>setKpiSlide(i)} style={{width:i===kpiSlide?16:6,height:6,borderRadius:3,background:i===kpiSlide?T.accent:T.border,cursor:"pointer",transition:"all 0.2s"}}/>
          ))}
        </div>
      </div>

      {/* 2 ── Bank cards slider ── */}
      <BankSlider accounts={accounts} transactions={transactions} filterFrom={filterFrom} filterTo={filterTo}/>

      {/* 3 ── KPI row: Cash, AR, AP ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
        {[
          {label:"Cash & Bank",val:cashBal,color:T.accent,icon:"🏦",nav:null},
          {label:"Receivables",val:arBal,color:T.green,icon:"📥",nav:"ledger_1500"},
          {label:"Payables",val:Math.abs(apBal),color:T.red,icon:"📤",nav:"ledger_2400"},
        ].map((c,i)=>(
          <div key={i} onClick={c.nav?()=>onNavigate(c.nav):undefined} style={{background:"#fff",borderRadius:14,padding:"12px 10px",border:`1px solid ${T.border}`,boxShadow:"0 1px 3px rgba(0,0,0,0.04)",cursor:c.nav?"pointer":"default"}}>
            <div style={{fontSize:15,marginBottom:5}}>{c.icon}</div>
            <div style={{fontSize:9,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>{c.label}</div>
            <div style={{fontSize:13,fontWeight:800,color:c.color}}>{fmt(c.val)}</div>
          </div>
        ))}
      </div>

      {/* 4 ── Net P/L ── */}
      <div style={{background:"#fff",borderRadius:14,border:`1px solid ${T.border}`,padding:"12px 16px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
        <div>
          <div style={{fontSize:10,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:3}}>Net Profit / Loss</div>
          <div style={{fontSize:22,fontWeight:900,color:net>=0?T.green:T.red}}>{sign(net)}</div>
        </div>
        <div style={{background:net>=0?T.greenBg:T.redLight,borderRadius:12,padding:"8px 14px",textAlign:"center"}}>
          <div style={{fontSize:9,color:T.muted,fontWeight:700,marginBottom:1}}>MARGIN</div>
          <div style={{fontSize:20,fontWeight:900,color:net>=0?T.green:T.red}}>{totalIncome>0?`${Math.round((net/totalIncome)*100)}%`:"—"}</div>
        </div>
      </div>

      
      {/* ── Budget / Sinking / Analytics tabs ── */}
      {(feat.budget!==false||feat.sinkingFunds!==false)&&(
        <div style={{background:"#fff",borderRadius:16,border:`1px solid ${T.border}`,overflow:"hidden",marginBottom:12,boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
          <div style={{display:"flex",borderBottom:`1px solid ${T.border}`}}>
            {[
              feat.budget!==false&&{id:"budget",label:"💰 Budget",nav:"Budget"},
              feat.sinkingFunds!==false&&{id:"sinking",label:"🎯 Sinking",nav:"SinkingFunds"},
              feat.whose!==false&&moneySources.length>0&&{id:"whose",label:"👤 Whose",nav:null},
              {id:"analytics",label:"📈 Analytics",nav:null}
            ].filter(Boolean).map(t=>(
              <button key={t.id} onClick={()=>t.nav?onNavigate(t.nav):setOverviewTab(t.id)} style={{flex:1,padding:"11px 4px",border:"none",background:overviewTab===t.id?T.accentLight:"#fff",color:overviewTab===t.id?T.accent:T.sub,fontSize:11,fontWeight:overviewTab===t.id?700:500,cursor:"pointer",fontFamily:"inherit",borderBottom:overviewTab===t.id?`2px solid ${T.accent}`:"2px solid transparent",transition:"all 0.15s"}}>{t.label}</button>
            ))}
          </div>

          {/* Budget progress */}
          {overviewTab!=="analytics"&&overviewTab!=="whose"&&<div style={{padding:"0 16px 14px",borderTop:`1px solid ${T.border}`}}>
            {feat.budget!==false&&totalBudget>0&&(
              <div style={{paddingTop:12}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                  <span style={{fontSize:11,color:T.sub}}>Budget</span>
                  <span style={{fontSize:11,fontWeight:700,color:totalActual>totalBudget?T.red:T.accent}}>{budgetPct}%</span>
                </div>
                <div style={{background:T.border,borderRadius:6,height:7,overflow:"hidden"}}>
                  <div style={{width:`${budgetPct}%`,height:"100%",background:totalActual>totalBudget?T.red:T.accent,borderRadius:6,transition:"width 0.4s"}}/>
                </div>
              </div>
            )}
            {feat.sinkingFunds!==false&&sfData.length>0&&(
              <div style={{paddingTop:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                  <span style={{fontSize:11,color:T.sub}}>Savings</span>
                  <span style={{fontSize:11,fontWeight:700,color:T.accent}}>{sfPct}%</span>
                </div>
                <div style={{background:T.border,borderRadius:6,height:7,overflow:"hidden"}}>
                  <div style={{width:`${sfPct}%`,height:"100%",background:T.accent,borderRadius:6,transition:"width 0.4s"}}/>
                </div>
              </div>
            )}
          </div>}

          {/* Whose mini panel — each source's running balance (money in via
              bank deposits minus money out), all-time, at a glance. */}
          {overviewTab==="whose"&&(()=>{
            const bankCodes=new Set(accounts.filter(a=>getSK(a.code)==="1900").map(a=>a.code));
            const rows=moneySources.filter(m=>!m.inactive).map(src=>{
              const tagged=transactions.filter(t=>t.moneySourceId===src.id&&(bankCodes.has(t.debitCode)||bankCodes.has(t.creditCode)));
              const balance=tagged.reduce((s,t)=>{if(bankCodes.has(t.debitCode))return s+t.amount;if(bankCodes.has(t.creditCode))return s-t.amount;return s;},0);
              return{id:src.id,name:src.name,balance};
            });
            return(
              <div style={{padding:"12px 16px 14px",borderTop:`1px solid ${T.border}`}}>
                {rows.map(r=>(
                  <div key={r.id} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",fontSize:12}}>
                    <span style={{color:T.text,fontWeight:600}}>{r.name}</span>
                    <span style={{fontWeight:800,color:r.balance>=0?T.green:T.red}}>{fmtBal(r.balance)}</span>
                  </div>
                ))}
                <button onClick={()=>onNavigate("Bank")} style={{width:"100%",marginTop:8,background:"none",border:"none",color:T.accent,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>Manage in Bank →</button>
              </div>
            );
          })()}

          {/* Analytics mini panel */}
          {overviewTab==="analytics"&&(()=>{
            const months=[];
            for(let i=2;i>=0;i--){
              const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);
              const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,"0");
              const f=`${y}-${m}-01`;const t=`${y}-${m}-${new Date(y,d.getMonth()+1,0).getDate()}`;
              const inc=transactions.filter(x=>x.date>=f&&x.date<=t&&!x.reversedBy&&!x.reversalOf&&isIncomeSK(x.creditCode)).reduce((s,x)=>s+x.amount,0);
              const exp=transactions.filter(x=>x.date>=f&&x.date<=t&&!x.reversedBy&&!x.reversalOf&&isExpenseSK(x.debitCode)).reduce((s,x)=>s+x.amount,0);
              months.push({label:d.toLocaleString("default",{month:"short"}),inc,exp,net:inc-exp});
            }
            const maxV=Math.max(...months.flatMap(m=>[m.inc,m.exp]),1);
            return(
              <div style={{padding:"14px 16px"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:14}}>
                  {[{l:"Income",v:totalIncome,c:T.accent},{l:"Expenses",v:totalExpenses,c:T.orange},{l:"Net",v:net,c:net>=0?T.green:T.red}].map((k,i)=>(
                    <div key={i} style={{background:T.bg,borderRadius:10,padding:"8px 6px",textAlign:"center",border:`1px solid ${T.border}`}}>
                      <div style={{fontSize:9,color:T.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:3}}>{k.l}</div>
                      <div style={{fontSize:12,fontWeight:800,color:k.c}}>{sign(k.v)}</div>
                    </div>
                  ))}
                </div>
                {/* Mini bar chart */}
                <div style={{display:"flex",gap:8,alignItems:"flex-end",height:60,marginBottom:6}}>
                  {months.map((m,i)=>(
                    <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center"}}>
                      <div style={{width:"100%",display:"flex",gap:2,alignItems:"flex-end",height:46}}>
                        <div style={{flex:1,background:T.accent,borderRadius:"3px 3px 0 0",height:`${Math.max((m.inc/maxV)*46,2)}px`,opacity:0.85}}/>
                        <div style={{flex:1,background:T.orange,borderRadius:"3px 3px 0 0",height:`${Math.max((m.exp/maxV)*46,2)}px`,opacity:0.85}}/>
                      </div>
                      <div style={{fontSize:9,color:T.muted,marginTop:3,fontWeight:600}}>{m.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:10,justifyContent:"center"}}>
                  {[{c:T.accent,l:"Income"},{c:T.orange,l:"Expenses"}].map((x,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:8,height:8,background:x.c,borderRadius:2}}/><span style={{fontSize:9,color:T.sub}}>{x.l}</span></div>
                  ))}
                </div>
                <button onClick={()=>onNavigate("Reports")} style={{...btnSm,width:"100%",marginTop:10,textAlign:"center"}}>Full Analytics →</button>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// Simple conic-gradient donut/pie chart — no external chart library needed.
function ConicChart({data,size=132,donut=true}){
  const total=data.reduce((s,d)=>s+d.value,0)||1;
  let acc=0;
  const stops=data.map(d=>{
    const start=(acc/total)*360;acc+=d.value;const end=(acc/total)*360;
    return `${d.color} ${start}deg ${end}deg`;
  }).join(", ");
  return(
    <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
      <div style={{width:size,height:size,borderRadius:"50%",background:data.length?`conic-gradient(${stops})`:"#F1EFE8"}}/>
      {donut&&<div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:size*0.58,height:size*0.58,borderRadius:"50%",background:"#fff"}}/>}
    </div>
  );
}

// Assistant — static feature guidance, not a chatbot. Organized by workflow
// so a new user (or someone who's forgotten where something lives) can find
// the answer in a few seconds without leaving the app.
const ASSISTANT_TOPICS=[
  {icon:"ti-receipt-2",title:"Recording a transaction",body:"Voucher → New voucher for a supplier invoice or receipt with a document attached, or Voucher → New entry for a plain manual debit/credit. AI bookkeeping (under Voucher) lets you type or photograph a receipt instead — it reads the amount, date, and vendor and drafts the entry for you. Voucher → Inbox holds anything uploaded but not yet turned into an entry; Voucher → Import Excel bulk-imports vouchers from a spreadsheet."},
  {icon:"ti-file-invoice",title:"Invoicing a customer",body:"Invoice → New invoice: pick the customer, a 3xxx sale account, the month(s) covered, and a rate — it calculates the total and posts to Receivable automatically. Once paid, use Pay on that invoice in Invoice overview to register the payment and auto-match it. Need to reverse one instead of deleting it? Use CN (credit note). Recurring invoices sets up ones that repeat on a schedule; Quotes lets you send an estimate first and convert it to an invoice once accepted."},
  {icon:"ti-building-bank",title:"Reconciling the bank",body:"Bank reconciliation → upload a CSV or Excel statement export (flexible column order — Date + Amount, or Debit/Credit, or a running Balance), or a bank statement PDF — an AI-based reader handles this if an Anthropic API key is set (Company → Settings), otherwise a free built-in text-extraction fallback runs automatically (works on real-text PDFs, not scanned images). Unmatched lines show on the right; tick one, choose which account it offsets, and Post — that creates the real ledger entry and marks it matched. Click the comment icon on any line to leave a note on that transaction — it's saved and stays attached to it."},
  {icon:"ti-wallet",title:"Whose money is in the bank (money sources)",body:"Bank → Whose tracks money inside a bank account that belongs to specific people or purposes (e.g. client funds, partner shares) separately from the company's own balance — tag transactions to a source and it keeps a running received/used/remaining total per source, per bank."},
  {icon:"ti-users",title:"Customers, suppliers, and aging",body:"Customers/Suppliers holds contact records — adding a new one for a Norwegian company can auto-fill name, org number, address, email, and phone straight from Brønnøysundregisteret (Brreg) just by typing the name. Accounting → Customer/Supplier Ledger shows open items grouped by contact with due dates — click a Bilag to see the entry, or select two or more entries that net to zero and Match them off. Aged receivables/payables ages everything outstanding by how overdue it is."},
  {icon:"ti-report-analytics",title:"Accounting reports",body:"Income statement and Balance sheet are real grouped reports with drill-down — click any account line to jump to its ledger. Trial balance and General ledger give you every account's opening/movement/closing, with sticky headers while scrolling. VAT report shows sales and purchase VAT with a net position; Mva-meldinger (VAT filings) groups the same activity by filing period, drilling further down into VAT rate and then individual account, mirroring how a real VAT return is structured. VAT codes lists the codes in use."},
  {icon:"ti-chart-bar",title:"Analytics, budgets, and sinking funds",body:"Reports → Analytics gives dashboards and trends; Sales per customer and Balance lists break revenue and balances down further. Budget lets you set targets per account/period and compares them to actuals. Sinking funds tracks money being set aside over time toward a future goal or obligation."},
  {icon:"ti-building",title:"Company setup",body:"Company → Company information holds your registered details; Chart of accounts manages the account list; Employees and Payroll handle staff and pay runs; Import account information brings in a chart of accounts via SAF-T. Point of sale (Checkout, Products) is a separate till-style module for direct sales."},
  {icon:"ti-building-community",title:"Multiple companies",body:"If you manage more than one company, use the switcher at the top of the screen (your company name/logo area) to jump between them — it lists every company you have access to and shows which one is active. Admins can add new companies from Admin Panel → Companies, and remove one there too (you always need at least one left)."},
  {icon:"ti-users-group",title:"Accountants and client access",body:"If you're managing books for other people, the same top switcher also lists any client companies you've been given access to — switching there shows their books without leaving your own account. An admin can invite a new client from that switcher."},
  {icon:"ti-download",title:"Exporting your data",body:"The download icon in the top bar exports whatever screen you're on — PDF always works, Excel is available on Reskontro, the Accounts list, and an open account ledger. Settings → Backup & Restore downloads everything as one file — your full data, any time."},
  {icon:"ti-shield-lock",title:"Security",body:"Profile → Two-factor authentication adds a real authenticator-app step to sign-in. Admin Panel → Audit Trail (if you're an admin) shows every create, edit, delete, and reversal on transactions and invoices — nothing there can be changed after the fact."},
  {icon:"ti-list-numbers",title:"How the chart of accounts (account plan) works",body:"This app uses the Norwegian standard account plan (NS 4102) — every account has a 4-digit code that tells you what kind of account it is just from the first digit: 1xxx is assets (bank, receivables, inventory), 2xxx is equity and liabilities (payables, loans, tax owed), 3xxx is revenue/sales, 4xxx–7xxx are expenses (cost of goods, payroll, rent, other operating costs), 8xxx is financial income/expense. So a supplier invoice normally debits a 4xxx–7xxx expense and credits 2400 (accounts payable); a sale normally credits a 3xxx account and debits 1500 (accounts receivable). Manage the full list at Company → Chart of accounts — you can add custom codes, but keeping them in the right number range keeps the reports meaningful."},
  {icon:"ti-help-circle",title:"My bank file won't import / gives an error",body:"For CSV/Excel bank statements: the file needs at least a date column and an amount (or separate debit/credit, or a running balance column) — column order doesn't matter, but very unusual header names can fail to match; try renaming headers to something like Date/Amount/Description. For PDF statements: if you see \"Couldn't find any transaction-looking lines,\" the PDF is likely a scanned image with no real text in it — a CSV/Excel export from the bank (if available) will always work better than a scanned PDF; alternatively add an Anthropic API key in Company → Settings for the more accurate AI reader. If it says \"PDF reader didn't load,\" it's a connectivity hiccup — refresh and try again."},
  {icon:"ti-help-circle",title:"My customer/supplier import isn't working",body:"\"No usable rows found\" almost always means the file's Name column wasn't recognized — the error message shows exactly which column headers were detected in your file; rename whichever one holds the contact's name to \"Name\" (or \"Navn\") and re-upload. Rows with no name are always skipped and reported as a count, even on a successful import — that's expected, not a bug, if a few rows in the source file were genuinely blank."},
  {icon:"ti-compass",title:"Finding your way around",body:"The left sidebar is grouped by workflow, not alphabetically: Bank (Whose, Bank reconciliation), Customers/Suppliers, Voucher (for recording costs/receipts), Invoice (for billing customers), Accounting (ledgers and VAT), Reports (analytics/budget), Company (setup, employees, payroll), and Point of sale. If you're not sure where something lives, it's almost always under the group named after what you're trying to do (billing → Invoice, recording a cost → Voucher)."},
  {icon:"ti-alert-triangle",title:"\"My data looks wrong or missing\"",body:"First check the company switcher at the top — if you or your accountant manage more than one company, it's easy to be looking at the wrong one. If a specific number looks off, click through to the underlying ledger (most reports let you click an account or line to drill down) rather than guessing — that shows the real entries behind the total. If something still looks genuinely wrong after checking both, that's worth reporting to whoever administers your account rather than editing entries speculatively — Admin Panel → Audit Trail can show exactly what changed and when."},
];
const ASSISTANT_CONTEXT=ASSISTANT_TOPICS.map(t=>`${t.title}: ${t.body}`).join("\n\n");

// Assistant — a real chat widget (bottom-right popup), calling the same
// Claude API pattern used elsewhere in the app (AI bookkeeping, OCR). Answers
// free-form questions about how to use the software, grounded in the actual
// feature list above rather than inventing capabilities that don't exist.
function AssistantPanel({onClose}){
  const[messages,setMessages]=useState([{role:"assistant",content:"Hi! Ask me anything about using RedRock Ledger — how a feature works, where to find something, or why an upload/import isn't behaving.",isGreeting:true}]);
  const[input,setInput]=useState("");
  const[sending,setSending]=useState(false);
  const scrollRef=React.useRef(null);
  useEffect(()=>{if(scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight;},[messages,sending]);

  const send=async()=>{
    const text=input.trim();
    if(!text||sending)return;
    const userMsg={role:"user",content:text};
    const newMessages=[...messages,userMsg];
    setMessages(newMessages);
    setInput("");
    setSending(true);
    try{
      const systemPrompt=`You are the in-app support assistant for RedRock Ledger, a double-entry accounting web app. You help anyone from a first-time user to an accountant — assume no prior knowledge unless the question shows otherwise, and explain in plain, simple language, not accounting jargon. Answer questions about HOW TO USE THE SOFTWARE, basic technical/troubleshooting issues (e.g. an import or upload not working), and simple explanations of how the software's own concepts work (e.g. what the account plan numbers mean) — grounded only in the list below; don't invent features, screens, or behavior that aren't listed. When the answer involves doing something in the app, name the exact menu path (e.g. "Voucher → New entry") so they can find it without hunting. Keep answers to 2-4 sentences unless real step-by-step detail is genuinely needed, in which case use short numbered steps. If something sounds like a real bug rather than a how-to question and nothing below explains it, say so plainly and suggest they report it with a screenshot, instead of guessing. If asked for accounting, tax, or legal advice (as opposed to how the software works), say you're a feature guide, not an accountant, and suggest a qualified professional.\n\nFEATURES AND SUPPORT TOPICS:\n${ASSISTANT_CONTEXT}`;
      const apiMessages=newMessages.filter(m=>!m.isGreeting).map(m=>({role:m.role,content:m.content}));
      const{data,error}=await callClaudeAPI({model:"claude-sonnet-4-6",max_tokens:500,system:systemPrompt,messages:apiMessages});
      if(error==="NO_KEY"){
        setMessages(p=>[...p,{role:"assistant",content:"I need an Anthropic API key to answer — add one in Company → Settings (it's stored only in this browser, never shared)."}]);
        setSending(false);return;
      }
      if(error){
        setMessages(p=>[...p,{role:"assistant",content:"Something went wrong reaching the assistant: "+error}]);
        setSending(false);return;
      }
      const replyText=(data.content||[]).map(b=>b.text||"").join("").trim();
      setMessages(p=>[...p,{role:"assistant",content:replyText||"I couldn't come up with an answer just now — try rephrasing?"}]);
    }catch(e){
      setMessages(p=>[...p,{role:"assistant",content:"Something went wrong reaching the assistant. Try again in a moment."}]);
    }
    setSending(false);
  };

  return(
    <div style={{position:"fixed",bottom:20,right:20,zIndex:800,width:360,maxWidth:"calc(100vw - 32px)",height:520,maxHeight:"calc(100vh - 90px)",background:"#fff",borderRadius:16,boxShadow:"0 20px 50px rgba(0,0,0,0.22)",display:"flex",flexDirection:"column",overflow:"hidden",border:`1px solid ${T.border}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",background:T.accent,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <i className="ti ti-sparkles" style={{fontSize:16,color:"#fff"}}/>
          <span style={{fontSize:14,fontWeight:800,color:"#fff"}}>Assistant</span>
        </div>
        <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:"#fff"}}>✕</button>
      </div>
      <div ref={scrollRef} style={{flex:1,overflowY:"auto",padding:14,display:"flex",flexDirection:"column",gap:10,background:T.bg}}>
        {messages.map((m,i)=>(
          <div key={i} style={{alignSelf:m.role==="user"?"flex-end":"flex-start",maxWidth:"85%",background:m.role==="user"?T.accent:"#fff",color:m.role==="user"?"#fff":T.text,border:m.role==="user"?"none":`1px solid ${T.border}`,borderRadius:14,padding:"9px 13px",fontSize:13,lineHeight:1.5,whiteSpace:"pre-wrap"}}>
            {m.content}
          </div>
        ))}
        {sending&&<div style={{alignSelf:"flex-start",background:"#fff",border:`1px solid ${T.border}`,borderRadius:14,padding:"9px 13px",fontSize:12,color:T.muted}}>Thinking…</div>}
      </div>
      <div style={{display:"flex",gap:8,padding:12,borderTop:`1px solid ${T.border}`,flexShrink:0,background:"#fff"}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")send();}} placeholder="Ask a question…" style={{...inp,flex:1,height:36,fontSize:13}}/>
        <button onClick={send} disabled={sending||!input.trim()} style={{background:T.accent,color:"#fff",border:"none",borderRadius:8,width:36,height:36,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,opacity:sending||!input.trim()?0.5:1}}><i className="ti ti-send" style={{fontSize:15}}/></button>
      </div>
    </div>
  );
}

// First-run onboarding — three quick steps: company basics, a look at the
// chart of accounts already set up, and a nudge to the first real entry.
// Skippable at every step; never shown again once dismissed or once real
// data exists.
function OnboardingWizard({companyProfile,saveCompanyProfile,accounts,onFinish,onSkip}){
  const[step,setStep]=useState(0);
  const[name,setName]=useState(companyProfile.companyName||"");
  const[country,setCountry]=useState(companyProfile.country||"PK");
  const[currency,setCurrency]=useState(companyProfile.currency||"PKR");

  // Country drives which currency makes sense by default, and gates
  // Norway-specific features (VAT reports, Mva-meldinger) elsewhere in the
  // app — capturing it here means those features are correctly available
  // or hidden from the very first session, instead of a new user having to
  // discover a Country field buried in Company Settings later.
  const onCountryChange=c=>{
    setCountry(c);
    if(c==="NO")setCurrency("NOK");
    else if(c==="PK")setCurrency("PKR");
  };

  const saveAndNext=()=>{
    saveCompanyProfile({...companyProfile,companyName:name,country,currency});
    setStep(1);
  };

  const steps=[
    {
      title:"Welcome — let's set up your company",
      body:(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div>
            <div style={{fontSize:11,color:"#64748B",marginBottom:4,fontWeight:600}}>Company name</div>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your business name" style={{...inp}}/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#64748B",marginBottom:4,fontWeight:600}}>Country</div>
            <select value={country} onChange={e=>onCountryChange(e.target.value)} style={{...inp}}>
              <option value="PK">Pakistan</option>
              <option value="NO">Norway</option>
            </select>
          </div>
          <div>
            <div style={{fontSize:11,color:"#64748B",marginBottom:4,fontWeight:600}}>Currency</div>
            <select value={currency} onChange={e=>setCurrency(e.target.value)} style={{...inp}}>
              <option>PKR</option><option>NOK</option><option>USD</option><option>EUR</option><option>GBP</option>
            </select>
          </div>
        </div>
      ),
      action:{label:"Continue",onClick:saveAndNext,disabled:!name.trim()},
    },
    {
      title:"Your chart of accounts is ready",
      body:(
        <div>
          <p style={{fontSize:13,color:"#64748B",marginBottom:14,lineHeight:1.6}}>We've set up a standard double-entry chart of accounts — {accounts.length} accounts covering assets, liabilities, equity, income, and expenses. You can add, rename, or remove any of them later from Settings → Account Plan.</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {accounts.slice(0,10).map(a=>(
              <span key={a.code} style={{fontSize:11,background:"#F1F5F9",color:"#475569",padding:"4px 10px",borderRadius:20,fontWeight:600}}>{a.code} {a.name}</span>
            ))}
            {accounts.length>10&&<span style={{fontSize:11,color:"#94A3B8",padding:"4px 10px"}}>+{accounts.length-10} more</span>}
          </div>
        </div>
      ),
      action:{label:"Continue",onClick:()=>setStep(2)},
    },
    {
      title:"Ready to record your first entry",
      body:(
        <p style={{fontSize:13,color:"#64748B",lineHeight:1.6}}>Use <b>Voucher → New voucher</b> for a supplier invoice or receipt, <b>Voucher → New entry</b> for a plain manual entry, or just type or photograph a receipt with <b>AI bookkeeping</b> and let it draft the entry for you. The Assistant button (top right, on desktop) has quick guidance any time you need it.</p>
      ),
      action:{label:"Get started",onClick:onFinish},
    },
  ];
  const current=steps[step];

  return(
    <div style={{position:"fixed",inset:0,background:"#FAF9F7",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"system-ui,sans-serif"}}>
      <div style={{maxWidth:440,width:"100%",background:"#fff",borderRadius:20,padding:32,boxShadow:"0 20px 60px rgba(0,0,0,0.1)",border:"1px solid #E2E8F0"}}>
        <div style={{display:"flex",gap:6,marginBottom:24}}>
          {steps.map((_,i)=>(
            <div key={i} style={{flex:1,height:4,borderRadius:2,background:i<=step?T.accent:"#E2E8F0"}}/>
          ))}
        </div>
        <div style={{fontSize:18,fontWeight:800,color:"#0F172A",marginBottom:16}}>{current.title}</div>
        <div style={{marginBottom:24}}>{current.body}</div>
        <button onClick={current.action.onClick} disabled={current.action.disabled} style={{width:"100%",background:current.action.disabled?"#E2E8F0":T.accent,color:current.action.disabled?"#94A3B8":"#fff",border:"none",borderRadius:12,padding:"13px",fontWeight:700,fontSize:14,cursor:current.action.disabled?"default":"pointer",fontFamily:"inherit",marginBottom:10}}>{current.action.label}</button>
        <button onClick={onSkip} style={{width:"100%",background:"none",border:"none",color:"#94A3B8",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Skip setup</button>
      </div>
    </div>
  );
}

// Desktop-reflowed Dashboard: KPI cards with delta-vs-previous-period badges,
// a donut (balance sheet mix) + pie (expense mix) pair, an activity feed, and
// a filterable recent-entries table. Manerty-inspired layout, teal identity.
function DesktopDashboard({transactions,accounts,contacts,budgets=[],onNavigate,recentTabs=[],tabLabels={},auditLog=[],profile,companyProfile}){
  const entriesToday=useMemo(()=>{
    const today=new Date().toISOString().slice(0,10);
    return auditLog.filter(a=>a.entityType==="transaction"&&a.action==="create"&&a.createdAt&&a.createdAt.slice(0,10)===today).length;
  },[auditLog]);
  // Dashboard is intentionally all-time — no date filter here. If you need a
  // specific period, use Trial Balance or Reports, which each have their own.
  const today=new Date().toISOString().slice(0,10);
  const oneMonthAgo=(()=>{const d=new Date();d.setMonth(d.getMonth()-1);return d.toISOString().slice(0,10);})();

  const balAt=(code,asOf)=>transactions.filter(t=>t.date<=asOf).reduce((s,t)=>{if(t.debitCode===code)return s+t.amount;if(t.creditCode===code)return s-t.amount;return s;},0);
  const seriesBalAt=(sk,asOf)=>accounts.filter(a=>getSK(a.code)===sk).reduce((s,a)=>s+balAt(a.code,asOf),0);

  const cashNow=seriesBalAt("1900",today), cashPrev=seriesBalAt("1900",oneMonthAgo);
  const arNow=seriesBalAt("1500",today), arPrev=seriesBalAt("1500",oneMonthAgo);
  const apNow=seriesBalAt("2400",today), apPrev=seriesBalAt("2400",oneMonthAgo);

  // Excludes reversed/reversal entries — same rule the rest of the app's
  // income/expense reporting uses (Dashboard's own period KPIs, Analytics,
  // Budget, Monthly), so a corrected mistake isn't counted twice.
  const income=useMemo(()=>transactions.filter(t=>!t.reversedBy&&!t.reversalOf&&isIncomeSK(t.creditCode)).reduce((s,t)=>s+t.amount,0),[transactions]);
  const expense=useMemo(()=>transactions.filter(t=>!t.reversedBy&&!t.reversalOf&&isExpenseSK(t.debitCode)).reduce((s,t)=>s+t.amount,0),[transactions]);
  const net=income-expense;
  const incomePrev=useMemo(()=>transactions.filter(t=>!t.reversedBy&&!t.reversalOf&&isIncomeSK(t.creditCode)&&t.date<=oneMonthAgo).reduce((s,t)=>s+t.amount,0),[transactions,oneMonthAgo]);
  const expensePrev=useMemo(()=>transactions.filter(t=>!t.reversedBy&&!t.reversalOf&&isExpenseSK(t.debitCode)&&t.date<=oneMonthAgo).reduce((s,t)=>s+t.amount,0),[transactions,oneMonthAgo]);
  const netPrev=incomePrev-expensePrev;

  const getName=code=>((accounts.find(a=>a.code===code))||{name:code}).name;

  const kpis=[
    {label:"Cash and bank",value:cashNow,delta:cashNow-cashPrev,goTo:"Bank"},
    {label:"Receivable",value:arNow,delta:arNow-arPrev,goTo:"Reskontro"},
    {label:"Payable",value:apNow,delta:apNow-apPrev,goTo:"Reskontro"},
    {label:"Net profit",value:net,delta:net-netPrev,goTo:"Resultat"},
  ];

  const donutData=[
    {label:"Cash and bank",value:Math.max(0,cashNow),color:"#0D7377"},
    {label:"Receivable",value:Math.max(0,arNow),color:"#5DCAA5"},
    {label:"Payable",value:Math.max(0,apNow),color:"#D3D1C7"},
  ];

  const expenseByAcct=useMemo(()=>{
    const m={};
    transactions.filter(t=>!t.reversedBy&&!t.reversalOf&&isExpenseSK(t.debitCode)).forEach(t=>{m[t.debitCode]=(m[t.debitCode]||0)+t.amount;});
    return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,5);
  },[transactions]);
  const pieColors=["#0D7377","#5DCAA5","#D85A30","#888780","#EF9F27"];
  const pieData=expenseByAcct.map(([code,amt],i)=>({label:getName(code),value:amt,color:pieColors[i%pieColors.length]}));

  const[entryFilter,setEntryFilter]=useState("all");
  const filteredEntries=useMemo(()=>{
    const sorted=[...transactions].sort((a,b)=>b.bilag-a.bilag);
    if(entryFilter==="income")return sorted.filter(t=>isIncomeSK(t.creditCode));
    if(entryFilter==="expense")return sorted.filter(t=>isExpenseSK(t.debitCode));
    if(entryFilter==="unreconciled")return sorted.filter(t=>!t.matchedWith);
    return sorted;
  },[transactions,entryFilter]);
  const counts={
    all:transactions.length,
    income:transactions.filter(t=>isIncomeSK(t.creditCode)).length,
    expense:transactions.filter(t=>isExpenseSK(t.debitCode)).length,
    unreconciled:transactions.filter(t=>!t.matchedWith).length,
  };

  const activity=[...transactions].sort((a,b)=>b.bilag-a.bilag).slice(0,6);

  // Editable homescreen — show/hide widgets, persisted per device.
  const WIDGET_KEY="rr_dashboard_widgets";
  const[widgets,setWidgets]=useState(()=>{try{return{kpis:true,charts:true,entries:true,activity:true,recent:true,banks:true,...JSON.parse(localStorage.getItem(WIDGET_KEY)||"{}")};}catch{return{kpis:true,charts:true,entries:true,activity:true,recent:true,banks:true};}});
  const[customizing,setCustomizing]=useState(false);
  const toggleWidget=(key)=>setWidgets(p=>{const n={...p,[key]:!p[key]};try{localStorage.setItem(WIDGET_KEY,JSON.stringify(n));}catch{}return n;});
  const WIDGET_LABELS={kpis:"KPI cards",charts:"Balance & expense charts",entries:"Entries table",activity:"Activity feed",recent:"Recently viewed",banks:"Bank accounts"};

  // Same bordered-panel-with-header-band look used everywhere else in the
  // desktop app now (Voucher details, Postings, Admin panel) — a plain
  // title bar with its own background/border, not a floating bold label
  // inside an otherwise undivided card. Every widget below is built from
  // these three pieces instead of each rolling its own header treatment.
  const card={background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden",boxShadow:"0 1px 2px rgba(15,42,38,0.03)"};
  const cardHead={padding:"9px 14px",borderBottom:`1px solid ${T.border}`,background:T.bg,fontSize:12,fontWeight:700,color:T.sub};
  const cardBody={padding:16};

  const firstName=(profile&&(profile.display_name||profile.email)||"there").split(/[ @]/)[0];
  const greetHour=new Date().getHours();
  const greeting=greetHour<12?"Good morning":greetHour<18?"Good afternoon":"Good evening";
  const todayLabel=new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:22,position:"relative"}}>
        <div>
          <div style={{fontSize:21,fontWeight:800,color:T.text,letterSpacing:-0.3,marginBottom:4}}>{greeting}, {firstName.charAt(0).toUpperCase()+firstName.slice(1)}</div>
          <div style={{fontSize:12.5,color:T.muted,display:"flex",alignItems:"center",gap:10}}>
            <span>{todayLabel}</span>
            {entriesToday>0&&(
              <span onClick={()=>onNavigate&&onNavigate("Entries")} style={{color:T.waterTeal,fontWeight:700,cursor:onNavigate?"pointer":"default",display:"flex",alignItems:"center",gap:4}}>
                <span style={{width:4,height:4,borderRadius:"50%",background:T.border,display:"inline-block"}}/>
                <i className="ti ti-circle-check" style={{fontSize:13}}/>{entriesToday} entr{entriesToday===1?"y":"ies"} recorded today
              </span>
            )}
          </div>
        </div>
        <button onClick={()=>setCustomizing(o=>!o)} style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,padding:"8px 14px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 1px 2px rgba(15,42,38,0.03)"}}><i className="ti ti-layout-grid" style={{fontSize:13,marginRight:5}}/>Customize</button>
        {customizing&&(<>
          <div onClick={()=>setCustomizing(false)} style={{position:"fixed",inset:0,zIndex:490}}/>
          <div style={{position:"absolute",right:0,top:44,background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,zIndex:500,minWidth:220,boxShadow:"0 8px 24px rgba(0,0,0,0.14)",padding:14}}>
            <div style={{fontSize:12,fontWeight:800,color:T.text,marginBottom:10}}>Show on dashboard</div>
            {Object.keys(WIDGET_LABELS).map(key=>(
              <label key={key} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:T.sub,padding:"6px 0",cursor:"pointer"}}>
                <input type="checkbox" checked={widgets[key]} onChange={()=>toggleWidget(key)}/>{WIDGET_LABELS[key]}
              </label>
            ))}
          </div>
        </>)}
      </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:20,alignItems:"start"}}>
      <div>
        {widgets.kpis&&<div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:16}}>
          {kpis.map(k=>{
            const positive=k.delta>=0;
            const KPI_CHIP={"Cash and bank":{bg:"rgba(13,148,136,0.14)",fg:"#0D9488",icon:"ti-droplet"},"Receivable":{bg:"rgba(14,159,110,0.14)",fg:"#0E9F6E",icon:"ti-arrow-down-right"},"Payable":{bg:"rgba(225,72,72,0.12)",fg:"#E14848",icon:"ti-arrow-up-right"},"Net profit":{bg:T.coralLight,fg:T.coral,icon:"ti-chart-line"}};
            const chip=KPI_CHIP[k.label]||{bg:T.accentLight,fg:T.accent,icon:"ti-report-money"};
            // Flat bordered box — no blur/glass, no big soft glow shadow —
            // matching the plain panel look used everywhere else now. The
            // icon shrinks to a small inline marker next to the label
            // instead of its own bubble, so the card reads as data first.
            return(
              <div key={k.label} onClick={()=>onNavigate&&k.goTo&&onNavigate(k.goTo)} style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,padding:"14px 16px",cursor:k.goTo?"pointer":"default",boxShadow:"0 1px 2px rgba(15,42,38,0.03)"}} className={k.goTo?"rr-sidebar-item":""}>
                <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:10}}>
                  <div style={{width:22,height:22,borderRadius:6,background:chip.bg,color:chip.fg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><i className={`ti ${chip.icon}`} style={{fontSize:12}}/></div>
                  <div style={{fontSize:11.5,color:T.sub,fontWeight:600}}>{k.label}</div>
                </div>
                <div style={{fontSize:20,fontWeight:800,color:T.text,marginBottom:8}}>{fmt(k.value)}</div>
                <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:6,background:positive?T.greenBg:T.redLight,color:positive?T.green:T.red}}>{positive?"+":"−"}{fmt(Math.abs(k.delta))}</span>
                <span style={{fontSize:10,color:T.muted,marginLeft:6}}>vs last month</span>
              </div>
            );
          })}
        </div>}

        {widgets.charts&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:16}}>
          <div style={card}>
            <div style={cardHead}>Balance composition</div>
            <div style={{...cardBody,display:"flex",alignItems:"center",gap:20}}>
              <ConicChart data={donutData}/>
              <div style={{display:"flex",flexDirection:"column",gap:9}}>
                {donutData.map(d=>(
                  <div key={d.label} style={{display:"flex",alignItems:"center",gap:7,fontSize:12,color:T.sub}}>
                    <span style={{width:9,height:9,borderRadius:3,background:d.color,display:"inline-block",flexShrink:0}}/>
                    <span>{d.label}</span>
                    <span style={{fontWeight:700,color:T.text,marginLeft:2}}>{fmt(Math.abs(d.value))}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={card}>
            <div style={cardHead}>Top expense categories (all time)</div>
            <div style={{...cardBody,display:"flex",alignItems:"center",gap:20}}>
              <ConicChart data={pieData} donut={false}/>
              <div style={{display:"flex",flexDirection:"column",gap:9}}>
                {pieData.length?pieData.map(d=>(
                  <div key={d.label} style={{display:"flex",alignItems:"center",gap:7,fontSize:12,color:T.sub}}>
                    <span style={{width:9,height:9,borderRadius:3,background:d.color,display:"inline-block",flexShrink:0}}/>
                    <span>{d.label}</span>
                    <span style={{fontWeight:700,color:T.text,marginLeft:2}}>{fmt(d.value)}</span>
                  </div>
                )):<div style={{fontSize:12,color:T.muted}}>No expenses yet.</div>}
              </div>
            </div>
          </div>
        </div>}

        {widgets.entries&&<div style={card}>
          <div style={{...cardHead,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>All entries</span>
            {/* Flat segmented tabs — same convention as the entry-type
                switcher and Admin panel's tab bar — instead of fully-rounded
                filter pills, which read as a different, older UI language
                than the rest of the desktop app now. */}
            <div style={{display:"flex",gap:6}}>
              {[["all","All"],["income","Income"],["expense","Expense"],["unreconciled","Unreconciled"]].map(([key,label])=>(
                <button key={key} onClick={()=>setEntryFilter(key)} style={{background:entryFilter===key?T.accent:"none",color:entryFilter===key?"#fff":T.sub,border:`1px solid ${entryFilter===key?T.accent:T.border}`,borderRadius:8,padding:"5px 12px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{label} <span style={{opacity:0.75}}>{counts[key]}</span></button>
              ))}
            </div>
          </div>
          <div style={cardBody}>
          <table className="rr-sticky-thead" style={{width:"100%",fontSize:13,borderCollapse:"collapse"}}>
            <thead><tr style={{color:T.muted,fontSize:10.5,fontWeight:700,textTransform:"uppercase",letterSpacing:0.4}}>
              <td style={{padding:"0 0 10px"}}>Bilag</td><td>Date</td><td>Description</td><td style={{textAlign:"right"}}>Amount</td>
            </tr></thead>
            <tbody>
              {filteredEntries.slice(0,10).map(t=>{
                const isIn=isIncomeSK(t.creditCode);
                return(
                  <tr key={t.id} style={{borderTop:`1px solid ${T.border}`}} className="rr-sidebar-item">
                    <td style={{padding:"11px 0",color:T.accent,fontWeight:700}}>{fmtB(t.bilag)}</td>
                    <td style={{color:T.sub}}>{t.date}</td>
                    <td style={{color:T.text}}>{t.description}</td>
                    <td style={{textAlign:"right",fontWeight:700,color:isIn?T.green:T.text}}>{fmt(t.amount)}</td>
                  </tr>
                );
              })}
              {!filteredEntries.length&&<tr><td colSpan="4" style={{padding:"24px 0",textAlign:"center",color:T.muted}}>No entries match this filter.</td></tr>}
            </tbody>
          </table>
          </div>
        </div>}
      </div>

      {widgets.activity&&<div style={card}>
        <div style={cardHead}>Activity</div>
        <div style={{...cardBody,display:"flex",flexDirection:"column",gap:15}}>
          {activity.map(t=>{
            const isIn=isIncomeSK(t.creditCode);
            return(
              <div key={t.id} style={{display:"flex",gap:11,alignItems:"flex-start"}}>
                <div style={{width:30,height:30,borderRadius:"50%",background:isIn?T.greenBg:T.redLight,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:13,color:isIn?T.green:T.red,fontWeight:700}}><i className={isIn?"ti ti-arrow-down-left":"ti ti-arrow-up-right"} style={{fontSize:15}}/></div>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{fontSize:12,color:T.text,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</div>
                  <div style={{fontSize:10,color:T.muted,marginTop:2}}>{fmtB(t.bilag)} · {t.date}</div>
                </div>
                <div style={{fontSize:12,fontWeight:700,color:isIn?T.green:T.text,flexShrink:0}}>{fmt(t.amount)}</div>
              </div>
            );
          })}
          {!activity.length&&<div style={{fontSize:12,color:T.muted}}>Nothing this period yet.</div>}
        </div>
      </div>}

      {widgets.recent&&recentTabs.length>0&&<div style={{...card,marginTop:16}}>
        <div style={cardHead}>Recently viewed</div>
        <div style={{...cardBody,display:"flex",flexDirection:"column",gap:2}}>
          {recentTabs.map(rt=>(
            <div key={rt} onClick={()=>onNavigate&&onNavigate(rt)} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 8px",borderRadius:8,cursor:"pointer"}} className="rr-sidebar-item">
              <i className="ti ti-history" style={{fontSize:13,color:T.muted}}/>
              <span style={{fontSize:12,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tabLabels[rt]||rt}</span>
            </div>
          ))}
        </div>
      </div>}

      {widgets.banks&&(()=>{
        const bankAccts=accounts.filter(a=>getSK(a.code)==="1900");
        if(!bankAccts.length)return null;
        const getBal=code=>transactions.reduce((s,t)=>{if(t.debitCode===code)return s+t.amount;if(t.creditCode===code)return s-t.amount;return s;},0);
        return(
          <div style={{...card,marginTop:16}}>
            <div style={cardHead}>Bank accounts</div>
            <div style={{...cardBody,display:"flex",flexDirection:"column",gap:11}}>
              {bankAccts.map(a=>{
                const bal=getBal(a.code);
                return(
                  <div key={a.code} onClick={()=>onNavigate&&onNavigate("Bank")} style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",padding:"3px 0"}} className="rr-sidebar-item">
                    <span style={{fontSize:12,color:T.text,fontWeight:600}}>{a.name}</span>
                    <span style={{fontSize:13,fontWeight:700,color:bal>=0?T.waterTeal:T.accent}}>{sign(bal)}</span>
                  </div>
                );
              })}
              <div style={{borderTop:`1px solid ${T.border}`,paddingTop:10,marginTop:3,display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:12,fontWeight:700,color:T.text}}>Total</span>
                <span style={{fontSize:13,fontWeight:800,color:T.text}}>{sign(bankAccts.reduce((s,a)=>s+getBal(a.code),0))}</span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
    </div>
  );
}

// Trial balance — every account's opening balance, the period's movement
// (difference), and the resulting closing balance, in one table.
// Account edit popup — triggered from clicking an account name in Trial
// Balance. Only the fields we actually support (code, name, matchable) —
// not fabricating SAF-T codes, balance groups, or project flags we don't have.
function AccountEditModal({account,accounts,onSaveAccounts,onClose}){
  const[form,setForm]=useState({code:account.code,name:account.name,matchable:account.matchable||false});
  const[err,setErr]=useState("");
  const origCode=account.code;

  const handleSave=()=>{
    if(!form.code.trim()||!form.name.trim()){setErr("Code and name are both required.");return;}
    const codeChanged=form.code!==origCode;
    if(codeChanged&&accounts.some(a=>a.code===form.code)){setErr("That account code is already in use.");return;}
    const newList=accounts.map(a=>a.code===origCode?{...a,code:form.code,name:form.name,matchable:form.matchable}:a);
    if(codeChanged)onSaveAccounts(newList,origCode,form.code);
    else onSaveAccounts(newList);
    onClose();
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:14,maxWidth:420,width:"100%",padding:24,boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
        <div style={{fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Account</div>
        <div style={{fontSize:16,fontWeight:800,color:T.text,marginBottom:20}}>{account.code} {account.name}</div>
        <div style={{display:"flex",flexDirection:"column",gap:14,marginBottom:16}}>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Number</div>
            <input value={form.code} onChange={e=>setForm(p=>({...p,code:e.target.value}))} style={inp}/>
          </div>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Name</div>
            <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} style={inp}/>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:T.sub,cursor:"pointer"}}>
            <input type="checkbox" checked={form.matchable} onChange={e=>setForm(p=>({...p,matchable:e.target.checked}))}/>
            Matchable (usable for entry matching / reconciliation)
          </label>
        </div>
        {err&&<div style={{fontSize:12,color:T.red,marginBottom:14}}>{err}</div>}
        <div style={{display:"flex",gap:8}}>
          <button onClick={handleSave} style={{flex:1,background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"11px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Save</button>
          <button onClick={onClose} style={{flex:1,background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"11px",fontWeight:600,fontSize:13,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// Period picker — simplified from Tripletex's draggable dual-handle timeline
// (that needs real drag physics to feel right; this achieves the same
// outcome — pick a from/to range — with quick presets plus exact dates).
function PeriodPickerModal({initialFrom,initialTo,onApply,onClose}){
  const[from,setFrom]=useState(initialFrom);
  const[to,setTo]=useState(initialTo);
  const todayStr=new Date().toISOString().slice(0,10);
  const nowYear=new Date().getFullYear();
  const[gridYear,setGridYear]=useState(parseInt(initialFrom.slice(0,4))||nowYear);

  const fromYear=parseInt(from.slice(0,4))||nowYear;
  const fromMonth=parseInt(from.slice(5,7))||1;
  const isWholeYear=from===`${fromYear}-01-01`&&to===`${fromYear}-12-31`;

  // Clicking any month in the grid selects that whole month and applies +
  // closes immediately — no separate "confirm" step needed for the common
  // case. Clicking the backdrop (blank space) also applies whatever's
  // currently selected, rather than silently discarding it.
  const pickMonth=(y,m)=>{
    const nf=`${y}-${String(m).padStart(2,"0")}-01`;
    const nt=new Date(y,m,0).toISOString().slice(0,10);
    onApply(nf,nt);
    onClose();
  };
  const applyAndClose=()=>{onApply(from,to);onClose();};

  const presets=[
    {label:"Today",apply:()=>{onApply(todayStr,todayStr);onClose();}},
    {label:"This month",apply:()=>{
      const d=new Date();const y=d.getFullYear(),m=d.getMonth();
      onApply(`${y}-${String(m+1).padStart(2,"0")}-01`,new Date(y,m+1,0).toISOString().slice(0,10));
      onClose();
    }},
    {label:"So far this year",apply:()=>{
      const d=new Date();
      onApply(`${d.getFullYear()}-01-01`,todayStr);
      onClose();
    }},
    {label:"Full year",apply:()=>{onApply(`${gridYear}-01-01`,`${gridYear}-12-31`);onClose();}},
  ];
  const MONTH_NAMES=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:750,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={applyAndClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:14,maxWidth:420,width:"100%",padding:24,boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
        <div style={{fontSize:15,fontWeight:800,color:T.text,marginBottom:16}}>Choose period</div>

        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16,marginBottom:12}}>
          <button onClick={()=>setGridYear(y=>y-1)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:7,width:28,height:28,cursor:"pointer",color:T.sub,fontSize:14}}>‹</button>
          <span style={{fontSize:14,fontWeight:800,color:T.text,minWidth:60,textAlign:"center"}}>{gridYear}</span>
          <button onClick={()=>setGridYear(y=>y+1)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:7,width:28,height:28,cursor:"pointer",color:T.sub,fontSize:14}}>›</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14}}>
          {MONTH_NAMES.map((mName,i)=>{
            const m=i+1;
            const isSelected=!isWholeYear&&fromYear===gridYear&&fromMonth===m;
            return(
              <button key={mName} onClick={()=>pickMonth(gridYear,m)} style={{background:isSelected?T.accent:T.bg,color:isSelected?"#fff":T.text,border:"none",borderRadius:8,padding:"10px 4px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{mName}</button>
            );
          })}
        </div>
        <button onClick={()=>{onApply(`${gridYear}-01-01`,`${gridYear}-12-31`);onClose();}} style={{width:"100%",background:isWholeYear&&fromYear===gridYear?T.accent:T.bg,color:isWholeYear&&fromYear===gridYear?"#fff":T.text,border:"none",borderRadius:8,padding:"9px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginBottom:16}}>Whole year {gridYear}</button>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>From (exact date)</div>
            <input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={inp}/>
          </div>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>To (exact date)</div>
            <input type="date" value={to} onChange={e=>setTo(e.target.value)} style={inp}/>
          </div>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:20}}>
          {presets.map(p=>(
            <button key={p.label} onClick={p.apply} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:20,padding:"6px 12px",fontSize:11,fontWeight:600,color:T.accent,cursor:"pointer",fontFamily:"inherit"}}>{p.label}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={applyAndClose} disabled={to<from} style={{flex:1,background:to>=from?T.accent:T.border,color:to>=from?"#fff":T.muted,border:"none",borderRadius:8,padding:"11px",fontWeight:700,fontSize:13,cursor:to>=from?"pointer":"default",fontFamily:"inherit"}}>Ok</button>
          <button onClick={onClose} style={{flex:1,background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"11px",fontWeight:600,fontSize:13,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// Tripletex-style draggable timeline range picker — Year/Quarter/Month/Week
// rows to scale, two draggable handles spanning all rows at once, click any
// cell to jump straight to that unit. Renders as an anchored dropdown (not
// a centered modal) below whatever trigger opens it.
const MONTH_SHORT=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const daysInMonth=(y,m)=>new Date(y,m,0).getDate(); // m is 1-12
const isoWeek=(d)=>{
  const dt=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const day=(dt.getUTCDay()+6)%7; // Mon=0
  dt.setUTCDate(dt.getUTCDate()-day+3);
  const firstThursday=new Date(Date.UTC(dt.getUTCFullYear(),0,4));
  const diff=(dt-firstThursday)/86400000;
  return 1+Math.round(diff/7);
};
function TimelineRangePicker({initialFrom,initialTo,onApply,onClose}){
  const[from,setFrom]=useState(initialFrom);
  const[to,setTo]=useState(initialTo);
  const[windowStartYear,setWindowStartYear]=useState(parseInt(initialFrom.slice(0,4))||new Date().getFullYear());
  const todayStr=new Date().toISOString().slice(0,10);
  const trackRef=useRef(null);
  const draggingRef=useRef(null);

  // 18-month window: Jan of windowStartYear through June of the next year —
  // matches the reference's ~5-quarter span, shiftable via the arrows.
  const months=useMemo(()=>{
    const arr=[];
    let y=windowStartYear,m=1,offset=0;
    for(let i=0;i<18;i++){
      const dim=daysInMonth(y,m);
      arr.push({year:y,month:m,days:dim,offset});
      offset+=dim;
      m++;if(m>12){m=1;y++;}
    }
    return arr;
  },[windowStartYear]);
  const totalDays=months.reduce((s,m)=>s+m.days,0);
  const windowStart=new Date(windowStartYear,0,1);

  const dateToIndex=(dateStr)=>Math.round((new Date(dateStr+"T00:00:00")-windowStart)/86400000);
  const indexToDate=(idx)=>{const d=new Date(windowStart);d.setDate(d.getDate()+idx);return d.toISOString().slice(0,10);};

  const TRACK_W=1000;
  const pxPerDay=TRACK_W/totalDays;
  const fromIdx=Math.min(Math.max(dateToIndex(from),0),totalDays-1);
  const toIdx=Math.min(Math.max(dateToIndex(to),0),totalDays-1);
  const xOf=(idx)=>idx*pxPerDay;

  const startDrag=(which)=>(e)=>{
    e.preventDefault();e.stopPropagation();
    draggingRef.current=which;
    const onMove=(ev)=>{
      if(!draggingRef.current||!trackRef.current)return;
      const rect=trackRef.current.getBoundingClientRect();
      const raw=Math.round((ev.clientX-rect.left)/pxPerDay);
      const idx=Math.min(Math.max(raw,0),totalDays-1);
      const dateStr=indexToDate(idx);
      if(draggingRef.current==="from")setFrom(dateStr<=to?dateStr:to);
      else setTo(dateStr>=from?dateStr:from);
    };
    const onUp=()=>{draggingRef.current=null;window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
  };

  const applyAndClose=()=>{onApply(from,to);onClose();};
  const pickRange=(nf,nt)=>{onApply(nf,nt);onClose();};

  const presets=[
    {label:"Today",apply:()=>pickRange(todayStr,todayStr)},
    {label:"This month",apply:()=>{const d=new Date();const y=d.getFullYear(),m=d.getMonth();pickRange(`${y}-${String(m+1).padStart(2,"0")}-01`,new Date(y,m+1,0).toISOString().slice(0,10));}},
    {label:"So far this year",apply:()=>{const d=new Date();pickRange(`${d.getFullYear()}-01-01`,todayStr);}},
    {label:"Full year",apply:()=>pickRange(`${windowStartYear}-01-01`,`${windowStartYear}-12-31`)},
  ];

  // Quarter groups: chunks of 3 consecutive months from the window
  const quarters=useMemo(()=>{
    const arr=[];
    for(let i=0;i<months.length;i+=3){
      const chunk=months.slice(i,i+3);
      const days=chunk.reduce((s,m)=>s+m.days,0);
      const q=Math.floor((chunk[0].month-1)/3)+1;
      arr.push({year:chunk[0].year,q,offset:chunk[0].offset,days});
    }
    return arr;
  },[months]);
  // Year groups
  const years=useMemo(()=>{
    const map=new Map();
    months.forEach(m=>{
      if(!map.has(m.year))map.set(m.year,{year:m.year,offset:m.offset,days:0});
      map.get(m.year).days+=m.days;
    });
    return[...map.values()];
  },[months]);
  // Week ticks: 7-day chunks across the window
  const weeks=useMemo(()=>{
    const arr=[];
    for(let off=0;off<totalDays;off+=7){
      const d=indexToDate(off);
      arr.push({offset:off,days:Math.min(7,totalDays-off),label:isoWeek(new Date(d+"T00:00:00"))});
    }
    return arr;
  },[totalDays,windowStartYear]);

  const rowStyle={display:"flex",alignItems:"stretch",height:30,borderBottom:`1px solid ${T.border}`};
  const cellBase={display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:T.sub,fontWeight:600,borderRight:`1px solid ${T.border}`,cursor:"pointer",flexShrink:0,boxSizing:"border-box",overflow:"hidden",whiteSpace:"nowrap"};

  return(
    <div onClick={e=>e.stopPropagation()} style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:14,boxShadow:"0 16px 40px rgba(20,60,50,0.14)",padding:16,width:TRACK_W+120,maxWidth:"92vw"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div style={{fontSize:13,fontWeight:800,color:T.text}}>Choose period</div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>setWindowStartYear(y=>y-1)} title="Shift window back a year" style={{background:"none",border:`1px solid ${T.border}`,borderRadius:7,width:26,height:26,cursor:"pointer",color:T.sub,fontSize:13}}>‹</button>
          <span style={{fontSize:12,color:T.muted,minWidth:80,textAlign:"center"}}>{windowStartYear}–{windowStartYear+1}</span>
          <button onClick={()=>setWindowStartYear(y=>y+1)} title="Shift window forward a year" style={{background:"none",border:`1px solid ${T.border}`,borderRadius:7,width:26,height:26,cursor:"pointer",color:T.sub,fontSize:13}}>›</button>
        </div>
      </div>

      <div style={{display:"flex"}}>
        <div style={{width:70,flexShrink:0}}>
          <div style={{height:30,display:"flex",alignItems:"center",fontSize:10,color:T.muted,fontWeight:700}}>Year</div>
          <div style={{height:30,display:"flex",alignItems:"center",fontSize:10,color:T.muted,fontWeight:700}}>Quarter</div>
          <div style={{height:30,display:"flex",alignItems:"center",fontSize:10,color:T.muted,fontWeight:700}}>Month</div>
          <div style={{height:22,display:"flex",alignItems:"center",fontSize:10,color:T.muted,fontWeight:700}}>Week</div>
        </div>
        <div style={{position:"relative"}}>
          {/* Drag handles + connecting highlight band, spanning all rows */}
          <div style={{position:"absolute",left:xOf(fromIdx),top:0,width:xOf(toIdx)-xOf(fromIdx)+pxPerDay,height:30+30+30+22,background:T.accentLight,opacity:0.55,zIndex:1,pointerEvents:"none"}}/>
          {/* Actual mousedown target is this 14px-wide invisible strip
              centered on the line (matching the grab-strip width used by
              ResizableSplit in shell.jsx) — a bare 2px line is nearly
              impossible to grab precisely. */}
          <div onMouseDown={startDrag("from")} title={from} style={{position:"absolute",left:xOf(fromIdx)-7,top:-28,width:14,height:28+30+30+30+22,cursor:"col-resize",zIndex:3,display:"flex",flexDirection:"column",alignItems:"center"}}>
            <div style={{background:T.accent,color:"#fff",fontSize:10,fontWeight:700,padding:"3px 7px",borderRadius:6,whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:4,marginBottom:2,flexShrink:0}}><i className="ti ti-grip-vertical" style={{fontSize:10}}/>{from}</div>
            <div style={{width:2,flex:1,background:T.accent}}/>
          </div>
          <div onMouseDown={startDrag("to")} title={to} style={{position:"absolute",left:xOf(toIdx)-7,top:-28,width:14,height:28+30+30+30+22,cursor:"col-resize",zIndex:3,display:"flex",flexDirection:"column",alignItems:"center"}}>
            <div style={{background:T.accent,color:"#fff",fontSize:10,fontWeight:700,padding:"3px 7px",borderRadius:6,whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:4,marginBottom:2,flexShrink:0}}><i className="ti ti-grip-vertical" style={{fontSize:10}}/>{to}</div>
            <div style={{width:2,flex:1,background:T.accent}}/>
          </div>

          <div ref={trackRef} style={{width:TRACK_W,position:"relative",zIndex:2}}>
            <div style={rowStyle}>
              {years.map(y=>(
                <div key={y.year} onClick={()=>pickRange(`${y.year}-01-01`,`${y.year}-12-31`)} style={{...cellBase,width:y.days*pxPerDay,background:"#fff",fontWeight:800,color:T.text}}>{y.year}</div>
              ))}
            </div>
            <div style={rowStyle}>
              {quarters.map((q,i)=>(
                <div key={i} onClick={()=>{const startM=(q.q-1)*3+1;const nf=`${q.year}-${String(startM).padStart(2,"0")}-01`;const nt=new Date(q.year,startM+2,0).toISOString().slice(0,10);pickRange(nf,nt);}} style={{...cellBase,width:q.days*pxPerDay,background:T.bg}}>Q{q.q} {q.year}</div>
              ))}
            </div>
            <div style={rowStyle}>
              {months.map((m,i)=>(
                <div key={i} onClick={()=>{const nf=`${m.year}-${String(m.month).padStart(2,"0")}-01`;const nt=new Date(m.year,m.month,0).toISOString().slice(0,10);pickRange(nf,nt);}} style={{...cellBase,width:m.days*pxPerDay,background:"#fff"}}>{MONTH_SHORT[m.month-1]}</div>
              ))}
            </div>
            <div style={{...rowStyle,height:22,borderBottom:"none"}}>
              {weeks.map((w,i)=>(
                <div key={i} style={{...cellBase,width:w.days*pxPerDay,background:T.bg,fontSize:8.5,color:T.muted,fontWeight:500,cursor:"default"}}>{w.label}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{display:"flex",flexWrap:"wrap",gap:8,margin:"16px 0"}}>
        {presets.map(p=>(
          <button key={p.label} onClick={p.apply} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:20,padding:"6px 12px",fontSize:11,fontWeight:600,color:T.accent,cursor:"pointer",fontFamily:"inherit"}}>{p.label}</button>
        ))}
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
        <button onClick={onClose} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 16px",fontWeight:600,fontSize:12,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
        <button onClick={applyAndClose} disabled={to<from} style={{background:to>=from?T.accent:T.border,color:to>=from?"#fff":T.muted,border:"none",borderRadius:8,padding:"9px 20px",fontWeight:700,fontSize:12,cursor:to>=from?"pointer":"default",fontFamily:"inherit"}}>Ok</button>
      </div>
    </div>
  );
}

// Click-to-jump month/year popover — pairs with a plain "‹ label ›" stepper
// so someone going from January to August doesn't have to click "›" seven
// times. Deliberately lighter than PeriodPickerModal (no exact-date-range
// inputs or presets) since every screen that uses this already tracks a
// single "viewMonth", not a from/to range — this just gives a fast way to
// land on any month/year directly instead of only stepping one at a time.
function MonthYearJump({year,month,onPick}){
  const[open,setOpen]=useState(false);
  const[gridYear,setGridYear]=useState(year);
  useEffect(()=>{if(open)setGridYear(year);},[open,year]);
  const MONTH_NAMES=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return(
    <div style={{position:"relative"}}>
      <span onClick={()=>setOpen(o=>!o)} style={{fontSize:13,fontWeight:700,color:T.text,minWidth:100,textAlign:"center",cursor:"pointer",display:"inline-flex",alignItems:"center",gap:4,justifyContent:"center"}}>
        {MONTH_NAMES[month-1]} {year}
        <i className="ti ti-chevron-down" style={{fontSize:11,color:T.muted}}/>
      </span>
      {open&&(<>
        <div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:598}}/>
        <div style={{position:"absolute",top:"calc(100% + 6px)",left:"50%",transform:"translateX(-50%)",background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,boxShadow:"0 12px 30px rgba(0,0,0,0.16)",zIndex:599,padding:14,width:230}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <button onClick={()=>setGridYear(y=>y-1)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:7,width:26,height:26,cursor:"pointer",color:T.sub,fontSize:13}}>‹</button>
            <span style={{fontSize:13,fontWeight:800,color:T.text}}>{gridYear}</span>
            <button onClick={()=>setGridYear(y=>y+1)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:7,width:26,height:26,cursor:"pointer",color:T.sub,fontSize:13}}>›</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
            {MONTH_NAMES.map((mName,i)=>{
              const m=i+1;
              const isSelected=gridYear===year&&m===month;
              return(
                <button key={mName} onClick={()=>{onPick(gridYear,m);setOpen(false);}} style={{background:isSelected?T.accent:T.bg,color:isSelected?"#fff":T.text,border:"none",borderRadius:7,padding:"8px 4px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{mName}</button>
              );
            })}
          </div>
        </div>
      </>)}
    </div>
  );
}

// Ledger drill-down — matches the Tripletex General Ledger reference: search,
// account switcher (jump between accounts without closing), All/Open entries
// toggle, a period picker, and the grouped opening/entries/changes/closing
// table with a "closed" (matched) indicator per line.
function LedgerDrilldownScreen({account,accounts,contacts,transactions,filterFrom:initFrom,filterTo:initTo,onEditTxn,onReverseTxn,onMatchTxns,onUnmatchTxns,fetchTxnAttachments,uploadInboxFile,attachFilesToTxnEntry,inboxFiles=[],auditLog=[],profiles=[],currentUserId,onClose,moneySources,tagTransaction,fetchEntryComments,addEntryComment}){
  const[currentCode,setCurrentCode]=useState(account.code);
  const[matchDetailGroupId,setMatchDetailGroupId]=useState(null);
  const[filterFrom,setFilterFrom]=useState(initFrom);
  const[filterTo,setFilterTo]=useState(initTo);
  const[search,setSearch]=useState("");
  const[entriesMode,setEntriesMode]=useState("all"); // "all" | "open"
  const[selected,setSelected]=useState([]);
  const[periodPickerOpen,setPeriodPickerOpen]=useState(false);
  const[detailTxn,setDetailTxn]=useState(null);

  const currentAccount=accounts.find(a=>a.code===currentCode)||account;
  const periodLabel=filterFrom.slice(0,4)===filterTo.slice(0,4)&&filterFrom.slice(5)==="01-01"&&filterTo.slice(5)==="12-31"?filterFrom.slice(0,4):`${filterFrom} – ${filterTo}`;

  const openingBal=useMemo(()=>transactions.filter(t=>t.date<filterFrom&&(t.debitCode===currentCode||t.creditCode===currentCode)).reduce((s,t)=>t.debitCode===currentCode?s+t.amount:s-t.amount,0),[transactions,currentCode,filterFrom]);

  const allRows=useMemo(()=>{
    let running=openingBal;
    return transactions
      .filter(t=>t.date>=filterFrom&&t.date<=filterTo&&(t.debitCode===currentCode||t.creditCode===currentCode))
      .filter(t=>!search||fmtB(t.bilag).toLowerCase().includes(search.toLowerCase())||(t.description||"").toLowerCase().includes(search.toLowerCase()))
      .sort((a,b)=>a.date.localeCompare(b.date)||a.bilag-b.bilag)
      .map(t=>{const isDr=t.debitCode===currentCode;const movement=isDr?t.amount:-t.amount;running+=movement;return{...t,movement,balance:running};});
  },[transactions,currentCode,filterFrom,filterTo,openingBal,search]);

  const shownRows=entriesMode==="open"?allRows.filter(r=>!(r.matchedWith&&r.matchedAccount===currentCode)):allRows;
  const closingBal=allRows.length?allRows[allRows.length-1].balance:openingBal;
  const periodMovement=allRows.reduce((s,r)=>s+r.movement,0);

  const toggleSel=(id)=>setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
  const selSum=selected.reduce((s,id)=>{const r=shownRows.find(x=>x.id===id);return r?s+r.movement:s;},0);
  const doMatch=()=>{
    if(selected.length<2||Math.abs(selSum)>=1)return;
    onMatchTxns(selected,Date.now().toString(),currentCode);
    setSelected([]);
  };

  const switchAccount=(code)=>{setCurrentCode(code);setSelected([]);setSearch("");};

  const allSelectableIds=shownRows.filter(r=>!(r.matchedWith&&r.matchedAccount===currentCode)).map(r=>r.id);
  const allSelected=allSelectableIds.length>0&&allSelectableIds.every(id=>selected.includes(id));
  const toggleSelectAll=()=>setSelected(allSelected?[]:allSelectableIds);

  // Excel-style resizable columns — drag the handle on the right edge of any
  // header cell. Widths persist per-session via colgroup, not per-cell.
  const[colWidths,setColWidths]=useState([36,90,90,90,300,110,120]);
  const resizeDragRef=React.useRef(null);
  const startColResize=(idx,e)=>{
    e.preventDefault();e.stopPropagation();
    resizeDragRef.current={idx,startX:e.clientX,startWidth:colWidths[idx]};
    const onMove=(ev)=>{
      if(!resizeDragRef.current)return;
      const{idx,startX,startWidth}=resizeDragRef.current;
      const next=Math.max(30,startWidth+(ev.clientX-startX));
      setColWidths(prev=>prev.map((w,i)=>i===idx?next:w));
    };
    const onUp=()=>{resizeDragRef.current=null;window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
  };
  const ResizeHandle=({idx})=>(
    <div onMouseDown={e=>startColResize(idx,e)} style={{position:"absolute",right:0,top:0,bottom:0,width:6,cursor:"col-resize",zIndex:3}}/>
  );

  const printLedgerPdf=()=>{
    const rows=shownRows.map(r=>{
      const isClosed=!!(r.matchedWith&&r.matchedAccount===currentCode);
      return`<tr><td>${r.date}</td><td>${isClosed?"Yes":"No"}</td><td>${fmtB(r.bilag)}</td><td>${r.description}</td><td style="text-align:right">${sign(r.movement)}</td></tr>`;
    }).join("");
    const html=`<!DOCTYPE html><html><head><title>${currentAccount.code} ${currentAccount.name}</title><style>
      body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:36px;}
      h1{font-size:18px;font-weight:bold;margin-bottom:2px;}
      .sub{font-size:12px;color:#666;margin-bottom:18px;}
      .summary{display:flex;gap:32px;background:#F5F9FA;border-radius:8px;padding:12px 16px;margin-bottom:18px;}
      .summary div{font-size:11px;color:#666;}
      .summary b{display:block;font-size:14px;color:#111;margin-top:2px;}
      table{width:100%;border-collapse:collapse;}
      th{background:#F5F9FA;color:#374151;padding:8px 10px;text-align:left;font-size:11px;border-bottom:2px solid #ddd;}
      td{padding:7px 10px;border-bottom:1px solid #eee;font-size:11px;}
      @media print{.btn-bar{display:none;}}
    </style></head><body>
      <h1>${currentAccount.code} ${currentAccount.name}</h1>
      <div class="sub">General ledger — ${filterFrom} to ${filterTo}</div>
      <div class="summary">
        <div>Opening balance<b>${fmt(openingBal)}</b></div>
        <div>Movement this period<b>${sign(periodMovement)}</b></div>
        <div>Closing balance<b>${fmt(closingBal)}</b></div>
      </div>
      <table>
        <thead><tr><th>Date</th><th>Closed</th><th>Voucher</th><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="btn-bar" style="margin-top:24px;"><button onclick="window.print()" style="padding:10px 20px;background:${T.accent};color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;">Print / Save as PDF</button></div>
    </body></html>`;
    openHtmlInNewTab(html);
  };

  return(
    <div>
      {periodPickerOpen&&(
        <PeriodPickerModal initialFrom={filterFrom} initialTo={filterTo} onApply={(f,t)=>{setFilterFrom(f);setFilterTo(t);}} onClose={()=>setPeriodPickerOpen(false)}/>
      )}
      {detailTxn&&(
        <DetailModal txn={detailTxn} accounts={accounts} contacts={contacts||[]} fetchTxnAttachments={fetchTxnAttachments} uploadInboxFile={uploadInboxFile} attachFilesToTxnEntry={attachFilesToTxnEntry} inboxFiles={inboxFiles} fetchEntryComments={fetchEntryComments} addEntryComment={addEntryComment} auditLog={auditLog} profiles={profiles} currentUserId={currentUserId} moneySources={moneySources} tagTransaction={tagTransaction} onEdit={u=>{onEditTxn(u);setDetailTxn(null);}} onReverse={tx=>{onReverseTxn(tx);setDetailTxn(null);}} onClose={()=>setDetailTxn(null)}/>
      )}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div>
          <div style={{fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:0.4,marginBottom:2}}>General ledger</div>
          <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>{currentCode} — {(accounts.find(a=>a.code===currentCode)||{}).name||""}</h1>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={printLedgerPdf} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}><i className="ti ti-file-type-pdf" style={{fontSize:13,marginRight:5}}/>PDF</button>
          <button onClick={onClose} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>✕ Close</button>
        </div>
      </div>

      <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,padding:12,marginBottom:14}}>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <AccountSwitcherDropdown accounts={accounts} value={currentCode} onChange={switchAccount}/>
          <div style={{position:"relative",width:170}}>
            <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:T.muted,fontSize:12}}>🔍</span>
            <input placeholder="Search" value={search} onChange={e=>setSearch(e.target.value)} style={{...inp,paddingLeft:30,height:32,fontSize:12}}/>
          </div>
          <button onClick={()=>setPeriodPickerOpen(true)} style={{display:"flex",alignItems:"center",gap:6,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 12px",height:32,boxSizing:"border-box",background:"#fff",cursor:"pointer",fontFamily:"inherit"}}>
            <i className="ti ti-calendar" style={{fontSize:12,color:T.sub}}/>
            <span style={{fontSize:12,fontWeight:700,color:T.text}}>{periodLabel}</span>
          </button>
          <div style={{display:"flex",gap:0,border:`1px solid ${T.border}`,borderRadius:8,overflow:"hidden",height:32,boxSizing:"border-box"}}>
            {[["all","All"],["open","Open"],["closed","Closed"]].map(([id,label],i)=>(
              <button key={id} onClick={()=>setEntriesMode(id)} style={{background:entriesMode===id?T.accent:"#fff",color:entriesMode===id?"#fff":T.sub,border:"none",borderLeft:i>0?`1px solid ${T.border}`:"none",padding:"0 14px",height:"100%",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{label}</button>
            ))}
          </div>
          {/* Match controls live right here in the filter row — never a
              separate row that pushes the table down when you select rows. */}
          {selected.length>0&&(
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
              <span style={{fontSize:11,color:T.sub}}>{selected.length} selected · Net: <span style={{fontWeight:700,color:Math.abs(selSum)<1?T.green:T.red}}>{sign(selSum)}</span></span>
              <button onClick={()=>setSelected([])} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:7,padding:"5px 10px",fontSize:11,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Clear</button>
              <button onClick={doMatch} disabled={Math.abs(selSum)>=1} style={{background:Math.abs(selSum)<1?T.green:T.border,color:Math.abs(selSum)<1?"#fff":T.muted,border:"none",borderRadius:7,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:Math.abs(selSum)<1?"pointer":"default",fontFamily:"inherit"}}>Match ✓</button>
            </div>
          )}
        </div>
      </div>

      <div style={{maxHeight:"calc(100vh - 260px)",overflowY:"auto",background:"#fff",borderRadius:12,border:`1px solid ${T.border}`}}>
      <table style={{width:"100%",fontSize:13,borderCollapse:"collapse",tableLayout:"fixed"}}>
        <colgroup>{colWidths.map((w,i)=><col key={i} style={{width:w}}/>)}</colgroup>
        <thead><tr style={{color:T.muted,fontSize:11,background:T.bg,position:"sticky",top:0,zIndex:2}}>
          <td style={{padding:"9px 14px",position:"relative"}}><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} disabled={!allSelectableIds.length}/><ResizeHandle idx={0}/></td>
          <td style={{position:"relative"}}>Closed<ResizeHandle idx={1}/></td>
          <td style={{position:"relative"}}>Voucher<ResizeHandle idx={2}/></td>
          <td style={{position:"relative"}}>Date<ResizeHandle idx={3}/></td>
          <td style={{position:"relative"}}>Description<ResizeHandle idx={4}/></td>
          <td style={{textAlign:"right",position:"relative"}}>Amount<ResizeHandle idx={5}/></td>
          <td style={{textAlign:"right",padding:"9px 14px",position:"relative"}}>Balance</td>
        </tr></thead>
        <tbody>
          <tr style={{background:T.bg,borderBottom:`1px solid ${T.border}`}}>
            <td colSpan="7" style={{padding:"9px 14px",fontWeight:800,color:T.text}}>{currentAccount.code} {currentAccount.name}</td>
          </tr>
          <tr style={{borderBottom:`1px solid ${T.border}`}}>
            <td colSpan="6" style={{padding:"9px 14px",color:T.text}}>Opening balance</td>
            <td style={{textAlign:"right",fontWeight:600,padding:"9px 14px",color:T.text}}>{fmt(openingBal)}</td>
          </tr>
          {shownRows.map((r,i)=>{
            const isMatchedHere=!!r.matchedWith&&r.matchedAccount===currentCode;
            return(
              <tr key={r.id} className="rr-table-row" style={{background:"#fff",borderBottom:`1px solid ${T.border}`}}>
                <td style={{padding:"9px 14px"}}>
                  {isMatchedHere?null:<input type="checkbox" checked={selected.includes(r.id)} onChange={()=>toggleSel(r.id)}/>}
                </td>
                <td>
                  {isMatchedHere?(
                    <span onClick={()=>setMatchDetailGroupId(r.matchedWith)} style={{color:T.accent,fontWeight:700,cursor:"pointer",fontSize:12}}>Closed</span>
                  ):null}
                </td>
                <td onClick={()=>setDetailTxn(r)} style={{color:T.accent,fontWeight:700,cursor:"pointer"}}>{fmtB(r.bilag)}</td>
                <td style={{color:T.text}}>{r.date}</td>
                <td style={{maxWidth:260,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:T.text}}>{r.description}</td>
                <td style={{textAlign:"right",fontWeight:600,color:T.text}}>{sign(r.movement)}</td>
                <td style={{textAlign:"right",color:T.muted,padding:"9px 14px"}}>{fmt(r.balance)}</td>
              </tr>
            );
          })}
          {!shownRows.length&&<tr><td colSpan="7" style={{padding:"24px 0",textAlign:"center",color:T.muted}}>{entriesMode==="open"?"No open entries.":"No entries in this period."}</td></tr>}
          <tr style={{borderTop:`1px solid ${T.border}`}}>
            <td colSpan="6" style={{padding:"7px 0",color:T.text}}>Changes in period</td>
            <td style={{textAlign:"right",fontWeight:600,color:T.text}}>{sign(periodMovement)}</td>
          </tr>
          <tr style={{borderTop:`2px solid ${T.text}`,fontWeight:800}}>
            <td colSpan="6" style={{padding:"8px 0"}}>Closing balance</td>
            <td style={{textAlign:"right"}}>{fmt(closingBal)}</td>
          </tr>
        </tbody>
      </table>
      </div>
      <div style={{marginTop:16,padding:"10px 14px",background:T.bg,borderRadius:8,display:"flex",justifyContent:"space-between",fontSize:13,fontWeight:700}}>
        <span>Changes in period — total amount</span><span>{sign(periodMovement)}</span>
      </div>
      {matchDetailGroupId&&(
        <MatchDetailModal groupId={matchDetailGroupId} auditLog={auditLog} profiles={profiles} currentUserId={currentUserId} onUnmatch={onUnmatchTxns} onClose={()=>setMatchDetailGroupId(null)}/>
      )}
    </div>
  );
}

function TrialBalanceScreen({accounts,transactions,onOpenLedger,onSaveAccounts,registerExcelExport,isDesktop=false}){
  const today=new Date().toISOString().slice(0,10);
  // Excel-style resizable columns — drag the handle on the right edge of any
  // header cell.
  const[colWidths,setColWidths]=useState([260,160,160,160]);
  const resizeDragRef=React.useRef(null);
  const startColResize=(idx,e)=>{
    e.preventDefault();e.stopPropagation();
    resizeDragRef.current={idx,startX:e.clientX,startWidth:colWidths[idx]};
    const onMove=(ev)=>{
      if(!resizeDragRef.current)return;
      const{idx,startX,startWidth}=resizeDragRef.current;
      const next=Math.max(60,startWidth+(ev.clientX-startX));
      setColWidths(prev=>prev.map((w,i)=>i===idx?next:w));
    };
    const onUp=()=>{resizeDragRef.current=null;window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
  };
  // The table itself is forced to width:100% of its container, but colWidths
  // are stored as raw pixels for simple resize-drag math. If those pixels
  // dont happen to sum to the containers actual width (they never will,
  // since the container width varies by screen size), the browser stretches
  // things unevenly, exactly the disproportionate-columns-plus-dead-space
  // bug. Converting to percentages that always sum to exactly 100 percent
  // removes the mismatch entirely, regardless of container width.
  const colWidthsPct=useMemo(()=>{
    const total=colWidths.reduce((s,w)=>s+w,0)||1;
    return colWidths.map(w=>(w/total*100)+"%");
  },[colWidths]);
  const ResizeHandle=({idx})=>(
    <div onMouseDown={e=>startColResize(idx,e)} style={{position:"absolute",right:0,top:0,bottom:0,width:6,cursor:"col-resize",zIndex:3}}/>
  );
  const[filterFrom,setFilterFrom]=useState(`${today.slice(0,4)}-01-01`);
  const[filterTo,setFilterTo]=useState(`${today.slice(0,4)}-12-31`);
  const[fromAcct,setFromAcct]=useState("");
  const[toAcct,setToAcct]=useState("");
  const[periodPickerOpen,setPeriodPickerOpen]=useState(false);
  const[filtersOpen,setFiltersOpen]=useState(false);
  const[activeCategories,setActiveCategories]=useState(null); // null = all; Set of SERIES keys otherwise
  const[reportSearch,setReportSearch]=useState("");
  const getName=code=>((accounts.find(a=>a.code===code))||{name:code}).name;
  const isFullYear=filterFrom.slice(5)==="01-01"&&filterTo.slice(5)==="12-31"&&filterFrom.slice(0,4)===filterTo.slice(0,4);
  const isSingleMonth=filterFrom.slice(8)==="01"&&filterFrom.slice(0,7)===filterTo.slice(0,7)&&filterTo.slice(8)===String(new Date(parseInt(filterTo.slice(0,4)),parseInt(filterTo.slice(5,7)),0).getDate()).padStart(2,"0");
  const periodLabel=isFullYear?filterFrom.slice(0,4):isSingleMonth?new Date(filterFrom).toLocaleString("default",{month:"long",year:"numeric"}):`${filterFrom} – ${filterTo}`;
  const stepReportMonth=(dir)=>{
    // Steps by one month if currently viewing a single month or full year;
    // for an arbitrary custom range, stepping isn't well-defined, so this
    // just nudges both dates forward/back by a month as a reasonable default.
    if(isFullYear){
      // Full-year view always starts on Jan 1st — stepping that by a month
      // with setMonth() only crosses a year boundary going backward (Jan minus
      // 1 month rolls into December of the prior year), never forward (Jan
      // plus 1 month is still Feb of the same year). Step the year directly.
      const y=parseInt(filterFrom.slice(0,4),10)+dir;
      setFilterFrom(`${y}-01-01`);setFilterTo(`${y}-12-31`);
      return;
    }
    const d=new Date(filterFrom);d.setMonth(d.getMonth()+dir);
    const y=d.getFullYear(),m=d.getMonth();
    setFilterFrom(`${y}-${String(m+1).padStart(2,"0")}-01`);setFilterTo(new Date(y,m+1,0).toISOString().slice(0,10));
  };

  const categoryKeys=useMemo(()=>Object.keys(SERIES).filter(k=>accounts.some(a=>getSK(a.code)===k)),[accounts]);
  const toggleCategory=(k)=>setActiveCategories(prev=>{
    const cur=prev||new Set(categoryKeys);
    const next=new Set(cur);
    if(next.has(k))next.delete(k);else next.add(k);
    return next;
  });

  const rows=useMemo(()=>{
    // Same orphan-account gap as Income Statement/Balance Sheet — a code can
    // have real transactions without ever having been saved to the chart.
    const knownCodes=new Set(accounts.map(a=>a.code));
    const orphanCodes=new Set();
    transactions.forEach(t=>{
      if(t.debitCode&&!knownCodes.has(t.debitCode))orphanCodes.add(t.debitCode);
      if(t.creditCode&&!knownCodes.has(t.creditCode))orphanCodes.add(t.creditCode);
    });
    const allAccounts=[...accounts,...[...orphanCodes].map(code=>({code,name:"(Not in chart of accounts)"}))];
    return allAccounts
      .filter(a=>(!fromAcct||a.code>=fromAcct)&&(!toAcct||a.code<=toAcct))
      .filter(a=>!activeCategories||activeCategories.has(getSK(a.code)))
      .filter(a=>!reportSearch||a.code.includes(reportSearch)||a.name.toLowerCase().includes(reportSearch.toLowerCase()))
      .map(a=>{
        const opening=transactions.filter(t=>t.date<filterFrom).reduce((s,t)=>{if(t.debitCode===a.code)return s+t.amount;if(t.creditCode===a.code)return s-t.amount;return s;},0);
        const diff=transactions.filter(t=>t.date>=filterFrom&&t.date<=filterTo).reduce((s,t)=>{if(t.debitCode===a.code)return s+t.amount;if(t.creditCode===a.code)return s-t.amount;return s;},0);
        return{code:a.code,name:a.name,opening,diff,closing:opening+diff};
      })
      .filter(r=>r.opening!==0||r.diff!==0||r.closing!==0)
      .sort((a,b)=>a.code.localeCompare(b.code));
  },[accounts,transactions,filterFrom,filterTo,fromAcct,toAcct,activeCategories,reportSearch]);


  // Register this screen's Excel export with the global top-bar download
  // button — no local export buttons cluttering the report itself.
  useEffect(()=>{
    if(!registerExcelExport)return;
    registerExcelExport(()=>{
      const aoa=[["Account","Opening balance","Difference","Closing balance"],...rows.map(r=>[`${r.code} ${r.name}`,r.opening,r.diff,r.closing])];
      const wb=XLSX.utils.book_new();
      const ws=XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb,ws,"Trial balance");
      XLSX.writeFile(wb,`TrialBalance_${filterFrom}_${filterTo}.xlsx`);
    });
  },[rows,filterFrom,filterTo,registerExcelExport]);

  if(!isDesktop){
    return(
      <div style={{paddingBottom:24}}>
        {periodPickerOpen&&(
          <PeriodPickerModal initialFrom={filterFrom} initialTo={filterTo} onApply={(f,t)=>{setFilterFrom(f);setFilterTo(t);}} onClose={()=>setPeriodPickerOpen(false)}/>
        )}
        <h1 style={{fontSize:18,fontWeight:800,color:T.text,margin:"0 0 10px"}}>Trial balance</h1>

        <div style={{position:"sticky",top:0,zIndex:20,background:T.bg,paddingBottom:8,marginTop:-16,paddingTop:16,marginLeft:-16,paddingLeft:16,marginRight:-16,paddingRight:16}}>
          {/* Big, thumb-friendly period stepper — the whole point of the mobile
              fix is that ‹ and › need to be easy to hit and never get cut off
              by the filter row wrapping underneath them. */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,marginBottom:8}}>
            <button onClick={()=>stepReportMonth(-1)} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:T.sub,width:44,height:40}}>‹</button>
            <span onClick={()=>setPeriodPickerOpen(true)} style={{fontSize:14,fontWeight:700,color:T.text,cursor:"pointer",flex:1,textAlign:"center"}}>{periodLabel}</span>
            <button onClick={()=>stepReportMonth(1)} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:T.sub,width:44,height:40}}>›</button>
          </div>
          <div style={{display:"flex",gap:6}}>
            <div style={{position:"relative"}}>
              <button onClick={()=>setFiltersOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:5,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",background:"#fff",cursor:"pointer",fontFamily:"inherit"}}>
                <i className="ti ti-filter" style={{fontSize:13,color:T.sub}}/>
                {activeCategories&&<span style={{fontSize:10,background:T.accentLight,color:T.accent,borderRadius:10,padding:"1px 5px",fontWeight:700}}>{activeCategories.size}</span>}
              </button>
              {filtersOpen&&(<>
                <div onClick={()=>setFiltersOpen(false)} style={{position:"fixed",inset:0,zIndex:490}}/>
                <div style={{position:"absolute",left:0,top:38,background:"#fff",border:`1px solid ${T.border}`,borderRadius:T.radius.md,zIndex:500,minWidth:220,boxShadow:"0 8px 24px rgba(20,40,40,0.12)",padding:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div style={{fontSize:12,fontWeight:800,color:T.text}}>Account categories</div>
                    <button onClick={()=>setActiveCategories(null)} style={{background:"none",border:"none",color:T.accent,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Show all</button>
                  </div>
                  {categoryKeys.map(k=>{
                    const isOn=!activeCategories||activeCategories.has(k);
                    return(
                      <label key={k} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:T.text,padding:"6px 0",cursor:"pointer"}}>
                        <input type="checkbox" checked={isOn} onChange={()=>toggleCategory(k)}/>
                        <span>{SERIES[k].icon} {SERIES[k].name}</span>
                      </label>
                    );
                  })}
                </div>
              </>)}
            </div>
            <div style={{position:"relative",flex:1}}>
              <i className="ti ti-search" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:T.muted,fontSize:12}}/>
              <input placeholder="Search…" value={reportSearch} onChange={e=>setReportSearch(e.target.value)} style={{...inp,paddingLeft:28,background:"#fff",width:"100%"}}/>
            </div>
            <button onClick={()=>{setFromAcct("");setToAcct("");setReportSearch("");setActiveCategories(null);}} title="Reset all filters" style={{background:"none",border:`1px solid ${T.border}`,cursor:"pointer",color:T.sub,width:38,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <i className="ti ti-settings" style={{fontSize:15}}/>
            </button>
          </div>
          {(fromAcct||toAcct)&&(
            <div style={{display:"flex",gap:6,marginTop:6}}>
              <input placeholder="From account" value={fromAcct} onChange={e=>setFromAcct(e.target.value)} style={{...inp,flex:1,background:"#fff"}}/>
              <input placeholder="To account" value={toAcct} onChange={e=>setToAcct(e.target.value)} style={{...inp,flex:1,background:"#fff"}}/>
            </div>
          )}
          {!(fromAcct||toAcct)&&(
            <button onClick={()=>setFromAcct(" ")} style={{background:"none",border:"none",color:T.accent,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit",padding:"6px 2px 0"}}>+ Account range</button>
          )}
          {/* Column header for the IB / Change / UB layout below — only the
              current period's three numbers, nothing else, per the mobile spec. */}
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:4,marginTop:8,padding:"0 2px"}}>
            <div style={{fontSize:9,fontWeight:800,color:T.muted,letterSpacing:0.3}}>ACCOUNT</div>
            <div style={{fontSize:9,fontWeight:800,color:T.muted,textAlign:"right",letterSpacing:0.3}}>IB</div>
            <div style={{fontSize:9,fontWeight:800,color:T.muted,textAlign:"right",letterSpacing:0.3}}>CHANGE</div>
            <div style={{fontSize:9,fontWeight:800,color:T.muted,textAlign:"right",letterSpacing:0.3}}>UB</div>
          </div>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:8}}>
          {rows.map(r=>(
            <div key={r.code} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:4,alignItems:"center",background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 8px"}}>
              <div title={`${r.code} ${r.name}`} style={{fontSize:11,fontWeight:700,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.code} {r.name}</div>
              <div style={{fontSize:11,textAlign:"right",color:T.text}}>{fmtBal(r.opening)}</div>
              <div
                onClick={()=>{
                  if(!onOpenLedger)return;
                  const acct=accounts.find(a=>a.code===r.code)||{code:r.code,name:r.name};
                  onOpenLedger(acct,filterFrom,filterTo);
                }}
                style={{fontSize:11,textAlign:"right",color:r.diff?T.accent:T.muted,fontWeight:r.diff?700:400,cursor:onOpenLedger?"pointer":"default"}}
              >{r.diff?fmtBal(r.diff):"—"}</div>
              <div style={{fontSize:11,fontWeight:800,textAlign:"right",color:T.text}}>{fmtBal(r.closing)}</div>
            </div>
          ))}
          {!rows.length&&<div style={{padding:"24px 0",textAlign:"center",color:T.muted,fontSize:12}}>No account activity matches these filters.</div>}
        </div>
      </div>
    );
  }

  return(
    <div style={{maxWidth:isDesktop?1100:"100%"}}>
      <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 16px"}}>Trial balance</h1>

      {/* The filter toolbar AND the column-header row live in ONE sticky
          block now, not two independently-stickied elements with a
          JS-measured gap between them (a prior fix tried to keep that gap
          in sync via ResizeObserver, but any mismatch — even for a single
          frame during a resize or font swap — let a data row peek through
          the seam, which is exactly the "account row floats above the
          header" bug this was reported as). Sticking them together as one
          unit makes that class of bug structurally impossible: there is
          only one sticky boundary, so a row is always either fully above
          or fully below it, never sandwiched in a gap between two. */}
      <div style={{position:"sticky",top:0,zIndex:51,background:T.bg,padding:"16px 0 8px"}}>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",background:"rgba(255,255,255,0.72)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",border:`1px solid ${T.borderGlass}`,borderRadius:10,padding:"8px 10px",boxShadow:"0 10px 30px rgba(20,60,50,0.06)"}}>
          <div style={{position:"relative"}}>
            <button onClick={()=>setFiltersOpen(o=>!o)} title="Filter by account category" style={{display:"flex",alignItems:"center",gap:6,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 12px",background:"#fff",cursor:"pointer",fontFamily:"inherit"}}>
              <i className="ti ti-filter" style={{fontSize:14,color:T.sub}}/>
              <span style={{fontSize:12,fontWeight:600,color:T.text}}>Filters</span>
              {activeCategories&&<span style={{fontSize:10,background:T.accentLight,color:T.accent,borderRadius:10,padding:"1px 6px",fontWeight:700}}>{activeCategories.size}</span>}
            </button>
            {filtersOpen&&(<>
              <div onClick={()=>setFiltersOpen(false)} style={{position:"fixed",inset:0,zIndex:490}}/>
              <div style={{position:"absolute",left:0,top:38,background:"#fff",border:`1px solid ${T.border}`,borderRadius:T.radius.md,zIndex:500,minWidth:240,boxShadow:"0 8px 24px rgba(20,40,40,0.12)",padding:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{fontSize:12,fontWeight:800,color:T.text}}>Account categories</div>
                  <button onClick={()=>setActiveCategories(null)} style={{background:"none",border:"none",color:T.accent,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Show all</button>
                </div>
                {categoryKeys.map(k=>{
                  const isOn=!activeCategories||activeCategories.has(k);
                  return(
                    <label key={k} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:T.text,padding:"6px 0",cursor:"pointer"}}>
                      <input type="checkbox" checked={isOn} onChange={()=>toggleCategory(k)}/>
                      <span>{SERIES[k].icon} {SERIES[k].name}</span>
                    </label>
                  );
                })}
              </div>
            </>)}
          </div>
          <div style={{position:"relative"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 12px"}}>
              <button onClick={()=>stepReportMonth(-1)} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:T.sub}}>‹</button>
              <span onClick={()=>setPeriodPickerOpen(true)} style={{fontSize:13,fontWeight:700,color:T.text,cursor:"pointer",minWidth:80,textAlign:"center"}}>{periodLabel}</span>
              <button onClick={()=>stepReportMonth(1)} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:T.sub}}>›</button>
            </div>
            {periodPickerOpen&&(<>
              <div onClick={()=>setPeriodPickerOpen(false)} style={{position:"fixed",inset:0,zIndex:748}}/>
              <div style={{position:"absolute",left:0,top:44,zIndex:749}}>
                <TimelineRangePicker initialFrom={filterFrom} initialTo={filterTo} onApply={(f,t)=>{setFilterFrom(f);setFilterTo(t);}} onClose={()=>setPeriodPickerOpen(false)}/>
              </div>
            </>)}
          </div>
          <input placeholder="From account" value={fromAcct} onChange={e=>setFromAcct(e.target.value)} style={{...inp,width:100,background:"#fff"}}/>
          <input placeholder="To account" value={toAcct} onChange={e=>setToAcct(e.target.value)} style={{...inp,width:100,background:"#fff"}}/>
          <div style={{position:"relative",flex:"1 1 200px",minWidth:180}}>
            <i className="ti ti-search" style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:T.muted,fontSize:13}}/>
            <input placeholder="Search within report…" value={reportSearch} onChange={e=>setReportSearch(e.target.value)} style={{...inp,paddingLeft:32,background:"#fff"}}/>
          </div>
          <div style={{flex:1}}/>
          <button onClick={()=>{setFromAcct("");setToAcct("");setReportSearch("");setActiveCategories(null);}} title="Reset all filters" style={{background:"none",border:"none",cursor:"pointer",color:T.sub,width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:8}}>
            <i className="ti ti-settings" style={{fontSize:16}}/>
          </button>
        </div>

        {/* Column headers — part of the same sticky block as the toolbar
            above, not a second independently-positioned sticky element. */}
        <div style={{display:"grid",gridTemplateColumns:colWidthsPct.join(" "),color:T.sub,background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,marginTop:8}}>
          <div style={{position:"relative",padding:"11px 14px",fontWeight:700}}>Account<ResizeHandle idx={0}/></div>
          <div style={{position:"relative",textAlign:"right",fontWeight:700,padding:"11px 14px"}}>Opening balance<ResizeHandle idx={1}/></div>
          <div style={{position:"relative",textAlign:"right",fontWeight:700,padding:"11px 14px"}}>Difference<ResizeHandle idx={2}/></div>
          <div style={{textAlign:"right",fontWeight:700,padding:"11px 14px"}}>Closing balance</div>
        </div>
      </div>

      {/* Div/grid "table" instead of a real <table> — Chrome has a known,
          long-standing bug where position:sticky on individual <td> elements
          intermittently fails to paint (the header just goes blank) once a
          border-collapse/box-shadow/zoom combination triggers it, no matter
          how the borders or offsets are tuned. A single sticky row built
          from CSS Grid divs (same column widths, same resize handles)
          sidesteps that bug entirely — it's the same row-div pattern
          already used for Bank Reconciliation and Reskontro, where this
          gap/blank-header issue never shows up. */}
      <div id="trialbalance-print-area">
      <div style={{background:"#fff",borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden",fontSize:13,marginTop:8}}>
        <div>
          {rows.map(r=>(
            <div key={r.code} className="rr-table-row" style={{display:"grid",gridTemplateColumns:colWidthsPct.join(" "),background:"#fff",borderBottom:`1px solid ${T.border}`}}>
              <div title={`${r.code} ${r.name}`} style={{padding:"11px 14px",color:T.text,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.code} {r.name}</div>
              <div style={{textAlign:"right",padding:"11px 14px",color:T.text}}>{fmtBal(r.opening)}</div>
              <div
                onClick={()=>{
                  if(!onOpenLedger)return;
                  const acct=accounts.find(a=>a.code===r.code)||{code:r.code,name:r.name};
                  onOpenLedger(acct,filterFrom,filterTo);
                }}
                title={onOpenLedger?"View ledger for this account and period":undefined}
                style={{textAlign:"right",padding:"11px 14px",color:r.diff?T.accent:T.muted,fontWeight:r.diff?600:400,cursor:onOpenLedger?"pointer":"default"}}
              >{r.diff?fmtBal(r.diff):"—"}</div>
              <div style={{textAlign:"right",fontWeight:700,padding:"11px 14px",color:T.text}}>{fmtBal(r.closing)}</div>
            </div>
          ))}
          {!rows.length&&<div style={{padding:"24px 0",textAlign:"center",color:T.muted}}>No account activity matches these filters.</div>}
        </div>
      </div>
      </div>
    </div>
  );
}

// Income statement (Resultat) — grouped by account series, with a
// same-length previous-period comparison column and drill-down to ledger.
function ResultatScreen({accounts,transactions,onOpenLedger,isDesktop=false,projects=[]}){
  const[viewMonth,setViewMonth]=useState(()=>new Date().toISOString().slice(0,7));
  const[fullYear,setFullYear]=useState(false);
  const[monthlyView,setMonthlyView]=useState(false); // whole year, broken into 12 month columns instead of one lump total
  const[projectFilter,setProjectFilter]=useState("");
  const year=parseInt(viewMonth.slice(0,4));
  const monthIdx=parseInt(viewMonth.slice(5,7))-1;
  const lastDay=new Date(year,monthIdx+1,0).getDate();
  const from=fullYear?`${year}-01-01`:`${viewMonth}-01`;
  const to=fullYear?`${year}-12-31`:`${viewMonth}-${String(lastDay).padStart(2,"0")}`;
  const periodLabel=fullYear?String(year):new Date(year,monthIdx,1).toLocaleString("default",{month:"long"})+" "+year;
  const stepMonth=(dir)=>{let m=monthIdx+dir,y=year;if(m<0){m=11;y-=1;}else if(m>11){m=0;y+=1;}setViewMonth(`${y}-${String(m+1).padStart(2,"0")}`);};

  const spanDays=Math.round((new Date(to)-new Date(from))/86400000)+1;
  const prevTo=new Date(new Date(from).getTime()-86400000).toISOString().slice(0,10);
  const prevFrom=new Date(new Date(from).getTime()-spanDays*86400000).toISOString().slice(0,10);

  // Project filter narrows the same underlying transaction set that
  // powers every total below — this is the whole mechanism for #8: pick a
  // project, and the entire income statement recomputes for just that
  // project's tagged entries, using the exact same movement() logic as the
  // unfiltered view (no separate code path to keep in sync).
  const scopedTxns=projectFilter?transactions.filter(tx=>tx.projectId===projectFilter):transactions;
  const movement=(code,f,t)=>scopedTxns.filter(tx=>tx.date>=f&&tx.date<=t).reduce((s,tx)=>{if(tx.debitCode===code)return s+tx.amount;if(tx.creditCode===code)return s-tx.amount;return s;},0);

  const incomeSKs=["3000","3900"];
  const expenseSKs=["4000","5000","6000","6100","6200","6300","6400","6500","6600","6700","6800","6900","7000","7100","7200","7300","7400","7500","7600","7700","7800","7900"];

  const buildGroup=(sks,flip)=>sks.map(sk=>{
    const grpAccounts=accountsForSK(accounts,transactions,sk);
    if(!grpAccounts.length)return null;
    const rows=grpAccounts.map(a=>{
      const cur=movement(a.code,from,to)*(flip?-1:1);
      const prev=movement(a.code,prevFrom,prevTo)*(flip?-1:1);
      return{code:a.code,name:a.name,cur,prev};
    }).filter(r=>r.cur!==0||r.prev!==0);
    if(!rows.length)return null;
    return{sk,label:(SERIES[sk]&&SERIES[sk].name)||sk,rows,total:rows.reduce((s,r)=>s+r.cur,0),totalPrev:rows.reduce((s,r)=>s+r.prev,0)};
  }).filter(Boolean);

  const incomeGroups=buildGroup(incomeSKs,true);
  const expenseGroups=buildGroup(expenseSKs,false);
  const totalIncome=incomeGroups.reduce((s,g)=>s+g.total,0);
  const totalIncomePrev=incomeGroups.reduce((s,g)=>s+g.totalPrev,0);
  const totalExpense=expenseGroups.reduce((s,g)=>s+g.total,0);
  const totalExpensePrev=expenseGroups.reduce((s,g)=>s+g.totalPrev,0);
  const net=totalIncome-totalExpense;
  const netPrev=totalIncomePrev-totalExpensePrev;

  const GroupRows=({groups})=>groups.map(g=>(
    <React.Fragment key={g.sk}>
      <tr style={{borderTop:`1px solid ${T.border}`}}>
        <td style={{padding:"8px 10px",fontWeight:800,fontSize:13}}>{g.label}</td>
        <td style={{textAlign:"right",fontWeight:800,padding:"8px 10px",fontSize:13}}>{fmt(g.total)}</td>
        <td style={{textAlign:"right",fontSize:12,color:T.muted,padding:"8px 10px"}}>{fmt(g.totalPrev)}</td>
      </tr>
      {g.rows.map(r=>(
        <tr key={r.code} onClick={()=>onOpenLedger&&onOpenLedger({code:r.code,name:r.name},from,to)} style={{cursor:"pointer"}}>
          <td style={{padding:"6px 10px 6px 26px",color:T.accent,fontSize:13}}>{r.code} {r.name}</td>
          <td style={{textAlign:"right",fontSize:13,padding:"6px 10px"}}>{fmt(r.cur)}</td>
          <td style={{textAlign:"right",fontSize:12,color:T.muted,padding:"6px 10px"}}>{fmt(r.prev)}</td>
        </tr>
      ))}
    </React.Fragment>
  ));

  // Monthly breakdown — same underlying movement() and account grouping as
  // the normal 2-column view, just computed once per month (Jan-Dec) of
  // the selected year instead of once for the whole period. Only computed
  // when actually needed, since it's 12x the work of the normal view.
  const monthlyGroups=useMemo(()=>{
    if(!fullYear||!monthlyView)return null;
    const monthRanges=Array.from({length:12},(_,m)=>({
      from:`${year}-${String(m+1).padStart(2,"0")}-01`,
      to:`${year}-${String(m+1).padStart(2,"0")}-${String(new Date(year,m+1,0).getDate()).padStart(2,"0")}`,
    }));
    const build=(sks,flip)=>sks.map(sk=>{
      const grpAccounts=accountsForSK(accounts,transactions,sk);
      if(!grpAccounts.length)return null;
      const rows=grpAccounts.map(a=>{
        const months=monthRanges.map(r=>movement(a.code,r.from,r.to)*(flip?-1:1));
        const total=months.reduce((s,v)=>s+v,0);
        return{code:a.code,name:a.name,months,total};
      }).filter(r=>r.total!==0||r.months.some(v=>v!==0));
      if(!rows.length)return null;
      const monthTotals=Array.from({length:12},(_,m)=>rows.reduce((s,r)=>s+r.months[m],0));
      return{sk,label:(SERIES[sk]&&SERIES[sk].name)||sk,rows,monthTotals,total:rows.reduce((s,r)=>s+r.total,0)};
    }).filter(Boolean);
    return{income:build(incomeSKs,true),expense:build(expenseSKs,false)};
  },[fullYear,monthlyView,year,accounts,transactions,projectFilter]);

  const MONTH_LABELS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const MonthlyTable=({groups,label})=>{
    if(!groups.length)return null;
    const grandTotals=Array.from({length:12},(_,m)=>groups.reduce((s,g)=>s+g.monthTotals[m],0));
    const grandTotal=groups.reduce((s,g)=>s+g.total,0);
    return(
      <div style={{overflowX:"auto",marginBottom:20}}>
        <div style={{fontSize:13,fontWeight:800,color:T.text,marginBottom:8}}>{label}</div>
        <table style={{borderCollapse:"collapse",fontSize:11,minWidth:900}}>
          <thead>
            <tr style={{borderBottom:`2px solid ${T.border}`}}>
              <td style={{padding:"6px 10px",fontWeight:700,color:T.muted,position:"sticky",left:0,background:T.bg,minWidth:160}}>Account</td>
              {MONTH_LABELS.map(m=><td key={m} style={{padding:"6px 8px",textAlign:"right",fontWeight:700,color:T.muted,minWidth:78}}>{m}</td>)}
              <td style={{padding:"6px 10px",textAlign:"right",fontWeight:700,color:T.text,minWidth:90}}>Total</td>
            </tr>
          </thead>
          <tbody>
            {groups.map(g=>(
              <React.Fragment key={g.sk}>
                <tr style={{borderTop:`1px solid ${T.border}`}}>
                  <td style={{padding:"6px 10px",fontWeight:800,position:"sticky",left:0,background:"#fff"}}>{g.label}</td>
                  {g.monthTotals.map((v,i)=><td key={i} style={{textAlign:"right",padding:"6px 8px",fontWeight:700}}>{v===0?"\u2014":fmt(v)}</td>)}
                  <td style={{textAlign:"right",padding:"6px 10px",fontWeight:800}}>{fmt(g.total)}</td>
                </tr>
                {g.rows.map(r=>(
                  <tr key={r.code} onClick={()=>onOpenLedger&&onOpenLedger({code:r.code,name:r.name},`${year}-01-01`,`${year}-12-31`)} style={{cursor:"pointer"}}>
                    <td style={{padding:"5px 10px 5px 22px",color:T.accent,position:"sticky",left:0,background:"#fff"}}>{r.code} {r.name}</td>
                    {r.months.map((v,i)=><td key={i} style={{textAlign:"right",padding:"5px 8px",color:T.sub}}>{v===0?"\u2014":fmt(v)}</td>)}
                    <td style={{textAlign:"right",padding:"5px 10px",color:T.text}}>{fmt(r.total)}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
            <tr style={{borderTop:`2px solid ${T.border}`,fontWeight:900}}>
              <td style={{padding:"7px 10px",position:"sticky",left:0,background:T.bg}}>Total {label}</td>
              {grandTotals.map((v,i)=><td key={i} style={{textAlign:"right",padding:"7px 8px"}}>{fmt(v)}</td>)}
              <td style={{textAlign:"right",padding:"7px 10px"}}>{fmt(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  const exportPdf=()=>{
    const el=document.getElementById("resultat-print-area");
    const periodEl=el&&el.querySelector(".print-only-period");
    if(periodEl)periodEl.style.display="block";
    if(el&&window.html2pdf)window.html2pdf().from(el).set({margin:20,filename:`IncomeStatement_${periodLabel.replace(/\s/g,"_")}.pdf`,html2canvas:{scale:2},jsPDF:{unit:"pt",format:"a4",orientation:"portrait"}}).save().then(()=>{if(periodEl)periodEl.style.display="none";});
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Income statement{projectFilter&&projects.find(p=>p.id===projectFilter)&&<span style={{color:T.accent}}> · {projects.find(p=>p.id===projectFilter).name}</span>}</h1>
        <button onClick={exportPdf} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>⬇ PDF</button>
      </div>

      {/* Sticky on both desktop and mobile now — position:fixed used to
          anchor this to the viewport directly, which put it in a different
          width context (ignoring the scrollbar gutter) than the real table
          below it, causing column drift. Sticky keeps everything in one
          consistent flow, and needs no measured spacer div. */}
      <div style={{position:"sticky",top:0,zIndex:isDesktop?50:20,background:T.bg,padding:isDesktop?"16px 0 8px":"0 0 8px"}}>
        <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:6,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",background:"#fff"}}>
            <button onClick={()=>stepMonth(-1)} disabled={fullYear} style={{background:"none",border:"none",cursor:fullYear?"default":"pointer",opacity:fullYear?0.3:1,fontSize:14,color:T.sub}}>‹</button>
            <MonthYearJump year={year} month={monthIdx+1} onPick={(y,m)=>setViewMonth(`${y}-${String(m).padStart(2,"0")}`)}/>
            <button onClick={()=>stepMonth(1)} disabled={fullYear} style={{background:"none",border:"none",cursor:fullYear?"default":"pointer",opacity:fullYear?0.3:1,fontSize:14,color:T.sub}}>›</button>
          </div>
          <button onClick={()=>setFullYear(f=>!f)} style={{background:fullYear?T.accent:"none",color:fullYear?"#fff":T.sub,border:`1px solid ${fullYear?T.accent:T.border}`,borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Full year</button>
          {fullYear&&(
            <button onClick={()=>setMonthlyView(m=>!m)} title="Show each month of the year side by side, instead of one total" style={{background:monthlyView?T.accent:"none",color:monthlyView?"#fff":T.sub,border:`1px solid ${monthlyView?T.accent:T.border}`,borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>By month</button>
          )}
          {projects.length>0&&(
            <select value={projectFilter} onChange={e=>setProjectFilter(e.target.value)} style={{border:`1px solid ${projectFilter?T.accent:T.border}`,borderRadius:8,padding:"7px 10px",fontSize:12,fontWeight:600,color:projectFilter?T.accent:T.sub,background:projectFilter?T.accentLight:"#fff",cursor:"pointer",fontFamily:"inherit"}}>
              <option value="">All projects</option>
              {projects.filter(p=>!p.inactive).map(p=><option key={p.id} value={p.id}>{p.number?p.number+" — ":""}{p.name}</option>)}
            </select>
          )}
        </div>
        <table style={{width:"100%",fontSize:13,borderCollapse:"collapse",background:"#fff",border:`1px solid ${T.border}`,borderRadius:"10px 10px 0 0"}}>
          <colgroup><col style={{width:"55%"}}/><col style={{width:"22.5%"}}/><col style={{width:"22.5%"}}/></colgroup>
          <tbody><tr style={{color:T.muted,fontSize:11}}>
            <td style={{padding:"8px 10px"}}></td><td style={{textAlign:"right",padding:"8px 10px"}}>{periodLabel}</td><td style={{textAlign:"right",padding:"8px 10px"}}>Previous period</td>
          </tr></tbody>
        </table>
      </div>

      <div id="resultat-print-area">
      {/* This line only shows up in the PDF/print export (hidden on screen
          since the sticky bar above already shows it) — so the period is
          never lost once the report is viewed or filed on its own. */}
      <div className="print-only-period" style={{display:"none",fontSize:13,fontWeight:700,color:T.text,marginBottom:12}}>Period: {periodLabel}{fullYear?"":` (${from} to ${to})`}</div>
      {fullYear&&monthlyView&&monthlyGroups?(
        <>
          <MonthlyTable groups={monthlyGroups.income} label="Income"/>
          <MonthlyTable groups={monthlyGroups.expense} label="Expenses"/>
        </>
      ):(
      <table style={{width:"100%",fontSize:13,borderCollapse:"collapse",background:"#fff",border:`1px solid ${T.border}`,borderTop:"none",borderRadius:"0 0 10px 10px"}}>
        <colgroup><col style={{width:"55%"}}/><col style={{width:"22.5%"}}/><col style={{width:"22.5%"}}/></colgroup>
        <tbody style={{padding:"0 10px"}}>
          <tr><td colSpan="3" style={{padding:"10px 10px 6px",fontSize:12,fontWeight:800,color:T.green,textTransform:"uppercase",letterSpacing:0.3}}>Income</td></tr>
          <GroupRows groups={incomeGroups}/>
          <tr style={{borderTop:`1px solid ${T.border}`}}><td style={{padding:"10px",fontWeight:800,fontSize:13}}>Total income</td><td style={{textAlign:"right",fontWeight:800,fontSize:13,padding:"10px"}}>{fmt(totalIncome)}</td><td style={{textAlign:"right",fontSize:12,color:T.muted,padding:"10px"}}>{fmt(totalIncomePrev)}</td></tr>

          <tr><td colSpan="3" style={{padding:"16px 10px 6px",fontSize:12,fontWeight:800,color:"#D97706",textTransform:"uppercase",letterSpacing:0.3}}>Expenses</td></tr>
          <GroupRows groups={expenseGroups}/>
          <tr style={{borderTop:`1px solid ${T.border}`}}><td style={{padding:"10px",fontWeight:800,fontSize:13}}>Total expenses</td><td style={{textAlign:"right",fontWeight:800,fontSize:13,padding:"10px"}}>{fmt(totalExpense)}</td><td style={{textAlign:"right",fontSize:12,color:T.muted,padding:"10px"}}>{fmt(totalExpensePrev)}</td></tr>

          <tr style={{borderTop:`2px solid ${T.text}`}}>
            <td style={{padding:"12px 10px",fontWeight:900,fontSize:15}}>Net profit / loss</td>
            <td style={{textAlign:"right",fontWeight:900,fontSize:15,color:net>=0?T.green:T.red,padding:"12px 10px"}}>{fmt(net)}</td>
            <td style={{textAlign:"right",fontWeight:700,fontSize:12,color:T.muted,padding:"12px 10px"}}>{fmt(netPrev)}</td>
          </tr>
        </tbody>
      </table>
      )}
      </div>
    </div>
  );
}

// Balance sheet — Assets vs Equity+Liabilities at a chosen date, grouped by
// series, with drill-down and a visible balancing check.
function BalanceSheetScreen({accounts,transactions,onOpenLedger,isDesktop=false}){
  const[asOf,setAsOf]=useState(()=>new Date().toISOString().slice(0,10));
  const[compareOn,setCompareOn]=useState(false);
  const[compareDate,setCompareDate]=useState(()=>{const d=new Date();d.setFullYear(d.getFullYear()-1);return d.toISOString().slice(0,10);});
  const[monthlyView,setMonthlyView]=useState(false);
  const balAt=(code,d)=>transactions.filter(t=>t.date<=d).reduce((s,t)=>{if(t.debitCode===code)return s+t.amount;if(t.creditCode===code)return s-t.amount;return s;},0);

  const assetSKs=["1000","1100","1200","1300","1400","1500","1600","1700","1800","1900"];
  const eqLiabSKs=["2000","2100","2200","2300","2400","2500","2600","2700","2800","2900"];

  const buildGroup=(sks,flip,date)=>sks.map(sk=>{
    const grpAccounts=accountsForSK(accounts,transactions,sk);
    if(!grpAccounts.length)return null;
    const rows=grpAccounts.map(a=>({code:a.code,name:a.name,bal:balAt(a.code,date)*(flip?-1:1)})).filter(r=>r.bal!==0);
    if(!rows.length)return null;
    return{sk,label:(SERIES[sk]&&SERIES[sk].name)||sk,rows,total:rows.reduce((s,r)=>s+r.bal,0)};
  }).filter(Boolean);

  const assetGroups=buildGroup(assetSKs,false,asOf);
  const eqLiabGroups=buildGroup(eqLiabSKs,true,asOf);
  const totalAssets=assetGroups.reduce((s,g)=>s+g.total,0);
  const totalEqLiab=eqLiabGroups.reduce((s,g)=>s+g.total,0);
  const diff=totalAssets-totalEqLiab;

  // Monthly snapshot view — a balance sheet is a cumulative, point-in-time
  // figure (not a flow like income/expenses), so "by month" here means the
  // balance AS OF the end of each month, not what moved during that month.
  // Reuses balAt/buildGroup exactly as the single-date view does, just
  // called once per month-end instead of once for the chosen "as of" date.
  const monthlySnapshot=useMemo(()=>{
    if(!monthlyView)return null;
    const year=parseInt(asOf.slice(0,4));
    const monthEnds=Array.from({length:12},(_,m)=>`${year}-${String(m+1).padStart(2,"0")}-${String(new Date(year,m+1,0).getDate()).padStart(2,"0")}`);
    const buildMonthly=(sks,flip)=>sks.map(sk=>{
      const grpAccounts=accountsForSK(accounts,transactions,sk);
      if(!grpAccounts.length)return null;
      const rows=grpAccounts.map(a=>{
        const months=monthEnds.map(d=>balAt(a.code,d)*(flip?-1:1));
        return{code:a.code,name:a.name,months};
      }).filter(r=>r.months.some(v=>v!==0));
      if(!rows.length)return null;
      const monthTotals=Array.from({length:12},(_,m)=>rows.reduce((s,r)=>s+r.months[m],0));
      return{sk,label:(SERIES[sk]&&SERIES[sk].name)||sk,rows,monthTotals};
    }).filter(Boolean);
    return{assets:buildMonthly(assetSKs,false),eqLiab:buildMonthly(eqLiabSKs,true),year};
  },[monthlyView,asOf,accounts,transactions]);

  // Comparison — same groups as of a second date, matched by series key so
  // totals line up even if a group has activity on one date but not the other.
  const compareTotalsBySk=useMemo(()=>{
    if(!compareOn)return{};
    const m={};
    buildGroup(assetSKs,false,compareDate).forEach(g=>m[g.sk]=g.total);
    buildGroup(eqLiabSKs,true,compareDate).forEach(g=>m[g.sk]=g.total);
    return m;
  },[compareOn,compareDate,accounts,transactions]);
  const compareTotalAssets=assetSKs.reduce((s,sk)=>s+(compareTotalsBySk[sk]||0),0);
  const compareTotalEqLiab=eqLiabSKs.reduce((s,sk)=>s+(compareTotalsBySk[sk]||0),0);

  const GroupRows=({groups})=>groups.map(g=>(
    <React.Fragment key={g.sk}>
      <tr style={{borderTop:`1px solid ${T.border}`}}>
        <td style={{padding:"8px 10px",fontWeight:800,fontSize:13}}>{g.label}</td>
        <td style={{textAlign:"right",fontWeight:800,padding:"8px 10px",fontSize:13}}>{fmt(g.total)}</td>
        {compareOn&&<td style={{textAlign:"right",fontWeight:600,color:T.muted,fontSize:12,padding:"8px 10px"}}>{fmt(compareTotalsBySk[g.sk]||0)}</td>}
      </tr>
      {g.rows.map(r=>(
        <tr key={r.code} onClick={()=>onOpenLedger&&onOpenLedger({code:r.code,name:r.name},"2020-01-01",asOf)} style={{cursor:"pointer"}}>
          <td style={{padding:"6px 10px 6px 26px",color:T.accent,fontSize:13}}>{r.code} {r.name}</td>
          <td style={{textAlign:"right",fontSize:13,padding:"6px 10px"}}>{fmt(r.bal)}</td>
          {compareOn&&<td style={{padding:"6px 10px"}}></td>}
        </tr>
      ))}
    </React.Fragment>
  ));

  const MONTH_LABELS_BS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const MonthlySnapshotTable=({groups,label,year})=>{
    if(!groups.length)return null;
    const grandTotals=Array.from({length:12},(_,m)=>groups.reduce((s,g)=>s+g.monthTotals[m],0));
    return(
      <div style={{overflowX:"auto",marginBottom:20}}>
        <div style={{fontSize:12,fontWeight:800,color:T.text,textTransform:"uppercase",marginBottom:8}}>{label} — {year}, as of each month-end</div>
        <table style={{borderCollapse:"collapse",fontSize:11,minWidth:900}}>
          <thead>
            <tr style={{borderBottom:`2px solid ${T.border}`}}>
              <td style={{padding:"6px 10px",fontWeight:700,color:T.muted,position:"sticky",left:0,background:T.bg,minWidth:160}}>Account</td>
              {MONTH_LABELS_BS.map(m=><td key={m} style={{padding:"6px 8px",textAlign:"right",fontWeight:700,color:T.muted,minWidth:78}}>{m}</td>)}
            </tr>
          </thead>
          <tbody>
            {groups.map(g=>(
              <React.Fragment key={g.sk}>
                <tr style={{borderTop:`1px solid ${T.border}`}}>
                  <td style={{padding:"6px 10px",fontWeight:800,position:"sticky",left:0,background:"#fff"}}>{g.label}</td>
                  {g.monthTotals.map((v,i)=><td key={i} style={{textAlign:"right",padding:"6px 8px",fontWeight:700}}>{v===0?"—":fmt(v)}</td>)}
                </tr>
                {g.rows.map(r=>(
                  <tr key={r.code} onClick={()=>onOpenLedger&&onOpenLedger({code:r.code,name:r.name},`${year}-01-01`,`${year}-12-31`)} style={{cursor:"pointer"}}>
                    <td style={{padding:"5px 10px 5px 22px",color:T.accent,position:"sticky",left:0,background:"#fff"}}>{r.code} {r.name}</td>
                    {r.months.map((v,i)=><td key={i} style={{textAlign:"right",padding:"5px 8px",color:T.sub}}>{v===0?"—":fmt(v)}</td>)}
                  </tr>
                ))}
              </React.Fragment>
            ))}
            <tr style={{borderTop:`2px solid ${T.text}`,fontWeight:900}}>
              <td style={{padding:"7px 10px",position:"sticky",left:0,background:T.bg}}>Total {label}</td>
              {grandTotals.map((v,i)=><td key={i} style={{textAlign:"right",padding:"7px 8px"}}>{fmt(v)}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  const exportPdf=()=>{
    const el=document.getElementById("balancesheet-print-area");
    const periodEl=el&&el.querySelector(".print-only-period");
    if(periodEl)periodEl.style.display="block";
    if(el&&window.html2pdf)window.html2pdf().from(el).set({margin:20,filename:`BalanceSheet_${asOf}.pdf`,html2canvas:{scale:2},jsPDF:{unit:"pt",format:"a4",orientation:"portrait"}}).save().then(()=>{if(periodEl)periodEl.style.display="none";});
  };

  return(
    <div>
      {/* Sticky, not fixed — see TrialBalanceScreen for why: fixed puts
          this header in a different width context than the real table
          below (ignoring the scrollbar gutter), causing column drift. */}
      <div style={isDesktop?{position:"sticky",top:0,zIndex:50,background:T.bg,padding:"16px 0 8px"}:{}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:10}}>
          <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Balance sheet</h1>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:11,color:T.muted}}>As of</span>
            <input type="date" value={asOf} onChange={e=>setAsOf(e.target.value)} style={{...inp,width:150}}/>
            <button onClick={exportPdf} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}><i className="ti ti-file-type-pdf" style={{fontSize:13,marginRight:5}}/>PDF</button>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:T.sub,cursor:"pointer"}}>
            <input type="checkbox" checked={compareOn} onChange={e=>setCompareOn(e.target.checked)} disabled={monthlyView}/>Compare to another date
          </label>
          {compareOn&&!monthlyView&&<input type="date" value={compareDate} onChange={e=>setCompareDate(e.target.value)} style={{...inp,width:150}}/>}
          <button onClick={()=>setMonthlyView(m=>!m)} title="Show a snapshot as of the end of every month this year, side by side" style={{background:monthlyView?T.accent:"none",color:monthlyView?"#fff":T.sub,border:`1px solid ${monthlyView?T.accent:T.border}`,borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>By month</button>
        </div>
      </div>
      <div style={{height:8}}/>
      <div id="balancesheet-print-area">
      <div className="print-only-period" style={{display:"none",fontSize:13,fontWeight:700,color:T.text,marginBottom:12}}>As of {asOf}{compareOn?` (compared to ${compareDate})`:""}</div>
      {monthlyView&&monthlySnapshot?(
        <>
          <MonthlySnapshotTable groups={monthlySnapshot.assets} label="Assets" year={monthlySnapshot.year}/>
          <MonthlySnapshotTable groups={monthlySnapshot.eqLiab} label="Equity and liabilities" year={monthlySnapshot.year}/>
        </>
      ):(
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(340px, 1fr))",gap:24}}>
        <div>
          <div style={{fontSize:12,fontWeight:800,color:T.text,textTransform:"uppercase",marginBottom:6}}>Assets</div>
          <table style={{width:"100%",fontSize:13,borderCollapse:"collapse"}}>
            <colgroup><col style={{width:"55%"}}/><col style={{width:compareOn?"22.5%":"45%"}}/>{compareOn&&<col style={{width:"22.5%"}}/>}</colgroup>
            {compareOn&&<thead><tr style={{color:T.muted,fontSize:11}}><td style={{padding:"6px 10px"}}></td><td style={{textAlign:"right",padding:"6px 10px"}}>{asOf}</td><td style={{textAlign:"right",padding:"6px 10px"}}>{compareDate}</td></tr></thead>}
            <tbody>
              <GroupRows groups={assetGroups}/>
              <tr style={{borderTop:`2px solid ${T.text}`}}>
                <td style={{padding:"10px",fontWeight:900,fontSize:14}}>Total assets</td>
                <td style={{textAlign:"right",fontWeight:900,fontSize:14,padding:"10px"}}>{fmt(totalAssets)}</td>
                {compareOn&&<td style={{textAlign:"right",fontWeight:700,color:T.muted,fontSize:12,padding:"10px"}}>{fmt(compareTotalAssets)}</td>}
              </tr>
            </tbody>
          </table>
        </div>
        <div>
          <div style={{fontSize:12,fontWeight:800,color:T.text,textTransform:"uppercase",marginBottom:6}}>Equity and liabilities</div>
          <table style={{width:"100%",fontSize:13,borderCollapse:"collapse"}}>
            <colgroup><col style={{width:"55%"}}/><col style={{width:compareOn?"22.5%":"45%"}}/>{compareOn&&<col style={{width:"22.5%"}}/>}</colgroup>
            {compareOn&&<thead><tr style={{color:T.muted,fontSize:11}}><td style={{padding:"6px 10px"}}></td><td style={{textAlign:"right",padding:"6px 10px"}}>{asOf}</td><td style={{textAlign:"right",padding:"6px 10px"}}>{compareDate}</td></tr></thead>}
            <tbody>
              <GroupRows groups={eqLiabGroups}/>
              <tr style={{borderTop:`2px solid ${T.text}`}}>
                <td style={{padding:"10px",fontWeight:900,fontSize:14}}>Total equity and liabilities</td>
                <td style={{textAlign:"right",fontWeight:900,fontSize:14,padding:"10px"}}>{fmt(totalEqLiab)}</td>
                {compareOn&&<td style={{textAlign:"right",fontWeight:700,color:T.muted,fontSize:12,padding:"10px"}}>{fmt(compareTotalEqLiab)}</td>}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      )}
      {!monthlyView&&(
      <div style={{marginTop:20,padding:"12px 16px",borderRadius:10,background:Math.abs(diff)<1?T.greenBg:T.redLight,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:13,fontWeight:700,color:Math.abs(diff)<1?T.green:T.red}}>{Math.abs(diff)<1?"✓ Balanced":"⚠ Out of balance"}</span>
        {Math.abs(diff)>=1&&<span style={{fontSize:13,fontWeight:700,color:T.red}}>Difference: {fmt(diff)}</span>}
      </div>
      )}
      </div>
    </div>
  );
}

// VAT report — calculated from VAT captured on sales invoices. Honest scope
// note shown in the UI: supplier vouchers/receipts don't capture purchase VAT
// separately yet, so this is sales (output) VAT only, not a full net position.
function VATReportScreen({invoices,contacts,transactions}){
  const[showInfo,setShowInfo]=useState(false);
  const[viewMonth,setViewMonth]=useState(()=>new Date().toISOString().slice(0,7));
  const[fullYear,setFullYear]=useState(false);
  const year=parseInt(viewMonth.slice(0,4));
  const monthIdx=parseInt(viewMonth.slice(5,7))-1;
  const periodLabel=fullYear?String(year):new Date(year,monthIdx,1).toLocaleString("default",{month:"long"})+" "+year;
  const stepMonth=(dir)=>{let m=monthIdx+dir,y=year;if(m<0){m=11;y-=1;}else if(m>11){m=0;y+=1;}setViewMonth(`${y}-${String(m+1).padStart(2,"0")}`);};
  const inPeriod=(d)=>fullYear?d.slice(0,4)===String(year):d.slice(0,7)===viewMonth;

  const getContactName=id=>{const c=contacts.find(x=>x.id===id);return c?c.name:"Unknown";};
  const periodInvoices=useMemo(()=>[...invoices].filter(i=>inPeriod(i.date)).sort((a,b)=>a.date.localeCompare(b.date)),[invoices,viewMonth,fullYear]);
  const totalSubtotal=periodInvoices.reduce((s,i)=>s+i.subtotal,0);
  const totalVat=periodInvoices.reduce((s,i)=>s+i.vatAmount,0);
  const totalGross=periodInvoices.reduce((s,i)=>s+i.total,0);

  const byRate=useMemo(()=>{
    const m={};
    periodInvoices.forEach(i=>{const r=i.vatPct;if(!m[r])m[r]={rate:r,subtotal:0,vat:0};m[r].subtotal+=i.subtotal;m[r].vat+=i.vatAmount;});
    return Object.values(m).sort((a,b)=>b.rate-a.rate);
  },[periodInvoices]);

  // Purchase (input) VAT — any expense-account entry with VAT entered, not
  // only supplier invoices credited to Accounts Payable (2400). The old
  // filter required creditCode==="2400" specifically, which silently
  // excluded the most common case for a small business: a purchase paid
  // straight from a bank account (fuel, parking, tolls, a card purchase) —
  // those credit a bank account code, never 2400, so their input VAT never
  // appeared here even after it was correctly captured on the entry itself.
  // isExpenseSK(debitCode) matches Mva-meldinger's own purchase-VAT logic.
  const periodPurchases=useMemo(()=>(transactions||[]).filter(t=>inPeriod(t.date)&&t.vatAmount!=null&&t.vatAmount!==0&&isExpenseSK(t.debitCode)).sort((a,b)=>a.date.localeCompare(b.date)),[transactions,viewMonth,fullYear]);
  const totalPurchaseVat=periodPurchases.reduce((s,t)=>s+(t.vatAmount||0),0);
  const totalPurchaseNet=periodPurchases.reduce((s,t)=>s+(t.amount-(t.vatAmount||0)),0);
  const netVatPosition=totalVat-totalPurchaseVat;
  const exportPdf=()=>{
    const el=document.getElementById("vatreport-print-area");
    if(el&&window.html2pdf)window.html2pdf().from(el).set({margin:20,filename:`VATReport_${periodLabel.replace(/\s/g,"_")}.pdf`,html2canvas:{scale:2},jsPDF:{unit:"pt",format:"a4",orientation:"portrait"}}).save();
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>VAT report</h1>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{position:"relative"}}>
            <i className="ti ti-info-circle" onClick={()=>setShowInfo(s=>!s)} title="About this report" style={{fontSize:16,color:T.muted,cursor:"pointer"}}/>
            {showInfo&&(<>
              <div onClick={()=>setShowInfo(false)} style={{position:"fixed",inset:0,zIndex:298}}/>
              <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",width:320,background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,zIndex:299,boxShadow:"0 8px 24px rgba(0,0,0,0.14)",padding:14,fontSize:11,color:T.sub,lineHeight:1.5}}>
                <div style={{marginBottom:10}}>Sales VAT comes from invoices; purchase VAT comes from any expense entry (voucher or direct bank payment) where a VAT code was selected. Entries with no VAT code chosen won't appear on the purchase side.</div>
                <div style={{display:"flex",gap:6,alignItems:"flex-start"}}>
                  <i className="ti ti-building-bank" style={{fontSize:14,flexShrink:0,marginTop:1}}/>
                  <span>These are calculations only — direct e-filing to FBR (Pakistan) or Altinn (Norway) needs government API access, which is its own setup. Use the PDF export to file manually until then.</span>
                </div>
              </div>
            </>)}
          </div>
          <button onClick={exportPdf} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}><i className="ti ti-file-type-pdf" style={{fontSize:13,marginRight:5}}/>PDF</button>
        </div>
      </div>
      <div id="vatreport-print-area">
      <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:6,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px"}}>
          <button onClick={()=>stepMonth(-1)} disabled={fullYear} style={{background:"none",border:"none",cursor:fullYear?"default":"pointer",opacity:fullYear?0.3:1,fontSize:14,color:T.sub}}>‹</button>
          <MonthYearJump year={year} month={monthIdx+1} onPick={(y,m)=>setViewMonth(`${y}-${String(m).padStart(2,"0")}`)}/>
          <button onClick={()=>stepMonth(1)} disabled={fullYear} style={{background:"none",border:"none",cursor:fullYear?"default":"pointer",opacity:fullYear?0.3:1,fontSize:14,color:T.sub}}>›</button>
        </div>
        <button onClick={()=>setFullYear(f=>!f)} style={{background:fullYear?T.accent:"none",color:fullYear?"#fff":T.sub,border:`1px solid ${fullYear?T.accent:T.border}`,borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Full year</button>
      </div>

      <div style={{background:netVatPosition>=0?T.redLight:T.greenBg,border:`1px solid ${netVatPosition>=0?T.red:T.green}`,borderRadius:12,padding:18,marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:12,color:netVatPosition>=0?T.red:T.green,fontWeight:700}}>{netVatPosition>=0?"Net VAT payable":"Net VAT reclaimable"}</div>
          <div style={{fontSize:11,color:T.muted,marginTop:2}}>VAT collected on sales minus VAT paid on purchases</div>
        </div>
        <div style={{fontSize:24,fontWeight:900,color:netVatPosition>=0?T.red:T.green}}>{fmt(Math.abs(netVatPosition))}</div>
      </div>

      <div style={{fontSize:12,fontWeight:800,color:T.text,marginBottom:8,textTransform:"uppercase",letterSpacing:0.5}}>Sales (output VAT)</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:20}}>
        <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:16}}>
          <div style={{fontSize:12,color:T.sub}}>Sales excl. VAT</div>
          <div style={{fontSize:18,fontWeight:800,color:T.text,marginTop:4}}>{fmt(totalSubtotal)}</div>
        </div>
        <div style={{background:T.accentLight,border:`1px solid ${T.accent}`,borderRadius:12,padding:16}}>
          <div style={{fontSize:12,color:T.accent}}>VAT collected</div>
          <div style={{fontSize:18,fontWeight:800,color:T.accent,marginTop:4}}>{fmt(totalVat)}</div>
        </div>
        <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:16}}>
          <div style={{fontSize:12,color:T.sub}}>Total incl. VAT</div>
          <div style={{fontSize:18,fontWeight:800,color:T.text,marginTop:4}}>{fmt(totalGross)}</div>
        </div>
      </div>

      {byRate.length>1&&(
        <div style={{marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:800,color:T.text,marginBottom:8}}>By rate</div>
          <table className="rr-sticky-thead" style={{width:"100%",fontSize:13,borderCollapse:"collapse"}}>
            <thead><tr style={{color:T.muted,fontSize:11}}><td style={{padding:"6px 0"}}>Rate</td><td style={{textAlign:"right"}}>Sales excl. VAT</td><td style={{textAlign:"right"}}>VAT</td></tr></thead>
            <tbody>{byRate.map(r=>(
              <tr key={r.rate} style={{borderTop:`1px solid ${T.border}`}}>
                <td style={{padding:"6px 0"}}>{r.rate}%</td><td style={{textAlign:"right"}}>{fmt(r.subtotal)}</td><td style={{textAlign:"right"}}>{fmt(r.vat)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <div style={{fontSize:12,fontWeight:800,color:T.text,marginBottom:8}}>Invoices this period</div>
      <table style={{width:"100%",fontSize:13,borderCollapse:"collapse",marginBottom:24}}>
        <thead><tr style={{color:T.muted,fontSize:11}}>
          <td style={{padding:"6px 0"}}>Invoice</td><td>Customer</td><td>Date</td><td style={{textAlign:"right"}}>Excl. VAT</td><td style={{textAlign:"right"}}>VAT</td><td style={{textAlign:"right"}}>Total</td>
        </tr></thead>
        <tbody>
          {periodInvoices.map(i=>(
            <tr key={i.id} style={{borderTop:`1px solid ${T.border}`}}>
              <td style={{padding:"7px 0",color:i.status==="credit_note"?T.red:T.accent,fontWeight:700}}>{i.status==="credit_note"?"CN":"#"}{i.invoiceNo}</td>
              <td>{getContactName(i.customerId)}</td>
              <td style={{color:T.sub}}>{i.date}</td>
              <td style={{textAlign:"right"}}>{fmt(i.subtotal)}</td>
              <td style={{textAlign:"right"}}>{fmt(i.vatAmount)}</td>
              <td style={{textAlign:"right",fontWeight:700}}>{fmt(i.total)}</td>
            </tr>
          ))}
          {!periodInvoices.length&&<tr><td colSpan="6" style={{padding:"24px 0",textAlign:"center",color:T.muted}}>No invoices this period.</td></tr>}
        </tbody>
      </table>

      <div style={{fontSize:12,fontWeight:800,color:T.text,marginBottom:8,textTransform:"uppercase",letterSpacing:0.5}}>Purchases (input VAT)</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:16}}>
        <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:16}}>
          <div style={{fontSize:12,color:T.sub}}>Purchases excl. VAT</div>
          <div style={{fontSize:18,fontWeight:800,color:T.text,marginTop:4}}>{fmt(totalPurchaseNet)}</div>
        </div>
        <div style={{background:T.redLight,border:`1px solid ${T.red}`,borderRadius:12,padding:16}}>
          <div style={{fontSize:12,color:T.red}}>VAT paid</div>
          <div style={{fontSize:18,fontWeight:800,color:T.red,marginTop:4}}>{fmt(totalPurchaseVat)}</div>
        </div>
      </div>
      <table className="rr-sticky-thead" style={{width:"100%",fontSize:13,borderCollapse:"collapse"}}>
        <thead><tr style={{color:T.muted,fontSize:11}}>
          <td style={{padding:"6px 0"}}>Bilag</td><td>Description</td><td>Date</td><td style={{textAlign:"right"}}>Excl. VAT</td><td style={{textAlign:"right"}}>VAT</td><td style={{textAlign:"right"}}>Total</td>
        </tr></thead>
        <tbody>
          {periodPurchases.map(t=>(
            <tr key={t.id} style={{borderTop:`1px solid ${T.border}`}}>
              <td style={{padding:"7px 0",color:T.accent,fontWeight:700}}>{fmtB(t.bilag)}</td>
              <td>{t.description}</td>
              <td style={{color:T.sub}}>{t.date}</td>
              <td style={{textAlign:"right"}}>{fmt(t.amount-(t.vatAmount||0))}</td>
              <td style={{textAlign:"right"}}>{fmt(t.vatAmount||0)}</td>
              <td style={{textAlign:"right",fontWeight:700}}>{fmt(t.amount)}</td>
            </tr>
          ))}
          {!periodPurchases.length&&<tr><td colSpan="6" style={{padding:"24px 0",textAlign:"center",color:T.muted}}>No supplier vouchers with VAT recorded this period.</td></tr>}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// Norwegian bi-monthly VAT terminer — 6 fixed periods per year with their
// real statutory due dates (Termin 3 gets the summer-extended 31 August
// deadline instead of the usual 10th-of-second-month pattern).
const VAT_TERMINER=[
  {n:1,months:[0,1],dueMonth:3,dueDay:10},
  {n:2,months:[2,3],dueMonth:5,dueDay:10},
  {n:3,months:[4,5],dueMonth:7,dueDay:31},
  {n:4,months:[6,7],dueMonth:9,dueDay:10},
  {n:5,months:[8,9],dueMonth:11,dueDay:10},
  {n:6,months:[10,11],dueMonth:1,dueDay:10,dueYearOffset:1},
];
const terminInfo=(year,n)=>{
  const t=VAT_TERMINER.find(x=>x.n===n);
  const from=`${year}-${String(t.months[0]+1).padStart(2,"0")}-01`;
  const lastMonth=t.months[1];
  const lastDay=new Date(year,lastMonth+1,0).getDate();
  const to=`${year}-${String(lastMonth+1).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;
  const dueYear=year+(t.dueYearOffset||0);
  const due=`${dueYear}-${String(t.dueMonth+1).padStart(2,"0")}-${String(t.dueDay).padStart(2,"0")}`;
  const label=`Termin ${n} (${new Date(year,t.months[0],1).toLocaleString("default",{month:"long"})}–${new Date(year,t.months[1],1).toLocaleString("default",{month:"long"})})`;
  return{n,year,from,to,due,label};
};
// Local status tracking — there's no real filing/payment integration yet
// (that needs Altinn API access, its own project), so "filed"/"paid"/
// "reconciled" are tracked per browser for now, same pattern as the other
// lightweight settings elsewhere in the app.
const VAT_STATUS_KEY="rr_vat_termin_status";
const getVatStatuses=()=>{try{return JSON.parse(localStorage.getItem(VAT_STATUS_KEY)||"{}");}catch{return{};}};
const setVatStatus=(year,n,updates)=>{
  const all=getVatStatuses();
  const key=`${year}-${n}`;
  all[key]={...(all[key]||{}),...updates};
  try{localStorage.setItem(VAT_STATUS_KEY,JSON.stringify(all));}catch{}
};
const VAT_CONTROLLED_KEY="rr_vat_controlled";
const getControlledIds=(year,n)=>{try{return new Set(JSON.parse(localStorage.getItem(VAT_CONTROLLED_KEY)||"{}")[`${year}-${n}`]||[]);}catch{return new Set();}};
const toggleControlled=(year,n,txnId)=>{
  let all;try{all=JSON.parse(localStorage.getItem(VAT_CONTROLLED_KEY)||"{}");}catch{all={};}
  const key=`${year}-${n}`;
  const set=new Set(all[key]||[]);
  if(set.has(txnId))set.delete(txnId);else set.add(txnId);
  all[key]=[...set];
  try{localStorage.setItem(VAT_CONTROLLED_KEY,JSON.stringify(all));}catch{}
};

function VATTerminScreen({transactions,accounts,contacts,onOpenTermin}){
  const[year,setYear]=useState(()=>new Date().getFullYear());
  const[,forceTick]=useState(0);
  const today=new Date().toISOString().slice(0,10);

  const rows=useMemo(()=>VAT_TERMINER.map(t=>{
    const info=terminInfo(year,t.n);
    const periodTxns=transactions.filter(tx=>tx.date>=info.from&&tx.date<=info.to);
    const sales=periodTxns.filter(tx=>isIncomeSK(tx.creditCode));
    const purchases=periodTxns.filter(tx=>isExpenseSK(tx.debitCode));
    const totalSales=sales.reduce((s,tx)=>s+tx.amount,0);
    const totalExpenses=purchases.reduce((s,tx)=>s+tx.amount,0);
    const vatOut=sales.reduce((s,tx)=>s+(tx.vatAmount||0),0);
    const vatIn=purchases.reduce((s,tx)=>s+(tx.vatAmount||0),0);
    const netVat=vatOut-vatIn;
    const bilagCount=periodTxns.filter(tx=>tx.vatAmount!=null&&tx.vatAmount!==0).length;
    const status=(getVatStatuses()[`${year}-${t.n}`])||{};
    return{...info,totalSales,totalExpenses,vatOut,vatIn,netVat,bilagCount,status};
  }),[transactions,year]);


  const statusLabel=(r)=>{
    if(r.status.filed&&r.status.paid)return{text:"Betalt · Sendt & Betalt",color:T.green,dot:T.green};
    if(r.status.filed&&r.status.reconciled)return{text:"Sendt · Avstemt",color:T.sub,dot:T.accent};
    if(r.status.filed)return{text:"Sendt · Ikke betalt",color:"#B45309",dot:"#F59E0B"};
    if(r.due<today)return{text:"Klar for innlevering",color:T.red,dot:T.red};
    return{text:"Ikke sendt",color:T.muted,dot:T.border};
  };

  const markReconciled=(r)=>{setVatStatus(year,r.n,{reconciled:true});forceTick(x=>x+1);};

  const exportYearXlsx=()=>{
    const aoa=[["Periode","Meldingstype","Forfallsdato","Beløp","Bilagsnummer","Leveringsstatus","Betalingsstatus"]];
    rows.forEach(r=>aoa.push([r.label,"Alminnelig næring",r.due,r.netVat,r.bilagCount,r.status.filed?"Sendt til Skatteetaten":"Ikke sendt til Skatteetaten",r.status.paid?"Betaling registrert":"Ikke betalt"]));
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb,ws,"Mva-meldinger");
    XLSX.writeFile(wb,`Mva-meldinger_${year}.xlsx`);
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Mva-meldinger</h1>
        <button onClick={exportYearXlsx} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 11px",fontSize:11,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}><i className="ti ti-download" style={{fontSize:12,marginRight:5}}/>Export {year}</button>
      </div>
      <select value={year} onChange={e=>setYear(parseInt(e.target.value))} style={{...inp,width:100,marginBottom:12,fontSize:12,padding:"6px 8px"}}>
        {[year-1,year,year+1].map(y=><option key={y} value={y}>{y}</option>)}
      </select>
      <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden"}}>
        <table style={{width:"100%",fontSize:11.5,borderCollapse:"collapse"}}>
          <thead><tr style={{color:T.muted,fontSize:10,textAlign:"left"}}>
            <td style={{padding:"8px 14px"}}>Periode</td><td>Meldingstype</td><td>Forfallsdato</td><td style={{textAlign:"right"}}>Beløp</td><td>Bilagsnummer</td><td>Leveringsstatus</td><td>Betalingsstatus</td><td>Handlinger</td>
          </tr></thead>
          <tbody>
            {rows.map(r=>{
              const deliveryDot=r.status.filed?T.green:(r.due<today?T.red:T.border);
              const deliveryText=r.status.filed?"Sendt til Skatteetaten":r.due<today?"Klar for innlevering":"Ikke sendt til Skatteetaten";
              const paymentDot=r.status.paid?T.green:r.status.filed?"#F59E0B":T.border;
              const paymentText=r.status.paid?"Betaling registrert":r.status.filed?"Ikke betalt":"Ikke betalt";
              return(
                <tr key={r.n} style={{borderTop:`1px solid ${T.border}`}}>
                  <td style={{padding:"9px 14px",color:T.text,fontWeight:600}}>{r.label}</td>
                  <td style={{color:T.sub}}>Alminnelig næring</td>
                  <td style={{color:r.due<today&&!r.status.filed?T.red:T.sub}}>{r.due}</td>
                  <td style={{textAlign:"right",color:T.text,fontWeight:700}}>{fmt(r.netVat)}</td>
                  <td style={{color:T.muted}}>{r.bilagCount?<><i className="ti ti-paperclip" style={{fontSize:11,marginRight:4}}/>{r.bilagCount}</>:"Bilag ikke opprettet"}</td>
                  <td>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{width:7,height:7,borderRadius:"50%",background:deliveryDot,flexShrink:0}}/>
                      <span style={{fontSize:10.5,color:T.sub}}>{deliveryText}</span>
                    </div>
                  </td>
                  <td>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{width:7,height:7,borderRadius:"50%",background:paymentDot,flexShrink:0}}/>
                      <span style={{fontSize:10.5,color:T.sub}}>{paymentText}</span>
                    </div>
                  </td>
                  <td style={{padding:"9px 14px"}}>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>onOpenTermin({year,n:r.n})} style={{background:T.accent,color:"#fff",border:"none",borderRadius:6,padding:"5px 10px",fontSize:10.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{r.status.filed?"Detaljer":"Start innlevering"}</button>
                      <button onClick={()=>markReconciled(r)} disabled={!r.status.filed} style={{background:r.status.filed?"#fff":T.bg,color:r.status.filed?T.text:T.muted,border:`1px solid ${T.border}`,borderRadius:6,padding:"5px 10px",fontSize:10.5,fontWeight:700,cursor:r.status.filed?"pointer":"not-allowed",fontFamily:"inherit"}}>Avstem</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Termin drill-down — sales/purchases grouped by VAT rate, plus a no-VAT
// section for everything else in the period. Clicking a bilag opens the
// exact same DetailModal used everywhere else in the app (same edit form,
// same comment thread), so "controlled"/notes just reuses the comment
// system that already exists rather than inventing a parallel one.
function VATTerminDetailScreen({termin,transactions,accounts,contacts,onBack,detailModalProps}){
  const info=terminInfo(termin.year,termin.n);
  const[openTxn,setOpenTxn]=useState(null);
  // Which rate rows have their specification expanded inline — clicking the
  // Grunnlag/Mva amount in the summary table toggles this, instead of the
  // page always showing every code's account+transaction breakdown twice
  // (once implicitly via the summary row, once via a whole separate
  // "Spesifikasjon" section repeating the same code/rate/grunnlag/mva
  // header) whether you wanted the detail or not.
  const[expandedRates,setExpandedRates]=useState(new Set());
  const toggleRate=(key)=>setExpandedRates(prev=>{const n=new Set(prev);n.has(key)?n.delete(key):n.add(key);return n;});
  const[,forceTick]=useState(0);
  const controlledIds=getControlledIds(termin.year,termin.n);
  const status=(getVatStatuses()[`${termin.year}-${termin.n}`])||{};
  const markFiled=()=>{setVatStatus(termin.year,termin.n,{filed:true,filedDate:new Date().toISOString().slice(0,10)});forceTick(x=>x+1);};
  const markPaid=()=>{setVatStatus(termin.year,termin.n,{paid:true});forceTick(x=>x+1);};

  const periodTxns=useMemo(()=>transactions.filter(t=>t.date>=info.from&&t.date<=info.to),[transactions,info.from,info.to]);
  const salesTxns=periodTxns.filter(t=>isIncomeSK(t.creditCode)&&t.vatAmount!=null&&t.vatAmount!==0);
  const purchaseTxns=periodTxns.filter(t=>isExpenseSK(t.debitCode)&&t.vatAmount!=null&&t.vatAmount!==0);
  const vatIds=new Set([...salesTxns,...purchaseTxns].map(t=>t.id));
  const nonVatTxns=periodTxns.filter(t=>!vatIds.has(t.id));

  const groupByRate=(rows)=>{
    const m={};
    rows.forEach(t=>{const r=t.vatPct||0;if(!m[r])m[r]={rate:r,rows:[],net:0,vat:0};m[r].rows.push(t);m[r].net+=(t.amount-(t.vatAmount||0));m[r].vat+=(t.vatAmount||0);});
    return Object.values(m).sort((a,b)=>b.rate-a.rate);
  };
  const salesByRate=groupByRate(salesTxns);
  const purchasesByRate=groupByRate(purchaseTxns);
  // Further breakdown within each rate group — which actual income/expense
  // account the VAT base came from, not just the total for the rate. Sales
  // group by the credit side (the revenue account itself); purchases group
  // by the debit side (the expense account itself) — the offsetting
  // bank/AR/AP account on the other leg is still shown per-row via otherCode.
  const groupByAccount=(rows,codeField)=>{
    const m={};
    rows.forEach(t=>{
      const code=t[codeField];
      if(!m[code])m[code]={code,rows:[],net:0,vat:0};
      m[code].rows.push(t);m[code].net+=(t.amount-(t.vatAmount||0));m[code].vat+=(t.vatAmount||0);
    });
    return Object.values(m).sort((a,b)=>String(a.code).localeCompare(String(b.code)));
  };

  const totalSales=periodTxns.filter(t=>isIncomeSK(t.creditCode)).reduce((s,t)=>s+t.amount,0);
  const totalExpenses=periodTxns.filter(t=>isExpenseSK(t.debitCode)).reduce((s,t)=>s+t.amount,0);
  const vatOut=salesTxns.reduce((s,t)=>s+(t.vatAmount||0),0);
  const vatIn=purchaseTxns.reduce((s,t)=>s+(t.vatAmount||0),0);
  const netVat=vatOut-vatIn;

  const getName=code=>{const a=accounts.find(x=>x.code===code);return a?`${a.code} ${a.name}`:code;};

  // No Skatteetaten/Altinn filing integration — instead, an extractable
  // report: the same Mva-kode/Sats/Grunnlag/Mva summary as a real filing,
  // downloadable as PDF (for records/handing to an accountant) or Excel
  // (for further work), same pattern General ledger's export uses.
  const exportXlsx=()=>{
    const aoa=[["Mva-melding",info.label],["Forfall",info.due],[],["Mva-kode","Beskrivelse","Sats","Grunnlag","Mva"],["Salg av varer og tjenester i Norge","","","",""]];
    salesByRate.forEach(g=>{const vc=vatCodeForRate(g.rate,"output");aoa.push([vc?vc.code:"",vc?vc.name:`${g.rate}% mva-sats`,g.rate,g.net,g.vat]);});
    aoa.push(["Kjøp av varer og tjenester i Norge","","","",""]);
    purchasesByRate.forEach(g=>{const vc=vatCodeForRate(g.rate,"input");aoa.push([vc?vc.code:"",vc?vc.name:`${g.rate}% mva-sats`,g.rate,-g.net,-g.vat]);});
    aoa.push([],[netVat>=0?"Skyldig terminbeløp":"Terminbeløp til gode","","","",Math.abs(netVat)]);
    aoa.push([],["Spesifikasjon","","","",""],["Bilag","Dato","Beskrivelse","Konto","Beløp","Mva"]);
    [...salesTxns,...purchaseTxns].sort((a,b)=>a.date.localeCompare(b.date)).forEach(t=>{
      aoa.push([fmtB(t.bilag),t.date,t.description,getName(t.debitCode)+" / "+getName(t.creditCode),t.amount,t.vatAmount||0]);
    });
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb,ws,"Mva-melding");
    XLSX.writeFile(wb,`Mva-melding_${termin.year}_termin${termin.n}.xlsx`);
  };
  const exportPdf=()=>{
    const el=document.getElementById("vatTermin-print-area");
    if(el&&window.html2pdf)window.html2pdf().from(el).set({margin:20,filename:`Mva-melding_${termin.year}_termin${termin.n}.pdf`,html2canvas:{scale:2},jsPDF:{unit:"pt",format:"a4",orientation:"portrait"}}).save();
  };

  const Row=({t,otherCode})=>{
    const controlled=controlledIds.has(t.id);
    return(
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 12px",borderTop:`1px solid ${T.border}`}}>
        <input type="checkbox" checked={controlled} onChange={()=>{toggleControlled(termin.year,termin.n,t.id);forceTick(x=>x+1);}} title="Kontrollert"/>
        <div onClick={()=>setOpenTxn(t)} style={{flex:1,minWidth:0,cursor:"pointer"}}>
          <span style={{color:T.accent,fontWeight:700,fontSize:10.5}}>{fmtB(t.bilag)}</span>{" "}
          <span style={{fontSize:10.5,color:T.text}}>{t.description}</span>
          <div style={{fontSize:9,color:T.muted,marginTop:1}}>{t.date} · {otherCode}</div>
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{fontSize:10.5,fontWeight:700,color:T.text}}>{fmt(t.amount)}</div>
          {t.vatAmount!=null&&t.vatAmount!==0&&<div style={{fontSize:9,color:T.accent}}>mva {fmt(t.vatAmount)}</div>}
        </div>
      </div>
    );
  };

  return(
    <div style={{maxWidth:1000}}>
      <button onClick={onBack} style={{background:"none",border:"none",color:T.accent,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",padding:0,marginBottom:10}}>‹ Mva-meldinger</button>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 4px"}}>{info.label}</h1>
          <div style={{fontSize:12,color:T.muted}}>Forfall {info.due}</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={exportPdf} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}><i className="ti ti-file-type-pdf" style={{fontSize:13,marginRight:5}}/>Last ned PDF</button>
          <button onClick={exportXlsx} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}><i className="ti ti-download" style={{fontSize:13,marginRight:5}}/>Excel</button>
          {!status.filed?(
            <button onClick={markFiled} style={{background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"8px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Merk som sendt</button>
          ):!status.paid?(
            <button onClick={markPaid} style={{background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"8px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Merk som betalt</button>
          ):(
            <span style={{fontSize:12,fontWeight:700,color:T.green,alignSelf:"center"}}>✓ Sendt & betalt</span>
          )}
        </div>
      </div>

      <div id="vatTermin-print-area">
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,padding:14}}>
          <div style={{fontSize:10,color:T.muted,textTransform:"uppercase"}}>Total salg</div>
          <div style={{fontSize:17,fontWeight:800,color:T.text}}>{fmt(totalSales)}</div>
        </div>
        <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,padding:14}}>
          <div style={{fontSize:10,color:T.muted,textTransform:"uppercase"}}>Total kostnader</div>
          <div style={{fontSize:17,fontWeight:800,color:T.text}}>{fmt(totalExpenses)}</div>
        </div>
        <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,padding:14}}>
          <div style={{fontSize:10,color:T.muted,textTransform:"uppercase"}}>Mva (utg. − inng.)</div>
          <div style={{fontSize:17,fontWeight:800,color:T.text}}>{fmt(vatOut)} − {fmt(vatIn)}</div>
        </div>
        <div style={{background:netVat>=0?T.redLight:T.greenBg,border:`1px solid ${netVat>=0?T.red:T.green}`,borderRadius:10,padding:14}}>
          <div style={{fontSize:10,color:netVat>=0?T.red:T.green,textTransform:"uppercase"}}>{netVat>=0?"Å betale":"Til gode"}</div>
          <div style={{fontSize:17,fontWeight:800,color:netVat>=0?T.red:T.green}}>{fmt(Math.abs(netVat))}</div>
        </div>
      </div>

      {/* Mva-kode / Sats / Grunnlag / Mva summary — matching the real
          Skatteetaten mva-melding structure (and Tripletex's own layout for
          it): one row per VAT code actually used this period, grouped under
          "Salg" and "Kjøp" section headers, ending in the net amount owed.
          Grunnlag/Mva are clickable — they expand that one row's account +
          transaction specification right underneath, instead of the page
          always showing the same code/rate/grunnlag/mva numbers a second
          (and third) time in a separate always-visible section below. */}
      <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden",marginBottom:20}}>
        <table style={{width:"100%",fontSize:13,borderCollapse:"collapse"}}>
          <thead><tr style={{color:T.muted,fontSize:11,textAlign:"left",borderBottom:`1px solid ${T.border}`}}>
            <td style={{padding:"10px 14px"}}>Mva-kode</td><td>Beskrivelse</td><td style={{textAlign:"right"}}>Sats</td><td style={{textAlign:"right"}}>Grunnlag</td><td style={{textAlign:"right",padding:"10px 14px"}}>Mva</td>
          </tr></thead>
          <tbody>
            <tr><td colSpan="5" style={{padding:"9px 14px",fontWeight:800,fontSize:12,color:T.text,background:T.bg}}>Salg av varer og tjenester i Norge</td></tr>
            {salesByRate.map(g=>{
              const vc=vatCodeForRate(g.rate,"output");
              const key="s"+g.rate;
              const expanded=expandedRates.has(key);
              return(
                <React.Fragment key={key}>
                  <tr style={{borderTop:`1px solid ${T.border}`}}>
                    <td style={{padding:"8px 14px",color:T.accent,fontWeight:700}}>{vc?vc.code:"—"}</td>
                    <td style={{color:T.text}}>{vc?vc.name:`${g.rate}% mva-sats`}</td>
                    <td style={{textAlign:"right",color:T.sub}}>{g.rate.toFixed(2)} %</td>
                    <td onClick={()=>toggleRate(key)} title="Vis spesifikasjon" style={{textAlign:"right",color:T.accent,fontWeight:600,cursor:"pointer",textDecoration:"underline",textDecorationStyle:"dotted"}}>{fmt(g.net)}</td>
                    <td onClick={()=>toggleRate(key)} title="Vis spesifikasjon" style={{textAlign:"right",padding:"8px 14px",color:T.accent,fontWeight:700,cursor:"pointer",textDecoration:"underline",textDecorationStyle:"dotted"}}>{fmt(g.vat)}</td>
                  </tr>
                  {expanded&&(
                    <tr>
                      <td colSpan="5" style={{padding:0,background:T.bg}}>
                        {groupByAccount(g.rows,"creditCode").map(acc=>(
                          <div key={acc.code}>
                            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 14px",fontSize:10.5,fontWeight:700,color:T.sub}}>
                              <span>{getName(acc.code)}</span><span>Grunnlag {fmt(acc.net)} · Mva {fmt(acc.vat)}</span>
                            </div>
                            {acc.rows.map(t=><Row key={t.id} t={t} otherCode={getName(t.debitCode)}/>)}
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {!salesByRate.length&&<tr><td colSpan="5" style={{padding:"10px 14px",color:T.muted,fontSize:12}}>Ingen salg med mva denne perioden.</td></tr>}
            <tr><td colSpan="5" style={{padding:"9px 14px",fontWeight:800,fontSize:12,color:T.text,background:T.bg}}>Kjøp av varer og tjenester i Norge</td></tr>
            {purchasesByRate.map(g=>{
              const vc=vatCodeForRate(g.rate,"input");
              const key="p"+g.rate;
              const expanded=expandedRates.has(key);
              return(
                <React.Fragment key={key}>
                  <tr style={{borderTop:`1px solid ${T.border}`}}>
                    <td style={{padding:"8px 14px",color:T.accent,fontWeight:700}}>{vc?vc.code:"—"}</td>
                    <td style={{color:T.text}}>{vc?vc.name:`${g.rate}% mva-sats`}</td>
                    <td style={{textAlign:"right",color:T.sub}}>{g.rate.toFixed(2)} %</td>
                    <td onClick={()=>toggleRate(key)} title="Vis spesifikasjon" style={{textAlign:"right",color:T.accent,fontWeight:600,cursor:"pointer",textDecoration:"underline",textDecorationStyle:"dotted"}}>{fmt(-g.net)}</td>
                    <td onClick={()=>toggleRate(key)} title="Vis spesifikasjon" style={{textAlign:"right",padding:"8px 14px",color:T.accent,fontWeight:700,cursor:"pointer",textDecoration:"underline",textDecorationStyle:"dotted"}}>{fmt(-g.vat)}</td>
                  </tr>
                  {expanded&&(
                    <tr>
                      <td colSpan="5" style={{padding:0,background:T.bg}}>
                        {groupByAccount(g.rows,"debitCode").map(acc=>(
                          <div key={acc.code}>
                            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 14px",fontSize:10.5,fontWeight:700,color:T.sub}}>
                              <span>{getName(acc.code)}</span><span>Grunnlag {fmt(acc.net)} · Mva {fmt(acc.vat)}</span>
                            </div>
                            {acc.rows.map(t=><Row key={t.id} t={t} otherCode={getName(t.creditCode)}/>)}
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {!purchasesByRate.length&&<tr><td colSpan="5" style={{padding:"10px 14px",color:T.muted,fontSize:12}}>Ingen kjøp med mva denne perioden.</td></tr>}
            <tr style={{borderTop:`2px solid ${T.border}`}}>
              {/* Skyldig (owed to Skatteetaten) when net VAT is positive,
                  Til gode (refund/credit) when purchases' input VAT exceeds
                  sales' output VAT — was a fixed "Skyldig terminbeløp"
                  label regardless of sign, which is simply wrong half the
                  time (exactly Tripletex's own "Terminbeløp til gode" vs.
                  "Skyldig terminbeløp" distinction). */}
              <td colSpan="4" style={{padding:"10px 14px",fontWeight:800,color:T.text}}>{netVat>=0?"Skyldig terminbeløp":"Terminbeløp til gode"}</td>
              <td style={{textAlign:"right",padding:"10px 14px",fontWeight:800,color:netVat>=0?T.red:T.green}}>{fmt(Math.abs(netVat))}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{fontSize:10.5,fontWeight:800,color:T.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>Ingen mva</div>
      <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
        {nonVatTxns.map(t=><Row key={t.id} t={t} otherCode={`${getName(t.debitCode)} / ${getName(t.creditCode)}`}/>)}
        {!nonVatTxns.length&&<div style={{padding:"16px 0",textAlign:"center",color:T.muted,fontSize:10.5}}>Ingen transaksjoner uten mva denne perioden.</div>}
      </div>
      </div>

      {openTxn&&<DetailModal txn={openTxn} accounts={accounts} contacts={contacts} onClose={()=>setOpenTxn(null)} {...detailModalProps}/>}
    </div>
  );
}

function GeneralLedgerScreen({accounts,transactions,onOpenLedger,attachedTxnIds=[]}){
  const[viewMonth,setViewMonth]=useState(()=>new Date().toISOString().slice(0,7));
  const[fullYear,setFullYear]=useState(false);
  const[search,setSearch]=useState("");
  const[entriesView,setEntriesView]=useState("all"); // "all" | "open" — open means not yet reconciled/matched
  const year=parseInt(viewMonth.slice(0,4));
  const monthIdx=parseInt(viewMonth.slice(5,7))-1;
  const lastDay=new Date(year,monthIdx+1,0).getDate();
  const from=fullYear?`${year}-01-01`:`${viewMonth}-01`;
  const to=fullYear?`${year}-12-31`:`${viewMonth}-${String(lastDay).padStart(2,"0")}`;
  const periodLabel=fullYear?String(year):new Date(year,monthIdx,1).toLocaleString("default",{month:"long"})+" "+year;
  const stepMonth=(dir)=>{let m=monthIdx+dir,y=year;if(m<0){m=11;y-=1;}else if(m>11){m=0;y+=1;}setViewMonth(`${y}-${String(m+1).padStart(2,"0")}`);};

  const accountLedgers=useMemo(()=>{
    return accounts
      .filter(a=>!search||a.code.includes(search)||a.name.toLowerCase().includes(search.toLowerCase())||transactions.some(t=>(t.debitCode===a.code||t.creditCode===a.code)&&t.description&&t.description.toLowerCase().includes(search.toLowerCase())))
      .map(a=>{
        const opening=transactions.filter(t=>t.date<from).reduce((s,t)=>{if(t.debitCode===a.code)return s+t.amount;if(t.creditCode===a.code)return s-t.amount;return s;},0);
        let entries=transactions.filter(t=>t.date>=from&&t.date<=to&&(t.debitCode===a.code||t.creditCode===a.code)).sort((x,y)=>x.date.localeCompare(y.date));
        if(!entries.length&&opening===0)return null;
        let running=opening;
        let rows=entries.map(t=>{const mv=t.debitCode===a.code?t.amount:-t.amount;running+=mv;return{...t,mv,running};});
        const periodChange=rows.reduce((s,r)=>s+r.mv,0);
        // "Open" filters the DISPLAYED rows only — running balance and
        // period totals are computed from the full set above first, so
        // filtering afterward never throws off the actual account balance,
        // just which rows are visible.
        const displayRows=entriesView==="open"?rows.filter(r=>!r.matchedWith):rows;
        return{account:a,opening,rows:displayRows,closing:running,periodChange};
      }).filter(Boolean);
  },[accounts,transactions,from,to,search,entriesView]);


  const exportXlsx=()=>{
    const aoa=[["Account","Date","Bilag","Description","Movement","Balance"]];
    accountLedgers.forEach(({account,opening,rows,closing})=>{
      aoa.push([`${account.code} ${account.name}`,"","","Opening balance","",opening]);
      rows.forEach(r=>aoa.push(["",r.date,r.bilag,r.description,r.mv,r.running]));
      aoa.push(["","","","Closing balance","",closing]);
      aoa.push([]);
    });
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb,ws,"General ledger");
    XLSX.writeFile(wb,`GeneralLedger_${from}_${to}.xlsx`);
  };

  const exportPdf=()=>{
    const el=document.getElementById("generalledger-print-area");
    if(el&&window.html2pdf)window.html2pdf().from(el).set({margin:20,filename:`GeneralLedger_${from}_${to}.pdf`,html2canvas:{scale:2},jsPDF:{unit:"pt",format:"a4",orientation:"portrait"}}).save();
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>General ledger</h1>
        <div style={{display:"flex",gap:8}}>
          <button onClick={exportPdf} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}><i className="ti ti-file-type-pdf" style={{fontSize:13,marginRight:5}}/>PDF</button>
          <button onClick={exportXlsx} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}><i className="ti ti-download" style={{fontSize:13,marginRight:5}}/>Excel</button>
        </div>
      </div>
      <div id="generalledger-print-area">
      <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",gap:6,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px"}}>
          <button onClick={()=>stepMonth(-1)} disabled={fullYear} style={{background:"none",border:"none",cursor:fullYear?"default":"pointer",opacity:fullYear?0.3:1,fontSize:14,color:T.sub}}>‹</button>
          <MonthYearJump year={year} month={monthIdx+1} onPick={(y,m)=>setViewMonth(`${y}-${String(m).padStart(2,"0")}`)}/>
          <button onClick={()=>stepMonth(1)} disabled={fullYear} style={{background:"none",border:"none",cursor:fullYear?"default":"pointer",opacity:fullYear?0.3:1,fontSize:14,color:T.sub}}>›</button>
        </div>
        <button onClick={()=>setFullYear(f=>!f)} style={{background:fullYear?T.accent:"none",color:fullYear?"#fff":T.sub,border:`1px solid ${fullYear?T.accent:T.border}`,borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Full year</button>
        <div style={{display:"flex",border:`1px solid ${T.border}`,borderRadius:8,overflow:"hidden"}}>
          {[["all","All entries"],["open","Open entries"]].map(([id,label])=>(
            <button key={id} onClick={()=>setEntriesView(id)} style={{background:entriesView===id?T.accent:"#fff",color:entriesView===id?"#fff":T.sub,border:"none",padding:"7px 12px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{label}</button>
          ))}
        </div>
        <input placeholder="Search account code or name" value={search} onChange={e=>setSearch(e.target.value)} style={{...inp,width:220}}/>
      </div>

      {/* One continuous ledger, not a stack of separate boxed cards — a
          single sticky column header up top, then every account's opening
          balance / entries / change / closing balance flow underneath it
          as plain rows, the way a real general ledger reads. Built from
          grid divs rather than a <table> for the same reason as Trial
          Balance's header: Chrome's position:sticky on <td> intermittently
          fails to paint. */}
      {(()=>{
        const cols="84px 22px 64px 64px minmax(0,1fr) 54px 110px 120px";
        return(
        <div style={{background:"#fff",borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden",fontSize:12}}>
          <div style={{display:"grid",gridTemplateColumns:cols,color:T.sub,background:T.bg,position:"sticky",top:0,zIndex:30,borderBottom:`1px solid ${T.border}`}}>
            <div style={{padding:"9px 10px",fontWeight:700,fontSize:11}}>Date</div>
            <div/>
            <div style={{padding:"9px 6px",fontWeight:700,fontSize:11}}>Status</div>
            <div style={{padding:"9px 6px",fontWeight:700,fontSize:11}}>Bilag</div>
            <div style={{padding:"9px 6px",fontWeight:700,fontSize:11}}>Description</div>
            <div style={{padding:"9px 6px",fontWeight:700,fontSize:11,textAlign:"center"}}>VAT</div>
            <div style={{padding:"9px 10px",fontWeight:700,fontSize:11,textAlign:"right"}}>Amount</div>
            <div style={{padding:"9px 14px",fontWeight:700,fontSize:11,textAlign:"right"}}>Balance</div>
          </div>
          {accountLedgers.map(({account,opening,rows,closing,periodChange})=>(
            <div key={account.code}>
              <div style={{display:"grid",gridTemplateColumns:cols,background:T.waterTealSubtle,borderTop:`1px solid ${T.border}`}}>
                <div onClick={()=>onOpenLedger&&onOpenLedger(account)} style={{gridColumn:"1 / 6",padding:"9px 10px",fontWeight:800,color:T.accentHover,cursor:onOpenLedger?"pointer":"default"}}>{account.code} {account.name}</div>
                <div/>
                <div/>
                <div/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:cols,borderBottom:`1px solid ${T.border}`}}>
                <div style={{gridColumn:"1 / 6",padding:"6px 10px",color:T.muted,fontSize:11}}>Opening balance</div>
                <div/>
                <div/>
                <div style={{padding:"6px 14px",textAlign:"right",color:T.text,fontWeight:600}}>{fmt(opening)}</div>
              </div>
              {rows.map(r=>{
                const hasAttachment=hasId(attachedTxnIds,r.id);
                const isClosed=!!r.matchedWith;
                return(
                  <div key={r.id} className="rr-table-row" style={{display:"grid",gridTemplateColumns:cols,background:"#fff",borderBottom:`1px solid ${T.border}`,alignItems:"center"}}>
                    <div style={{padding:"7px 10px",color:T.text}}>{r.date}</div>
                    <div>{hasAttachment&&<i className="ti ti-paperclip" title="Has attachment" style={{fontSize:12,color:T.muted}}/>}</div>
                    <div style={{padding:"7px 6px",fontSize:10,fontWeight:700,color:isClosed?T.accent:T.muted}}>{isClosed?"Closed":""}</div>
                    <div onClick={()=>onOpenLedger&&onOpenLedger(account)} style={{padding:"7px 6px",color:T.accent,fontWeight:600,cursor:onOpenLedger?"pointer":"default"}}>{fmtB(r.bilag)}</div>
                    <div title={r.description} style={{padding:"7px 6px",color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.description}</div>
                    <div style={{padding:"7px 6px",textAlign:"center",color:T.muted,fontSize:11}}>{r.vatCode||""}</div>
                    <div style={{padding:"7px 10px",textAlign:"right",fontWeight:600,color:T.text}}>{sign(r.mv)}</div>
                    <div style={{padding:"7px 14px",textAlign:"right",color:T.muted}}>{fmt(r.running)}</div>
                  </div>
                );
              })}
              <div style={{display:"grid",gridTemplateColumns:cols,background:T.bg,borderBottom:`1px solid ${T.border}`}}>
                <div style={{gridColumn:"1 / 6",padding:"6px 10px",color:T.sub,fontSize:11}}>Change in period</div>
                <div/><div/>
                <div style={{padding:"6px 14px",textAlign:"right",color:periodChange>=0?T.green:T.red,fontSize:11,fontWeight:700}}>{sign(periodChange)}</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:cols,background:"#fff",borderBottom:`2px solid ${T.border}`,fontWeight:800}}>
                <div style={{gridColumn:"1 / 6",padding:"8px 10px",color:T.text}}>Closing balance</div>
                <div/><div/>
                <div style={{padding:"8px 14px",textAlign:"right",color:T.text}}>{fmt(closing)}</div>
              </div>
            </div>
          ))}
          {!accountLedgers.length&&<div style={{textAlign:"center",color:T.muted,padding:30,fontSize:13}}>No account activity in this range.</div>}
        </div>
        );
      })()}
      </div>
    </div>
  );
}

// Bank reconciliation — manual statement upload only (no live bank API).
// Upload a CSV/Excel statement (Date, Description, Amount columns) against a
// bank account; each unposted line can be "Posted" by choosing which other
// account it offsets, which creates a real transaction and marks it matched.
// Bank Dashboard — booked balances per account, outstanding/overdue payment
// summary (from unpaid invoices and bills), and a transaction history view
// with a money-in/money-out breakdown. All computed from real data already
// in the app, not a separate feed.
function BankDashboardScreen({accounts,transactions,invoices,contacts,onOpenLedger,moneySources,saveMoneySources,tagTransaction,onSaveAccounts}){
  const[editingBankAccount,setEditingBankAccount]=useState(null);
  // Bank-specific details (branch, account number) aren't their own DB
  // columns — stored as JSON inside the account's existing `notes` field so
  // no schema change is needed. Falls back gracefully if notes is plain text
  // (from before this existed) or empty.
  const bankDetailsFor=(a)=>{
    // visibleInReconciliation defaults to the old cash-detection heuristic
    // when never explicitly set — so accounts nobody has touched yet keep
    // behaving exactly as before, and the new toggle only changes things
    // once someone actually uses it.
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
    setEditingBankAccount(null);
  };
  const getBal=code=>transactions.reduce((s,t)=>{if(t.debitCode===code)return s+t.amount;if(t.creditCode===code)return s-t.amount;return s;},0);
  // Only banks that have ever actually been used — an account sitting at
  // zero with no history is just noise in this list.
  const bankAccounts=useMemo(()=>accounts.filter(a=>getSK(a.code)==="1900"&&(getBal(a.code)!==0||transactions.some(t=>t.debitCode===a.code||t.creditCode===a.code))),[accounts,transactions]);

  const today=new Date().toISOString().slice(0,10);
  const yearStart=`${today.slice(0,4)}-01-01`;

  return(
    <div style={{maxWidth:1000}}>
      <div style={{marginBottom:18}}>
        <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 4px"}}>Whose</h1>
        <div style={{fontSize:12,color:T.muted}}>Track which money source each bank movement belongs to.</div>
      </div>

      <MoneySourcesPanel moneySources={moneySources} saveMoneySources={saveMoneySources} transactions={transactions} accounts={accounts} tagTransaction={tagTransaction} bankAccounts={bankAccounts} getBal={getBal} bankDetailsFor={bankDetailsFor} onOpenLedger={onOpenLedger} onEditBankAccount={onSaveAccounts?setEditingBankAccount:null} yearStart={yearStart} today={today}/>

      {editingBankAccount&&(()=>{
        const acct=bankAccounts.find(a=>a.code===editingBankAccount);
        if(!acct)return null;
        const existing=bankDetailsFor(acct);
        return<BankAccountDetailsModal account={acct} initial={existing} onSave={details=>saveBankDetails(acct.code,details)} onClose={()=>setEditingBankAccount(null)}/>;
      })()}
    </div>
  );
}

// Edit a bank account's branch/account number — stored inside the account's
// `notes` field as JSON (no schema change needed). Trial Balance and other
// reports never read this, so it stays out of those simple code+name views.
function BankAccountDetailsModal({account,initial,onSave,onClose}){
  const[form,setForm]=useState(initial);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:14,maxWidth:420,width:"100%",padding:24,boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
        <div style={{fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Bank account</div>
        <div style={{fontSize:16,fontWeight:800,color:T.text,marginBottom:20}}>{account.code} {account.name}</div>
        <div style={{display:"flex",flexDirection:"column",gap:14,marginBottom:20}}>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Bank name</div>
            <input value={form.bankName} onChange={e=>setForm(p=>({...p,bankName:e.target.value}))} placeholder="e.g. HBL, UBL, Meezan" style={inp}/>
          </div>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Branch</div>
            <input value={form.branch} onChange={e=>setForm(p=>({...p,branch:e.target.value}))} placeholder="e.g. Gujrat Cantt" style={inp}/>
          </div>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Account number</div>
            <input value={form.accountNumber} onChange={e=>setForm(p=>({...p,accountNumber:e.target.value}))} placeholder="Account number" style={inp}/>
          </div>
          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>IBAN</div>
            <input value={form.iban||""} onChange={e=>setForm(p=>({...p,iban:e.target.value}))} placeholder="e.g. PK36SCBL0000001123456702" style={inp}/>
          </div>
          <div style={{background:T.bg,borderRadius:10,padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:12,fontWeight:700,color:T.text}}>Show in Bank Reconciliation</div>
              <div style={{fontSize:10,color:T.muted,marginTop:2}}>Turn off for accounts with no real bank statement to match against.</div>
            </div>
            <label style={{position:"relative",display:"inline-block",width:40,height:22,flexShrink:0}}>
              <input type="checkbox" checked={form.visibleInReconciliation!==false} onChange={e=>setForm(p=>({...p,visibleInReconciliation:e.target.checked}))} style={{opacity:0,width:0,height:0}}/>
              <span style={{position:"absolute",inset:0,background:form.visibleInReconciliation!==false?T.accent:T.border,borderRadius:22,cursor:"pointer",transition:"background .15s"}}/>
              <span style={{position:"absolute",top:3,left:form.visibleInReconciliation!==false?21:3,width:16,height:16,background:"#fff",borderRadius:"50%",transition:"left .15s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
            </label>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>onSave(form)} style={{flex:1,background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"11px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Save</button>
          <button onClick={onClose} style={{flex:1,background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"11px",fontWeight:600,fontSize:13,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function BankReconciliationScreen({accounts,contacts,transactions,bankStatementLines,uploadBankStatement,parseBankStatementFile,parseBankStatementPDF,commitBankStatementRows,undoBankImport,postBankStatementLine,postBankStatementLinesBulk,deleteBankStatementLine,matchBankStatementLine,unmatchBankStatementLine,toggleReconciled,onEditTxn,onDeleteTxn,onReverseTxn,fetchTxnAttachments,uploadInboxFile,attachFilesToTxnEntry,inboxFiles=[],fetchEntryComments,addEntryComment,auditLog,profiles,currentUserId,moneySources,tagTransaction,attachments={},onAttach,onRemoveAttach,addTransaction,onSaveAccounts,onNavigate}){
  // "Bank" reconciliation only makes sense for accounts with a real external bank
  // statement. Respects the manual "Show in Bank Reconciliation" toggle from Bank
  // Settings when someone's explicitly set it; falls back to the cash-name
  // heuristic for anything nobody's touched yet, so existing behavior doesn't
  // silently change for accounts nobody has an opinion about.
  const bankAccounts=useMemo(()=>accounts.filter(a=>{
    if(getSK(a.code)!=="1900")return false;
    try{
      const parsed=JSON.parse(a.notes||"{}");
      if(parsed.visibleInReconciliation!==undefined)return parsed.visibleInReconciliation;
    }catch{}
    return!/cash/i.test(a.name);
  }),[accounts]);
  const[selectedAccount,setSelectedAccount]=useState(bankAccounts[0]?bankAccounts[0].code:"");
  const[month,setMonth]=useState(()=>new Date().toISOString().slice(0,7));
  const[selectedLineIds,setSelectedLineIds]=useState(()=>new Set()); // right side, multi-select
  const[selectedTxnIds,setSelectedTxnIds]=useState(()=>new Set()); // left side, multi-select
  const[dismissedSuggestions,setDismissedSuggestions]=useState(()=>new Set()); // line ids where the auto-suggested match was dismissed
  const[postMenu,setPostMenu]=useState(null); // {lineId, x, y} — right-click "Select account" context menu
  const[uploading,setUploading]=useState(false);
  const[readingPdf,setReadingPdf]=useState(false);
  const[preview,setPreview]=useState(null); // {rows, detectedColumns, skippedNoDate, skippedZeroOrBad, error, fileName, isPdf}
  const[importing,setImporting]=useState(false);
  const[lastImport,setLastImport]=useState(null); // {ids, count, accountCode}
  const[showHistory,setShowHistory]=useState(false);
  const[showMatched,setShowMatched]=useState(false);
  const[filterMode,setFilterMode]=useState("unmatched"); // "unmatched" | "matched" — status toggle
  const[directionFilter,setDirectionFilter]=useState("all"); // "all" | "incoming" | "outgoing" — separate axis
  const[searchQuery,setSearchQuery]=useState("");
  const[reconApprovedTick,setReconApprovedTick]=useState(0); // bump to force a re-read of localStorage approval state
  const[showExportModal,setShowExportModal]=useState(false);
  const[exportMode,setExportMode]=useState("download"); // "download" | "email" | "log"
  const[exportScope,setExportScope]=useState("period"); // "period" | "all" | "selected"
  const[exportFormat,setExportFormat]=useState("pdf");
  const[exportEmail,setExportEmail]=useState("");
  const[exportMessage,setExportMessage]=useState("Hi!\n\nHere's a reminder that some vouchers are still missing from your account. It would be great if you could look over the attached list and send in the vouchers as soon as possible.");
  const[exportSendLog,setExportSendLog]=useState([]); // {date, to, count}
  const getName=code=>((accounts.find(a=>a.code===code))||{name:code}).name;

  // Bilag click → full entry detail (view/edit/comment/reverse), same
  // pattern every other ledger screen in the app uses.
  const[detailTxn,setDetailTxn]=useState(null);
  // Set alongside detailTxn when opened via the dedicated comment icon (as
  // opposed to the bilag number) so the entry detail modal jumps straight
  // to the comment thread instead of landing on the plain summary view.
  const[detailTxnShowComments,setDetailTxnShowComments]=useState(false);
  const openTxnComments=t=>{setDetailTxnShowComments(true);setDetailTxn(t);};
  // Independent sort per column — click a header to sort by it, click again
  // to reverse; each column remembers its own sort so posting on one side
  // doesn't disturb how the other is ordered.
  const[sortLeft,setSortLeft]=useState({key:"date",dir:1});
  const[sortRight,setSortRight]=useState({key:"date",dir:1});
  const toggleSort=(setter,key)=>setter(p=>p.key===key?{key,dir:-p.dir}:{key,dir:1});
  const applySort=(rows,sort,amountFn)=>{
    const sorted=[...rows].sort((a,b)=>{
      if(sort.key==="amount")return(amountFn(a)-amountFn(b))*sort.dir;
      return a.date.localeCompare(b.date)*sort.dir;
    });
    return sorted;
  };
  const[monthDropdownOpen,setMonthDropdownOpen]=useState(false);
  const[showAttachPanel,setShowAttachPanel]=useState(false);
  const[bulkPostOpen,setBulkPostOpen]=useState(false);
  const[bulkOffsetCode,setBulkOffsetCode]=useState("");
  const[bulkPosting,setBulkPosting]=useState(false);
  const[uploadingProof,setUploadingProof]=useState(false);

  const attachKey=`${selectedAccount}_${month}`;
  const currentAttachment=attachments[attachKey];
  const handleAttachStatement=(file)=>{
    const reader=new FileReader();
    reader.onload=e=>{if(onAttach)onAttach(attachKey,{name:file.name,data:e.target.result,type:file.type,period:month,code:selectedAccount});};
    reader.readAsDataURL(file);
  };
  // The uploaded bank-statement attachment is what stands in as "proof" when
  // posting straight from the statement (Bokfør) — it's stored locally as a
  // data URL, so turning it into something attachFilesToTxnEntry can point
  // at means uploading it once to the real inbox/storage, then reusing that
  // file id for every entry created from this batch.
  const ensureProofFileId=async()=>{
    if(!currentAttachment||!uploadInboxFile)return null;
    if(currentAttachment.inboxFileId)return currentAttachment.inboxFileId;
    setUploadingProof(true);
    try{
      const resp=await fetch(currentAttachment.data);
      const blob=await resp.blob();
      const file=new File([blob],currentAttachment.name,{type:currentAttachment.type||blob.type});
      const uploaded=await uploadInboxFile(file);
      if(uploaded&&onAttach)onAttach(attachKey,{...currentAttachment,inboxFileId:uploaded.id});
      setUploadingProof(false);
      return uploaded?uploaded.id:null;
    }catch(e){
      setUploadingProof(false);
      return null;
    }
  };
  // Left column: what's actually in the ledger for this account and month.
  const ledgerEntries=useMemo(()=>transactions.filter(t=>(t.debitCode===selectedAccount||t.creditCode===selectedAccount)&&t.date.slice(0,7)===month).sort((a,b)=>a.date.localeCompare(b.date)),[transactions,selectedAccount,month]);
  const mv=(t)=>t.debitCode===selectedAccount?t.amount:-t.amount;
  const enteredBalance=useMemo(()=>{
    const monthEnd=new Date(month+"-01");monthEnd.setMonth(monthEnd.getMonth()+1);monthEnd.setDate(0);
    const asOf=monthEnd.toISOString().slice(0,10);
    return transactions.filter(t=>t.date<=asOf).reduce((s,t)=>{if(t.debitCode===selectedAccount)return s+t.amount;if(t.creditCode===selectedAccount)return s-t.amount;return s;},0);
  },[transactions,selectedAccount,month]);

  // Right column: the uploaded statement lines still needing to be posted.
  const linesForAccount=useMemo(()=>bankStatementLines.filter(l=>l.accountCode===selectedAccount&&l.date.slice(0,7)===month),[bankStatementLines,selectedAccount,month]);
  const unmatchedLines=linesForAccount.filter(l=>!l.posted).sort((a,b)=>a.date.localeCompare(b.date));
  const matchedLines=linesForAccount.filter(l=>l.posted&&l.postedTxnId).sort((a,b)=>a.date.localeCompare(b.date));
  const selectedLines=unmatchedLines.filter(l=>selectedLineIds.has(l.id));
  // Posting one or more selected statement lines against a chosen account now
  // always goes through the Bokfør modal (bulkPostOpen/runBulkPost) — it
  // handles a single line the same way as many, so there's no separate
  // single-line code path to keep in sync anymore.
  const statementBalance=linesForAccount.reduce((s,l)=>s+l.amount,0);

  // A ledger entry that's been matched (or posted-from-statement) shouldn't
  // clutter the working "Entered in ledger" list any more than its matched
  // counterpart clutters "From bank statement" — both move to the Matched view.
  // NOTE: when a match involves more than one ledger entry against a single
  // statement line, only ONE of those entries can carry the actual database
  // link (a statement line only points at one transaction) — the rest are
  // flagged reconciled instead. Both cases need to leave the working list
  // together, so "matched" here means either kind of settled, not just the
  // directly-linked one.
  const matchedTxnIds=useMemo(()=>new Set(matchedLines.map(l=>l.postedTxnId)),[matchedLines]);
  const workingLedgerEntries=ledgerEntries.filter(t=>!matchedTxnIds.has(t.id)&&!t.reconciled);
  const matchedLedgerEntries=ledgerEntries.filter(t=>matchedTxnIds.has(t.id)||t.reconciled);
  const selectedTxnsArr=workingLedgerEntries.filter(t=>selectedTxnIds.has(t.id));
  const selectedTxn=(selectedTxnsArr.length===1&&!selectedLineIds.size)?selectedTxnsArr[0]:null;

  const offsetOptions=accounts.filter(a=>a.code!==selectedAccount);

  // Selecting several on both sides at once can't be resolved to a single
  // link (bank_statement_lines only points at one transaction each) — so
  // Match is only enabled once at least one side is narrowed to exactly one.
  const canMatch=selectedLines.length>0&&selectedTxnsArr.length>0&&(selectedLines.length===1||selectedTxnsArr.length===1);
  const matchBlockedByBothMulti=selectedLines.length>1&&selectedTxnsArr.length>1;
  const selLinesTotal=selectedLines.reduce((s,l)=>s+l.amount,0);
  const selTxnsTotal=selectedTxnsArr.reduce((s,t)=>s+mv(t),0);

  // Auto-suggested match — same amount as an unreconciled ledger entry,
  // preferring a description that looks like the same counterparty. Only
  // ever surfaces one pair at a time (the first candidate found); once it's
  // confirmed or cancelled, the next candidate (if any) takes its place.
  // Never shown while the person is in the middle of a manual multi-select.
  const findCandidateFor=(line)=>{
    const norm=s=>(s||"").toLowerCase().replace(/[^a-z0-9]/g,"");
    const ld=norm(line.description);
    const candidates=workingLedgerEntries.filter(t=>!t.reconciled&&Math.abs(mv(t)-line.amount)<0.01);
    if(!candidates.length)return null;
    candidates.sort((a,b)=>{
      const am=norm(a.description).includes(ld)||ld.includes(norm(a.description));
      const bm=norm(b.description).includes(ld)||ld.includes(norm(b.description));
      if(am&&!bm)return -1;if(bm&&!am)return 1;
      return Math.abs(new Date(a.date)-new Date(line.date))-Math.abs(new Date(b.date)-new Date(line.date));
    });
    return candidates[0];
  };
  const topSuggestion=useMemo(()=>{
    if(selectedLineIds.size||selectedTxnIds.size)return null;
    for(const line of unmatchedLines){
      if(dismissedSuggestions.has(line.id))continue;
      const txn=findCandidateFor(line);
      if(txn)return{line,txn};
    }
    return null;
  },[unmatchedLines,workingLedgerEntries,dismissedSuggestions,selectedLineIds,selectedTxnIds]);
  // Both lists render with the suggested pair pinned to the first row.
  const rightRows=topSuggestion?[topSuggestion.line,...unmatchedLines.filter(l=>l.id!==topSuggestion.line.id)]:unmatchedLines;
  const leftRows=topSuggestion?[topSuggestion.txn,...workingLedgerEntries.filter(t=>t.id!==topSuggestion.txn.id)]:workingLedgerEntries;

  // Month tabs — one per month of the year currently being viewed, each
  // showing whether that month is fully reconciled (✓), still has work
  // pending (⏱), or has no activity at all yet.
  const monthTabs=useMemo(()=>{
    const year=month.slice(0,4);
    return Array.from({length:12},(_,i)=>{
      const m=`${year}-${String(i+1).padStart(2,"0")}`;
      const mLines=bankStatementLines.filter(l=>l.accountCode===selectedAccount&&l.date.slice(0,7)===m);
      const mTxns=transactions.filter(t=>(t.debitCode===selectedAccount||t.creditCode===selectedAccount)&&t.date.slice(0,7)===m);
      const mUnmatchedLines=mLines.filter(l=>!l.posted);
      const mMatchedTxnIds=new Set(mLines.filter(l=>l.posted&&l.postedTxnId).map(l=>l.postedTxnId));
      const mWorkingTxns=mTxns.filter(t=>!mMatchedTxnIds.has(t.id)&&!t.reconciled);
      const hasActivity=mLines.length>0||mTxns.length>0;
      const done=hasActivity&&mUnmatchedLines.length===0&&mWorkingTxns.length===0;
      return{key:m,label:new Date(year,i,1).toLocaleString("default",{month:"short"}),hasActivity,done};
    });
  },[bankStatementLines,transactions,selectedAccount,month]);

  const searchMatch=(text)=>!searchQuery||String(text||"").toLowerCase().includes(searchQuery.toLowerCase());
  const matchesDirection=(amount)=>directionFilter==="all"||(directionFilter==="incoming"?amount>=0:amount<0);
  // applySort's plain date/amount sort was silently undoing the "pin the
  // suggested pair to row 1" placement from leftRows/rightRows above the
  // moment any real sort was active (Date-ascending by default) — the
  // suggested row only looked pinned when its own date happened to sort
  // first anyway, not because pinning actually worked. Sort everything
  // else first, then reinsert the suggested row at the very top, so it's
  // reliably the first thing you see regardless of sort column/direction.
  const displayLeftRows=(()=>{
    const filtered=leftRows.filter(t=>(searchMatch(t.description)||searchMatch(fmtBal(mv(t))))&&matchesDirection(mv(t)));
    if(!topSuggestion)return applySort(filtered,sortLeft,mv);
    const pinned=filtered.find(t=>t.id===topSuggestion.txn.id);
    const rest=applySort(filtered.filter(t=>t.id!==topSuggestion.txn.id),sortLeft,mv);
    return pinned?[pinned,...rest]:rest;
  })();
  const displayRightRows=(()=>{
    const source=filterMode==="matched"?matchedLines:rightRows;
    const filtered=source.filter(l=>(searchMatch(l.description)||searchMatch(fmtBal(l.amount)))&&matchesDirection(l.amount));
    if(filterMode==="matched"||!topSuggestion)return applySort(filtered,sortRight,l=>l.amount);
    const pinned=filtered.find(l=>l.id===topSuggestion.line.id);
    const rest=applySort(filtered.filter(l=>l.id!==topSuggestion.line.id),sortRight,l=>l.amount);
    return pinned?[pinned,...rest]:rest;
  })();
  const allLeftSelected=displayLeftRows.length>0&&displayLeftRows.every(t=>selectedTxnIds.has(t.id));
  const allRightSelected=filterMode!=="matched"&&displayRightRows.length>0&&displayRightRows.every(l=>selectedLineIds.has(l.id));
  const toggleSelectAllLeft=()=>setSelectedTxnIds(allLeftSelected?new Set():new Set(displayLeftRows.map(t=>t.id)));
  const toggleSelectAllRight=()=>setSelectedLineIds(allRightSelected?new Set():new Set(displayRightRows.map(l=>l.id)));
  // Multi-line "Bokfør" — every ticked statement line posts as its own
  // bilag against the chosen account, all sharing the uploaded bank
  // statement (if any) as proof.
  const runBulkPost=async()=>{
    if(!bulkOffsetCode||!selectedLines.length||bulkPosting)return;
    setBulkPosting(true);
    const proofFileId=await ensureProofFileId();
    if(postBankStatementLinesBulk)await postBankStatementLinesBulk(selectedLines,bulkOffsetCode,proofFileId);
    setBulkPosting(false);
    setBulkPostOpen(false);
    setBulkOffsetCode("");
    clearSelection();
  };


  // condition for being allowed to approve; once approved, the period is
  // locked for this account until reopened.
  const isApproved=isBankReconApproved(selectedAccount,month)&&reconApprovedTick>=0;
  const canApprove=!isApproved&&unmatchedLines.length===0&&workingLedgerEntries.length===0&&(matchedLines.length>0||ledgerEntries.length>0);
  const doApprove=()=>{
    if(!canApprove)return;
    setBankReconApproved(selectedAccount,month,true);
    setReconApprovedTick(t=>t+1);
  };
  const doReopen=()=>{
    if(!window.confirm("Reopen this period? You'll be able to post and match again for this account/month."))return;
    setBankReconApproved(selectedAccount,month,false);
    setReconApprovedTick(t=>t+1);
  };

  const handleUpload=async(file)=>{
    if(!selectedAccount){alert("Choose a bank account first.");return;}
    setUploading(true);
    if(parseBankStatementFile){
      const result=await parseBankStatementFile(file);
      setPreview({...result,fileName:file.name});
    } else {
      // Fallback for older wiring — commits immediately, no preview.
      await uploadBankStatement(selectedAccount,file);
    }
    setUploading(false);
  };
  const handlePdfUpload=async(file)=>{
    if(!selectedAccount){alert("Choose a bank account first.");return;}
    if(!parseBankStatementPDF)return;
    setReadingPdf(true);
    const result=await parseBankStatementPDF(file);
    setReadingPdf(false);
    setPreview({...result,fileName:file.name});
  };
  // Preview rows are editable before commit (date/description/amount only —
  // everything else about a bank statement line is fixed by the schema) so
  // an AI-read PDF can be corrected, and a CSV/Excel row can be fixed up too.
  const updatePreviewRow=(i,field,value)=>{
    setPreview(p=>({...p,rows:p.rows.map((r,idx)=>idx===i?{...r,[field]:value}:r)}));
  };
  const removePreviewRow=(i)=>{
    setPreview(p=>({...p,rows:p.rows.filter((_,idx)=>idx!==i)}));
  };
  const confirmImport=async()=>{
    if(!preview||!preview.rows||importing)return;
    const bad=preview.rows.find(r=>!r.date||r.amount==null||isNaN(r.amount)||r.amount===0);
    if(bad){alert("Every row needs a date and a non-zero amount before importing.");return;}
    setImporting(true);
    const result=await commitBankStatementRows(selectedAccount,preview.rows);
    setImporting(false);
    if(result.error){alert(result.error);return;}
    setLastImport({ids:result.insertedIds,count:result.count,accountCode:selectedAccount});
    setPreview(null);
  };
  const doUndoImport=async()=>{
    if(!lastImport||!undoBankImport)return;
    if(!window.confirm(`Remove the ${lastImport.count} statement line${lastImport.count===1?"":"s"} just imported?`))return;
    await undoBankImport(lastImport.ids);
    setLastImport(null);
  };
  // Scope resolver for the export/send modal — mirrors the "which posts"
  // choice in the Tripletex-style dialog: this period's unmatched lines,
  // every unmatched line on the account regardless of month, or just
  // whatever's currently ticked on the right-hand (statement) list.
  const exportRows=()=>{
    if(exportScope==="selected")return unmatchedLines.filter(l=>selectedLineIds.has(l.id));
    if(exportScope==="all")return bankStatementLines.filter(l=>l.accountCode===selectedAccount&&!l.posted);
    return unmatchedLines;
  };
  const runExport=()=>{
    const rows=exportRows();
    if(!rows.length){alert("No open posts to export.");return;}
    const accName=getName(selectedAccount);
    if(exportFormat==="xlsx"){
      const aoa=[["Date","Description","Amount (NOK)"],...rows.map(l=>[l.date,l.description||"",l.amount])];
      const wb=XLSX.utils.book_new();
      const ws=XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb,ws,"Open posts");
      XLSX.writeFile(wb,`OpenPosts_${accName.replace(/[^a-z0-9]/gi,"")}_${month}.xlsx`);
    } else {
      const container=document.createElement("div");
      container.style.cssText="padding:24px;font-family:system-ui,sans-serif;color:#111827;max-width:700px;";
      container.innerHTML=`
        <div style="font-size:18px;font-weight:800;margin-bottom:4px;">Open posts — ${accName}</div>
        <div style="font-size:12px;color:#6B7280;margin-bottom:16px;">${new Date().toISOString().slice(0,10)}</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="border-bottom:1px solid #111827;text-align:left;"><td style="padding:6px 0;">Date</td><td>Description</td><td style="text-align:right;">Amount</td></tr></thead>
          <tbody>${rows.map(l=>`<tr style="border-bottom:1px solid #eee;"><td style="padding:6px 0;">${l.date}</td><td>${(l.description||"").replace(/</g,"&lt;")}</td><td style="text-align:right;">${fmtBal(l.amount)}</td></tr>`).join("")}</tbody>
        </table>`;
      document.body.appendChild(container);
      if(window.html2pdf){
        window.html2pdf().from(container).set({margin:20,filename:`OpenPosts_${accName.replace(/[^a-z0-9]/gi,"")}_${month}.pdf`,html2canvas:{scale:2},jsPDF:{unit:"pt",format:"a4",orientation:"portrait"}}).save().then(()=>document.body.removeChild(container));
      } else {
        document.body.removeChild(container);
      }
    }
  };
  const runEmailSend=()=>{
    if(!exportEmail.trim()){alert("Enter a recipient email address.");return;}
    const rows=exportRows();
    if(!rows.length){alert("No open posts to send.");return;}
    runExport(); // downloads the file so it's ready to attach — mailto can't attach files itself
    // mailto: URLs have a hard length limit in most browsers (~2000 chars) —
    // dumping every row into the body silently truncated or failed on any
    // list longer than a handful of lines. Cap what goes in the body and
    // point to the downloaded file for the rest.
    const MAX_ROWS_IN_BODY=15;
    const shown=rows.slice(0,MAX_ROWS_IN_BODY);
    const listText=shown.map(l=>`${l.date}  ${l.description||""}  ${fmtBal(l.amount)}`).join("\n")+(rows.length>MAX_ROWS_IN_BODY?`\n…and ${rows.length-MAX_ROWS_IN_BODY} more — see the attached file.`:"");
    const subject=encodeURIComponent(`Missing vouchers — ${getName(selectedAccount)}`);
    const body=encodeURIComponent(`${exportMessage}\n\n${listText}`);
    const mailtoUrl=`mailto:${exportEmail.trim()}?subject=${subject}&body=${body}`;
    // window.open (not location.href) so a mail client that fails to launch
    // doesn't navigate the whole app away — it just opens (and closes) a
    // blank tab instead of leaving a blank/broken page behind.
    const win=window.open(mailtoUrl,"_blank");
    if(win)setTimeout(()=>{try{win.close();}catch(e){}},500);
    setExportSendLog(p=>[{date:new Date().toISOString(),to:exportEmail.trim(),count:rows.length},...p]);
    setShowExportModal(false);
  };
  const clearSelection=()=>{setSelectedLineIds(new Set());setSelectedTxnIds(new Set());};
  const toggleLineSel=(id)=>{
    if(isApproved)return;
    setSelectedLineIds(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  };
  const toggleTxnSel=(id)=>{
    if(isApproved)return;
    setSelectedTxnIds(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  };
  const doMatch=async()=>{
    if(isApproved||!canMatch)return;
    if(selectedTxnsArr.length===1){
      // One or more lines, all against the single selected transaction.
      const txnId=selectedTxnsArr[0].id;
      for(const l of selectedLines)await matchBankStatementLine(l,txnId);
    } else {
      // One line against several transactions — the line can only carry one
      // FK, so it links to the first; the rest are marked reconciled so
      // they're clearly flagged as settled even though they stay visible.
      const[primary,...rest]=selectedTxnsArr;
      await matchBankStatementLine(selectedLines[0],primary.id);
      for(const t of rest)await toggleReconciled(t.id,true);
    }
    clearSelection();
  };
  const doUnmatch=async(line)=>{
    if(isApproved){alert("Reopen this period first to unmatch anything in it.");return;}
    await unmatchBankStatementLine(line);
  };
  const confirmSuggestion=async(line,txn)=>{
    if(isApproved)return;
    await matchBankStatementLine(line,txn.id);
  };
  const dismissSuggestion=(lineId)=>{
    setDismissedSuggestions(p=>{const n=new Set(p);n.add(lineId);return n;});
  };

  return(
    <div>
      {preview&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>!importing&&setPreview(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:T.radius.xl,maxWidth:720,width:"100%",maxHeight:"85vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",padding:24}}>
            <div style={{fontSize:15,fontWeight:800,color:T.text,marginBottom:4}}>Preview import — {preview.fileName}</div>
            {preview.error?(
              <>
                <div style={{background:T.redLight,color:T.red,borderRadius:10,padding:"12px 14px",fontSize:11,marginTop:12,lineHeight:1.5}}>{preview.error}</div>
                {preview.detectedColumns&&(
                  <div style={{fontSize:11,color:T.muted,marginTop:10}}>
                    Detected: Date → <b>{preview.detectedColumns.date}</b>, Description → <b>{preview.detectedColumns.description}</b>
                    {preview.detectedColumns.amount&&<>, Amount → <b>{preview.detectedColumns.amount}</b></>}
                  </div>
                )}
                <button onClick={()=>setPreview(null)} style={{marginTop:16,width:"100%",background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"10px",fontSize:11,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Close</button>
              </>
            ):(
              <>
                {preview.isPdf?(
                  preview.isFallback?(
                    <div style={{background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:8,padding:"9px 12px",fontSize:11,color:"#92400E",marginBottom:14,lineHeight:1.5}}>Read with free text extraction (no AI key set) — this is a rougher guess than the AI reader, especially for which number on each line is the actual amount. Check every row carefully before importing; dates, descriptions, and amounts are all editable.</div>
                  ):(
                    <div style={{fontSize:11,color:T.muted,marginBottom:14}}>Read with AI — check every row below before importing; dates, descriptions, and amounts are all editable.</div>
                  )
                ):(
                  <div style={{fontSize:11,color:T.muted,marginBottom:14}}>
                    Detected columns — Date: <b>{preview.detectedColumns.date}</b> · Description: <b>{preview.detectedColumns.description}</b>{preview.detectedColumns.amount&&<> · Amount: <b>{preview.detectedColumns.amount}</b></>}{preview.detectedColumns.debit&&<> · Debit: <b>{preview.detectedColumns.debit}</b></>}{preview.detectedColumns.credit&&<> · Credit: <b>{preview.detectedColumns.credit}</b></>}
                  </div>
                )}
                <div style={{fontSize:11,fontWeight:700,color:T.text,marginBottom:8}}>{preview.rows.length} row{preview.rows.length===1?"":"s"} ready to import{(preview.skippedNoDate||preview.skippedZeroOrBad)?` (${(preview.skippedNoDate||0)+(preview.skippedZeroOrBad||0)} skipped — no date or zero amount)`:""}</div>
                <div style={{border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden",marginBottom:16,maxHeight:360,overflowY:"auto"}}>
                  <table style={{width:"100%",fontSize:11,borderCollapse:"collapse"}}>
                    <thead><tr style={{background:T.bg,color:T.sub}}><td style={{padding:"7px 10px",width:118}}>Date</td><td>Description</td><td style={{textAlign:"right",width:110}}>Amount</td><td style={{width:30}}/></tr></thead>
                    <tbody>
                      {preview.rows.map((r,i)=>(
                        <tr key={i} style={{borderTop:`1px solid ${T.border}`}}>
                          <td style={{padding:"4px 6px"}}><input type="date" value={r.date||""} onChange={e=>updatePreviewRow(i,"date",e.target.value)} style={{width:"100%",border:`1px solid ${T.border}`,borderRadius:6,padding:"5px 6px",fontSize:11,fontFamily:"inherit",color:T.text,boxSizing:"border-box"}}/></td>
                          <td style={{padding:"4px 6px"}}><input type="text" value={r.description||""} onChange={e=>updatePreviewRow(i,"description",e.target.value)} style={{width:"100%",border:`1px solid ${T.border}`,borderRadius:6,padding:"5px 6px",fontSize:11,fontFamily:"inherit",color:T.text,boxSizing:"border-box"}}/></td>
                          <td style={{padding:"4px 6px"}}><input type="number" step="any" value={r.amount==null?"":r.amount} onChange={e=>updatePreviewRow(i,"amount",e.target.value===""?null:parseFloat(e.target.value))} style={{width:"100%",border:`1px solid ${T.border}`,borderRadius:6,padding:"5px 6px",fontSize:11,fontFamily:"inherit",textAlign:"right",fontWeight:600,color:r.amount>=0?T.green:T.red,boxSizing:"border-box"}}/></td>
                          <td style={{textAlign:"center"}}><span onClick={()=>removePreviewRow(i)} title="Remove row" style={{cursor:"pointer",color:T.muted,fontSize:13}}>✕</span></td>
                        </tr>
                      ))}
                      {!preview.rows.length&&<tr><td colSpan="4" style={{padding:"16px 0",textAlign:"center",color:T.muted}}>No rows left — cancel and try a different file.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={confirmImport} disabled={importing||!preview.rows.length} style={{flex:1,background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"11px",fontWeight:700,fontSize:11,cursor:importing?"wait":"pointer",fontFamily:"inherit",opacity:preview.rows.length?1:0.5}}>{importing?"Importing…":`Import ${preview.rows.length} row${preview.rows.length===1?"":"s"}`}</button>
                  <button onClick={()=>setPreview(null)} disabled={importing} style={{flex:1,background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"11px",fontWeight:600,fontSize:11,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Bank reconciliation</h1>
      </div>
      {isApproved?(
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:T.greenBg,border:`1px solid ${T.green}`,borderRadius:10,padding:"10px 14px",marginBottom:14}}>
          <div style={{fontSize:11,color:T.green,fontWeight:700}}><i className="ti ti-lock" style={{fontSize:11,marginRight:6}}/>Reconciliation approved for {new Date(month+"-01").toLocaleString("default",{month:"long",year:"numeric"})} — this account is locked for that month.</div>
          <button onClick={doReopen} style={{background:"none",border:`1px solid ${T.green}`,borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:700,color:T.green,cursor:"pointer",fontFamily:"inherit"}}>Reopen</button>
        </div>
      ):canApprove?(
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:T.accentLight,border:`1px solid ${T.accent}`,borderRadius:10,padding:"10px 14px",marginBottom:14}}>
          <div style={{fontSize:11,color:T.accent,fontWeight:700}}>Everything's matched or posted for {new Date(month+"-01").toLocaleString("default",{month:"long",year:"numeric"})} — ready to approve.</div>
          <button onClick={doApprove} style={{background:T.accent,border:"none",borderRadius:8,padding:"7px 14px",fontSize:11,fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>Approve reconciliation</button>
        </div>
      ):null}
      {showMatched&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setShowMatched(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:T.radius.xl,maxWidth:640,width:"100%",maxHeight:"80vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",padding:24}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:15,fontWeight:800,color:T.text}}>Reconciled ledger entries without a direct match — {getName(selectedAccount)}, {new Date(month+"-01").toLocaleString("default",{month:"long",year:"numeric"})}</div>
              <button onClick={()=>setShowMatched(false)} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:16}}>✕</button>
            </div>
            <div style={{fontSize:11,color:T.muted,marginBottom:12}}>These were reconciled by hand, or as the "extra" side of a many-to-one match — they don't carry a direct link to a specific statement line, so they're listed here separately.</div>
            <table style={{width:"100%",fontSize:11,borderCollapse:"collapse"}}>
              <thead><tr style={{color:T.muted,fontSize:10}}><td style={{padding:"6px 0"}}>Date</td><td>Description</td><td style={{textAlign:"right"}}>Amount</td><td></td></tr></thead>
              <tbody>
                {matchedLedgerEntries.filter(t=>!matchedTxnIds.has(t.id)).map(t=>(
                  <tr key={t.id} style={{borderTop:`1px solid ${T.border}`}}>
                    <td style={{padding:"7px 0",color:T.sub}}>{t.date}</td>
                    <td style={{maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</td>
                    <td style={{textAlign:"right",fontWeight:600}}>{fmtBal(mv(t))}</td>
                    <td style={{textAlign:"right"}}><button onClick={()=>toggleReconciled(t.id,false)} disabled={isApproved} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:6,padding:"3px 8px",fontSize:10,fontWeight:600,color:isApproved?T.muted:T.sub,cursor:isApproved?"not-allowed":"pointer",fontFamily:"inherit"}}>Unmatch</button></td>
                  </tr>
                ))}
                {!matchedLedgerEntries.filter(t=>!matchedTxnIds.has(t.id)).length&&<tr><td colSpan="4" style={{padding:"24px 0",textAlign:"center",color:T.muted}}>None this month.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {showHistory&&(()=>{
        const monthsBack=[];
        for(let i=0;i<12;i++){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);monthsBack.push(d.toISOString().slice(0,7));}
        return(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setShowHistory(false)}>
            <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:T.radius.xl,maxWidth:560,width:"100%",maxHeight:"80vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",padding:24}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div style={{fontSize:15,fontWeight:800,color:T.text}}>Reconciliation history — {getName(selectedAccount)}</div>
                <button onClick={()=>setShowHistory(false)} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:16}}>✕</button>
              </div>
              <table style={{width:"100%",fontSize:11,borderCollapse:"collapse"}}>
                <thead><tr style={{color:T.sub,background:T.bg}}><td style={{padding:"9px 12px"}}>Month</td><td style={{textAlign:"right"}}>Entries</td><td style={{textAlign:"right"}}>Reconciled</td><td style={{textAlign:"right",padding:"9px 12px"}}>Status</td></tr></thead>
                <tbody>
                  {monthsBack.map(m=>{
                    const entries=transactions.filter(t=>(t.debitCode===selectedAccount||t.creditCode===selectedAccount)&&t.date.slice(0,7)===m);
                    const recCount=entries.filter(t=>t.reconciled).length;
                    const pct=entries.length?Math.round((recCount/entries.length)*100):null;
                    const label=new Date(m+"-01").toLocaleString("default",{month:"short",year:"numeric"});
                    return(
                      <tr key={m} style={{borderBottom:`1px solid ${T.border}`}}>
                        <td style={{padding:"9px 12px",color:T.text,fontWeight:600}}>{label}</td>
                        <td style={{textAlign:"right",color:T.text}}>{entries.length}</td>
                        <td style={{textAlign:"right",color:T.text}}>{recCount}</td>
                        <td style={{textAlign:"right",padding:"9px 12px"}}>
                          {entries.length===0?<span style={{fontSize:11,color:T.muted}}>No activity</span>
                            :pct===100?<span style={{fontSize:11,fontWeight:700,color:T.green,background:T.greenBg,padding:"3px 9px",borderRadius:8}}>✓ Reconciled</span>
                            :<span style={{fontSize:11,fontWeight:700,color:T.orange,background:T.orangeBg,padding:"3px 9px",borderRadius:8}}>{pct}% done</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
      {/* Filter bar — search stays narrow (it's a quick filter, not the main
          input), the icon buttons on the right are all the same 36×36 box so
          the row reads clean and aligned, matching the reference layout. */}
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:14,flexWrap:"wrap"}}>
        <div style={{position:"relative",flex:"0 1 10%",minWidth:100}}>
          <i className="ti ti-search" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:T.muted,fontSize:11}}/>
          <input placeholder="Search" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} style={{...inp,paddingLeft:30,background:"#fff",width:"100%"}}/>
        </div>
        <div style={{width:210,flexShrink:0}}>
          <AccDrop value={selectedAccount} onChange={v=>{setSelectedAccount(v);clearSelection();}} accounts={bankAccounts}/>
        </div>
        <div style={{position:"relative",flexShrink:0}}>
          <div onClick={()=>setMonthDropdownOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:4,border:`1px solid ${T.border}`,borderRadius:8,padding:"0 6px",background:"#fff",height:36,boxSizing:"border-box",cursor:"pointer"}}>
            <button onClick={e=>{e.stopPropagation();const d=new Date(month+"-01");d.setMonth(d.getMonth()-1);setMonth(d.toISOString().slice(0,7));clearSelection();}} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:T.sub,padding:"2px 4px"}}>‹</button>
            <span style={{fontSize:11,fontWeight:700,color:T.text,minWidth:90,textAlign:"center"}}>{new Date(month+"-01").toLocaleString("default",{month:"long",year:"numeric"})}</span>
            <button onClick={e=>{e.stopPropagation();const d=new Date(month+"-01");d.setMonth(d.getMonth()+1);setMonth(d.toISOString().slice(0,7));clearSelection();}} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:T.sub,padding:"2px 4px"}}>›</button>
            <i className="ti ti-chevron-down" style={{fontSize:11,color:T.muted,marginLeft:2}}/>
          </div>
          {monthDropdownOpen&&(<>
            <div onClick={()=>setMonthDropdownOpen(false)} style={{position:"fixed",inset:0,zIndex:298}}/>
            <div style={{position:"absolute",left:0,top:40,background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,zIndex:299,padding:12,boxShadow:"0 8px 24px rgba(0,0,0,0.14)",width:260}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <button onClick={()=>setMonth(m=>`${parseInt(m.slice(0,4))-1}-${m.slice(5,7)}`)} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:T.sub}}>‹</button>
                <span style={{fontSize:11,fontWeight:800,color:T.text}}>{month.slice(0,4)}</span>
                <button onClick={()=>setMonth(m=>`${parseInt(m.slice(0,4))+1}-${m.slice(5,7)}`)} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:T.sub}}>›</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                {MONTH_NAMES.map((mn,i)=>{
                  const mk=`${month.slice(0,4)}-${String(i+1).padStart(2,"0")}`;
                  const active=mk===month;
                  return(
                    <button key={mn} onClick={()=>{setMonth(mk);clearSelection();setMonthDropdownOpen(false);}} style={{background:active?T.accent:T.bg,color:active?"#fff":T.text,border:"none",borderRadius:7,padding:"8px 4px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{mn.slice(0,3)}</button>
                  );
                })}
              </div>
            </div>
          </>)}
        </div>
        <select value={directionFilter} onChange={e=>setDirectionFilter(e.target.value)} style={{...inp,width:130,background:"#fff",flexShrink:0,height:36,boxSizing:"border-box"}}>
          <option value="all">All</option>
          <option value="incoming">Incoming</option>
          <option value="outgoing">Outgoing</option>
        </select>
        <div style={{display:"flex",border:`1px solid ${T.border}`,borderRadius:8,overflow:"hidden",flexShrink:0,height:36}}>
          {[["unmatched","Unmatched"],["matched","Matched"]].map(([id,label])=>(
            <button key={id} onClick={()=>setFilterMode(id)} style={{background:filterMode===id?T.accent:"#fff",color:filterMode===id?"#fff":T.sub,border:"none",padding:"0 14px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",height:"100%"}}>{label}</button>
          ))}
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center"}}>
          {lastImport&&lastImport.accountCode===selectedAccount&&(
            <button onClick={doUndoImport} style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:8,padding:"0 14px",height:36,fontSize:11,fontWeight:600,color:T.red,cursor:"pointer",fontFamily:"inherit"}}>Undo import ({lastImport.count})</button>
          )}
          <button onClick={()=>setShowAttachPanel(o=>!o)} title={currentAttachment?"Bank statement attached":"Attach bank statement"} style={{position:"relative",background:showAttachPanel?T.accentLight:"#fff",border:`1px solid ${showAttachPanel?T.accent:T.border}`,borderRadius:8,width:36,height:36,cursor:"pointer",color:showAttachPanel?T.accent:T.sub,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <i className="ti ti-paperclip" style={{fontSize:15}}/>
            {currentAttachment&&<span style={{position:"absolute",top:-3,right:-3,width:8,height:8,borderRadius:"50%",background:T.green,border:"1.5px solid #fff"}}/>}
          </button>
          <button onClick={()=>setShowHistory(true)} title="History" style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:8,width:36,height:36,cursor:"pointer",color:T.sub,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><i className="ti ti-history" style={{fontSize:15}}/></button>
          <button onClick={()=>{setExportScope("period");setShowExportModal(true);}} title="Send or download" style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:8,width:36,height:36,cursor:"pointer",color:T.sub,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><i className="ti ti-download" style={{fontSize:15}}/></button>
          {parseBankStatementPDF&&(
            <label title="Read a bank statement PDF and turn it into importable rows" style={{background:"#fff",color:isApproved?T.muted:T.accent,border:`1px solid ${isApproved?T.border:T.accent}`,borderRadius:8,padding:"0 14px",height:36,fontSize:11,fontWeight:700,cursor:isApproved?"not-allowed":(readingPdf?"wait":"pointer"),fontFamily:"inherit",opacity:readingPdf?0.6:1,whiteSpace:"nowrap",display:"flex",alignItems:"center",flexShrink:0,boxSizing:"border-box"}}>
              {readingPdf?"Reading PDF…":(<><i className="ti ti-file-text-ai" style={{fontSize:13,marginRight:5}}/>Read PDF</>)}
              <input type="file" accept=".pdf,application/pdf" disabled={readingPdf||isApproved} style={{display:"none"}} onChange={e=>{if(e.target.files[0])handlePdfUpload(e.target.files[0]);e.target.value="";}}/>
            </label>
          )}
          <label style={{background:isApproved?T.border:T.accent,color:isApproved?T.muted:"#fff",border:"none",borderRadius:8,padding:"0 14px",height:36,fontSize:11,fontWeight:700,cursor:isApproved?"not-allowed":(uploading?"wait":"pointer"),fontFamily:"inherit",opacity:uploading?0.6:1,whiteSpace:"nowrap",display:"flex",alignItems:"center",flexShrink:0,boxSizing:"border-box"}}>
            {uploading?"Reading…":(<><i className="ti ti-upload" style={{fontSize:11,marginRight:5}}/>Upload</>)}
            <input type="file" accept=".csv,.txt,.xlsx,.xls" disabled={uploading||isApproved} style={{display:"none"}} onChange={e=>{if(e.target.files[0])handleUpload(e.target.files[0]);e.target.value="";}}/>
          </label>
        </div>
      </div>

      {/* Send or download modal — mirrors the reference "Send eller last ned
          fil" dialog: choose which posts, pick a format, then either
          download directly or fire off an email with the list attached. */}
      {showExportModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setShowExportModal(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:T.radius.xl,maxWidth:420,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",padding:24}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:16,fontWeight:800,color:T.text}}>Send or download file</div>
              <button onClick={()=>setShowExportModal(false)} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:16}}>✕</button>
            </div>
            <div style={{display:"flex",border:`1px solid ${T.border}`,borderRadius:8,overflow:"hidden",marginBottom:16}}>
              {[["email","Email file"],["download","Download file"],["log",`Sent log (${exportSendLog.length})`]].map(([id,label])=>(
                <button key={id} onClick={()=>setExportMode(id)} style={{flex:1,background:exportMode===id?T.accentLight:"#fff",color:exportMode===id?T.accent:T.sub,border:"none",borderRight:id!=="log"?`1px solid ${T.border}`:"none",padding:"8px 6px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{label}</button>
              ))}
            </div>

            {exportMode==="log"?(
              <div>
                {!exportSendLog.length&&<div style={{textAlign:"center",color:T.muted,fontSize:11,padding:"20px 0"}}>Nothing sent yet.</div>}
                {exportSendLog.map((e,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:i<exportSendLog.length-1?`1px solid ${T.border}`:"none",fontSize:11}}>
                    <span style={{color:T.text,fontWeight:600}}>{e.to}</span>
                    <span style={{color:T.muted}}>{e.count} posts · {new Date(e.date).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            ):(
              <>
                <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8}}>WHICH POSTS</div>
                <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
                  {[["period","All open posts in the current period"],["all","All open posts on this account"],["selected",`Selected posts (${selectedLineIds.size})`]].map(([id,label])=>(
                    <label key={id} style={{display:"flex",alignItems:"center",gap:8,fontSize:11,color:T.text,cursor:"pointer"}}>
                      <input type="radio" name="exportScope" checked={exportScope===id} onChange={()=>setExportScope(id)} disabled={id==="selected"&&!selectedLineIds.size} style={{accentColor:T.accent}}/>
                      {label}
                    </label>
                  ))}
                </div>
                <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8}}>FILE FORMAT</div>
                <div style={{display:"flex",gap:16,marginBottom:16}}>
                  {[["pdf","PDF"],["xlsx","XLSX"]].map(([id,label])=>(
                    <label key={id} style={{display:"flex",alignItems:"center",gap:8,fontSize:11,color:T.text,cursor:"pointer"}}>
                      <input type="radio" name="exportFormat" checked={exportFormat===id} onChange={()=>setExportFormat(id)} style={{accentColor:T.accent}}/>
                      {label}
                    </label>
                  ))}
                </div>
                {exportMode==="email"&&(<>
                  <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:6}}>RECIPIENT EMAIL *</div>
                  <input type="email" placeholder="name@mail.com" value={exportEmail} onChange={e=>setExportEmail(e.target.value)} style={{...inp,marginBottom:12}}/>
                  <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:6}}>MESSAGE</div>
                  <textarea value={exportMessage} onChange={e=>setExportMessage(e.target.value)} rows={4} style={{...inp,marginBottom:16,resize:"vertical",fontFamily:"inherit"}}/>
                </>)}
                <div style={{display:"flex",gap:8}}>
                  <button onClick={exportMode==="email"?runEmailSend:runExport} style={{flex:1,background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"10px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                    <i className={exportMode==="email"?"ti ti-send":"ti ti-download"} style={{fontSize:12}}/>
                    {exportMode==="email"?"Send file as email":`Download ${exportFormat.toUpperCase()}`}
                  </button>
                  <button onClick={()=>setShowExportModal(false)} style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 16px",fontSize:11,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Month tabs — click to jump, ✓ = fully reconciled, clock = pending */}
      <div style={{display:"flex",gap:2,marginBottom:16,borderBottom:`1px solid ${T.border}`,overflowX:"auto"}}>
        {monthTabs.map(mt=>{
          const active=mt.key===month;
          return(
            <button key={mt.key} onClick={()=>{setMonth(mt.key);clearSelection();}} style={{background:"none",border:"none",borderBottom:active?`2px solid ${T.accent}`:"2px solid transparent",padding:"8px 12px",cursor:"pointer",fontFamily:"inherit",display:"flex",flexDirection:"column",alignItems:"center",gap:4,flexShrink:0}}>
              {mt.hasActivity?(
                mt.done?<i className="ti ti-circle-check" style={{fontSize:15,color:T.green}}/>:<i className="ti ti-clock" style={{fontSize:15,color:T.muted}}/>
              ):<i className="ti ti-clock" style={{fontSize:15,color:T.border}}/>}
              <span style={{fontSize:11,fontWeight:active?700:500,color:active?T.accent:T.sub}}>{mt.label}</span>
            </button>
          );
        })}
      </div>

      {/* Three summary cards — selecting rows on either side swaps that
          card's balance for the sum of what's selected, exactly like
          Tripletex's "Sum valgte" replacing "Saldo" on selection. When only
          statement lines are selected (nothing on the ledger side), the
          third card turns into the "Bokfør" action instead of showing a
          deviation that selecting-to-post doesn't actually represent. */}
      {(()=>{
        const card1Value=selectedTxnsArr.length>0?selTxnsTotal:enteredBalance;
        const card2Value=selectedLines.length>0?selLinesTotal:statementBalance;
        const diff=card1Value-card2Value;
        const hasSelection=selectedLines.length>0||selectedTxnsArr.length>0;
        const readyToBokfor=selectedLines.length>0&&!selectedTxnsArr.length;
        return(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:16}}>
            <div style={{background:"rgba(255,255,255,0.72)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",border:`1px solid ${T.borderGlass}`,borderRadius:16,padding:"18px 22px",boxShadow:"0 10px 30px rgba(20,60,50,0.06)"}}>
              <div style={{fontSize:11,color:T.sub,marginBottom:6}}>Entered in ledger{selectedTxnsArr.length>0&&<span style={{color:T.accent,fontWeight:700}}> · {selectedTxnsArr.length} selected</span>}</div>
              <div style={{fontSize:17,fontWeight:800,color:T.text}}>{fmtBal(card1Value)}</div>
            </div>
            <div style={{background:"rgba(255,255,255,0.72)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",border:`1px solid ${T.borderGlass}`,borderRadius:16,padding:"18px 22px",boxShadow:"0 10px 30px rgba(20,60,50,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
              <div>
                <div style={{fontSize:11,color:T.sub,marginBottom:6}}>{selectedLines.length>0?<span style={{color:T.accent,fontWeight:700}}>Selected · {selectedLines.length}</span>:"From bank statement"}</div>
                <div style={{fontSize:17,fontWeight:800,color:T.text}}>{fmtBal(card2Value)}</div>
              </div>
              {hasSelection&&(
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  {canMatch&&<button onClick={doMatch} disabled={isApproved} style={{background:T.accent,border:"none",borderRadius:8,padding:"7px 12px",fontSize:11,fontWeight:700,color:"#fff",cursor:isApproved?"not-allowed":"pointer",fontFamily:"inherit"}}>Match</button>}
                  <button onClick={clearSelection} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 10px",fontSize:11,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
                </div>
              )}
            </div>
            {readyToBokfor?(
              <div style={{background:T.accentLight,border:`1px solid ${T.accent}`,borderRadius:10,padding:"18px 22px",display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",gap:8}}>
                <button onClick={()=>setBulkPostOpen(true)} disabled={isApproved} style={{background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"9px 20px",fontSize:11,fontWeight:700,cursor:isApproved?"not-allowed":"pointer",fontFamily:"inherit",width:"100%"}}>Post ({selectedLines.length})</button>
              </div>
            ):(
              <div style={{background:Math.abs(diff)>0.01?T.redLight:T.greenBg,border:`1px solid ${Math.abs(diff)>0.01?T.red:T.green}`,borderRadius:10,padding:"18px 22px"}}>
                <div style={{fontSize:11,color:Math.abs(diff)>0.01?T.red:T.green,marginBottom:6}}>Difference</div>
                <div style={{fontSize:17,fontWeight:800,color:Math.abs(diff)>0.01?T.red:T.green}}>{fmtBal(diff)}</div>
              </div>
            )}
          </div>
        );
      })()}
      {bulkPostOpen&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>{setBulkPostOpen(false);setBulkOffsetCode("");}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:T.radius.xl,maxWidth:420,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",padding:24}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontSize:16,fontWeight:800,color:T.text}}>Post transactions</div>
              <button onClick={()=>{setBulkPostOpen(false);setBulkOffsetCode("");}} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:16}}>✕</button>
            </div>
            <div style={{fontSize:11,color:T.sub,marginBottom:16,lineHeight:1.5}}>{selectedLines.length} line{selectedLines.length===1?"":"s"} selected · {fmtBal(selLinesTotal)} total. Each will post as its own entry against the account you choose{currentAttachment?", with the attached bank statement kept as proof.":"."}</div>
            <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:6}}>POST AS *</div>
            <div style={{marginBottom:16}}>
              <AccDrop value={bulkOffsetCode} onChange={setBulkOffsetCode} accounts={offsetOptions} onCreateAccount={onSaveAccounts?a=>onSaveAccounts([...accounts,{code:a.code,name:a.name}]):undefined}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={runBulkPost} disabled={!bulkOffsetCode||bulkPosting} style={{flex:1,background:bulkOffsetCode?T.accent:T.border,color:bulkOffsetCode?"#fff":T.muted,border:"none",borderRadius:8,padding:"10px",fontSize:11,fontWeight:700,cursor:bulkOffsetCode?"pointer":"default",fontFamily:"inherit"}}>{bulkPosting?(uploadingProof?"Attaching proof…":"Posting…"):"Post"}</button>
              <button onClick={()=>{setBulkPostOpen(false);setBulkOffsetCode("");}} style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 16px",fontSize:11,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {matchBlockedByBothMulti&&(
        <div style={{background:T.orangeBg,border:`1px solid ${T.orange}`,borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:11,color:T.orange,fontWeight:600}}>Narrow one side to a single entry — a match can be several lines to one ledger entry, or one line to several entries, but not many on both sides at once.</div>
      )}

      {(()=>{
        // The two matching columns live together as one unit — when the
        // attachment panel opens it's this whole grid that shrinks to make
        // room (both columns staying fully visible), never a floating panel
        // covering data underneath. "Entered in ledger" is kept on the near
        // side, next to the divider, since it's the one that yields if you
        // drag the attachment wide enough to overlap — "From bank statement"
        // is the column you cross-reference against the attachment, so it
        // stays on the far side, away from the split.
        const matchingGrid=(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            {/* Entered in ledger */}
            <div style={{background:"rgba(255,255,255,0.72)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",border:`1px solid ${T.borderGlass}`,borderRadius:16,overflow:"hidden",boxShadow:"0 10px 30px rgba(20,60,50,0.06)"}}>
              <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:11,fontWeight:700,color:T.text}}>Entered in ledger</div>
                <div style={{fontSize:11,color:T.muted}}>{workingLedgerEntries.length} remaining</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 20px",borderBottom:`1px solid ${T.border}`,background:T.bg}}>
                <input type="checkbox" checked={allLeftSelected} disabled={isApproved||!displayLeftRows.length} onChange={toggleSelectAllLeft} title="Select all"/>
                <div onClick={()=>toggleSort(setSortLeft,"date")} style={{flex:1,minWidth:0,fontSize:10,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:0.4,cursor:"pointer",display:"flex",alignItems:"center",gap:3}}>
                  Date{sortLeft.key==="date"&&<i className={sortLeft.dir===1?"ti ti-arrow-up":"ti ti-arrow-down"} style={{fontSize:11}}/>}
                </div>
                <div onClick={()=>toggleSort(setSortLeft,"amount")} style={{fontSize:10,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:0.4,cursor:"pointer",display:"flex",alignItems:"center",gap:3,flexShrink:0}}>
                  Amount{sortLeft.key==="amount"&&<i className={sortLeft.dir===1?"ti ti-arrow-up":"ti ti-arrow-down"} style={{fontSize:11}}/>}
                </div>
              </div>
              <div style={{maxHeight:440,overflowY:"auto"}}>
                {displayLeftRows.map(t=>{
                  const isSuggested=topSuggestion&&topSuggestion.txn.id===t.id;
                  const selected=selectedTxnIds.has(t.id);
                  return(
                    <div key={t.id} className="rr-table-row" onClick={()=>toggleTxnSel(t.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 16px",minHeight:42,boxSizing:"border-box",borderBottom:`1px solid ${T.border}`,background:isSuggested?T.orangeBg:(selected?T.accentLight:"#fff"),cursor:isApproved?"default":"pointer"}}>
                      <input type="checkbox" checked={selected} disabled={isApproved} onClick={e=>e.stopPropagation()} onChange={()=>toggleTxnSel(t.id)}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                          <span onClick={e=>{e.stopPropagation();setDetailTxn(t);}} title="Open entry" style={{fontSize:10,fontWeight:800,color:T.accent,cursor:"pointer",textDecoration:"underline dotted",flexShrink:0}}>{fmtB(t.bilag)}</span>
                          <div style={{fontSize:11,fontWeight:600,color:isSuggested?T.orange:T.text,wordBreak:"break-word"}}>{t.description}{isSuggested&&<span style={{marginLeft:5,fontSize:9,fontWeight:800}}>≈ suggested</span>}</div>
                        </div>
                        <div style={{fontSize:11,color:T.muted,display:"flex",alignItems:"center",gap:6}}>
                          <span>{t.date}</span>
                          {!!t.reconciled&&<span style={{color:T.green,fontWeight:700}}>· reconciled</span>}
                        </div>
                      </div>
                      <div style={{fontWeight:700,fontSize:11,color:T.text,flexShrink:0}}>{fmtBal(mv(t))}</div>
                      {addEntryComment&&<i onClick={e=>{e.stopPropagation();openTxnComments(t);}} title="Comment on this entry" className="ti ti-message-circle" style={{fontSize:13,color:T.muted,cursor:"pointer",flexShrink:0}}/>}
                    </div>
                  );
                })}
                {!displayLeftRows.length&&(
                  <div style={{padding:"36px 20px",textAlign:"center",color:T.muted,fontSize:11}}>
                    {ledgerEntries.length?"Everything here is matched — see the Matched tab.":(
                      <>
                        <div style={{marginBottom:10}}>No ledger entries this month. Check another period, or register new vouchers from the Inbox.</div>
                        <button onClick={()=>onNavigate&&onNavigate("Files")} style={{background:T.accentLight,color:T.accent,border:"none",borderRadius:8,padding:"7px 14px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Go to Inbox →</button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {matchedLedgerEntries.filter(t=>!matchedTxnIds.has(t.id)).length>0&&(
                <button onClick={()=>setShowMatched(true)} style={{width:"100%",background:T.bg,border:"none",borderTop:`1px solid ${T.border}`,padding:"9px",fontSize:11,fontWeight:600,color:T.accent,cursor:"pointer",fontFamily:"inherit"}}>
                  {matchedLedgerEntries.filter(t=>!matchedTxnIds.has(t.id)).length} reconciled without a direct match →
                </button>
              )}
            </div>

            {/* From bank statement */}
            <div style={{background:"rgba(255,255,255,0.72)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",border:`1px solid ${T.borderGlass}`,borderRadius:16,overflow:"hidden",boxShadow:"0 10px 30px rgba(20,60,50,0.06)"}}>
              <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:11,fontWeight:700,color:T.text}}>From bank statement</div>
                <div style={{fontSize:11,color:T.muted}}>{matchedLines.length} matched</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 20px",borderBottom:`1px solid ${T.border}`,background:T.bg}}>
                {filterMode!=="matched"?<input type="checkbox" checked={allRightSelected} disabled={isApproved||!displayRightRows.length} onChange={toggleSelectAllRight} title="Select all"/>:<span style={{width:13}}/>}
                <div onClick={()=>toggleSort(setSortRight,"date")} style={{flex:1,minWidth:0,fontSize:10,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:0.4,cursor:"pointer",display:"flex",alignItems:"center",gap:3}}>
                  Date{sortRight.key==="date"&&<i className={sortRight.dir===1?"ti ti-arrow-up":"ti ti-arrow-down"} style={{fontSize:11}}/>}
                </div>
                <div onClick={()=>toggleSort(setSortRight,"amount")} style={{fontSize:10,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:0.4,cursor:"pointer",display:"flex",alignItems:"center",gap:3,flexShrink:0}}>
                  Amount{sortRight.key==="amount"&&<i className={sortRight.dir===1?"ti ti-arrow-up":"ti ti-arrow-down"} style={{fontSize:11}}/>}
                </div>
              </div>

              {postMenu&&(
                <>
                  <div onClick={()=>setPostMenu(null)} style={{position:"fixed",inset:0,zIndex:900}}/>
                  <div style={{position:"fixed",left:Math.min(postMenu.x,window.innerWidth-190),top:Math.min(postMenu.y,window.innerHeight-60),background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,boxShadow:"0 10px 30px rgba(0,0,0,0.18)",zIndex:901,padding:4,minWidth:170}}>
                    <button onClick={()=>{setBulkPostOpen(true);setPostMenu(null);}} style={{width:"100%",textAlign:"left",background:"none",border:"none",padding:"9px 12px",fontSize:11,fontWeight:600,color:T.text,cursor:"pointer",fontFamily:"inherit",borderRadius:6}}>Select account…</button>
                  </div>
                </>
              )}

              <div style={{maxHeight:440,overflowY:"auto"}}>
                {displayRightRows.map(l=>{
                  const isSuggested=filterMode!=="matched"&&topSuggestion&&topSuggestion.line.id===l.id;
                  const selected=selectedLineIds.has(l.id);
                  const isMatchedMode=filterMode==="matched";
                  const linkedTxn=isMatchedMode&&l.postedTxnId?transactions.find(t=>t.id===l.postedTxnId):null;
                  return(
                    <div key={l.id}
                      className="rr-table-row"
                      onClick={()=>!isMatchedMode&&toggleLineSel(l.id)}
                      onContextMenu={e=>{if(isMatchedMode)return;e.preventDefault();if(isApproved)return;setSelectedLineIds(new Set([l.id]));setSelectedTxnIds(new Set());setPostMenu({lineId:l.id,x:e.clientX,y:e.clientY});}}
                      style={{display:"flex",alignItems:"center",gap:10,padding:"8px 16px",minHeight:42,boxSizing:"border-box",borderBottom:`1px solid ${T.border}`,background:isSuggested?T.orangeBg:(selected?T.accentLight:"#fff"),cursor:isApproved||isMatchedMode?"default":"pointer"}}>
                      {!isMatchedMode&&<input type="checkbox" checked={selected} disabled={isApproved} onClick={e=>e.stopPropagation()} onChange={()=>toggleLineSel(l.id)}/>}
                      {isMatchedMode&&<span style={{width:13}}/>}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                          {linkedTxn&&<span onClick={e=>{e.stopPropagation();setDetailTxn(linkedTxn);}} title="Open entry" style={{fontSize:10,fontWeight:800,color:T.accent,cursor:"pointer",textDecoration:"underline dotted",flexShrink:0}}>{fmtB(linkedTxn.bilag)}</span>}
                          <div style={{fontSize:11,fontWeight:600,color:isSuggested?T.orange:T.text,wordBreak:"break-word"}}>{l.description}{isSuggested&&<span style={{marginLeft:5,fontSize:9,fontWeight:800}}>≈ suggested</span>}</div>
                        </div>
                        <div style={{fontSize:11,color:T.muted}}>{l.date}</div>
                      </div>
                      <div style={{fontWeight:700,fontSize:11,color:T.text,flexShrink:0}}>{fmtBal(l.amount)}</div>
                      {linkedTxn&&addEntryComment&&<i onClick={e=>{e.stopPropagation();openTxnComments(linkedTxn);}} title="Comment on this entry" className="ti ti-message-circle" style={{fontSize:13,color:T.muted,cursor:"pointer",flexShrink:0}}/>}
                      <div style={{flexShrink:0,display:"flex",gap:4}}>
                        {isMatchedMode?(
                          <button onClick={e=>{e.stopPropagation();doUnmatch(l);}} disabled={isApproved} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:6,padding:"3px 9px",fontSize:10,fontWeight:600,color:isApproved?T.muted:T.sub,cursor:isApproved?"not-allowed":"pointer",fontFamily:"inherit"}}>Unmatch</button>
                        ):isSuggested?(
                          <>
                            <button onClick={e=>{e.stopPropagation();confirmSuggestion(l,topSuggestion.txn);}} style={{background:T.orange,border:"none",borderRadius:6,padding:"3px 9px",fontSize:10,fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>Confirm</button>
                            <button onClick={e=>{e.stopPropagation();dismissSuggestion(l.id);}} style={{background:"none",border:`1px solid ${T.orange}`,borderRadius:6,padding:"3px 9px",fontSize:10,fontWeight:600,color:T.orange,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                          </>
                        ):(
                          <button onClick={e=>{e.stopPropagation();deleteBankStatementLine(l.id);}} disabled={isApproved} title="Delete line" style={{background:"none",border:"none",color:isApproved?T.border:T.muted,cursor:isApproved?"not-allowed":"pointer",fontSize:11}}><i className="ti ti-note"/></button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {!displayRightRows.length&&<div style={{padding:"36px 0",textAlign:"center",color:T.muted,fontSize:11}}>{filterMode==="matched"?"Nothing matched yet this month.":"No unposted lines. Upload a statement to get started."}</div>}
              </div>
            </div>
          </div>
        );

        if(!showAttachPanel)return matchingGrid;

        const attachmentPanel=(
          <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,height:"100%",display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
              <div style={{fontSize:12,fontWeight:700,color:T.text}}>Bank statement — {getName(selectedAccount)} · {new Date(month+"-01").toLocaleString("default",{month:"long",year:"numeric"})}</div>
            </div>
            <div style={{display:"flex",gap:8,padding:"10px 16px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
              <label style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:600,color:T.sub,cursor:"pointer"}}>
                {currentAttachment?"Replace":"Attach file"}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{display:"none"}} onChange={e=>{if(e.target.files[0])handleAttachStatement(e.target.files[0]);}}/>
              </label>
              {currentAttachment&&<button onClick={()=>{if(onRemoveAttach&&window.confirm("Remove this attachment?"))onRemoveAttach(attachKey);}} style={{background:T.redLight,border:"none",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:600,color:T.red,cursor:"pointer",fontFamily:"inherit"}}>Remove</button>}
            </div>
            <div style={{flex:1,minHeight:0,overflowY:"auto",padding:16}}>
              {currentAttachment?(
                currentAttachment.type&&currentAttachment.type.startsWith("image")?(
                  <img src={currentAttachment.data} style={{width:"100%",borderRadius:8,border:`1px solid ${T.border}`}}/>
                ):(
                  <iframe src={currentAttachment.data} style={{width:"100%",height:"100%",minHeight:400,border:`1px solid ${T.border}`,borderRadius:8}} title="Bank statement"/>
                )
              ):(
                <div style={{fontSize:11,color:T.muted}}>No statement attached for this account/month yet — attach the bank's PDF or image export here so it's kept alongside this period permanently.</div>
              )}
            </div>
          </div>
        );

        return <ResizableSplit left={matchingGrid} right={attachmentPanel} defaultRightWidth={460} minRightWidth={340} maxRightWidth={900}/>;
      })()}
      {detailTxn&&<DetailModal txn={detailTxn} accounts={accounts} contacts={contacts}
        fetchTxnAttachments={fetchTxnAttachments} uploadInboxFile={uploadInboxFile} attachFilesToTxnEntry={attachFilesToTxnEntry} inboxFiles={inboxFiles} fetchEntryComments={fetchEntryComments} addEntryComment={addEntryComment}
        auditLog={auditLog} profiles={profiles} currentUserId={currentUserId} moneySources={moneySources} tagTransaction={tagTransaction}
        initialShowComments={detailTxnShowComments}
        onEdit={u=>{if(onEditTxn)onEditTxn(u);setDetailTxn(null);}}
        onDelete={id=>{if(onDeleteTxn)onDeleteTxn(id);setDetailTxn(null);}}
        onReverse={tx=>{if(onReverseTxn)onReverseTxn(tx);setDetailTxn(null);}}
        onClose={()=>{setDetailTxn(null);setDetailTxnShowComments(false);}}/>}
    </div>
  );
}

// Desktop-native Reskontro (customer/supplier ledger) — matches the flat
// filter-row + grouped-table layout, instead of just embedding the mobile
// card UI. Note: "Invoice no." and "Due date" from the reference mockup
// aren't real fields we track (only bilag + date), so this shows what we
// actually have — Bilag, Date, Description, Amount — rather than fabricate
// columns with no underlying data.
function ReskontroDesktopScreen({contacts,setContacts,transactions,accounts,matchTxns,unmatchTxns,onOpenLedger,registerExcelExport,defaultType,auditLog=[],profiles=[],currentUserId,onNavigate}){
  const[type,setType]=useState(defaultType||"supplier"); // "customer" | "supplier"
  useEffect(()=>{if(defaultType)setType(defaultType);},[defaultType]);
  const[matchDetailGroupId,setMatchDetailGroupId]=useState(null);
  const[search,setSearch]=useState("");
  const[contactFilter,setContactFilter]=useState("");
  const[viewMonth,setViewMonth]=useState(()=>new Date().toISOString().slice(0,7));
  const[entriesView,setEntriesView]=useState("open"); // "open" | "closed" | "all"
  const[selected,setSelected]=useState({}); // {contactId: [txnIds]}
  const[collapsedIds,setCollapsedIds]=useState(new Set());
  const toggleCollapse=(id)=>setCollapsedIds(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);return n;});

  // "code" is the series bucket ("1500" or "2400"), not one literal
  // account — a company can have several accounts in that range (1500
  // Accounts Receivable, 1510 Trade Receivables, 1520 Receivables from
  // Group Companies, etc.), and any manually-posted entry against one of
  // those siblings instead of the exact top-level code used to be
  // completely invisible here, even though the AR/AP dashboard totals
  // elsewhere already aggregate the whole bucket via getSK(). Matching by
  // series instead of exact code is what actually fixes "no data shows".
  const code=type==="customer"?"1500":"2400";
  const inBucket=c=>getSK(c)===code;
  const year=parseInt(viewMonth.slice(0,4));
  const monthIdx=parseInt(viewMonth.slice(5,7))-1;
  const periodEnd=`${year}-${String(monthIdx+1).padStart(2,"0")}-${String(new Date(year,monthIdx+1,0).getDate()).padStart(2,"0")}`;
  const periodLabel=new Date(year,monthIdx,1).toLocaleString("default",{month:"long"})+" "+year;
  const stepMonth=(dir)=>{
    let m=monthIdx+dir,y=year;
    if(m<0){m=11;y-=1;}else if(m>11){m=0;y+=1;}
    setViewMonth(`${y}-${String(m+1).padStart(2,"0")}`);
  };

  const relevantContacts=useMemo(()=>contacts.filter(c=>c.type===type),[contacts,type]);
  const mv=(t)=>inBucket(t.debitCode)?t.amount:-t.amount;
  const[minAmount,setMinAmount]=useState("");
  const[maxAmount,setMaxAmount]=useState("");

  const groups=useMemo(()=>{
    return relevantContacts
      .filter(c=>!contactFilter||c.id===contactFilter)
      .map(c=>{
        let txns=transactions.filter(t=>t.contactId===c.id&&(inBucket(t.debitCode)||inBucket(t.creditCode)));
        const isMatched=(t)=>!!(t.matchedWith&&t.matchedAccount===code);
        // "Open" means "still outstanding as of this period" — an unpaid
        // June invoice must still show when viewing August, so this filters
        // to everything dated on/before the period's end, not just entries
        // that happened within that one month. "Closed"/"all" are looking
        // at history instead, so those DO scope to the specific month —
        // this is the actual bug fix: previously viewMonth changed the
        // label but never touched this filter at all, so the period
        // selector had zero effect on what data appeared.
        if(entriesView==="open")txns=txns.filter(t=>!isMatched(t)&&t.date<=periodEnd);
        else if(entriesView==="closed")txns=txns.filter(t=>isMatched(t)&&t.date.slice(0,7)===viewMonth);
        else txns=txns.filter(t=>t.date.slice(0,7)===viewMonth);
        if(search){
          const q=search.toLowerCase();
          txns=txns.filter(t=>fmtB(t.bilag).toLowerCase().includes(q)||(t.description||"").toLowerCase().includes(q));
        }
        if(minAmount)txns=txns.filter(t=>Math.abs(mv(t))>=parseFloat(minAmount));
        if(maxAmount)txns=txns.filter(t=>Math.abs(mv(t))<=parseFloat(maxAmount));
        txns=txns.sort((a,b)=>a.date.localeCompare(b.date));
        const total=txns.reduce((s,t)=>s+mv(t),0);
        return{contact:c,txns,total};
      })
      .filter(g=>g.txns.length>0);
  },[relevantContacts,contactFilter,transactions,code,entriesView,search,minAmount,maxAmount,periodEnd,viewMonth]);

  const toggleSel=(cid,tid)=>setSelected(p=>{
    const cur=p[cid]||[];
    return{...p,[cid]:cur.includes(tid)?cur.filter(x=>x!==tid):[...cur,tid]};
  });
  const doMatch=(cid)=>{
    const ids=selected[cid]||[];
    const grpTxns=transactions.filter(t=>ids.includes(t.id));
    const sum=grpTxns.reduce((s,t)=>s+mv(t),0);
    if(ids.length<2||Math.abs(sum)>=1)return;
    matchTxns(ids,Date.now().toString(),code);
    setSelected(p=>({...p,[cid]:[]}));
  };

  const getName=acctCode=>((accounts.find(a=>a.code===acctCode))||{name:acctCode}).name;

  const totalEntryCount=groups.reduce((s,g)=>s+g.txns.length,0);

  // Statement of account — a real printable document listing a contact's
  // open items, meant to be sent to them (not just for internal viewing).
  const printStatement=(contact,txns,total)=>{
    const rows=txns.map(t=>`<tr><td>${fmtB(t.bilag)}</td><td>${t.date}</td><td>${t.dueDate||"—"}</td><td>${t.description}</td><td style="text-align:right">${fmt(mv(t))}</td></tr>`).join("");
    const html=`<!DOCTYPE html><html><head><title>Statement — ${contact.name}</title><style>
      body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:36px;}
      h1{font-size:20px;font-weight:bold;margin-bottom:2px;}
      .sub{font-size:12px;color:#666;margin-bottom:24px;}
      table{width:100%;border-collapse:collapse;margin-top:14px;}
      th{background:#F5F9FA;color:#374151;padding:8px 10px;text-align:left;font-size:11px;border-bottom:2px solid #ddd;}
      td{padding:7px 10px;border-bottom:1px solid #eee;font-size:11px;}
      .total-row td{font-weight:bold;border-top:2px solid #333;font-size:13px;}
      @media print{.btn-bar{display:none;}}
    </style></head><body>
      <h1>Statement of Account</h1>
      <div class="sub">${contact.name} — as of ${new Date().toISOString().slice(0,10)}</div>
      <table>
        <thead><tr><th>Bilag</th><th>Date</th><th>Due date</th><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="total-row"><td colspan="4">Total outstanding</td><td style="text-align:right">${fmt(total)}</td></tr></tfoot>
      </table>
      <div class="btn-bar" style="margin-top:24px;"><button onclick="window.print()" style="padding:10px 20px;background:${T.accent};color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;">Print / Save as PDF</button></div>
    </body></html>`;
    openHtmlInNewTab(html);
  };

  // Register the Excel export with the global download button — exports
  // exactly what's visible right now (respecting Entries View / search /
  // contact filter), never the whole unfiltered ledger.
  useEffect(()=>{
    if(!registerExcelExport)return;
    registerExcelExport(()=>{
      const aoa=[["Contact","Bilag","Invoice no.","Date","Due date","Description","Amount"]];
      groups.forEach(({contact,txns})=>{
        txns.forEach(t=>aoa.push([contact.name,fmtB(t.bilag),t.invoiceNo||"",t.date,t.dueDate||"",t.description,mv(t)]));
        aoa.push([`Total for ${contact.name}`,"","","","","",groups.find(g=>g.contact.id===contact.id).total]);
      });
      const wb=XLSX.utils.book_new();
      const ws=XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb,ws,type==="customer"?"Customer ledger":"Supplier ledger");
      XLSX.writeFile(wb,`${type==="customer"?"CustomerLedger":"SupplierLedger"}_${entriesView}_${viewMonth}.xlsx`);
    });
  },[groups,type,entriesView,viewMonth,registerExcelExport]);

  // "Close entries" acts on whichever single contact currently has a
  // selection — matching only makes sense within one contact's open items.
  const activeSelContactId=Object.keys(selected).find(cid=>(selected[cid]||[]).length>0);
  const selectedAny=!!activeSelContactId&&(selected[activeSelContactId]||[]).length>=2;
  const selAnySum=activeSelContactId?(groups.find(g=>g.contact.id===activeSelContactId)||{txns:[]}).txns.filter(t=>(selected[activeSelContactId]||[]).includes(t.id)).reduce((s,t)=>s+mv(t),0):0;
  const doMatchAny=()=>{if(activeSelContactId)doMatch(activeSelContactId);};

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>{type==="customer"?"Customer ledger":"Supplier ledger"}</h1>
        {onNavigate&&(
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>onNavigate("Contacts")} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Edit existing</button>
            <button onClick={()=>onNavigate("ContactNew")} style={{background:T.accent,border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>+ New {type==="customer"?"customer":"supplier"}</button>
          </div>
        )}
      </div>

      {/* Sticky, not fixed — see TrialBalanceScreen for why: fixed put this
          header in a different width context than the real table below it
          (ignoring the scrollbar gutter), which is exactly the kind of gap
          reported here. Sticky needs no measured spacer div either. */}
      <div style={{position:"sticky",top:0,zIndex:50,background:T.bg,padding:"16px 0 8px"}}>
        <div style={{maxWidth:1000}}>
        <div style={{background:"rgba(255,255,255,0.72)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",border:`1px solid ${T.borderGlass}`,borderRadius:9,padding:"8px 10px",marginBottom:10,display:"flex",gap:8,alignItems:"center",flexWrap:"nowrap",boxShadow:"0 10px 30px rgba(20,60,50,0.06)"}}>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>setType("customer")} style={{background:type==="customer"?T.accent:"none",color:type==="customer"?"#fff":T.sub,border:`1px solid ${type==="customer"?T.accent:T.border}`,borderRadius:7,padding:"5px 12px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Customers</button>
            <button onClick={()=>setType("supplier")} style={{background:type==="supplier"?T.accent:"none",color:type==="supplier"?"#fff":T.sub,border:`1px solid ${type==="supplier"?T.accent:T.border}`,borderRadius:7,padding:"5px 12px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Suppliers</button>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:3,border:`1px solid ${T.border}`,borderRadius:6,padding:"3px 6px",flexShrink:0}}>
            <button onClick={()=>stepMonth(-1)} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:T.sub}}>‹</button>
            <MonthYearJump year={year} month={monthIdx+1} onPick={(y,m)=>setViewMonth(`${y}-${String(m).padStart(2,"0")}`)}/>
            <button onClick={()=>stepMonth(1)} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:T.sub}}>›</button>
          </div>
          <select value={contactFilter} onChange={e=>setContactFilter(e.target.value)} style={{...inp,width:130,padding:"5px 8px",fontSize:11,flexShrink:0}}>
            <option value="">All {type==="customer"?"customers":"suppliers"}</option>
            {relevantContacts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div style={{position:"relative",flex:1,minWidth:100}}>
            <i className="ti ti-search" style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",color:T.muted,fontSize:11}}/>
            <input placeholder="Invoice number, description…" value={search} onChange={e=>setSearch(e.target.value)} style={{...inp,paddingLeft:24,padding:"5px 8px 5px 24px",fontSize:11}}/>
          </div>
          <div style={{display:"flex",gap:4,flexShrink:0}}>
            {[["open","Open"],["closed","Closed"],["all","All"]].map(([id,label])=>(
              <button key={id} onClick={()=>setEntriesView(id)} style={{background:entriesView===id?T.accentLight:"none",color:entriesView===id?T.accent:T.sub,border:`1px solid ${entriesView===id?T.accent:T.border}`,borderRadius:6,padding:"4px 9px",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{label}</button>
            ))}
          </div>
          <span style={{fontSize:10,color:T.muted,whiteSpace:"nowrap",flexShrink:0}}>{groups.length} {groups.length===1?"contact":"contacts"} · {totalEntryCount} entries</span>
        </div>

        <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:"12px 12px 0 0",padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:14,fontWeight:800,color:T.text}}>
            {type==="customer"?"Customer":"Supplier"} specification (reskontro) — {entriesView==="all"?"all":entriesView==="closed"?"closed":"open"} items
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {selectedAny&&(
              <span style={{fontSize:11,color:T.sub}}>Net: <b style={{color:Math.abs(selAnySum)<1?T.green:T.red}}>{sign(selAnySum)}</b></span>
            )}
            {selectedAny&&(
              <button onClick={doMatchAny} disabled={Math.abs(selAnySum)>=1} style={{background:Math.abs(selAnySum)<1?T.accent:T.border,color:Math.abs(selAnySum)<1?"#fff":T.muted,border:"none",borderRadius:7,padding:"6px 14px",fontSize:11,fontWeight:700,cursor:Math.abs(selAnySum)<1?"pointer":"default",fontFamily:"inherit"}}>Match ✓</button>
            )}
          </div>
        </div>
        <table style={{width:"100%",fontSize:13,borderCollapse:"collapse",background:"#fff",border:`1px solid ${T.border}`,borderTop:"none"}}>
          <tbody><tr style={{color:T.muted,fontSize:11,background:T.bg}}>
            <td style={{padding:"9px 14px",width:36}}></td>
            <td style={{width:90}}>Bilag</td>
            <td style={{width:100}}>Invoice no.</td>
            <td style={{width:100}}>Date</td>
            <td style={{width:100}}>Due date</td>
            <td>Description</td>
            <td style={{textAlign:"right",padding:"9px 14px",width:130}}>Amount</td>
          </tr></tbody>
        </table>
        </div>
      </div>

      <div id="reskontro-print-area">
      <div className="print-only-period" style={{display:"none",fontSize:13,fontWeight:700,color:T.text,marginBottom:12}}>
        {type==="customer"?"Customer":"Supplier"} ledger — {periodLabel}{contactFilter?` — ${(relevantContacts.find(c=>c.id===contactFilter)||{}).name||""}`:""} — {entriesView==="all"?"all items":entriesView==="closed"?"closed items":"open items"}
      </div>
      <div style={{background:"#fff",border:`1px solid ${T.border}`,borderTop:"none",borderRadius:"0 0 12px 12px",marginTop:-1}}>
        <table style={{width:"100%",fontSize:13,borderCollapse:"collapse"}}>
          <tbody>
            {groups.map(({contact,txns,total})=>{
              const sel=selected[contact.id]||[];
              return(
                <React.Fragment key={contact.id}>
                  <tr>
                    <td colSpan="7" style={{padding:"7px 14px 4px",background:T.bg}}>
                      <div onClick={()=>printStatement(contact,txns,total)} title="Click for printable statement" style={{fontSize:13,fontWeight:700,color:T.accent,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6}}>
                        {contact.name}
                      </div>
                    </td>
                  </tr>
                  {txns.map(t=>{
                    const isMatchedHere=!!t.matchedWith&&t.matchedAccount===code;
                    const overdue=!isMatchedHere&&t.dueDate&&t.dueDate<new Date().toISOString().slice(0,10);
                    return(
                      <tr key={t.id} className="rr-table-row" style={{background:isMatchedHere?T.greenBg:"#fff",borderBottom:`1px solid ${T.border}`}}>
                        <td style={{padding:"9px 14px",width:36}}>
                          {isMatchedHere?(
                            <button onClick={()=>setMatchDetailGroupId(t.matchedWith)} title="Matched — click for details" style={{background:"none",border:"none",cursor:"pointer",color:T.green,fontWeight:800}}>✓</button>
                          ):(
                            <input type="checkbox" checked={sel.includes(t.id)} onChange={()=>toggleSel(contact.id,t.id)}/>
                          )}
                        </td>
                        <td onClick={()=>onOpenLedger&&onOpenLedger({code,name:getName(code)},t.date,t.date)} style={{width:90,color:T.accent,fontWeight:700,cursor:"pointer"}}>{fmtB(t.bilag)}</td>
                        <td style={{width:100,color:T.sub}}>{t.invoiceNo||"—"}</td>
                        <td style={{width:100,color:T.text}}>{t.date}</td>
                        <td style={{width:100,color:overdue?T.red:T.sub,fontWeight:overdue?700:400}}>{t.dueDate||"—"}</td>
                        <td style={{color:T.text}}>{t.description}</td>
                        <td style={{textAlign:"right",fontWeight:600,padding:"9px 14px",width:130,color:T.text}}>{sign(mv(t))}</td>
                      </tr>
                    );
                  })}
                  <tr style={{borderBottom:`1px solid ${T.border}`}}>
                    <td colSpan="6" style={{padding:"7px 14px",fontWeight:700,color:T.sub,fontSize:12}}>Sum</td>
                    <td style={{textAlign:"right",padding:"7px 14px",fontWeight:700,color:T.text,fontSize:12}}>{sign(total)}</td>
                  </tr>
                </React.Fragment>
              );
            })}
            {!groups.length&&(
              <tr><td colSpan="7" style={{textAlign:"center",color:T.muted,padding:30,fontSize:12}}>
                {!relevantContacts.length?(
                  <div>
                    <div>No {type==="customer"?"customers":"suppliers"} yet — add one first.</div>
                    {contacts.length>0&&(
                      <div style={{marginTop:10,fontSize:11,color:T.sub,background:T.bg,borderRadius:8,padding:"10px 14px",display:"inline-block",textAlign:"left"}}>
                        <div style={{fontWeight:700,marginBottom:4}}>Diagnostic — you have {contacts.length} contact{contacts.length===1?"":"s"} total:</div>
                        {Object.entries(contacts.reduce((m,c)=>{const k=JSON.stringify(c.type);m[k]=(m[k]||0)+1;return m;},{})).map(([typeVal,count])=>(
                          <div key={typeVal}>type = {typeVal} → {count} contact{count===1?"":"s"}{typeVal!=='"'+type+'"'&&<span style={{color:T.red,fontWeight:700}}> (doesn't match "{type}" — this is likely why they're not showing)</span>}</div>
                        ))}
                      </div>
                    )}
                  </div>
                ):transactions.some(t=>inBucket(t.debitCode)||inBucket(t.creditCode))&&transactions.filter(t=>inBucket(t.debitCode)||inBucket(t.creditCode)).every(t=>!t.contactId)?(
                  <>There are entries on this account, but none are linked to a {type}. Entries need a {type} selected when they're posted to show up here.</>
                ):(
                  <>No entries match these filters for {periodLabel}. Try "All" instead of "Open" if you're looking for older activity.</>
                )}
              </td></tr>
            )}
            {groups.length>0&&(
              <tr style={{borderTop:`2px solid ${T.border}`}}>
                <td colSpan="6" style={{padding:"12px 14px",fontWeight:800,color:T.text}}>Total — Closing balance</td>
                <td style={{textAlign:"right",padding:"12px 14px",fontWeight:800,color:T.text}}>{sign(groups.reduce((s,g)=>s+g.total,0))}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </div>
      {matchDetailGroupId&&(
        <MatchDetailModal groupId={matchDetailGroupId} auditLog={auditLog} profiles={profiles} currentUserId={currentUserId} onUnmatch={unmatchTxns} onClose={()=>setMatchDetailGroupId(null)}/>
      )}
    </div>
  );
}

// Top-level Customers register — Tripletex-style contact master data screen,
// separate from Reskontro (which is about open items, not contact records).
// Balance sheet reconciliation — walk through every balance sheet account
// for a chosen period, confirm it's actually correct (status), attach
// supporting documents, leave a comment. This is the month/year-end close
// workflow: not a report you read, a checklist you work through and sign
// off on — which is why it's structured as one row per account with a
// status control, not just numbers in a table.
const RECON_STATUSES=[
  {id:"not_started",label:"Not started",icon:"ti-circle",color:"#9CA3AF"},
  {id:"in_progress",label:"In progress",icon:"ti-clock",color:"#B45309"},
  {id:"done",label:"Done",icon:"ti-check",color:"#00875A"},
  {id:"reviewed",label:"Reviewed",icon:"ti-shield-check",color:"#0057B8"},
  {id:"follow_up",label:"Follow-up needed",icon:"ti-alert-triangle",color:"#D0021B"},
  {id:"not_applicable",label:"Not applicable",icon:"ti-x",color:"#9CA3AF"},
];
function ReconciliationScreen({accounts,transactions,reconciliationStatus=[],saveReconciliationStatus,reconciliationFiles=[],attachReconciliationFile,removeReconciliationFile,inboxFiles=[],uploadInboxFile,profiles=[],isDesktop=false}){
  const[period,setPeriod]=useState(()=>new Date().toISOString().slice(0,7));
  const[allFilesFor,setAllFilesFor]=useState(null);
  const[uploadingFor,setUploadingFor]=useState(null);
  const[expandedRow,setExpandedRow]=useState(null);
  const[collapsedGroups,setCollapsedGroups]=useState({});

  const year=parseInt(period.slice(0,4));
  const monthIdx=parseInt(period.slice(5,7))-1;
  const periodStart=`${period}-01`;
  const periodEnd=`${period}-${String(new Date(year,monthIdx+1,0).getDate()).padStart(2,"0")}`;
  const periodLabel=new Date(year,monthIdx,1).toLocaleString("default",{month:"long"})+" "+year;
  const stepMonth=dir=>{let m=monthIdx+dir,y=year;if(m<0){m=11;y-=1;}else if(m>11){m=0;y+=1;}setPeriod(`${y}-${String(m+1).padStart(2,"0")}`);};

  const balAt=(code,d)=>transactions.filter(t=>t.date<=d).reduce((s,t)=>{if(t.debitCode===code)return s+t.amount;if(t.creditCode===code)return s-t.amount;return s;},0);
  const balSKs=["1000","1100","1200","1300","1400","1500","1600","1700","1800","1900","2000","2100","2200","2300","2400","2500","2600","2700","2800","2900"];

  const profileName=uid=>{
    if(!uid)return null;
    const p=profiles.find(x=>x.id===uid);
    return p?(p.name||p.email||"Someone"):"Someone";
  };

  // Grouped by account series — mirrors the real accounting workflow of
  // walking through "Fixed assets," then "Bank," then "Short-term debt" as
  // coherent sections rather than one flat 40-row list, and gives an
  // at-a-glance per-group progress count the way Sticos's collapsible
  // KONTOGRUPPE rows do.
  const groups=useMemo(()=>{
    const out=[];
    balSKs.forEach(sk=>{
      const seriesInfo=SERIES[sk];
      const groupRows=[];
      accountsForSK(accounts,transactions,sk).forEach(a=>{
        const ib=balAt(a.code,new Date(new Date(periodStart).getTime()-86400000).toISOString().slice(0,10));
        const ub=balAt(a.code,periodEnd);
        const change=ub-ib;
        if(ib===0&&ub===0&&change===0)return;
        const status=reconciliationStatus.find(r=>r.accountCode===a.code&&r.period===period);
        const files=reconciliationFiles.filter(f=>f.accountCode===a.code&&f.period===period);
        groupRows.push({code:a.code,name:a.name,ib,change,ub,status:status?status.status:"not_started",statusComment:status?status.statusComment:"",accountComment:status?status.accountComment:"",updatedBy:status?status.updatedBy:null,updatedAt:status?status.updatedAt:null,files});
      });
      if(groupRows.length)out.push({sk,label:seriesInfo?seriesInfo.name:sk,rows:groupRows});
    });
    return out;
  },[accounts,transactions,period,reconciliationStatus,reconciliationFiles]);

  const allRows=groups.flatMap(g=>g.rows);
  const doneCount=allRows.filter(r=>["done","reviewed","not_applicable"].includes(r.status)).length;
  const followUpCount=allRows.filter(r=>r.status==="follow_up").length;

  const doUpload=async(code,file)=>{
    if(!uploadInboxFile)return;
    setUploadingFor(code);
    const uploaded=await uploadInboxFile(file,"Reconciliation");
    if(uploaded&&attachReconciliationFile){
      const ok=await attachReconciliationFile(code,period,uploaded.id);
      // attachReconciliationFile already alerts on failure and rolls back
      // its own state — nothing extra needed here either way.
    }
    setUploadingFor(null);
  };

  const allPeriodsForAccount=code=>{
    const ids=reconciliationFiles.filter(f=>f.accountCode===code).map(f=>({...f,file:inboxFiles.find(i=>i.id===f.inboxFileId)})).filter(f=>f.file);
    return ids.sort((a,b)=>b.period.localeCompare(a.period));
  };

  return(
    <div style={{maxWidth:isDesktop?1200:"100%"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Reconciliation</h1>
      </div>
      <p style={{fontSize:12,color:T.muted,marginBottom:16}}>Work through every balance sheet account for a period — confirm it's correct, attach the supporting document, note anything that needs follow-up.</p>

      <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:6,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",background:"#fff"}}>
          <button onClick={()=>stepMonth(-1)} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:T.sub}}>‹</button>
          <MonthYearJump year={year} month={monthIdx+1} onPick={(y,m)=>setPeriod(`${y}-${String(m).padStart(2,"0")}`)}/>
          <button onClick={()=>stepMonth(1)} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:T.sub}}>›</button>
        </div>
        <div style={{fontSize:12,color:T.sub}}>
          <span style={{fontWeight:700,color:T.green}}>{doneCount}</span> of <span style={{fontWeight:700}}>{allRows.length}</span> confirmed
          {followUpCount>0&&<span style={{color:T.red,fontWeight:700,marginLeft:10}}>· {followUpCount} need follow-up</span>}
        </div>
      </div>

      {groups.length===0&&<div style={{padding:24,textAlign:"center",fontSize:12,color:T.muted,background:"#fff",border:`1px solid ${T.border}`,borderRadius:12}}>No balance sheet activity in {periodLabel}.</div>}

      {groups.map(g=>{
        const gDone=g.rows.filter(r=>["done","reviewed","not_applicable"].includes(r.status)).length;
        const gFollowUp=g.rows.some(r=>r.status==="follow_up");
        const collapsed=!!collapsedGroups[g.sk];
        return(
          <div key={g.sk} style={{border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden",marginBottom:12}}>
            <div onClick={()=>setCollapsedGroups(p=>({...p,[g.sk]:!p[g.sk]}))} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:T.bg,cursor:"pointer"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <i className={`ti ti-chevron-${collapsed?"right":"down"}`} style={{fontSize:13,color:T.sub}}/>
                <span style={{fontSize:13,fontWeight:700,color:T.text}}>{g.label}</span>
                <span style={{fontSize:11,color:T.muted}}>· {g.sk}s</span>
              </div>
              <span style={{fontSize:11,fontWeight:700,color:gFollowUp?T.red:(gDone===g.rows.length?T.green:T.sub)}}>{gFollowUp?<><i className="ti ti-alert-triangle" style={{fontSize:12,marginRight:3}}/></>:null}{gDone} of {g.rows.length}</span>
            </div>
            {!collapsed&&(
              <div>
                <div style={{display:"grid",gridTemplateColumns:"1.6fr 0.9fr 0.9fr 0.9fr 1.3fr 70px",gap:8,padding:"6px 14px",borderBottom:`1px solid ${T.border}`}}>
                  {["Account","IB","Change","UB","Status","Files"].map(h=>(
                    <div key={h} style={{fontSize:9,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:0.3,textAlign:["IB","Change","UB"].includes(h)?"right":"left"}}>{h}</div>
                  ))}
                </div>
                {g.rows.map((r,i)=>{
                  const st=RECON_STATUSES.find(s=>s.id===r.status)||RECON_STATUSES[0];
                  const expanded=expandedRow===r.code;
                  const setterName=profileName(r.updatedBy);
                  return(
                    <div key={r.code} style={{borderBottom:i<g.rows.length-1||expanded?`1px solid ${T.border}`:"none",background:i%2===0?"#fff":T.bg}}>
                      <div style={{display:"grid",gridTemplateColumns:"1.6fr 0.9fr 0.9fr 0.9fr 1.3fr 70px",gap:8,alignItems:"center",padding:"9px 14px"}}>
                        <div onClick={()=>setExpandedRow(expanded?null:r.code)} style={{fontSize:12,fontWeight:600,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
                          <i className={`ti ti-chevron-${expanded?"down":"right"}`} style={{fontSize:11,color:T.muted,flexShrink:0}}/>
                          {r.code} {r.name}
                        </div>
                        <div style={{fontSize:12,textAlign:"right",color:T.sub}}>{fmt(r.ib)}</div>
                        <div style={{fontSize:12,textAlign:"right",color:r.change===0?T.muted:(r.change>0?T.green:T.red)}}>{r.change===0?"—":sign(r.change)}</div>
                        <div style={{fontSize:12,textAlign:"right",fontWeight:700,color:T.text}}>{fmt(r.ub)}</div>
                        <select value={r.status} onChange={e=>saveReconciliationStatus&&saveReconciliationStatus(r.code,period,{status:e.target.value})} style={{...inp,padding:"6px 8px",fontSize:11,color:st.color,fontWeight:700,borderColor:st.color+"55"}}>
                          {RECON_STATUSES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                        <div style={{display:"flex",gap:6,alignItems:"center",justifyContent:"center"}}>
                          <label title="Upload for this period" style={{cursor:uploadingFor===r.code?"wait":"pointer",color:T.sub}}>
                            <i className="ti ti-paperclip" style={{fontSize:15}}/>
                            <input type="file" style={{display:"none"}} disabled={uploadingFor===r.code} onChange={e=>{if(e.target.files[0])doUpload(r.code,e.target.files[0]);e.target.value="";}}/>
                          </label>
                          <span onClick={()=>setAllFilesFor(r.code)} title="View all periods' files for this account" style={{fontSize:11,fontWeight:700,color:r.files.length?T.accent:T.muted,cursor:"pointer"}}>{r.files.length||0}</span>
                        </div>
                      </div>
                      {expanded&&(
                        <div style={{padding:"4px 14px 14px 32px",display:"flex",flexDirection:"column",gap:8}}>
                          <div>
                            <div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:3}}>STATUS COMMENT</div>
                            <input placeholder="Why this status — e.g. matched against year-end statement" value={r.statusComment} onChange={e=>saveReconciliationStatus&&saveReconciliationStatus(r.code,period,{statusComment:e.target.value})} style={{...inp,fontSize:11,padding:"7px 10px"}}/>
                          </div>
                          <div>
                            <div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:3}}>ACCOUNT COMMENT <span style={{fontWeight:400,textTransform:"none"}}>— persists across periods, for anything ongoing about this account</span></div>
                            <input placeholder="e.g. Always reconcile against the year-end statement, not monthly" value={r.accountComment} onChange={e=>saveReconciliationStatus&&saveReconciliationStatus(r.code,period,{accountComment:e.target.value})} style={{...inp,fontSize:11,padding:"7px 10px"}}/>
                          </div>
                          {setterName&&(
                            <div style={{fontSize:10,color:T.muted}}>
                              Last set by <strong style={{color:T.sub}}>{setterName}</strong>{r.updatedAt?` on ${new Date(r.updatedAt).toLocaleDateString()}`:""}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {allFilesFor&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setAllFilesFor(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:14,padding:20,width:"90%",maxWidth:480,maxHeight:"70vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:15,fontWeight:800}}>Files for {allFilesFor}</div>
              <button onClick={()=>setAllFilesFor(null)} style={{background:"none",border:"none",cursor:"pointer",color:T.muted}}><i className="ti ti-x" style={{fontSize:16}}/></button>
            </div>
            {allPeriodsForAccount(allFilesFor).length===0&&<div style={{fontSize:12,color:T.muted,textAlign:"center",padding:20}}>No files uploaded yet for this account, in any period.</div>}
            {allPeriodsForAccount(allFilesFor).map(f=>(
              <div key={f.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:`1px solid ${T.border}`}}>
                <span style={{fontSize:10,fontWeight:700,color:T.accent,background:T.accentLight,borderRadius:6,padding:"2px 8px",flexShrink:0}}>{f.period}</span>
                <span style={{fontSize:12,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.file.name}</span>
                <button onClick={()=>removeReconciliationFile&&removeReconciliationFile(f.id)} style={{background:"none",border:"none",color:T.red,cursor:"pointer",padding:2}}><i className="ti ti-trash" style={{fontSize:13}}/></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export { AccountPlanScreen, NewAccountModal, AccountModal, SettingsMenu, BankSlider, MiniBar, PeriodSelector, Dashboard, ConicChart, AssistantPanel, OnboardingWizard, DesktopDashboard, AccountEditModal, PeriodPickerModal, LedgerDrilldownScreen, TrialBalanceScreen, ResultatScreen, BalanceSheetScreen, VATReportScreen, VATTerminScreen, VATTerminDetailScreen, GeneralLedgerScreen, BankDashboardScreen, BankAccountDetailsModal, BankReconciliationScreen, ReskontroDesktopScreen, ReconciliationScreen };
