import { useState, useMemo } from "react";
import { T, getSK } from "../../lib/theme.js";
import { fmtBal } from "../ledger.jsx";

const isExpenseCode=code=>{const sk=getSK(code);return sk&&sk>="4000"&&sk<"8000";};

// Best-effort icon + color per category, matched by keyword in the account
// name — purely cosmetic (falls back to a neutral wallet icon), so a name
// that doesn't match anything still looks fine, just generic.
const CATEGORY_LOOK=[
  {kw:["rent","housing","house"],icon:"ti-home",bg:"rgba(180,116,14,0.14)",fg:"#B4740E"},
  {kw:["electric"],icon:"ti-bolt",bg:"rgba(234,179,8,0.16)",fg:"#B45309"},
  {kw:["internet","wifi","wi-fi"],icon:"ti-wifi",bg:"rgba(36,97,217,0.14)",fg:"#2461D9"},
  {kw:["phone","telephone","mobile"],icon:"ti-phone",bg:"rgba(124,58,237,0.14)",fg:"#7C3AED"},
  {kw:["maintenance","repair"],icon:"ti-tool",bg:"rgba(232,90,59,0.14)",fg:"#E85A3B"},
  {kw:["grocer","milk","dairy","essential","food"],icon:"ti-shopping-cart",bg:"rgba(36,97,217,0.14)",fg:"#2461D9"},
  {kw:["restaurant","eating","outing","coffee","cafe"],icon:"ti-coffee",bg:"rgba(180,116,14,0.14)",fg:"#B4740E"},
  {kw:["health","medic","hospital","pharmacy"],icon:"ti-heart",bg:"rgba(225,72,72,0.14)",fg:"#E14848"},
  {kw:["fuel","gas","petrol","sngpl"],icon:"ti-flame",fg:"#E85A3B",bg:"rgba(232,90,59,0.14)"},
  {kw:["salary","allowance","wage"],icon:"ti-wallet",bg:"rgba(13,148,136,0.14)",fg:"#0D9488"},
  {kw:["water"],icon:"ti-droplet",bg:"rgba(36,97,217,0.14)",fg:"#2461D9"},
  {kw:["insurance"],icon:"ti-shield",bg:"rgba(124,58,237,0.14)",fg:"#7C3AED"},
  {kw:["education","school","tuition"],icon:"ti-school",bg:"rgba(13,148,136,0.14)",fg:"#0D9488"},
  {kw:["transport","fare","taxi","uber"],icon:"ti-car",bg:"rgba(36,97,217,0.14)",fg:"#2461D9"},
];
const lookFor=name=>{
  const n=(name||"").toLowerCase();
  const hit=CATEGORY_LOOK.find(c=>c.kw.some(k=>n.includes(k)));
  return hit||{icon:"ti-wallet",bg:"rgba(90,110,120,0.1)",fg:"#5C6B73"};
};

const TABS=[
  {id:"assigned",label:"Assigned"},
  {id:"unassigned",label:"Unassigned"},
  {id:"rebalance",label:"Rebalance"},
];

export default function MobileBudget({accounts,transactions,budgets,saveBudget}){
  const now=new Date();
  const[year,setYear]=useState(now.getFullYear());
  const[month,setMonth]=useState(now.getMonth());
  const[tab,setTab]=useState("assigned");
  const periodLabel=new Date(year,month,1).toLocaleString("default",{month:"long",year:"numeric"});
  const stepMonth=dir=>{let m=month+dir,y=year;if(m<0){m=11;y--;}else if(m>11){m=0;y++;}setMonth(m);setYear(y);};
  const from=`${year}-${String(month+1).padStart(2,"0")}-01`;
  const to=new Date(year,month+1,0).toISOString().slice(0,10);

  const[editing,setEditing]=useState(null); // code being edited
  const[editVal,setEditVal]=useState("");
  const[showAdd,setShowAdd]=useState(false);
  const[copyDraft,setCopyDraft]=useState(null); // array while the copy-review sheet is open

  const expenseAccounts=useMemo(()=>accounts.filter(a=>isExpenseCode(a.code)),[accounts]);
  const rows=useMemo(()=>budgets.filter(b=>b.year===year&&b.month===month&&b.amount>0),[budgets,year,month]);
  const getActual=code=>transactions.filter(t=>t.debitCode===code&&t.date>=from&&t.date<=to&&!t.reversedBy&&!t.reversalOf).reduce((s,t)=>s+t.amount,0);
  const getName=code=>((accounts.find(a=>a.code===code))||{name:code}).name;

  const totalBudget=rows.reduce((s,r)=>s+r.amount,0);
  const totalActual=rows.reduce((s,r)=>s+getActual(r.code),0);

  const prevDate=new Date(year,month-1,1);
  const prevRows=useMemo(()=>budgets.filter(b=>b.year===prevDate.getFullYear()&&b.month===prevDate.getMonth()&&b.amount>0),[budgets,prevDate]);
  const prevLabel=prevDate.toLocaleString("default",{month:"long"});

  const startEdit=(code,current)=>{setEditing(code);setEditVal(current?String(current):"");};
  const commitEdit=()=>{
    const amt=parseFloat(editVal)||0;
    saveBudget(year,month,editing,amt);
    setEditing(null);
  };

  const availableToAdd=expenseAccounts.filter(a=>!rows.some(r=>r.code===a.code));
  const unassigned=useMemo(()=>availableToAdd
    .map(a=>({code:a.code,name:a.name,actual:getActual(a.code)}))
    .filter(u=>u.actual>0)
    .sort((a,b)=>b.actual-a.actual),
  [availableToAdd,transactions,from,to]);

  // Rebalance: lines running over their budget, and lines sitting on a big
  // chunk of unused budget (>=40% left with something already spent, or
  // fully untouched) — a simple "move the slack to cover the overage" view.
  const rebalance=useMemo(()=>{
    const over=[],under=[];
    rows.forEach(r=>{
      const actual=getActual(r.code);
      const left=r.amount-actual;
      if(actual>r.amount)over.push({code:r.code,name:getName(r.code),amount:r.amount,actual,over:actual-r.amount});
      else if(r.amount>0&&left/r.amount>=0.4)under.push({code:r.code,name:getName(r.code),amount:r.amount,actual,left});
    });
    over.sort((a,b)=>b.over-a.over);
    under.sort((a,b)=>b.left-a.left);
    return{over,under,totalOver:over.reduce((s,r)=>s+r.over,0),totalUnused:under.reduce((s,r)=>s+r.left,0)};
  },[rows,transactions,from,to]);

  const openCopySheet=()=>{
    setCopyDraft(prevRows.map(r=>({code:r.code,name:getName(r.code),amount:r.amount,include:true})));
  };
  const confirmCopy=()=>{
    copyDraft.filter(d=>d.include&&d.amount>0).forEach(d=>saveBudget(year,month,d.code,d.amount));
    setCopyDraft(null);
  };

  return(
    <div style={{paddingBottom:24}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fff",borderRadius:14,padding:"10px 16px",marginBottom:18,boxShadow:"0 1px 6px rgba(20,40,50,0.05)"}}>
        <div onClick={()=>stepMonth(-1)} style={{fontSize:18,color:"#8A93A3",padding:"0 8px"}}>‹</div>
        <div style={{fontSize:13.5,fontWeight:800,color:"#0F172A"}}>{periodLabel}</div>
        <div onClick={()=>stepMonth(1)} style={{fontSize:18,color:"#8A93A3",padding:"0 8px"}}>›</div>
      </div>

      <div style={{background:"linear-gradient(135deg,#0F2A26,#0D9488)",borderRadius:18,padding:18,color:"#fff",marginBottom:16}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.75)",fontWeight:600}}>Total budgeted</div>
        <div style={{fontSize:24,fontWeight:800,marginTop:3}}>{fmtBal(totalBudget)}</div>
        <div style={{height:6,background:"rgba(255,255,255,0.2)",borderRadius:3,margin:"12px 0 8px",overflow:"hidden"}}>
          <div style={{height:"100%",width:`${Math.min(100,totalBudget?(totalActual/totalBudget)*100:0)}%`,background:totalActual>totalBudget?"#FF8266":"#fff",borderRadius:3}}/>
        </div>
        <div style={{fontSize:11.5,color:"rgba(255,255,255,0.85)"}}>{fmtBal(totalActual)} spent · {fmtBal(Math.max(0,totalBudget-totalActual))} left{totalBudget?` · ${Math.round((totalActual/totalBudget)*100)}%`:""}</div>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:18}}>
        {TABS.map(t=>{
          const count=t.id==="unassigned"?unassigned.length:t.id==="rebalance"?rebalance.over.length+rebalance.under.length:0;
          const active=tab===t.id;
          return(
            <div key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,textAlign:"center",padding:"8px 4px",borderRadius:20,fontSize:11.5,fontWeight:700,background:active?T.accent:"#fff",color:active?"#fff":"#5C6B73",boxShadow:active?"none":"0 1px 6px rgba(20,40,50,0.05)"}}>
              {t.label}{count>0&&` (${count})`}
            </div>
          );
        })}
      </div>

      {tab==="assigned"&&(<>
        {!rows.length&&prevRows.length>0&&(
          <div onClick={openCopySheet} style={{display:"flex",alignItems:"center",gap:12,background:T.accentLight,borderRadius:14,padding:"13px 15px",marginBottom:14,cursor:"pointer"}}>
            <div style={{width:34,height:34,borderRadius:10,background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><i className="ti ti-copy" style={{fontSize:16,color:T.accent}}/></div>
            <div style={{flex:1}}>
              <div style={{fontSize:12.5,fontWeight:700,color:"#0F2A26"}}>Copy budget from {prevLabel}</div>
              <div style={{fontSize:10.5,color:"#5C7A76",marginTop:1}}>{prevRows.length} line{prevRows.length===1?"":"s"} · review & confirm amounts</div>
            </div>
            <i className="ti ti-chevron-right" style={{fontSize:15,color:T.accent}}/>
          </div>
        )}

        {rows.length>0&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:6}}>
            {rows.map(r=>{
              const actual=getActual(r.code);
              const over=actual>r.amount;
              const left=r.amount-actual;
              const look=lookFor(getName(r.code));
              return(
                <div key={r.code} style={{position:"relative",background:"#fff",borderRadius:16,padding:"14px 12px",boxShadow:"0 1px 6px rgba(20,40,50,0.04)"}}>
                  <div onClick={e=>{e.stopPropagation();startEdit(r.code,r.amount);}} style={{position:"absolute",top:10,right:10,width:24,height:24,borderRadius:8,background:"#F6F8FA",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <i className="ti ti-pencil" style={{fontSize:12,color:"#8A93A3"}}/>
                  </div>
                  <div style={{width:38,height:38,borderRadius:12,background:look.bg,color:look.fg,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:10}}><i className={`ti ${look.icon}`} style={{fontSize:17}}/></div>
                  <div style={{fontSize:11.5,fontWeight:700,color:"#0F172A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3,marginRight:20}}>{getName(r.code)}</div>
                  <div style={{fontSize:12.5,fontWeight:800,color:over?"#E14848":"#0F172A"}}>{over?`${fmtBal(Math.abs(left))} over`:`${fmtBal(left)} left`}</div>
                  <div style={{fontSize:9.5,color:"#98A2B3",marginTop:2}}>of {fmtBal(r.amount)}</div>
                </div>
              );
            })}
          </div>
        )}
        {!rows.length&&!prevRows.length&&<div style={{textAlign:"center",padding:"30px 0",color:"#98A2B3",fontSize:12}}>No budget set for {periodLabel} yet.</div>}
        {!rows.length&&prevRows.length>0&&<div style={{textAlign:"center",padding:"10px 0 20px",color:"#98A2B3",fontSize:12}}>No lines yet this month — copy last month's above to get started.</div>}

        <div onClick={()=>setShowAdd(true)} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginTop:12,padding:"12px",borderRadius:14,border:`1.5px dashed ${T.border}`,color:T.accent,fontSize:12.5,fontWeight:700}}>
          <i className="ti ti-plus" style={{fontSize:14}}/>Add budget line
        </div>
      </>)}

      {tab==="unassigned"&&(<>
        <div style={{fontSize:10.5,color:"#8A93A3",marginBottom:12}}>Spent this period with no budget line set — tap + to give one a budget.</div>
        {unassigned.map(u=>(
          <div key={u.code} onClick={()=>startEdit(u.code,0)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fff",borderRadius:14,padding:"12px 15px",marginBottom:8,boxShadow:"0 1px 6px rgba(20,40,50,0.04)"}}>
            <div style={{fontSize:12.5,fontWeight:700,color:"#0F172A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,marginRight:10}}>{u.name}</div>
            <div style={{fontSize:11.5,fontWeight:700,color:"#B4740E",flexShrink:0}}>{fmtBal(u.actual)}</div>
            <i className="ti ti-plus" style={{fontSize:13,color:T.accent,marginLeft:10,flexShrink:0}}/>
          </div>
        ))}
        {!unassigned.length&&<div style={{textAlign:"center",padding:"30px 0",color:"#98A2B3",fontSize:12}}>Nothing unassigned — every expense this period has a budget line.</div>}
      </>)}

      {tab==="rebalance"&&(<>
        {(rebalance.over.length>0||rebalance.under.length>0)?(
          <div style={{background:T.accentLight,borderRadius:14,padding:"13px 15px",marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:700,color:"#0F2A26"}}>
              {rebalance.totalUnused>0&&rebalance.totalOver>0
                ?`You have ${fmtBal(rebalance.totalUnused)} unused that could cover ${fmtBal(Math.min(rebalance.totalUnused,rebalance.totalOver))} of the ${fmtBal(rebalance.totalOver)} over budget.`
                :rebalance.totalOver>0?`${fmtBal(rebalance.totalOver)} over budget across ${rebalance.over.length} line${rebalance.over.length===1?"":"s"}.`
                :`${fmtBal(rebalance.totalUnused)} sitting unused across ${rebalance.under.length} line${rebalance.under.length===1?"":"s"} — consider moving it or lowering those budgets.`}
            </div>
          </div>
        ):(
          <div style={{textAlign:"center",padding:"30px 0",color:"#98A2B3",fontSize:12}}>Nothing to rebalance — every line is on track.</div>
        )}

        {rebalance.over.length>0&&(<>
          <div style={{fontSize:11,fontWeight:800,color:"#E14848",textTransform:"uppercase",letterSpacing:0.4,marginBottom:8}}>Over budget</div>
          {rebalance.over.map(r=>(
            <div key={r.code} onClick={()=>startEdit(r.code,r.amount)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fff",borderRadius:14,padding:"12px 15px",marginBottom:8,boxShadow:"0 1px 6px rgba(20,40,50,0.04)"}}>
              <div style={{fontSize:12.5,fontWeight:700,color:"#0F172A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,marginRight:10}}>{r.name}</div>
              <div style={{fontSize:11.5,fontWeight:700,color:"#E14848",flexShrink:0}}>+{fmtBal(r.over)} over</div>
            </div>
          ))}
        </>)}

        {rebalance.under.length>0&&(<>
          <div style={{fontSize:11,fontWeight:800,color:"#0E9F6E",textTransform:"uppercase",letterSpacing:0.4,margin:rebalance.over.length?"16px 0 8px":"0 0 8px"}}>Sitting unused</div>
          {rebalance.under.map(r=>(
            <div key={r.code} onClick={()=>startEdit(r.code,r.amount)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fff",borderRadius:14,padding:"12px 15px",marginBottom:8,boxShadow:"0 1px 6px rgba(20,40,50,0.04)"}}>
              <div style={{fontSize:12.5,fontWeight:700,color:"#0F172A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,marginRight:10}}>{r.name}</div>
              <div style={{fontSize:11.5,fontWeight:700,color:"#0E9F6E",flexShrink:0}}>{fmtBal(r.left)} left</div>
            </div>
          ))}
        </>)}
      </>)}

      {/* Edit amount sheet */}
      {editing&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:50,display:"flex",alignItems:"flex-end"}} onClick={()=>setEditing(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"22px 22px 0 0",padding:"22px 20px calc(env(safe-area-inset-bottom) + 20px)",width:"100%"}}>
            <div style={{fontSize:14,fontWeight:800,color:"#0F172A",marginBottom:4}}>{getName(editing)}</div>
            <div style={{fontSize:11.5,color:"#8A93A3",marginBottom:14}}>Monthly budget amount</div>
            <input autoFocus type="number" value={editVal} onChange={e=>setEditVal(e.target.value)} style={{width:"100%",background:"#F6F8FA",border:`1px solid ${T.border}`,borderRadius:12,padding:"12px 14px",fontSize:16,fontFamily:"inherit",boxSizing:"border-box",marginBottom:14}}/>
            <div style={{display:"flex",gap:10}}>
              <div onClick={()=>setEditing(null)} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,border:`1px solid ${T.border}`,color:"#5C6B73",fontWeight:700,fontSize:13}}>Cancel</div>
              <div onClick={commitEdit} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,background:T.accent,color:"#fff",fontWeight:700,fontSize:13}}>Save</div>
            </div>
          </div>
        </div>
      )}

      {/* Add new budget line sheet */}
      {showAdd&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:50,display:"flex",alignItems:"flex-end"}} onClick={()=>setShowAdd(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"22px 22px 0 0",padding:"22px 20px calc(env(safe-area-inset-bottom) + 20px)",width:"100%",maxHeight:"70vh",overflowY:"auto"}}>
            <div style={{fontSize:14,fontWeight:800,color:"#0F172A",marginBottom:14}}>Choose an account</div>
            {availableToAdd.map(a=>(
              <div key={a.code} onClick={()=>{setShowAdd(false);startEdit(a.code,0);}} style={{padding:"12px 4px",borderBottom:`1px solid ${T.border}`,fontSize:13,color:"#0F172A"}}>{a.code} · {a.name}</div>
            ))}
            {!availableToAdd.length&&<div style={{textAlign:"center",padding:"20px 0",color:"#98A2B3",fontSize:12}}>Every expense account already has a budget line.</div>}
          </div>
        </div>
      )}

      {/* Copy-from-previous-month review sheet */}
      {copyDraft&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:50,display:"flex",alignItems:"flex-end"}} onClick={()=>setCopyDraft(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"22px 22px 0 0",padding:"22px 20px calc(env(safe-area-inset-bottom) + 20px)",width:"100%",maxHeight:"78vh",display:"flex",flexDirection:"column"}}>
            <div style={{fontSize:14,fontWeight:800,color:"#0F172A",marginBottom:2}}>Copy from {prevLabel}</div>
            <div style={{fontSize:11.5,color:"#8A93A3",marginBottom:14}}>Review each line, edit amounts, then confirm.</div>
            <div style={{overflowY:"auto",flex:1,marginBottom:14}}>
              {copyDraft.map((d,i)=>(
                <div key={d.code} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:`1px solid ${T.border}`}}>
                  <div onClick={()=>setCopyDraft(cd=>cd.map((x,j)=>j===i?{...x,include:!x.include}:x))} style={{width:20,height:20,borderRadius:6,border:`1.5px solid ${d.include?T.accent:T.border}`,background:d.include?T.accent:"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {d.include&&<i className="ti ti-check" style={{fontSize:12,color:"#fff"}}/>}
                  </div>
                  <div style={{flex:1,fontSize:12.5,fontWeight:600,color:d.include?"#0F172A":"#B0BAC3",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div>
                  <input type="number" value={d.amount} disabled={!d.include}
                    onChange={e=>{const v=parseFloat(e.target.value)||0;setCopyDraft(cd=>cd.map((x,j)=>j===i?{...x,amount:v}:x));}}
                    style={{width:88,background:"#F6F8FA",border:`1px solid ${T.border}`,borderRadius:9,padding:"7px 8px",fontSize:16,fontFamily:"inherit",textAlign:"right",boxSizing:"border-box",opacity:d.include?1:0.5}}/>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:10}}>
              <div onClick={()=>setCopyDraft(null)} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,border:`1px solid ${T.border}`,color:"#5C6B73",fontWeight:700,fontSize:13}}>Cancel</div>
              <div onClick={confirmCopy} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,background:T.accent,color:"#fff",fontWeight:700,fontSize:13}}>Confirm copy</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
