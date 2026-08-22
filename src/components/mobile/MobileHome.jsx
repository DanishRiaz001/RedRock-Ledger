import { useMemo } from "react";
import { T, getSK } from "../../lib/theme.js";
import { sign, fmtBal } from "../ledger.jsx";
import { fmtB } from "../../lib/utils.js";

const QUICK_ACCESS=[
  {label:"Budget",icon:"ti-report-money",tab:"Reports",bg:"rgba(180,116,14,0.12)",fg:"#B4740E"},
  {label:"Sinking fund",icon:"ti-piggy-bank",tab:"Reports",bg:"rgba(36,97,217,0.12)",fg:"#2461D9"},
  {label:"Analytics",icon:"ti-chart-histogram",tab:"Reports",bg:"rgba(13,148,136,0.12)",fg:"#0D9488"},
  {label:"Bank overview",icon:"ti-building-bank",tab:"Bank",bg:"rgba(232,90,59,0.12)",fg:"#E85A3B"},
];

export default function MobileHome({accounts,transactions,profile,onNavigate,onOpenOverlay}){
  const today=new Date().toISOString().slice(0,10);
  const oneMonthAgo=(()=>{const d=new Date();d.setMonth(d.getMonth()-1);return d.toISOString().slice(0,10);})();

  const balAt=(code,asOf)=>transactions.filter(t=>t.date<=asOf).reduce((s,t)=>{if(t.debitCode===code)return s+t.amount;if(t.creditCode===code)return s-t.amount;return s;},0);
  const seriesBalAt=(sk,asOf)=>accounts.filter(a=>getSK(a.code)===sk).reduce((s,a)=>s+balAt(a.code,asOf),0);

  const cashNow=seriesBalAt("1900",today), cashPrev=seriesBalAt("1900",oneMonthAgo);
  const arNow=seriesBalAt("1500",today);
  const apNow=seriesBalAt("2400",today);
  const netProfit=useMemo(()=>{
    const income=transactions.filter(t=>getSK(t.creditCode)==="3000"||getSK(t.creditCode)==="3900").reduce((s,t)=>s+t.amount,0);
    const expense=transactions.filter(t=>{const sk=getSK(t.debitCode);return sk&&sk>="4000"&&sk<"8000";}).reduce((s,t)=>s+t.amount,0);
    return income-expense;
  },[transactions]);
  const cashChangePct=cashPrev?Math.round(((cashNow-cashPrev)/Math.abs(cashPrev))*1000)/10:0;

  const banks=useMemo(()=>accounts.filter(a=>getSK(a.code)==="1900"),[accounts]);
  const bankBal=(code)=>balAt(code,today);

  const activity=useMemo(()=>[...transactions].sort((a,b)=>b.bilag-a.bilag).slice(0,6),[transactions]);
  const firstName=(profile&&(profile.display_name||profile.email)||"there").split(/[ @]/)[0];

  return(
    <div style={{paddingBottom:24}}>
      {/* Hero */}
      <div style={{
        position:"relative",padding:"env(safe-area-inset-top) 20px 46px",marginBottom:38,borderRadius:"0 0 32px 32px",
        background:"radial-gradient(60% 90% at 20% 0%, rgba(45,212,191,0.9), transparent 60%),radial-gradient(50% 80% at 80% -10%, rgba(13,148,136,0.9), transparent 65%),linear-gradient(160deg,#0E9BB0 0%,#0D9488 55%,#0B7D74 100%)",
      }}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:14}}>
          <div>
            <div style={{fontSize:20,fontWeight:800,color:"#fff"}}>Good {new Date().getHours()<12?"morning":new Date().getHours()<18?"afternoon":"evening"}, {firstName}</div>
            <div style={{fontSize:11.5,color:"rgba(255,255,255,0.75)",marginTop:2}}>Redrock Danria · {new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"})}</div>
          </div>
          <div style={{width:36,height:36,borderRadius:"50%",background:"rgba(255,255,255,0.22)",border:"1.5px solid rgba(255,255,255,0.5)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:13}}>{firstName[0].toUpperCase()}</div>
        </div>
        <div style={{marginTop:22}}>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.8)",fontWeight:600}}>Total cash & bank</div>
          <div style={{fontSize:36,fontWeight:800,color:"#fff",marginTop:4,letterSpacing:-0.5}}>{fmtBal(cashNow)}</div>
        </div>
        {/* Floating glass stat strip */}
        <div style={{position:"absolute",left:20,right:20,bottom:-34,zIndex:2,background:"rgba(255,255,255,0.85)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderRadius:20,padding:16,display:"flex",boxShadow:"0 20px 40px rgba(13,148,136,0.18)"}}>
          <div style={{flex:1,textAlign:"center"}}><div style={{fontSize:10.5,color:"#5C7A76",fontWeight:600}}>Receivable</div><div style={{fontSize:14.5,fontWeight:800,color:"#0F2A26",marginTop:3}}>{fmtBal(arNow)}</div></div>
          <div style={{width:1,background:"rgba(13,148,136,0.15)"}}/>
          <div style={{flex:1,textAlign:"center"}}><div style={{fontSize:10.5,color:"#5C7A76",fontWeight:600}}>Payable</div><div style={{fontSize:14.5,fontWeight:800,color:"#0F2A26",marginTop:3}}>{fmtBal(apNow)}</div></div>
          <div style={{width:1,background:"rgba(13,148,136,0.15)"}}/>
          <div style={{flex:1,textAlign:"center"}}><div style={{fontSize:10.5,color:"#5C7A76",fontWeight:600}}>Net profit</div><div style={{fontSize:14.5,fontWeight:800,color:netProfit>=0?"#0D9488":"#E14848",marginTop:3}}>{sign(netProfit)}</div></div>
        </div>
      </div>

      {/* Quick access grid */}
      <div style={{padding:"0 20px",marginBottom:22}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10}}>
          {QUICK_ACCESS.map(q=>(
            <div key={q.label} onClick={()=>onNavigate(q.tab)} style={{background:"#fff",borderRadius:16,padding:"14px 8px",textAlign:"center",boxShadow:"0 2px 10px rgba(20,40,50,0.05)"}}>
              <div style={{width:34,height:34,borderRadius:11,background:q.bg,color:q.fg,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 8px"}}><i className={`ti ${q.icon}`} style={{fontSize:16}}/></div>
              <div style={{fontSize:9.5,fontWeight:700,color:"#3A4750",lineHeight:1.25}}>{q.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Bank card carousel — momentum swipe, no dots/arrows; the next
          card's edge peeking in on the right is the only affordance,
          matching how horizontal scroll reads everywhere else on iOS. */}
      {banks.length>0&&(
        <div style={{marginBottom:22}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 20px",marginBottom:10}}>
            <div style={{fontSize:14.5,fontWeight:800,color:"#0F172A"}}>Your accounts</div>
            <div onClick={()=>onNavigate("Bank")} style={{fontSize:11.5,color:T.accent,fontWeight:700}}>See all</div>
          </div>
          <div style={{display:"flex",gap:12,overflowX:"auto",padding:"0 20px",scrollSnapType:"x mandatory",WebkitOverflowScrolling:"touch"}}>
            {banks.map(b=>{
              const bal=bankBal(b.code);
              return(
                <div key={b.code} onClick={()=>onNavigate("Bank")} style={{scrollSnapAlign:"start",flexShrink:0,width:220,background:"linear-gradient(135deg,#0F2A26,#0D9488)",borderRadius:20,padding:18,color:"#fff"}}>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.7)",fontWeight:700,letterSpacing:0.3,textTransform:"uppercase"}}>{b.code}</div>
                  <div style={{fontSize:13,fontWeight:700,marginTop:2,marginBottom:20,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.name}</div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.7)",fontWeight:600}}>Balance</div>
                  <div style={{fontSize:19,fontWeight:800,marginTop:2}}>{fmtBal(bal)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div style={{padding:"0 20px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:14.5,fontWeight:800,color:"#0F172A"}}>Recent activity</div>
          <div onClick={()=>onNavigate("Vouchers")} style={{fontSize:11.5,color:T.accent,fontWeight:700}}>See all</div>
        </div>
        {activity.map(t=>{
          const isExpense=getSK(t.debitCode)&&getSK(t.debitCode)>="4000"&&getSK(t.debitCode)<"8000";
          const amt=isExpense?-Math.abs(t.amount):Math.abs(t.amount);
          return(
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:12,background:"#fff",borderRadius:14,padding:"12px 14px",marginBottom:8,boxShadow:"0 1px 6px rgba(20,40,50,0.04)"}}>
              <div style={{width:34,height:34,borderRadius:10,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,background:amt>=0?"rgba(14,159,110,0.12)":"rgba(225,72,72,0.1)",color:amt>=0?"#0E9F6E":"#E14848"}}>{fmtB(t.bilag).slice(0,2)}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:"#0F172A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</div>
                <div style={{fontSize:11,color:"#98A2B3",marginTop:1}}>{t.date}</div>
              </div>
              <div style={{fontSize:13,fontWeight:800,color:amt>=0?"#0E9F6E":"#E14848",flexShrink:0}}>{sign(amt)}</div>
            </div>
          );
        })}
        {!activity.length&&<div style={{textAlign:"center",padding:"30px 0",color:"#98A2B3",fontSize:12}}>No entries yet.</div>}
      </div>

      {/* New entry FAB */}
      <div onClick={()=>onNavigate("Vouchers")} style={{position:"fixed",right:20,bottom:96,width:56,height:56,borderRadius:"50%",background:"linear-gradient(135deg,#FF6B4A,#FF8266)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 8px 20px rgba(255,107,74,0.4)",zIndex:5}}>
        <i className="ti ti-plus" style={{fontSize:26,color:"#fff"}}/>
      </div>
    </div>
  );
}
