import { useState, useMemo } from "react";
import { T, SERIES, getSK } from "../../lib/theme.js";
import MobileScreen from "./MobileScreen.jsx";

export default function MobileAccounts({accounts,setAccounts,addAccount,updateAccount,transactions,onClose}){
  const[search,setSearch]=useState("");
  const[editing,setEditing]=useState(null);
  const[form,setForm]=useState({});
  const[showNew,setShowNew]=useState(false);
  const[newForm,setNewForm]=useState({code:"",name:""});

  const hasTxns=code=>transactions.some(t=>t.debitCode===code||t.creditCode===code);

  const filtered=useMemo(()=>{
    if(!search.trim())return accounts;
    const q=search.toLowerCase();
    return accounts.filter(a=>a.code.includes(q)||a.name.toLowerCase().includes(q));
  },[accounts,search]);

  const grouped=useMemo(()=>{
    const groups={};
    filtered.forEach(a=>{
      const sk=getSK(a.code);
      const key=sk&&SERIES[sk]?sk:"other";
      (groups[key]=groups[key]||[]).push(a);
    });
    return Object.entries(groups).sort((a,b)=>a[0].localeCompare(b[0]));
  },[filtered]);

  const openEdit=a=>{setEditing(a);setForm({name:a.name,notes:a.notes||"",customCategory:a.customCategory||"",matchable:!!a.matchable,inactive:!!a.inactive});};
  const saveEdit=()=>{updateAccount({...editing,...form});setEditing(null);};
  const doDelete=()=>{
    if(hasTxns(editing.code)){alert("Can't delete — this account has transactions.");return;}
    if(!window.confirm(`Delete ${editing.code} · ${editing.name}?`))return;
    setAccounts(accounts.filter(a=>a.code!==editing.code),editing.code);
    setEditing(null);
  };
  const createAccount=()=>{
    const code=newForm.code.trim(), name=newForm.name.trim();
    if(!code||!name)return;
    if(accounts.some(a=>a.code===code)){alert("That account number already exists.");return;}
    addAccount({code,name});
    setNewForm({code:"",name:""});
    setShowNew(false);
  };

  const fieldStyle={width:"100%",background:"#F6F8FA",border:`1px solid ${T.border}`,borderRadius:12,padding:"12px 14px",fontSize:16,fontFamily:"inherit",boxSizing:"border-box",marginBottom:12};

  return(
    <MobileScreen title="Chart of accounts" subtitle={`${accounts.length} accounts`} onClose={onClose}>
      <div style={{position:"relative",marginBottom:14}}>
        <i className="ti ti-search" style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"#98A2B3",fontSize:13}}/>
        <input placeholder="Search accounts…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:"100%",background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:"10px 12px 10px 34px",fontSize:16,fontFamily:"inherit",boxSizing:"border-box"}}/>
      </div>
      <div onClick={()=>setShowNew(true)} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"12px",borderRadius:14,border:`1.5px dashed ${T.border}`,color:T.accent,fontSize:12.5,fontWeight:700,marginBottom:18}}>
        <i className="ti ti-plus" style={{fontSize:14}}/>New account
      </div>

      {grouped.map(([key,list])=>{
        const s=SERIES[key];
        return(
          <div key={key} style={{marginBottom:18}}>
            <div style={{fontSize:11,fontWeight:800,color:"#8A93A3",textTransform:"uppercase",letterSpacing:0.4,marginBottom:8}}>{s?`${s.icon} ${s.name}`:"Other"}</div>
            {list.map(a=>(
              <div key={a.code} onClick={()=>openEdit(a)} style={{display:"flex",alignItems:"center",gap:10,background:"#fff",borderRadius:12,padding:"11px 13px",marginBottom:7,boxShadow:"0 1px 6px rgba(20,40,50,0.04)",opacity:a.inactive?0.5:1}}>
                <div style={{fontSize:10.5,fontWeight:800,color:T.accent,background:T.accentLight,borderRadius:7,padding:"3px 7px",flexShrink:0}}>{a.code}</div>
                <div style={{flex:1,fontSize:12.5,fontWeight:600,color:"#0F172A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div>
                {hasTxns(a.code)&&<div style={{fontSize:9,fontWeight:700,color:"#B4740E",background:"rgba(180,116,14,0.1)",borderRadius:7,padding:"2px 6px",flexShrink:0}}>Has txns</div>}
              </div>
            ))}
          </div>
        );
      })}
      {!grouped.length&&<div style={{textAlign:"center",padding:"30px 0",color:"#98A2B3",fontSize:12}}>No accounts match "{search}".</div>}

      {editing&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:150,display:"flex",alignItems:"flex-end"}} onClick={()=>setEditing(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"22px 22px 0 0",padding:"22px 20px calc(env(safe-area-inset-bottom) + 20px)",width:"100%",maxHeight:"80vh",overflowY:"auto"}}>
            <div style={{fontSize:11,color:T.accent,fontWeight:700,marginBottom:3}}>{editing.code}</div>
            <div style={{fontSize:15,fontWeight:800,color:"#0F172A",marginBottom:16}}>{editing.name}</div>

            <div style={{fontSize:11,color:"#8A93A3",fontWeight:600,marginBottom:5}}>Name</div>
            <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={fieldStyle}/>

            <div style={{fontSize:11,color:"#8A93A3",fontWeight:600,marginBottom:5}}>Note</div>
            <input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Optional" style={fieldStyle}/>

            <div style={{fontSize:11,color:"#8A93A3",fontWeight:600,marginBottom:5}}>Internal category</div>
            <input value={form.customCategory} onChange={e=>setForm(f=>({...f,customCategory:e.target.value}))} placeholder="e.g. Marketing" style={{...fieldStyle,marginBottom:14}}/>

            <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
              <label style={{display:"flex",alignItems:"center",gap:10,fontSize:13,fontWeight:600,color:"#0F172A"}}>
                <input type="checkbox" checked={form.matchable} onChange={e=>setForm(f=>({...f,matchable:e.target.checked}))}/>
                Open items (matchable in Reskontro)
              </label>
              <label style={{display:"flex",alignItems:"center",gap:10,fontSize:13,fontWeight:600,color:"#0F172A"}}>
                <input type="checkbox" checked={form.inactive} onChange={e=>setForm(f=>({...f,inactive:e.target.checked}))}/>
                Inactive
              </label>
            </div>

            <div style={{display:"flex",gap:10}}>
              <div onClick={()=>setEditing(null)} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,border:`1px solid ${T.border}`,color:"#5C6B73",fontWeight:700,fontSize:13}}>Cancel</div>
              <div onClick={saveEdit} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,background:T.accent,color:"#fff",fontWeight:700,fontSize:13}}>Save</div>
            </div>
            {!hasTxns(editing.code)&&<div onClick={doDelete} style={{textAlign:"center",padding:"12px",marginTop:10,color:"#E14848",fontWeight:700,fontSize:12.5}}>Delete account</div>}
          </div>
        </div>
      )}

      {showNew&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:150,display:"flex",alignItems:"flex-end"}} onClick={()=>setShowNew(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"22px 22px 0 0",padding:"22px 20px calc(env(safe-area-inset-bottom) + 20px)",width:"100%"}}>
            <div style={{fontSize:14,fontWeight:800,color:"#0F172A",marginBottom:14}}>New account</div>
            <div style={{fontSize:11,color:"#8A93A3",fontWeight:600,marginBottom:5}}>Account number</div>
            <input value={newForm.code} onChange={e=>setNewForm(f=>({...f,code:e.target.value}))} placeholder="e.g. 4210" style={fieldStyle}/>
            <div style={{fontSize:11,color:"#8A93A3",fontWeight:600,marginBottom:5}}>Name</div>
            <input value={newForm.name} onChange={e=>setNewForm(f=>({...f,name:e.target.value}))} placeholder="Account name" style={{...fieldStyle,marginBottom:14}}/>
            <div style={{display:"flex",gap:10}}>
              <div onClick={()=>setShowNew(false)} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,border:`1px solid ${T.border}`,color:"#5C6B73",fontWeight:700,fontSize:13}}>Cancel</div>
              <div onClick={createAccount} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,background:T.accent,color:"#fff",fontWeight:700,fontSize:13}}>Create</div>
            </div>
          </div>
        </div>
      )}
    </MobileScreen>
  );
}
