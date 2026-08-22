import { useState, useMemo } from "react";
import { getSK } from "../../lib/theme.js";
import { fmtBal } from "../ledger.jsx";
import MobileLedger from "./MobileLedger.jsx";

export default function MobileBank(props){
  const{accounts,transactions,deleteTxn,reverseTransaction,inboxFiles,uploadInboxFile}=props;
  const[openAccount,setOpenAccount]=useState(null);
  const today=new Date().toISOString().slice(0,10);

  const banks=useMemo(()=>accounts.filter(a=>getSK(a.code)==="1900"),[accounts]);
  const balAt=(code,asOf)=>transactions.filter(t=>t.date<=asOf).reduce((s,t)=>{if(t.debitCode===code)return s+t.amount;if(t.creditCode===code)return s-t.amount;return s;},0);
  const totalCash=banks.reduce((s,b)=>s+balAt(b.code,today),0);

  if(openAccount)return(
    <MobileLedger account={openAccount} transactions={transactions}
      onClose={()=>setOpenAccount(null)} onDeleteTxn={deleteTxn} onReverseTxn={reverseTransaction}
      inboxFiles={inboxFiles} uploadInboxFile={uploadInboxFile}/>
  );

  return(
    <div style={{paddingBottom:24}}>
      <div style={{padding:"env(safe-area-inset-top) 20px 0",paddingTop:"calc(env(safe-area-inset-top) + 18px)"}}>
        <div style={{fontSize:22,fontWeight:800,color:"#0F172A",marginBottom:2}}>Bank</div>
        <div style={{fontSize:12,color:"#8A93A3",marginBottom:20}}>{banks.length} account{banks.length===1?"":"s"} · {fmtBal(totalCash)} total</div>
      </div>
      <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:12}}>
        {banks.map(b=>{
          const bal=balAt(b.code,today);
          return(
            <div key={b.code} onClick={()=>setOpenAccount(b)} style={{background:"linear-gradient(135deg,#0F2A26,#0D9488)",borderRadius:20,padding:20,color:"#fff"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.7)",fontWeight:700,letterSpacing:0.3,textTransform:"uppercase"}}>{b.code}</div>
                  <div style={{fontSize:15,fontWeight:700,marginTop:2}}>{b.name}</div>
                </div>
                <i className="ti ti-chevron-right" style={{fontSize:16,color:"rgba(255,255,255,0.7)"}}/>
              </div>
              <div style={{marginTop:20,fontSize:10,color:"rgba(255,255,255,0.7)",fontWeight:600}}>Balance</div>
              <div style={{fontSize:24,fontWeight:800,marginTop:2}}>{fmtBal(bal)}</div>
            </div>
          );
        })}
        {!banks.length&&<div style={{textAlign:"center",padding:"40px 0",color:"#98A2B3",fontSize:12}}>No bank accounts in the chart of accounts yet.</div>}
      </div>
    </div>
  );
}
