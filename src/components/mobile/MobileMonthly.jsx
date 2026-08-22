import { useState, useMemo } from "react";
import { T, getSK } from "../../lib/theme.js";
import { fmtBal, sign } from "../ledger.jsx";

const isIncomeCode=code=>{const sk=getSK(code);return sk==="3000"||sk==="3900";};
const isExpenseCode=code=>{const sk=getSK(code);return sk&&sk>="4000"&&sk<"8000";};

export default function MobileMonthly({accounts,transactions}){
  const now=new Date();
  const[year,setYear]=useState(now.getFullYear());
  const[month,setMonth]=useState(now.getMonth());
  const periodLabel=new Date(year,month,1).toLocaleString("default",{month:"long",year:"numeric"});
  const stepMonth=dir=>{let m=month+dir,y=year;if(m<0){m=11;y--;}else if(m>11){m=0;y++;}setMonth(m);setYear(y);};

  const from=`${year}-${String(month+1).padStart(2,"0")}-01`;
  const to=new Date(year,month+1,0).toISOString().slice(0,10);
  const prevDate=new Date(year,month-1,1);
  const pFrom=`${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,"0")}-01`;
  const pTo=new Date(prevDate.getFullYear(),prevDate.getMonth()+1,0).toISOString().slice(0,10);

  const sumFor=(f,t,test,field)=>transactions.filter(tx=>tx.date>=f&&tx.date<=t&&test(tx[field])&&!tx.reversedBy&&!tx.reversalOf).reduce((s,tx)=>s+tx.amount,0);

  const income=sumFor(from,to,isIncomeCode,"creditCode");
  const expense=sumFor(from,to,isExpenseCode,"debitCode");
  const net=income-expense;
  const pIncome=sumFor(pFrom,pTo,isIncomeCode,"creditCode");
  const pExpense=sumFor(pFrom,pTo,isExpenseCode,"debitCode");
  const pNet=pIncome-pExpense;

  const balAt=(code,asOf)=>transactions.filter(t=>t.date<=asOf).reduce((s,t)=>{if(t.debitCode===code)return s+t.amount;if(t.creditCode===code)return s-t.amount;return s;},0);
  const seriesBalAt=(sk,asOf)=>accounts.filter(a=>getSK(a.code)===sk).reduce((s,a)=>s+balAt(a.code,asOf),0);
  const cash=seriesBalAt("1900",to);
  const receivable=seriesBalAt("1500",to);
  const payable=seriesBalAt("2400",to);

  const pct=(cur,prev)=>prev?Math.round(((cur-prev)/Math.abs(prev))*100):null;

  const CompareRow=({label,cur,prev,positiveIsGood=true})=>{
    const delta=pct(cur,prev);
    const up=cur>=prev;
    const good=positiveIsGood?up:!up;
    return(
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 0",borderBottom:`1px solid ${T.border}`}}>
        <div style={{fontSize:12.5,fontWeight:600,color:"#5C6B73"}}>{label}</div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{fontSize:13.5,fontWeight:800,color:"#0F172A"}}>{fmtBal(cur)}</div>
          {delta!==null&&<div style={{fontSize:10.5,fontWeight:700,color:good?"#0E9F6E":"#E14848",background:good?"rgba(14,159,110,0.1)":"rgba(225,72,72,0.1)",borderRadius:10,padding:"2px 7px"}}>{up?"▲":"▼"} {Math.abs(delta)}%</div>}
        </div>
      </div>
    );
  };

  return(
    <div style={{paddingBottom:24}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fff",borderRadius:14,padding:"10px 16px",marginBottom:18,boxShadow:"0 1px 6px rgba(20,40,50,0.05)"}}>
        <div onClick={()=>stepMonth(-1)} style={{fontSize:18,color:"#8A93A3",padding:"0 8px"}}>‹</div>
        <div style={{fontSize:13.5,fontWeight:800,color:"#0F172A"}}>{periodLabel}</div>
        <div onClick={()=>stepMonth(1)} style={{fontSize:18,color:"#8A93A3",padding:"0 8px"}}>›</div>
      </div>

      <div style={{background:"linear-gradient(135deg,#0F2A26,#0D9488)",borderRadius:18,padding:18,color:"#fff",marginBottom:20}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.75)",fontWeight:600}}>Net profit this month</div>
        <div style={{fontSize:26,fontWeight:800,marginTop:3}}>{sign(net)}</div>
        {pct(net,pNet)!==null&&<div style={{fontSize:11.5,color:"rgba(255,255,255,0.85)",marginTop:6}}>{net>=pNet?"▲":"▼"} {Math.abs(pct(net,pNet))}% vs last month</div>}
      </div>

      <div style={{background:"#fff",borderRadius:16,padding:"4px 16px",marginBottom:16,boxShadow:"0 1px 6px rgba(20,40,50,0.05)"}}>
        <CompareRow label="Income" cur={income} prev={pIncome}/>
        <CompareRow label="Expenses" cur={expense} prev={pExpense} positiveIsGood={false}/>
        <div style={{padding:"13px 0",display:"flex",justifyContent:"space-between"}}>
          <div style={{fontSize:12.5,fontWeight:700,color:"#0F172A"}}>Net profit</div>
          <div style={{fontSize:13.5,fontWeight:800,color:net>=0?"#0E9F6E":"#E14848"}}>{sign(net)}</div>
        </div>
      </div>

      <div style={{fontSize:13.5,fontWeight:800,color:"#0F172A",marginBottom:10}}>Balance sheet snapshot</div>
      <div style={{background:"#fff",borderRadius:16,padding:"4px 16px",boxShadow:"0 1px 6px rgba(20,40,50,0.05)"}}>
        <div style={{display:"flex",justifyContent:"space-between",padding:"13px 0",borderBottom:`1px solid ${T.border}`}}><div style={{fontSize:12.5,color:"#5C6B73",fontWeight:600}}>Cash & bank</div><div style={{fontSize:13.5,fontWeight:800,color:"#0F172A"}}>{fmtBal(cash)}</div></div>
        <div style={{display:"flex",justifyContent:"space-between",padding:"13px 0",borderBottom:`1px solid ${T.border}`}}><div style={{fontSize:12.5,color:"#5C6B73",fontWeight:600}}>Receivable</div><div style={{fontSize:13.5,fontWeight:800,color:"#0F172A"}}>{fmtBal(receivable)}</div></div>
        <div style={{display:"flex",justifyContent:"space-between",padding:"13px 0"}}><div style={{fontSize:12.5,color:"#5C6B73",fontWeight:600}}>Payable</div><div style={{fontSize:13.5,fontWeight:800,color:"#0F172A"}}>{fmtBal(payable)}</div></div>
      </div>
    </div>
  );
}
