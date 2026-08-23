import { useState } from "react";
import { T } from "../../lib/theme.js";
import MobileScreen from "./MobileScreen.jsx";

const initials=s=>(s||"?").trim().split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase();

// Mobile counterpart of the desktop header's two switchers (client + company)
// in FinanceTracker.jsx — same two dimensions, same underlying state
// (viewingUserId / activeCompanyId), just surfaced as one full screen instead
// of two dropdown buttons, since there's no header real estate for that here.
export default function MobileCompanySwitcher({user,isAdmin,viewingUserId,setViewingUserId,myClientAccess=[],companies=[],activeCompanyId,setActiveCompanyId,createCompany,onClose}){
  const[search,setSearch]=useState("");
  const[showAddClient,setShowAddClient]=useState(false);
  const[newClientName,setNewClientName]=useState("");
  const[creating,setCreating]=useState(false);

  const q=search.trim().toLowerCase();
  const clientRows=[{id:user.id,label:"Your books",sub:null},...myClientAccess.map(c=>({id:c.clientUserId,label:c.clientEmail,sub:c.accessLevel}))]
    .filter(r=>!q||r.label.toLowerCase().includes(q));
  const viewingSelf=viewingUserId===user.id;

  const submitNewClient=async()=>{
    if(!newClientName.trim()||!createCompany||creating)return;
    setCreating(true);
    const created=await createCompany(newClientName.trim());
    setCreating(false);
    if(created){setShowAddClient(false);setNewClientName("");}
  };

  return(
    <MobileScreen title="Switch books" subtitle="Client access & companies" onClose={onClose}>
      {(myClientAccess.length>0||isAdmin)&&(
        <input placeholder="Search client…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:"100%",background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:"10px 14px",fontSize:13,fontFamily:"inherit",boxSizing:"border-box",marginBottom:14}}/>
      )}

      <div style={{fontSize:10.5,fontWeight:800,color:"#8A93A3",textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>Client books</div>
      <div style={{background:"#fff",borderRadius:16,overflow:"hidden",boxShadow:"0 1px 6px rgba(20,40,50,0.04)",marginBottom:20}}>
        {clientRows.map((r,i)=>{
          const active=viewingUserId===r.id;
          return(
            <div key={r.id} onClick={()=>{setViewingUserId(r.id);onClose();}} style={{display:"flex",alignItems:"center",gap:10,padding:"13px 16px",borderBottom:i<clientRows.length-1?"1px solid #F1F5F4":"none",background:active?T.accentLight:"#fff"}}>
              <div style={{width:30,height:30,borderRadius:"50%",background:active?T.accent:"#F6F8FA",color:active?"#fff":"#8A93A3",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,flexShrink:0}}>{initials(r.label)}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12.5,fontWeight:active?700:600,color:active?T.accent:"#0F172A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.label}</div>
                {r.sub&&<div style={{fontSize:9.5,color:"#98A2B3",textTransform:"capitalize",marginTop:1}}>{r.sub} access</div>}
              </div>
              {active&&<i className="ti ti-check" style={{fontSize:15,color:T.accent}}/>}
            </div>
          );
        })}
        {!clientRows.length&&<div style={{padding:"16px",textAlign:"center",color:"#98A2B3",fontSize:11.5}}>No client access granted yet.</div>}
      </div>

      {viewingSelf&&(
        <>
          <div style={{fontSize:10.5,fontWeight:800,color:"#8A93A3",textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>Your companies</div>
          <div style={{background:"#fff",borderRadius:16,overflow:"hidden",boxShadow:"0 1px 6px rgba(20,40,50,0.04)",marginBottom:14}}>
            {companies.map((c,i)=>{
              const active=c.id===activeCompanyId;
              return(
                <div key={c.id} onClick={()=>{setActiveCompanyId(c.id);onClose();}} style={{display:"flex",alignItems:"center",gap:10,padding:"13px 16px",borderBottom:i<companies.length-1?"1px solid #F1F5F4":"none",background:active?T.accentLight:"#fff"}}>
                  <div style={{width:30,height:30,borderRadius:9,background:active?T.accent:"#F6F8FA",color:active?"#fff":"#8A93A3",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><i className="ti ti-building-store" style={{fontSize:14}}/></div>
                  <div style={{flex:1,minWidth:0,fontSize:12.5,fontWeight:active?700:600,color:active?T.accent:"#0F172A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</div>
                  {active&&<i className="ti ti-check" style={{fontSize:15,color:T.accent}}/>}
                </div>
              );
            })}
            {!companies.length&&<div style={{padding:"16px",textAlign:"center",color:"#98A2B3",fontSize:11.5}}>No companies yet.</div>}
          </div>
          {isAdmin&&createCompany&&(
            <div onClick={()=>setShowAddClient(true)} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"13px",borderRadius:14,border:`1.5px dashed ${T.border}`,color:T.accent,fontSize:12.5,fontWeight:700}}>
              <i className="ti ti-plus" style={{fontSize:14}}/>Add client company
            </div>
          )}
        </>
      )}

      {showAddClient&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:150,display:"flex",alignItems:"flex-end"}} onClick={()=>!creating&&setShowAddClient(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"22px 22px 0 0",padding:"22px 20px calc(env(safe-area-inset-bottom) + 20px)",width:"100%"}}>
            <div style={{fontSize:14,fontWeight:800,color:"#0F172A",marginBottom:4}}>Add a new client</div>
            <div style={{fontSize:11.5,color:"#8A93A3",marginBottom:14,lineHeight:1.5}}>Creates a separate, fully isolated set of books.</div>
            <input autoFocus placeholder="e.g. Ventilasjonsspesialisten AS" value={newClientName} onChange={e=>setNewClientName(e.target.value)} style={{width:"100%",background:"#F6F8FA",border:`1px solid ${T.border}`,borderRadius:12,padding:"12px 14px",fontSize:16,fontFamily:"inherit",boxSizing:"border-box",marginBottom:14}}/>
            <div style={{display:"flex",gap:10}}>
              <div onClick={()=>!creating&&setShowAddClient(false)} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,border:`1px solid ${T.border}`,color:"#5C6B73",fontWeight:700,fontSize:13}}>Cancel</div>
              <div onClick={submitNewClient} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,background:newClientName.trim()?T.accent:T.border,color:newClientName.trim()?"#fff":"#98A2B3",fontWeight:700,fontSize:13}}>{creating?"Creating…":"Create"}</div>
            </div>
          </div>
        </div>
      )}
    </MobileScreen>
  );
}
