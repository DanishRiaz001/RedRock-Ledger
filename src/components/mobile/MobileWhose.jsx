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
  // Per-bank manual adjustment — a correction layered on top of real tagged
  // transactions (never replacing them), keyed by bank code so it can't
  // bleed into a different bank's total. Tapping a person's amount in the
  // by-bank Overview opens this, pre-filled with whatever adjustment
  // already exists for that exact (person, bank) pair.
  const[adjustCtx,setAdjustCtx]=useState(null); // {sourceId,bankCode,name,bankName,taggedIn,taggedOut}
  const[adjIn,setAdjIn]=useState("");
  const[adjOut,setAdjOut]=useState("");

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
  const openAdjust=(sourceId,bankCode,name,bankName,taggedIn,taggedOut)=>{
    const src=moneySources.find(m=>m.id===sourceId);
    const existing=(src&&src.bankAdjustments&&src.bankAdjustments[bankCode])||{};
    setAdjIn(existing.received?String(existing.received):"");
    setAdjOut(existing.used?String(existing.used):"");
    setAdjustCtx({sourceId,bankCode,name,bankName,taggedIn,taggedOut});
  };
  const saveAdjust=()=>{
    if(!adjustCtx)return;
    const{sourceId,bankCode}=adjustCtx;
    const received=parseFloat(adjIn)||0;
    const used=parseFloat(adjOut)||0;
    saveMoneySources(moneySources.map(m=>{
      if(m.id!==sourceId)return m;
      const bankAdjustments={...(m.bankAdjustments||{})};
      if(received||used)bankAdjustments[bankCode]={received,used};
      else delete bankAdjustments[bankCode];
      return{...m,bankAdjustments};
    }));
    setAdjustCtx(null);
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
          {/* Dropdown bank picker — this drives the overview, monthly, and
              transaction sections below it, all scoped to the chosen bank. */}
          <select value={selectedBank||perBank[0].code} onChange={e=>setSelectedBank(e.target.value)} style={{width:"100%",background:"#fff",border:`1px solid ${T.border}`,borderRadius:14,padding:"13px 14px",fontSize:13,fontWeight:800,color:"#0F172A",fontFamily:"inherit",marginBottom:16,boxShadow:"0 1px 6px rgba(20,40,50,0.05)",appearance:"none",WebkitAppearance:"none"}}>
            {perBank.map(b=><option key={b.code} value={b.code}>{b.code} · {b.name}</option>)}
          </select>
          {(()=>{
            const b=perBank.find(x=>x.code===(selectedBank||perBank[0].code))||perBank[0];
            const bankTotalNet=b.txns.reduce((s,t)=>t.debitCode===b.code?s+t.amount:s-t.amount,0);
            const persons=activeSources.map(m=>{
              const srcTxns=b.txns.filter(t=>t.moneySourceId===m.id);
              const taggedIn=srcTxns.filter(t=>t.debitCode===b.code).reduce((s,t)=>s+t.amount,0);
              const taggedOut=srcTxns.filter(t=>t.creditCode===b.code).reduce((s,t)=>s+t.amount,0);
              const adj=(m.bankAdjustments&&m.bankAdjustments[b.code])||{received:0,used:0};
              const remaining=taggedIn-taggedOut+(adj.received||0)-(adj.used||0);
              return{id:m.id,name:m.name,taggedIn,taggedOut,remaining,active:srcTxns.length>0||!!(adj.received||adj.used)};
            }).filter(p=>p.active).sort((a,c)=>c.remaining-a.remaining);
            const unassigned=bankTotalNet-b.tagged;
            return(<>
              {/* Overview — who this bank's tagged money currently belongs to.
                  Tap a person's amount to enter a manual in/out correction —
                  layered on top of their tagged transactions, never
                  replacing them, so the transaction total stays the source
                  of truth for the bank as a whole. */}
              <div style={{background:"#fff",borderRadius:16,padding:16,marginBottom:14,boxShadow:"0 1px 6px rgba(20,40,50,0.04)"}}>
                <div style={{fontSize:12.5,fontWeight:800,color:"#0F172A",marginBottom:10}}>Overview</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:10,borderBottom:`1px solid ${T.border}`}}>
                  <div style={{fontSize:11.5,fontWeight:700,color:"#5C7A76"}}>Balance in bank</div>
                  <div style={{fontSize:15,fontWeight:800,color:"#0F172A"}}>{fmtBal(bankTotalNet)}</div>
                </div>
                {persons.map(p=>(
                  <div key={p.id} onClick={()=>openAdjust(p.id,b.code,p.name,b.name,p.taggedIn,p.taggedOut)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderTop:`1px solid ${T.border}`,cursor:"pointer"}}>
                    <div style={{fontSize:12,fontWeight:600,color:"#3A4750"}}>{p.name}</div>
                    <div style={{display:"flex",alignItems:"center",gap:5}}>
                      <div style={{fontSize:12.5,fontWeight:800,color:p.remaining<0?"#E14848":"#0D9488"}}>{fmtBal(p.remaining)}</div>
                      <i className="ti ti-pencil" style={{fontSize:11,color:"#B0BAC3"}}/>
                    </div>
                  </div>
                ))}
                {Math.abs(unassigned)>0.5&&(
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderTop:`1px solid ${T.border}`}}>
                    <div style={{fontSize:12,fontWeight:600,color:"#98A2B3"}}>Unassigned</div>
                    <div style={{fontSize:12.5,fontWeight:800,color:"#98A2B3"}}>{fmtBal(unassigned)}</div>
                  </div>
                )}
                {!persons.length&&Math.abs(unassigned)<=0.5&&<div style={{textAlign:"center",padding:"10px 0 2px",color:"#98A2B3",fontSize:11.5}}>Nothing tagged in this bank yet.</div>}
                {/* Reconciliation footer — Overview sum is just the persons
                    added together (e.g. +50,000 and -20,000 nets to
                    +30,000); Difference is the balance minus that sum, so it
                    shows what's not accounted for by name (untagged, or a
                    tagged-but-now-inactive source hidden from the list). */}
                {(persons.length>0||Math.abs(unassigned)>0.5)&&(()=>{
                  const overviewSum=persons.reduce((s,p)=>s+p.remaining,0);
                  const difference=bankTotalNet-overviewSum;
                  return(
                    <div style={{marginTop:6,paddingTop:9,borderTop:`1px solid ${T.border}`,display:"flex",flexDirection:"column",gap:6}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div style={{fontSize:11.5,fontWeight:700,color:"#5C7A76"}}>Overview sum</div>
                        <div style={{fontSize:12.5,fontWeight:800,color:"#0F172A"}}>{fmtBal(overviewSum)}</div>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div style={{fontSize:11.5,fontWeight:700,color:"#5C7A76"}}>Difference</div>
                        <div style={{fontSize:12.5,fontWeight:800,color:Math.abs(difference)>0.5?"#E14848":"#0D9488"}}>{fmtBal(difference)}</div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Transactions — tag dropdown sits right on each entry */}
              <div style={{background:"#fff",borderRadius:16,padding:16,boxShadow:"0 1px 6px rgba(20,40,50,0.04)"}}>
                <div style={{fontSize:12.5,fontWeight:800,color:"#0F172A",marginBottom:4}}>Transactions</div>
                <div style={{fontSize:10,color:"#98A2B3",marginBottom:10}}>Incoming = debit, outgoing = credit.</div>
                {b.txns.slice(0,60).map(t=>{
                  const isIn=t.debitCode===b.code;
                  return(
                    <div key={t.id} style={{padding:"9px 0",borderTop:`1px solid ${T.border}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:11.5,fontWeight:700,color:"#0F172A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</div>
                          <div style={{fontSize:9.5,color:"#98A2B3"}}>{t.date}</div>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <div style={{fontSize:12,fontWeight:800,color:isIn?"#0E9F6E":"#E14848",marginBottom:4}}>{isIn?"+":"−"}{fmt(t.amount)}</div>
                          <select value={t.moneySourceId||""} onChange={e=>tagTransaction(t.id,e.target.value||null)} style={{background:"#F6F8FA",border:`1px solid ${T.border}`,borderRadius:8,padding:"4px 6px",fontSize:10.5,fontFamily:"inherit",maxWidth:130}}>
                            <option value="">— untagged —</option>
                            {activeSources.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!b.txns.length&&<div style={{textAlign:"center",padding:"14px 0",color:"#98A2B3",fontSize:11.5}}>No transactions yet.</div>}
              </div>
            </>);
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

      {adjustCtx&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:160,display:"flex",alignItems:"flex-end"}} onClick={()=>setAdjustCtx(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"22px 22px 0 0",padding:"22px 20px calc(env(safe-area-inset-bottom) + 20px)",width:"100%"}}>
            <div style={{fontSize:14,fontWeight:800,color:"#0F172A",marginBottom:2}}>{adjustCtx.name}</div>
            <div style={{fontSize:11.5,color:"#8A93A3",marginBottom:14}}>{adjustCtx.bankName}</div>
            <div style={{background:"#F6F8FA",borderRadius:12,padding:"10px 14px",marginBottom:14,display:"flex",justifyContent:"space-between"}}>
              <div style={{fontSize:11,color:"#8A93A3"}}>From transactions</div>
              <div style={{fontSize:11,fontWeight:700}}><span style={{color:"#0E9F6E"}}>In {fmtBal(adjustCtx.taggedIn)}</span> <span style={{color:"#E14848",marginLeft:8}}>Out {fmtBal(adjustCtx.taggedOut)}</span></div>
            </div>
            <div style={{fontSize:10.5,fontWeight:700,color:"#8A93A3",textTransform:"uppercase",letterSpacing:0.4,marginBottom:8}}>Manual adjustment</div>
            <div style={{fontSize:9.5,color:"#8A93A3",marginBottom:2}}>Amount in</div>
            <input autoFocus type="number" placeholder="0" value={adjIn} onChange={e=>setAdjIn(e.target.value)} style={fieldStyle}/>
            <div style={{fontSize:9.5,color:"#8A93A3",marginBottom:2}}>Amount out</div>
            <input type="number" placeholder="0" value={adjOut} onChange={e=>setAdjOut(e.target.value)} style={{...fieldStyle,marginBottom:14}}/>
            <div style={{display:"flex",gap:10}}>
              <div onClick={()=>setAdjustCtx(null)} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,border:`1px solid ${T.border}`,color:"#5C6B73",fontWeight:700,fontSize:13}}>Cancel</div>
              <div onClick={saveAdjust} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,background:T.accent,color:"#fff",fontWeight:700,fontSize:13}}>Save</div>
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
