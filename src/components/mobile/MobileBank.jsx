import { useState, useMemo } from "react";
import { T, getSK } from "../../lib/theme.js";
import { fmtBal } from "../ledger.jsx";
import MobileLedger from "./MobileLedger.jsx";
import { BANK_COLORS } from "./mobileConstants.js";

export default function MobileBank(props){
  const{accounts,transactions,deleteTxn,reverseTransaction,inboxFiles,uploadInboxFile}=props;
  const[openAccount,setOpenAccount]=useState(null);
  const today=new Date().toISOString().slice(0,10);

  const banks=useMemo(()=>accounts.filter(a=>getSK(a.code)==="1900"),[accounts]);
  const balAt=(code,asOf)=>transactions.filter(t=>t.date<=asOf).reduce((s,t)=>{if(t.debitCode===code)return s+t.amount;if(t.creditCode===code)return s-t.amount;return s;},0);
  const totalCash=banks.reduce((s,b)=>s+balAt(b.code,today),0);

  if(openAccount)return(
    <MobileLedger account={openAccount} accounts={accounts} transactions={transactions}
      onClose={()=>setOpenAccount(null)} onDeleteTxn={deleteTxn} onReverseTxn={reverseTransaction}
      inboxFiles={inboxFiles} uploadInboxFile={uploadInboxFile}/>
  );

  return(
    <div style={{paddingBottom:24}}>
      <div style={{padding:"env(safe-area-inset-top) 20px 0",paddingTop:"calc(env(safe-area-inset-top) + 18px)"}}>
        <div style={{fontSize:22,fontWeight:800,color:"#0F172A",marginBottom:2}}>Bank</div>
        <div style={{fontSize:12,color:"#8A93A3",marginBottom:20}}>{banks.length} account{banks.length===1?"":"s"} · {fmtBal(totalCash)} total</div>
      </div>
      <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:10}}>
        {banks.map((b,i)=>{
          const bal=balAt(b.code,today);
          const c=BANK_COLORS[i%BANK_COLORS.length];
          return(
            <div key={b.code} onClick={()=>setOpenAccount(b)} style={{background:"#fff",borderRadius:17,padding:14,boxShadow:"0 2px 12px rgba(20,40,50,0.06)",border:`1px solid ${T.border}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{display:"flex",alignItems:"center",gap:11}}>
                  <div style={{width:30,height:30,borderRadius:10,background:c.bg,color:c.fg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><i className="ti ti-building-bank" style={{fontSize:14}}/></div>
                  <div>
                    <div style={{fontSize:8.5,color:"#98A2B3",fontWeight:700,letterSpacing:0.3,textTransform:"uppercase"}}>{b.code}</div>
                    <div style={{fontSize:12.5,fontWeight:700,color:"#0F172A",marginTop:1}}>{b.name}</div>
                  </div>
                </div>
                <i className="ti ti-chevron-right" style={{fontSize:15,color:"#B0BAC3"}}/>
              </div>
              <div style={{marginTop:13,fontSize:8.5,color:"#98A2B3",fontWeight:600}}>Balance</div>
              <div style={{fontSize:17,fontWeight:800,color:"#0F172A",marginTop:2}}>{fmtBal(bal)}</div>
            </div>
          );
        })}
        {!banks.length&&<div style={{textAlign:"center",padding:"40px 0",color:"#98A2B3",fontSize:12}}>No bank accounts in the chart of accounts yet.</div>}
      </div>
    </div>
  );
}
