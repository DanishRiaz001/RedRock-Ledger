import { useMemo } from "react";
import { T, getSK } from "../../lib/theme.js";
import { sign, fmtBal } from "../ledger.jsx";
import { BANK_COLORS } from "./mobileConstants.js";

const QUICK_ACCESS=[
  {label:"Budget",icon:"ti-report-money",overlay:"Budget",bg:"rgba(180,116,14,0.12)",fg:"#B4740E"},
  {label:"Sinking fund",icon:"ti-piggy-bank",overlay:"SinkingFund",bg:"rgba(36,97,217,0.12)",fg:"#2461D9"},
  {label:"Analytics",icon:"ti-chart-histogram",overlay:"Analytics",bg:"rgba(13,148,136,0.12)",fg:"#0D9488"},
  {label:"Trial balance",icon:"ti-scale",overlay:"TrialBalance",bg:"rgba(124,58,237,0.12)",fg:"#7C3AED"},
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
  const ringTotal=Math.abs(cashNow)+Math.abs(arNow)+Math.abs(apNow)||1;
  const cashPct=Math.abs(cashNow)/ringTotal*100;
  const arPct=Math.abs(arNow)/ringTotal*100;

  const banks=useMemo(()=>accounts.filter(a=>getSK(a.code)==="1900"),[accounts]);
  const bankBal=(code)=>balAt(code,today);

  const monthFrom=today.slice(0,7)+"-01";
  const monthIncome=useMemo(()=>transactions.filter(t=>t.date>=monthFrom&&t.date<=today&&(getSK(t.creditCode)==="3000"||getSK(t.creditCode)==="3900")).reduce((s,t)=>s+t.amount,0),[transactions,monthFrom,today]);
  const monthExpense=useMemo(()=>transactions.filter(t=>{const sk=getSK(t.debitCode);return t.date>=monthFrom&&t.date<=today&&sk&&sk>="4000"&&sk<"8000";}).reduce((s,t)=>s+t.amount,0),[transactions,monthFrom,today]);
  const monthMax=Math.max(1,monthIncome,monthExpense);
  const monthLabel=new Date().toLocaleString("default",{month:"long"});

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
          <div onClick={()=>onOpenOverlay({type:"Settings"})} style={{width:36,height:36,borderRadius:"50%",background:"rgba(255,255,255,0.22)",border:"1.5px solid rgba(255,255,255,0.5)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:13}}>{firstName[0].toUpperCase()}</div>
        </div>
        <div style={{marginTop:22}}>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.8)",fontWeight:600}}>Total cash & bank</div>
          <div style={{fontSize:36,fontWeight:800,color:"#fff",marginTop:4,letterSpacing:-0.5}}>{fmtBal(cashNow)}</div>
        </div>
        {/* Floating glass breakdown card — a donut of Cash/Receivable/Payable
            proportions next to a legend, replacing the old flat 3-column
            stat row so the balance mix reads at a glance, not just as
            three unrelated numbers. */}
        <div style={{position:"absolute",left:20,right:20,bottom:-40,zIndex:2,background:"rgba(255,255,255,0.85)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderRadius:20,padding:16,display:"flex",alignItems:"center",gap:16,boxShadow:"0 20px 40px rgba(13,148,136,0.18)"}}>
          <div style={{width:64,height:64,borderRadius:"50%",flexShrink:0,background:`conic-gradient(#0D9488 0% ${cashPct}%, #2461D9 ${cashPct}% ${cashPct+arPct}%, #FF6B4A ${cashPct+arPct}% 100%)`,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{width:42,height:42,borderRadius:"50%",background:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <i className="ti ti-wallet" style={{fontSize:16,color:"#0D9488"}}/>
            </div>
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:7}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:7,height:7,borderRadius:"50%",background:"#0D9488"}}/><span style={{fontSize:10.5,color:"#5C7A76",fontWeight:600}}>Cash</span></div>
              <span style={{fontSize:12,fontWeight:800,color:"#0F2A26"}}>{fmtBal(cashNow)}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:7,height:7,borderRadius:"50%",background:"#2461D9"}}/><span style={{fontSize:10.5,color:"#5C7A76",fontWeight:600}}>Receivable</span></div>
              <span style={{fontSize:12,fontWeight:800,color:"#0F2A26"}}>{fmtBal(arNow)}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:7,height:7,borderRadius:"50%",background:"#FF6B4A"}}/><span style={{fontSize:10.5,color:"#5C7A76",fontWeight:600}}>Payable</span></div>
              <span style={{fontSize:12,fontWeight:800,color:"#0F2A26"}}>{fmtBal(apNow)}</span>
            </div>
          </div>
        </div>
      </div>
      {/* Net profit callout — was folded into the stat strip above; now its
          own small row so the breakdown card stays legible. */}
      <div style={{padding:"0 20px",marginTop:44,marginBottom:22,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:11.5,color:"#5C6B73",fontWeight:600}}>Net profit this year</span>
        <span style={{fontSize:14,fontWeight:800,color:netProfit>=0?"#0D9488":"#E14848"}}>{sign(netProfit)}</span>
      </div>

      {/* Quick access grid */}
      <div style={{padding:"0 20px",marginBottom:22}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
          {QUICK_ACCESS.map(q=>(
            <div key={q.label} onClick={()=>q.overlay?onOpenOverlay({type:q.overlay}):onNavigate(q.tab)} style={{background:"#fff",borderRadius:16,padding:"12px 4px",textAlign:"center",boxShadow:"0 2px 10px rgba(20,40,50,0.05)"}}>
              <div style={{width:30,height:30,borderRadius:10,background:q.bg,color:q.fg,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 7px"}}><i className={`ti ${q.icon}`} style={{fontSize:14}}/></div>
              <div style={{fontSize:8.5,fontWeight:700,color:"#3A4750",lineHeight:1.2}}>{q.label}</div>
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
          <div style={{display:"flex",gap:10,overflowX:"auto",padding:"0 20px",scrollSnapType:"x mandatory",WebkitOverflowScrolling:"touch"}}>
            {banks.map((b,i)=>{
              const bal=bankBal(b.code);
              const c=BANK_COLORS[i%BANK_COLORS.length];
              return(
                <div key={b.code} onClick={()=>onOpenOverlay({type:"Ledger",account:b})} style={{scrollSnapAlign:"start",flexShrink:0,width:158,background:"#fff",borderRadius:17,padding:13,boxShadow:"0 2px 12px rgba(20,40,50,0.06)",border:`1px solid ${T.border}`}}>
                  <div style={{width:28,height:28,borderRadius:9,background:c.bg,color:c.fg,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:11}}><i className="ti ti-building-bank" style={{fontSize:13}}/></div>
                  <div style={{fontSize:8.5,color:"#98A2B3",fontWeight:700,letterSpacing:0.3,textTransform:"uppercase"}}>{b.code}</div>
                  <div style={{fontSize:11,fontWeight:700,color:"#0F172A",marginTop:2,marginBottom:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.name}</div>
                  <div style={{fontSize:8.5,color:"#98A2B3",fontWeight:600}}>Balance</div>
                  <div style={{fontSize:14,fontWeight:800,color:"#0F172A",marginTop:2}}>{fmtBal(bal)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* This month at a glance */}
      <div style={{padding:"0 20px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:14.5,fontWeight:800,color:"#0F172A"}}>{monthLabel} at a glance</div>
          <div onClick={()=>onOpenOverlay({type:"Analytics"})} style={{fontSize:11.5,color:T.accent,fontWeight:700}}>Details</div>
        </div>
        <div style={{background:"#fff",borderRadius:16,padding:16,boxShadow:"0 1px 6px rgba(20,40,50,0.05)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
            <div style={{fontSize:12,fontWeight:600,color:"#5C6B73"}}>Income</div>
            <div style={{fontSize:13,fontWeight:800,color:"#0E9F6E"}}>{fmtBal(monthIncome)}</div>
          </div>
          <div style={{height:7,background:"rgba(14,159,110,0.12)",borderRadius:4,marginBottom:14,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${Math.max(3,(monthIncome/monthMax)*100)}%`,background:"#0E9F6E",borderRadius:4}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
            <div style={{fontSize:12,fontWeight:600,color:"#5C6B73"}}>Expenses</div>
            <div style={{fontSize:13,fontWeight:800,color:"#E14848"}}>{fmtBal(monthExpense)}</div>
          </div>
          <div style={{height:7,background:"rgba(225,72,72,0.1)",borderRadius:4,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${Math.max(3,(monthExpense/monthMax)*100)}%`,background:"#E14848",borderRadius:4}}/>
          </div>
        </div>
      </div>

      {/* New entry FAB */}
      <div onClick={()=>onNavigate("Vouchers")} style={{position:"fixed",right:20,bottom:96,width:56,height:56,borderRadius:"50%",background:"linear-gradient(135deg,#FF6B4A,#FF8266)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 8px 20px rgba(255,107,74,0.4)",zIndex:5}}>
        <i className="ti ti-plus" style={{fontSize:26,color:"#fff"}}/>
      </div>
    </div>
  );
}
