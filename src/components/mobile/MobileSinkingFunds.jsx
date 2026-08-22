import { useState } from "react";
import { T } from "../../lib/theme.js";
import { fmtBal } from "../ledger.jsx";

const ICONS=["🎯","🏠","🚗","✈️","💍","🎓","🏥","🎁"];
const COLORS=["#0D9488","#2461D9","#B4740E","#E85A3B","#7C3AED"];

const getRisk=(f,totalMonthly)=>{
  if(!f.months||f.months<=0)return{label:"No timeline",color:"#8A93A3",bg:"#F1F5F4"};
  const needed=Math.ceil(((f.goal||0)-(f.saved||0))/f.months);
  const pct=f.goal?((f.saved||0)/f.goal)*100:0;
  if(pct>=100)return{label:"Complete",color:"#0E9F6E",bg:"rgba(14,159,110,0.1)"};
  if(needed<=totalMonthly*0.3)return{label:"On track",color:"#0E9F6E",bg:"rgba(14,159,110,0.1)"};
  if(needed<=totalMonthly*0.5)return{label:"At risk",color:"#B4740E",bg:"rgba(180,116,14,0.1)"};
  return{label:"Behind",color:"#E14848",bg:"rgba(225,72,72,0.1)"};
};

export default function MobileSinkingFunds({sinkingFunds,saveSinkingFunds}){
  const funds=sinkingFunds||[];
  const[showNew,setShowNew]=useState(false);
  const[form,setForm]=useState({name:"",goal:"",months:"",icon:"🎯",color:"#0D9488"});
  const[contribute,setContribute]=useState(null);
  const[amount,setAmount]=useState("");

  const activeFunds=funds.filter(f=>!f.inactive);
  const totalGoal=activeFunds.reduce((s,f)=>s+(f.goal||0),0);
  const totalSaved=activeFunds.reduce((s,f)=>s+(f.saved||0),0);
  const totalMonthly=activeFunds.reduce((s,f)=>{if(!f.months||f.months<=0)return s;return s+Math.ceil(((f.goal||0)-(f.saved||0))/f.months);},0);

  const addFund=()=>{
    if(!form.name.trim()||!form.goal)return;
    const maxNum=funds.reduce((max,f)=>{const m=/^SF(\d+)$/.exec(f.id);return m?Math.max(max,parseInt(m[1],10)):max;},0);
    const newFund={id:"SF"+String(maxNum+1).padStart(3,"0"),name:form.name.trim(),goal:parseFloat(form.goal)||0,saved:0,icon:form.icon,color:form.color,months:form.months?parseInt(form.months,10):null,inactive:false};
    saveSinkingFunds([...funds,newFund]);
    setForm({name:"",goal:"",months:"",icon:"🎯",color:"#0D9488"});
    setShowNew(false);
  };

  const commitContribute=()=>{
    const amt=parseFloat(amount)||0;
    if(!amt||!contribute)return;
    saveSinkingFunds(funds.map(f=>f.id===contribute.id?{...f,saved:(f.saved||0)+amt}:f));
    setAmount("");setContribute(null);
  };

  return(
    <div style={{paddingBottom:24}}>
      <div style={{background:"linear-gradient(135deg,#0F2A26,#0D9488)",borderRadius:18,padding:18,color:"#fff",marginBottom:20}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.75)",fontWeight:600}}>Total saved</div>
        <div style={{fontSize:24,fontWeight:800,marginTop:3}}>{fmtBal(totalSaved)}</div>
        <div style={{height:6,background:"rgba(255,255,255,0.2)",borderRadius:3,margin:"12px 0 8px",overflow:"hidden"}}>
          <div style={{height:"100%",width:`${totalGoal?Math.min(100,(totalSaved/totalGoal)*100):0}%`,background:"#fff",borderRadius:3}}/>
        </div>
        <div style={{fontSize:11.5,color:"rgba(255,255,255,0.85)"}}>of {fmtBal(totalGoal)} goal across {activeFunds.length} fund{activeFunds.length===1?"":"s"}</div>
        {totalMonthly>0&&<div style={{fontSize:11.5,color:"rgba(255,255,255,0.85)",marginTop:4}}>{fmtBal(totalMonthly)}/mo needed to stay on track</div>}
      </div>

      {activeFunds.map(f=>{
        const pct=f.goal?Math.min(100,Math.round(((f.saved||0)/f.goal)*100)):0;
        const risk=getRisk(f,totalMonthly);
        const monthly=f.months&&f.months>0?Math.ceil(((f.goal||0)-(f.saved||0))/f.months):null;
        return(
          <div key={f.id} style={{background:"#fff",borderRadius:16,padding:16,marginBottom:10,boxShadow:"0 1px 6px rgba(20,40,50,0.05)"}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
              <div style={{width:38,height:38,borderRadius:12,background:`${f.color}1F`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{f.icon}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{fontSize:13.5,fontWeight:700,color:"#0F172A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
                  <span style={{fontSize:8.5,fontWeight:800,color:risk.color,background:risk.bg,borderRadius:8,padding:"2px 6px",flexShrink:0}}>{risk.label}</span>
                </div>
                <div style={{fontSize:11,color:"#8A93A3",marginTop:1}}>{fmtBal(f.saved||0)} of {fmtBal(f.goal)}{monthly!=null?` · ${fmtBal(monthly)}/mo`:""}</div>
              </div>
              <div style={{fontSize:13,fontWeight:800,color:f.color,flexShrink:0}}>{pct}%</div>
            </div>
            <div style={{height:6,background:"#EEF2F1",borderRadius:3,overflow:"hidden",marginBottom:12}}>
              <div style={{height:"100%",width:`${Math.max(3,pct)}%`,background:f.color,borderRadius:3}}/>
            </div>
            <div onClick={()=>setContribute(f)} style={{textAlign:"center",padding:"8px",borderRadius:10,background:`${f.color}14`,color:f.color,fontSize:12,fontWeight:700}}>+ Add money</div>
          </div>
        );
      })}
      {!activeFunds.length&&<div style={{textAlign:"center",padding:"30px 0",color:"#98A2B3",fontSize:12}}>No sinking funds yet — start one for a goal you're saving toward.</div>}

      <div onClick={()=>setShowNew(true)} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginTop:12,padding:"12px",borderRadius:14,border:`1.5px dashed ${T.border}`,color:T.accent,fontSize:12.5,fontWeight:700}}>
        <i className="ti ti-plus" style={{fontSize:14}}/>New sinking fund
      </div>

      {/* Contribute sheet */}
      {contribute&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:50,display:"flex",alignItems:"flex-end"}} onClick={()=>setContribute(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"22px 22px 0 0",padding:"22px 20px calc(env(safe-area-inset-bottom) + 20px)",width:"100%"}}>
            <div style={{fontSize:14,fontWeight:800,color:"#0F172A",marginBottom:4}}>Add to {contribute.name}</div>
            <div style={{fontSize:11.5,color:"#8A93A3",marginBottom:14}}>Amount</div>
            <input autoFocus type="number" value={amount} onChange={e=>setAmount(e.target.value)} style={{width:"100%",background:"#F6F8FA",border:`1px solid ${T.border}`,borderRadius:12,padding:"12px 14px",fontSize:16,fontFamily:"inherit",boxSizing:"border-box",marginBottom:14}}/>
            <div style={{display:"flex",gap:10}}>
              <div onClick={()=>setContribute(null)} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,border:`1px solid ${T.border}`,color:"#5C6B73",fontWeight:700,fontSize:13}}>Cancel</div>
              <div onClick={commitContribute} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,background:T.accent,color:"#fff",fontWeight:700,fontSize:13}}>Add</div>
            </div>
          </div>
        </div>
      )}

      {/* New fund sheet */}
      {showNew&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:50,display:"flex",alignItems:"flex-end"}} onClick={()=>setShowNew(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"22px 22px 0 0",padding:"22px 20px calc(env(safe-area-inset-bottom) + 20px)",width:"100%"}}>
            <div style={{fontSize:14,fontWeight:800,color:"#0F172A",marginBottom:14}}>New sinking fund</div>
            <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
              {ICONS.map(ic=>(
                <div key={ic} onClick={()=>setForm(f=>({...f,icon:ic}))} style={{width:38,height:38,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,background:form.icon===ic?T.accentLight:"#F6F8FA",border:form.icon===ic?`1.5px solid ${T.accent}`:"1.5px solid transparent"}}>{ic}</div>
              ))}
            </div>
            <div style={{display:"flex",gap:8,marginBottom:14}}>
              {COLORS.map(c=>(
                <div key={c} onClick={()=>setForm(f=>({...f,color:c}))} style={{width:28,height:28,borderRadius:"50%",background:c,border:form.color===c?"2.5px solid #0F172A":"2.5px solid transparent",boxShadow:form.color===c?"0 0 0 2px #fff inset":"none"}}/>
              ))}
            </div>
            <input placeholder="What are you saving for?" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={{width:"100%",background:"#F6F8FA",border:`1px solid ${T.border}`,borderRadius:12,padding:"12px 14px",fontSize:16,fontFamily:"inherit",boxSizing:"border-box",marginBottom:10}}/>
            <input placeholder="Goal amount" type="number" value={form.goal} onChange={e=>setForm(f=>({...f,goal:e.target.value}))} style={{width:"100%",background:"#F6F8FA",border:`1px solid ${T.border}`,borderRadius:12,padding:"12px 14px",fontSize:16,fontFamily:"inherit",boxSizing:"border-box",marginBottom:10}}/>
            <input placeholder="Months to save in (optional)" type="number" value={form.months} onChange={e=>setForm(f=>({...f,months:e.target.value}))} style={{width:"100%",background:"#F6F8FA",border:`1px solid ${T.border}`,borderRadius:12,padding:"12px 14px",fontSize:16,fontFamily:"inherit",boxSizing:"border-box",marginBottom:6}}/>
            <div style={{fontSize:10.5,color:"#8A93A3",marginBottom:14}}>Set a timeline to see the monthly amount needed & track if you're on pace.</div>
            <div style={{display:"flex",gap:10}}>
              <div onClick={()=>setShowNew(false)} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,border:`1px solid ${T.border}`,color:"#5C6B73",fontWeight:700,fontSize:13}}>Cancel</div>
              <div onClick={addFund} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,background:T.accent,color:"#fff",fontWeight:700,fontSize:13}}>Create</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
