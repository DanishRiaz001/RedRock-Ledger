import { useState } from "react";
import { T } from "../../lib/theme.js";
import MobileScreen from "./MobileScreen.jsx";
import MobileAccounts from "./MobileAccounts.jsx";
import MobileCompanyProfile from "./MobileCompanyProfile.jsx";

const MENU=[
  {id:"accounts",label:"Chart of accounts",sub:"NS accounts, add, edit, reset to defaults",icon:"ti-list-details",bg:"rgba(13,148,136,0.12)",fg:T.accent},
  {id:"company",label:"Company profile",sub:"Business info used on invoices & reports",icon:"ti-building",fg:"#B4740E",bg:"rgba(180,116,14,0.12)"},
];

export default function MobileSettings(props){
  const{accounts,setAccounts,addAccount,updateAccount,transactions,companyProfile,saveCompanyProfile,onClose}=props;
  const[open,setOpen]=useState(null);

  if(open==="accounts")return(
    <MobileAccounts accounts={accounts} setAccounts={setAccounts} addAccount={addAccount} updateAccount={updateAccount}
      transactions={transactions} onClose={()=>setOpen(null)}/>
  );
  if(open==="company")return(
    <MobileCompanyProfile companyProfile={companyProfile} saveCompanyProfile={saveCompanyProfile} onClose={()=>setOpen(null)}/>
  );

  return(
    <MobileScreen title="Settings" subtitle="Company data & configuration" onClose={onClose}>
      {MENU.map(m=>(
        <div key={m.id} onClick={()=>setOpen(m.id)} style={{display:"flex",alignItems:"center",gap:14,background:"#fff",borderRadius:14,padding:"14px 16px",marginBottom:10,boxShadow:"0 1px 6px rgba(20,40,50,0.04)"}}>
          <div style={{width:38,height:38,borderRadius:12,background:m.bg,color:m.fg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><i className={`ti ${m.icon}`} style={{fontSize:17}}/></div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13.5,fontWeight:700,color:"#0F172A"}}>{m.label}</div>
            <div style={{fontSize:11,color:"#8A93A3",marginTop:1}}>{m.sub}</div>
          </div>
          <i className="ti ti-chevron-right" style={{fontSize:15,color:"#B0BAC3"}}/>
        </div>
      ))}
    </MobileScreen>
  );
}
