import { useState, useMemo } from "react";
import { T, getSK } from "../../lib/theme.js";
import { fmtBal } from "../ledger.jsx";

const isIncomeCode=code=>{const sk=getSK(code);return sk==="3000"||sk==="3900";};
const isExpenseCode=code=>{const sk=getSK(code);return sk&&sk>="4000"&&sk<"8000";};

export default function MobileAnalytics({accounts,transactions}){
  const now=new Date();
  const[year,setYear]=useState(now.getFullYear());
  const[month,setMonth]=useState(now.getMonth()); // 0-11
  const from=`${year}-${String(month+1).padStart(2,"0")}-01`;
  const to=new Date(year,month+1,0).toISOString().slice(0,10);
  const periodLabel=new Date(year,month,1).toLocaleString("default",{month:"long",year:"numeric"});
  const stepMonth=dir=>{let m=month+dir,y=year;if(m<0){m=11;y--;}else if(m>11){m=0;y++;}setMonth(m);setYear(y);};

  const getName=code=>((accounts.find(a=>a.code===code))||{name:code}).name;

  const periodTxns=useMemo(()=>transactions.filter(t=>t.date>=from&&t.date<=to&&!t.reversedBy&&!t.reversalOf),[transactions,from,to]);

  const income=useMemo(()=>{
    const m={};
    periodTxns.forEach(t=>{if(isIncomeCode(t.creditCode))m[t.creditCode]=(m[t.creditCode]||0)+t.amount;});
    return Object.entries(m).map(([code,amt])=>({code,name:getName(code),amt})).sort((a,b)=>b.amt-a.amt);
  },[periodTxns]);
  const expense=useMemo(()=>{
    const m={};
    periodTxns.forEach(t=>{if(isExpenseCode(t.debitCode))m[t.debitCode]=(m[t.debitCode]||0)+t.amount;});
    return Object.entries(m).map(([code,amt])=>({code,name:getName(code),amt})).sort((a,b)=>b.amt-a.amt);
  },[periodTxns]);

  const totalIncome=income.reduce((s,r)=>s+r.amt,0);
  const totalExpense=expense.reduce((s,r)=>s+r.amt,0);
  const net=totalIncome-totalExpense;

  const Row=({r,color,dot})=>(
    <div style={{display:"flex",alignItems:"center",gap:12,background:"#fff",borderRadius:13,padding:"12px 14px",marginBottom:7}}>
      <div style={{width:8,height:8,borderRadius:"50%",background:dot,flexShrink:0}}/>
      <div style={{flex:1,fontSize:12.5,fontWeight:600,color:"#0F172A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
      <div style={{fontSize:13,fontWeight:800,color,flexShrink:0}}>{fmtBal(r.amt)}</div>
    </div>
  );

  return(
    <div style={{paddingBottom:24}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fff",borderRadius:14,padding:"10px 16px",marginBottom:18,boxShadow:"0 1px 6px rgba(20,40,50,0.05)"}}>
        <div onClick={()=>stepMonth(-1)} style={{fontSize:18,color:"#8A93A3",padding:"0 8px"}}>‹</div>
        <div style={{fontSize:13.5,fontWeight:800,color:"#0F172A"}}>{periodLabel}</div>
        <div onClick={()=>stepMonth(1)} style={{fontSize:18,color:"#8A93A3",padding:"0 8px"}}>›</div>
      </div>

      <div style={{display:"flex",gap:10,marginBottom:22}}>
        <div style={{flex:1,background:"rgba(14,159,110,0.1)",borderRadius:16,padding:14}}>
          <div style={{fontSize:10.5,color:"#0E9F6E",fontWeight:700}}>Income</div>
          <div style={{fontSize:16,fontWeight:800,color:"#0E9F6E",marginTop:4}}>{fmtBal(totalIncome)}</div>
        </div>
        <div style={{flex:1,background:"rgba(225,72,72,0.08)",borderRadius:16,padding:14}}>
          <div style={{fontSize:10.5,color:"#E14848",fontWeight:700}}>Expenses</div>
          <div style={{fontSize:16,fontWeight:800,color:"#E14848",marginTop:4}}>{fmtBal(totalExpense)}</div>
        </div>
        <div style={{flex:1,background:T.accentLight,borderRadius:16,padding:14}}>
          <div style={{fontSize:10.5,color:T.accent,fontWeight:700}}>Net</div>
          <div style={{fontSize:16,fontWeight:800,color:net>=0?T.accent:"#E14848",marginTop:4}}>{fmtBal(net)}</div>
        </div>
      </div>

      <div style={{background:"#fff",borderRadius:16,overflow:"hidden",boxShadow:"0 1px 6px rgba(20,40,50,0.05)",marginBottom:20}}>
        <div style={{fontSize:11,fontWeight:800,color:"#8A93A3",textTransform:"uppercase",letterSpacing:0.4,padding:"14px 14px 6px"}}>Income by account</div>
        <div style={{padding:"0 8px 8px"}}>
          {income.map(r=><Row key={r.code} r={r} color="#0E9F6E" dot="#0E9F6E"/>)}
          {!income.length&&<div style={{textAlign:"center",padding:"16px 0",color:"#98A2B3",fontSize:12}}>No income this period.</div>}
        </div>
      </div>

      <div style={{background:"#fff",borderRadius:16,overflow:"hidden",boxShadow:"0 1px 6px rgba(20,40,50,0.05)"}}>
        <div style={{fontSize:11,fontWeight:800,color:"#8A93A3",textTransform:"uppercase",letterSpacing:0.4,padding:"14px 14px 6px"}}>Expenses by account</div>
        <div style={{padding:"0 8px 8px"}}>
          {expense.map(r=><Row key={r.code} r={r} color="#E14848" dot="#E14848"/>)}
          {!expense.length&&<div style={{textAlign:"center",padding:"16px 0",color:"#98A2B3",fontSize:12}}>No expenses this period.</div>}
        </div>
      </div>
    </div>
  );
}
