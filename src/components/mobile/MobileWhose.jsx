import { useState, useMemo } from "react";
import { T, getSK } from "../../lib/theme.js";
import { fmtBal } from "../ledger.jsx";
import { fmt } from "../../lib/utils.js";
import MobileScreen from "./MobileScreen.jsx";

const fieldStyle={width:"100%",background:"#F6F8FA",border:`1px solid ${T.border}`,borderRadius:12,padding:"12px 14px",fontSize:16,fontFamily:"inherit",boxSizing:"border-box",marginBottom:12};

export default function MobileWhose({moneySources=[],saveMoneySources,transactions,accounts,tagTransaction,onClose}){
  const[tab,setTab]=useState("sources"); // "sources" | "bybank"
  const[showAdd,setShowAdd]=useState(false);
  const[editingId,setEditingId]=useState(null);
  const[form,setForm]=useState({name:"",openingReceived:"",openingUsed:""});
  const[detail,setDetail]=useState(null); // source id being viewed/tagged
  const[settleAmt,setSettleAmt]=useState("");
  const[showSettle,setShowSettle]=useState(false);

  // "1900" itself is Cash in Hand, not a bank — excluded so a cash⇄bank
  // transfer only counts on the real bank side, matching the desktop fix.
  const bankAccounts=useMemo(()=>accounts.filter(a=>getSK(a.code)==="1900"&&a.code!=="1900"),[accounts]);
  const bankCodes=useMemo(()=>new Set(bankAccounts.map(a=>a.code)),[bankAccounts]);
  const bankTxns=useMemo(()=>transactions.filter(t=>bankCodes.has(t.debitCode)||bankCodes.has(t.creditCode)).sort((a,b)=>b.date.localeCompare(a.date)),[transactions,bankCodes]);

  const totalsFor=id=>{
    const src=moneySources.find(m=>m.id===id);
    if(!src)return{received:0,used:0,remaining:0};
    const tagged=bankTxns.filter(t=>t.moneySourceId===id);
    const taggedReceived=tagged.filter(t=>bankCodes.has(t.debitCode)).reduce((s,t)=>s+t.amount,0);
    const taggedUsed=tagged.filter(t=>bankCodes.has(t.creditCode)).reduce((s,t)=>s+t.amount,0);
    const received=(src.openingReceived||0)+taggedReceived;
    const used=(src.openingUsed||0)+taggedUsed;
    return{received,used,remaining:received-used};
  };

  const activeSources=moneySources.filter(m=>!m.inactive);
  const grandRemaining=activeSources.reduce((s,m)=>s+totalsFor(m.id).remaining,0);
  const deficitSources=activeSources.filter(m=>totalsFor(m.id).remaining<0);

  // Per-bank-account breakdown: for each bank, which sources have money
  // tagged there and how much — lets the user see "whose money is sitting
  // in which account" instead of just one blended total.
  const perBank=useMemo(()=>bankAccounts.map(bank=>{
    const rows=activeSources.map(m=>{
      const tagged=transactions.filter(t=>t.moneySourceId===m.id&&(t.debitCode===bank.code||t.creditCode===bank.code));
      const received=tagged.filter(t=>t.debitCode===bank.code).reduce((s,t)=>s+t.amount,0);
      const used=tagged.filter(t=>t.creditCode===bank.code).reduce((s,t)=>s+t.amount,0);
      return{id:m.id,name:m.name,remaining:received-used};
    }).filter(r=>r.remaining!==0);
    return{code:bank.code,name:bank.name,rows,total:rows.reduce((s,r)=>s+r.remaining,0)};
  }).filter(b=>b.rows.length>0),[bankAccounts,activeSources,transactions]);

  const resetForm=()=>{setForm({name:"",openingReceived:"",openingUsed:""});setEditingId(null);};
  const addSource=()=>{
    if(!form.name.trim())return;
    const id="ms_"+Date.now();
    saveMoneySources([...moneySources,{id,name:form.name.trim(),openingReceived:parseFloat(form.openingReceived)||0,openingUsed:parseFloat(form.openingUsed)||0,inactive:false}]);
    resetForm();setShowAdd(false);
  };
  const startEdit=m=>{setEditingId(m.id);setForm({name:m.name,openingReceived:String(m.openingReceived||0),openingUsed:String(m.openingUsed||0)});setShowAdd(true);};
  const saveEditSrc=()=>{
    if(!form.name.trim())return;
    saveMoneySources(moneySources.map(m=>m.id===editingId?{...m,name:form.name.trim(),openingReceived:parseFloat(form.openingReceived)||0,openingUsed:parseFloat(form.openingUsed)||0}:m));
    resetForm();setShowAdd(false);
  };
  const removeSource=id=>{
    if(bankTxns.some(t=>t.moneySourceId===id)){alert("This source has tagged transactions — untag them first before deleting.");return;}
    if(!window.confirm("Delete this money source?"))return;
    saveMoneySources(moneySources.filter(m=>m.id!==id));
    setDetail(null);
  };
  // Settling records that you covered the shortfall from your own pocket
  // (e.g. next salary) — raises this source's "received" baseline by the
  // amount you're putting back, without needing a real bank transaction.
  const settleDeficit=()=>{
    const amt=parseFloat(settleAmt)||0;
    if(!amt||!detail)return;
    saveMoneySources(moneySources.map(m=>m.id===detail?{...m,openingReceived:(m.openingReceived||0)+amt}:m));
    setSettleAmt("");setShowSettle(false);
  };

  if(detail){
    const src=moneySources.find(m=>m.id===detail);
    const t=totalsFor(detail);
    const taggedTxns=bankTxns.filter(x=>x.moneySourceId===detail);
    return(
      <MobileScreen title={src?src.name:"Source"} subtitle={`${fmtBal(t.received)} received · ${fmtBal(t.used)} used`} onClose={()=>setDetail(null)}>
        <div style={{background:t.remaining<0?"#FEF2F2":T.accentLight,borderRadius:16,padding:16,marginBottom:14}}>
          <div style={{fontSize:11,color:t.remaining<0?"#E14848":"#0F2A26",fontWeight:600}}>{t.remaining<0?"Overspent — you owe":"Remaining"}</div>
          <div style={{fontSize:22,fontWeight:800,marginTop:3,color:t.remaining<0?"#E14848":"#0F2A26"}}>{fmtBal(Math.abs(t.remaining))}</div>
        </div>

        {t.remaining<0&&(
          <div onClick={()=>{setSettleAmt(String(Math.abs(t.remaining)));setShowSettle(true);}} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"#0D9488",borderRadius:12,padding:"12px",marginBottom:14,color:"#fff",fontWeight:700,fontSize:12.5}}>
            <i className="ti ti-cash" style={{fontSize:15}}/>Settle from next salary
          </div>
        )}

        <div style={{display:"flex",gap:8,marginBottom:18}}>
          <div onClick={()=>startEdit(src)} style={{flex:1,textAlign:"center",padding:"11px",borderRadius:12,border:`1px solid ${T.border}`,color:"#5C6B73",fontWeight:700,fontSize:12.5}}>Edit</div>
          <div onClick={()=>removeSource(detail)} style={{flex:1,textAlign:"center",padding:"11px",borderRadius:12,border:`1px solid #F5C6C6`,color:"#E14848",fontWeight:700,fontSize:12.5}}>Delete</div>
        </div>

        <div style={{fontSize:11,fontWeight:800,color:"#8A93A3",textTransform:"uppercase",letterSpacing:0.4,marginBottom:8}}>Tagged transactions ({taggedTxns.length})</div>
        {taggedTxns.map(x=>{
          const isIn=bankCodes.has(x.debitCode);
          return(
            <div key={x.id} onClick={()=>tagTransaction(x.id,null)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fff",borderRadius:12,padding:"11px 13px",marginBottom:7,boxShadow:"0 1px 6px rgba(20,40,50,0.04)"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:700,color:"#0F172A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{x.description}</div>
                <div style={{fontSize:10,color:"#98A2B3",marginTop:1}}>{x.date} · tap to untag</div>
              </div>
              <div style={{fontSize:12.5,fontWeight:800,color:isIn?"#0E9F6E":"#E14848",flexShrink:0}}>{isIn?"+":"−"}{fmt(x.amount)}</div>
            </div>
          );
        })}
        {!taggedTxns.length&&<div style={{textAlign:"center",padding:"14px 0",color:"#98A2B3",fontSize:12}}>No transactions tagged yet.</div>}

        <div style={{fontSize:11,fontWeight:800,color:"#8A93A3",textTransform:"uppercase",letterSpacing:0.4,margin:"20px 0 8px"}}>Untagged bank activity</div>
        {bankTxns.filter(x=>!x.moneySourceId).slice(0,25).map(x=>{
          const isIn=bankCodes.has(x.debitCode);
          return(
            <div key={x.id} onClick={()=>tagTransaction(x.id,detail)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fff",borderRadius:12,padding:"11px 13px",marginBottom:7,boxShadow:"0 1px 6px rgba(20,40,50,0.04)"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:700,color:"#0F172A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{x.description}</div>
                <div style={{fontSize:10,color:"#98A2B3",marginTop:1}}>{x.date} · tap to tag here</div>
              </div>
              <div style={{fontSize:12.5,fontWeight:800,color:isIn?"#0E9F6E":"#E14848",flexShrink:0}}>{isIn?"+":"−"}{fmt(x.amount)}</div>
            </div>
          );
        })}
        {!bankTxns.filter(x=>!x.moneySourceId).length&&<div style={{textAlign:"center",padding:"14px 0",color:"#98A2B3",fontSize:12}}>Nothing untagged.</div>}

        {showSettle&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:150,display:"flex",alignItems:"flex-end"}} onClick={()=>setShowSettle(false)}>
            <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"22px 22px 0 0",padding:"22px 20px calc(env(safe-area-inset-bottom) + 20px)",width:"100%"}}>
              <div style={{fontSize:14,fontWeight:800,color:"#0F172A",marginBottom:4}}>Settle {src?src.name:""}</div>
              <div style={{fontSize:11.5,color:"#8A93A3",marginBottom:14}}>Amount you're putting back from your own funds (e.g. next salary)</div>
              <input autoFocus type="number" value={settleAmt} onChange={e=>setSettleAmt(e.target.value)} style={fieldStyle}/>
              <div style={{display:"flex",gap:10}}>
                <div onClick={()=>setShowSettle(false)} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,border:`1px solid ${T.border}`,color:"#5C6B73",fontWeight:700,fontSize:13}}>Cancel</div>
                <div onClick={settleDeficit} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,background:T.accent,color:"#fff",fontWeight:700,fontSize:13}}>Settle</div>
              </div>
            </div>
          </div>
        )}

        {showAdd&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:150,display:"flex",alignItems:"flex-end"}} onClick={()=>{resetForm();setShowAdd(false);}}>
            <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"22px 22px 0 0",padding:"22px 20px calc(env(safe-area-inset-bottom) + 20px)",width:"100%"}}>
              <div style={{fontSize:14,fontWeight:800,color:"#0F172A",marginBottom:14}}>Edit source</div>
              <input placeholder="Name" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={fieldStyle}/>
              <input placeholder="Received (starting)" type="number" value={form.openingReceived} onChange={e=>setForm(f=>({...f,openingReceived:e.target.value}))} style={fieldStyle}/>
              <input placeholder="Used (starting)" type="number" value={form.openingUsed} onChange={e=>setForm(f=>({...f,openingUsed:e.target.value}))} style={{...fieldStyle,marginBottom:14}}/>
              <div style={{display:"flex",gap:10}}>
                <div onClick={()=>{resetForm();setShowAdd(false);}} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,border:`1px solid ${T.border}`,color:"#5C6B73",fontWeight:700,fontSize:13}}>Cancel</div>
                <div onClick={saveEditSrc} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,background:T.accent,color:"#fff",fontWeight:700,fontSize:13}}>Save</div>
              </div>
            </div>
          </div>
        )}
      </MobileScreen>
    );
  }

  return(
    <MobileScreen title="Whose" subtitle="Money others gave you to spend" onClose={onClose}>
      <div style={{background:"linear-gradient(135deg,#2E1F5A,#4B2E8A)",borderRadius:18,padding:18,color:"#fff",marginBottom:14}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.75)",fontWeight:600}}>Total remaining</div>
        <div style={{fontSize:24,fontWeight:800,marginTop:3}}>{fmtBal(grandRemaining)}</div>
        <div style={{fontSize:11.5,color:"rgba(255,255,255,0.85)",marginTop:6}}>across {activeSources.length} source{activeSources.length===1?"":"s"}</div>
      </div>

      {deficitSources.length>0&&(
        <div style={{background:"#FEF2F2",borderRadius:14,padding:"12px 15px",marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:700,color:"#E14848"}}>{deficitSources.length} source{deficitSources.length===1?"":"s"} overspent — settle from your next salary.</div>
        </div>
      )}

      <div style={{display:"flex",gap:6,marginBottom:18}}>
        {[["sources","Sources"],["bybank","By bank"]].map(([id,label])=>(
          <div key={id} onClick={()=>setTab(id)} style={{flex:1,textAlign:"center",padding:"8px",borderRadius:20,fontSize:12,fontWeight:700,background:tab===id?T.accent:"#fff",color:tab===id?"#fff":"#5C6B73",boxShadow:tab===id?"none":"0 1px 6px rgba(20,40,50,0.05)"}}>{label}</div>
        ))}
      </div>

      {tab==="sources"&&(<>
        {activeSources.map(m=>{
          const t=totalsFor(m.id);
          return(
            <div key={m.id} onClick={()=>setDetail(m.id)} style={{background:"#fff",borderRadius:16,padding:16,marginBottom:10,boxShadow:"0 1px 6px rgba(20,40,50,0.04)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:13,fontWeight:700,color:"#0F172A"}}>{m.name}</div>
                <div style={{fontSize:14,fontWeight:800,color:t.remaining<0?"#E14848":"#0D9488"}}>{fmtBal(t.remaining)}</div>
              </div>
              <div style={{display:"flex",gap:14,fontSize:10.5,color:"#8A93A3"}}>
                <span>Received {fmtBal(t.received)}</span>
                <span>Used {fmtBal(t.used)}</span>
              </div>
            </div>
          );
        })}
        {!activeSources.length&&<div style={{textAlign:"center",padding:"30px 0",color:"#98A2B3",fontSize:12}}>No money sources yet.</div>}

        <div onClick={()=>{resetForm();setShowAdd(true);}} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginTop:12,padding:"12px",borderRadius:14,border:`1.5px dashed ${T.border}`,color:T.accent,fontSize:12.5,fontWeight:700}}>
          <i className="ti ti-plus" style={{fontSize:14}}/>Add money source
        </div>
      </>)}

      {tab==="bybank"&&(<>
        <div style={{fontSize:10.5,color:"#8A93A3",marginBottom:14}}>Which account each person's money is sitting in right now.</div>
        {perBank.map(b=>(
          <div key={b.code} style={{background:"#fff",borderRadius:16,padding:16,marginBottom:12,boxShadow:"0 1px 6px rgba(20,40,50,0.04)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:12.5,fontWeight:800,color:"#0F172A"}}>{b.name}</div>
              <div style={{fontSize:12,fontWeight:700,color:"#8A93A3"}}>{fmtBal(b.total)}</div>
            </div>
            {b.rows.map(r=>(
              <div key={r.id} onClick={()=>setDetail(r.id)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderTop:`1px solid ${T.border}`}}>
                <div style={{fontSize:12,fontWeight:600,color:"#3A4750"}}>{r.name}</div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{fontSize:12.5,fontWeight:800,color:r.remaining<0?"#E14848":"#0D9488"}}>{fmtBal(r.remaining)}</div>
                  <i className="ti ti-chevron-right" style={{fontSize:13,color:"#B0BAC3"}}/>
                </div>
              </div>
            ))}
          </div>
        ))}
        {!perBank.length&&<div style={{textAlign:"center",padding:"30px 0",color:"#98A2B3",fontSize:12}}>No tagged bank activity yet.</div>}
      </>)}

      {showAdd&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:150,display:"flex",alignItems:"flex-end"}} onClick={()=>{resetForm();setShowAdd(false);}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"22px 22px 0 0",padding:"22px 20px calc(env(safe-area-inset-bottom) + 20px)",width:"100%"}}>
            <div style={{fontSize:14,fontWeight:800,color:"#0F172A",marginBottom:14}}>New money source</div>
            <input placeholder="Name — e.g. Aini's allowance" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={fieldStyle}/>
            <input placeholder="Received (starting)" type="number" value={form.openingReceived} onChange={e=>setForm(f=>({...f,openingReceived:e.target.value}))} style={fieldStyle}/>
            <input placeholder="Used (starting)" type="number" value={form.openingUsed} onChange={e=>setForm(f=>({...f,openingUsed:e.target.value}))} style={{...fieldStyle,marginBottom:14}}/>
            <div style={{display:"flex",gap:10}}>
              <div onClick={()=>{resetForm();setShowAdd(false);}} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,border:`1px solid ${T.border}`,color:"#5C6B73",fontWeight:700,fontSize:13}}>Cancel</div>
              <div onClick={addSource} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,background:T.accent,color:"#fff",fontWeight:700,fontSize:13}}>Create</div>
            </div>
          </div>
        </div>
      )}
    </MobileScreen>
  );
}
