import { useState } from "react";
import { T } from "../../lib/theme.js";
import { ReportsScreen, BudgetScreen } from "../settings2.jsx";
import { SinkingFundsScreen, MonthlyOverviewScreen } from "../invoicing.jsx";

const TABS=[
  {id:"analytics",label:"Analytics"},
  {id:"budget",label:"Budget"},
  {id:"sinking",label:"Sinking fund"},
  {id:"monthly",label:"Monthly"},
];

export default function MobileReports(props){
  const{accounts,transactions,sinkingFunds,budgets,saveBudget,saveBudgetSurplusSetting,sweepBudgetSurplus,saveSinkingFunds,moneySources}=props;
  const[sub,setSub]=useState("analytics");
  const today=new Date().toISOString().slice(0,10);
  const filterFrom=`${today.slice(0,7)}-01`;
  const filterTo=today;
  const getName=code=>((accounts.find(a=>a.code===code))||{name:code}).name;

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
      <div style={{padding:"0 16px"}}>
        {sub==="analytics"&&<ReportsScreen accounts={accounts} transactions={transactions} getName={getName} filterFrom={filterFrom} filterTo={filterTo} onChangePeriod={()=>{}} sinkingFunds={sinkingFunds} budgets={budgets} isDesktop={false}/>}
        {sub==="budget"&&<BudgetScreen accounts={accounts} transactions={transactions} budgets={budgets} saveBudget={saveBudget} saveBudgetSurplusSetting={saveBudgetSurplusSetting} sweepBudgetSurplus={sweepBudgetSurplus} sinkingFunds={sinkingFunds} filterFrom={filterFrom} filterTo={filterTo} onBack={()=>{}} isDesktop={false}/>}
        {sub==="sinking"&&<SinkingFundsScreen onBack={()=>{}} sinkingFunds={sinkingFunds} saveSinkingFunds={saveSinkingFunds} transactions={transactions} filterFrom={filterFrom} filterTo={filterTo} isDesktop={false}/>}
        {sub==="monthly"&&<MonthlyOverviewScreen accounts={accounts} transactions={transactions} budgets={budgets} moneySources={moneySources}/>}
      </div>
    </div>
  );
}
