import { useState, useMemo } from "react";
import { T, getSK } from "../../lib/theme.js";
import { fmtBal } from "../ledger.jsx";
import { fmt } from "../../lib/utils.js";
import MobileScreen from "./MobileScreen.jsx";

const fieldStyle={width:"100%",background:"#F6F8FA",border:`1px solid ${T.border}`,borderRadius:12,padding:"12px 14px",fontSize:16,fontFamily:"inherit",boxSizing:"border-box",marginBottom:12};

export default function MobileWhose({moneySources=[],saveMoneySources,transactions,accounts,tagTransaction,onClose}){
  const[tab,setTab]=useState("bybank"); // "bybank" | "monthly"
  const now=new Date();
  const[year,setYear]=useState(now.getFullYear());
  const[month,setMonth]=useState(now.getMonth());
  const monthLabel=new Date(year,month,1).toLocaleString("default",{month:"long",year:"numeric"});
  const stepMonth=dir=>{let m=month+dir,y=year;if(m<0){m=11;y--;}else if(m>11){m=0;y++;}setMonth(m);setYear(y);};
  const monthFrom=`${year}-${String(month+1).padStart(2,"0")}-01`;
  const monthTo=new Date(year,month+1,0).toISOString().slice(0,10);
  const[showAdd,setShowAdd]=useState(false);
  const[showManage,setShowManage]=useState(false);
  const[editingId,setEditingId]=useState(null);
  const[form,setForm]=useState({name:"",openingReceived:"",openingUsed:""});
  const[settleId,setSettleId]=useState(null);
  const[settleAmt,setSettleAmt]=useState("");
  const[selectedBank,setSelectedBank]=useState(null);

  // "1900" itself is Cash in Hand, not a bank — excluded so a cash⇄bank
  // transfer only counts on the real bank side, matching the desktop fix.
  const bankAccounts=useMemo(()=>accounts.filter(a=>getSK(a.code)==="1900"&&a.code!=="1900"),[accounts]);
  const activeSources=moneySources.filter(m=>!m.inactive);

  // Bank-first view, computed purely from real tagged transactions (never
  // from a source's manually-typed opening balance) — this is the only
  // place balances are shown, so what you see here always matches what's
  // actually posted to the bank, on either device, no separate "sources"
  // total that can drift out of sync with it.
  const perBank=useMemo(()=>bankAccounts.map(bank=>{
    const txns=transactions.filter(t=>t.debitCode===bank.code||t.creditCode===bank.code).sort((a,b)=>b.date.localeCompare(a.date));
    const tagged=txns.reduce((s,t)=>{
      if(!t.moneySourceId)return s;
      if(t.debitCode===bank.code)return s+t.amount; // incoming = debit
      return s-t.amount; // outgoing = credit
    },0);
    return{code:bank.code,name:bank.name,txns,tagged};
  }),[bankAccounts,transactions]);

  // Same "1900" exclusion as MoneySourcesPanel — used only for Monthly's
  // opening-balance math and the Settle action, not for the bank list above.
  const bankCodes=useMemo(()=>new Set(bankAccounts.map(a=>a.code)),[bankAccounts]);
  const bankTxns=useMemo(()=>transactions.filter(t=>bankCodes.has(t.debitCode)||bankCodes.has(t.creditCode)),[transactions,bankCodes]);
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
  const monthlyFor=(id,from,to)=>{
    const src=moneySources.find(m=>m.id===id);
    if(!src)return{opening:0,received:0,used:0,closing:0};
    const before=bankTxns.filter(t=>t.moneySourceId===id&&t.date<from);
    const beforeReceived=(src.openingReceived||0)+before.filter(t=>bankCodes.has(t.debitCode)).reduce((s,t)=>s+t.amount,0);
    const beforeUsed=(src.openingUsed||0)+before.filter(t=>bankCodes.has(t.creditCode)).reduce((s,t)=>s+t.amount,0);
    const opening=beforeReceived-beforeUsed;
    const inMonth=bankTxns.filter(t=>t.moneySourceId===id&&t.date>=from&&t.date<=to);
    const received=inMonth.filter(t=>bankCodes.has(t.debitCode)).reduce((s,t)=>s+t.amount,0);
    const used=inMonth.filter(t=>bankCodes.has(t.creditCode)).reduce((s,t)=>s+t.amount,0);
    return{opening,received,used,closing:opening+received-used};
  };
  const deficitSources=activeSources.filter(m=>totalsFor(m.id).remaining<0);

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
  };
  const settleDeficit=()=>{
    const amt=parseFloat(settleAmt)||0;
    if(!amt||!settleId)return;
    saveMoneySources(moneySources.map(m=>m.id===settleId?{...m,openingReceived:(m.openingReceived||0)+amt}:m));
    setSettleAmt("");setSettleId(null);
  };

  return(
    <MobileScreen title="Whose" subtitle="Money others gave you to spend" onClose={onClose}
      headerRight={
        <div onClick={()=>setShowManage(true)} style={{width:38,height:38,borderRadius:12,background:"#fff",boxShadow:"0 1px 6px rgba(20,40,50,0.08)",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <i className="ti ti-settings" style={{fontSize:16,color:T.accent}}/>
        </div>
      }>
      {deficitSources.length>0&&(
        <div style={{background:"#FEF2F2",borderRadius:14,padding:"12px 15px",marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:700,color:"#E14848"}}>{deficitSources.length} source{deficitSources.length===1?"":"s"} overspent — settle from your next salary (⚙ above).</div>
        </div>
      )}

      <div style={{display:"flex",gap:6,marginBottom:18}}>
        {[["bybank","By bank"],["monthly","Monthly"]].map(([id,label])=>(
          <div key={id} onClick={()=>setTab(id)} style={{flex:1,textAlign:"center",padding:"8px",borderRadius:20,fontSize:12,fontWeight:700,background:tab===id?T.accent:"#fff",color:tab===id?"#fff":"#5C6B73",boxShadow:tab===id?"none":"0 1px 6px rgba(20,40,50,0.05)"}}>{label}</div>
        ))}
      </div>

      {tab==="bybank"&&(<>
        {!perBank.length&&<div style={{textAlign:"center",padding:"30px 0",color:"#98A2B3",fontSize:12}}>No bank accounts found.</div>}
        {perBank.length>0&&(<>
          <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4,marginBottom:16,WebkitOverflowScrolling:"touch"}}>
            {perBank.map(b=>{
              const active=(selectedBank||perBank[0].code)===b.code;
              return(
                <div key={b.code} onClick={()=>setSelectedBank(b.code)} style={{flexShrink:0,padding:"9px 14px",borderRadius:20,fontSize:12,fontWeight:700,background:active?T.accent:"#fff",color:active?"#fff":"#5C6B73",boxShadow:active?"none":"0 1px 6px rgba(20,40,50,0.05)",whiteSpace:"nowrap"}}>
                  {b.name}
                </div>
              );
            })}
          </div>
          {(()=>{
            const b=perBank.find(x=>x.code===(selectedBank||perBank[0].code))||perBank[0];
            return(
              <div style={{background:"#fff",borderRadius:16,padding:16,boxShadow:"0 1px 6px rgba(20,40,50,0.04)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <div style={{fontSize:12.5,fontWeight:800,color:"#0F172A"}}>{b.code} {b.name}</div>
                  <div style={{fontSize:12,fontWeight:700,color:b.tagged<0?"#E14848":"#8A93A3"}}>{fmtBal(b.tagged)} tagged</div>
                </div>
                <div style={{fontSize:10,color:"#98A2B3",marginBottom:10}}>Incoming = debit, outgoing = credit. Tap to tag or retag.</div>
                {b.txns.slice(0,60).map(t=>{
                  const isIn=t.debitCode===b.code;
                  return(
                    <div key={t.id} style={{padding:"9px 0",borderTop:`1px solid ${T.border}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                        <div style={{flex:1,minWidth:0,marginRight:8}}>
                          <div style={{fontSize:11.5,fontWeight:700,color:"#0F172A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</div>
                          <div style={{fontSize:9.5,color:"#98A2B3"}}>{t.date}</div>
                        </div>
                        <div style={{fontSize:12,fontWeight:800,color:isIn?"#0E9F6E":"#E14848",flexShrink:0}}>{isIn?"+":"−"}{fmt(t.amount)}</div>
                      </div>
                      <select value={t.moneySourceId||""} onChange={e=>tagTransaction(t.id,e.target.value||null)} style={{width:"100%",background:"#F6F8FA",border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 8px",fontSize:11.5,fontFamily:"inherit"}}>
                        <option value="">— untagged —</option>
                        {activeSources.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                  );
                })}
                {!b.txns.length&&<div style={{textAlign:"center",padding:"14px 0",color:"#98A2B3",fontSize:11.5}}>No transactions yet.</div>}
              </div>
            );
          })()}
        </>)}
      </>)}

      {tab==="monthly"&&(<>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fff",borderRadius:14,padding:"10px 16px",marginBottom:16,boxShadow:"0 1px 6px rgba(20,40,50,0.05)"}}>
          <div onClick={()=>stepMonth(-1)} style={{fontSize:18,color:"#8A93A3",padding:"0 10px"}}>‹</div>
          <div style={{fontSize:13.5,fontWeight:800,color:"#0F172A"}}>{monthLabel}</div>
          <div onClick={()=>stepMonth(1)} style={{fontSize:18,color:"#8A93A3",padding:"0 10px"}}>›</div>
        </div>
        {activeSources.map(m=>{
          const s=monthlyFor(m.id,monthFrom,monthTo);
          return(
            <div key={m.id} style={{background:"#fff",borderRadius:16,padding:16,marginBottom:10,boxShadow:"0 1px 6px rgba(20,40,50,0.04)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{fontSize:13,fontWeight:700,color:"#0F172A"}}>{m.name}</div>
                <div style={{fontSize:14,fontWeight:800,color:s.closing<0?"#E14848":"#0D9488"}}>{fmtBal(s.closing)}</div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10.5,color:"#8A93A3",borderTop:`1px solid ${T.border}`,paddingTop:9}}>
                <div><div style={{fontWeight:600}}>Opening</div><div style={{fontWeight:800,color:"#3A4750",marginTop:2}}>{fmtBal(s.opening)}</div></div>
                <div><div style={{fontWeight:600,color:"#0E9F6E"}}>In</div><div style={{fontWeight:800,color:"#0E9F6E",marginTop:2}}>{fmtBal(s.received)}</div></div>
                <div><div style={{fontWeight:600,color:"#E14848"}}>Out</div><div style={{fontWeight:800,color:"#E14848",marginTop:2}}>{fmtBal(s.used)}</div></div>
                <div style={{textAlign:"right"}}><div style={{fontWeight:600}}>Closing</div><div style={{fontWeight:800,color:s.closing<0?"#E14848":"#3A4750",marginTop:2}}>{fmtBal(s.closing)}</div></div>
              </div>
            </div>
          );
        })}
        {!activeSources.length&&<div style={{textAlign:"center",padding:"30px 0",color:"#98A2B3",fontSize:12}}>No money sources yet.</div>}
      </>)}

      {/* Manage sources sheet — add/edit/delete/settle, deliberately tucked
          away from the main balances view so it can't be mistaken for a
          live balance total. */}
      {showManage&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:150,display:"flex",alignItems:"flex-end"}} onClick={()=>setShowManage(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"22px 22px 0 0",padding:"22px 20px calc(env(safe-area-inset-bottom) + 20px)",width:"100%",maxHeight:"78vh",display:"flex",flexDirection:"column"}}>
            <div style={{fontSize:14,fontWeight:800,color:"#0F172A",marginBottom:14}}>Manage sources</div>
            <div style={{overflowY:"auto",flex:1,marginBottom:14}}>
              {moneySources.map(m=>{
                const t=totalsFor(m.id);
                return(
                  <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 0",borderBottom:`1px solid ${T.border}`}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12.5,fontWeight:700,color:"#0F172A"}}>{m.name}</div>
                      <div style={{fontSize:10.5,color:t.remaining<0?"#E14848":"#8A93A3"}}>{fmtBal(t.remaining)} remaining</div>
                    </div>
                    {t.remaining<0&&<div onClick={()=>{setSettleId(m.id);setSettleAmt(String(Math.abs(t.remaining)));}} style={{width:30,height:30,borderRadius:9,background:"rgba(13,148,136,0.1)",display:"flex",alignItems:"center",justifyContent:"center"}}><i className="ti ti-cash" style={{fontSize:14,color:T.accent}}/></div>}
                    <div onClick={()=>startEdit(m)} style={{width:30,height:30,borderRadius:9,background:"#F6F8FA",display:"flex",alignItems:"center",justifyContent:"center"}}><i className="ti ti-pencil" style={{fontSize:13,color:"#8A93A3"}}/></div>
                    <div onClick={()=>removeSource(m.id)} style={{width:30,height:30,borderRadius:9,background:"#F6F8FA",display:"flex",alignItems:"center",justifyContent:"center"}}><i className="ti ti-trash" style={{fontSize:13,color:"#E14848"}}/></div>
                  </div>
                );
              })}
              {!moneySources.length&&<div style={{textAlign:"center",padding:"20px 0",color:"#98A2B3",fontSize:12}}>No sources yet.</div>}
            </div>
            <div onClick={()=>{resetForm();setShowAdd(true);}} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"12px",borderRadius:14,border:`1.5px dashed ${T.border}`,color:T.accent,fontSize:12.5,fontWeight:700}}>
              <i className="ti ti-plus" style={{fontSize:14}}/>Add money source
            </div>
          </div>
        </div>
      )}

      {settleId&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:160,display:"flex",alignItems:"flex-end"}} onClick={()=>setSettleId(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"22px 22px 0 0",padding:"22px 20px calc(env(safe-area-inset-bottom) + 20px)",width:"100%"}}>
            <div style={{fontSize:14,fontWeight:800,color:"#0F172A",marginBottom:4}}>Settle {moneySources.find(m=>m.id===settleId)?.name}</div>
            <div style={{fontSize:11.5,color:"#8A93A3",marginBottom:14}}>Amount you're putting back from your own funds (e.g. next salary)</div>
            <input autoFocus type="number" value={settleAmt} onChange={e=>setSettleAmt(e.target.value)} style={fieldStyle}/>
            <div style={{display:"flex",gap:10}}>
              <div onClick={()=>setSettleId(null)} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,border:`1px solid ${T.border}`,color:"#5C6B73",fontWeight:700,fontSize:13}}>Cancel</div>
              <div onClick={settleDeficit} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,background:T.accent,color:"#fff",fontWeight:700,fontSize:13}}>Settle</div>
            </div>
          </div>
        </div>
      )}

      {showAdd&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:170,display:"flex",alignItems:"flex-end"}} onClick={()=>{resetForm();setShowAdd(false);}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"22px 22px 0 0",padding:"22px 20px calc(env(safe-area-inset-bottom) + 20px)",width:"100%"}}>
            <div style={{fontSize:14,fontWeight:800,color:"#0F172A",marginBottom:14}}>{editingId?"Edit source":"New money source"}</div>
            <input placeholder="Name — e.g. Aini's allowance" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={fieldStyle}/>
            <input placeholder="Received (starting)" type="number" value={form.openingReceived} onChange={e=>setForm(f=>({...f,openingReceived:e.target.value}))} style={fieldStyle}/>
            <input placeholder="Used (starting)" type="number" value={form.openingUsed} onChange={e=>setForm(f=>({...f,openingUsed:e.target.value}))} style={{...fieldStyle,marginBottom:14}}/>
            <div style={{display:"flex",gap:10}}>
              <div onClick={()=>{resetForm();setShowAdd(false);}} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,border:`1px solid ${T.border}`,color:"#5C6B73",fontWeight:700,fontSize:13}}>Cancel</div>
              <div onClick={editingId?saveEditSrc:addSource} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,background:T.accent,color:"#fff",fontWeight:700,fontSize:13}}>{editingId?"Save":"Create"}</div>
            </div>
          </div>
        </div>
      )}
    </MobileScreen>
  );
}
