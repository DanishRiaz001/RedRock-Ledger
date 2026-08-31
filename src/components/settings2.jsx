import React, { useState, useMemo, useEffect, useRef } from "react";
import { T, SERIES, getSK, inp, btnRed, btnGhost, btnSm } from "../lib/theme.js";
import { isIncomeSK, isExpenseSK, accountsForSK, fmt, fmtRs, fmtB, getAnthropicKey, openHtmlInNewTab } from "../lib/utils.js";
import { sb } from "../lib/supabaseClient.js";
import { Card, BackHeader, Menu3, AccDropFlat, SaveFlashButton, hasBudgetMoved, markBudgetMoved, signRs, getBugs, saveBugsRaw, logBug } from "./ledger.jsx";
import { ResizableSplit, SignedFileViewer, UploadDropModal } from "./shell.jsx";
import { AccLedgerTable } from "./invoicing.jsx";

function BalanceListsScreen({contacts,transactions,employees=[]}){
  const[type,setType]=useState("customer");
  const rows=useMemo(()=>{
    if(type==="employee")return employees.map(e=>({name:e.name,detail:e.role||"",balance:null}));
    const code=type==="customer"?"1500":"2400";
    const inBucket=cc=>getSK(cc)===code;
    return contacts.filter(c=>c.type===type).map(c=>{
      const bal=transactions.filter(t=>t.contactId===c.id&&(inBucket(t.debitCode)||inBucket(t.creditCode))&&!(t.matchedWith&&t.matchedAccount===code)).reduce((s,t)=>s+(inBucket(t.debitCode)?t.amount:-t.amount),0);
      return{name:c.name,detail:c.email||c.phone||"",balance:bal};
    }).filter(r=>Math.abs(r.balance)>=1).sort((a,b)=>b.balance-a.balance);
  },[contacts,transactions,employees,type]);

  return(
    <div style={{maxWidth:800}}>
      <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 16px"}}>Balance lists</h1>
      <div style={{display:"flex",gap:6,marginBottom:16}}>
        {[["customer","Customers"],["supplier","Suppliers"],["employee","Employees"]].map(([id,label])=>(
          <button key={id} onClick={()=>setType(id)} style={{background:type===id?T.accent:"none",color:type===id?"#fff":T.sub,border:`1px solid ${type===id?T.accent:T.border}`,borderRadius:7,padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{label}</button>
        ))}
      </div>
      <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
        <table style={{width:"100%",fontSize:13,borderCollapse:"collapse"}}>
          <thead><tr style={{background:T.bg,color:T.sub}}><td style={{padding:"10px 16px",fontWeight:700}}>Name</td><td style={{fontWeight:700}}>{type==="employee"?"Role":"Contact"}</td>{type!=="employee"&&<td style={{textAlign:"right",fontWeight:700,padding:"10px 16px"}}>Balance</td>}</tr></thead>
          <tbody>
            {rows.map((r,i)=>(
              <tr key={i} style={{borderBottom:`1px solid ${T.border}`}}>
                <td style={{padding:"10px 16px",color:T.text,fontWeight:600}}>{r.name}</td>
                <td style={{color:T.sub,fontSize:12}}>{r.detail||"—"}</td>
                {type!=="employee"&&<td style={{textAlign:"right",padding:"10px 16px",fontWeight:700,color:r.balance>=0?T.text:T.red}}>{fmt(r.balance)}</td>}
              </tr>
            ))}
            {!rows.length&&<tr><td colSpan="3" style={{padding:"24px 0",textAlign:"center",color:T.muted}}>Nothing to show.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportsScreen({accounts,transactions,getName,filterFrom,filterTo,onChangePeriod,sinkingFunds=[],budgets=[],isDesktop=false}){
  const[rTab,setRTab]=useState("resultat");
  const[rFrom,setRFrom]=useState(filterFrom);
  const[rTo,setRTo]=useState(filterTo);
  const[periodPickerOpen,setPeriodPickerOpen]=useState(false);
  const[selAcc,setSelAcc]=useState("");

  // Sync when global period changes
  useEffect(()=>{setRFrom(filterFrom);setRTo(filterTo);},[filterFrom,filterTo]);

  const rTxns=useMemo(()=>transactions.filter(t=>t.date>=rFrom&&t.date<=rTo),[transactions,rFrom,rTo]);
  const activeRTxns=useMemo(()=>rTxns.filter(t=>!t.reversedBy&&!t.reversalOf),[rTxns]);
  // NS 4102: income = credit on 3xxx + 8000; expenses = debit on 4xxx–7xxx + 8100 + 8800
  const INCOME_SERIES=new Set(["3000","3900","8000"]);
  const EXPENSE_SERIES=new Set(["4000","5000","6000","7000","7100","7200","7300","7400","7500","7600","7700","7800","7900","8100","8200","8300","8800"]);
  const income=useMemo(()=>{const m={};activeRTxns.forEach(t=>{if(INCOME_SERIES.has(getSK(t.creditCode))){m[t.creditCode]=(m[t.creditCode]||0)+t.amount;}});return m;},[activeRTxns]);
  const expenses=useMemo(()=>{const m={};activeRTxns.forEach(t=>{if(EXPENSE_SERIES.has(getSK(t.debitCode))){m[t.debitCode]=(m[t.debitCode]||0)+t.amount;}});return m;},[activeRTxns]);
  const totalInc=Object.values(income).reduce((s,v)=>s+v,0);
  const totalExp=Object.values(expenses).reduce((s,v)=>s+v,0);

  // Analytics — top expenses, 6-month trend, and smart suggestions. Hoisted
  // here (not nested in the render IIFE) so both mobile and desktop views
  // can use the same computation without duplicating it.
  const analyticsData=useMemo(()=>{
    const expMap={};
    transactions.filter(t=>t.date>=rFrom&&t.date<=rTo&&!t.reversedBy&&!t.reversalOf&&isExpenseSK(t.debitCode)).forEach(t=>{
      expMap[t.debitCode]=(expMap[t.debitCode]||0)+t.amount;
    });
    const topExp=Object.entries(expMap).sort((a,b)=>b[1]-a[1]).slice(0,6);
    const maxExp=topExp.length?topExp[0][1]:1;

    const months=[];
    for(let i=5;i>=0;i--){
      const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);
      const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,"0");
      const from=`${y}-${m}-01`;
      const last=new Date(y,d.getMonth()+1,0).getDate();
      const to=`${y}-${m}-${String(last).padStart(2,"0")}`;
      const inc=transactions.filter(t=>t.date>=from&&t.date<=to&&!t.reversedBy&&!t.reversalOf&&isIncomeSK(t.creditCode)).reduce((s,t)=>s+t.amount,0);
      const exp=transactions.filter(t=>t.date>=from&&t.date<=to&&!t.reversedBy&&!t.reversalOf&&isExpenseSK(t.debitCode)).reduce((s,t)=>s+t.amount,0);
      months.push({label:d.toLocaleString("default",{month:"short"}),inc,exp,net:inc-exp});
    }
    const maxBar=Math.max(...months.map(m=>Math.max(m.inc,m.exp)),1);

    const sfFunds2=sinkingFunds||[];
    const rPeriodDate=new Date(rFrom);
    const rY=rPeriodDate.getFullYear(),rM=rPeriodDate.getMonth();
    const budgets2={};
    (budgets||[]).filter(b=>b.year===rY&&b.month===rM).forEach(b=>{budgets2[b.code]=b.amount;});
    const totalInc2=transactions.filter(t=>t.date>=rFrom&&t.date<=rTo&&!t.reversedBy&&!t.reversalOf&&isIncomeSK(t.creditCode)).reduce((s,t)=>s+t.amount,0);
    const totalExp2=Object.values(expMap).reduce((s,v)=>s+v,0);
    const expRatio=totalInc2>0?(totalExp2/totalInc2)*100:0;

    const suggestions=[];
    if(expRatio>80&&totalInc2>0) suggestions.push({icon:"⚠️",color:"#a32d2d",bg:"#fcebeb",text:`Expenses are ${Math.round(expRatio)}% of income this period — leaving little margin. Consider reducing top spending categories.`});
    if(months.length>=2){
      const last2=months[months.length-1];const prev2=months[months.length-2];
      if(prev2.exp>0&&last2.exp>prev2.exp*1.2) suggestions.push({icon:"📈",color:"#854f0b",bg:"#faeeda",text:`Expenses rose ${Math.round(((last2.exp-prev2.exp)/prev2.exp)*100)}% last month vs the month before. Review new or unusual charges.`});
      if(prev2.inc>0&&last2.inc<prev2.inc*0.8) suggestions.push({icon:"📉",color:"#a32d2d",bg:"#fcebeb",text:`Income dropped ${Math.round(((prev2.inc-last2.inc)/prev2.inc)*100)}% last month. Investigate if receivables are delayed.`});
    }
    if(topExp.length&&totalInc2>0&&topExp[0][1]/totalInc2>0.4) suggestions.push({icon:"💡",color:"#854f0b",bg:"#faeeda",text:`"${getName(topExp[0][0])}" alone accounts for ${Math.round((topExp[0][1]/totalInc2)*100)}% of income — highest single expense category.`});
    const sfAtRisk=sfFunds2.filter(f=>{if(!f.months||f.months<=0)return false;const needed=Math.ceil((f.goal-(f.saved||0))/f.months);const totalMonthly2=sfFunds2.reduce((s,x)=>{if(!x.months||x.months<=0)return s;return s+Math.ceil((x.goal-(x.saved||0))/x.months);},0);return needed>totalMonthly2*0.5;});
    if(sfAtRisk.length) suggestions.push({icon:"🎯",color:"#7c3aed",bg:"#ede9fe",text:`${sfAtRisk.length} sinking fund${sfAtRisk.length>1?"s":""} (${sfAtRisk.map(f=>f.name).join(", ")}) behind schedule. Increase monthly contributions.`});
    const overBudget=Object.entries(budgets2).filter(([code,b])=>{if(!b)return false;const act=transactions.filter(t=>t.date>=rFrom&&t.date<=rTo&&t.debitCode===code).reduce((s,t)=>s+t.amount,0);return act>b;});
    if(overBudget.length) suggestions.push({icon:"💰",color:"#a32d2d",bg:"#fcebeb",text:`${overBudget.length} budget${overBudget.length>1?"s are":" is"} over limit: ${overBudget.map(([c])=>getName(c)).join(", ")}.`});

    return{topExp,maxExp,months,maxBar,suggestions};
  },[transactions,rFrom,rTo,sinkingFunds,budgets]);

  const exportCSV=(rows,filename)=>{
    const csv=rows.map(r=>r.join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=filename;a.click();
  };

  const exportResultatXLSX=()=>{
    if(typeof XLSX==="undefined")return;
    const wb=XLSX.utils.book_new();
    const rows=[["Account","Name","Amount (PKR)"],
      ...Object.entries(income).map(([c,a])=>[c,getName(c),a]),
      ["","Total Income",totalInc],
      ...Object.entries(expenses).map(([c,a])=>[c,getName(c),-a]),
      ["","Total Expenses",-totalExp],
      ["","Net P/L",totalInc-totalExp]
    ];
    const ws=XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb,ws,"Resultat");
    XLSX.writeFile(wb,`IncomeStatement_${rFrom}_${rTo}.xlsx`);
  };

  const exportBalanseXLSX=()=>{
    if(typeof XLSX==="undefined")return;
    const wb=XLSX.utils.book_new();
    const rows=[["Code","Account","Balance (PKR)"]];
    accounts.forEach(a=>{
      const bal=transactions.reduce((s,t)=>{if(t.debitCode===a.code)return s+t.amount;if(t.creditCode===a.code)return s-t.amount;return s;},0);
      rows.push([a.code,a.name,bal]);
    });
    const ws=XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb,ws,"Balance Sheet");
    XLSX.writeFile(wb,`Balance Sheet_${rTo}.xlsx`);
  };

  const exportResultat=()=>{
    const rows=[["Code","Account","Amount (PKR)"],
      ["","=== INCOME ===",""],
      ...Object.entries(income).map(([c,a])=>[c,getName(c),a]),
      ["","TOTAL INCOME",totalInc],
      ["","",""],
      ["","=== EXPENSES ===",""],
      ...Object.entries(expenses).map(([c,a])=>[c,getName(c),-a]),
      ["","TOTAL EXPENSES",-totalExp],
      ["","",""],
      ["","NET PROFIT / LOSS",totalInc-totalExp],
    ];
    exportCSV(rows,`IncomeStatement_${rFrom}_${rTo}.csv`);
  };

  const exportBalanse=()=>{
    const rows=[["Code","Account","Balance (PKR)"]];
    let grandTotal=0;
    Object.entries(SERIES).forEach(([key,s])=>{
      const grp=accounts.filter(a=>getSK(a.code)===key);
      if(!grp.length)return;
      rows.push(["",`=== ${s.name.toUpperCase()} ===`,""]);
      let groupTotal=0;
      grp.forEach(a=>{
        const bal=transactions.reduce((ss,t)=>{if(t.debitCode===a.code)return ss+t.amount;if(t.creditCode===a.code)return ss-t.amount;return ss;},0);
        rows.push([a.code,a.name,bal]);
        groupTotal+=bal;
      });
      rows.push(["",`Total ${s.name}`,groupTotal]);
      rows.push(["","",""]);
      grandTotal+=groupTotal;
    });
    rows.push(["","GRAND TOTAL",grandTotal]);
    exportCSV(rows,`Balance Sheet_${rTo}.csv`);
  };

  const exportAccLedger=()=>{
    if(!selAcc)return;
    const rows=[["Date","Bilag","Description","Amount (PKR)"]];
    let total=0;
    const accTxns=transactions.filter(t=>t.date>=rFrom&&t.date<=rTo&&(t.debitCode===selAcc||t.creditCode===selAcc)).sort((a,b)=>a.date.localeCompare(b.date));
    accTxns.forEach(t=>{
      const mv=t.debitCode===selAcc?t.amount:-t.amount;
      total+=mv;
      rows.push([t.date,fmtB(t.bilag),t.description,(mv>=0?"+":"-")+Math.abs(mv)]);
    });
    rows.push(["","","TOTAL",(total>=0?"+":"-")+Math.abs(total)]);
    exportCSV(rows,`${getName(selAcc)}_${rFrom}_${rTo}.csv`);
  };

  const printPDF=(title,htmlContent)=>{
    const html=`<!DOCTYPE html><html><head><title>${title}</title><style>
      body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:30px;}
      h1{font-size:18px;font-weight:bold;margin-bottom:4px;}
      .sub{font-size:11px;color:#666;margin-bottom:20px;}
      table{width:100%;border-collapse:collapse;margin-top:12px;}
      th{background:#1A1A2E;color:#fff;padding:7px 10px;text-align:left;font-size:11px;font-weight:bold;}
      td{padding:6px 10px;border-bottom:1px solid #eee;font-size:11px;}
      tr:nth-child(even) td{background:#f9f9f9;}
      .right{text-align:right;}
      .total-row td{font-weight:bold;border-top:2px solid #ccc;background:#f0f0f0;}
      .section-hdr{background:#E8ECF0;font-weight:bold;font-size:11px;padding:6px 10px;margin-top:16px;}
      .net-box{background:#E6F6F1;border:1px solid #9FE1CB;padding:10px 14px;display:flex;justify-content:space-between;margin-top:12px;border-radius:6px;}
      .net-box span:last-child{font-weight:bold;font-size:14px;color:#0F6E56;}
      .btn-bar{display:flex;gap:10px;margin-top:24px;}
      @media print{body{margin:10px;} .btn-bar{display:none;}}
    </style></head><body>${htmlContent}
    <div class="btn-bar">
      <button onclick="window.print()" style="padding:8px 18px;background:#1A1A2E;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">🖨 Print / Save as PDF</button>
      <button onclick="window.close()" style="padding:8px 18px;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer;font-size:13px;">← Close</button>
    </div>
    <script>window.onload=function(){window.print();};</script>
    </body></html>`;
    openHtmlInNewTab(html);
  };

  const exportResultatPDF=()=>{
    const rows=`
      <h1>Income Statement</h1>
      <div class="sub">Period: ${rFrom} → ${rTo} &nbsp;|&nbsp; Generated: ${new Date().toLocaleDateString()}</div>
      <div class="section-hdr">Income (3000–3999, 8000–8099)</div>
      <table><thead><tr><th>Code</th><th>Account</th><th class="right">Amount (PKR)</th></tr></thead><tbody>
      ${Object.entries(income).sort((a,b)=>a[0].localeCompare(b[0])).map(([c,a])=>`<tr><td>${c}</td><td>${getName(c)}</td><td class="right">+${fmtRs(a)}</td></tr>`).join("")}
      <tr class="total-row"><td></td><td>Total Income</td><td class="right">+${fmtRs(totalInc)}</td></tr>
      </tbody></table>
      <div class="section-hdr" style="margin-top:16px;">Expenses (4000–8199, 8800–8999)</div>
      <table><thead><tr><th>Code</th><th>Account</th><th class="right">Amount (PKR)</th></tr></thead><tbody>
      ${Object.entries(expenses).sort((a,b)=>a[0].localeCompare(b[0])).map(([c,a])=>`<tr><td>${c}</td><td>${getName(c)}</td><td class="right">−${fmtRs(a)}</td></tr>`).join("")}
      <tr class="total-row"><td></td><td>Total Expenses</td><td class="right">−${fmtRs(totalExp)}</td></tr>
      </tbody></table>
      <div class="net-box"><span>Net Profit / Loss</span><span>${signRs(totalInc-totalExp)}</span></div>`;
    printPDF(`Income Statement ${rFrom} to ${rTo}`,rows);
  };

  const exportBalansePDF=()=>{
    let rows=`<h1>Balance Sheet</h1><div class="sub">As of: ${rTo} &nbsp;|&nbsp; Generated: ${new Date().toLocaleDateString()}</div>`;
    Object.entries(SERIES).forEach(([key,s])=>{
      const grp=accounts.filter(a=>getSK(a.code)===key);
      if(!grp.length)return;
      const total=grp.reduce((sum,a)=>sum+transactions.reduce((ss,t)=>{if(t.debitCode===a.code)return ss+t.amount;if(t.creditCode===a.code)return ss-t.amount;return ss;},0),0);
      rows+=`<div class="section-hdr">${s.name}</div><table><thead><tr><th>Code</th><th>Account</th><th class="right">Balance (PKR)</th></tr></thead><tbody>`;
      grp.forEach(a=>{
        const bal=transactions.reduce((ss,t)=>{if(t.debitCode===a.code)return ss+t.amount;if(t.creditCode===a.code)return ss-t.amount;return ss;},0);
        rows+=`<tr><td>${a.code}</td><td>${a.name}</td><td class="right">${signRs(bal)}</td></tr>`;
      });
      rows+=`<tr class="total-row"><td></td><td>Total ${s.name}</td><td class="right">${signRs(total)}</td></tr></tbody></table>`;
    });
    printPDF(`Balance Sheet ${rTo}`,rows);
  };

  const exportAccLedgerPDF=()=>{
    if(!selAcc)return;
    const accTxns=transactions.filter(t=>t.date>=rFrom&&t.date<=rTo&&(t.debitCode===selAcc||t.creditCode===selAcc)).sort((a,b)=>a.date.localeCompare(b.date));
    let total=0;
    let tRows=accTxns.map(t=>{
      const mv=t.debitCode===selAcc?t.amount:-t.amount;
      total+=mv;
      const color=mv>=0?"#00875A":"#0D7377";
      return`<tr><td>${t.date}</td><td>${fmtB(t.bilag)}</td><td>${t.description}</td><td class="right" style="color:${color};font-weight:700;">${mv>=0?"+":"-"}${fmtRs(Math.abs(mv))}</td></tr>`;
    }).join("");
    const totalColor=total>=0?"#00875A":"#0D7377";
    const accName=getName(selAcc);
    const html=`<h1>${accName}</h1>
      <div class="sub">Period: ${rFrom} → ${rTo} &nbsp;|&nbsp; Generated: ${new Date().toLocaleDateString()}</div>
      <table><thead><tr><th>Date</th><th>Ref No</th><th>Description</th><th class="right">Amount (PKR)</th></tr></thead>
      <tbody>
        ${tRows}
        ${!accTxns.length?'<tr><td colspan="4" style="text-align:center;color:#888;padding:20px;">No transactions in this period</td></tr>':""}
        <tr class="total-row"><td></td><td></td><td>TOTAL</td><td class="right" style="color:${totalColor};">${total>=0?"+":"-"}${fmtRs(Math.abs(total))}</td></tr>
      </tbody></table>`;
    printPDF(`${accName} ${rFrom} to ${rTo}`,html);
  };

  const TAB_STYLE=(active)=>({padding:"8px 16px",fontSize:12,fontWeight:active?800:600,color:active?"#fff":T.sub,background:active?T.blue:"transparent",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit"});

  if(isDesktop){
    const{topExp,maxExp,months,maxBar,suggestions}=analyticsData;
    const periodLabel=rFrom&&rTo?`${rFrom} – ${rTo}`:"Select period";
    return(
      <div style={{maxWidth:1000}}>
        {periodPickerOpen&&(
          <PeriodPickerModal initialFrom={rFrom} initialTo={rTo} onApply={(f,t)=>{setRFrom(f);setRTo(t);if(onChangePeriod)onChangePeriod(f,t);setPeriodPickerOpen(false);}} onClose={()=>setPeriodPickerOpen(false)}/>
        )}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
          <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Analytics</h1>
          <button onClick={()=>setPeriodPickerOpen(true)} style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 14px",fontSize:12,fontWeight:700,color:T.text,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6}}><i className="ti ti-calendar" style={{fontSize:13}}/>{periodLabel}</button>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:20}}>
          {[["resultat","Income statement"],["balanse","Balance sheet"],["account","Account ledger"],["analytics","Trends & insights"]].map(([id,label])=>(
            <button key={id} onClick={()=>setRTab(id)} style={{background:rTab===id?T.accent:"none",color:rTab===id?"#fff":T.sub,border:`1px solid ${rTab===id?T.accent:T.border}`,borderRadius:8,padding:"8px 16px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{label}</button>
          ))}
        </div>

        {rTab==="resultat"&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(340px, 1fr))",gap:20}}>
            <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:T.radius.xl,padding:20}}>
              <div style={{fontSize:11,fontWeight:800,color:T.waterTeal,textTransform:"uppercase",letterSpacing:0.5,marginBottom:14}}>Income</div>
              {Object.entries(income).map(([c,a])=>(
                <div key={c} onClick={()=>{setRTab("account");setSelAcc(c);}} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${T.border}`,cursor:"pointer"}}>
                  <span style={{fontSize:13,color:T.text}}>{c} · {getName(c)}</span>
                  <span style={{fontSize:13,fontWeight:700,color:T.waterTeal}}>+{fmtRs(a)}</span>
                </div>
              ))}
              {!Object.keys(income).length&&<div style={{fontSize:12,color:T.muted,padding:"8px 0"}}>No income entries this period.</div>}
              <div style={{display:"flex",justifyContent:"space-between",marginTop:12,paddingTop:12,borderTop:`2px solid ${T.border}`,fontWeight:800}}>
                <span style={{fontSize:13,color:T.text}}>Total income</span><span style={{fontSize:14,color:T.waterTeal}}>+{fmtRs(totalInc)}</span>
              </div>
            </div>
            <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:T.radius.xl,padding:20}}>
              <div style={{fontSize:11,fontWeight:800,color:T.accent,textTransform:"uppercase",letterSpacing:0.5,marginBottom:14}}>Expenses</div>
              {Object.entries(expenses).map(([c,a])=>(
                <div key={c} onClick={()=>{setRTab("account");setSelAcc(c);}} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${T.border}`,cursor:"pointer"}}>
                  <span style={{fontSize:13,color:T.text}}>{c} · {getName(c)}</span>
                  <span style={{fontSize:13,fontWeight:700,color:T.accent}}>−{fmtRs(a)}</span>
                </div>
              ))}
              {!Object.keys(expenses).length&&<div style={{fontSize:12,color:T.muted,padding:"8px 0"}}>No expense entries this period.</div>}
              <div style={{display:"flex",justifyContent:"space-between",marginTop:12,paddingTop:12,borderTop:`2px solid ${T.border}`,fontWeight:800}}>
                <span style={{fontSize:13,color:T.text}}>Total expenses</span><span style={{fontSize:14,color:T.accent}}>−{fmtRs(totalExp)}</span>
              </div>
            </div>
            <div style={{gridColumn:"1/-1",background:totalInc-totalExp>=0?T.waterTealSubtle:T.accentLight,borderRadius:T.radius.xl,padding:"18px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:14,fontWeight:700,color:T.text}}>Net profit / loss — {rFrom} to {rTo}</span>
              <span style={{fontSize:24,fontWeight:900,color:totalInc-totalExp>=0?T.waterTeal:T.accent}}>{signRs(totalInc-totalExp)}</span>
            </div>
          </div>
        )}

        {rTab==="balanse"&&(
          <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:T.radius.xl,overflow:"hidden"}}>
            {Object.entries(SERIES).map(([key,s])=>{
              const grp=accountsForSK(accounts,transactions,key);
              if(!grp.length)return null;
              const balAsOf=code=>transactions.filter(t=>t.date<=rTo).reduce((ss,t)=>{if(t.debitCode===code)return ss+t.amount;if(t.creditCode===code)return ss-t.amount;return ss;},0);
              const nonZero=grp.filter(a=>balAsOf(a.code)!==0);
              if(!nonZero.length)return null;
              const total=nonZero.reduce((sum,a)=>sum+balAsOf(a.code),0);
              return(
                <div key={key} style={{borderBottom:`1px solid ${T.border}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 20px",background:T.bg}}>
                    <div style={{fontSize:12,fontWeight:700,color:T.text,textTransform:"uppercase",letterSpacing:0.4}}>{s.icon} {s.name}</div>
                    <div style={{fontSize:13,fontWeight:800,color:total>=0?T.waterTeal:T.accent}}>{signRs(total)}</div>
                  </div>
                  {nonZero.map(a=>(
                    <div key={a.code} onClick={()=>{setRTab("account");setSelAcc(a.code);}} style={{display:"flex",justifyContent:"space-between",padding:"8px 20px 8px 34px",cursor:"pointer",fontSize:12}} className="rr-sidebar-item">
                      <span style={{color:T.text}}>{a.code} · {a.name}</span>
                      <span style={{fontWeight:600,color:T.text}}>{signRs(balAsOf(a.code))}</span>
                    </div>
                  ))}
                </div>
              );
            })}
            <div style={{padding:"10px 20px",fontSize:10,color:T.muted,background:T.bg}}>Balances as of {rTo} — change the period above to see a different date.</div>
          </div>
        )}

        {rTab==="account"&&(
          <div>
            <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:T.radius.xl,padding:16,marginBottom:16,maxWidth:400}}>
              <AccDropFlat value={selAcc} onChange={setSelAcc} accounts={accounts}/>
            </div>
            <AccLedgerTable selAcc={selAcc} transactions={transactions} rFrom={rFrom} rTo={rTo} getName={getName}/>
          </div>
        )}

        {rTab==="analytics"&&(
          <div style={{display:"flex",flexDirection:"column",gap:20}}>
            <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:T.radius.xl,padding:20}}>
              <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:2}}>Income & expenses — last 6 months</div>
              <div style={{fontSize:11,color:T.muted,marginBottom:18}}>Watch the shape, not just the numbers</div>
              <div style={{display:"flex",gap:10,alignItems:"flex-end",height:140,marginBottom:10}}>
                {months.map((m,i)=>(
                  <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                    <div style={{width:"100%",display:"flex",gap:3,alignItems:"flex-end",height:110}}>
                      <div style={{flex:1,background:T.waterTeal,borderRadius:"4px 4px 0 0",height:`${Math.round((m.inc/maxBar)*110)}px`,minHeight:m.inc?3:0}}/>
                      <div style={{flex:1,background:T.accent,borderRadius:"4px 4px 0 0",height:`${Math.round((m.exp/maxBar)*110)}px`,minHeight:m.exp?3:0}}/>
                    </div>
                    <div style={{fontSize:11,color:T.muted,fontWeight:600}}>{m.label}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:20,justifyContent:"center",marginBottom:16}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:10,height:10,background:T.waterTeal,borderRadius:3}}/><span style={{fontSize:12,color:T.sub}}>Income</span></div>
                <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:10,height:10,background:T.accent,borderRadius:3}}/><span style={{fontSize:12,color:T.sub}}>Expenses</span></div>
              </div>
              <div style={{borderTop:`1px solid ${T.border}`,paddingTop:14,display:"flex",flexDirection:"column",gap:8}}>
                {months.slice(-3).map((m,i,arr)=>{
                  const prev=arr[i-1];
                  const chg=prev&&prev.net!==0?Math.round(((m.net-prev.net)/Math.abs(prev.net))*100):null;
                  return(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:13,fontWeight:600,color:T.text}}>{m.label}</span>
                      <div style={{display:"flex",gap:16,alignItems:"center"}}>
                        <span style={{fontSize:12,color:T.waterTeal}}>+{fmtRs(m.inc)}</span>
                        <span style={{fontSize:12,color:T.accent}}>−{fmtRs(m.exp)}</span>
                        <span style={{fontSize:13,fontWeight:800,color:m.net>=0?T.waterTeal:T.accent,minWidth:90,textAlign:"right"}}>{signRs(m.net)}</span>
                        {chg!==null&&<span style={{fontSize:10,fontWeight:700,color:chg>=0?T.waterTeal:T.accent,background:chg>=0?T.waterTealSubtle:T.accentLight,borderRadius:8,padding:"2px 8px"}}>{chg>=0?"+":""}{chg}%</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(340px, 1fr))",gap:20}}>
              <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:T.radius.xl,padding:20}}>
                <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:16}}>Top expenses — {rFrom.slice(0,7)}</div>
                {topExp.length?topExp.map(([c,a])=>(
                  <div key={c} style={{marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                      <span style={{fontSize:12,color:T.text,fontWeight:600}}>{getName(c)}</span>
                      <span style={{fontSize:12,fontWeight:700,color:T.accent}}>{fmtRs(a)}</span>
                    </div>
                    <div style={{background:T.bg,borderRadius:5,height:7,overflow:"hidden"}}>
                      <div style={{width:`${Math.round((a/maxExp)*100)}%`,height:"100%",background:T.accent,borderRadius:5}}/>
                    </div>
                  </div>
                )):<div style={{fontSize:13,color:T.muted,padding:"10px 0"}}>No expense data for this period.</div>}
              </div>

              <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:T.radius.xl,padding:20}}>
                <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:16}}>Insights & alerts</div>
                {suggestions.length>0?(
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {suggestions.map((s,i)=>(
                      <div key={i} style={{background:s.bg,borderRadius:10,padding:"11px 13px",display:"flex",gap:10,alignItems:"flex-start"}}>
                        <span style={{fontSize:15,flexShrink:0}}>{s.icon}</span>
                        <span style={{fontSize:12,color:s.color,lineHeight:1.5}}>{s.text}</span>
                      </div>
                    ))}
                  </div>
                ):(
                  <div style={{textAlign:"center",padding:"16px 0"}}>
                    <div style={{fontSize:22,marginBottom:6}}>✅</div>
                    <div style={{fontSize:13,fontWeight:700,color:T.waterTeal}}>Looking good</div>
                    <div style={{fontSize:11,color:T.muted,marginTop:3}}>No issues detected for this period.</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return(
    <div>
      {periodPickerOpen&&(
        <PeriodPickerModal initialFrom={rFrom} initialTo={rTo} onApply={(f,t)=>{setRFrom(f);setRTo(t);if(onChangePeriod)onChangePeriod(f,t);setPeriodPickerOpen(false);}} onClose={()=>setPeriodPickerOpen(false)}/>
      )}
      <button onClick={()=>setPeriodPickerOpen(true)} style={{width:"100%",background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,padding:"9px 12px",fontSize:12,fontWeight:700,color:T.text,cursor:"pointer",fontFamily:"inherit",marginBottom:10,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><i className="ti ti-calendar" style={{fontSize:13}}/>{rFrom} – {rTo}</button>
      {/* Tab switcher */}
      <div style={{display:"flex",gap:3,background:T.bg,borderRadius:10,padding:4,marginBottom:14,border:`1px solid ${T.border}`}}>
        {[["resultat","📈 P&L"],["balanse","⚖️ Balanse"],["account","📋 Account"],["analytics","📊 Analytics"]].map(([id,label])=>(
          <button key={id} onClick={()=>setRTab(id)} style={{...TAB_STYLE(rTab===id),flex:1,borderRadius:7,padding:"7px 2px",fontSize:9}}>{label}</button>
        ))}
      </div>

      {/* Resultat (P&L) */}
      {rTab==="resultat"&&(
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:14,fontWeight:800}}>Income Statement</div>
            <Menu3 items={[
              {icon:"📄",label:"Export CSV",action:exportResultat},
              {icon:"📗",label:"Export Excel",action:exportResultatXLSX},
              {icon:"📕",label:"Export PDF",action:exportResultatPDF},
            ]}/>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:10,color:T.green,fontWeight:800,marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>Income</div>
            {Object.entries(income).map(([code,amt])=>(<div key={code} style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:5,paddingLeft:8}}><span style={{color:T.sub}}>{code} · {getName(code)}</span><span style={{fontWeight:700,color:T.green}}>+{fmtRs(amt)}</span></div>))}
            {!Object.keys(income).length&&<div style={{fontSize:12,color:T.muted,paddingLeft:8}}>No income entries</div>}
            <div style={{display:"flex",justifyContent:"space-between",fontWeight:800,fontSize:13,color:T.green,borderTop:`1px solid ${T.border}`,paddingTop:8,marginTop:8}}><span>Total Income</span><span>+{fmtRs(totalInc)}</span></div>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:10,color:T.orange,fontWeight:800,marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>Expenses</div>
            {Object.entries(expenses).map(([code,amt])=>(<div key={code} style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:5,paddingLeft:8}}><span style={{color:T.sub}}>{code} · {getName(code)}</span><span style={{fontWeight:700,color:T.orange}}>−{fmtRs(amt)}</span></div>))}
            {!Object.keys(expenses).length&&<div style={{fontSize:12,color:T.muted,paddingLeft:8}}>No expense entries</div>}
            <div style={{display:"flex",justifyContent:"space-between",fontWeight:800,fontSize:13,color:T.orange,borderTop:`1px solid ${T.border}`,paddingTop:8,marginTop:8}}><span>Total Expenses</span><span>−{fmtRs(totalExp)}</span></div>
          </div>
          <div style={{background:totalInc-totalExp>=0?T.greenBg:T.redLight,borderRadius:10,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:13,fontWeight:700}}>Net Profit / Loss</span>
            <span style={{fontSize:20,fontWeight:900,color:totalInc-totalExp>=0?T.green:T.red}}>{signRs(totalInc-totalExp)}</span>
          </div>
        </Card>
      )}

      {/* Balance Sheet */}
      {rTab==="balanse"&&(
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:14,fontWeight:800}}>Balance Sheet</div>
            <Menu3 items={[
              {icon:"📄",label:"Export CSV",action:exportBalanse},
              {icon:"📗",label:"Export Excel",action:exportBalanseXLSX},
              {icon:"📕",label:"Export PDF",action:exportBalansePDF},
            ]}/>
          </div>
          {Object.entries(SERIES).map(([key,s])=>{
            const grp=accountsForSK(accounts,transactions,key);
            if(!grp.length)return null;
            const balAsOf=code=>transactions.filter(t=>t.date<=rTo).reduce((ss,t)=>{if(t.debitCode===code)return ss+t.amount;if(t.creditCode===code)return ss-t.amount;return ss;},0);
            const nonZero=grp.filter(a=>balAsOf(a.code)!==0);
            if(!nonZero.length)return null;
            const total=nonZero.reduce((sum,a)=>sum+balAsOf(a.code),0);
            return(
              <div key={key} style={{marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div style={{fontSize:11,color:s.color,fontWeight:800,textTransform:"uppercase",letterSpacing:0.5}}>{s.icon} {s.name}</div>
                  <div style={{fontSize:12,fontWeight:800,color:total>=0?T.green:T.red}}>{signRs(total)}</div>
                </div>
                {nonZero.map(a=>(
                  <div key={a.code} style={{display:"flex",justifyContent:"space-between",fontSize:12,paddingLeft:12,paddingBottom:5,color:T.sub}}>
                    <span>{a.code} · {a.name}</span>
                    <span style={{fontWeight:700,color:balAsOf(a.code)>=0?T.green:T.red}}>{signRs(balAsOf(a.code))}</span>
                  </div>
                ))}
                <div style={{height:1,background:T.border,marginTop:4}}/>
              </div>
            );
          })}
        </Card>
      )}

      {/* Account Ledger */}
      {rTab==="account"&&(
        <div>
          <Card style={{marginBottom:12}}>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <div style={{flex:1}}>
                <AccDropFlat value={selAcc} onChange={setSelAcc} accounts={accounts}/>
              </div>
              {selAcc&&<div style={{flexShrink:0}}><Menu3 items={[
                {icon:"📄",label:"Export CSV",action:exportAccLedger},
                {icon:"📕",label:"Export PDF",action:exportAccLedgerPDF},
              ]}/></div>}
            </div>
          </Card>
          <AccLedgerTable selAcc={selAcc} transactions={transactions} rFrom={rFrom} rTo={rTo} getName={getName}/>
        </div>
      )}

      {rTab==="analytics"&&(()=>{
        const{topExp,maxExp,months,maxBar,suggestions}=analyticsData;
        return(
          <div>
            {/* Overall expense graph */}
            <Card style={{marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:800,color:T.text,marginBottom:4}}>Overall Income & Expenses</div>
              <div style={{fontSize:11,color:T.muted,marginBottom:14}}>Last 6 months</div>
              <div style={{display:"flex",gap:6,alignItems:"flex-end",height:100,marginBottom:8}}>
                {months.map((m,i)=>(
                  <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                    <div style={{width:"100%",display:"flex",gap:2,alignItems:"flex-end",height:80}}>
                      <div style={{flex:1,background:T.accent,borderRadius:"3px 3px 0 0",height:`${Math.round((m.inc/maxBar)*80)}px`,minHeight:m.inc?2:0,transition:"height 0.3s"}}/>
                      <div style={{flex:1,background:T.orange,borderRadius:"3px 3px 0 0",height:`${Math.round((m.exp/maxBar)*80)}px`,minHeight:m.exp?2:0,transition:"height 0.3s"}}/>
                    </div>
                    <div style={{fontSize:9,color:T.muted,fontWeight:600}}>{m.label}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:14,justifyContent:"center",marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:10,height:10,background:T.accent,borderRadius:2}}/><span style={{fontSize:10,color:T.sub}}>Income</span></div>
                <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:10,height:10,background:T.orange,borderRadius:2}}/><span style={{fontSize:10,color:T.sub}}>Expenses</span></div>
              </div>
              {/* MoM table */}
              <div style={{borderTop:`1px solid ${T.border}`,paddingTop:12}}>
                {months.slice(-3).map((m,i,arr)=>{
                  const prev=arr[i-1];
                  const chg=prev&&prev.net!==0?Math.round(((m.net-prev.net)/Math.abs(prev.net))*100):null;
                  return(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                      <span style={{fontSize:12,fontWeight:600,color:T.sub}}>{m.label}</span>
                      <div style={{display:"flex",gap:12,alignItems:"center"}}>
                        <span style={{fontSize:11,color:T.green}}>+{fmtRs(m.inc)}</span>
                        <span style={{fontSize:11,color:T.orange}}>-{fmtRs(m.exp)}</span>
                        <span style={{fontSize:12,fontWeight:800,color:m.net>=0?T.green:T.red}}>{signRs(m.net)}</span>
                        {chg!==null&&<span style={{fontSize:10,fontWeight:700,color:chg>=0?T.green:T.red,background:chg>=0?T.greenBg:T.redLight,borderRadius:6,padding:"1px 6px"}}>{chg>=0?"+":""}{chg}%</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Top Expenses */}
            <Card style={{marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:800,color:T.text,marginBottom:14}}>Top Expenses — {rFrom.slice(0,7)}</div>
              {topExp.length?(
                topExp.map(([code,amt])=>(
                  <div key={code} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:12,color:T.sub,fontWeight:600}}>{getName(code)}</span>
                      <span style={{fontSize:12,fontWeight:700,color:T.orange}}>{fmtRs(amt)}</span>
                    </div>
                    <div style={{background:T.border,borderRadius:4,height:6,overflow:"hidden"}}>
                      <div style={{width:`${Math.round((amt/maxExp)*100)}%`,height:"100%",background:T.orange,borderRadius:4}}/>
                    </div>
                  </div>
                ))
              ):<div style={{textAlign:"center",color:T.muted,padding:20,fontSize:13}}>No expense data for this period</div>}
            </Card>

            {/* Smart suggestions — only shown if issues exist */}
            {suggestions.length>0&&(
              <Card>
                <div style={{fontSize:13,fontWeight:800,color:T.text,marginBottom:12}}>⚡ Insights & Alerts</div>
                {suggestions.map((s,i)=>(
                  <div key={i} style={{background:s.bg,borderRadius:10,padding:"10px 12px",marginBottom:8,display:"flex",gap:10,alignItems:"flex-start",border:`1px solid ${s.color}22`}}>
                    <span style={{fontSize:16,flexShrink:0}}>{s.icon}</span>
                    <span style={{fontSize:12,color:s.color,lineHeight:1.5}}>{s.text}</span>
                  </div>
                ))}
              </Card>
            )}
            {suggestions.length===0&&(
              <div style={{background:T.greenBg,borderRadius:12,padding:"14px 16px",textAlign:"center",border:`1px solid ${T.green}33`}}>
                <div style={{fontSize:20,marginBottom:6}}>✅</div>
                <div style={{fontSize:13,fontWeight:700,color:T.green}}>Looking good!</div>
                <div style={{fontSize:11,color:T.muted,marginTop:3}}>No issues detected for this period.</div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

// ─── Import Excel Screen ──────────────────────────────────────────────────────────────────────────────────────────────────
function ImportScreen({accounts,addTransaction,nextBilag,onBack}){
  const[rows,setRows]=useState([]);
  const[status,setStatus]=useState("idle"); // idle | preview | importing | done | error
  const[dropHover,setDropHover]=useState(false);
  const[progress,setProgress]=useState(0);
  const[total,setTotal]=useState(0);
  const[errMsg,setErrMsg]=useState("");
  const[imported,setImported]=useState(0);

  const handleFile=e=>processFile(e.target.files[0]);
  const processFile=file=>{
    if(!file)return;
    if(typeof XLSX==="undefined"){setErrMsg("Excel reader not loaded. Please refresh the page and try again.");setStatus("error");return;}
    setStatus("idle");setRows([]);setErrMsg("");
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const data=new Uint8Array(ev.target.result);
        const wb=XLSX.read(data,{type:"array"});
        const ws=wb.Sheets["Import Entries"];
        if(!ws){setErrMsg("Sheet 'Import Entries' not found in the file.");setStatus("error");return;}
        const json=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
        // Skip title row (row 1) and header row (row 2), start from row 3
        const parsed=[];
        for(let i=2;i<json.length;i++){
          const r=json[i];
          const date=r[0],dr=String(r[1]||"").trim(),cr=String(r[2]||"").trim(),desc=String(r[3]||"").trim();
          const amt=parseFloat(r[4]);
          const contact=String(r[5]||"").trim();
          if(!date||!dr||!cr||!desc||isNaN(amt)||amt<=0)continue;
          // Normalise date
          let d=date;
          if(typeof date==="number"){
            const dt=XLSX.SSF.parse_date_code(date);
            d=`${dt.y}-${String(dt.m).padStart(2,"0")}-${String(dt.d).padStart(2,"0")}`;
          } else {
            d=String(date).trim();
          }
          parsed.push({date:d,debitCode:dr,creditCode:cr,description:desc,amount:amt,contactId:contact||null});
        }
        if(!parsed.length){setErrMsg("No valid rows found. Check the file format.");setStatus("error");return;}
        setRows(parsed);
        setTotal(parsed.length);
        setStatus("preview");
      }catch(err){
        setErrMsg("Could not read the file: "+err.message);
        setStatus("error");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const doImport=async()=>{
    setStatus("importing");setProgress(0);setImported(0);
    let nb=nextBilag;
    let count=0;
    for(let i=0;i<rows.length;i++){
      const row=rows[i];
      try{
        await addTransaction({...row,bilag:nb});
        nb++;count++;
      }catch(err){
        console.error("Row",i,"failed:",err);
      }
      setProgress(i+1);
      setImported(count);
      // Small delay to avoid hammering Supabase
      if(i%10===9) await new Promise(r=>setTimeout(r,300));
    }
    setStatus("done");
  };

  const pct=total>0?Math.round((progress/total)*100):0;

  // This screen only ever renders from the desktop tracker (FinanceTracker) —
  // there's no separate mobile call site for it — so the mobile-card
  // wrapper (BackHeader banner, maxWidth:430 centered column, "Tap to
  // choose" copy) was simply wrong here, not a deliberate mobile/desktop
  // split like other screens have. Rebuilt as a plain desktop page: a
  // normal heading, and bordered panels with a header band, matching the
  // convention used everywhere else (Voucher details, Postings, Admin
  // panel, Home dashboard) instead of a phone-shaped card floating in the
  // middle of a wide screen.
  const cardHead={padding:"9px 14px",borderBottom:`1px solid ${T.border}`,background:T.bg,fontSize:12,fontWeight:700,color:T.sub};
  const cardStyle={background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden",marginBottom:16,maxWidth:720};

  return(
    <div>
      <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 16px"}}>Import Excel</h1>

      <div style={cardStyle}>
        <div style={cardHead}>Step 1 — Upload your import file</div>
        <div style={{padding:16}}>
          <div style={{fontSize:12,color:T.muted,marginBottom:14,lineHeight:1.6}}>
            Upload your Excel file. It must have a sheet named <em>Import Entries</em> with columns: Date, Debit Code, Credit Code, Description, Amount, Contact ID (optional).
          </div>
          <label
            onDragOver={e=>{e.preventDefault();setDropHover(true);}}
            onDragLeave={()=>setDropHover(false)}
            onDrop={e=>{e.preventDefault();setDropHover(false);processFile(e.dataTransfer.files[0]);}}
            style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,background:dropHover?T.accentLight:T.bg,border:`1.5px dashed ${dropHover?T.accent:T.border}`,borderRadius:10,padding:"22px 16px",textAlign:"center",cursor:"pointer"}}>
            <i className="ti ti-upload" style={{fontSize:22,color:T.accent}}/>
            <div style={{fontSize:13,fontWeight:700,color:T.accent}}>{dropHover?"Drop to upload":"Click to choose an Excel file, or drag one here"}</div>
            <div style={{fontSize:11,color:T.muted}}>.xlsx files only</div>
            <input type="file" accept=".xlsx" onChange={handleFile} style={{display:"none"}}/>
          </label>
        </div>
      </div>

      {status==="error"&&(
        <div style={{...cardStyle,border:`1px solid ${T.redMid}`}}>
          <div style={{...cardHead,color:T.red,background:T.redLight,borderColor:T.redMid}}>Error</div>
          <div style={{padding:16,fontSize:12,color:T.red}}>{errMsg}</div>
        </div>
      )}

      {(status==="preview"||status==="importing"||status==="done")&&rows.length>0&&(
        <div style={cardStyle}>
          <div style={cardHead}>
            {status==="preview"&&`Step 2 — Preview (${rows.length} entries found)`}
            {status==="importing"&&`Importing… ${progress} / ${total}`}
            {status==="done"&&`Done — ${imported} entries imported`}
          </div>
          <div style={{padding:16}}>
            {(status==="importing"||status==="done")&&(
              <div style={{marginBottom:14}}>
                <div style={{background:T.bg,borderRadius:6,height:8,overflow:"hidden",marginBottom:6}}>
                  <div style={{width:`${pct}%`,height:"100%",background:status==="done"?T.green:T.accent,borderRadius:6,transition:"width 0.3s"}}/>
                </div>
                <div style={{fontSize:11,color:T.muted,textAlign:"center"}}>{pct}% — {imported} saved to database</div>
              </div>
            )}

            {status==="preview"&&(
              <>
                <div style={{display:"grid",gridTemplateColumns:"90px 60px 60px 1fr 90px",gap:8,padding:"0 0 8px",borderBottom:`1px solid ${T.border}`,marginBottom:4}}>
                  {["Date","Debit","Credit","Description","Amount"].map(h=>(
                    <div key={h} style={{fontSize:10,fontWeight:700,color:T.muted}}>{h}</div>
                  ))}
                </div>
                <div style={{maxHeight:340,overflowY:"auto"}}>
                  {rows.slice(0,50).map((r,i)=>(
                    <div key={i} style={{display:"grid",gridTemplateColumns:"90px 60px 60px 1fr 90px",gap:8,padding:"7px 0",borderBottom:`1px solid ${T.border}`,alignItems:"center"}}>
                      <div style={{fontSize:12,color:T.sub}}>{r.date}</div>
                      <div style={{fontSize:12,fontWeight:700,color:T.red}}>{r.debitCode}</div>
                      <div style={{fontSize:12,fontWeight:700,color:T.green}}>{r.creditCode}</div>
                      <div style={{fontSize:12,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.description}</div>
                      <div style={{fontSize:12,fontWeight:700,textAlign:"right",color:T.text}}>{r.amount.toLocaleString()}</div>
                    </div>
                  ))}
                  {rows.length>50&&<div style={{textAlign:"center",padding:8,fontSize:12,color:T.muted}}>…and {rows.length-50} more</div>}
                </div>
                <div style={{marginTop:14}}>
                  <button onClick={doImport} style={{background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"10px 22px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Import all {rows.length} entries</button>
                </div>
                <div style={{fontSize:11,color:T.muted,marginTop:10,lineHeight:1.5}}>
                  Make sure you've added all accounts and Reskontro contacts before importing.
                </div>
              </>
            )}

            {status==="done"&&(
              <div style={{textAlign:"center",padding:"10px 0"}}>
                <i className="ti ti-circle-check" style={{fontSize:36,color:T.green,marginBottom:8}}/>
                <div style={{fontSize:14,fontWeight:700,color:T.green,marginBottom:4}}>All entries imported!</div>
                <div style={{fontSize:12,color:T.muted,marginBottom:16}}>Go to Accounts or Reports to verify your balances.</div>
                <button onClick={onBack} style={{background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"9px 18px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Back to Home</button>
              </div>
            )}
          </div>
        </div>
      )}

      {status==="idle"&&(
        <div style={cardStyle}>
          <div style={cardHead}>Before importing — add these contacts in Reskontro</div>
          <div style={{padding:16}}>
            {[["S001","Supplier 1","Supplier"],["S002","Supplier 2","Supplier"],["S003","Supplier 3","Supplier"],["S004","Supplier 4","Supplier"],["S005","Supplier 5","Supplier"]].map(([id,name,type])=>(
              <div key={id} style={{display:"flex",gap:8,fontSize:12,color:T.text,marginBottom:6}}>
                <span style={{background:T.accentLight,color:T.accent,fontWeight:700,padding:"1px 7px",borderRadius:4,minWidth:40,textAlign:"center"}}>{id}</span>
                <span>{name} <span style={{color:T.muted}}>({type})</span></span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Budget Module ────────────────────────────────────────────────────────────
function BudgetScreen({accounts,transactions,budgets,saveBudget,saveBudgetSurplusSetting,sweepBudgetSurplus,sinkingFunds=[],filterFrom,filterTo,onBack,isDesktop=false,onOpenLedger}){
  const[editModal,setEditModal]=useState(null);
  const[editVal,setEditVal]=useState("");
  const[surplusAction,setSurplusAction]=useState("rollover");
  const[surplusFundId,setSurplusFundId]=useState("");
  const[cardMenu,setCardMenu]=useState(null);
  const[showAddBudget,setShowAddBudget]=useState(false);

  // Budget rollover — on/off switch for the whole feature (per browser). When off,
  // every month's effective budget is just its own amount — no unspent-surplus
  // carry-forward, regardless of any per-account surplus setting saved earlier.
  const[rolloverEnabled,setRolloverEnabledState]=useState(()=>{try{return localStorage.getItem("rr_budget_rollover_enabled")!=="0";}catch{return true;}});
  const setRolloverEnabled=(v)=>{setRolloverEnabledState(v);try{localStorage.setItem("rr_budget_rollover_enabled",v?"1":"0");}catch{}};
  const[settingsMenuOpen,setSettingsMenuOpen]=useState(false);
  const[moveConfirm,setMoveConfirm]=useState(false);

  const now=new Date();
  const years=[2023,2024,2025,2026,2027,2028];
  const BMNTH=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const[bSelYear,setBSelYear]=useState(now.getFullYear());
  const[bSelMonth,setBSelMonth]=useState(now.getMonth()); // 0-11, -1=full year
  const isPastMonth=bSelMonth!==-1&&(bSelYear*12+bSelMonth)<(now.getFullYear()*12+now.getMonth());

  const getRow=(y,m,code)=>budgets.find(b=>b.year===y&&b.month===m&&b.code===code);

  // Base (self-entered) budget amounts for the selected period — a {code:amount}
  // lookup derived from the cloud-synced `budgets` prop (one row per year/month/code).
  const baseBudgetMap=useMemo(()=>{
    const m={};
    budgets.filter(b=>b.year===bSelYear&&b.month===bSelMonth).forEach(b=>{m[b.code]=b.amount;});
    return m;
  },[budgets,bSelYear,bSelMonth]);

  const getBFrom=(y,m)=>{if(m===-1)return`${y}-01-01`;const mm=String(m+1).padStart(2,"0");return`${y}-${mm}-01`;};
  const getBTo=(y,m)=>{if(m===-1)return`${y}-12-31`;const mm=String(m+1).padStart(2,"0");const last=new Date(y,m+1,0).getDate();return`${y}-${mm}-${String(last).padStart(2,"0")}`;};
  const bFrom=getBFrom(bSelYear,bSelMonth);const bTo=getBTo(bSelYear,bSelMonth);

  // Last month range
  const lastMonthDate=new Date(now.getFullYear(),now.getMonth()-1,1);
  const lmFrom=`${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth()+1).padStart(2,"0")}-01`;
  const lmTo=new Date(lastMonthDate.getFullYear(),lastMonthDate.getMonth()+1,0).toISOString().slice(0,10);

  const expAccounts=useMemo(()=>["4000","5000","6000","6100","6200","6300","6400","6500","6600","6700","6800","6900","7000","7100","7200","7300","7400","7500","7600","7700","7800","7900"]
    .flatMap(sk=>accountsForSK(accounts,transactions,sk)),[accounts,transactions]);
  const periodTxns=useMemo(()=>transactions.filter(t=>t.date>=bFrom&&t.date<=bTo&&!t.reversedBy&&!t.reversalOf),[transactions,bFrom,bTo]);
  const lastMonthTxns=useMemo(()=>transactions.filter(t=>t.date>=lmFrom&&t.date<=lmTo&&!t.reversedBy&&!t.reversalOf),[transactions,lmFrom,lmTo]);
  const getActual=(code,txns)=>txns.filter(t=>t.debitCode===code).reduce((s,t)=>s+t.amount,0);
  const getActualForMonth=(code,y,m)=>{const f=getBFrom(y,m),t=getBTo(y,m);return transactions.filter(tx=>tx.debitCode===code&&tx.date>=f&&tx.date<=t&&!tx.reversedBy&&!tx.reversalOf).reduce((s,tx)=>s+tx.amount,0);};

  // Effective budget = this month's own budget + any unspent surplus rolled over from
  // the previous month. A surplus keeps compounding forward across consecutive months;
  // overspending never carries a negative balance into the next month. If a month's
  // surplus was already swept into a sinking fund, it contributes nothing further to
  // rollover — that money is accounted for in the fund instead. Only applies to
  // monthly view — "All Year" is its own independent bucket, unaffected by rollover.
  const effectiveBudget=useMemo(()=>{
    const cache={};
    const calc=(y,m,code)=>{
      const key=`${y}-${m}-${code}`;
      if(cache[key]!==undefined)return cache[key];
      const row=getRow(y,m,code);
      const own=row?row.amount||0:0;
      if(!rolloverEnabled){cache[key]=own;return own;}
      let py=m-1,pyy=y;if(py<0){py=11;pyy=y-1;}
      const hasEarlierData=budgets.some(b=>b.code===code&&b.month>=0&&(b.year<pyy||(b.year===pyy&&b.month<=py)));
      if(!hasEarlierData){cache[key]=own;return own;}
      const prevRow=getRow(pyy,py,code);
      const prevEffective=calc(pyy,py,code);
      const prevActual=getActualForMonth(code,pyy,py);
      const alreadySwept=!!(prevRow&&prevRow.surplusAction==="sinking_fund"&&prevRow.swept);
      const rollover=alreadySwept?0:Math.max(0,prevEffective-prevActual);
      const eff=own+rollover;
      cache[key]=eff;
      return eff;
    };
    return (y,m,code)=>calc(y,m,code);
  },[budgets,transactions,rolloverEnabled]);

  const getEffective=(code)=>bSelMonth===-1?(baseBudgetMap[code]||0):effectiveBudget(bSelYear,bSelMonth,code);
  const getRollover=(code)=>bSelMonth===-1?0:Math.max(0,getEffective(code)-(baseBudgetMap[code]||0));
  // Eligible to sweep now: a closed (past) month, set to sweep-to-savings, not yet swept, with money left over.
  const getSweepable=(code)=>{
    if(bSelMonth===-1||!isPastMonth)return null;
    const row=getRow(bSelYear,bSelMonth,code);
    if(!row||row.surplusAction!=="sinking_fund"||row.swept)return null;
    const leftover=getEffective(code)-getActual(code,periodTxns);
    if(leftover<=0)return null;
    const fund=sinkingFunds.find(f=>f.id===row.surplusFundId);
    if(!fund)return null;
    return{leftover,fund};
  };

  // Current month income for % calculation
  const curIncome=useMemo(()=>periodTxns.filter(t=>isIncomeSK(t.creditCode)).reduce((s,t)=>s+t.amount,0),[periodTxns]);

  // Move-previous-month-budget: copies every budgeted amount (and its surplus
  // setting) from the month right before the one currently selected into the
  // selected month, replacing whatever is set there for those accounts.
  const prevMonth=bSelMonth===-1?null:(bSelMonth===0?11:bSelMonth-1);
  const prevMonthYear=bSelMonth===0?bSelYear-1:bSelYear;
  const prevMonthLabel=bSelMonth===-1?"":BMNTH[prevMonth];
  const curMonthLabel=bSelMonth===-1?"":BMNTH[bSelMonth];
  const prevMonthBudgetRows=useMemo(()=>{
    if(bSelMonth===-1)return[];
    return budgets.filter(b=>b.year===prevMonthYear&&b.month===prevMonth&&b.amount>0);
  },[budgets,bSelMonth,prevMonth,prevMonthYear]);
  const moveBudgetForward=()=>{
    if(bSelMonth===-1||!prevMonthBudgetRows.length)return;
    prevMonthBudgetRows.forEach(row=>{
      saveBudget(bSelYear,bSelMonth,row.code,row.amount);
      saveBudgetSurplusSetting(bSelYear,bSelMonth,row.code,row.surplusAction||"rollover",row.surplusFundId||null);
    });
    markBudgetMoved(prevMonthYear,prevMonth,bSelYear,bSelMonth);
    setMoveConfirm(false);
  };
  const alreadyMovedThisTransition=bSelMonth===-1?false:hasBudgetMoved(prevMonthYear,prevMonth,bSelYear,bSelMonth);

  const confirmEdit=()=>{
    if(!editModal)return;
    saveBudget(bSelYear,bSelMonth,editModal.code,parseFloat(editVal)||0);
    saveBudgetSurplusSetting(bSelYear,bSelMonth,editModal.code,surplusAction,surplusAction==="sinking_fund"?surplusFundId||null:null);
    setEditModal(null);setEditVal("");
  };
  const openEdit=(a)=>{
    const row=getRow(bSelYear,bSelMonth,a.code);
    setEditVal(String(baseBudgetMap[a.code]||""));
    setSurplusAction(row?.surplusAction||(rolloverEnabled?"rollover":"sinking_fund"));
    setSurplusFundId(row?.surplusFundId||(sinkingFunds[0]?sinkingFunds[0].id:""));
    setEditModal({code:a.code,name:a.name});
    setCardMenu(null);
  };

  const totalBudget=expAccounts.reduce((s,a)=>s+getEffective(a.code),0);
  const totalActual=expAccounts.reduce((s,a)=>s+getActual(a.code,periodTxns),0);
  const totalRemaining=totalBudget-totalActual;
  const totalPct=totalBudget>0?Math.min(100,Math.round((totalActual/totalBudget)*100)):0;
  const over=totalActual>totalBudget&&totalBudget>0;
  const onTrackCount=expAccounts.filter(a=>{const b=getEffective(a.code);if(!b)return false;const act=getActual(a.code,periodTxns);return act<=b;}).length;
  const budgetedCount=expAccounts.filter(a=>getEffective(a.code)>0).length;

  // Arc gauge (half circle — speedometer style using strokeDasharray/strokeDashoffset)
  const ArcGauge=({pct,spent,budget,over})=>{
    const r=72;const cx=100;const cy=100;
    const fillColor=over?"#EF4444":"#3B82F6";
    const clampedPct=Math.min(100,Math.max(0,pct));
    // Half-circle: from left (cx-r, cy) to right (cx+r, cy) sweeping upward
    const arcLen=Math.PI*r; // circumference of half circle
    const dashOffset=arcLen*(1-clampedPct/100); // 0%=full offset(nothing), 100%=0 offset(full)
    // Dot position: starts at left (180°), moves clockwise to right (0°) as pct increases
    const dotAngle=Math.PI*(1-clampedPct/100); // π at 0%, 0 at 100%
    const dotX=cx+r*Math.cos(dotAngle);
    const dotY=cy-r*Math.sin(dotAngle); // minus because SVG y is flipped
    return(
      <svg width={200} height={114} style={{display:"block",margin:"0 auto"}}>
        {/* Track (grey half-circle) */}
        <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={14} strokeLinecap="round"/>
        {/* Fill — strokeDasharray = full arc length, offset shrinks as pct grows */}
        <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`} fill="none" stroke={fillColor} strokeWidth={14} strokeLinecap="round"
          strokeDasharray={arcLen}
          strokeDashoffset={dashOffset}/>
        {/* Dot indicator at fill tip */}
        {clampedPct>0&&<circle cx={dotX} cy={dotY} r={7} fill="#fff" opacity={0.9}/>}
        <text x={cx} y={cy-22} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.45)" fontFamily="system-ui" letterSpacing={1} fontWeight={600}>SPENT</text>
        <text x={cx} y={cy+2} textAnchor="middle" fontSize={22} fill="#fff" fontFamily="system-ui" fontWeight={900}>{fmt(spent)}</text>
        <text x={cx} y={cy+20} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.4)" fontFamily="system-ui">of {fmt(budget)}</text>
        <text x={cx-r+4} y={cy+14} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.3)" fontFamily="system-ui">0%</text>
        <text x={cx+r-4} y={cy+14} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.3)" fontFamily="system-ui">100%</text>
      </svg>
    );
  };

  return(
    <div style={isDesktop?{maxWidth:1000}:{background:"#f1efe8",minHeight:"100vh",fontFamily:"system-ui,-apple-system,sans-serif",maxWidth:430,margin:"0 auto",paddingBottom:40}}>
      {(cardMenu||settingsMenuOpen)&&<div onClick={()=>{setCardMenu(null);setSettingsMenuOpen(false);}} style={{position:"fixed",inset:0,zIndex:90}}/>}

      {/* Edit modal */}
      {editModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#fff",borderRadius:18,padding:24,width:"100%",maxWidth:340}}>
            <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:4}}>{editModal.code} · {editModal.name}</div>
            <div style={{fontSize:11,color:T.muted,marginBottom:14}}>Budget for {bSelMonth===-1?String(bSelYear):["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][bSelMonth]+" "+bSelYear} (PKR)</div>
            <input type="number" placeholder="e.g. 50000" value={editVal} onChange={e=>setEditVal(e.target.value)} autoFocus style={{...inp,marginBottom:12}}/>
            {bSelMonth!==-1&&(rolloverEnabled||sinkingFunds.length>0)&&(
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,color:"#888780",fontWeight:600,marginBottom:6}}>On surplus, if under budget</div>
                <div style={{display:"flex",gap:6,marginBottom:8}}>
                  {rolloverEnabled&&<button onClick={()=>setSurplusAction("rollover")} style={{flex:1,padding:"8px",borderRadius:8,border:`1.5px solid ${surplusAction==="rollover"?T.accent:"#d3d1c7"}`,background:surplusAction==="rollover"?T.accentLight:"#fff",color:surplusAction==="rollover"?T.accent:"#5f5e5a",fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>↻ Roll over</button>}
                  <button onClick={()=>setSurplusAction("sinking_fund")} disabled={!sinkingFunds.length} style={{flex:1,padding:"8px",borderRadius:8,border:`1.5px solid ${surplusAction==="sinking_fund"?T.accent:"#d3d1c7"}`,background:surplusAction==="sinking_fund"?T.accentLight:"#fff",color:surplusAction==="sinking_fund"?T.accent:"#5f5e5a",fontWeight:700,fontSize:11,cursor:sinkingFunds.length?"pointer":"not-allowed",fontFamily:"inherit",opacity:sinkingFunds.length?1:0.5}}>💰 Send to savings</button>
                </div>
                {surplusAction==="sinking_fund"&&(
                  sinkingFunds.length
                    ?<select value={surplusFundId} onChange={e=>setSurplusFundId(e.target.value)} style={{...inp,fontSize:13}}>
                        {sinkingFunds.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    :<div style={{fontSize:11,color:"#a32d2d"}}>No sinking funds yet — create one first in the Sinking Funds screen.</div>
                )}
              </div>
            )}
            <div style={{display:"flex",gap:8}}>
              <SaveFlashButton onClick={confirmEdit} style={{flex:2}} label="Save Budget"/>
              <button onClick={()=>setEditModal(null)} style={{...btnGhost,flex:1}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Move-previous-month-budget confirmation */}
      {moveConfirm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#fff",borderRadius:18,padding:24,width:"100%",maxWidth:340}}>
            <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:8}}>Move {prevMonthLabel} budget to {curMonthLabel}?</div>
            <div style={{fontSize:11,color:T.muted,marginBottom:16}}>This copies {prevMonthBudgetRows.length} budgeted {prevMonthBudgetRows.length===1?"account":"accounts"} from {prevMonthLabel} {prevMonthYear} into {curMonthLabel} {bSelYear}, replacing any budget already set there for those accounts.</div>
            <div style={{display:"flex",gap:8}}>
              <SaveFlashButton onClick={moveBudgetForward} style={{flex:2}} label="Move Budget"/>
              <button onClick={()=>setMoveConfirm(false)} style={{...btnGhost,flex:1}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      {isDesktop?(
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Budget — {bSelMonth===-1?bSelYear:`${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][bSelMonth]} ${bSelYear}`}</h1>
          <button onClick={onBack} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>‹ Back to dashboard</button>
        </div>
      ):(
        <div style={{background:T.header,padding:"16px",display:"flex",alignItems:"center",gap:12}}>
          <button onClick={onBack} style={{background:"rgba(255,255,255,0.12)",border:"none",borderRadius:10,color:"#fff",fontSize:20,cursor:"pointer",width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
          <div style={{flex:1}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",fontWeight:700,letterSpacing:1.5,textTransform:"uppercase"}}>Monthly Planning</div>
            <div style={{fontSize:18,fontWeight:700,color:"#fff"}}>Budget — {bSelMonth===-1?bSelYear:`${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][bSelMonth]} ${bSelYear}`}</div>
          </div>
        </div>
      )}

      <div style={isDesktop?{}:{padding:16}}>
        {/* Arc gauge hero card */}
        <div style={{background:"#1A1A2E",borderRadius:20,padding:"20px 16px 16px",marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,0.7)"}}>Budget Overview</div>
            {/* Year + All Year + settings */}
            <div style={{display:"flex",gap:6,alignItems:"center",position:"relative"}}>
              <select value={bSelYear} onChange={e=>{setBSelYear(parseInt(e.target.value));setBSelMonth(now.getMonth());}} style={{fontSize:9,fontWeight:700,color:"#fff",background:"rgba(255,255,255,0.12)",border:"none",borderRadius:6,padding:"3px 6px",cursor:"pointer",fontFamily:"inherit",outline:"none"}}>
                {years.map(y=><option key={y} value={y} style={{background:"#1A1A2E"}}>{y}</option>)}
              </select>
              <button onClick={()=>setBSelMonth(-1)} style={{fontSize:9,fontWeight:700,color:bSelMonth===-1?"#fff":"rgba(255,255,255,0.5)",background:bSelMonth===-1?"rgba(255,255,255,0.2)":"transparent",border:"none",borderRadius:6,padding:"3px 6px",cursor:"pointer",fontFamily:"inherit"}}>All</button>
              <button onClick={()=>setSettingsMenuOpen(p=>!p)} title="Budget settings" style={{width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",background:settingsMenuOpen?"rgba(255,255,255,0.24)":"rgba(255,255,255,0.12)",border:"none",borderRadius:6,color:"#fff",cursor:"pointer"}}>
                <i className="ti ti-settings" style={{fontSize:13}}/>
              </button>
              {settingsMenuOpen&&(
                <div style={{position:"absolute",top:28,right:0,background:"#fff",border:"0.5px solid #d3d1c7",borderRadius:12,zIndex:120,minWidth:230,boxShadow:"0 8px 24px rgba(0,0,0,0.18)",padding:12,textAlign:"left"}}>
                  <div style={{fontSize:11,fontWeight:800,color:T.text,marginBottom:10}}>Budget settings</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginBottom:12}}>
                    <div>
                      <div style={{fontSize:11,fontWeight:600,color:T.text}}>Budget rollover</div>
                      <div style={{fontSize:9,color:"#888780",marginTop:1}}>Carry unspent budget into next month</div>
                    </div>
                    <div onClick={()=>setRolloverEnabled(!rolloverEnabled)} style={{width:38,height:21,borderRadius:11,background:rolloverEnabled?T.accent:"#D1D5DB",cursor:"pointer",position:"relative",transition:"background 0.2s",flexShrink:0}}>
                      <div style={{position:"absolute",top:2,left:rolloverEnabled?19:2,width:17,height:17,borderRadius:"50%",background:"#fff",transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
                    </div>
                  </div>
                  <div style={{height:1,background:"#eee",margin:"4px 0 10px"}}/>
                  <button
                    disabled={bSelMonth===-1||!prevMonthBudgetRows.length||alreadyMovedThisTransition}
                    onClick={()=>{setSettingsMenuOpen(false);setMoveConfirm(true);}}
                    style={{width:"100%",textAlign:"left",background:"none",border:"none",padding:"4px 0",fontSize:11,fontWeight:700,color:(bSelMonth===-1||!prevMonthBudgetRows.length||alreadyMovedThisTransition)?"#b5b3aa":T.accent,cursor:(bSelMonth===-1||!prevMonthBudgetRows.length||alreadyMovedThisTransition)?"not-allowed":"pointer",fontFamily:"inherit"}}
                  >
                    ⇥ Move {bSelMonth===-1?"previous month":prevMonthLabel} budget to {bSelMonth===-1?"current month":curMonthLabel}
                  </button>
                  {bSelMonth===-1&&<div style={{fontSize:9,color:"#888780",marginTop:4}}>Select a specific month first.</div>}
                  {bSelMonth!==-1&&!prevMonthBudgetRows.length&&<div style={{fontSize:9,color:"#888780",marginTop:4}}>No budget set for {prevMonthLabel} {prevMonthYear} yet.</div>}
                  {bSelMonth!==-1&&prevMonthBudgetRows.length>0&&alreadyMovedThisTransition&&(
                    <div style={{fontSize:9,color:"#888780",marginTop:4}}>
                      ✓ Already moved for {curMonthLabel} {bSelYear} — won't re-copy and overwrite any edits since.{" "}
                      <button onClick={()=>markBudgetMoved(prevMonthYear,prevMonth,bSelYear,bSelMonth,false)} style={{background:"none",border:"none",color:T.accent,fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:0,textDecoration:"underline",fontSize:9}}>Allow moving again</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          {/* Month pills */}
          <div style={{display:"flex",gap:3,overflowX:"auto",scrollbarWidth:"none",marginBottom:10,paddingBottom:2}}>
            {BMNTH.map((m,i)=>(
              <button key={i} onClick={()=>setBSelMonth(i)} style={{flexShrink:0,padding:"3px 7px",borderRadius:6,border:"none",background:bSelMonth===i?"rgba(59,130,246,0.7)":"rgba(255,255,255,0.1)",color:bSelMonth===i?"#fff":"rgba(255,255,255,0.5)",fontSize:9,fontWeight:bSelMonth===i?700:400,cursor:"pointer",fontFamily:"inherit"}}>{m}</button>
            ))}
          </div>
          {totalBudget>0
            ?<ArcGauge pct={totalPct} spent={totalActual} budget={totalBudget} over={over}/>
            :<div style={{textAlign:"center",padding:"24px 0",color:"rgba(255,255,255,0.4)",fontSize:13}}>No budgets set — tap ••• on a card below</div>
          }
          {totalBudget>0&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:10,paddingTop:12,borderTop:"1px solid rgba(255,255,255,0.08)"}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:9,color:"rgba(255,255,255,0.4)",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>Budget</div>
                <div style={{fontSize:13,fontWeight:700,color:"#fff"}}>{fmt(totalBudget)}</div>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:9,color:"rgba(255,255,255,0.4)",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>Remaining</div>
                <div style={{fontSize:13,fontWeight:700,color:over?"#EF4444":"#4ade80"}}>{fmt(Math.abs(totalRemaining))}</div>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:9,color:"rgba(255,255,255,0.4)",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>On Track</div>
                <div style={{fontSize:13,fontWeight:700,color:"#4ade80"}}>{onTrackCount}/{budgetedCount}</div>
              </div>
            </div>
          )}
        </div>

        {/* Summary stats row — matches sinking fund style */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
          <div style={{background:"#fff",border:"0.5px solid #d3d1c7",borderRadius:10,padding:"12px 10px"}}>
            <div style={{fontSize:10,color:"#888780",marginBottom:4}}>Total spent</div>
            <div style={{fontSize:15,fontWeight:500,color:"#1a1a18"}}>{fmt(totalActual)}</div>
          </div>
          <div style={{background:"#fff",border:"0.5px solid #d3d1c7",borderRadius:10,padding:"12px 10px"}}>
            <div style={{fontSize:10,color:"#888780",marginBottom:4}}>Last month</div>
            <div style={{fontSize:15,fontWeight:500,color:"#1a1a18"}}>{fmt(expAccounts.reduce((s,a)=>s+getActual(a.code,lastMonthTxns),0))}</div>
          </div>
          <div style={{background:"#fff",border:"0.5px solid #d3d1c7",borderRadius:10,padding:"12px 10px"}}>
            <div style={{fontSize:10,color:"#888780",marginBottom:4}}>% of income</div>
            <div style={{fontSize:15,fontWeight:500,color:curIncome>0&&totalActual/curIncome>0.7?"#a32d2d":curIncome>0&&totalActual/curIncome>0.5?"#854f0b":"#3b6d11"}}>
              {curIncome>0?Math.round((totalActual/curIncome)*100):0}%
            </div>
          </div>
        </div>

        {/* Account cards — every expense account with a budget AND/OR actual
            spending this period shows here, so this is a complete picture
            of where money went, not just the accounts someone planned for. */}
        <div style={{display:"grid",gridTemplateColumns:isDesktop?"1fr 1fr 1fr":"1fr 1fr",gap:10}}>
          {expAccounts.filter(a=>getEffective(a.code)>0||getActual(a.code,periodTxns)>0).sort((a,b)=>getActual(b.code,periodTxns)-getActual(a.code,periodTxns)).map(a=>{
            const budget=getEffective(a.code);
            const rollover=getRollover(a.code);
            const actual=getActual(a.code,periodTxns);
            const lastActual=getActual(a.code,lastMonthTxns);
            const pct=budget>0?Math.min(100,Math.round((actual/budget)*100)):0;
            const isOver=actual>budget&&budget>0;
            const incPct=curIncome>0?Math.round((actual/curIncome)*100):0;
            // Risk badge
            const risk=!budget?{label:"No budget",color:"#888780",bg:"#f3f4f6"}
              :isOver?{label:"Over",color:"#a32d2d",bg:"#fcebeb"}
              :pct>75?{label:"At risk",color:"#854f0b",bg:"#faeeda"}
              :{label:"On track",color:"#3b6d11",bg:"#eaf3de"};
            const sweep=getSweepable(a.code);
            return(
              <div key={a.code} style={{background:"#fff",border:"0.5px solid #d3d1c7",borderRadius:12,padding:"12px",position:"relative"}}>
                {/* Top row */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                  <span style={{fontSize:10,fontWeight:700,color:T.orange,background:"#FEF3C7",borderRadius:5,padding:"2px 7px"}}>{a.code}</span>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <span style={{fontSize:9,padding:"2px 7px",borderRadius:20,fontWeight:500,color:risk.color,background:risk.bg}}>{risk.label}</span>
                    <div style={{position:"relative"}}>
                      <button onClick={()=>setCardMenu(cardMenu===a.code?null:a.code)} style={{background:"none",border:"0.5px solid #d3d1c7",borderRadius:5,color:"#888780",fontSize:12,cursor:"pointer",width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,lineHeight:1}}>•••</button>
                      {cardMenu===a.code&&(
                        <div style={{position:"absolute",right:0,top:26,background:"#fff",border:"0.5px solid #d3d1c7",borderRadius:10,zIndex:100,minWidth:130,boxShadow:"0 6px 20px rgba(0,0,0,0.1)"}}>
                          <div onClick={()=>openEdit(a)} style={{padding:"10px 14px",fontSize:12,cursor:"pointer",color:T.accent,fontWeight:600}}>✏️ Set Budget</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Account name — click to drill down to its ledger for this period */}
                <div onClick={()=>onOpenLedger&&onOpenLedger(a)} style={{fontSize:12,fontWeight:500,color:onOpenLedger?T.accent:"#1a1a18",marginBottom:8,lineHeight:1.3,cursor:onOpenLedger?"pointer":"default",textDecoration:onOpenLedger?"underline":"none"}}>{a.name}</div>

                {/* Amounts */}
                <div style={{marginBottom:6}}>
                  <div style={{fontSize:15,fontWeight:600,color:isOver?"#a32d2d":"#1a1a18"}}>{fmt(actual)}</div>
                  <div style={{fontSize:10,color:"#888780"}}>of {budget>0?fmt(budget):"—"}</div>
                  {rollover>0&&<div style={{fontSize:9,color:"#3b9e6d",fontWeight:700,marginTop:2}}>↻ +{fmt(rollover)} rolled over</div>}
                </div>

                {/* Progress bar */}
                {budget>0&&(
                  <>
                    <div style={{height:5,background:"#f1efe8",borderRadius:3,overflow:"hidden",marginBottom:5}}>
                      <div style={{width:`${Math.min(100,pct)}%`,height:"100%",background:isOver?"#e24b4a":pct>75?"#ef9f27":"#3b9e6d",borderRadius:3,transition:"width 0.3s"}}/>
                    </div>
                    {isOver
                      ?<div style={{fontSize:10,fontWeight:700,color:"#a32d2d",marginBottom:5}}>⚠ Over by {fmt(actual-budget)}</div>
                      :<div style={{fontSize:10,color:"#888780",marginBottom:5}}>Remaining: <span style={{fontWeight:700,color:"#3b9e6d"}}>{fmt(budget-actual)}</span></div>
                    }
                  </>
                )}
                {!budget&&<div style={{height:5,background:"#f1efe8",borderRadius:3,marginBottom:7}}/>}

                {sweep&&(
                  <button onClick={()=>sweepBudgetSurplus(bSelYear,bSelMonth,a.code,sweep.fund.id,sweep.leftover)} style={{width:"100%",background:"#eaf3de",color:"#3b6d11",border:"1px solid #c0dd97",borderRadius:8,padding:"7px",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginBottom:7}}>
                    💰 Sweep {fmt(sweep.leftover)} to {sweep.fund.name}
                  </button>
                )}

                {/* Footer: last month + % of income */}
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#888780"}}>
                  <span>Last: {fmt(lastActual)}</span>
                  <span>{incPct>0?`${incPct}% inc`:"—"}</span>
                </div>
              </div>
            );
          })}
        </div>
        {!expAccounts.length&&<div style={{textAlign:"center",color:T.muted,padding:30,fontSize:13}}>Add expense accounts (4000s) first.</div>}

        {expAccounts.length>0&&expAccounts.filter(a=>getEffective(a.code)>0||getActual(a.code,periodTxns)>0).length===0&&(
          <div style={{textAlign:"center",color:"#888780",padding:24,fontSize:13,background:"#fff",borderRadius:12,border:"0.5px solid #d3d1c7"}}>
            No budgets set, and nothing spent this period yet.<br/><span style={{fontSize:11,color:"#aaa"}}>Tap "+ Add Budget" below to set a budget for an expense account.</span>
          </div>
        )}
        {expAccounts.length>0&&(
          <button onClick={()=>setShowAddBudget(true)} style={{width:"100%",marginTop:10,background:"#fff",border:`1.5px dashed #d3d1c7`,borderRadius:12,padding:"12px",fontSize:12,fontWeight:600,color:T.accent,cursor:"pointer",fontFamily:"inherit"}}>+ Add Budget</button>
        )}

      </div>

      {/* Add-budget account picker — only accounts with no own budget AND no rolled-over balance */}
      {showAddBudget&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#fff",borderRadius:18,padding:24,width:"100%",maxWidth:340}}>
            <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:12}}>Choose an expense account</div>
            <div style={{maxHeight:280,overflowY:"auto",border:`1px solid ${T.border}`,borderRadius:10}}>
              {expAccounts.filter(a=>!(getEffective(a.code)>0)).map((a,i,arr)=>(
                <div key={a.code} onClick={()=>{setShowAddBudget(false);openEdit(a);}} style={{padding:"10px 12px",fontSize:12,cursor:"pointer",borderBottom:i<arr.length-1?`0.5px solid ${T.border}`:"none",display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{fontSize:10,fontWeight:700,color:T.orange,background:"#FEF3C7",borderRadius:5,padding:"2px 7px"}}>{a.code}</span>
                  <span style={{color:T.text}}>{a.name}</span>
                </div>
              ))}
              {expAccounts.filter(a=>!(getEffective(a.code)>0)).length===0&&<div style={{padding:16,fontSize:12,color:T.muted,textAlign:"center"}}>All expense accounts already have a budget.</div>}
            </div>
            <button onClick={()=>setShowAddBudget(false)} style={{...btnGhost,width:"100%",marginTop:12}}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Profile Screen ────────────────────────────────────────────────────────────
function ProfileRow({icon,label,sub,onClick,expanded,trailing,children}){
  return(
    <div>
      <div onClick={onClick} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",cursor:onClick?"pointer":"default"}}>
        <div style={{width:40,height:40,borderRadius:12,background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><i className={`ti ${icon}`} style={{fontSize:18,color:T.sub}}/></div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:600,color:T.text}}>{label}</div>
          {sub&&<div style={{fontSize:11,color:T.muted,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sub}</div>}
        </div>
        {trailing}
        {onClick&&<i className={expanded?"ti ti-chevron-down":"ti ti-chevron-right"} style={{fontSize:16,color:T.muted,flexShrink:0}}/>}
      </div>
      {expanded&&<div style={{padding:"0 16px 16px 70px"}}>{children}</div>}
    </div>
  );
}

function ProfileScreen({onSignOut,onNavigate,isAdmin,isDesktop=false}){
  const[profileData,setProfileData]=useState(()=>{try{return JSON.parse(localStorage.getItem("rr_profile")||"{}")}catch{return{};}});
  const[editName,setEditName]=useState(false);
  const[tempName,setTempName]=useState("");
  const[tempPhone,setTempPhone]=useState("");
  const[tempEmail,setTempEmail]=useState("");
  const[openRow,setOpenRow]=useState(null); // "personal" | "password" | null
  const[newPwd,setNewPwd]=useState("");
  const[confirmPwd,setConfirmPwd]=useState("");
  const[pwdMsg,setPwdMsg]=useState("");
  const[pwdErr,setPwdErr]=useState("");
  const[pwdSaving,setPwdSaving]=useState(false);

  // 2FA — real Supabase Auth MFA (TOTP), not a placeholder toggle.
  const[mfaFactors,setMfaFactors]=useState([]);
  const[mfaLoading,setMfaLoading]=useState(true);
  const[mfaEnrolling,setMfaEnrolling]=useState(false);
  const[mfaQr,setMfaQr]=useState("");
  const[mfaSecret,setMfaSecret]=useState("");
  const[mfaFactorId,setMfaFactorId]=useState("");
  const[mfaCode,setMfaCode]=useState("");
  const[mfaMsg,setMfaMsg]=useState("");
  const[mfaErr,setMfaErr]=useState("");
  const[mfaBusy,setMfaBusy]=useState(false);

  useEffect(()=>{
    sb.auth.mfa.listFactors().then(({data,error})=>{
      if(!error&&data)setMfaFactors(data.totp||[]);
      setMfaLoading(false);
    }).catch(()=>setMfaLoading(false));
  },[]);

  const startMfaEnroll=async()=>{
    setMfaErr("");setMfaMsg("");setMfaBusy(true);
    const{data,error}=await sb.auth.mfa.enroll({factorType:"totp"});
    setMfaBusy(false);
    if(error){setMfaErr(error.message);return;}
    setMfaFactorId(data.id);
    setMfaQr(data.totp.qr_code);
    setMfaSecret(data.totp.secret);
    setMfaEnrolling(true);
  };
  const confirmMfaEnroll=async()=>{
    if(!mfaCode.trim()){setMfaErr("Enter the 6-digit code from your authenticator app.");return;}
    setMfaBusy(true);setMfaErr("");
    const{data:chData,error:chErr}=await sb.auth.mfa.challenge({factorId:mfaFactorId});
    if(chErr){setMfaErr(chErr.message);setMfaBusy(false);return;}
    const{error:vErr}=await sb.auth.mfa.verify({factorId:mfaFactorId,challengeId:chData.id,code:mfaCode.trim()});
    setMfaBusy(false);
    if(vErr){setMfaErr("Code didn't match — check your authenticator app and try again.");return;}
    setMfaMsg("Two-factor authentication is now enabled.");
    setMfaEnrolling(false);setMfaCode("");setMfaQr("");setMfaSecret("");
    const{data}=await sb.auth.mfa.listFactors();
    if(data)setMfaFactors(data.totp||[]);
  };
  const cancelMfaEnroll=async()=>{
    if(mfaFactorId)await sb.auth.mfa.unenroll({factorId:mfaFactorId}).catch(()=>{});
    setMfaEnrolling(false);setMfaQr("");setMfaSecret("");setMfaCode("");setMfaFactorId("");setMfaErr("");
  };
  const disableMfa=async(factorId)=>{
    if(!window.confirm("Disable two-factor authentication? Your account will only need a password to sign in.")) return;
    setMfaBusy(true);
    const{error}=await sb.auth.mfa.unenroll({factorId});
    setMfaBusy(false);
    if(error){setMfaErr(error.message);return;}
    setMfaFactors(p=>p.filter(f=>f.id!==factorId));
    setMfaMsg("Two-factor authentication disabled.");
  };

  const changePassword=async()=>{
    setPwdErr("");setPwdMsg("");
    if(newPwd.length<6){setPwdErr("Password must be at least 6 characters.");return;}
    if(newPwd!==confirmPwd){setPwdErr("Passwords do not match.");return;}
    setPwdSaving(true);
    try{
      const{error}=await sb.auth.updateUser({password:newPwd});
      if(error){setPwdErr(error.message);}
      else{setPwdMsg("Password updated.");setNewPwd("");setConfirmPwd("");}
    }catch(e){setPwdErr(e.message||"Failed to update password.");}
    setPwdSaving(false);
  };

  useEffect(()=>{
    setTempPhone(profileData.phone||"");
    setTempEmail(profileData.email||"");
  },[]);

  const saveProfile=(updates)=>{
    const n={...profileData,...updates};
    setProfileData(n);
    try{localStorage.setItem("rr_profile",JSON.stringify(n));}catch{}
  };
  const displayName=profileData.name||"RedRock User";
  const initials=displayName.split(" ").filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join("")||"U";
  const contactLine=[tempPhone,tempEmail].filter(Boolean).join(" · ");

  const passwordSection=(
    <>
      <div style={{marginBottom:8}}>
        <div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4}}>NEW PASSWORD</div>
        <input type="password" value={newPwd} onChange={e=>setNewPwd(e.target.value)} placeholder="At least 6 characters" style={{...inp,fontSize:13}}/>
      </div>
      <div style={{marginBottom:8}}>
        <div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4}}>CONFIRM NEW PASSWORD</div>
        <input type="password" value={confirmPwd} onChange={e=>setConfirmPwd(e.target.value)} placeholder="Re-enter password" style={{...inp,fontSize:13}}/>
      </div>
      {pwdErr&&<div style={{fontSize:11,color:T.red,marginBottom:8}}>{pwdErr}</div>}
      {pwdMsg&&<div style={{fontSize:11,color:T.green,marginBottom:8}}>{pwdMsg}</div>}
      <button onClick={changePassword} disabled={pwdSaving} style={{...btnGhost,width:"100%",color:T.accent,borderColor:T.accent,opacity:pwdSaving?0.6:1}}>{pwdSaving?"Saving…":"Update password"}</button>
    </>
  );

  const mfaSection=(
    <>
      {mfaLoading?(
        <div style={{fontSize:12,color:T.muted}}>Checking status…</div>
      ):mfaEnrolling?(
        <>
          <div style={{fontSize:12,color:T.sub,marginBottom:10}}>Scan this QR code with an authenticator app (Google Authenticator, Authy, 1Password), then enter the 6-digit code it shows.</div>
          {mfaQr&&<div style={{background:"#fff",padding:10,borderRadius:8,marginBottom:10,display:"inline-block"}} dangerouslySetInnerHTML={{__html:mfaQr}}/>}
          {mfaSecret&&<div style={{fontSize:10,color:T.muted,marginBottom:10,wordBreak:"break-all"}}>Can't scan? Enter this key manually: <b>{mfaSecret}</b></div>}
          <input value={mfaCode} onChange={e=>setMfaCode(e.target.value)} placeholder="6-digit code" style={{...inp,fontSize:13,marginBottom:8}}/>
          {mfaErr&&<div style={{fontSize:11,color:T.red,marginBottom:8}}>{mfaErr}</div>}
          <div style={{display:"flex",gap:8}}>
            <button onClick={confirmMfaEnroll} disabled={mfaBusy} style={{...btnGhost,flex:1,color:T.accent,borderColor:T.accent,opacity:mfaBusy?0.6:1}}>{mfaBusy?"Verifying…":"Verify and enable"}</button>
            <button onClick={cancelMfaEnroll} style={{...btnGhost,flex:1,color:T.muted,borderColor:T.border}}>Cancel</button>
          </div>
        </>
      ):mfaFactors.length>0?(
        <>
          <div style={{fontSize:12,color:T.green,fontWeight:700,marginBottom:10}}>✓ Two-factor authentication is enabled</div>
          {mfaErr&&<div style={{fontSize:11,color:T.red,marginBottom:8}}>{mfaErr}</div>}
          {mfaMsg&&<div style={{fontSize:11,color:T.green,marginBottom:8}}>{mfaMsg}</div>}
          <button onClick={()=>disableMfa(mfaFactors[0].id)} disabled={mfaBusy} style={{...btnGhost,width:"100%",color:T.red,borderColor:T.red,opacity:mfaBusy?0.6:1}}>{mfaBusy?"Disabling…":"Disable two-factor authentication"}</button>
        </>
      ):(
        <>
          <div style={{fontSize:12,color:T.sub,marginBottom:10}}>Add an authenticator app as a second step when signing in — recommended for any account handling real financial records.</div>
          {mfaErr&&<div style={{fontSize:11,color:T.red,marginBottom:8}}>{mfaErr}</div>}
          <button onClick={startMfaEnroll} disabled={mfaBusy} style={{...btnGhost,width:"100%",color:T.accent,borderColor:T.accent,opacity:mfaBusy?0.6:1}}>{mfaBusy?"Starting…":"Enable two-factor authentication"}</button>
        </>
      )}
    </>
  );

  const personalSection=(
    <>
      <div style={{marginBottom:8}}>
        <div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4}}>NAME</div>
        <input value={editName?tempName:displayName} onFocus={()=>{setTempName(profileData.name||"");setEditName(true);}} onChange={e=>setTempName(e.target.value)} onBlur={()=>{saveProfile({name:tempName.trim()||displayName});setEditName(false);}} style={{...inp,fontSize:13}}/>
      </div>
      <div style={{marginBottom:8}}>
        <div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4}}>PHONE</div>
        <input value={tempPhone} onChange={e=>{setTempPhone(e.target.value);saveProfile({phone:e.target.value});}} placeholder="+92 300 0000000" style={{...inp,fontSize:13}}/>
      </div>
      <div>
        <div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4}}>EMAIL</div>
        <input value={tempEmail} onChange={e=>{setTempEmail(e.target.value);saveProfile({email:e.target.value});}} placeholder="you@example.com" style={{...inp,fontSize:13}}/>
      </div>
    </>
  );

  if(isDesktop){
    return(
      <div>
        <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:14,padding:20,marginBottom:20,display:"flex",alignItems:"center",gap:16}}>
          <div style={{width:64,height:64,borderRadius:"50%",background:T.accentLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:800,color:T.accent,flexShrink:0}}>{initials}</div>
          <div>
            <div style={{fontSize:18,fontWeight:800,color:T.text}}>{displayName}</div>
            <div style={{fontSize:12,color:T.muted,marginTop:2}}>{contactLine||"No contact info yet"}</div>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
            <ProfileRow icon="ti-user" label="Personal information" sub="Name, phone, email" onClick={()=>setOpenRow(o=>o==="personal"?null:"personal")} expanded={openRow==="personal"}>{personalSection}</ProfileRow>
          </div>
          <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
            <ProfileRow icon="ti-lock" label="Change password" sub="Update your account password" onClick={()=>setOpenRow(o=>o==="password"?null:"password")} expanded={openRow==="password"}>{passwordSection}</ProfileRow>
            <ProfileRow icon="ti-shield-lock" label="Two-factor authentication" sub={mfaFactors.length>0?"Enabled":"Not enabled"} onClick={()=>setOpenRow(o=>o==="mfa"?null:"mfa")} expanded={openRow==="mfa"}>{mfaSection}</ProfileRow>
          </div>
          <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
            <ProfileRow icon="ti-settings" label="Company settings" sub="Currency, accounts, backup & more" onClick={()=>onNavigate&&onNavigate("Settings")}/>
          </div>
          {isAdmin&&(
            <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
              <ProfileRow icon="ti-shield-lock" label="Admin panel" sub="Enable or disable features" onClick={()=>onNavigate&&onNavigate("AdminPanel")}/>
            </div>
          )}
          <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",opacity:0.5}}>
            <ProfileRow icon="ti-help-circle" label="Help and support" sub="Coming soon"/>
          </div>
        </div>

        <button onClick={onSignOut} style={{marginTop:20,background:T.redLight,color:T.red,border:"none",borderRadius:12,padding:"13px",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit",width:"100%"}}><i className="ti ti-logout" style={{fontSize:15,marginRight:6}}/>Log out</button>
      </div>
    );
  }

  return(
    <div>
      {/* Avatar with settings-gear badge, name, contact line — matches reference style */}
      <div style={{textAlign:"center",marginBottom:24,paddingTop:8}}>
        <div style={{position:"relative",width:88,height:88,margin:"0 auto 14px"}}>
          <div style={{width:88,height:88,borderRadius:"50%",background:T.accentLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,fontWeight:800,color:T.accent}}>{initials}</div>
          <div onClick={()=>onNavigate&&onNavigate("Settings")} style={{position:"absolute",bottom:-2,right:-2,width:32,height:32,borderRadius:"50%",background:"#fff",border:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 6px rgba(0,0,0,0.12)",cursor:"pointer"}}>
            <i className="ti ti-settings" style={{fontSize:16,color:T.sub}}/>
          </div>
        </div>
        <div style={{fontSize:20,fontWeight:800,color:T.text}}>{displayName}</div>
        <div style={{fontSize:13,color:T.muted,marginTop:4}}>{contactLine||"Add contact info below"}</div>
      </div>

      <div style={{fontSize:12,fontWeight:800,color:T.text,marginBottom:8,paddingLeft:2}}>Account</div>
      <div style={{background:"#fff",borderRadius:16,border:`1px solid ${T.border}`,marginBottom:20,overflow:"hidden"}}>
        <ProfileRow icon="ti-user" label="Personal information" onClick={()=>setOpenRow(o=>o==="personal"?null:"personal")} expanded={openRow==="personal"}>{personalSection}</ProfileRow>
        <div style={{height:1,background:T.border,marginLeft:70}}/>
        <ProfileRow icon="ti-lock" label="Change password" onClick={()=>setOpenRow(o=>o==="password"?null:"password")} expanded={openRow==="password"}>{passwordSection}</ProfileRow>
        <ProfileRow icon="ti-shield-lock" label="Two-factor authentication" onClick={()=>setOpenRow(o=>o==="mfa"?null:"mfa")} expanded={openRow==="mfa"}>{mfaSection}</ProfileRow>
      </div>

      <div style={{fontSize:12,fontWeight:800,color:T.text,marginBottom:8,paddingLeft:2}}>App settings</div>
      <div style={{background:"#fff",borderRadius:16,border:`1px solid ${T.border}`,marginBottom:24,overflow:"hidden"}}>
        <ProfileRow icon="ti-settings" label="Company settings" onClick={()=>onNavigate&&onNavigate("Settings")}/>
        {isAdmin&&(<>
          <div style={{height:1,background:T.border,marginLeft:70}}/>
          <ProfileRow icon="ti-shield-lock" label="Admin panel" onClick={()=>onNavigate&&onNavigate("AdminPanel")}/>
        </>)}
        <div style={{height:1,background:T.border,marginLeft:70}}/>
        <div style={{opacity:0.5}}><ProfileRow icon="ti-help-circle" label="Help and support" sub="Coming soon"/></div>
      </div>

      <button onClick={onSignOut} style={{background:T.redLight,color:T.red,border:"none",borderRadius:14,padding:"15px",fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit",width:"100%"}}><i className="ti ti-logout" style={{fontSize:16,marginRight:6}}/>Logout</button>
    </div>
  );
}

// ─── Files Screen ─────────────────────────────────────────────────────────────
function FilesScreen({onBack,onNavigate,files,onUpload,onDelete,onRestore,onPermanentDelete,onRename,onMove,onCopy,onMerge,isDesktop,onStartRegistration}){
  const[search,setSearch]=useState("");
  const[uploadMenu,setUploadMenu]=useState(false);
  const[showUploadModal,setShowUploadModal]=useState(false);
  const[selected,setSelected]=useState([]);
  const[busy,setBusy]=useState(false);
  const[previewFile,setPreviewFile]=useState(null);
  const[viewMode,setViewMode]=useState("active"); // "active" | "deleted"
  const[filterOpen,setFilterOpen]=useState(false);
  const[typeFilter,setTypeFilter]=useState(""); // "" | "image" | "pdf"
  // Folders were removed entirely per request — same underlying files,
  // Copy no longer files into one.
  const copyFile=async(id)=>{
    if(!onCopy)return;
    setBusy(true);await onCopy(id);setBusy(false);
  };

  const addFile=async(file)=>{setBusy(true);await onUpload(file);setBusy(false);};
  const deleteFile=async(id)=>{setBusy(true);await onDelete(id);setSelected(s=>s.filter(x=>x!==id));setBusy(false);};
  const restoreFile=async(id)=>{setBusy(true);await onRestore(id);setSelected(s=>s.filter(x=>x!==id));setBusy(false);};
  const permanentDeleteFile=async(id)=>{
    if(!window.confirm("Permanently delete this file? This can't be undone."))return;
    setBusy(true);await onPermanentDelete(id);setSelected(s=>s.filter(x=>x!==id));setBusy(false);
  };
  const[editingFileId,setEditingFileId]=useState(null);
  const[editingFileName,setEditingFileName]=useState("");
  const startInlineRename=(f)=>{setEditingFileId(f.id);setEditingFileName(f.name);};
  const commitInlineRename=async()=>{
    const trimmed=editingFileName.trim();
    if(trimmed&&editingFileId)await onRename(editingFileId,trimmed);
    setEditingFileId(null);
  };
  const renameFile=async(id)=>{
    const f=files.find(x=>x.id===id);
    if(!f)return;
    startInlineRename(f);
  };
  const registerEntry=(fileId)=>{
    try{
      if(fileId)localStorage.setItem("rr_pending_attachment",fileId);else localStorage.removeItem("rr_pending_attachment");
      // Carry the AI suggestion (if any) alongside the attachment id so the
      // New Entry form can pre-fill amount/description — otherwise "Post
      // voucher" is no faster than "Register" was, since you'd still have
      // to retype everything the AI already read off the document.
      const f=files.find(x=>x.id===fileId);
      if(f&&hasSuggestion(f)){
        localStorage.setItem("rr_pending_attachment_suggestion",JSON.stringify({amount:f.aiAmount,supplier:f.aiSupplier,invoiceNo:f.aiInvoiceNo}));
      }else{
        localStorage.removeItem("rr_pending_attachment_suggestion");
      }
    }catch{}
    if(onNavigate)onNavigate(isDesktop?"NewVoucher":"Transactions");
  };
  const[viewing,setViewing]=useState(null);
  const[inlinePreview,setInlinePreview]=useState(null);
  // A file "has a suggestion" once AI analysis has actually run on it AND
  // found something usable — aiAnalyzed alone isn't enough, since a run
  // that came back empty (unreadable scan) shouldn't count as a suggestion.
  const hasSuggestion=f=>f.aiAnalyzed&&(f.aiSupplier||f.aiAmount!=null);
  const[suggestionFilter,setSuggestionFilter]=useState(""); // "" | "with" | "without"
  const filtered=files
    .filter(f=>viewMode==="deleted"?!!f.deletedAt:!f.deletedAt)
    .filter(f=>!search||f.name.toLowerCase().includes(search.toLowerCase())||(f.aiSupplier||"").toLowerCase().includes(search.toLowerCase()))
    .filter(f=>!typeFilter||(typeFilter==="image"?(f.type||"").startsWith("image"):!(f.type||"").startsWith("image")))
    .filter(f=>!suggestionFilter||(suggestionFilter==="with"?hasSuggestion(f):!hasSuggestion(f)));
  // Default to previewing the first file in the current list — an empty
  // preview pane on open just wastes a click most of the time. Re-syncs
  // whenever the visible list changes (filters, folder switch, deletions)
  // as long as the person hasn't deliberately picked something else that's
  // still in view.
  useEffect(()=>{
    if(previewFile&&filtered.some(f=>f.id===previewFile.id))return;
    setPreviewFile(filtered[0]||null);
  },[filtered.map(f=>f.id).join(",")]);
  const activeCount=files.filter(f=>!f.deletedAt).length;
  const deletedCount=files.filter(f=>!!f.deletedAt).length;
  const toggleSel=id=>setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);

  // Merge selected image files into a single combined image and save it straight
  // to the Inbox — no new tab, no print dialog, no extra questions. Just the
  // original file "pages" stacked into one, exactly as selected.
  const selectedImageIds=selected.filter(id=>{const f=files.find(x=>x.id===id);return f&&f.type&&f.type.startsWith("image");});
  const mergeSelected=async()=>{
    if(selectedImageIds.length<2)return;
    setBusy(true);
    await onMerge(selectedImageIds);
    setSelected([]);
    setBusy(false);
  };
  const deleteSelected=async()=>{
    setBusy(true);
    for(const id of selected)await onDelete(id);
    setSelected([]);
    setBusy(false);
  };
  // "Start registration" opens the real multi-item queue (forward/back through
  // each selected file) instead of only registering the first one.
  const startRegistration=()=>{
    if(!selected.length)return;
    if(onStartRegistration)onStartRegistration(selected);
    else registerEntry(selected[0]);
  };

  if(isDesktop){
    // marginRight:-32 used to compensate for the preview panel sitting in
    // normal flex flow inside this page's own right padding — now that
    // ResizableSplit's panel is always position:fixed to the window's true
    // right edge regardless of this wrapper, that negative margin only
    // shifted the file list itself out of alignment with where the resize
    // handle actually sits, which is what read as the splitter "not
    // properly moving."
    return(
      <div style={{height:"calc(100vh - 100px)",display:"flex",flexDirection:"column",minHeight:0}}>
        <div style={{flex:1,minHeight:0,display:"flex"}}>
        <ResizableSplit defaultRightWidth={640} minRightWidth={380} maxRightWidth={1100} collapsible collapseLabel="Hide attachment" expandLabel="Show attachment" left={(
          <div style={{paddingRight:16,minWidth:0,height:"100%",overflowY:"auto",display:"flex",flexDirection:"column"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexShrink:0}}>
              <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Voucher inbox</h1>
              <button onClick={()=>setShowUploadModal(true)} disabled={busy} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 14px",fontSize:12,fontWeight:600,color:T.sub,cursor:busy?"wait":"pointer",fontFamily:"inherit",display:"inline-flex",alignItems:"center"}}>
                <i className="ti ti-upload" style={{fontSize:13,marginRight:5}}/>Upload
              </button>
            </div>
            {showUploadModal&&(
              <UploadDropModal title="Upload to Inbox" accept="image/*,.pdf,.doc,.docx,.xlsx,.csv" multiple busy={busy}
                onFiles={async files=>{for(const f of files)await addFile(f);setShowUploadModal(false);}}
                onClose={()=>setShowUploadModal(false)}/>
            )}
            <p style={{fontSize:12,color:T.muted,marginBottom:12,flexShrink:0}}>{viewMode==="deleted"?"Deleted files — restore or permanently delete.":""}</p>

            {viewMode==="active"&&(()=>{
              // Counts computed from everything except the suggestion filter
              // itself, so switching tabs doesn't change the other tabs' own counts.
              const base=files.filter(f=>!f.deletedAt)
                .filter(f=>!search||f.name.toLowerCase().includes(search.toLowerCase())||(f.aiSupplier||"").toLowerCase().includes(search.toLowerCase()))
                .filter(f=>!typeFilter||(typeFilter==="image"?(f.type||"").startsWith("image"):!(f.type||"").startsWith("image")));
              const withCount=base.filter(hasSuggestion).length;
              const withoutCount=base.length-withCount;
              return(
                <div style={{display:"flex",gap:6,marginBottom:12,flexShrink:0}}>
                  {[["","All",base.length],["with","With suggestions",withCount],["without","Without suggestions",withoutCount]].map(([id,label,count])=>(
                    <button key={id} onClick={()=>setSuggestionFilter(id)} style={{background:suggestionFilter===id?T.accent:"none",color:suggestionFilter===id?"#fff":T.sub,border:`1px solid ${suggestionFilter===id?T.accent:T.border}`,borderRadius:7,padding:"6px 12px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{label} ({count})</button>
                  ))}
                </div>
              );
            })()}


            {/* A select-all checkbox is always visible on the left. When
                nothing's selected, the search box fills the row. Once
                something's selected, the search box is replaced by the
                selection count + actions — filter and deleted-toggle stay
                put on the right either way. */}
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12,flexShrink:0}}>
              <input type="checkbox" title={selected.length&&selected.length===filtered.length?"Deselect all":"Select all"} checked={filtered.length>0&&selected.length===filtered.length} onChange={()=>setSelected(s=>s.length===filtered.length?[]:filtered.map(f=>f.id))} style={{width:16,height:16,cursor:filtered.length?"pointer":"default",accentColor:T.accent,flexShrink:0}} disabled={!filtered.length}/>
              {selected.length>0?(
                <div style={{display:"flex",gap:8,alignItems:"center",flex:1,minWidth:0}}>
                  <span style={{fontSize:12,fontWeight:700,color:T.accent,whiteSpace:"nowrap"}}>{selected.length} selected</span>
                  {viewMode==="active"?(<>
                    <button onClick={startRegistration} disabled={busy} style={{background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"9px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>Start registration</button>
                    <Menu3 items={[
                      ...(selectedImageIds.length>=2?[{label:"Merge",action:mergeSelected}]:[]),
                      {label:"Delete",color:T.red,action:deleteSelected},
                    ]}/>
                  </>):(
                    <button onClick={async()=>{setBusy(true);for(const id of selected)await onRestore(id);setSelected([]);setBusy(false);}} disabled={busy} style={{...btnSm,background:T.greenBg,border:`1px solid ${T.green}`,color:T.green}}>Restore</button>
                  )}
                </div>
              ):(
                <div style={{position:"relative",flex:1,minWidth:120}}>
                  <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:T.muted}}>🔍</span>
                  <input placeholder="Search files..." value={search} onChange={e=>setSearch(e.target.value)} style={{...inp,paddingLeft:38}}/>
                </div>
              )}
              <div style={{position:"relative",flexShrink:0}}>
                <button onClick={()=>setFilterOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:6,border:`1px solid ${typeFilter?T.accent:T.border}`,borderRadius:8,padding:"9px 14px",background:typeFilter?T.accentLight:"#fff",cursor:"pointer",fontFamily:"inherit",color:typeFilter?T.accent:T.sub,fontSize:12,fontWeight:600,whiteSpace:"nowrap"}}>
                  <i className="ti ti-filter" style={{fontSize:13}}/>Filter{typeFilter&&` (1)`}
                </button>
                {filterOpen&&(<>
                  <div onClick={()=>setFilterOpen(false)} style={{position:"fixed",inset:0,zIndex:298}}/>
                  <div style={{position:"absolute",right:0,top:38,background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,zIndex:299,minWidth:180,boxShadow:"0 8px 24px rgba(0,0,0,0.14)",padding:10}}>
                    <div style={{fontSize:10,color:T.muted,fontWeight:700,textTransform:"uppercase",marginBottom:6,padding:"0 4px"}}>File type</div>
                    {[["","All files"],["image","Images only"],["pdf","Documents only"]].map(([id,label])=>(
                      <div key={id} onClick={()=>{setTypeFilter(id);setFilterOpen(false);}} style={{padding:"8px 10px",fontSize:12,cursor:"pointer",borderRadius:7,background:typeFilter===id?T.accentLight:"transparent",color:typeFilter===id?T.accent:T.text,fontWeight:typeFilter===id?700:400}}>{label}</div>
                    ))}
                  </div>
                </>)}
              </div>
              <button onClick={()=>{setViewMode(v=>v==="deleted"?"active":"deleted");setSelected([]);}} title={viewMode==="deleted"?"Back to Inbox":`Deleted (${deletedCount})`} style={{position:"relative",flexShrink:0,background:viewMode==="deleted"?T.accent:"none",border:`1px solid ${viewMode==="deleted"?T.accent:T.border}`,borderRadius:8,width:36,height:36,cursor:"pointer",color:viewMode==="deleted"?"#fff":T.sub,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <i className="ti ti-trash" style={{fontSize:15}}/>
                {deletedCount>0&&viewMode!=="deleted"&&<span style={{position:"absolute",top:-4,right:-4,background:T.red,color:"#fff",borderRadius:10,fontSize:9,fontWeight:700,minWidth:15,height:15,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{deletedCount}</span>}
              </button>
            </div>

            <div style={{border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden",flexShrink:0}}>
              {!filtered.length&&<div style={{textAlign:"center",color:T.muted,padding:30,fontSize:13}}>{viewMode==="deleted"?"No deleted files.":"No files yet."}</div>}
              {filtered.map((f,i)=>{
                const isFocused=previewFile&&previewFile.id===f.id;
                return(
                  <div key={f.id} onClick={()=>setPreviewFile(f)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",cursor:"pointer",borderBottom:i<filtered.length-1?`1px solid ${T.border}`:"none",background:isFocused?T.accentLight:selected.includes(f.id)?"#FAF9F7":"#fff",transition:"background 0.1s"}}>
                    <input type="checkbox" checked={selected.includes(f.id)} onClick={e=>e.stopPropagation()} onChange={()=>toggleSel(f.id)} style={{width:15,height:15,cursor:"pointer",accentColor:T.accent,flexShrink:0}}/>
                    <div onDoubleClick={e=>{e.stopPropagation();startInlineRename(f);}} title="Double-click to rename" style={{flex:1,minWidth:0,cursor:"text"}}>
                      {editingFileId===f.id?(
                        <input
                          autoFocus
                          value={editingFileName}
                          onClick={e=>e.stopPropagation()}
                          onChange={e=>setEditingFileName(e.target.value)}
                          onBlur={commitInlineRename}
                          onKeyDown={e=>{if(e.key==="Enter")e.target.blur();if(e.key==="Escape")setEditingFileId(null);}}
                          style={{fontSize:13,fontWeight:600,color:T.text,width:"100%",border:`1px solid ${T.accent}`,borderRadius:6,padding:"2px 6px",fontFamily:"inherit",background:"#fff"}}
                        />
                      ):(
                        <div style={{fontSize:12,fontWeight:600,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.aiSupplier||f.name}</div>
                      )}
                      <div style={{fontSize:10,color:T.muted,marginTop:2,display:"flex",gap:6,alignItems:"center",overflow:"hidden"}}>
                        {hasSuggestion(f)?(<>
                          {f.aiAmount!=null&&<span style={{fontWeight:700,color:T.text}}>{fmt(f.aiAmount)}</span>}
                          <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</span>
                        </>):(
                          <span>{f.month} {f.year}</span>
                        )}
                        {f.aiAnalyzed&&!hasSuggestion(f)&&<span style={{color:T.muted}}>· no suggestion</span>}
                        {!f.aiAnalyzed&&getAnthropicKey()&&((f.type||"").startsWith("image")||f.type==="application/pdf")&&<span style={{color:T.accent}}>· analyzing…</span>}
                      </div>
                    </div>
                    {viewMode!=="deleted"&&(
                      <button onClick={e=>{e.stopPropagation();registerEntry(f.id);}} title={hasSuggestion(f)?"Register with AI-extracted details pre-filled":"Register this file as a new voucher"} style={hasSuggestion(f)?{background:T.accent,border:`1px solid ${T.accent}`,color:"#fff",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0,whiteSpace:"nowrap"}:{background:"none",border:`1px solid ${T.accent}`,color:T.accent,borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0,whiteSpace:"nowrap"}}>{hasSuggestion(f)?"Post voucher":"Register"}</button>
                    )}
                    <Menu3 items={viewMode==="deleted"?[
                      {label:"Restore",color:T.green,action:()=>restoreFile(f.id)},
                      {label:"Delete permanently",color:T.red,action:()=>permanentDeleteFile(f.id)},
                    ]:[
                      {label:"Rename",action:()=>renameFile(f.id)},
                      {label:"Copy",action:()=>copyFile(f.id)},
                      {label:"Delete",color:T.red,action:()=>deleteFile(f.id)},
                    ]}/>
                  </div>
                );
              })}
            </div>
          </div>
        )} right={(
          <div style={{height:"100%",display:"flex",flexDirection:"column",background:"#fff",borderLeft:`1px solid ${T.border}`}}>
            {previewFile?(
              <>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderBottom:`1px solid ${T.border}`,flexShrink:0,gap:8}}>
                  {editingFileId===previewFile.id?(
                    <input
                      autoFocus
                      value={editingFileName}
                      onChange={e=>setEditingFileName(e.target.value)}
                      onBlur={commitInlineRename}
                      onKeyDown={e=>{if(e.key==="Enter")e.target.blur();if(e.key==="Escape")setEditingFileId(null);}}
                      style={{fontSize:13,fontWeight:700,color:T.text,flex:1,minWidth:0,border:`1px solid ${T.accent}`,borderRadius:6,padding:"3px 7px",fontFamily:"inherit",background:"#fff"}}
                    />
                  ):(
                    <span onDoubleClick={()=>startInlineRename(previewFile)} title="Double-click to rename" style={{fontSize:13,color:T.text,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"text",flex:1,minWidth:0}}>{previewFile.name}</span>
                  )}
                </div>
                {/* Was justifyContent:"flex-end" — the one thing that made this
                    preview pane look mis-aligned next to Register-voucher's
                    (and New Entry's) matching panel, which both center it. */}
                <div style={{flex:1,minHeight:0,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",background:"#fafafa"}}>
                  <SignedFileViewer storagePath={previewFile.storagePath} type={previewFile.type} name={previewFile.name} style={{width:"100%",height:"100%"}}/>
                </div>
              </>
            ):(
              <div style={{textAlign:"center",color:T.muted,fontSize:12,padding:"60px 10px"}}>Select a file to preview it here.</div>
            )}
          </div>
        )}/>
        </div>
      </div>
    );
  }

  return(
    <div style={{background:T.bg,minHeight:"100vh",fontFamily:"system-ui,sans-serif",maxWidth:430,margin:"0 auto",paddingBottom:40}}>
      {viewing&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:500,display:"flex",flexDirection:"column"}}>
          <div style={{padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(0,0,0,0.5)"}}>
            <div style={{fontSize:12,color:"#fff",fontWeight:600,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{viewing.name}</div>
            <button onClick={()=>setViewing(null)} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,color:"#fff",fontSize:13,cursor:"pointer",padding:"5px 12px",fontWeight:600,marginLeft:10}}>✕ Close</button>
          </div>
          <SignedFileViewer storagePath={viewing.storagePath} type={viewing.type} name={viewing.name} style={{flex:1,objectFit:"contain",padding:10}}/>
        </div>
      )}
      <BackHeader title="Inbox" sub="UPLOAD & MANAGE FILES" onBack={onBack}/>
      <div style={{padding:16}}>
        {busy&&<div style={{textAlign:"center",fontSize:11,color:T.accent,marginBottom:10}}>Working…</div>}
        {/* Upload (small) + Deleted trash toggle — same row */}
        <div style={{position:"relative",display:"flex",gap:8,marginBottom:14}}>
          <button onClick={()=>setUploadMenu(o=>!o)} disabled={busy} style={{...btnGhost,flex:1,padding:"9px 10px",fontSize:12,color:T.sub,borderColor:T.border,background:"#F3F4F6"}}>⬆ Upload</button>
          <button onClick={()=>{setViewMode(v=>v==="deleted"?"active":"deleted");setSelected([]);}} title={viewMode==="deleted"?"Back to Inbox":`Deleted (${deletedCount})`} style={{position:"relative",...btnGhost,width:44,flex:"0 0 auto",padding:"9px 10px",display:"flex",alignItems:"center",justifyContent:"center",background:viewMode==="deleted"?T.accent:"#F3F4F6",borderColor:viewMode==="deleted"?T.accent:T.border,color:viewMode==="deleted"?"#fff":T.sub}}>
            <i className="ti ti-trash" style={{fontSize:15}}/>
            {deletedCount>0&&viewMode!=="deleted"&&<span style={{position:"absolute",top:-4,right:-4,background:T.red,color:"#fff",borderRadius:10,fontSize:9,fontWeight:700,minWidth:15,height:15,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{deletedCount}</span>}
          </button>
          {uploadMenu&&(<>
            <div onClick={()=>setUploadMenu(false)} style={{position:"fixed",inset:0,zIndex:290}}/>
            <div style={{position:"absolute",left:0,top:"100%",marginTop:6,width:"calc(50% - 4px)",background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,zIndex:300,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",overflow:"hidden"}}>
              {[
                {icon:"🖼️",label:"Photo Gallery",accept:"image/*"},
                {icon:"📷",label:"Camera",accept:"image/*",capture:"environment"},
                {icon:"📄",label:"Document",accept:".pdf,.doc,.docx,.xlsx,.csv"},
              ].map((opt,i)=>(
                <label key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"11px 12px",cursor:"pointer",borderBottom:i<2?`1px solid ${T.border}`:"none",fontSize:12,fontWeight:600,color:T.text}}>
                  <span style={{fontSize:15}}>{opt.icon}</span>{opt.label}
                  <input type="file" accept={opt.accept} capture={opt.capture} style={{display:"none"}} onChange={e=>{if(e.target.files[0])addFile(e.target.files[0]);setUploadMenu(false);}}/>
                </label>
              ))}
            </div>
          </>)}
        </div>

        {/* Search */}
        <div style={{position:"relative",marginBottom:12}}>
          <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:T.muted}}>🔍</span>
          <input placeholder="Search files..." value={search} onChange={e=>setSearch(e.target.value)} style={{...inp,paddingLeft:38}}/>
        </div>

        {/* Selection bar */}
        {selected.length>0&&(
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:T.accentLight,border:`1px solid ${T.accent}`,borderRadius:10,padding:"8px 12px",marginBottom:10}}>
            <span style={{fontSize:12,fontWeight:700,color:T.accent}}>{selected.length} selected</span>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setSelected([])} style={{...btnSm,background:T.border,color:T.sub}}>Clear</button>
              {selectedImageIds.length>=2&&<button onClick={mergeSelected} disabled={busy} style={{...btnSm,background:T.accent,color:"#fff"}}>📄 Merge</button>}
              <button onClick={deleteSelected} disabled={busy} style={{...btnSm,background:T.redLight,color:T.red}}>🗑 Delete</button>
            </div>
          </div>
        )}

        {/* File list — clean divided table style, like Accounts/Ledger */}
        {!filtered.length&&<div style={{textAlign:"center",color:T.muted,padding:30,fontSize:13}}>No files yet. Tap Upload to add one.</div>}
        {filtered.length>0&&(
          <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
            {filtered.map((f,i)=>(
              <div key={f.id}>
                <div className="rr-table-row" style={{padding:"12px 14px",display:"flex",alignItems:"center",gap:10,borderBottom:(i<filtered.length-1||inlinePreview===f.id)?`1px solid ${T.border}`:"none",background:selected.includes(f.id)?T.accentLight:"#fff"}}>
                  <input type="checkbox" checked={selected.includes(f.id)} onChange={()=>toggleSel(f.id)} style={{width:15,height:15,cursor:"pointer",accentColor:T.accent,flexShrink:0}}/>
                  <button onClick={()=>setInlinePreview(p=>p===f.id?null:f.id)} title="Preview" style={{background:inlinePreview===f.id?T.accentLight:"none",border:"none",cursor:"pointer",color:T.accent,fontSize:14,padding:"3px 5px",borderRadius:6,flexShrink:0}}>👁</button>
                  <div onDoubleClick={()=>renameFile(f.id)} title="Double-click to rename" style={{flex:1,minWidth:0,cursor:"text"}}>
                    <div style={{fontSize:13,fontWeight:600,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
                    <div style={{fontSize:10,color:T.muted,marginTop:2}}>{f.month} {f.year}</div>
                  </div>
                  <button onClick={()=>registerEntry(f.id)} style={{background:"none",border:`1px solid ${T.accent}`,color:T.accent,borderRadius:8,padding:"6px 10px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>Register</button>
                  <Menu3 items={[
                    {label:"View",action:()=>setViewing(f)},
                    {label:"Rename",action:()=>renameFile(f.id)},
                    {label:"Copy",action:()=>copyFile(f.id)},
                    {label:"Delete",color:T.red,action:()=>deleteFile(f.id)},
                  ]}/>
                </div>
                {inlinePreview===f.id&&(
                  <div onDoubleClick={()=>{setViewing(f);setInlinePreview(null);}} title="Double-tap for full view"
                    style={{padding:"10px 14px",background:T.bg,borderBottom:i<filtered.length-1?`1px solid ${T.border}`:"none",cursor:"zoom-in",display:"flex",justifyContent:"center"}}>
                    <SignedFileViewer storagePath={f.storagePath} type={f.type} name={f.name} style={{maxHeight:160,maxWidth:"100%",borderRadius:8,border:`1px solid ${T.border}`}}/>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Disabled Screen ──────────────────────────────────────────────────────────
// A screen crashing used to just go blank with no trace of why. This catches
// it and shows what actually broke, so "it's just blank" becomes something
// fixable instead of a mystery.
class ScreenErrorBoundary extends React.Component{
  constructor(props){super(props);this.state={error:null};}
  static getDerivedStateFromError(error){return{error};}
  componentDidCatch(error,info){
    try{
      const bugs=JSON.parse(localStorage.getItem("rr_bug_log")||"[]");
      bugs.push({id:Date.now()+Math.random().toString(36).slice(2),ts:new Date().toISOString(),type:"SCREEN_CRASH",message:error&&error.message,detail:String((info&&info.componentStack)||"").slice(0,500),context:this.props.name||"",resolved:false});
      localStorage.setItem("rr_bug_log",JSON.stringify(bugs.slice(-100)));
    }catch{}
  }
  render(){
    if(this.state.error){
      return(
        <div style={{padding:30,textAlign:"center"}}>
          <div style={{fontSize:36,marginBottom:10}}>⚠️</div>
          <div style={{fontSize:15,fontWeight:700,color:T.text,marginBottom:6}}>{this.props.name||"This screen"} hit an error</div>
          <div style={{fontSize:12,color:T.muted,marginBottom:16,fontFamily:"monospace",background:T.bg,borderRadius:8,padding:10,textAlign:"left",wordBreak:"break-word"}}>{String(this.state.error&&this.state.error.message||this.state.error)}</div>
          <button onClick={()=>this.setState({error:null})} style={{background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"9px 18px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function DisabledScreen({title,onBack}){
  return(
    <div style={{background:T.bg,minHeight:"100vh",fontFamily:"system-ui,sans-serif",maxWidth:430,margin:"0 auto"}}>
      <BackHeader title={title} sub="FEATURE DISABLED" onBack={onBack}/>
      <div style={{padding:40,textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:16}}>🔒</div>
        <div style={{fontSize:16,fontWeight:700,color:T.text,marginBottom:8}}>{title} is turned off</div>
        <div style={{fontSize:13,color:T.muted,marginBottom:24,lineHeight:1.6}}>This feature has been disabled in the Admin Panel. Contact your admin to enable it.</div>
      </div>
    </div>
  );
}

// ─── Bug Log Screen ───────────────────────────────────────────────────────────
function BugLogScreen({onBack,isDesktop=false}){
  const[bugs,setBugs]=React.useState(()=>getBugs().reverse());
  const[filter,setFilter]=React.useState("all"); // all | unresolved | JS_ERROR | ACCOUNTING | DB_ERROR | PROMISE
  const[search,setSearch]=React.useState("");

  const refresh=()=>setBugs(getBugs().reverse());
  const markResolved=(id)=>{
    const updated=getBugs().map(b=>b.id===id?{...b,resolved:true}:b);
    saveBugsRaw(updated);refresh();
  };
  const deleteOne=(id)=>{
    saveBugsRaw(getBugs().filter(b=>b.id!==id));refresh();
  };
  const clearAll=()=>{if(window.confirm("Clear all bug logs?")){{saveBugsRaw([]);refresh();}}};
  const clearResolved=()=>{saveBugsRaw(getBugs().filter(b=>!b.resolved));refresh();};

  const TYPE_COLOR={JS_ERROR:"#dc2626",ACCOUNTING:"#d97706",DB_ERROR:"#7c3aed",PROMISE:"#0369a1",MANUAL:"#059669"};
  const TYPE_BG={JS_ERROR:"#fef2f2",ACCOUNTING:"#fffbeb",DB_ERROR:"#f5f3ff",PROMISE:"#f0f9ff",MANUAL:"#f0fdf4"};

  const filtered=bugs.filter(b=>{
    if(filter==="unresolved"&&b.resolved)return false;
    if(filter!=="all"&&filter!=="unresolved"&&b.type!==filter)return false;
    if(search&&!b.message.toLowerCase().includes(search.toLowerCase())&&!b.detail.toLowerCase().includes(search.toLowerCase()))return false;
    return true;
  });

  const counts={total:bugs.length,unresolved:bugs.filter(b=>!b.resolved).length};
  const typeCounts={};bugs.forEach(b=>{typeCounts[b.type]=(typeCounts[b.type]||0)+1;});

  const fmtTs=(ts)=>{
    const d=new Date(ts);
    return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short"})+", "+d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
  };

  return(
    <div style={isDesktop?{maxWidth:1000}:{background:T.bg,minHeight:"100vh",fontFamily:"system-ui,sans-serif",maxWidth:430,margin:"0 auto",paddingBottom:40}}>
      {isDesktop?(
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>Bug log</h1>
          <button onClick={onBack} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>‹ Back to settings</button>
        </div>
      ):<BackHeader title="Bug Log" sub={"ADMIN · "+counts.unresolved+" UNRESOLVED"} onBack={onBack}/>}

      {/* Summary bar */}
      <div style={{background:isDesktop?"#fff":"#1a1a18",border:isDesktop?`1px solid ${T.border}`:"none",borderRadius:isDesktop?10:0,padding:"10px 16px",display:"flex",gap:10,flexWrap:"wrap",marginBottom:isDesktop?12:0}}>
        {[["all","All",counts.total,"#93A8D0"],["unresolved","Unresolved",counts.unresolved,"#f87171"],
          ...Object.entries(typeCounts).map(([t,c])=>[t,t.replace("_"," "),c,TYPE_COLOR[t]||"#888"])
        ].map(([id,label,count,color])=>(
          <button key={id} onClick={()=>setFilter(id)}
            style={{background:filter===id?(isDesktop?T.bg:"rgba(255,255,255,0.15)"):"transparent",border:`1px solid ${filter===id?(isDesktop?T.border:"rgba(255,255,255,0.3)"):"transparent"}`,borderRadius:8,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit"}}>
            <span style={{fontSize:10,color,fontWeight:700}}>{label}</span>
            <span style={{fontSize:10,color:isDesktop?T.muted:"rgba(255,255,255,0.4)",marginLeft:5}}>{count}</span>
          </button>
        ))}
      </div>

      {/* Search + actions */}
      <div style={{padding:"10px 16px",background:"#fff",borderBottom:`1px solid ${T.border}`,display:"flex",gap:8,alignItems:"center"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search bugs..." style={{...inp,flex:1,fontSize:11,padding:"6px 10px"}}/>
        <button onClick={clearResolved} style={{fontSize:10,fontWeight:700,color:T.green,background:"#f0fdf4",border:`1px solid ${T.green}33`,borderRadius:8,padding:"6px 10px",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>Clear resolved</button>
        <button onClick={clearAll} style={{fontSize:10,fontWeight:700,color:T.red,background:"#fef2f2",border:`1px solid ${T.red}33`,borderRadius:8,padding:"6px 10px",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>Clear all</button>
      </div>

      <div style={{padding:"12px 16px"}}>
        {filtered.length===0&&(
          <div style={{textAlign:"center",padding:40,color:T.muted}}>
            <div style={{fontSize:32,marginBottom:8}}>✅</div>
            <div style={{fontSize:13,fontWeight:600}}>{bugs.length===0?"No bugs recorded yet":"No bugs match filter"}</div>
          </div>
        )}
        {filtered.map(b=>(
          <div key={b.id} style={{background:b.resolved?"#f9f9f7":TYPE_BG[b.type]||"#fff",border:`1px solid ${b.resolved?"#e0ddd4":TYPE_COLOR[b.type]||T.border}33`,borderLeft:`3px solid ${b.resolved?"#c0bdb4":TYPE_COLOR[b.type]||T.border}`,borderRadius:10,padding:"10px 12px",marginBottom:8,opacity:b.resolved?0.6:1}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{fontSize:9,fontWeight:800,color:b.resolved?"#888":TYPE_COLOR[b.type]||"#888",background:b.resolved?"#e8e7e0":(TYPE_BG[b.type]||"#f5f5f5"),padding:"2px 7px",borderRadius:5,textTransform:"uppercase",letterSpacing:0.5}}>{b.type}</span>
                {b.resolved&&<span style={{fontSize:9,fontWeight:700,color:T.green,background:"#f0fdf4",padding:"2px 7px",borderRadius:5}}>✓ Resolved</span>}
                <span style={{fontSize:9,color:T.muted}}>{fmtTs(b.ts)}</span>
              </div>
              <div style={{display:"flex",gap:4,flexShrink:0}}>
                {!b.resolved&&<button onClick={()=>markResolved(b.id)} style={{fontSize:9,fontWeight:700,color:T.green,background:"#f0fdf4",border:"none",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontFamily:"inherit"}}>✓</button>}
                <button onClick={()=>deleteOne(b.id)} style={{fontSize:9,fontWeight:700,color:T.red,background:"#fef2f2",border:"none",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontFamily:"inherit"}}>✕</button>
              </div>
            </div>
            <div style={{fontSize:12,fontWeight:700,color:"#1a1a18",marginBottom:b.detail?4:0,lineHeight:1.4}}>{b.message}</div>
            {b.detail&&<div style={{fontSize:10,color:T.sub,fontFamily:"monospace",background:"rgba(0,0,0,0.04)",borderRadius:5,padding:"4px 7px",wordBreak:"break-all",lineHeight:1.5}}>{b.detail}</div>}
            {b.context&&<div style={{fontSize:9,color:T.muted,marginTop:4}}>Context: {b.context}</div>}
          </div>
        ))}
      </div>

      {/* Manual log button */}
      <div style={{padding:"0 16px 20px"}}>
        <ManualBugForm onLog={()=>refresh()}/>
      </div>
    </div>
  );
}

function ManualBugForm({onLog}){
  const[show,setShow]=React.useState(false);
  const[msg,setMsg]=React.useState("");
  const[detail,setDetail]=React.useState("");
  const submit=()=>{
    if(!msg.trim())return;
    logBug("MANUAL",msg.trim(),detail.trim(),"manual entry");
    setMsg("");setDetail("");setShow(false);onLog();
  };
  if(!show)return(
    <button onClick={()=>setShow(true)} style={{width:"100%",background:"#f1efe8",border:`1px dashed ${T.border}`,borderRadius:10,padding:"11px",fontSize:12,color:T.muted,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>+ Log a bug manually</button>
  );
  return(
    <div style={{background:"#fff",border:`1.5px solid ${T.accent}`,borderRadius:12,padding:"14px"}}>
      <div style={{fontSize:12,fontWeight:700,color:T.accent,marginBottom:10}}>📝 Manual Bug Entry</div>
      <input value={msg} onChange={e=>setMsg(e.target.value)} placeholder="Bug description *" style={{...inp,marginBottom:8,fontSize:12}}/>
      <textarea value={detail} onChange={e=>setDetail(e.target.value)} placeholder="Details / steps to reproduce (optional)" rows={3}
        style={{...inp,fontSize:11,resize:"vertical",fontFamily:"inherit",marginBottom:8}}/>
      <div style={{display:"flex",gap:8}}>
        <button onClick={submit} style={{flex:2,background:T.accent,color:"#fff",border:"none",borderRadius:9,padding:"9px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Log Bug</button>
        <button onClick={()=>setShow(false)} style={{flex:1,background:T.bg,color:T.muted,border:`1px solid ${T.border}`,borderRadius:9,padding:"9px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Admin Panel ─────────────────────────────────────────────────────────────
const ADMIN_FEATURES=[
  {id:"bank",label:"Bank Module",icon:"🏧",desc:"Bank accounts & statements"},
  {id:"reskontro",label:"Customer/Supplier Ledger",icon:"👥",desc:"AR/AP contact tracking"},
  {id:"budget",label:"Budget",icon:"📐",desc:"Monthly budget vs actual"},
  {id:"sinkingFunds",label:"Sinking Funds",icon:"🎯",desc:"Savings goals tracker"},
  {id:"reports",label:"Reports",icon:"📊",desc:"P&L, Balance Sheet, Ledger export"},
  {id:"import",label:"Import Excel",icon:"📥",desc:"Import transactions from Excel"},
  {id:"tags",label:"Transaction Tags",icon:"🏷️",desc:"Tag entries for filtering"},
  {id:"aiBookkeeping",label:"AI Bookkeeping",icon:"🤖",desc:"Natural-language entry parser"},
  {id:"files",label:"Inbox",icon:"📥",desc:"Upload & manage receipt files"},
  {id:"calcAmount",label:"Amount Calculator",icon:"🔢",desc:"Type 500+200 in amount field"},
  {id:"whose",label:"Whose (Money Source)",icon:"👤",desc:"Tag entries by whose money it is"},
];
// Package tiers — bulk-assigns per-user feature overrides to match a plan.
// This is the enforcement layer on top of the existing feature-flag system;
// pricing itself is still whatever's agreed manually, this just gates access.
const PACKAGE_TIERS=[
  {id:"basic",label:"Basic",price:"PKR 1,500/mo",color:"#6B7280",features:["reports","calcAmount"]},
  {id:"standard",label:"Standard",price:"PKR 3,000/mo",color:"#0057B8",features:["bank","reskontro","budget","reports","files","calcAmount","import","aiBookkeeping"]},
  {id:"complete",label:"Complete",price:"PKR 5,000/mo",color:"#0D7377",features:ADMIN_FEATURES.map(f=>f.id)},
];
const USER_PACKAGE_KEY="rr_user_packages";
const getUserPackages=()=>{try{return JSON.parse(localStorage.getItem(USER_PACKAGE_KEY)||"{}")}catch{return{};}};

export { BalanceListsScreen, ReportsScreen, ImportScreen, BudgetScreen, ProfileRow, ProfileScreen, FilesScreen, DisabledScreen, BugLogScreen, ManualBugForm, ScreenErrorBoundary, ADMIN_FEATURES, PACKAGE_TIERS, USER_PACKAGE_KEY, getUserPackages };
