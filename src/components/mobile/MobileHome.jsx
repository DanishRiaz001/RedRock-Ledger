import { useMemo } from "react";
import { T, getSK } from "../../lib/theme.js";
import { sign, fmtBal } from "../ledger.jsx";
import { BANK_COLORS } from "./mobileConstants.js";

const QUICK_ACCESS=[
  {label:"Budget",icon:"ti-report-money",overlay:"Budget",bg:"rgba(180,116,14,0.12)",fg:"#B4740E"},
  {label:"Sinking fund",icon:"ti-piggy-bank",overlay:"SinkingFund",bg:"rgba(36,97,217,0.12)",fg:"#2461D9"},
  {label:"Analytics",icon:"ti-chart-histogram",overlay:"Analytics",bg:"rgba(13,148,136,0.12)",fg:"#0D9488"},
  {label:"Whose",icon:"ti-users",overlay:"Whose",bg:"rgba(124,58,237,0.12)",fg:"#7C3AED"},
];
const QUICK_ACCESS_2=[
  {label:"Trial balance",icon:"ti-scale",overlay:"TrialBalance",bg:"rgba(13,148,136,0.12)",fg:"#0D9488"},
  {label:"Bilags",icon:"ti-receipt-2",tab:"Vouchers",bg:"rgba(255,107,74,0.12)",fg:"#FF6B4A"},
  {label:"Suppliers",icon:"ti-truck-delivery",overlay:"Reskontro",overlayExtra:{defaultType:"supplier"},bg:"rgba(36,97,217,0.12)",fg:"#2461D9"},
  {label:"Customers",icon:"ti-users-group",overlay:"Reskontro",overlayExtra:{defaultType:"customer"},bg:"rgba(124,58,237,0.12)",fg:"#7C3AED"},
];

export default function MobileHome({accounts,transactions,profile,companyProfile,moneySources=[],feat={},onNavigate,onOpenOverlay}){
  const today=new Date().toISOString().slice(0,10);

  const balAt=(code,asOf)=>transactions.filter(t=>t.date<=asOf).reduce((s,t)=>{if(t.debitCode===code)return s+t.amount;if(t.creditCode===code)return s-t.amount;return s;},0);
  const seriesBalAt=(sk,asOf)=>accounts.filter(a=>getSK(a.code)===sk).reduce((s,a)=>s+balAt(a.code,asOf),0);

  const arNow=seriesBalAt("1500",today);
  const apNow=seriesBalAt("2400",today);
  const netProfit=useMemo(()=>{
    // Excludes reversed/reversal entries — same rule Analytics, Budget, and
    // Monthly already use, so a corrected mistake doesn't get counted twice
    // (once as the original, once as its opposite-signed reversal landing
    // outside the same income/expense bucket it started in).
    const income=transactions.filter(t=>!t.reversedBy&&!t.reversalOf&&(getSK(t.creditCode)==="3000"||getSK(t.creditCode)==="3900")).reduce((s,t)=>s+t.amount,0);
    const expense=transactions.filter(t=>{const sk=getSK(t.debitCode);return!t.reversedBy&&!t.reversalOf&&sk&&sk>="4000"&&sk<"8000";}).reduce((s,t)=>s+t.amount,0);
    return income-expense;
  },[transactions]);

  const bankBal=(code)=>balAt(code,today);
  // Hide accounts sitting at zero with no activity — an empty bank card
  // tells the user nothing useful and just wastes carousel space.
  const banks=useMemo(()=>accounts.filter(a=>getSK(a.code)==="1900"&&(bankBal(a.code)!==0||transactions.some(t=>t.debitCode===a.code||t.creditCode===a.code))),[accounts,transactions]);

  const bankCodesForWhose=useMemo(()=>new Set(accounts.filter(a=>getSK(a.code)==="1900"&&a.code!=="1900").map(a=>a.code)),[accounts]);
  const effectiveMoneySources=feat.whose?moneySources:[];
  const whoseTotals=useMemo(()=>{
    if(!effectiveMoneySources.length)return{remaining:0,deficits:0};
    let remaining=0,deficits=0;
    effectiveMoneySources.filter(m=>!m.inactive).forEach(m=>{
      const tagged=transactions.filter(t=>t.moneySourceId===m.id&&(bankCodesForWhose.has(t.debitCode)||bankCodesForWhose.has(t.creditCode)));
      const received=(m.openingReceived||0)+tagged.filter(t=>bankCodesForWhose.has(t.debitCode)).reduce((s,t)=>s+t.amount,0);
      const used=(m.openingUsed||0)+tagged.filter(t=>bankCodesForWhose.has(t.creditCode)).reduce((s,t)=>s+t.amount,0);
      const r=received-used;
      remaining+=r;
      if(r<0)deficits++;
    });
    return{remaining,deficits};
  },[effectiveMoneySources,transactions,bankCodesForWhose]);

  const monthFrom=today.slice(0,7)+"-01";
  const monthIncome=useMemo(()=>transactions.filter(t=>!t.reversedBy&&!t.reversalOf&&t.date>=monthFrom&&t.date<=today&&(getSK(t.creditCode)==="3000"||getSK(t.creditCode)==="3900")).reduce((s,t)=>s+t.amount,0),[transactions,monthFrom,today]);
  const monthExpense=useMemo(()=>transactions.filter(t=>{const sk=getSK(t.debitCode);return!t.reversedBy&&!t.reversalOf&&t.date>=monthFrom&&t.date<=today&&sk&&sk>="4000"&&sk<"8000";}).reduce((s,t)=>s+t.amount,0),[transactions,monthFrom,today]);
  const monthMax=Math.max(1,monthIncome,monthExpense);
  const monthLabel=new Date().toLocaleString("default",{month:"long"});

  const firstName=(profile&&(profile.display_name||profile.email)||"there").split(/[ @]/)[0];
  const companyName=(companyProfile&&companyProfile.companyName)||firstName;
  const monthProfit=monthIncome-monthExpense;

  return(
    <div style={{paddingBottom:24}}>
      {/* Hero */}
      <div style={{
        position:"relative",padding:"env(safe-area-inset-top) 20px 46px",marginBottom:38,borderRadius:"0 0 32px 32px",
        background:"radial-gradient(60% 90% at 20% 0%, rgba(45,212,191,0.9), transparent 60%),radial-gradient(50% 80% at 80% -10%, rgba(13,148,136,0.9), transparent 65%),linear-gradient(160deg,#0E9BB0 0%,#0D9488 55%,#0B7D74 100%)",
      }}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:14}}>
          <div>
            <div style={{fontSize:20,fontWeight:800,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:260}}>{companyName}</div>
            <div style={{fontSize:11.5,color:"rgba(255,255,255,0.75)",marginTop:2}}>Good {new Date().getHours()<12?"morning":new Date().getHours()<18?"afternoon":"evening"} · {new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"})}</div>
          </div>
          <div onClick={()=>onOpenOverlay({type:"Settings"})} style={{width:36,height:36,borderRadius:"50%",background:"rgba(255,255,255,0.22)",border:"1.5px solid rgba(255,255,255,0.5)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:13,flexShrink:0}}>{companyName[0].toUpperCase()}</div>
        </div>
        <div style={{marginTop:22}}>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.8)",fontWeight:600}}>Profit / loss · {monthLabel}</div>
          <div style={{fontSize:36,fontWeight:800,color:"#fff",marginTop:4,letterSpacing:-0.5}}>{sign(monthProfit)}</div>
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

      {/* Bank card carousel — momentum swipe, no dots/arrows; the next
          card's edge peeking in on the right is the only affordance,
          matching how horizontal scroll reads everywhere else on iOS.
          Sits right under the hero now, above quick access, since these
          balances are the thing worth seeing first. */}
      {banks.length>0&&(
        <div style={{marginBottom:22}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 20px",marginBottom:10}}>
            <div style={{fontSize:14.5,fontWeight:800,color:"#0F172A"}}>Your accounts</div>
            <div onClick={()=>onNavigate("Bank")} style={{fontSize:11.5,color:T.accent,fontWeight:700}}>See all</div>
          </div>
          <div style={{display:"flex",gap:8,overflowX:"auto",padding:"0 20px",scrollSnapType:"x mandatory",WebkitOverflowScrolling:"touch"}}>
            {banks.map((b,i)=>{
              const bal=bankBal(b.code);
              const c=BANK_COLORS[i%BANK_COLORS.length];
              return(
                <div key={b.code} onClick={()=>onOpenOverlay({type:"Ledger",account:b})} style={{scrollSnapAlign:"start",flexShrink:0,width:126,background:"#fff",borderRadius:15,padding:11,boxShadow:"0 2px 12px rgba(20,40,50,0.06)",border:`1px solid ${T.border}`}}>
                  <div style={{width:23,height:23,borderRadius:8,background:c.bg,color:c.fg,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:9}}><i className="ti ti-building-bank" style={{fontSize:11}}/></div>
                  <div style={{fontSize:7.5,color:"#98A2B3",fontWeight:700,letterSpacing:0.3,textTransform:"uppercase"}}>{b.code}</div>
                  <div style={{fontSize:10,fontWeight:700,color:"#0F172A",marginTop:2,marginBottom:9,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.name}</div>
                  <div style={{fontSize:7.5,color:"#98A2B3",fontWeight:600}}>Balance</div>
                  <div style={{fontSize:12,fontWeight:800,color:"#0F172A",marginTop:2}}>{fmtBal(bal)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick access grid — two rows, sitting below the bank cards now */}
      <div style={{padding:"0 20px",marginBottom:22}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:8}}>
          {QUICK_ACCESS.map(q=>(
            <div key={q.label} onClick={()=>q.overlay?onOpenOverlay({type:q.overlay,...(q.overlayExtra||{})}):onNavigate(q.tab)} style={{background:"#fff",borderRadius:16,padding:"12px 4px",textAlign:"center",boxShadow:"0 2px 10px rgba(20,40,50,0.05)"}}>
              <div style={{width:30,height:30,borderRadius:10,background:q.bg,color:q.fg,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 7px"}}><i className={`ti ${q.icon}`} style={{fontSize:14}}/></div>
              <div style={{fontSize:8.5,fontWeight:700,color:"#3A4750",lineHeight:1.2}}>{q.label}</div>
            </div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
          {QUICK_ACCESS_2.map(q=>(
            <div key={q.label} onClick={()=>q.overlay?onOpenOverlay({type:q.overlay,...(q.overlayExtra||{})}):onNavigate(q.tab)} style={{background:"#fff",borderRadius:16,padding:"12px 4px",textAlign:"center",boxShadow:"0 2px 10px rgba(20,40,50,0.05)"}}>
              <div style={{width:30,height:30,borderRadius:10,background:q.bg,color:q.fg,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 7px"}}><i className={`ti ${q.icon}`} style={{fontSize:14}}/></div>
              <div style={{fontSize:8.5,fontWeight:700,color:"#3A4750",lineHeight:1.2}}>{q.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* This month — compact single-line net instead of two big bars, to
          leave room for the Whose summary below (the more actionable of
          the two once money sources are in use). */}
      <div style={{padding:"0 20px",marginBottom:22}}>
        <div onClick={()=>onOpenOverlay({type:"Analytics"})} style={{display:"flex",alignItems:"center",background:"#fff",borderRadius:16,padding:"14px 16px",boxShadow:"0 1px 6px rgba(20,40,50,0.05)"}}>
          <div style={{flex:1}}>
            <div style={{fontSize:12,fontWeight:700,color:"#0F172A"}}>{monthLabel}</div>
            <div style={{fontSize:10.5,color:"#8A93A3",marginTop:1}}>{fmtBal(monthIncome)} in · {fmtBal(monthExpense)} out</div>
          </div>
          <div style={{fontSize:15,fontWeight:800,color:monthIncome-monthExpense>=0?"#0E9F6E":"#E14848"}}>{sign(monthIncome-monthExpense)}</div>
          <i className="ti ti-chevron-right" style={{fontSize:15,color:"#B0BAC3",marginLeft:10}}/>
        </div>
      </div>

      {/* Whose summary — surfaces the money-sources feature (and any
          deficit that needs settling from the next salary) right on Home,
          instead of it being buried a tap away. */}
      {feat.whose&&effectiveMoneySources.filter(m=>!m.inactive).length>0&&(
        <div style={{padding:"0 20px",marginBottom:22}}>
          <div onClick={()=>onOpenOverlay({type:"Whose"})} style={{background:whoseTotals.deficits>0?"linear-gradient(135deg,#5A1F1F,#8A2E2E)":"linear-gradient(135deg,#2E1F5A,#4B2E8A)",borderRadius:16,padding:16,color:"#fff"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.75)",fontWeight:600}}>Whose · total remaining</div>
                <div style={{fontSize:19,fontWeight:800,marginTop:3}}>{fmtBal(whoseTotals.remaining)}</div>
              </div>
              <i className="ti ti-chevron-right" style={{fontSize:16,color:"rgba(255,255,255,0.75)"}}/>
            </div>
            {whoseTotals.deficits>0&&<div style={{fontSize:11,color:"rgba(255,255,255,0.9)",marginTop:8}}>⚠ {whoseTotals.deficits} source{whoseTotals.deficits===1?"":"s"} overspent — settle from your next salary</div>}
          </div>
        </div>
      )}

      {/* New entry FAB — jumps straight to the new-voucher form, not just
          the Vouchers list, via the shared overlay signal MobileVouchers
          consumes on mount. */}
      <div onClick={()=>{onNavigate("Vouchers");onOpenOverlay({type:"NewVoucher"});}} style={{position:"fixed",right:20,bottom:96,width:56,height:56,borderRadius:"50%",background:"linear-gradient(135deg,#FF6B4A,#FF8266)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 8px 20px rgba(255,107,74,0.4)",zIndex:5}}>
        <i className="ti ti-plus" style={{fontSize:26,color:"#fff"}}/>
      </div>
    </div>
  );
}
