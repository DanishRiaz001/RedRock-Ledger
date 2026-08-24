import { useState, useMemo } from "react";
import { T, getSK } from "../../lib/theme.js";
import { fmtBal } from "../ledger.jsx";
import { fmt, fmtB } from "../../lib/utils.js";
import MobileScreen from "./MobileScreen.jsx";

export default function MobileReskontro({contacts,transactions,matchTxns,unmatchTxns,defaultType,onClose}){
  const[type,setType]=useState(defaultType||"supplier"); // "customer" | "supplier"
  const[search,setSearch]=useState("");
  const[view,setView]=useState("open"); // "open" | "matched"
  const[expandedId,setExpandedId]=useState(null);
  const[selected,setSelected]=useState({}); // {contactId:[txnIds]}
  // "All time" by default — Open already means "every outstanding item
  // regardless of when it was booked," so a period filter here narrows what
  // you're looking at rather than being required to see everything.
  const now=new Date();
  const[periodMode,setPeriodMode]=useState("all"); // "all" | "month"
  const[year,setYear]=useState(now.getFullYear());
  const[month,setMonth]=useState(now.getMonth());
  const monthFrom=`${year}-${String(month+1).padStart(2,"0")}-01`;
  const monthTo=new Date(year,month+1,0).toISOString().slice(0,10);
  const monthLabel=new Date(year,month,1).toLocaleString("default",{month:"long",year:"numeric"});
  const stepMonth=dir=>{let m=month+dir,y=year;if(m<0){m=11;y--;}else if(m>11){m=0;y++;}setMonth(m);setYear(y);};

  const code=type==="customer"?"1500":"2400";
  const inBucket=c=>getSK(c)===code;
  const mv=t=>inBucket(t.debitCode)?t.amount:-t.amount;
  const isMatched=t=>!!(t.matchedWith&&t.matchedAccount===code);

  const relevantContacts=useMemo(()=>contacts.filter(c=>c.type===type),[contacts,type]);

  const groups=useMemo(()=>relevantContacts
    .filter(c=>!search||c.name.toLowerCase().includes(search.toLowerCase()))
    .map(c=>{
      let txns=transactions.filter(t=>t.contactId===c.id&&(inBucket(t.debitCode)||inBucket(t.creditCode)));
      txns=view==="open"?txns.filter(t=>!isMatched(t)):txns.filter(t=>isMatched(t));
      if(periodMode==="month")txns=txns.filter(t=>t.date>=monthFrom&&t.date<=monthTo);
      txns=txns.sort((a,b)=>a.date.localeCompare(b.date));
      const total=txns.reduce((s,t)=>s+mv(t),0);
      return{contact:c,txns,total};
    })
    .filter(g=>g.txns.length>0)
    .sort((a,b)=>Math.abs(b.total)-Math.abs(a.total))
  ,[relevantContacts,transactions,search,view,code,periodMode,monthFrom,monthTo]);

  const toggleSel=(cid,tid)=>setSelected(p=>{
    const cur=p[cid]||[];
    return{...p,[cid]:cur.includes(tid)?cur.filter(x=>x!==tid):[...cur,tid]};
  });
  const doMatch=cid=>{
    const ids=selected[cid]||[];
    const grpTxns=transactions.filter(t=>ids.includes(t.id));
    const sum=grpTxns.reduce((s,t)=>s+mv(t),0);
    if(ids.length<2||Math.abs(sum)>=1)return;
    matchTxns(ids,Date.now().toString(),code);
    setSelected(p=>({...p,[cid]:[]}));
  };
  const doUnmatch=t=>{if(t.matchedWith)unmatchTxns(t.matchedWith);};

  const grandTotal=groups.reduce((s,g)=>s+g.total,0);

  return(
    <MobileScreen title={type==="customer"?"Customers":"Suppliers"} subtitle="Reskontro · open items & matching" onClose={onClose}>
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        {[["customer","Customers"],["supplier","Suppliers"]].map(([id,label])=>(
          <div key={id} onClick={()=>{setType(id);setExpandedId(null);setSelected({});}} style={{flex:1,textAlign:"center",padding:"8px",borderRadius:20,fontSize:12,fontWeight:700,background:type===id?T.accent:"#fff",color:type===id?"#fff":"#5C6B73",boxShadow:type===id?"none":"0 1px 6px rgba(20,40,50,0.05)"}}>{label}</div>
        ))}
      </div>

      <input placeholder="Search contact…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:"100%",background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:"10px 14px",fontSize:13,fontFamily:"inherit",boxSizing:"border-box",marginBottom:10}}/>

      <div style={{display:"flex",gap:6,marginBottom:10}}>
        {[["open","Open"],["matched","Matched"]].map(([id,label])=>(
          <div key={id} onClick={()=>{setView(id);setExpandedId(null);}} style={{flex:1,textAlign:"center",padding:"7px",borderRadius:16,fontSize:11.5,fontWeight:700,background:view===id?"#0F2A26":"#fff",color:view===id?"#fff":"#5C6B73",boxShadow:view===id?"none":"0 1px 6px rgba(20,40,50,0.05)"}}>{label}</div>
        ))}
      </div>

      {/* Period — defaults to All time so Open keeps showing every
          outstanding item; switching to By month narrows both views. */}
      <div style={{display:"flex",gap:6,marginBottom:14,alignItems:"center"}}>
        <div onClick={()=>setPeriodMode("all")} style={{padding:"6px 12px",borderRadius:14,fontSize:11,fontWeight:700,background:periodMode==="all"?T.accentLight:"#fff",color:periodMode==="all"?T.accent:"#5C6B73",boxShadow:periodMode==="all"?"none":"0 1px 6px rgba(20,40,50,0.05)",flexShrink:0}}>All time</div>
        {periodMode==="month"?(
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"space-between",background:T.accentLight,borderRadius:14,padding:"5px 10px"}}>
            <div onClick={()=>stepMonth(-1)} style={{fontSize:15,color:T.accent,padding:"0 8px",cursor:"pointer"}}>‹</div>
            <div style={{fontSize:11,fontWeight:700,color:T.accent}}>{monthLabel}</div>
            <div onClick={()=>stepMonth(1)} style={{fontSize:15,color:T.accent,padding:"0 8px",cursor:"pointer"}}>›</div>
          </div>
        ):(
          <div onClick={()=>setPeriodMode("month")} style={{padding:"6px 12px",borderRadius:14,fontSize:11,fontWeight:700,background:"#fff",color:"#5C6B73",boxShadow:"0 1px 6px rgba(20,40,50,0.05)"}}>By month</div>
        )}
      </div>

      {view==="open"&&(
        <div style={{background:"#fff",borderRadius:14,padding:"12px 16px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:"0 1px 6px rgba(20,40,50,0.04)"}}>
          <div style={{fontSize:11.5,fontWeight:700,color:"#8A93A3"}}>Total outstanding</div>
          <div style={{fontSize:15,fontWeight:800,color:grandTotal<0?"#E14848":"#0F172A"}}>{fmtBal(grandTotal)}</div>
        </div>
      )}

      {groups.map(g=>{
        const expanded=expandedId===g.contact.id;
        const sel=selected[g.contact.id]||[];
        const selSum=g.txns.filter(t=>sel.includes(t.id)).reduce((s,t)=>s+mv(t),0);
        return(
          <div key={g.contact.id} style={{background:"#fff",borderRadius:16,marginBottom:10,boxShadow:"0 1px 6px rgba(20,40,50,0.04)",overflow:"hidden"}}>
            <div onClick={()=>setExpandedId(expanded?null:g.contact.id)} style={{padding:"13px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12.5,fontWeight:700,color:"#0F172A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.contact.name}</div>
                <div style={{fontSize:10,color:"#98A2B3",marginTop:1}}>{g.txns.length} entr{g.txns.length===1?"y":"ies"}</div>
              </div>
              <div style={{fontSize:13,fontWeight:800,color:g.total<0?"#E14848":"#0F172A",flexShrink:0}}>{fmtBal(g.total)}</div>
              <i className={`ti ${expanded?"ti-chevron-up":"ti-chevron-down"}`} style={{fontSize:14,color:"#B0BAC3",flexShrink:0}}/>
            </div>
            {expanded&&(
              <div style={{borderTop:`1px solid ${T.border}`,padding:"4px 16px 14px"}}>
                {g.txns.map(t=>{
                  const isSel=sel.includes(t.id);
                  return(
                    <div key={t.id} onClick={()=>view==="open"&&toggleSel(g.contact.id,t.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:`1px solid ${T.border}`}}>
                      {view==="open"&&(
                        <div style={{width:19,height:19,borderRadius:6,border:`1.5px solid ${isSel?T.accent:T.border}`,background:isSel?T.accent:"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          {isSel&&<i className="ti ti-check" style={{fontSize:11,color:"#fff"}}/>}
                        </div>
                      )}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:5}}>
                          <span style={{fontSize:9.5,fontWeight:800,color:T.accent,flexShrink:0}}>{fmtB(t.bilag)}</span>
                          <span style={{fontSize:11,fontWeight:600,color:"#0F172A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</span>
                        </div>
                        <div style={{fontSize:9.5,color:"#98A2B3",marginTop:1}}>{t.date}{t.dueDate?` · due ${t.dueDate}`:""}</div>
                      </div>
                      <div style={{fontSize:12,fontWeight:800,color:mv(t)<0?"#E14848":"#0F172A",flexShrink:0}}>{fmt(mv(t))}</div>
                      {view==="matched"&&(
                        <div onClick={e=>{e.stopPropagation();doUnmatch(t);}} style={{fontSize:9.5,fontWeight:700,color:T.accent,flexShrink:0,padding:"3px 8px",border:`1px solid ${T.border}`,borderRadius:6}}>Unmatch</div>
                      )}
                    </div>
                  );
                })}
                {view==="open"&&sel.length>=2&&(
                  <div onClick={()=>doMatch(g.contact.id)} style={{marginTop:10,textAlign:"center",padding:"10px",borderRadius:10,background:Math.abs(selSum)<1?T.accent:"#F6F8FA",color:Math.abs(selSum)<1?"#fff":"#98A2B3",fontSize:12,fontWeight:700}}>
                    {Math.abs(selSum)<1?`Match ${sel.length} entries`:`Selected sum ${fmtBal(selSum)} — must net to 0`}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {!groups.length&&<div style={{textAlign:"center",padding:"30px 0",color:"#98A2B3",fontSize:12}}>Nothing {view==="open"?"outstanding":"matched"} here.</div>}
    </MobileScreen>
  );
}
