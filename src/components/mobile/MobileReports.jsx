import { useState } from "react";
import { T } from "../../lib/theme.js";
import MobileAnalytics from "./MobileAnalytics.jsx";
import MobileBudget from "./MobileBudget.jsx";
import MobileSinkingFunds from "./MobileSinkingFunds.jsx";
import MobileMonthly from "./MobileMonthly.jsx";

const TABS=[
  {id:"analytics",label:"Analytics"},
  {id:"budget",label:"Budget"},
  {id:"sinking",label:"Sinking fund"},
  {id:"monthly",label:"Monthly"},
];

export default function MobileReports(props){
  const{accounts,transactions,sinkingFunds,budgets,saveBudget,saveSinkingFunds}=props;
  const[sub,setSub]=useState("analytics");

  return(
    <div style={{paddingBottom:24}}>
      <div style={{padding:"calc(env(safe-area-inset-top) + 18px) 20px 14px"}}>
        <div style={{fontSize:22,fontWeight:800,color:"#0F172A",marginBottom:14}}>Reports</div>
        <div style={{display:"flex",gap:6,overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
          {TABS.map(t=>{
            const active=sub===t.id;
            return(
              <div key={t.id} onClick={()=>setSub(t.id)} style={{flexShrink:0,padding:"8px 14px",borderRadius:20,fontSize:12,fontWeight:700,background:active?T.accent:"#fff",color:active?"#fff":"#5C6B73",boxShadow:active?"none":"0 1px 6px rgba(20,40,50,0.05)"}}>{t.label}</div>
            );
          })}
        </div>
      </div>
      <div style={{padding:"0 20px"}}>
        {sub==="analytics"&&<MobileAnalytics accounts={accounts} transactions={transactions}/>}
        {sub==="budget"&&<MobileBudget accounts={accounts} transactions={transactions} budgets={budgets} saveBudget={saveBudget}/>}
        {sub==="sinking"&&<MobileSinkingFunds sinkingFunds={sinkingFunds} saveSinkingFunds={saveSinkingFunds}/>}
        {sub==="monthly"&&<MobileMonthly accounts={accounts} transactions={transactions}/>}
      </div>
    </div>
  );
}
