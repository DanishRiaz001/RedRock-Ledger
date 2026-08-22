import { useState, useMemo } from "react";
import { T, SERIES, getSK } from "../../lib/theme.js";
import { fmtBal, sign } from "../ledger.jsx";
import MobileScreen from "./MobileScreen.jsx";

export default function MobileTrialBalance({accounts,transactions,onOpenLedger,onClose}){
  const now=new Date();
  const[range,setRange]=useState("month"); // "month" | "year"
  const[year,setYear]=useState(now.getFullYear());
  const[month,setMonth]=useState(now.getMonth());
  const[search,setSearch]=useState("");

  const step=dir=>{
    if(range==="year"){setYear(y=>y+dir);return;}
    let m=month+dir,y=year;if(m<0){m=11;y--;}else if(m>11){m=0;y++;}setMonth(m);setYear(y);
  };
  const periodLabel=range==="year"?String(year):new Date(year,month,1).toLocaleString("default",{month:"long",year:"numeric"});
  const from=range==="year"?`${year}-01-01`:`${year}-${String(month+1).padStart(2,"0")}-01`;
  const to=range==="year"?`${year}-12-31`:new Date(year,month+1,0).toISOString().slice(0,10);

  const balAt=(code,asOf)=>transactions.filter(t=>t.date<=asOf).reduce((s,t)=>{if(t.debitCode===code)return s+t.amount;if(t.creditCode===code)return s-t.amount;return s;},0);
  const dayBefore=iso=>{const d=new Date(iso);d.setDate(d.getDate()-1);return d.toISOString().slice(0,10);};

  const rows=useMemo(()=>{
    return accounts.map(a=>{
      const opening=balAt(a.code,dayBefore(from));
      const closing=balAt(a.code,to);
      return{code:a.code,name:a.name,opening,closing,movement:closing-opening};
    }).filter(r=>r.opening!==0||r.closing!==0||r.movement!==0);
  },[accounts,transactions,from,to]);

  const filtered=useMemo(()=>{
    if(!search.trim())return rows;
    const q=search.toLowerCase();
    return rows.filter(r=>r.code.includes(q)||r.name.toLowerCase().includes(q));
  },[rows,search]);

  const grouped=useMemo(()=>{
    const groups={};
    filtered.forEach(r=>{
      const sk=getSK(r.code);
      const key=sk&&SERIES[sk]?sk:"other";
      (groups[key]=groups[key]||[]).push(r);
    });
    return Object.entries(groups).sort((a,b)=>a[0].localeCompare(b[0]));
  },[filtered]);

  const totalClosing=filtered.reduce((s,r)=>s+r.closing,0);

  return(
    <MobileScreen title="Trial balance" subtitle="Opening → closing by account" onClose={onClose}>
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        {["month","year"].map(r=>(
          <div key={r} onClick={()=>setRange(r)} style={{flex:1,textAlign:"center",padding:"8px",borderRadius:20,fontSize:11.5,fontWeight:700,background:range===r?T.accent:"#fff",color:range===r?"#fff":"#5C6B73",boxShadow:range===r?"none":"0 1px 6px rgba(20,40,50,0.05)"}}>{r==="month"?"By month":"By year"}</div>
        ))}
      </div>

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fff",borderRadius:14,padding:"10px 16px",marginBottom:16,boxShadow:"0 1px 6px rgba(20,40,50,0.05)"}}>
        <div onClick={()=>step(-1)} style={{fontSize:18,color:"#8A93A3",padding:"0 10px"}}>‹</div>
        <div style={{fontSize:13.5,fontWeight:800,color:"#0F172A"}}>{periodLabel}</div>
        <div onClick={()=>step(1)} style={{fontSize:18,color:"#8A93A3",padding:"0 10px"}}>›</div>
      </div>

      <div style={{position:"relative",marginBottom:16}}>
        <i className="ti ti-search" style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"#98A2B3",fontSize:13}}/>
        <input placeholder="Search accounts…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:"100%",background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:"10px 12px 10px 34px",fontSize:16,fontFamily:"inherit",boxSizing:"border-box"}}/>
      </div>

      {grouped.map(([key,list])=>{
        const s=SERIES[key];
        return(
          <div key={key} style={{marginBottom:18}}>
            <div style={{fontSize:11,fontWeight:800,color:"#8A93A3",textTransform:"uppercase",letterSpacing:0.4,marginBottom:8}}>{s?`${s.icon} ${s.name}`:"Other"}</div>
            {list.map(r=>(
              <div key={r.code} onClick={()=>onOpenLedger&&onOpenLedger({code:r.code,name:r.name})} style={{display:"flex",alignItems:"center",gap:10,background:"#fff",borderRadius:12,padding:"12px 14px",marginBottom:7,boxShadow:"0 1px 6px rgba(20,40,50,0.04)"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12.5,fontWeight:700,color:"#0F172A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                  <div style={{fontSize:10,color:"#98A2B3",marginTop:1}}>{r.code} · {sign(r.movement)} this period</div>
                </div>
                <div style={{fontSize:13,fontWeight:800,color:r.closing>=0?"#0F172A":"#E14848",flexShrink:0}}>{fmtBal(r.closing)}</div>
              </div>
            ))}
          </div>
        );
      })}
      {!filtered.length&&<div style={{textAlign:"center",padding:"30px 0",color:"#98A2B3",fontSize:12}}>No activity in {periodLabel}.</div>}

      {filtered.length>0&&(
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#0F2A26",borderRadius:14,padding:"13px 16px",marginTop:6}}>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.8)",fontWeight:600}}>Net of all accounts shown</div>
          <div style={{fontSize:14,fontWeight:800,color:"#fff"}}>{fmtBal(totalClosing)}</div>
        </div>
      )}
    </MobileScreen>
  );
}
