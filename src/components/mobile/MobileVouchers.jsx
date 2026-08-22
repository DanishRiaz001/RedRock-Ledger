import { useState, useMemo } from "react";
import { T } from "../../lib/theme.js";
import { sign, fmtBal } from "../ledger.jsx";
import { fmtB } from "../../lib/utils.js";
import { NewEntryForm } from "../invoicing.jsx";

export default function MobileVouchers(props){
  const{accounts,contacts,setContacts,nextBilag,feat,sinkingFunds,saveSinkingFunds,inboxFiles,uploadInboxFile,transactions,moneySources,tagTransaction,projects,companyProfile,saveProjects,addTransaction}=props;
  const[showNew,setShowNew]=useState(false);
  const[search,setSearch]=useState("");

  const list=useMemo(()=>{
    const sorted=[...transactions].sort((a,b)=>b.bilag-a.bilag);
    if(!search.trim())return sorted.slice(0,40);
    const q=search.toLowerCase();
    return sorted.filter(t=>(t.description||"").toLowerCase().includes(q)||fmtB(t.bilag).toLowerCase().includes(q)).slice(0,40);
  },[transactions,search]);

  if(showNew)return(
    <div style={{minHeight:"100%",background:T.bg}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"calc(env(safe-area-inset-top) + 14px) 20px 12px"}}>
        <div onClick={()=>setShowNew(false)} style={{width:32,height:32,borderRadius:10,background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 1px 6px rgba(20,40,50,0.06)"}}><i className="ti ti-x" style={{fontSize:15,color:"#3A4750"}}/></div>
        <div style={{fontSize:16,fontWeight:800,color:"#0F172A"}}>New voucher</div>
      </div>
      <div style={{padding:"0 16px 30px"}}>
        <NewEntryForm accounts={accounts} contacts={contacts} setContacts={setContacts} nextBilag={nextBilag} feat={feat}
          sinkingFunds={sinkingFunds} saveSinkingFunds={saveSinkingFunds} inboxFiles={inboxFiles} uploadInboxFile={uploadInboxFile}
          transactions={transactions} moneySources={moneySources} tagTransaction={tagTransaction} isDesktop={false}
          projects={projects} trackProjects={!!(companyProfile&&companyProfile.trackProjects)} saveProjects={saveProjects}
          onSave={(form)=>{addTransaction(form);setShowNew(false);}}/>
      </div>
    </div>
  );

  return(
    <div style={{paddingBottom:24}}>
      <div style={{padding:"calc(env(safe-area-inset-top) + 18px) 20px 0"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:22,fontWeight:800,color:"#0F172A"}}>Vouchers</div>
          <div onClick={()=>setShowNew(true)} style={{display:"flex",alignItems:"center",gap:6,background:"linear-gradient(135deg,#FF6B4A,#FF8266)",color:"#fff",borderRadius:12,padding:"9px 14px",fontSize:12.5,fontWeight:700,boxShadow:"0 6px 16px rgba(255,107,74,0.3)"}}>
            <i className="ti ti-plus" style={{fontSize:14}}/>New
          </div>
        </div>
        <div style={{position:"relative",marginBottom:16}}>
          <i className="ti ti-search" style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"#98A2B3",fontSize:13}}/>
          <input placeholder="Search vouchers…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:"100%",background:"#fff",border:"1px solid #E1EEEB",borderRadius:12,padding:"10px 12px 10px 34px",fontSize:16,fontFamily:"inherit",boxSizing:"border-box"}}/>
        </div>
      </div>
      <div style={{padding:"0 20px"}}>
        {list.map(t=>(
          <div key={t.id} style={{display:"flex",alignItems:"center",gap:12,background:"#fff",borderRadius:14,padding:"12px 14px",marginBottom:8,boxShadow:"0 1px 6px rgba(20,40,50,0.04)"}}>
            <div style={{width:34,height:34,borderRadius:10,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10.5,fontWeight:800,background:T.accentLight,color:T.accent}}>{fmtB(t.bilag)}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700,color:"#0F172A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</div>
              <div style={{fontSize:11,color:"#98A2B3",marginTop:1}}>{t.date}</div>
            </div>
            <div style={{fontSize:13,fontWeight:800,color:"#0F172A",flexShrink:0}}>{fmtBal(t.amount)}</div>
          </div>
        ))}
        {!list.length&&<div style={{textAlign:"center",padding:"40px 0",color:"#98A2B3",fontSize:12}}>No vouchers found.</div>}
      </div>
    </div>
  );
}
