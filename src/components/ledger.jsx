import React, { useState, useMemo, useEffect, useRef } from "react";
import { T, SERIES, getSK, inp, btnRed, btnGhost, btnSm } from "../lib/theme.js";
import { fmt, fmtB, fmtRs, callClaudeAPI, hasId, openHtmlInNewTab, isIncomeSK, isExpenseSK, vatCodeOptions, findVatCode, vatCodeForRate } from "../lib/utils.js";
import { sb, getAdminFeaturesCache, setAdminFeaturesCache, getUserFeaturesCache, setUserFeaturesCache } from "../lib/supabaseClient.js";
import { getSignedUrl, uploadFileToStorage, deleteFileFromStorage, sanitizeFilename } from "../lib/storage.js";
import { SignedFileViewer, ResizableSplit, Spinner } from "./shell.jsx";

const getGroupLinesMap=()=>{try{return JSON.parse(localStorage.getItem("rr_group_lines")||"{}")}catch{return{};}};
// A tiny cross-component navigation hook — set once by FinanceTracker on
// mount, called by VatDrop's "Aktiver flere mva-koder" link below. Avoids
// threading an onOpenVatSettings callback through every one of VatDrop's
// many call sites across the app just for this one link.
let openVatSettingsNav=null;
const setOpenVatSettingsNav=(fn)=>{openVatSettingsNav=fn;};

const appendGroupLine=(groupRef,line)=>{
  const map=getGroupLinesMap();
  const arr=map[groupRef]||[];
  arr.push(line);
  map[groupRef]=arr;
  try{localStorage.setItem("rr_group_lines",JSON.stringify(map));}catch{}
};
const getGroupForTxn=(txnId)=>{
  const map=getGroupLinesMap();
  for(const gref in map){
    if(map[gref].some(l=>l.id===txnId))return{groupRef:gref,lines:map[gref]};
  }
  return null;
};
function SaveFlashButton({onClick,label,style={}}){
  const[saved,setSaved]=React.useState(false);
  const handle=()=>{
    if(onClick)onClick();
    setSaved(true);setTimeout(()=>setSaved(false),1800);
  };
  return(
    <button onClick={handle} style={{...btnRed,...style,background:saved?"#059669":T.accent,transition:"background 0.25s",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
      {saved&&<span style={{fontSize:14}}>✓</span>}
      {saved?"Saved!":label}
    </button>
  );
}

const sign=(n)=>(n>=0?"+":"−")+fmt(n);
// For balances/amounts where a plain positive number reads as normal (a debit
// balance, money coming into the bank) and only the credit/outgoing side
// needs a visual minus — no "+" clutter on the normal case.
const fmtBal=(n)=>(n<0?"−":"")+fmt(n);
const signRs=(n)=>(n>=0?"+":"−")+fmtRs(n);

const INIT_ACCOUNTS=[
  {code:"1001",name:"Cash in Hand"},
  {code:"1500",name:"Accounts Receivable"},
  {code:"1901",name:"Meezan Bank"},
  {code:"1902",name:"HBL Account"},
  {code:"2001",name:"Share Capital"},
  {code:"2400",name:"Accounts Payable"},
  {code:"3001",name:"Salary Income"},
  {code:"3002",name:"Freelance Income"},
  {code:"4001",name:"Rent"},
  {code:"4002",name:"Food & Groceries"},
  {code:"4003",name:"Transport"},
  {code:"4004",name:"Utilities"},
];

const INIT_CONTACTS=[
  {id:"C001",type:"customer",name:"Customer A",notes:""},
  {id:"C002",type:"customer",name:"Customer B",notes:""},
  {id:"S001",type:"supplier",name:"Ali Traders",notes:""},
  {id:"S002",type:"supplier",name:"Khan & Co",notes:""},
];


// ─── Shared UI primitives ─────────────────────────────────────────────────────

function SL({children,mt}){return <div style={{fontSize:10,fontWeight:700,color:T.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8,marginTop:mt||0}}>{children}</div>;}
function Card({children,style}){return <div style={{background:T.card,borderRadius:16,border:`1px solid ${T.border}`,padding:"14px 16px",marginBottom:10,boxShadow:"0 1px 3px rgba(0,0,0,0.04)",...style}}>{children}</div>;}
function Pill({label,color,bg}){return <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:6,background:bg,color}}>{label}</span>;}
const getRefLabel=(txnId)=>{try{return localStorage.getItem(`rr_reflabel_${txnId}`)||"";}catch{return"";}};
const setRefLabel=(txnId,label)=>{try{if(label)localStorage.setItem(`rr_reflabel_${txnId}`,label);else localStorage.removeItem(`rr_reflabel_${txnId}`);}catch{}};
function BilagText({txnId,bilag,style,onOpen}){
  const[label,setLabel]=useState(()=>getRefLabel(txnId));
  const display=label||fmtB(bilag);
  const rename=(e)=>{
    e.stopPropagation();
    const val=window.prompt("Rename this entry's reference number:",display);
    if(val===null)return;
    const trimmed=val.trim();
    setRefLabel(txnId,trimmed);
    setLabel(trimmed);
  };
  return <div onClick={onOpen} onDoubleClick={rename} title="Double-click to rename" style={style}>{display}</div>;
}
function BilagPill({txnId,bilag,color,bg}){
  const[label,setLabel]=useState(()=>getRefLabel(txnId));
  const display=label||fmtB(bilag);
  const rename=(e)=>{
    e.stopPropagation();
    const val=window.prompt("Rename this entry's reference number:",display);
    if(val===null)return;
    const trimmed=val.trim();
    setRefLabel(txnId,trimmed);
    setLabel(trimmed);
  };
  return <span onDoubleClick={rename} title="Double-click to rename"><Pill label={display} color={color} bg={bg}/></span>;
}

function BackHeader({title,sub,onBack}){
  return(
    <div style={{background:T.header,padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}>
      <button onClick={onBack} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:10,color:"#fff",fontSize:20,cursor:"pointer",width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
      <div>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontWeight:700,letterSpacing:1.5,textTransform:"uppercase"}}>{sub}</div>
        <div style={{fontSize:18,fontWeight:800,color:"#fff"}}>{title}</div>
      </div>
    </div>
  );
}

const selSm={background:"#fff",border:`1px solid ${T.border}`,borderRadius:8,color:T.text,padding:"6px 8px",width:"100%",fontSize:12,outline:"none",boxSizing:"border-box",fontFamily:"inherit"};

// Grouped dropdown (for new entry — shows AR/AP groups with icon)
function AccDrop({value,onChange,accounts,onCreateAccount}){
  const[open,setOpen]=useState(false);
  const[q,setQ]=useState("");
  const[creating,setCreating]=useState(false);
  const[newCode,setNewCode]=useState("");
  const[newName,setNewName]=useState("");
  const inputRef=React.useRef(null);
  const containerRef=React.useRef(null);
  const sel=accounts.find(a=>a.code===value);
  // The box itself IS the search field now — no separate click-to-reveal
  // step. Typing a code or name directly filters live; picking an option
  // or clicking away reverts the box to showing "CODE — Name" for the
  // current selection.
  const displayValue=sel?`${sel.code} — ${sel.name}`:"";

  const filtered=useMemo(()=>{
    const all=[];
    Object.entries(SERIES).forEach(([key,s])=>{
      const grp=accounts.filter(a=>getSK(a.code)===key).sort((a,b)=>a.code.localeCompare(b.code));
      grp.forEach(a=>{if(!q||a.code.includes(q)||a.name.toLowerCase().includes(q.toLowerCase()))all.push({...a,groupKey:key});});
    });
    return all;
  },[accounts,q]);

  const openAndSearch=()=>{setOpen(true);setQ("");};
  const closeAndRevert=()=>{setOpen(false);setQ("");setCreating(false);setNewCode("");setNewName("");};
  // Blur closes the dropdown — but ONLY when focus is actually leaving the
  // whole component. If it's just moving to the code/name inputs inside the
  // "new account" mini-form (still within containerRef), closing here would
  // kill that flow the instant someone clicks into it. relatedTarget tells
  // us where focus is going; when the browser doesn't supply it (Safari on
  // some events) fall back to a microtask check against document.activeElement.
  const handleBlur=e=>{
    const next=e.relatedTarget;
    if(next&&containerRef.current&&containerRef.current.contains(next))return;
    if(!next){
      setTimeout(()=>{
        if(containerRef.current&&!containerRef.current.contains(document.activeElement))closeAndRevert();
      },0);
      return;
    }
    closeAndRevert();
  };
  const startCreate=()=>{setCreating(true);setNewCode(/^\d+$/.test(q)?q:"");setNewName(/^\d+$/.test(q)?"":q);};
  const submitCreate=()=>{
    if(!newCode.trim()||!newName.trim())return;
    if(accounts.some(a=>a.code===newCode.trim())){alert("That account code already exists.");return;}
    onCreateAccount&&onCreateAccount({code:newCode.trim(),name:newName.trim()});
    onChange(newCode.trim());
    closeAndRevert();
  };

  return(
    <div ref={containerRef} style={{position:"relative"}}>
      <input
        ref={inputRef}
        value={open?q:displayValue}
        placeholder="— Select or type to search —"
        onFocus={openAndSearch}
        onChange={e=>{if(!open)setOpen(true);setQ(e.target.value);}}
        onBlur={handleBlur}
        onKeyDown={e=>{
          if(e.key==="Escape"){closeAndRevert();inputRef.current&&inputRef.current.blur();}
          // Enter picks the top match, same as clicking it — matches every
          // other combobox in the app and lets someone type-and-Enter
          // through a whole voucher without touching the mouse.
          if(e.key==="Enter"&&open&&filtered.length>0){e.preventDefault();onChange(filtered[0].code);closeAndRevert();}
        }}
        style={{...selSm,minHeight:28,cursor:"text",paddingRight:22}}
      />
      <span style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",fontSize:8,color:T.muted,pointerEvents:"none"}}>{open?"▲":"▼"}</span>
      {open&&(
        <>
          <div onClick={closeAndRevert} style={{position:"fixed",inset:0,zIndex:298}}/>
          <div style={{position:"absolute",top:"calc(100% + 3px)",left:0,right:0,background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,zIndex:299,boxShadow:"0 8px 24px rgba(0,0,0,0.14)",overflow:"hidden",maxHeight:280,minWidth:320}}>
            {filtered.length>0&&(
              <div style={{display:"grid",gridTemplateColumns:"70px 62px 1fr",gap:6,padding:"6px 10px",background:T.bg,borderBottom:`1px solid ${T.border}`}}>
                <div style={{fontSize:9,color:T.muted,fontWeight:700,textTransform:"uppercase"}}>Type</div>
                <div style={{fontSize:9,color:T.muted,fontWeight:700,textTransform:"uppercase"}}>Number</div>
                <div style={{fontSize:9,color:T.muted,fontWeight:700,textTransform:"uppercase"}}>Name</div>
              </div>
            )}
            <div style={{overflowY:"auto",maxHeight:230}}>
              {filtered.length===0&&!creating&&<div style={{padding:"12px 12px",fontSize:11,color:T.muted,textAlign:"center"}}>No accounts found</div>}
              {filtered.map((a,i)=>(
                <div key={a.code} onMouseDown={e=>{e.preventDefault();onChange(a.code);closeAndRevert();}} style={{display:"grid",gridTemplateColumns:"70px 62px 1fr",gap:6,padding:"7px 10px",cursor:"pointer",background:a.code===value?"#EBF4FF":"#fff",borderBottom:i<filtered.length-1?`0.5px solid ${T.border}`:"none",alignItems:"center"}}>
                  <span style={{fontSize:11,color:T.muted}}>Account</span>
                  <span style={{fontSize:11,fontWeight:700,color:(SERIES[a.groupKey]?SERIES[a.groupKey].color:undefined)||T.accent}}>{a.code}</span>
                  <span style={{fontSize:11,color:T.text,fontWeight:a.code===value?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</span>
                </div>
              ))}
            </div>
            {onCreateAccount&&(creating?(
              <div style={{padding:"10px",borderTop:`1px solid ${T.border}`,background:T.bg,display:"flex",gap:6}}>
                <input autoFocus placeholder="Code" value={newCode} onChange={e=>setNewCode(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")submitCreate();if(e.key==="Escape")setCreating(false);}} style={{...selSm,width:60,fontSize:11}}/>
                <input placeholder="Account name" value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")submitCreate();if(e.key==="Escape")setCreating(false);}} style={{...selSm,flex:1,fontSize:11}}/>
                <button onMouseDown={e=>{e.preventDefault();submitCreate();}} style={{background:T.accent,color:"#fff",border:"none",borderRadius:6,padding:"0 10px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Add</button>
              </div>
            ):(
              <div onMouseDown={e=>{e.preventDefault();startCreate();}} style={{padding:"8px 10px",fontSize:9,fontWeight:700,color:T.accent,cursor:"pointer",borderTop:`1px solid ${T.border}`,textAlign:"left"}}>+ New account{q?` "${q}"`:""}</div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Same typeable-combobox pattern as AccDrop, for VAT codes — matches
// Tripletex's own real searchable VAT dropdown rather than a plain native
// select. VAT lists are short (a handful of codes) so no grouping is
// needed, just live filtering by code, rate, or name.
function VatDrop({value,onChange,options,disabled=false}){
  const[open,setOpen]=useState(false);
  const[q,setQ]=useState("");
  const inputRef=React.useRef(null);
  const containerRef=React.useRef(null);
  const sel=options.find(o=>o.code===value);
  const displayValue=sel?`${sel.code}: (${sel.rate}%) ${sel.name}`:"";

  const filtered=useMemo(()=>{
    if(!q)return options;
    const ql=q.toLowerCase();
    return options.filter(o=>o.code.toLowerCase().includes(ql)||o.name.toLowerCase().includes(ql)||String(o.rate).includes(ql));
  },[options,q]);

  const openAndSearch=()=>{if(disabled)return;setOpen(true);setQ("");};
  const closeAndRevert=()=>{setOpen(false);setQ("");};
  const handleBlur=e=>{
    const next=e.relatedTarget;
    if(next&&containerRef.current&&containerRef.current.contains(next))return;
    if(!next){setTimeout(()=>{if(containerRef.current&&!containerRef.current.contains(document.activeElement))closeAndRevert();},0);return;}
    closeAndRevert();
  };

  return(
    <div ref={containerRef} style={{position:"relative",opacity:disabled?0.6:1}}>
      <input
        ref={inputRef}
        value={open?q:displayValue}
        placeholder="— Select VAT code —"
        disabled={disabled}
        onFocus={openAndSearch}
        onChange={e=>{if(!open)setOpen(true);setQ(e.target.value);}}
        onBlur={handleBlur}
        onKeyDown={e=>{
          if(e.key==="Escape"){closeAndRevert();inputRef.current&&inputRef.current.blur();}
          if(e.key==="Enter"&&open&&filtered.length>0){e.preventDefault();onChange(filtered[0].code);closeAndRevert();}
        }}
        style={{...selSm,minHeight:28,cursor:disabled?"default":"text",paddingRight:20}}
      />
      {!disabled&&<span style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",fontSize:8,color:T.muted,pointerEvents:"none"}}>{open?"▲":"▼"}</span>}
      {open&&!disabled&&(
        <>
          <div onClick={closeAndRevert} style={{position:"fixed",inset:0,zIndex:298}}/>
          <div style={{position:"absolute",top:"calc(100% + 3px)",left:0,right:0,background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,zIndex:299,boxShadow:"0 8px 24px rgba(0,0,0,0.14)",overflow:"hidden",maxHeight:230}}>
            <div style={{overflowY:"auto",maxHeight:230}}>
              {filtered.length===0&&<div style={{padding:"12px 12px",fontSize:9,color:T.muted,textAlign:"center"}}>No VAT codes found</div>}
              {filtered.map((o,i)=>(
                <div key={o.code} onMouseDown={e=>{e.preventDefault();onChange(o.code);closeAndRevert();}} style={{padding:"8px 10px",fontSize:9,cursor:"pointer",background:o.code===value?"#EBF4FF":"#fff",fontWeight:o.code===value?700:400,color:T.text,borderBottom:i<filtered.length-1?`0.5px solid ${T.border}`:"none"}}>
                  <span style={{fontWeight:700,color:T.accent}}>{o.code}</span>: ({o.rate}%) {o.name}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Flexible date input — type raw digits (021526 or 02152026, both parsed as
// MM/DD) or click the calendar icon for a native picker. Always stores/reads
// standard YYYY-MM-DD underneath so nothing else in the app needs to change.
function parseFlexDate(raw){
  const digits=(raw||"").replace(/[^\d]/g,"");
  if(digits.length!==6&&digits.length!==8)return null;
  const mm=parseInt(digits.slice(0,2),10);
  const dd=parseInt(digits.slice(2,4),10);
  const yy=digits.length===8?digits.slice(4,8):("20"+digits.slice(4,6));
  if(mm<1||mm>12||dd<1||dd>31)return null;
  const iso=`${yy}-${String(mm).padStart(2,"0")}-${String(dd).padStart(2,"0")}`;
  const d=new Date(iso+"T00:00:00");
  if(isNaN(d.getTime()))return null;
  return iso;
}
function fmtDateDisplay(iso){
  if(!iso)return"";
  const d=new Date(iso+"T00:00:00");
  if(isNaN(d.getTime()))return iso;
  return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
}
// `style` only ever reached the outer wrapper (for width/flex/position from
// the caller's layout) — the visible <input> always rendered at `inp`'s full
// default size regardless, which silently broke any caller trying to shrink
// it to match a smaller sibling field. `inputStyle` is the real hook for
// that: it merges onto the actual input, defaulting to {} so every existing
// caller (which only ever used `style`) renders exactly as before.
function FlexDateInput({value,onChange,style,inputStyle}){
  const[editing,setEditing]=useState(false);
  const[draft,setDraft]=useState("");
  const nativeRef=React.useRef(null);
  const commit=()=>{
    const parsed=parseFlexDate(draft);
    if(parsed)onChange(parsed);
    setEditing(false);
  };
  return(
    <div style={{position:"relative",...style}}>
      <input
        value={editing?draft:fmtDateDisplay(value)}
        placeholder="e.g. 021526 or 02152026"
        onFocus={()=>{setEditing(true);setDraft("");}}
        onChange={e=>setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e=>{if(e.key==="Enter")e.target.blur();if(e.key==="Escape"){setEditing(false);}}}
        style={{...inp,paddingRight:36,...inputStyle}}
      />
      <i
        className="ti ti-calendar"
        onClick={()=>nativeRef.current&&nativeRef.current.showPicker&&nativeRef.current.showPicker()}
        style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",fontSize:15,color:T.sub,cursor:"pointer"}}
      />
      <input
        ref={nativeRef}
        type="date"
        value={value||""}
        onChange={e=>e.target.value&&onChange(e.target.value)}
        style={{position:"absolute",inset:0,opacity:0,pointerEvents:"none",width:1,height:1}}
        tabIndex={-1}
      />
    </div>
  );
}

// Flat searchable dropdown (for edit modal)
function AccDropFlat({value,onChange,accounts}){
  const[open,setOpen]=useState(false);
  const[q,setQ]=useState("");
  const sel=accounts.find(a=>a.code===value);
  const sorted=[...accounts].sort((a,b)=>a.code.localeCompare(b.code));
  const filtered=sorted.filter(a=>!q||a.code.includes(q)||a.name.toLowerCase().includes(q.toLowerCase()));
  return(
    <div style={{position:"relative"}}>
      <div onClick={()=>{setOpen(o=>!o);setQ("");}} style={{...selSm,display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",userSelect:"none",minHeight:28}}>
        {sel?<span style={{fontSize:9,color:T.text,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sel.code} — {sel.name}</span>:<span style={{fontSize:9,color:T.muted}}>— Select Account —</span>}
        <span style={{fontSize:8,color:T.muted,marginLeft:4,flexShrink:0}}>{open?"▲":"▼"}</span>
      </div>
      {open&&(
        <>
          <div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:298}}/>
          <div style={{position:"absolute",top:"calc(100% + 3px)",left:0,right:0,background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,zIndex:299,boxShadow:"0 8px 24px rgba(0,0,0,0.14)",overflow:"hidden",maxHeight:220}}>
            <div style={{padding:"6px 8px",borderBottom:`1px solid ${T.border}`}}>
              <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search…" style={{...inp,fontSize:9,padding:"5px 8px",margin:0}}/>
            </div>
            <div style={{overflowY:"auto",maxHeight:175}}>
              {filtered.map((a,i)=>(
                <div key={a.code} onClick={()=>{onChange(a.code);setOpen(false);setQ("");}} style={{padding:"8px 10px",fontSize:9,cursor:"pointer",background:a.code===value?"#EBF4FF":"#fff",fontWeight:a.code===value?700:400,color:T.text,borderBottom:i<filtered.length-1?`0.5px solid ${T.border}`:"none",display:"flex",gap:6,alignItems:"center"}}>
                  <span style={{fontWeight:700,minWidth:32,flexShrink:0,color:T.muted}}>{a.code}</span>
                  <span>{a.name}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Menu3({items}){
  const[open,setOpen]=useState(false);
  const[pos,setPos]=useState(null);
  const btnRef=React.useRef(null);
  // Several call sites (Inbox's file list among them) put this button inside
  // a container with `overflow:hidden` for its own rounded corners — with the
  // dropdown positioned `absolute` relative to that ancestor, it was clipped
  // to invisible the moment it extended past the row, which is exactly what
  // looked like "clicking ⋮ shows no options". Positioning it `fixed` from
  // the button's own screen coordinates escapes any ancestor's overflow/
  // rounded-corner clipping, wherever this menu is used.
  const openMenu=e=>{
    e.stopPropagation();
    if(open){setOpen(false);return;}
    const r=btnRef.current.getBoundingClientRect();
    setPos({top:r.bottom+4,right:Math.max(4,window.innerWidth-r.right)});
    setOpen(true);
  };
  return(
    <div style={{position:"relative"}}>
      <button ref={btnRef} onClick={openMenu} style={{background:T.border,border:"none",borderRadius:7,color:T.sub,fontSize:12,cursor:"pointer",padding:"3px 7px",fontWeight:900,lineHeight:1}}>⋮</button>
      {open&&pos&&(<>
        <div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:390}}/>
        <div style={{position:"fixed",top:pos.top,right:pos.right,background:T.card,border:`1px solid ${T.border}`,borderRadius:10,zIndex:400,minWidth:130,boxShadow:"0 8px 32px rgba(0,0,0,0.14)"}}>
          {items.map((item,i)=>(
            <div key={i} onClick={()=>{if(!item.disabled){setOpen(false);item.action();}}}
              style={{padding:"9px 12px",fontSize:12,cursor:item.disabled?"not-allowed":"pointer",color:item.disabled?T.muted:item.color||T.text,fontWeight:500,borderBottom:i<items.length-1?`1px solid ${T.border}`:"none",display:"flex",alignItems:"center",gap:item.icon?6:0,opacity:item.disabled?0.5:1,whiteSpace:"nowrap"}}>
              {item.icon&&<span style={{fontSize:11}}>{item.icon}</span>}{item.label}
            </div>
          ))}
        </div>
      </>)}
    </div>
  );
}

// ─── Customer/Supplier search widget for new entry ───────────────────────────

function ContactSearch({contacts,value,onChange,onCreateContact}){
  const[q,setQ]=useState("");
  const[open,setOpen]=useState(false);
  const[creating,setCreating]=useState(false);
  const[newName,setNewName]=useState("");
  const[newType,setNewType]=useState("customer");
  const containerRef=React.useRef(null);

  const selectedContact=value?contacts.find(c=>c.id===value):null;

  const filtered=useMemo(()=>{
    if(!q.trim())return[];
    const ql=q.toLowerCase();
    return contacts.filter(c=>c.name.toLowerCase().includes(ql)||c.id.toLowerCase().includes(ql)).slice(0,8);
  },[contacts,q]);

  const select=(c)=>{
    onChange(c.id);
    setQ("");
    setOpen(false);
  };
  const clear=()=>{onChange("");setQ("");setOpen(false);};
  const startCreate=()=>{setCreating(true);setNewName(q);};
  const submitCreate=()=>{
    if(!newName.trim()||!onCreateContact)return;
    const newId=onCreateContact({name:newName.trim(),type:newType});
    if(newId)select({id:newId,name:newName.trim()});
    setCreating(false);setNewName("");
  };
  const handleBlur=e=>{
    const next=e.relatedTarget;
    if(next&&containerRef.current&&containerRef.current.contains(next))return;
    if(!next){
      setTimeout(()=>{
        if(containerRef.current&&!containerRef.current.contains(document.activeElement)){setOpen(false);setCreating(false);}
      },0);
      return;
    }
    setOpen(false);setCreating(false);
  };

  return(
    <div ref={containerRef} style={{position:"relative"}}>
      {selectedContact?(
        <div style={{display:"flex",alignItems:"center",gap:8,background:selectedContact.type==="customer"?T.blueBg:T.redLight,border:`1px solid ${selectedContact.type==="customer"?T.blue:T.red}`,borderRadius:10,padding:"10px 14px"}}>
          <span style={{fontSize:11,fontWeight:800,color:selectedContact.type==="customer"?T.blue:T.red,background:"#fff",padding:"2px 7px",borderRadius:5}}>{selectedContact.type==="customer"?"AR":"AP"}</span>
          <span style={{fontSize:13,fontWeight:700,flex:1,color:selectedContact.type==="customer"?T.blue:T.red}}>{selectedContact.name}</span>
          <span style={{fontSize:10,color:T.muted,fontWeight:600}}>{selectedContact.id}</span>
          <button onClick={clear} style={{background:"none",border:"none",cursor:"pointer",color:T.muted,fontSize:14,lineHeight:1,padding:"0 2px"}}>✕</button>
        </div>
      ):(
        <>
          <input
            value={q}
            onChange={e=>{setQ(e.target.value);setOpen(true);}}
            onFocus={()=>setOpen(true)}
            onBlur={handleBlur}
            onKeyDown={e=>{if(e.key==="Enter"&&open&&filtered.length>0){e.preventDefault();select(filtered[0]);}}}
            placeholder="Search customer or supplier…"
            style={inp}
          />
          {open&&(q.trim()||creating)&&(
            <>
              <div onClick={()=>{setOpen(false);setCreating(false);}} style={{position:"fixed",inset:0,zIndex:199}}/>
              <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:T.card,border:`1px solid ${T.border}`,borderRadius:12,zIndex:200,boxShadow:"0 8px 32px rgba(0,0,0,0.14)",overflow:"hidden"}}>
                {filtered.map((c,i)=>{
                  const isC=c.type==="customer";
                  return(
                    <div key={c.id} onClick={()=>select(c)} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",cursor:"pointer",borderBottom:`1px solid ${T.border}`,background:"#fff"}}>
                      <span style={{fontSize:10,fontWeight:800,color:isC?T.blue:T.red,background:isC?T.blueBg:T.redLight,padding:"2px 7px",borderRadius:5,minWidth:26,textAlign:"center"}}>{isC?"AR":"AP"}</span>
                      <span style={{fontSize:13,fontWeight:600,flex:1}}>{c.name}</span>
                      <span style={{fontSize:10,color:T.muted,fontWeight:700}}>{c.id}</span>
                    </div>
                  );
                })}
                {onCreateContact&&(creating?(
                  <div style={{padding:12,background:T.bg,display:"flex",flexDirection:"column",gap:8}}>
                    <input autoFocus placeholder="Name" value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")submitCreate();if(e.key==="Escape")setCreating(false);}} style={{...inp,fontSize:12,padding:"7px 10px"}}/>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>setNewType("customer")} style={{flex:1,padding:"7px",borderRadius:7,border:`1.5px solid ${newType==="customer"?T.blue:T.border}`,background:newType==="customer"?T.blueBg:"#fff",color:newType==="customer"?T.blue:T.sub,fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Customer</button>
                      <button onClick={()=>setNewType("supplier")} style={{flex:1,padding:"7px",borderRadius:7,border:`1.5px solid ${newType==="supplier"?T.red:T.border}`,background:newType==="supplier"?T.redLight:"#fff",color:newType==="supplier"?T.red:T.sub,fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Supplier</button>
                      <button onClick={submitCreate} style={{background:T.accent,color:"#fff",border:"none",borderRadius:7,padding:"0 16px",fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Add</button>
                    </div>
                  </div>
                ):(
                  <div onClick={startCreate} style={{padding:"11px 14px",fontSize:12,fontWeight:700,color:T.accent,cursor:"pointer",background:"#fff"}}>+ New customer or supplier{q?` "${q}"`:""}</div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// New customer/supplier — a real popup (not an inline card that pushes the
// rest of the page down), matching the same clean, sectioned pattern used
// throughout the app. Deliberately does NOT include a credit-check feature
// — that needs a real third-party credit bureau integration neither side
// has, and a fake/non-functional "check credit" button would be worse than
// not having one. Org number only shows for Norway-based books, since it's
// meaningless for Pakistan-side clients and would just be visual noise there.
function NewContactModal({defaultType="customer",country="PK",initial=null,companyCurrency="",onSave,onClose,onBulkImport}){
  const editing=!!initial;
  const[type,setType]=useState(initial?initial.type:defaultType);
  const[name,setName]=useState(initial?initial.name||"":"");
  const[orgNumber,setOrgNumber]=useState(initial?initial.orgNumber||"":"");
  const[email,setEmail]=useState(initial?initial.email||"":"");
  const[phone,setPhone]=useState(initial?initial.phone||"":"");
  const[address,setAddress]=useState(initial?initial.address||"":"");
  const[accountNo,setAccountNo]=useState(initial?initial.accountNo||"":"");
  const[paymentTermsDays,setPaymentTermsDays]=useState(initial&&initial.paymentTermsDays!=null?String(initial.paymentTermsDays):"30");
  const[creditLimit,setCreditLimit]=useState(initial&&initial.creditLimit!=null?String(initial.creditLimit):"");
  // The extra fields from the Tripletex "Kunde-/leverandørdetaljer" reference
  // — scoped to what this app can genuinely populate and act on, unlike
  // Kundeansvarlig (no staff-assignment model here) or Kredittsjekk (a real
  // credit-bureau integration this app doesn't have) which are left out
  // rather than shown as non-functional decoration.
  const[isCompany,setIsCompany]=useState(initial?initial.isCompany!==false:true);
  const[category,setCategory]=useState(initial?initial.category||"":"");
  const[currency,setCurrency]=useState(initial&&initial.currency?initial.currency:companyCurrency||"");
  const[inactive,setInactive]=useState(initial?!!initial.inactive:false);

  // Brønnøysundregisteret (Norwegian business registry) name search — live,
  // debounced, public API (no key, CORS-open). Only offered for NO companies
  // since this registry has nothing to say about a Pakistani business.
  // Picking a result fills whatever fields Brreg actually has for that
  // entity — phone/email are frequently just not registered publicly, so
  // those stay blank rather than fabricating anything.
  const[brregResults,setBrregResults]=useState([]);
  const[brregSearching,setBrregSearching]=useState(false);
  const[brregOpen,setBrregOpen]=useState(false);
  // Editing an existing contact starts with brregPicked=true so re-opening
  // it for a quick phone-number fix doesn't immediately fire a live Brreg
  // search against the name that's already there.
  const[brregPicked,setBrregPicked]=useState(editing);
  const brregTimer=useRef(null);
  useEffect(()=>{
    if(country!=="NO"||brregPicked){setBrregResults([]);return;}
    const q=name.trim();
    if(q.length<2){setBrregResults([]);setBrregOpen(false);return;}
    if(brregTimer.current)clearTimeout(brregTimer.current);
    brregTimer.current=setTimeout(async()=>{
      setBrregSearching(true);
      try{
        const res=await fetch(`https://data.brreg.no/enhetsregisteret/api/enheter?navn=${encodeURIComponent(q)}&size=6`,{headers:{Accept:"application/json"}});
        const data=await res.json();
        const hits=(data&&data._embedded&&data._embedded.enheter)||[];
        setBrregResults(hits);
        setBrregOpen(hits.length>0);
      }catch(e){setBrregResults([]);setBrregOpen(false);}
      setBrregSearching(false);
    },400);
    return()=>{if(brregTimer.current)clearTimeout(brregTimer.current);};
  },[name,country,brregPicked]);
  const pickBrregResult=(e)=>{
    setBrregPicked(true);setBrregOpen(false);setBrregResults([]);
    setName(e.navn||name);
    if(e.organisasjonsnummer)setOrgNumber(e.organisasjonsnummer);
    const addr=e.forretningsadresse||e.postadresse;
    if(addr){
      const line=(addr.adresse||[]).filter(Boolean).join(", ");
      const cityLine=[addr.postnummer,addr.poststed].filter(Boolean).join(" ");
      setAddress([line,cityLine].filter(Boolean).join(", "));
    }
    if(e.epostadresse)setEmail(e.epostadresse);
    if(e.telefon||e.mobil)setPhone(e.telefon||e.mobil);
  };

  // The reverse lookup — org number known, look up the company directly
  // instead of searching by (possibly ambiguous) name. Same public,
  // no-key Brreg endpoint, just addressed by org number directly.
  const[brregOrgLookup,setBrregOrgLookup]=useState(false);
  const[brregOrgError,setBrregOrgError]=useState("");
  const fetchByOrgNumber=async()=>{
    const num=orgNumber.trim();
    if(num.length!==9)return;
    setBrregOrgLookup(true);setBrregOrgError("");
    try{
      const res=await fetch(`https://data.brreg.no/enhetsregisteret/api/enheter/${num}`,{headers:{Accept:"application/json"}});
      if(!res.ok){setBrregOrgError(res.status===404?"No company found with that org number.":"Lookup failed — try again.");setBrregOrgLookup(false);return;}
      const e=await res.json();
      setBrregPicked(true);
      pickBrregResult(e);
    }catch{setBrregOrgError("Lookup failed — check your connection.");}
    setBrregOrgLookup(false);
  };

  const valid=name.trim().length>0;
  const submit=()=>{
    if(!valid)return;
    onSave({type,name:name.trim(),orgNumber:orgNumber.trim(),email:email.trim(),phone:phone.trim(),address:address.trim(),accountNo:accountNo.trim(),paymentTermsDays:parseInt(paymentTermsDays)||0,creditLimit:creditLimit?parseFloat(creditLimit):null,isCompany,category:category.trim(),currency:currency.trim(),inactive});
  };
  const CURRENCIES=["NOK","USD","EUR","GBP","AED","SAR","PKR"];

  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(15,23,32,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:480,maxHeight:"88vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.28)"}}>
        <div style={{position:"sticky",top:0,background:"#fff",zIndex:1,padding:"18px 20px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:16,fontWeight:800,color:T.text}}>{editing?"Customer / supplier details":"New customer / supplier"}</div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            {onBulkImport&&<button onClick={onBulkImport} style={{background:"none",border:"none",color:T.accent,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Bulk import instead →</button>}
            <button onClick={onClose} style={{background:"none",border:"none",color:T.muted,fontSize:20,cursor:"pointer",lineHeight:1,padding:"0 2px"}}>✕</button>
          </div>
        </div>

        <div style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
          <div style={{fontSize:11,color:T.muted,fontWeight:800,textTransform:"uppercase",letterSpacing:0.5}}>Customer / supplier details</div>
          <div style={{display:"flex",gap:8}}>
            {["customer","supplier"].map(t=>(
              <button key={t} onClick={()=>setType(t)} style={{flex:1,background:type===t?(t==="customer"?T.blueBg:T.redLight):"#fff",color:type===t?(t==="customer"?T.blue:T.red):T.sub,border:`1.5px solid ${type===t?(t==="customer"?T.blue:T.red):T.border}`,borderRadius:8,padding:"9px",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",textTransform:"capitalize"}}>{t}</button>
            ))}
          </div>

          <div style={{display:"flex",gap:16}}>
            {[[true,"Company"],[false,"Individual"]].map(([val,label])=>(
              <label key={label} style={{display:"flex",alignItems:"center",gap:6,fontSize:12.5,color:T.text,cursor:"pointer"}}>
                <input type="radio" checked={isCompany===val} onChange={()=>setIsCompany(val)}/>{label}
              </label>
            ))}
          </div>

          <div style={{position:"relative"}}>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
              Name *
              {country==="NO"&&brregSearching&&<span style={{fontSize:10,color:T.muted,fontWeight:500}}>· searching Brreg…</span>}
            </div>
            <input autoFocus value={name} onChange={e=>{setName(e.target.value);setBrregPicked(false);}} onFocus={()=>{if(brregResults.length)setBrregOpen(true);}} style={inp}/>
            {country==="NO"&&brregOpen&&brregResults.length>0&&(<>
              <div onClick={()=>setBrregOpen(false)} style={{position:"fixed",inset:0,zIndex:310}}/>
              <div style={{position:"absolute",top:"100%",left:0,right:0,marginTop:4,background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,0.14)",zIndex:320,maxHeight:220,overflowY:"auto"}}>
                <div style={{padding:"7px 12px",fontSize:10,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:0.4,borderBottom:`1px solid ${T.border}`}}>From Brønnøysundregisteret</div>
                {brregResults.map(r=>(
                  <div key={r.organisasjonsnummer} onClick={()=>pickBrregResult(r)} style={{padding:"9px 12px",cursor:"pointer",borderBottom:`1px solid ${T.border}`}} onMouseDown={e=>e.preventDefault()}>
                    <div style={{fontSize:12.5,fontWeight:700,color:T.text}}>{r.navn}</div>
                    <div style={{fontSize:10.5,color:T.muted,marginTop:1}}>Org.nr {r.organisasjonsnummer}{r.forretningsadresse&&r.forretningsadresse.poststed?` · ${r.forretningsadresse.poststed}`:""}</div>
                  </div>
                ))}
              </div>
            </>)}
          </div>

          {country==="NO"&&(
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Organisasjonsnummer (9 digits)</div>
              <div style={{display:"flex",gap:6}}>
                <input value={orgNumber} onChange={e=>{setOrgNumber(e.target.value.replace(/[^\d]/g,"").slice(0,9));setBrregOrgError("");}} onKeyDown={e=>{if(e.key==="Enter"&&orgNumber.trim().length===9){e.preventDefault();fetchByOrgNumber();}}} placeholder="e.g. 923456789" style={{...inp,flex:1}}/>
                <button onClick={fetchByOrgNumber} disabled={orgNumber.trim().length!==9||brregOrgLookup} title="Look up this org number on Brønnøysundregisteret" style={{background:orgNumber.trim().length===9?T.accent:T.border,color:orgNumber.trim().length===9?"#fff":T.muted,border:"none",borderRadius:8,padding:"0 14px",fontWeight:700,fontSize:12,cursor:orgNumber.trim().length===9?"pointer":"default",fontFamily:"inherit",whiteSpace:"nowrap"}}>{brregOrgLookup?"…":"Fetch"}</button>
              </div>
              {brregOrgError&&<div style={{fontSize:10.5,color:T.red,marginTop:4}}>{brregOrgError}</div>}
            </div>
          )}

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Currency</div>
              <select value={currency} onChange={e=>setCurrency(e.target.value)} style={inp}>
                <option value="">— Not set —</option>
                {CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Category (optional)</div>
              <input value={category} onChange={e=>setCategory(e.target.value)} style={inp}/>
            </div>
          </div>

          <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12.5,color:T.text,cursor:"pointer"}}>
            <input type="checkbox" checked={inactive} onChange={e=>setInactive(e.target.checked)}/>Inactive
          </label>

          <div style={{fontSize:11,color:T.muted,fontWeight:800,textTransform:"uppercase",letterSpacing:0.5,borderTop:`1px solid ${T.border}`,paddingTop:14,marginTop:2}}>Contact information</div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Phone</div>
              <input value={phone} onChange={e=>setPhone(e.target.value)} style={inp}/>
            </div>
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Email</div>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} style={inp}/>
            </div>
          </div>

          <div>
            <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Address</div>
            <input value={address} onChange={e=>setAddress(e.target.value)} style={inp}/>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Account no. / IBAN (optional)</div>
              <input value={accountNo} onChange={e=>setAccountNo(e.target.value)} style={inp}/>
            </div>
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Payment terms</div>
              <select value={paymentTermsDays} onChange={e=>setPaymentTermsDays(e.target.value)} style={inp}>
                <option value="0">Due immediately</option>
                <option value="7">Net 7</option>
                <option value="15">Net 15</option>
                <option value="30">Net 30</option>
                <option value="45">Net 45</option>
                <option value="60">Net 60</option>
              </select>
            </div>
          </div>

          {type==="customer"&&(
            <div>
              <div style={{fontSize:11,color:T.sub,marginBottom:4,fontWeight:600}}>Credit limit (optional — warns before invoicing past it)</div>
              <input type="number" value={creditLimit} onChange={e=>setCreditLimit(e.target.value)} style={inp}/>
            </div>
          )}

          <div style={{display:"flex",gap:8,marginTop:6}}>
            <button onClick={submit} disabled={!valid} style={{flex:1,background:valid?T.accent:T.border,color:valid?"#fff":T.muted,border:"none",borderRadius:10,padding:"11px",fontWeight:700,fontSize:13,cursor:valid?"pointer":"default",fontFamily:"inherit"}}>{editing?"Save":"Create"}</button>
            <button onClick={onClose} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:10,padding:"11px 18px",fontWeight:600,fontSize:13,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Edit modal (flat account list, contact linkage) ─────────────────────────

function EditModal({txn,accounts,contacts,onSave,onDelete,onClose,moneySources,tagTransaction,attachments=[],availableInboxFiles=[],onAttachExisting,onUploadFile,attUploading=false}){
  const[form,setForm]=useState({...txn,amount:String(txn.amount),contactId:txn.contactId||"",moneySourceId:txn.moneySourceId||""});
  const valid=form.debitCode&&form.creditCode&&form.description&&parseFloat(form.amount)>0;
  const[confirmDel,setConfirmDel]=useState(false);

  // Which VAT direction (if any) this entry actually carries — a P&L
  // account on the debit side means input VAT (a purchase), one on the
  // credit side means output VAT (a sale); a pure balance-sheet entry (e.g.
  // a bank transfer) carries none. Same convention New entry uses, so an
  // entry created there re-opens showing exactly what was picked, instead
  // of this modal having no VAT field at all (which made every edited or
  // re-opened entry look VAT-less regardless of what was actually saved).
  const vatDirection=isExpenseSK(form.debitCode)?"input":isIncomeSK(form.creditCode)?"output":null;
  const vatOptions=vatDirection?vatCodeOptions(vatDirection):[];
  // txn.vatCode may not have been saved on older entries — fall back to
  // reverse-deriving a code from the stored rate so it still shows correctly.
  const initialVatCode=txn.vatCode||(txn.vatPct!=null&&vatDirection?((vatCodeForRate(txn.vatPct,vatDirection)||{}).code||""):"");
  const[vatCode,setVatCode]=useState(initialVatCode);

  const attached=attachments[0]||null;

  const formCard=(
    <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:16,padding:22,display:"flex",flexDirection:"column",gap:16}}>
      <div style={{fontSize:14,fontWeight:800,color:T.text}}>Voucher details</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <div><SL>Date</SL><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={inp}/></div>
        <div><SL>Amount</SL><input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} style={inp}/></div>
      </div>
      <div><SL>Description</SL><input value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} style={inp}/></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <div><SL>Debit Account</SL><AccDropFlat value={form.debitCode} onChange={v=>setForm(f=>({...f,debitCode:v}))} accounts={accounts}/></div>
        <div><SL>Credit Account</SL><AccDropFlat value={form.creditCode} onChange={v=>setForm(f=>({...f,creditCode:v}))} accounts={accounts}/></div>
      </div>
      {vatDirection&&(
        <div style={{maxWidth:280}}><SL>VAT code</SL><VatDrop value={vatCode} onChange={setVatCode} options={vatOptions}/></div>
      )}
      <div><SL>Linked Customer / Supplier (optional)</SL><ContactSearch contacts={contacts} value={form.contactId} onChange={v=>setForm(f=>({...f,contactId:v}))}/></div>
      {moneySources&&moneySources.length>0&&(
        <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:12,padding:"10px 12px"}}>
          <div style={{fontSize:10,color:T.muted,fontWeight:800,textTransform:"uppercase",letterSpacing:0.8,marginBottom:6}}>👥 Whose</div>
          <select value={form.moneySourceId||""} onChange={e=>setForm(f=>({...f,moneySourceId:e.target.value||""}))} style={{...selSm,width:"100%"}}>
            <option value="">— Select source (optional) —</option>
            {moneySources.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      )}
      <div style={{display:"flex",gap:6,marginTop:4}}>
        <button style={{background:T.blue,color:"#fff",border:"none",borderRadius:9,padding:"10px",fontWeight:700,fontSize:13,cursor:"pointer",flex:2,fontFamily:"inherit",opacity:valid?1:0.5}} onClick={()=>{
          if(!valid)return;
          if(isDateClosed(form.date)){alert(`Period closed up to ${getPeriodClose()}. Edit the date first.`);return;}
          if(tagTransaction&&(form.moneySourceId||"")!==(txn.moneySourceId||""))tagTransaction(txn.id,form.moneySourceId||null);
          const amountNum=parseFloat(form.amount);
          const vc=vatDirection?findVatCode(vatCode,vatDirection):null;
          const vatAmount=vc&&vc.rate?Math.round((amountNum-(amountNum/(1+vc.rate/100)))*100)/100:null;
          onSave({...form,amount:amountNum,vatCode:vc?vc.code:null,vatPct:vc?vc.rate:null,vatAmount});
        }}>💾 Save</button>
        {confirmDel?(
          <button style={{background:T.red,color:"#fff",border:"none",borderRadius:9,padding:"10px",fontWeight:700,fontSize:13,cursor:"pointer",flex:2,fontFamily:"inherit"}} onClick={()=>onDelete(txn.id)}>Confirm Delete</button>
        ):(
          <button style={{background:T.redLight,color:T.red,border:`1px solid ${T.redMid}`,borderRadius:9,padding:"10px",fontWeight:700,fontSize:13,cursor:"pointer",flex:1,fontFamily:"inherit"}} onClick={()=>setConfirmDel(true)}>🗑</button>
        )}
        <button style={{background:T.bg,color:T.sub,border:`1px solid ${T.border}`,borderRadius:9,padding:"10px",fontWeight:600,fontSize:13,cursor:"pointer",flex:1,fontFamily:"inherit"}} onClick={()=>{setConfirmDel(false);onClose();}}>✕</button>
      </div>
    </div>
  );

  // Was a `position:fixed;inset:0` solid-background full-viewport takeover —
  // that painted directly over the app's own fixed top bar and sidebar
  // (both siblings elsewhere in the DOM, not inside this component), so
  // instead of "a full page like posting a voucher" it looked like the
  // whole app chrome had vanished, and the close button — sitting right at
  // the same y-position the real top bar occupies — was covered by it and
  // unclickable, forcing a hard refresh to escape. Back to the same dimmed-
  // backdrop + centered-card pattern every other modal in this app already
  // uses successfully (BulkEditPostsModal, NewContactModal, MatchDetailModal
  // …), just sized large — that keeps the app chrome visible (dimmed) behind
  // it and keeps every button reachable, while still reading as a real,
  // spacious "voucher" layout instead of a small bottom sheet. A document
  // attached to this entry now shows in a preview pane alongside the form,
  // matching New Entry's own attachment preview.
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(15,23,32,0.55)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.bg,borderRadius:16,width:"100%",maxWidth:1180,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 70px rgba(0,0,0,0.35)"}}>
        <div style={{padding:"22px 24px 0"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <div><div style={{fontSize:11,color:T.muted,fontWeight:700,letterSpacing:1}}>EDITING</div><div style={{fontSize:24,fontWeight:800,color:T.text}}>{fmtB(txn.bilag)}</div></div>
            <button onClick={onClose} style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,color:T.sub,fontSize:18,cursor:"pointer",width:40,height:40}}>✕</button>
          </div>
        </div>
        {/* Always a two-column layout — form + document preview — matching
            New Entry exactly, rather than only showing the preview column
            when a file happens to already be attached. Without an
            attachment yet, the right column shows the same "no document /
            upload one" prompt New Entry shows, so you can attach a receipt
            right from here instead of that only being possible elsewhere. */}
        <div style={{padding:"0 24px 24px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,alignItems:"start"}}>
          {formCard}
          <div style={{border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden",height:520,background:"#fff"}}>
            {attached?(<>
              <div style={{padding:"8px 12px",background:T.bg,borderBottom:`1px solid ${T.border}`,fontSize:11,fontWeight:700,color:T.sub,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{attached.name}</div>
              <div style={{height:"calc(100% - 33px)"}}>
                <SignedFileViewer storagePath={attached.storagePath} type={attached.type} name={attached.name} style={{width:"100%",height:"100%"}}/>
              </div>
            </>):(
              <div style={{height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:T.muted,gap:10,padding:24,textAlign:"center"}}>
                <i className="ti ti-file-off" style={{fontSize:28}}/>
                <div style={{fontSize:12}}>No document attached to this entry yet.</div>
                {onUploadFile&&(
                  <label style={{display:"flex",alignItems:"center",gap:6,border:`1.5px dashed ${T.border}`,borderRadius:10,padding:"10px 16px",cursor:attUploading?"wait":"pointer",background:T.bg,marginTop:6}}>
                    <i className="ti ti-upload" style={{fontSize:14,color:T.accent}}/>
                    <span style={{fontSize:11,fontWeight:700,color:T.accent}}>{attUploading?"Uploading…":"Upload a file"}</span>
                    <input type="file" accept="image/*,.pdf,.doc,.docx,.xlsx,.csv" disabled={attUploading} style={{display:"none"}} onChange={e=>{if(e.target.files[0])onUploadFile([e.target.files[0]]);}}/>
                  </label>
                )}
                {onAttachExisting&&availableInboxFiles.length>0&&(
                  <select value="" disabled={attUploading} onChange={e=>{
                    // <select> options always come back as strings — match
                    // that against the (possibly numeric) real id rather
                    // than passing the string straight through, which would
                    // silently fail the same way form.attachmentId's string/
                    // number mismatch did in New Entry (see comment there).
                    const picked=availableInboxFiles.find(f=>String(f.id)===e.target.value);
                    if(picked)onAttachExisting(picked.id);
                  }} style={{...selSm,width:"100%",marginTop:2}}>
                    <option value="">— or pick an existing Inbox file —</option>
                    {availableInboxFiles.map(f=>(<option key={f.id} value={f.id}>{f.name}</option>))}
                  </select>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

// Change log — who posted or edited this specific entry, and when. A new row
// appears every time it's saved, even if the same field changes back and
// forth many times; nothing is ever overwritten or summarized away.
function resolveUserName(userId,profiles,currentUserId){
  if(!userId)return"Unknown";
  if(userId===currentUserId)return"You";
  const p=(profiles||[]).find(x=>x.id===userId);
  if(p)return p.display_name||p.email||"Team member";
  return"Team member";
}
const FIELD_LABELS={date:"Date",debitCode:"Debit account",creditCode:"Credit account",description:"Description",amount:"Amount",status:"Status",reversedBy:"Reversed by"};
// Shows who matched a group of entries and when (pulled from the audit log,
// which already records this), with a real Unmatch action — replacing a bare
// browser confirm() dialog that gave no context about the match itself.
function MatchDetailModal({groupId,auditLog=[],profiles=[],currentUserId,onUnmatch,onClose}){
  const matchEntry=auditLog.find(a=>a.entityType==="match_group"&&a.action==="match"&&a.newValues&&a.newValues.groupId===groupId);
  const who=matchEntry?resolveUserName(matchEntry.changedBy,profiles,currentUserId):"Unknown";
  const when=matchEntry?new Date(matchEntry.createdAt):null;
  const[unmatching,setUnmatching]=useState(false);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:T.radius.xl,maxWidth:400,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",padding:24}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
          <div style={{width:36,height:36,borderRadius:"50%",background:T.greenBg,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <i className="ti ti-check" style={{fontSize:18,color:T.green}}/>
          </div>
          <div>
            <div style={{fontSize:15,fontWeight:800,color:T.text}}>Matched</div>
            <div style={{fontSize:11,color:T.muted}}>These entries are closed against each other</div>
          </div>
        </div>
        <div style={{background:T.bg,borderRadius:10,padding:"12px 16px",marginBottom:20}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:6}}>
            <span style={{color:T.muted}}>Matched by</span>
            <span style={{fontWeight:700,color:T.text}}>{who}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}>
            <span style={{color:T.muted}}>Date</span>
            <span style={{fontWeight:700,color:T.text}}>{when?`${when.toLocaleDateString()} · ${when.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`:"Unknown"}</span>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={async()=>{setUnmatching(true);await onUnmatch(groupId);setUnmatching(false);onClose();}} disabled={unmatching} style={{flex:1,background:T.redLight,color:T.red,border:"none",borderRadius:8,padding:"11px",fontWeight:700,fontSize:13,cursor:unmatching?"wait":"pointer",fontFamily:"inherit"}}>{unmatching?"Unmatching…":"Unmatch"}</button>
          <button onClick={onClose} style={{flex:1,background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"11px",fontWeight:600,fontSize:13,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Close</button>
        </div>
      </div>
    </div>
  );
}

function ChangeLogModal({entries,profiles,currentUserId,onClose}){
  const sorted=[...entries].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:T.radius.xl,maxWidth:480,width:"100%",maxHeight:"80vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",padding:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:15,fontWeight:800,color:T.text}}>Change log</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:16}}>✕</button>
        </div>
        {!sorted.length&&<div style={{textAlign:"center",color:T.muted,padding:"20px 0",fontSize:13}}>No history recorded for this entry yet.</div>}
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {sorted.map(log=>{
            const who=resolveUserName(log.changedBy,profiles,currentUserId);
            const when=new Date(log.createdAt);
            const changedFields=log.oldValues&&log.newValues?Object.keys(log.newValues).filter(k=>FIELD_LABELS[k]&&log.oldValues[k]!==log.newValues[k]):[];
            const actionLabel={create:"Created",update:"Edited",delete:"Deleted",reverse:"Reversed"}[log.action]||log.action;
            const actionColor={create:T.waterTeal,update:T.accent,delete:T.red,reverse:T.orange}[log.action]||T.sub;
            return(
              <div key={log.id} style={{border:`1px solid ${T.border}`,borderRadius:12,padding:"12px 14px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <span style={{fontSize:11,fontWeight:800,color:actionColor,background:actionColor+"18",padding:"2px 9px",borderRadius:8,textTransform:"uppercase",letterSpacing:0.3}}>{actionLabel}</span>
                  <span style={{fontSize:11,color:T.muted}}>{when.toLocaleDateString()} · {when.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
                </div>
                <div style={{fontSize:13,fontWeight:600,color:T.text,marginBottom:changedFields.length?6:0}}>{who}</div>
                {changedFields.length>0&&(
                  <div style={{display:"flex",flexDirection:"column",gap:3}}>
                    {changedFields.map(k=>(
                      <div key={k} style={{fontSize:11,color:T.sub}}>
                        <span style={{fontWeight:600}}>{FIELD_LABELS[k]}:</span>{" "}
                        <span style={{textDecoration:"line-through",color:T.muted}}>{String(log.oldValues[k])}</span>{" → "}
                        <span style={{color:T.text,fontWeight:600}}>{String(log.newValues[k])}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CommentsModal({comments,loading,newComment,setNewComment,onPost,posting,profiles,currentUserId,onClose}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:T.radius.xl,maxWidth:480,width:"100%",maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",padding:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexShrink:0}}>
          <div style={{fontSize:15,fontWeight:800,color:T.text}}>Comments</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:16}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:"auto",marginBottom:14}}>
          {loading&&<div style={{textAlign:"center",color:T.muted,padding:"20px 0",fontSize:13}}>Loading…</div>}
          {!loading&&!comments.length&&<div style={{textAlign:"center",color:T.muted,padding:"20px 0",fontSize:13}}>No comments yet — add the first one below.</div>}
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {comments.map(c=>{
              const who=resolveUserName(c.authorId,profiles,currentUserId);
              const when=new Date(c.createdAt);
              return(
                <div key={c.id} style={{border:`1px solid ${T.border}`,borderRadius:12,padding:"10px 14px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <span style={{fontSize:12,fontWeight:700,color:T.text}}>{who}</span>
                    <span style={{fontSize:10,color:T.muted}}>{when.toLocaleDateString()} · {when.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
                  </div>
                  <div style={{fontSize:13,color:T.text,whiteSpace:"pre-wrap"}}>{c.body}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{display:"flex",gap:8,flexShrink:0}}>
          <input value={newComment} onChange={e=>setNewComment(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!posting)onPost();}} placeholder="Add a comment…" style={{...inp,flex:1}}/>
          <button onClick={onPost} disabled={!newComment.trim()||posting} style={{background:newComment.trim()?T.accent:T.border,color:newComment.trim()?"#fff":T.muted,border:"none",borderRadius:8,padding:"0 18px",fontWeight:700,fontSize:13,cursor:newComment.trim()?"pointer":"default",fontFamily:"inherit"}}>{posting?"…":"Post"}</button>
        </div>
      </div>
    </div>
  );
}

function DetailModal({txn,accounts,contacts,fetchTxnAttachments,uploadInboxFile,attachFilesToTxnEntry,inboxFiles=[],fetchEntryComments,addEntryComment,onEdit,onDelete,onReverse,onDuplicate,onClose,onUnmatch,matchPartners,auditLog=[],profiles=[],currentUserId,moneySources,tagTransaction,initialShowComments=false}){
  const[showEdit,setShowEdit]=useState(false);
  const[showChangeLog,setShowChangeLog]=useState(false);
  const[showComments,setShowComments]=useState(initialShowComments);
  const[attViewer,setAttViewer]=useState(null);
  const getName=code=>((accounts.find(a=>a.code===code))||{name:code}).name;
  const isReversed=!!txn.reversedBy;
  const isReversal=!!txn.reversalOf;
  const contact=txn.contactId?contacts.find(c=>c.id===txn.contactId):null;
  const entryLog=useMemo(()=>auditLog.filter(a=>a.entityType==="transaction"&&(a.entityId===txn.id||a.bilag===txn.bilag)),[auditLog,txn.id,txn.bilag]);

  // Attachments now live in Supabase (Storage + inbox_files/txn_attachments) —
  // fetched fresh for this transaction on open rather than read from localStorage.
  const[attList,setAttList]=useState([]);
  const[attLoading,setAttLoading]=useState(true);
  const[attUploading,setAttUploading]=useState(false);
  const[attOpen,setAttOpen]=useState(true);
  useEffect(()=>{
    let alive=true;
    if(!fetchTxnAttachments){setAttLoading(false);return;}
    fetchTxnAttachments(txn.id).then(list=>{if(alive){setAttList(list);setAttLoading(false);}});
    return()=>{alive=false;};
  },[txn.id]);
  // Comments — a simple discussion thread, separate from the change log.
  const[comments,setComments]=useState([]);
  const[commentsLoading,setCommentsLoading]=useState(true);
  const[newComment,setNewComment]=useState("");
  const[postingComment,setPostingComment]=useState(false);
  useEffect(()=>{
    let alive=true;
    if(!fetchEntryComments){setCommentsLoading(false);return;}
    fetchEntryComments(txn.id).then(list=>{if(alive){setComments(list);setCommentsLoading(false);}});
    return()=>{alive=false;};
  },[txn.id]);
  const postComment=async()=>{
    if(!newComment.trim()||!addEntryComment)return;
    setPostingComment(true);
    const added=await addEntryComment(txn.id,newComment);
    if(added&&added.error){
      alert("Couldn't save your comment:\n\n"+added.error);
      // Keep the typed text — clearing it here would lose what they wrote
      // on top of the save already having failed.
    } else if(added){
      setComments(p=>[...p,added]);
      setNewComment("");
    }
    setPostingComment(false);
  };

  // Attach from Inbox — pick an existing file already in the Inbox instead
  // of only being able to upload a brand-new one.
  const[showInboxPicker,setShowInboxPicker]=useState(false);
  const[dragOver,setDragOver]=useState(false);
  const attachExistingFile=async(fileId)=>{
    if(!attachFilesToTxnEntry)return;
    await attachFilesToTxnEntry(txn.id,[fileId]);
    const file=inboxFiles.find(f=>f.id===fileId);
    if(file)setAttList(p=>[...p,file]);
    setShowInboxPicker(false);
  };
  const availableInboxFiles=inboxFiles.filter(f=>!f.deletedAt&&!attList.some(a=>a.id===f.id));

  const handleAttach=async(files)=>{
    if(!uploadInboxFile||!attachFilesToTxnEntry||!files.length)return;
    setAttUploading(true);
    const newFiles=[];
    for(const file of files){
      const newFile=await uploadInboxFile(file);
      if(newFile)newFiles.push(newFile);
    }
    if(newFiles.length){
      await attachFilesToTxnEntry(txn.id,newFiles.map(f=>f.id));
      setAttList(p=>[...p,...newFiles]);
    }
    setAttUploading(false);
  };

  if(showEdit)return(
    <EditModal
      txn={txn} accounts={accounts} contacts={contacts} moneySources={moneySources} tagTransaction={tagTransaction}
      attachments={attList} availableInboxFiles={availableInboxFiles} attUploading={attUploading}
      onUploadFile={uploadInboxFile?handleAttach:undefined}
      onAttachExisting={attachFilesToTxnEntry?attachExistingFile:undefined}
      onSave={u=>{onEdit(u);setShowEdit(false);}}
      onDelete={id=>{onDelete(id);setShowEdit(false);onClose();}}
      onClose={()=>setShowEdit(false)}
    />
  );
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:300,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:60,overflowY:"auto"}}>
      {attViewer&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:600,display:"flex",flexDirection:"column"}}>
          <div style={{padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:12,color:"#fff",fontWeight:600}}>{attViewer.name}</div>
            <button onClick={()=>setAttViewer(null)} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,color:"#fff",fontSize:13,cursor:"pointer",padding:"6px 14px",fontWeight:600}}>✕ Close</button>
          </div>
          <SignedFileViewer storagePath={attViewer.storagePath} type={attViewer.type} name={attViewer.name} style={{flex:1,objectFit:"contain",padding:10}}/>
        </div>
      )}
      <div style={{background:T.bg,borderRadius:20,padding:20,width:"100%",maxWidth:430,marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <BilagPill txnId={txn.id} bilag={txn.bilag} color={isReversal?T.red:T.blue} bg={isReversal?T.redLight:T.blueBg}/>
            <div style={{fontSize:17,fontWeight:800,marginTop:6}}>{txn.description}</div>
            {isReversed&&<div style={{fontSize:11,color:T.muted,marginTop:2}}>Reversed by {fmtB(txn.reversedBy)}</div>}
            {isReversal&&<div style={{fontSize:11,color:T.red,marginTop:2}}>↩ Reversal of {fmtB(txn.reversalOf)}</div>}
          </div>
          <div style={{display:"flex",gap:8}}>
            {showChangeLog&&(
              <ChangeLogModal entries={entryLog} profiles={profiles} currentUserId={currentUserId} onClose={()=>setShowChangeLog(false)}/>
            )}
            {showComments&&(
              <CommentsModal comments={comments} loading={commentsLoading} newComment={newComment} setNewComment={setNewComment} onPost={postComment} posting={postingComment} profiles={profiles} currentUserId={currentUserId} onClose={()=>setShowComments(false)}/>
            )}
            {addEntryComment&&(
              <button onClick={()=>setShowComments(true)} title="Comments" style={{position:"relative",background:T.border,border:"none",borderRadius:10,color:T.sub,width:34,height:34,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <i className="ti ti-message-circle" style={{fontSize:15}}/>
                {comments.length>0&&<span style={{position:"absolute",top:-4,right:-4,fontSize:9,fontWeight:800,background:T.accent,color:"#fff",borderRadius:8,padding:"1px 4px",minWidth:14,textAlign:"center"}}>{comments.length}</span>}
              </button>
            )}
            <Menu3 items={[
              ...(!isReversal&&!isReversed&&!txn.matchedWith?[
                {icon:"✏️",label:"Edit Entry",action:()=>setShowEdit(true)},
                {icon:"⧉",label:"Duplicate",action:()=>{if(onDuplicate)onDuplicate(txn);onClose();}},
                {icon:"↩️",label:"Reverse Entry",action:()=>{onReverse(txn);onClose();}},
              ]:[]),
              {icon:"📜",label:"Change log",action:()=>setShowChangeLog(true)},
            ]}/>
            {isReversed&&!isReversal&&(
              <span style={{fontSize:10,background:T.redLight,color:T.red,padding:"4px 8px",borderRadius:8,fontWeight:700}}>🔒 Reversed</span>
            )}
            {txn.matchedWith&&!isReversed&&!isReversal&&(
              <span style={{fontSize:10,background:"#DCFCE7",color:T.green,padding:"4px 8px",borderRadius:8,fontWeight:700}}>✓ Matched</span>
            )}
            <button onClick={onClose} style={{background:T.border,border:"none",borderRadius:10,color:T.sub,fontSize:16,cursor:"pointer",width:34,height:34}}>✕</button>
          </div>
        </div>
        <div style={{background:isReversal?T.redLight:T.blueBg,borderRadius:14,padding:"16px 18px",marginBottom:12,textAlign:"center"}}>
          <div style={{fontSize:11,color:T.sub,fontWeight:600,marginBottom:4}}>AMOUNT</div>
          <div style={{fontSize:28,fontWeight:900,color:isReversal?T.red:T.text}}>{fmt(txn.amount)}</div>
          <div style={{fontSize:11,color:T.sub,marginTop:4}}>{txn.date}{txn.invoiceNo?` · Invoice ${txn.invoiceNo}`:""}{txn.dueDate?` · Due ${txn.dueDate}`:""}</div>
        </div>
        {isReversal&&<div style={{background:T.redLight,borderRadius:10,padding:"10px 14px",marginBottom:10,fontSize:12,color:T.red,fontWeight:600,textAlign:"center"}}>🔒 Reversal entries cannot be edited</div>}
        {contact&&(
          <div style={{background:contact.type==="customer"?T.blueBg:T.redLight,borderRadius:10,padding:"10px 14px",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:11,fontWeight:800,color:contact.type==="customer"?T.blue:T.red}}>{contact.type==="customer"?"AR":"AP"}</span>
            <span style={{fontSize:13,fontWeight:700}}>{contact.name}</span>
            <span style={{fontSize:10,color:T.muted,marginLeft:"auto"}}>{contact.id}</span>
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div style={{background:T.redLight,borderRadius:12,padding:"12px 14px"}}>
            <div style={{fontSize:10,color:T.red,fontWeight:800,marginBottom:4}}>⬆ DEBIT</div>
            <div style={{fontSize:13,fontWeight:700}}>{txn.debitCode}</div>
            <div style={{fontSize:11,color:T.sub,marginTop:2}}>{getName(txn.debitCode)}</div>
          </div>
          <div style={{background:T.greenBg,borderRadius:12,padding:"12px 14px"}}>
            <div style={{fontSize:10,color:T.green,fontWeight:800,marginBottom:4}}>⬇ CREDIT</div>
            <div style={{fontSize:13,fontWeight:700}}>{txn.creditCode}</div>
            <div style={{fontSize:11,color:T.sub,marginTop:2}}>{getName(txn.creditCode)}</div>
          </div>
        </div>
        {/* A dedicated VAT box — same boxed treatment as Debit/Credit,
            replacing the old one-line "MVA 25% · 123" text buried inside
            the amount box above. Shown for any vat code actually recorded
            on the entry, including code "0" (Ingen avgiftsbehandling),
            since that's still meaningful information about how this entry
            was treated for VAT, not just when the amount is non-zero. */}
        {txn.vatCode!=null&&txn.vatCode!==""&&(
          <div style={{background:T.accentLight,border:`1px solid ${T.accent}`,borderRadius:12,padding:"12px 14px",marginTop:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:10,color:T.accent,fontWeight:800,marginBottom:4}}>MVA-KODE</div>
              <div style={{fontSize:13,fontWeight:700,color:T.text}}>{txn.vatCode}{txn.vatPct!=null?` (${txn.vatPct}%)`:""}</div>
            </div>
            <div style={{fontSize:15,fontWeight:800,color:T.accent}}>{fmt(txn.vatAmount||0)}</div>
          </div>
        )}
        {(()=>{
          const group=getGroupForTxn(txn.id);
          if(!group||group.lines.length<2)return null;
          const total=group.lines.reduce((s,l)=>s+l.amount,0);
          return(
            <div style={{background:T.accentLight,border:`1px solid ${T.accent}`,borderRadius:12,padding:"10px 12px",marginTop:10}}>
              <div style={{fontSize:10,color:T.accent,fontWeight:800,textTransform:"uppercase",letterSpacing:0.6,marginBottom:6}}>🔗 Linked entry · {group.lines.length} lines</div>
              {group.lines.map(l=>(
                <div key={l.id} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid rgba(0,0,0,0.06)`,fontSize:12,fontWeight:l.id===txn.id?800:500}}>
                  <span style={{color:l.id===txn.id?T.accent:T.sub}}>{fmtB(l.bilag)} · {l.description}</span>
                  <span>{fmt(l.amount)}</span>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",paddingTop:6,fontSize:12,fontWeight:800,color:T.accent}}><span>Total</span><span>{fmt(total)}</span></div>
            </div>
          );
        })()}
        {/* Attachment row — upload new, or pick an existing Inbox file; the
            whole row also accepts a drag-and-drop file drop. */}
        <div
          onDragOver={e=>{e.preventDefault();setDragOver(true);}}
          onDragLeave={()=>setDragOver(false)}
          onDrop={e=>{e.preventDefault();setDragOver(false);const files=Array.from(e.dataTransfer.files||[]);if(files.length)handleAttach(files);}}
          style={{display:"flex",gap:8,alignItems:"center",marginTop:10,border:dragOver?`2px dashed ${T.blue}`:"2px dashed transparent",borderRadius:12,padding:dragOver?4:0,background:dragOver?T.blueBg:"transparent"}}
        >
          <label style={{flex:1,display:"flex",alignItems:"center",gap:6,background:T.bg,border:`1px solid ${T.border}`,borderRadius:10,padding:"9px 14px",cursor:attUploading?"wait":"pointer",fontSize:12,color:T.blue,fontWeight:600,opacity:attUploading?0.6:1}}>
            📎 {attUploading?"Uploading…":dragOver?"Drop to attach":attList.length?`Add another file (${attList.length} attached)`:"Attach file, or drag one here"}
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple disabled={attUploading} style={{display:"none"}} onChange={e=>{if(e.target.files.length)handleAttach(Array.from(e.target.files));e.target.value="";}}/>
          </label>
          {inboxFiles.length>0&&(
            <button onClick={()=>setShowInboxPicker(true)} title="Attach from Inbox" style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:10,color:T.sub,fontSize:16,cursor:"pointer",width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><i className="ti ti-inbox" style={{fontSize:16}}/></button>
          )}
          {attList.length>0&&(
            <button onClick={()=>setAttOpen(o=>!o)} title={attOpen?"Hide attachments":"Show attachments"} style={{background:attOpen?T.blue:T.blueBg,border:`1px solid ${T.blue}`,borderRadius:10,color:attOpen?"#fff":T.blue,fontSize:16,cursor:"pointer",width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>📎</button>
          )}
        </div>
        {showInboxPicker&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:850,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setShowInboxPicker(false)}>
            <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:T.radius.xl,maxWidth:420,width:"100%",maxHeight:"70vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",padding:20}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontSize:14,fontWeight:800,color:T.text}}>Attach from Inbox</div>
                <button onClick={()=>setShowInboxPicker(false)} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:16}}>✕</button>
              </div>
              <div style={{flex:1,overflowY:"auto"}}>
                {!availableInboxFiles.length&&<div style={{textAlign:"center",color:T.muted,padding:"20px 0",fontSize:12}}>No other files available in the Inbox.</div>}
                {availableInboxFiles.map(f=>(
                  <div key={f.id} onClick={()=>attachExistingFile(f.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 10px",borderRadius:8,cursor:"pointer",fontSize:12,color:T.text}} className="rr-table-row">
                    <span style={{fontSize:15}}>{(f.type&&f.type.startsWith("image"))?"🖼️":"📄"}</span>
                    <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {attLoading&&<div style={{fontSize:11,color:T.muted,marginTop:6}}>Loading attachments…</div>}
        {attOpen&&attList.map((f,i)=>(
          <div key={f.id||i} onClick={()=>setAttViewer(f)} style={{display:"flex",alignItems:"center",gap:8,marginTop:6,padding:"7px 10px",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,cursor:"pointer"}}>
            <span style={{fontSize:15}}>{(f.type&&f.type.startsWith("image"))?"🖼️":(f.type&&f.type.includes("pdf"))?"📕":"📄"}</span>
            <span style={{fontSize:11,color:T.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</span>
            <span style={{fontSize:11,color:T.muted}}>👁</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── TxnCard ─────────────────────────────────────────────────────────────────

function TxnCard({t,accounts,contacts,attachedTxnIds,fetchTxnAttachments,uploadInboxFile,attachFilesToTxnEntry,inboxFiles=[],auditLog,profiles,currentUserId,onEdit,onDelete,onReverse,onDuplicate,moneySources,tagTransaction,fetchEntryComments,addEntryComment}){
  const[detail,setDetail]=useState(false);
  const isReversed=!!t.reversedBy;
  const isReversal=!!t.reversalOf;
  // Only hide entries that are matched but NOT reversed/reversal — those still show (dimmed)
  // Matched reversals are hidden since they're shown in the "Matched" section
  if(t.matchedWith&&!isReversed&&!isReversal)return null;
  if(t.matchedWith&&(isReversed||isReversal))return null; // both sides of a reversal hide from main list
  return(
    <>
      {detail&&<DetailModal txn={t} accounts={accounts} contacts={contacts}
        fetchTxnAttachments={fetchTxnAttachments} uploadInboxFile={uploadInboxFile} attachFilesToTxnEntry={attachFilesToTxnEntry} inboxFiles={inboxFiles} fetchEntryComments={fetchEntryComments} addEntryComment={addEntryComment}
        auditLog={auditLog} profiles={profiles} currentUserId={currentUserId} moneySources={moneySources} tagTransaction={tagTransaction}
        onEdit={u=>{onEdit(u);setDetail(false);}}
        onDelete={id=>{onDelete(id);setDetail(false);}}
        onReverse={tx=>{onReverse(tx);setDetail(false);}}
        onDuplicate={onDuplicate}
        onClose={()=>setDetail(false)}/>}
      <div onClick={()=>setDetail(true)} style={{background:T.card,borderRadius:14,border:`1px solid ${isReversal?T.redMid:isReversed?T.border:T.border}`,padding:"13px 15px",marginBottom:8,cursor:"pointer",opacity:isReversed?0.5:1,boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flex:1}}>
            <BilagPill txnId={t.id} bilag={t.bilag} color={isReversal?T.red:T.blue} bg={isReversal?T.redLight:T.blueBg}/>
            {hasId(attachedTxnIds,t.id)&&<span title="Has attachment" style={{fontSize:12}}>📎</span>}
            {(()=>{const g=getGroupForTxn(t.id);return g&&g.lines.length>1?<span title={`Linked entry · ${g.lines.length} lines`} style={{fontSize:12}}>🔗</span>:null;})()}
            <div style={{fontSize:13,fontWeight:600,flex:1,color:isReversed?T.muted:T.text}}>
              {t.description}
              {isReversed&&<span style={{fontSize:10,color:T.muted,marginLeft:5}}>[reversed]</span>}
              {isReversal&&<span style={{fontSize:10,color:T.red,marginLeft:5}}>[reversal]</span>}
            </div>
          </div>
          <div style={{fontSize:14,fontWeight:800,color:isReversal?T.red:isReversed?T.muted:T.text,marginLeft:8}}>{fmt(t.amount)}</div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <span style={{fontSize:10,background:T.redLight,color:T.red,padding:"2px 8px",borderRadius:6,fontWeight:700}}>Dr {t.debitCode}</span>
          <span style={{fontSize:12,color:T.muted}}>→</span>
          <span style={{fontSize:10,background:T.greenBg,color:T.green,padding:"2px 8px",borderRadius:6,fontWeight:700}}>Cr {t.creditCode}</span>
          <span style={{fontSize:10,color:T.muted,marginLeft:"auto"}}>{t.date}</span>
        </div>
      </div>
    </>
  );
}

// ─── MatchedGroups — renders grouped matched entries (no IIFE) ────────────────

function MatchedGroups({matchedRows,getMovement,onUnmatch}){
  const groups={};
  matchedRows.forEach(r=>{
    const g=r.matchedWith;
    if(!groups[g])groups[g]=[];
    groups[g].push(r);
  });
  return(
    <div>
      {Object.entries(groups).map(([grpId,grpRows])=>{
        const isRev=grpRows.some(r=>!!r.reversalOf);
        const lc=isRev?T.red:T.green;
        const lb=isRev?T.redLight:T.greenBg;
        const bc=isRev?"#FFCDD3":"#b7e4d4";
        return(
          <div key={grpId} style={{background:lb,borderRadius:12,padding:"10px 12px",marginBottom:8,border:`1px solid ${bc}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontSize:10,color:lc,fontWeight:800,letterSpacing:0.5}}>{isRev?"↩ Reversal":"✓ Matched"}</div>
              {!isRev&&onUnmatch&&(
                <button onClick={()=>onUnmatch(grpId)} style={{background:"none",border:"none",color:lc,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",textDecoration:"underline"}}>Unmatch</button>
              )}
            </div>
            {grpRows.map(r=>{
              const mv=getMovement?getMovement(r):r.movement||0;
              return(
                <div key={r.id} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${bc}`,fontSize:12,alignItems:"center"}}>
                  <div>
                    <span style={{color:T.sub,fontWeight:700}}>{fmtB(r.bilag)}</span>
                    <span style={{color:T.muted,marginLeft:6}}>{r.description}</span>
                  </div>
                  <span style={{fontWeight:700,color:mv>=0?T.green:T.red,minWidth:70,textAlign:"right"}}>{sign(mv)}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── Admin feature helpers ────────────────────────────────────────────────────
const ADMIN_KEY="rr_admin_features";
const BUGLOG_KEY="rr_buglog";
const MAX_BUGS=200;

// ── Bug Log helpers ──────────────────────────────────────────────────────────
const getBugs=()=>{try{return JSON.parse(localStorage.getItem(BUGLOG_KEY)||"[]")}catch{return[];}};
const saveBugsRaw=(list)=>{try{localStorage.setItem(BUGLOG_KEY,JSON.stringify(list.slice(-MAX_BUGS)));}catch{}};
const logBug=(type,message,detail="",context="")=>{
  const bugs=getBugs();
  bugs.push({id:Date.now()+Math.random().toString(36).slice(2),ts:new Date().toISOString(),type,message,detail:String(detail).slice(0,500),context:String(context).slice(0,200),resolved:false});
  saveBugsRaw(bugs);
  console.warn("[BugLog]",type,message,detail);
};
// Auto-catch unhandled JS errors
if(typeof window!=="undefined"){
  window.addEventListener("error",e=>{logBug("JS_ERROR",e.message,e.filename+":"+(e.lineno||"?"),"window.onerror");});
  window.addEventListener("unhandledrejection",e=>{logBug("PROMISE",String((e.reason&&e.reason.message?e.reason.message:undefined)||e.reason),(e.reason&&e.reason.stack?e.reason.stack:"")||"","unhandledrejection");});
}
const USER_FEATS_KEY="rr_user_features"; // {userId: {featureId: bool}}

// Reads from the in-memory cache (populated once from Supabase on load —
// see loadFeatureFlagsFromDb below), with localStorage as a one-time
// migration source: if the cache is empty but localStorage has old data,
// that's a pre-upgrade account, and the data gets uploaded to the database
// the first time it's touched rather than silently lost.
const getAdminFeatures=()=>{
  const cached=getAdminFeaturesCache();
  if(Object.keys(cached).length)return cached;
  try{return JSON.parse(localStorage.getItem(ADMIN_KEY)||"{}")}catch{return{};}
};
const getUserFeatures=(userId)=>{
  const cached=getUserFeaturesCache();
  if(cached[userId])return cached[userId];
  try{const all=JSON.parse(localStorage.getItem(USER_FEATS_KEY)||"{}");return all[userId]||{};}catch{return{};}
};
const setUserFeature=(userId,featureId,val)=>{
  // Optimistic cache update so isFeatureOn() reflects the change immediately,
  // matching the pattern used everywhere else this session for writes.
  const cache=getUserFeaturesCache();
  const updated={...cache,[userId]:{...(cache[userId]||{}),[featureId]:val}};
  setUserFeaturesCache(updated);
  // Also keep localStorage in sync during the transition period, and
  // persist to the real database — profiles.feature_overrides — so this
  // survives a different browser or a cleared cache.
  try{
    const all=JSON.parse(localStorage.getItem(USER_FEATS_KEY)||"{}");
    if(!all[userId])all[userId]={};
    all[userId][featureId]=val;
    localStorage.setItem(USER_FEATS_KEY,JSON.stringify(all));
  }catch{}
  sb.from("profiles").update({feature_overrides:updated[userId]}).eq("id",userId).then(({error})=>{
    if(error)console.error("Feature override save failed:",error);
  });
};
// Feature is on if admin has enabled it globally AND user has it enabled (or user setting not set, defaults to admin setting)
const isFeatureOn=(featureId,userId)=>{
  const admin=getAdminFeatures();
  if(admin[featureId]===false)return false; // admin disabled globally
  const user=getUserFeatures(userId);
  return user[featureId]!==false; // default on unless user explicitly off
};

// Period close helper
const PERIOD_CLOSE_KEY="rr_period_close";
const getPeriodClose=()=>localStorage.getItem(PERIOD_CLOSE_KEY)||null;
const isDateClosed=(date)=>{const pc=getPeriodClose();return pc&&date<=pc;};

// Bank reconciliation approval — per bank account + month, stored locally
// (same pattern as the period-close date above). Once approved, that
// account/month is locked: no new posting or matching against it until
// reopened.
const BANK_RECON_APPROVED_KEY="rr_bank_recon_approved";
const getBankReconApprovals=()=>{try{return JSON.parse(localStorage.getItem(BANK_RECON_APPROVED_KEY)||"{}");}catch{return{};}};
const isBankReconApproved=(accountCode,month)=>!!getBankReconApprovals()[`${accountCode}|${month}`];
const setBankReconApproved=(accountCode,month,value)=>{
  const all=getBankReconApprovals();
  const key=`${accountCode}|${month}`;
  if(value)all[key]=true;else delete all[key];
  try{localStorage.setItem(BANK_RECON_APPROVED_KEY,JSON.stringify(all));}catch{}
};

// Budget "move previous month forward" guard — records which month-to-month
// transitions have already been copied, so re-opening the menu (or clicking
// twice) can't silently re-apply the same move and overwrite anything the
// person has since edited by hand. Cleared automatically once the person
// explicitly asks to move again.
const BUDGET_MOVED_KEY="rr_budget_moves_done";
const getBudgetMoves=()=>{try{return JSON.parse(localStorage.getItem(BUDGET_MOVED_KEY)||"{}");}catch{return{};}};
const hasBudgetMoved=(fromY,fromM,toY,toM)=>!!getBudgetMoves()[`${fromY}-${fromM}->${toY}-${toM}`];
const markBudgetMoved=(fromY,fromM,toY,toM,value=true)=>{
  const all=getBudgetMoves();
  const key=`${fromY}-${fromM}->${toY}-${toM}`;
  if(value)all[key]=true;else delete all[key];
  try{localStorage.setItem(BUDGET_MOVED_KEY,JSON.stringify(all));}catch{}
};

function LedgerScreen({account,accounts,contacts,transactions,onBack,onEditTxn,onDeleteTxn,onReverseTxn,onMatchTxns,onUnmatchTxns,filterFrom,filterTo,fetchTxnAttachments,uploadInboxFile,attachFilesToTxnEntry,inboxFiles=[],auditLog,profiles,currentUserId,moneySources,tagTransaction,fetchEntryComments,addEntryComment}){
  const today=new Date().toISOString().split("T")[0];
  const[from,setFrom]=useState(filterFrom||"2026-01-01");
  const[to,setTo]=useState(filterTo||today);
  const[detailTxn,setDetailTxn]=useState(null);
  const[selected,setSelected]=useState([]);
  const[showSearch,setShowSearch]=useState(false);
  const[ledgerSearch,setLedgerSearch]=useState("");
  const sk=getSK(account.code);
  const series=sk?SERIES[sk]:null;
  const getName=code=>((accounts.find(a=>a.code===code))||{name:code}).name;

  const openingBal=useMemo(()=>
    transactions.filter(t=>t.date<from&&(t.debitCode===account.code||t.creditCode===account.code))
      .reduce((s,t)=>t.debitCode===account.code?s+t.amount:s-t.amount,0),
  [transactions,account.code,from]);

  const allRows=useMemo(()=>{
    let running=openingBal;
    return transactions
      .filter(t=>t.date>=from&&t.date<=to&&(t.debitCode===account.code||t.creditCode===account.code))
      .sort((a,b)=>a.date.localeCompare(b.date))
      .map(t=>{const isDr=t.debitCode===account.code;const movement=isDr?t.amount:-t.amount;running+=movement;return{...t,movement,balance:running};});
  },[transactions,account.code,from,to,openingBal]);

  const rows=useMemo(()=>{
    if(!ledgerSearch)return allRows;
    const q=ledgerSearch.toLowerCase();
    return allRows.filter(r=>(r.description?r.description.toLowerCase():undefined).includes(q)||fmtB(r.bilag).toLowerCase().includes(q)||String(r.amount).includes(q));
  },[allRows,ledgerSearch]);
  const closingBal=allRows.length>0?allRows[allRows.length-1].balance:openingBal;
  const periodMovement=allRows.reduce((s,r)=>s+r.movement,0);

  // Click a column header to sort by it; click again to flip direction.
  const[sortBy,setSortBy]=useState(null); // null | "bilag" | "date" | "amount"
  const[sortDir,setSortDir]=useState("asc");
  const toggleSort=(col)=>{
    if(sortBy===col)setSortDir(d=>d==="asc"?"desc":"asc");
    else{setSortBy(col);setSortDir("asc");}
  };
  const sortedRows=useMemo(()=>{
    if(!sortBy)return rows;
    const mul=sortDir==="asc"?1:-1;
    const arr=[...rows];
    arr.sort((a,b)=>{
      if(sortBy==="amount")return(a.movement-b.movement)*mul;
      if(sortBy==="bilag")return(a.bilag-b.bilag)*mul;
      if(sortBy==="date")return a.date.localeCompare(b.date)*mul;
      if(sortBy==="description")return(a.description||"").localeCompare(b.description||"")*mul;
      return 0;
    });
    return arr;
  },[rows,sortBy,sortDir]);

  const toggleSel=id=>setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
  const selSum=selected.reduce((s,id)=>{const r=rows.find(x=>x.id===id);return r?s+r.movement:s;},0);
  const doMatch=()=>{if(selected.length<2||Math.abs(selSum)>=1)return;onMatchTxns(selected,Date.now().toString(),account.code);setSelected([]);};
  const doUnmatch=(grpId)=>{if(onUnmatchTxns&&window.confirm("Unmatch this group of entries?"))onUnmatchTxns(grpId);};

  const exportLedger=()=>{
    const csvRows=[["Date","Bilag","Description","Movement","Balance"]];
    allRows.forEach(r=>{csvRows.push([r.date,fmtB(r.bilag),r.description,r.movement,r.balance]);});
    const csv=csvRows.map(r=>r.join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`Ledger_${account.code}_${from}_${to}.csv`;a.click();
  };

  const exportLedgerPDF=()=>{
    let rows=allRows.map(r=>`<tr><td>${r.date}</td><td>${fmtB(r.bilag)}</td><td>${r.description}</td><td style="text-align:right;color:${r.movement>=0?"#059669":"#DC2626"}">${r.movement>=0?"+":"−"}${fmt(Math.abs(r.movement))}</td><td style="text-align:right">${sign(r.balance)}</td></tr>`).join("");
    const html=`<!DOCTYPE html><html><head><title>Ledger ${account.code}</title><style>body{font-family:Arial,sans-serif;font-size:12px;margin:30px}h1{font-size:16px}table{width:100%;border-collapse:collapse}th{background:${T.accent};color:#fff;padding:7px 10px;text-align:left;font-size:11px}td{padding:6px 10px;border-bottom:1px solid #eee;font-size:11px}tr:nth-child(even) td{background:#f9f9f9}.foot{display:flex;gap:30px;margin-top:16px;padding:10px;background:#f0f0f0;border-radius:6px}.foot div{text-align:center}.foot .lbl{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:1px}.foot .val{font-size:13px;font-weight:bold}.btn-bar{display:flex;gap:10px;margin-top:20px;}@media print{.btn-bar{display:none}}</style></head><body>
    <h1>${account.code} · ${account.name}</h1><p style="color:#888;font-size:11px">Period: ${from} → ${to}</p>
    <table><thead><tr><th>Date</th><th>Ref No</th><th>Description</th><th style="text-align:right">Movement</th><th style="text-align:right">Balance</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="foot"><div><div class="lbl">Opening</div><div class="val">${sign(openingBal)}</div></div><div><div class="lbl">Period</div><div class="val">${sign(periodMovement)}</div></div><div><div class="lbl">Closing</div><div class="val">${sign(closingBal)}</div></div></div>
    <div class="btn-bar"><button onclick="window.print()" style="padding:8px 18px;background:${T.accent};color:#fff;border:none;border-radius:6px;cursor:pointer">🖨 Print / Save PDF</button><button onclick="window.close()" style="padding:8px 18px;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer">← Close</button></div>
    <script>window.onload=function(){window.print();};</script>
    </body></html>`;
    openHtmlInNewTab(html);
  };

  const[exportMenu,setExportMenu]=useState(false);

  const mergeSelected=()=>{
    const items=rows.filter(r=>selected.includes(r.id));
    if(items.length<2)return;
    const total=items.reduce((s,r)=>s+r.amount,0);
    const blocks=items.map((r,i)=>`
      <div style="border:1px solid #eee;border-radius:8px;padding:14px 16px;margin-bottom:14px;${i>0?"page-break-inside:avoid;":""}">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <span style="font-weight:bold;color:${T.accent}">${fmtB(r.bilag)}</span>
          <span style="color:#888;font-size:11px">${r.date}</span>
        </div>
        <div style="font-size:13px;margin-bottom:6px">${r.description}</div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:#555">
          <span>Dr ${r.debitCode} → Cr ${r.creditCode}</span>
          <span style="font-weight:bold;color:${r.movement>=0?"#059669":"#DC2626"}">${r.movement>=0?"+":"−"}${fmt(Math.abs(r.movement))}</span>
        </div>
      </div>`).join("");
    const html=`<!DOCTYPE html><html><head><title>Merged Entries · ${account.code}</title><style>body{font-family:Arial,sans-serif;font-size:13px;margin:30px}h1{font-size:16px}.btn-bar{display:flex;gap:10px;margin-top:20px}@media print{.btn-bar{display:none}}</style></head><body>
      <h1>${account.code} · ${account.name}</h1><p style="color:#888;font-size:11px">Merged export of ${items.length} selected entries</p>
      ${blocks}
      <div style="display:flex;justify-content:space-between;padding:12px 16px;background:#f0f0f0;border-radius:8px;font-weight:bold"><span>Total</span><span>${sign(total)}</span></div>
      <div class="btn-bar"><button onclick="window.print()" style="padding:8px 18px;background:${T.accent};color:#fff;border:none;border-radius:6px;cursor:pointer">🖨 Print / Save PDF</button><button onclick="window.close()" style="padding:8px 18px;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer">← Close</button></div>
      <script>window.onload=function(){window.print();};</script>
      </body></html>`;
    openHtmlInNewTab(html);
  };

  return(
    <div style={{background:T.bg,minHeight:"100vh",fontFamily:"system-ui,sans-serif",maxWidth:430,margin:"0 auto",paddingBottom:90}}>
      {detailTxn&&<DetailModal txn={detailTxn} accounts={accounts} contacts={contacts}
        fetchTxnAttachments={fetchTxnAttachments} uploadInboxFile={uploadInboxFile} attachFilesToTxnEntry={attachFilesToTxnEntry} inboxFiles={inboxFiles} fetchEntryComments={fetchEntryComments} addEntryComment={addEntryComment}
        auditLog={auditLog} profiles={profiles} currentUserId={currentUserId} moneySources={moneySources} tagTransaction={tagTransaction}
        onEdit={u=>{onEditTxn(u);setDetailTxn(null);}}
        onDelete={id=>{onDeleteTxn(id);setDetailTxn(null);}}
        onReverse={tx=>{onReverseTxn(tx);setDetailTxn(null);}}
        onClose={()=>setDetailTxn(null)}/>}
      <BackHeader title={account.name} sub={`${(series&&series.icon)||""} ${(series&&series.name)||""} · ${account.code}`} color={series&&series.color} onBack={onBack}
        right={
          <div style={{position:"relative"}}>
            <button onClick={()=>setExportMenu(o=>!o)} style={{background:"rgba(255,255,255,0.12)",border:"none",borderRadius:10,color:"#fff",fontSize:14,cursor:"pointer",width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,letterSpacing:1}}>•••</button>
            {exportMenu&&(
              <>
                <div onClick={()=>setExportMenu(false)} style={{position:"fixed",inset:0,zIndex:290}}/>
                <div style={{position:"absolute",right:0,top:44,background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,zIndex:300,minWidth:160,boxShadow:"0 8px 24px rgba(0,0,0,0.15)"}}>
                  <div onClick={()=>{exportLedger();setExportMenu(false);}} style={{padding:"13px 16px",fontSize:13,cursor:"pointer",color:T.accent,fontWeight:600,display:"flex",alignItems:"center",gap:8,borderBottom:`1px solid ${T.border}`}}>📄 Export CSV</div>
                  <div onClick={()=>{exportLedgerPDF();setExportMenu(false);}} style={{padding:"13px 16px",fontSize:13,cursor:"pointer",color:T.red,fontWeight:600,display:"flex",alignItems:"center",gap:8}}>📕 Export PDF</div>
                </div>
              </>
            )}
          </div>
        }
      />
      <div style={{background:"#fff",borderBottom:`1px solid ${T.border}`,padding:"8px 12px"}}>
        {selected.length>0?(
          /* Selection banner takes the place of the date/period bar while selecting */
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",minHeight:28}}>
            <div>
              <div style={{fontSize:11,color:T.muted}}>{selected.length} selected · Net: <span style={{fontWeight:700,color:Math.abs(selSum)<1?T.green:T.red}}>{sign(selSum)}</span></div>
              <div style={{fontSize:11,fontWeight:700,color:Math.abs(selSum)<1?T.green:T.sub,marginTop:1}}>{Math.abs(selSum)<1?"✓ Ready to match":"Entries must net to zero"}</div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setSelected([])} style={{...btnSm,background:T.border,color:T.sub,fontSize:11}}>Clear</button>
              {selected.length>=2&&<button onClick={mergeSelected} style={{...btnSm,background:T.accentLight,color:T.accent,fontSize:11}}>📄 Merge</button>}
              <button onClick={doMatch} style={{...btnSm,background:Math.abs(selSum)<1?T.green:T.border,color:Math.abs(selSum)<1?"#fff":T.muted,fontSize:11,opacity:Math.abs(selSum)<1?1:0.6}}>Match ✓</button>
            </div>
          </div>
        ):(<>
        {/* Quick period buttons */}
        <div style={{display:"flex",gap:4,marginBottom:showSearch?8:0,overflowX:"auto",scrollbarWidth:"none",alignItems:"center"}}>
          <select value={from.slice(0,4)} onChange={e=>{const y=e.target.value;setFrom(`${y}-01-01`);setTo(`${y}-12-31`);}} style={{fontSize:11,fontWeight:700,color:T.text,background:"#f3f4f6",border:"none",borderRadius:7,padding:"4px 8px",cursor:"pointer",fontFamily:"inherit",outline:"none",flexShrink:0}}>
            {[2023,2024,2025,2026,2027,2028].map(y=><option key={y} value={y}>{y}</option>)}
          </select>
          <div style={{display:"flex",gap:3,flex:1,overflowX:"auto",scrollbarWidth:"none"}}>
            {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m,i)=>{
              const mm=String(i+1).padStart(2,"0");
              const y=from.slice(0,4);
              const active=from===`${y}-${mm}-01`&&to===`${y}-${mm}-${new Date(parseInt(y),i+1,0).getDate()}`;
              return(
                <button key={i} onClick={()=>{const y2=from.slice(0,4);const last=new Date(parseInt(y2),i+1,0).getDate();setFrom(`${y2}-${mm}-01`);setTo(`${y2}-${mm}-${String(last).padStart(2,"0")}`);}} style={{flexShrink:0,padding:"3px 7px",borderRadius:7,border:`1.5px solid ${active?T.accent:T.border}`,background:active?T.accent:"#fff",color:active?"#fff":T.sub,fontSize:10,fontWeight:active?700:400,cursor:"pointer",fontFamily:"inherit",transform:active?"translateY(-1px)":"none",transition:"all 0.1s"}}>
                  {m}
                </button>
              );
            })}
          </div>
          {/* Search/filter button */}
          <button onClick={()=>setShowSearch(s=>!s)} style={{flexShrink:0,background:showSearch?T.accent:T.accentLight,border:"none",borderRadius:7,color:showSearch?"#fff":T.accent,fontSize:14,cursor:"pointer",width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center"}}>🔍</button>
        </div>
        {/* Custom date range when search open */}
        {showSearch&&(
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={{...inp,flex:1,padding:"5px 8px",fontSize:12}}/>
            <span style={{fontSize:10,color:T.muted,fontWeight:700}}>→</span>
            <input type="date" value={to} onChange={e=>setTo(e.target.value)} style={{...inp,flex:1,padding:"5px 8px",fontSize:12}}/>
            <input placeholder="Search..." value={ledgerSearch} onChange={e=>setLedgerSearch(e.target.value)} style={{...inp,flex:1,padding:"5px 8px",fontSize:12}}/>
          </div>
        )}
        </>)}
      </div>
      <div style={{padding:16}}>
        <div style={{display:"grid",gridTemplateColumns:"24px 46px 42px 1fr 76px",gap:4,padding:"7px 6px",border:`1px solid ${T.border}`,borderRadius:"10px 10px 0 0",background:"#EEF4F3"}}>
          {[
            {key:"",label:""},
            {key:"bilag",label:"Bilag"},
            {key:"date",label:"Date"},
            {key:"description",label:"Description"},
            {key:"amount",label:"Amount"},
          ].map(h=>(
            <div key={h.label} onClick={h.key?()=>toggleSort(h.key):undefined} style={{fontSize:10,color:"#111827",fontWeight:800,textAlign:h.label==="Amount"?"right":"left",textTransform:"uppercase",letterSpacing:0,cursor:h.key?"pointer":"default",display:"flex",alignItems:"center",justifyContent:h.label==="Amount"?"flex-end":"flex-start",gap:2,userSelect:"none"}}>
              {h.label}{sortBy===h.key&&h.key&&<span style={{fontSize:9}}>{sortDir==="asc"?"▲":"▼"}</span>}
            </div>
          ))}
        </div>
        <div style={{background:"#fff",border:`1px solid ${T.border}`,borderBottom:"none"}}>
          <div style={{display:"flex",justifyContent:"space-between",padding:"10px 12px",borderBottom:`1px solid ${T.border}`}}>
            <div style={{fontSize:12,fontWeight:700,color:"#111827"}}>Incoming Balance</div>
            <div style={{fontSize:12,fontWeight:800,color:"#111827"}}>{sign(openingBal)}</div>
          </div>
        </div>
        {rows.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:T.muted}}><div style={{fontSize:32,marginBottom:8}}>📭</div><div style={{fontSize:13,fontWeight:600}}>No transactions in this period</div></div>}
        {sortedRows.map((r,i)=>{
          const isSel=selected.includes(r.id);const isRev=!!r.reversalOf;
          const isMatchedHere=!!r.matchedWith&&r.matchedAccount===account.code;
          return(
            <div key={r.id} className="rr-table-row" style={{display:"grid",gridTemplateColumns:"24px 46px 42px 1fr 76px",gap:4,padding:"9px 6px",border:`1px solid ${T.border}`,borderTop:"none",alignItems:"center",background:isMatchedHere?T.greenBg:"#fff",borderLeft:isSel?`3px solid ${T.blue}`:isMatchedHere?`3px solid ${T.green}`:"1px solid "+T.border}}>
              {isMatchedHere?(
                <button onClick={()=>doUnmatch(r.matchedWith)} title="Matched — tap to unmatch" style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:T.green,padding:0,fontWeight:800}}>✓</button>
              ):(
                <input type="checkbox" checked={isSel} onChange={()=>toggleSel(r.id)} style={{width:14,height:14,cursor:"pointer",accentColor:T.blue}}/>
              )}
              <BilagText txnId={r.id} bilag={r.bilag} onOpen={()=>setDetailTxn(r)} style={{fontSize:10,color:T.blue,fontWeight:800,cursor:"pointer",textDecoration:"underline dotted"}}/>
              <div style={{fontSize:10,color:"#111827"}}>{r.date.slice(5)}</div>
              <div style={{fontSize:12,color:isRev?T.red:"#111827",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontStyle:isRev?"italic":"normal"}}>{r.description}</div>
              <div style={{fontSize:12,fontWeight:800,textAlign:"right",color:"#111827"}}>{r.movement>=0?"+":"−"}{fmt(Math.abs(r.movement))}</div>
            </div>
          );
        })}
        <div style={{background:"#fff",border:`1px solid ${T.border}`,borderTop:"none",borderRadius:"0 0 10px 10px",overflow:"hidden"}}>
          {[
            {label:"This Period",value:periodMovement},
            {label:"Outgoing Balance",value:closingBal}
          ].map((c,i)=>(
            <div key={c.label} style={{display:"flex",justifyContent:"space-between",padding:"10px 12px",borderBottom:i===0?`1px solid ${T.border}`:"none"}}>
              <div style={{fontSize:12,fontWeight:800,color:"#111827"}}>{c.label}</div>
              <div style={{fontSize:12,fontWeight:900,color:"#111827"}}>{sign(c.value)}</div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

// ─── Bank Module ──────────────────────────────────────────────────────────────

// ─── Money Sources Panel ──────────────────────────────────────────────────
// Manual "whose money is in the bank" tracking. Not FIFO — a source's totals
// only change when the user (a) edits its manual opening Received/Used
// baseline, or (b) tags/untags a specific bank transaction to it via the
// dropdown below. Shared by both the mobile Bank screen (BankModule) and the
// desktop Bank dashboard (BankDashboardScreen) so the two stay in sync.
function MoneySourcesPanel({moneySources=[],saveMoneySources,transactions,accounts,tagTransaction,bankAccounts:bankAccountsProp,getBal:getBalProp,bankDetailsFor,onOpenLedger,onEditBankAccount,yearStart,today}){
  const[showAdd,setShowAdd]=useState(false);
  const[showManage,setShowManage]=useState(false);
  const[editingId,setEditingId]=useState(null);
  const[form,setForm]=useState({name:"",openingReceived:"",openingUsed:""});
  const[selectedBank,setSelectedBank]=useState(null);
  const[tagFilter,setTagFilter]=useState("all"); // "all" | "untagged" | a source id
  const[periodMode,setPeriodMode]=useState("all"); // "all" | "month"
  const now=new Date();
  const[pYear,setPYear]=useState(now.getFullYear());
  const[pMonth,setPMonth]=useState(now.getMonth());
  const pLabel=new Date(pYear,pMonth,1).toLocaleString("default",{month:"long",year:"numeric"});
  const stepPMonth=dir=>{let m=pMonth+dir,y=pYear;if(m<0){m=11;y--;}else if(m>11){m=0;y++;}setPMonth(m);setPYear(y);};
  const pFrom=`${pYear}-${String(pMonth+1).padStart(2,"0")}-01`;
  const pTo=new Date(pYear,pMonth+1,0).toISOString().slice(0,10);

  // "1900" itself is Cash in Hand, not a bank — excluded so a cash⇄bank
  // transfer (e.g. Dr 1900 / Cr 1901, withdrawing bank cash) only counts on
  // the real bank side (as "used", since money left the bank), instead of
  // also registering as "received" on the cash side and double-counting a
  // single transfer as both money in and money out.
  const ownBankAccounts=useMemo(()=>accounts.filter(a=>getSK(a.code)==="1900"&&a.code!=="1900"),[accounts]);
  const bankAccounts=bankAccountsProp||ownBankAccounts;
  const bankCodes=useMemo(()=>new Set(bankAccounts.map(a=>a.code)),[bankAccounts]);
  const bankTxns=useMemo(()=>transactions.filter(t=>bankCodes.has(t.debitCode)||bankCodes.has(t.creditCode)).sort((a,b)=>b.date.localeCompare(a.date)),[transactions,bankCodes]);
  const getBal=getBalProp||(code=>transactions.reduce((s,t)=>{if(t.debitCode===code)return s+t.amount;if(t.creditCode===code)return s-t.amount;return s;},0));
  const activeBank=bankAccounts.find(a=>a.code===selectedBank)||bankAccounts[0]||null;

  // Bank-first breakdown — computed purely from real tagged transactions
  // (never a source's manually-typed opening balance), and each bank lists
  // its own transactions with an inline tag selector right there. This is
  // the only balances view shown by default, so there's no separate "all
  // sources" total that can drift out of sync with what's actually posted.
  const activeSourcesList=moneySources.filter(m=>!m.inactive);
  const perBank=useMemo(()=>bankAccounts.map(bank=>{
    const txns=transactions.filter(t=>t.debitCode===bank.code||t.creditCode===bank.code).sort((a,b)=>b.date.localeCompare(a.date));
    const tagged=txns.reduce((s,t)=>{
      if(!t.moneySourceId)return s;
      if(t.debitCode===bank.code)return s+t.amount; // incoming = debit
      return s-t.amount; // outgoing = credit
    },0);
    return{code:bank.code,name:bank.name,txns,tagged};
  }),[bankAccounts,transactions]);
  const activeBankData=perBank.find(b=>b.code===(activeBank&&activeBank.code))||perBank[0]||{code:"",name:"",txns:[],tagged:0};
  const filteredTxns=useMemo(()=>{
    let txns=activeBankData.txns;
    if(periodMode==="month")txns=txns.filter(t=>t.date>=pFrom&&t.date<=pTo);
    if(tagFilter==="untagged")txns=txns.filter(t=>!t.moneySourceId);
    else if(tagFilter!=="all")txns=txns.filter(t=>t.moneySourceId===tagFilter);
    return txns;
  },[activeBankData,periodMode,pFrom,pTo,tagFilter]);

  const totalsFor=(id)=>{
    const src=moneySources.find(m=>m.id===id);
    if(!src)return{received:0,used:0,remaining:0};
    const tagged=bankTxns.filter(t=>t.moneySourceId===id);
    const taggedReceived=tagged.filter(t=>bankCodes.has(t.debitCode)).reduce((s,t)=>s+t.amount,0);
    const taggedUsed=tagged.filter(t=>bankCodes.has(t.creditCode)).reduce((s,t)=>s+t.amount,0);
    const received=(src.openingReceived||0)+taggedReceived;
    const used=(src.openingUsed||0)+taggedUsed;
    return{received,used,remaining:received-used};
  };

  // Who has what in THIS specific bank — unlike totalsFor above (which sums
  // a source across every bank), this scopes the tagged received/used to
  // just the selected bank's own transactions, so each bank shows its own
  // per-person overview instead of one blended total.
  const perSourceForBank=(bankCode)=>{
    const txns=bankTxns.filter(t=>t.moneySourceId&&(t.debitCode===bankCode||t.creditCode===bankCode));
    return activeSourcesList.map(m=>{
      const mine=txns.filter(t=>t.moneySourceId===m.id);
      const received=mine.filter(t=>t.debitCode===bankCode).reduce((s,t)=>s+t.amount,0);
      const used=mine.filter(t=>t.creditCode===bankCode).reduce((s,t)=>s+t.amount,0);
      // Manual per-bank corrections entered from the app (bankAdjustments) —
      // read here too so a source's remaining matches across both platforms
      // instead of the desktop total silently ignoring an app-side fix.
      const adj=(m.bankAdjustments&&m.bankAdjustments[bankCode])||{received:0,used:0};
      const remaining=received-used+(adj.received||0)-(adj.used||0);
      return{id:m.id,name:m.name,received,used,remaining};
    }).filter(s=>s.received||s.used);
  };

  // Reconciliation footer for the left column: does every person's remaining
  // plus the untagged remainder actually add up to the bank's real booked
  // balance?
  // A non-zero difference means either an inactive source is still holding
  // tagged transactions (excluded from the visible person list above) or a
  // manual adjustment was entered — both worth surfacing, not hiding.
  const bankReconciliation=(bankCode,bookedBalance,taggedNet)=>{
    const sources=perSourceForBank(bankCode);
    // Overview sum is just the persons added together (each one's own
    // received minus used) — e.g. +50,000 and -20,000 nets to +30,000.
    // Unassigned is shown separately as context, not folded into the sum,
    // so Difference always answers "balance minus what people actually hold."
    const overviewSum=sources.reduce((s,x)=>s+x.remaining,0);
    const unassigned=bookedBalance-taggedNet;
    return{sources,unassigned,overviewSum,difference:bookedBalance-overviewSum};
  };

  const resetForm=()=>{setForm({name:"",openingReceived:"",openingUsed:""});setEditingId(null);};
  const addSource=()=>{
    if(!form.name.trim())return;
    const id="ms_"+Date.now();
    saveMoneySources([...moneySources,{id,name:form.name.trim(),openingReceived:parseFloat(form.openingReceived)||0,openingUsed:parseFloat(form.openingUsed)||0,inactive:false}]);
    resetForm();setShowAdd(false);
  };
  const startEdit=(m)=>{setEditingId(m.id);setForm({name:m.name,openingReceived:String(m.openingReceived||0),openingUsed:String(m.openingUsed||0)});setShowAdd(true);};
  // Jumps straight to editing a source's opening balances from the bank
  // overview list, instead of making you find it again inside Manage sources.
  const editSourceById=(id)=>{
    const m=moneySources.find(x=>x.id===id);
    if(!m)return;
    startEdit(m);
    setShowManage(true);
  };
  const saveEditSrc=()=>{
    if(!form.name.trim())return;
    saveMoneySources(moneySources.map(m=>m.id===editingId?{...m,name:form.name.trim(),openingReceived:parseFloat(form.openingReceived)||0,openingUsed:parseFloat(form.openingUsed)||0}:m));
    resetForm();setShowAdd(false);
  };
  const removeSource=(id)=>{
    if(bankTxns.some(t=>t.moneySourceId===id)){alert("This source has tagged transactions — untag them first before deleting.");return;}
    if(!window.confirm("Delete this money source?"))return;
    saveMoneySources(moneySources.filter(m=>m.id!==id));
  };
  // Settling records that a deficit was covered from your own funds (e.g.
  // the next salary) by raising this source's "received" baseline — no
  // real bank transaction needed for what is really just a bookkeeping fix.
  const settleDeficit=(id)=>{
    const t=totalsFor(id);
    if(t.remaining>=0)return;
    const input=window.prompt(`Settle how much for this source? (owed: ${fmt(Math.abs(t.remaining))})`,String(Math.abs(t.remaining)));
    const amt=parseFloat(input);
    if(!amt||amt<=0)return;
    saveMoneySources(moneySources.map(m=>m.id===id?{...m,openingReceived:(m.openingReceived||0)+amt}:m));
  };

  const grandRemaining=moneySources.reduce((s,m)=>s+totalsFor(m.id).remaining,0);
  const deficitCount=moneySources.filter(m=>!m.inactive&&totalsFor(m.id).remaining<0).length;

  return(
    <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:16,marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:13,fontWeight:800,color:T.text}}>💰 Whose</div>
        <button style={{...btnSm,fontSize:11,padding:"5px 10px"}} onClick={()=>setShowManage(true)}>⚙ Manage sources</button>
      </div>
      {deficitCount>0&&(
        <div style={{background:"#FEF2F2",border:`1px solid #F5C6C6`,borderRadius:8,padding:"8px 11px",marginBottom:12,fontSize:11,color:T.red,fontWeight:600}}>
          {deficitCount} source{deficitCount===1?"":"s"} overspent — use "Manage sources" above to settle from your next salary.
        </div>
      )}

      {!bankAccounts.length&&<div style={{textAlign:"center",padding:"18px 0",color:T.muted,fontSize:11}}>No bank accounts found.</div>}

      {bankAccounts.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,alignItems:"start"}}>
          {/* Left: pick a bank, see its balance + who has what in it */}
          <div style={{border:`1px solid ${T.border}`,borderRadius:10,padding:13}}>
            <select value={activeBank?activeBank.code:""} onChange={e=>setSelectedBank(e.target.value)} style={{...inp,fontSize:12,padding:"7px 9px",marginBottom:10,fontWeight:700}}>
              {bankAccounts.map(b=><option key={b.code} value={b.code}>{b.code} {b.name}</option>)}
            </select>
            {activeBank&&(<>
              <div onClick={()=>onOpenLedger&&onOpenLedger(activeBank,yearStart,today)} style={{cursor:onOpenLedger?"pointer":"default",background:T.waterTealSubtle,borderRadius:9,padding:"11px 13px",marginBottom:10,position:"relative"}}>
                <div style={{fontSize:10,color:T.sub,marginBottom:3}}>Booked balance</div>
                <div style={{fontSize:17,fontWeight:800,color:T.text}}>{fmt(getBal(activeBank.code))}</div>
                {(()=>{
                  const details=bankDetailsFor?bankDetailsFor(activeBank):null;
                  return details&&(details.branch||details.accountNumber)?<div style={{fontSize:10,color:T.sub,marginTop:3}}>{details.branch}{details.branch&&details.accountNumber?" · ":""}{details.accountNumber}</div>:null;
                })()}
                {onEditBankAccount&&<button onClick={e=>{e.stopPropagation();onEditBankAccount(activeBank.code);}} style={{position:"absolute",top:8,right:8,background:"rgba(255,255,255,0.7)",border:"none",borderRadius:6,padding:"3px 7px",fontSize:9.5,fontWeight:700,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Edit</button>}
              </div>
              <div style={{fontSize:10,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:0.4,marginBottom:6}}>Who's in this bank</div>
              {(()=>{
                const bookedBalance=getBal(activeBank.code);
                const rec=bankReconciliation(activeBank.code,bookedBalance,activeBankData.tagged);
                return(<>
                  {!rec.sources.length?<div style={{fontSize:11,color:T.muted,padding:"6px 0"}}>Nothing tagged here yet.</div>:(
                    <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:360,overflowY:"auto",paddingRight:2}}>
                      {rec.sources.map(s=>(
                        <div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11.5,padding:"5px 0",borderBottom:`1px solid ${T.border}`}}>
                          <span style={{color:T.text,fontWeight:600}}>{s.name}</span>
                          <span style={{display:"flex",alignItems:"center",gap:8}}>
                            <span style={{fontWeight:700,color:s.remaining<0?T.red:T.sub}}>{fmt(s.remaining)}</span>
                            <span onClick={()=>editSourceById(s.id)} title="Edit balance" style={{cursor:"pointer",fontSize:11,opacity:0.7}}>✏️</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Reconciliation footer — proves (or disproves) that every
                      person's remaining plus whatever's still untagged really
                      does add up to the bank's actual booked balance. */}
                  <div style={{marginTop:10,paddingTop:8,borderTop:`1px solid ${T.border}`,display:"flex",flexDirection:"column",gap:4}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                      <span style={{color:T.muted}}>Unassigned</span>
                      <span style={{fontWeight:600,color:T.sub}}>{fmt(rec.unassigned)}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                      <span style={{color:T.muted}}>Overview sum</span>
                      <span style={{fontWeight:700,color:T.text}}>{fmt(rec.overviewSum)}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                      <span style={{color:T.muted}}>Difference</span>
                      <span style={{fontWeight:700,color:Math.abs(rec.difference)>0.5?T.red:T.green}}>{fmt(rec.difference)}</span>
                    </div>
                  </div>
                </>);
              })()}
            </>)}
          </div>

          {/* Right: this bank's transactions, filterable + taggable inline */}
          <div style={{border:`1px solid ${T.border}`,borderRadius:10,padding:13}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:11,color:T.muted}}>Incoming = debit, outgoing = credit.</div>
              <div style={{fontSize:11,fontWeight:700,color:activeBankData.tagged<0?T.red:T.sub}}>{fmt(activeBankData.tagged)} tagged</div>
            </div>

            <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:6,marginBottom:10}}>
              <select value={tagFilter} onChange={e=>setTagFilter(e.target.value)} style={{...inp,fontSize:11,padding:"5px 8px",width:"auto"}}>
                <option value="all">All transactions</option>
                <option value="untagged">Untagged only</option>
                {activeSourcesList.map(m=><option key={m.id} value={m.id}>{m.name} only</option>)}
              </select>
              <button onClick={()=>setPeriodMode("all")} style={{background:periodMode==="all"?T.accent:"none",color:periodMode==="all"?"#fff":T.sub,border:`1px solid ${periodMode==="all"?T.accent:T.border}`,borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>All time</button>
              {periodMode==="all"?(
                <button onClick={()=>setPeriodMode("month")} style={{background:"none",color:T.sub,border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>By month</button>
              ):(
                <div style={{display:"flex",alignItems:"center",gap:4,background:T.accentLight||T.bg,border:`1px solid ${T.accent}`,borderRadius:8,padding:"3px 6px"}}>
                  <button onClick={()=>stepPMonth(-1)} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:T.accent,padding:"0 4px"}}>‹</button>
                  <span style={{fontSize:11,fontWeight:700,color:T.accent,minWidth:92,textAlign:"center"}}>{pLabel}</span>
                  <button onClick={()=>stepPMonth(1)} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:T.accent,padding:"0 4px"}}>›</button>
                  <button onClick={()=>setPeriodMode("all")} style={{background:"none",border:"none",cursor:"pointer",fontSize:11,color:T.sub,padding:"0 4px"}}>✕</button>
                </div>
              )}
            </div>

            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",fontSize:11,borderCollapse:"collapse",minWidth:400}}>
                <thead><tr style={{background:T.bg,color:T.sub}}>
                  <td style={{padding:"5px 8px",fontWeight:700}}>Date</td>
                  <td style={{fontWeight:700}}>Description</td>
                  <td style={{textAlign:"right",fontWeight:700}}>Amount</td>
                  <td style={{fontWeight:700,padding:"5px 8px"}}>Source</td>
                </tr></thead>
                <tbody>
                  {filteredTxns.slice(0,60).map(t=>{
                    const isIn=t.debitCode===activeBankData.code;
                    return(
                      <tr key={t.id} style={{borderBottom:`1px solid ${T.border}`}}>
                        <td style={{padding:"5px 8px",color:T.sub,whiteSpace:"nowrap"}}>{t.date}</td>
                        <td style={{color:T.text,maxWidth:170,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</td>
                        <td style={{textAlign:"right",fontWeight:700,color:isIn?T.green:T.red,whiteSpace:"nowrap"}}>{isIn?"+":"−"}{fmt(t.amount)}</td>
                        <td style={{padding:"5px 8px"}}>
                          <select value={t.moneySourceId||""} onChange={e=>tagTransaction(t.id,e.target.value||null)} style={{...inp,padding:"4px 7px",fontSize:11}}>
                            <option value="">— untagged —</option>
                            {activeSourcesList.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                  {!filteredTxns.length&&<tr><td colSpan="4" style={{padding:"12px 0",textAlign:"center",color:T.muted}}>No transactions match this filter.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showManage&&(
        <div onClick={()=>{setShowManage(false);setShowAdd(false);resetForm();}} style={{position:"fixed",inset:0,background:"rgba(15,23,32,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:560,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.28)",padding:20}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:15,fontWeight:800,color:T.text}}>Manage sources</div>
              <button onClick={()=>{setShowManage(false);setShowAdd(false);resetForm();}} style={{background:"none",border:"none",color:T.muted,fontSize:20,cursor:"pointer"}}>✕</button>
            </div>

            {moneySources.map(m=>{
              const t=totalsFor(m.id);
              return(
                <div key={m.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${T.border}`}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:T.text}}>{m.name}</div>
                    <div style={{fontSize:11,color:t.remaining<0?T.red:T.muted}}>{fmt(t.remaining)} remaining</div>
                  </div>
                  <div style={{whiteSpace:"nowrap"}}>
                    {t.remaining<0&&<span onClick={()=>settleDeficit(m.id)} title="Settle from next salary" style={{cursor:"pointer",marginRight:10}}>💵</span>}
                    <span onClick={()=>startEdit(m)} title="Edit" style={{cursor:"pointer",marginRight:10}}>✏️</span>
                    <span onClick={()=>removeSource(m.id)} title="Delete" style={{cursor:"pointer"}}>🗑</span>
                  </div>
                </div>
              );
            })}
            {!moneySources.length&&<div style={{textAlign:"center",padding:"18px 0",color:T.muted,fontSize:12}}>No money sources yet.</div>}

            {showAdd?(
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr auto",gap:8,marginTop:14,alignItems:"end"}}>
                <div><div style={{fontSize:10,color:T.sub,marginBottom:3,fontWeight:600}}>Name</div><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Salary — Company X" style={inp}/></div>
                <div><div style={{fontSize:10,color:T.sub,marginBottom:3,fontWeight:600}}>Received (starting)</div><input type="number" inputMode="decimal" value={form.openingReceived} onChange={e=>setForm(f=>({...f,openingReceived:e.target.value}))} style={inp}/></div>
                <div><div style={{fontSize:10,color:T.sub,marginBottom:3,fontWeight:600}}>Used (starting)</div><input type="number" inputMode="decimal" value={form.openingUsed} onChange={e=>setForm(f=>({...f,openingUsed:e.target.value}))} style={inp}/></div>
                <button style={{...btnGhost,width:"auto",padding:"10px 16px"}} onClick={editingId?saveEditSrc:addSource}>{editingId?"Save":"Add"}</button>
              </div>
            ):(
              <button style={{...btnSm,marginTop:14}} onClick={()=>setShowAdd(true)}>+ Add source</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BankModule({accounts,transactions,onOpenLedger,filterFrom,filterTo,attachments,onAttach,moneySources,saveMoneySources,tagTransaction}){
  const[viewing,setViewing]=useState(null);
  const[extractedText,setExtractedText]=useState("");
  const[extracting,setExtracting]=useState(false);
  const banks=accounts.filter(a=>getSK(a.code)==="1900");

  const getBal=(code,beforeDate)=>transactions
    .filter(t=>!beforeDate||t.date<beforeDate)
    .reduce((s,t)=>{if(t.debitCode===code)return s+t.amount;if(t.creditCode===code)return s-t.amount;return s;},0);

  const getMovement=(code,f,t)=>transactions
    .filter(tx=>tx.date>=f&&tx.date<=t)
    .reduce((s,tx)=>{if(tx.debitCode===code)return s+tx.amount;if(tx.creditCode===code)return s-tx.amount;return s;},0);

  const periodKey=(code)=>`${code}_${filterFrom.slice(0,7)}`;

  const handleAttach=(code,file)=>{
    const reader=new FileReader();
    reader.onload=e=>onAttach(periodKey(code),{name:file.name,data:e.target.result,type:file.type,period:filterFrom.slice(0,7),code});
    reader.readAsDataURL(file);
  };

  return(
    <div>
      {viewing&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,display:"flex",flexDirection:"column"}}>
          <div style={{padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(0,0,0,0.5)"}}>
            <div style={{fontSize:13,color:"#fff",fontWeight:600}}>{viewing.name}</div>
            <button onClick={()=>setViewing(null)} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,color:"#fff",fontSize:14,cursor:"pointer",padding:"6px 14px",fontWeight:600}}>✕ Close</button>
          </div>
          {viewing.type&&viewing.type.startsWith("image")
            ?<img src={viewing.data} style={{flex:1,objectFit:"contain",padding:10,minHeight:0}}/>
            :<iframe src={viewing.data} style={{flex:1,border:"none",background:"#fff"}}/>
          }
          {viewing.type&&viewing.type.startsWith("image")&&(
            <div style={{padding:"10px 16px",background:"rgba(0,0,0,0.5)",flexShrink:0}}>
              {extractedText==="NO_KEY"?(
                <div style={{background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:8,padding:10,fontSize:11,color:"#92400E"}}>
                  Add your Anthropic API key in <b>Company → Settings</b> to enable text extraction — it's stored only in this browser.
                </div>
              ):extractedText?(
                <div style={{background:"#fff",border:"1px solid #E8ECF0",borderRadius:8,padding:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <div style={{fontSize:10,color:"#9CA3AF",fontWeight:700,textTransform:"uppercase"}}>Extracted text</div>
                    <button onClick={()=>navigator.clipboard&&navigator.clipboard.writeText(extractedText)} style={{background:"none",border:"none",color:T.accent,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:0}}>Copy</button>
                  </div>
                  <textarea readOnly value={extractedText} onClick={e=>e.target.select()} style={{width:"100%",minHeight:80,maxHeight:160,fontSize:12,fontFamily:"inherit",border:"none",background:"transparent",resize:"vertical",color:"#111827"}}/>
                </div>
              ):(
                <button onClick={async()=>{
                  setExtracting(true);
                  const[header,base64]=(viewing.data||"").split(",");
                  const mediaType=(header.match(/data:(.*);base64/)||[])[1]||"image/jpeg";
                  const{data,error}=await callClaudeAPI({
                    model:"claude-sonnet-4-6",max_tokens:1500,
                    messages:[{role:"user",content:[
                      {type:"image",source:{type:"base64",media_type:mediaType,data:base64}},
                      {type:"text",text:"Transcribe every piece of text visible in this image exactly as it appears, preserving line breaks. Return only the transcribed text, nothing else — no commentary."},
                    ]}],
                  });
                  if(error==="NO_KEY")setExtractedText("NO_KEY");
                  else if(error)setExtractedText("Couldn't read text from this image: "+error);
                  else setExtractedText((data.content.map(b=>b.text||"").join("")).trim()||"No text found in this image.");
                  setExtracting(false);
                }} disabled={extracting} style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,color:"#fff",cursor:extracting?"wait":"pointer",fontFamily:"inherit"}}>{extracting?"Reading text…":"📋 Extract text from image"}</button>
              )}
            </div>
          )}
        </div>
      )}
      {banks.map(a=>{
        const opening=getBal(a.code,filterFrom);
        const movement=getMovement(a.code,filterFrom,filterTo);
        const closing=opening+movement;
        const attKey=`${a.code}_${filterFrom.slice(0,7)}`;
        const att=attachments[attKey];
        return(
          <div key={a.code} style={{background:T.card,borderRadius:14,border:`1px solid ${T.border}`,marginBottom:12,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
            <div style={{background:"linear-gradient(135deg,#1A3A6E,#0057B8)",padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:10,color:"rgba(255,255,255,0.6)",fontWeight:700,letterSpacing:1,marginBottom:2}}>{a.code}</div>
                <div style={{fontSize:16,fontWeight:800,color:"#fff"}}>{a.name}</div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <label style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,color:"#fff",fontSize:11,cursor:"pointer",padding:"5px 10px",fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
                  📎 {att?"Replace":"Attach"}
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{display:"none"}} onChange={e=>{if(e.target.files[0])handleAttach(a.code,e.target.files[0]);}}/>
                </label>
                {att&&<button onClick={()=>{setViewing(att);setExtractedText("");}} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,color:"#fff",fontSize:11,cursor:"pointer",padding:"5px 10px",fontWeight:600}}>👁 View</button>}
                <button style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,color:"#fff",fontSize:11,fontWeight:600,cursor:"pointer",padding:"5px 10px"}} onClick={()=>onOpenLedger(a)}>Ledger ›</button>
              </div>
            </div>
            {att&&<div style={{padding:"6px 16px",background:"rgba(0,87,184,0.06)",fontSize:11,color:T.blue,fontWeight:600}}>📎 {att.name}</div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr"}}>
              {[{label:"Opening",val:opening,color:T.sub},{label:"Movement",val:movement,color:movement>=0?T.green:T.red},{label:"Closing",val:closing,color:closing>=0?T.green:T.red}].map((col,i)=>(
                <div key={i} style={{padding:"12px 10px",textAlign:"center",borderRight:i<2?`1px solid ${T.border}`:"none"}}>
                  <div style={{fontSize:9,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>{col.label}</div>
                  <div style={{fontSize:13,fontWeight:800,color:col.color}}>{sign(col.val)}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {!banks.length&&<div style={{textAlign:"center",color:T.muted,padding:30,fontSize:13}}>No bank accounts found. Add accounts in the 1900s series.</div>}
    </div>
  );
}

// ─── Reskontro Screen ─────────────────────────────────────────────────────────

function ReskontroScreen({contacts,setContacts,transactions,matchTxns,unmatchTxns,editTxn,deleteTxn,accounts,onBack,initialView=null,fetchTxnAttachments,uploadInboxFile,attachFilesToTxnEntry,inboxFiles=[],auditLog,profiles,currentUserId,moneySources,tagTransaction,fetchEntryComments,addEntryComment}){
  const[view,setView]=useState(initialView); // null | "customer" | "supplier"
  const[mode,setMode]=useState("open"); // open | period | contact
  const[asOfDate,setAsOfDate]=useState(""); // optional date for open items
  const[periodFrom,setPeriodFrom]=useState(()=>`${new Date().getFullYear()}-01-01`);
  const[periodTo,setPeriodTo]=useState(new Date().toISOString().split("T")[0]);
  const[selContact,setSelContact]=useState("all"); // "all" or contact id — used in contact mode
  const[filterContact,setFilterContact]=useState("all"); // "all" or contact id — used in open/period modes
  const[contactSearch,setContactSearch]=useState("");
  const[selected,setSelected]=useState([]);
  const[detailTxn,setDetailTxn]=useState(null);
  const[reskontroTab,setReskontroTab]=useState("contacts");
  const[bilagPopup,setBilagPopup]=useState(null); // {txn} — must be at top level, not inside if(view)
  const asOfRef=React.useRef(null);
  const periodFromRef=React.useRef(null);

  const customers=contacts.filter(c=>c.type==="customer"&&!c.inactive);
  const suppliers=contacts.filter(c=>c.type==="supplier"&&!c.inactive);

  // Bucket-matched, not exact-code — see the inBucket fix below; a
  // transaction posted to a sibling account (e.g. 1510) must still count
  // toward the 1500 series total instead of silently contributing 0.
  const mv=(t,code)=>getSK(t.debitCode)===code?t.amount:getSK(t.creditCode)===code?-t.amount:0;
  const doMatchTxns=(ids,grpId,accountCode)=>matchTxns(ids,grpId,accountCode);
  const doUnmatchGroup=(grpId)=>{if(unmatchTxns)unmatchTxns(grpId);};

  const goBack=()=>{setView(null);setSelected([]);setDetailTxn(null);setMode("open");setSelContact("all");setFilterContact("all");setContactSearch("");};

  const toggleInactive=(id)=>setContacts(contacts.map(c=>c.id===id?{...c,inactive:!c.inactive}:c));

  // ── Ledger view (after selecting AR or AP) ──
  if(view){
    const list=view==="customer"?customers:suppliers;
    const isCustomer=view==="customer";
    // "code" is the series bucket, not one literal account — a manual entry
    // posted to a sibling account in the same range (e.g. 1510 Trade
    // Receivables instead of 1500 Accounts Receivable) must still count as
    // AR/AP here, same fix as ReskontroDesktopScreen in reports.jsx.
    const code=isCustomer?"1500":"2400";
    const inBucket=c=>getSK(c)===code;
    const accentColor=isCustomer?T.blue:T.red;
    const accentBg=isCustomer?T.blueBg:T.redLight;
    const contactDatalistId=`reskontro-contact-filter-${view}`;
    const contactFilterLabel=filterContact==="all"?"":((list.find(c=>c.id===filterContact)||{}).name||"");
    const setContactFilterFromText=(value)=>{
      setContactSearch(value);
      const v=value.trim().toLowerCase();
      if(!v||v==="all"){setFilterContact("all");return;}
      const match=list.find(c=>c.id.toLowerCase()===v||c.name.toLowerCase()===v||(`${c.id} — ${c.name}`).toLowerCase()===v||(`${c.id} - ${c.name}`).toLowerCase()===v);
      if(match)setFilterContact(match.id);
    };

    // Filter transactions based on mode
    const getViewTxns=(contactId)=>{
      return transactions.filter(t=>{
        const c=contacts.find(x=>x.id===t.contactId);
        if(!c||c.type!==view||c.inactive)return false;
        if(contactId&&contactId!=="all"&&t.contactId!==contactId)return false;
        if(!(inBucket(t.debitCode)||inBucket(t.creditCode)))return false;
        if(mode==="open"){
          if(filterContact!=="all"&&t.contactId!==filterContact)return false;
          if((t.matchedWith&&t.matchedAccount===code)||t.reversedBy||t.reversalOf)return false;
          if(asOfDate&&t.date>asOfDate)return false;
        } else if(mode==="period"){
          if(filterContact!=="all"&&t.contactId!==filterContact)return false;
          if(t.date<periodFrom||t.date>periodTo)return false;
        }
        return true;
      }).sort((a,b)=>{
        const ca=contacts.find(x=>x.id===a.contactId);
        const cb=contacts.find(x=>x.id===b.contactId);
        const na=(ca?ca.id:undefined)||"";const nb=(cb?cb.id:undefined)||"";
        if(na!==nb)return na.localeCompare(nb);
        return a.date.localeCompare(b.date);
      });
    };

    const viewTxns=getViewTxns(null);
    const grandTotal=viewTxns.reduce((s,t)=>s+mv(t,code),0);

    // Group by contact for sub-totals
    const byContact=[];
    let lastCid=null;
    viewTxns.forEach(t=>{
      const c=contacts.find(x=>x.id===t.contactId);
      if(!c)return;
      if(c.id!==lastCid){byContact.push({contact:c,txns:[]});lastCid=c.id;}
      byContact[byContact.length-1].txns.push(t);
    });

    // ALL modes allow checkbox selection (period now included)
    const canSelect=true;
    // Check if the current ledger account (1500/2400) is matchable
    const isAccMatchable=(t)=>{
      const ledgerAcc=accounts.find(a=>a.code===code);
      return ledgerAcc&&ledgerAcc.matchable;
    };
    const toggleSel=id=>{
      const t=viewTxns.find(x=>x.id===id);
      if(!t||(t.matchedWith&&t.matchedAccount===code))return;
      setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
    };
    const selSum=selected.reduce((s,id)=>{const t=viewTxns.find(x=>x.id===id);return t?s+mv(t,code):s;},0);
    const doMatch=()=>{if(selected.length<2||Math.abs(selSum)>=1)return;doMatchTxns(selected,Date.now().toString(),code);setSelected([]);};

    // Build a map: matchedWith group → bilags in that group (across ALL transactions)
    const matchGroupMap={}; // groupId -> [{bilag, id}]
    transactions.forEach(t=>{
      if(t.matchedWith){
        if(!matchGroupMap[t.matchedWith])matchGroupMap[t.matchedWith]=[];
        matchGroupMap[t.matchedWith].push({bilag:t.bilag,id:t.id});
      }
    });

    // Bilag click: matched → small action popup (View / Unmatch); unmatched → open detail
    const handleBilagClick=(e,t,isMatched)=>{
      e.stopPropagation();
      if(isMatched){
        setBilagPopup(p=>p&&p.txn.id===t.id?null:{txn:t});
      } else {
        setDetailTxn(t);
      }
    };

    // COL: ☑/✓ | Bilag | Date | Description | Amount
    const ROW_COLS="22px 52px 60px 1fr 82px";
    const hdStyle={fontSize:9,color:"#111827",fontWeight:800,textTransform:"uppercase",letterSpacing:0};

    return(
      <div style={{background:T.bg,minHeight:"100vh",fontFamily:"system-ui,sans-serif",maxWidth:430,margin:"0 auto"}}>
        {detailTxn&&<DetailModal txn={detailTxn} accounts={accounts} contacts={contacts}
          fetchTxnAttachments={fetchTxnAttachments} uploadInboxFile={uploadInboxFile} attachFilesToTxnEntry={attachFilesToTxnEntry} inboxFiles={inboxFiles} fetchEntryComments={fetchEntryComments} addEntryComment={addEntryComment}
          auditLog={auditLog} profiles={profiles} currentUserId={currentUserId} moneySources={moneySources} tagTransaction={tagTransaction}
          onEdit={u=>{editTxn(u);setDetailTxn(null);}}
          onDelete={id=>{deleteTxn(id);setDetailTxn(null);}}
          onReverse={()=>{}} onClose={()=>setDetailTxn(null)}/>}

        {/* Header */}
        <div style={{background:T.header,padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}>
          <button onClick={goBack} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:10,color:"#fff",fontSize:20,cursor:"pointer",width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>‹</button>
          <div style={{flex:1}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontWeight:700,letterSpacing:1.5,textTransform:"uppercase"}}>{`RESKONTRO · ${isCustomer?"1500":"2400"}`}</div>
            <div style={{fontSize:18,fontWeight:800,color:"#fff"}}>{isCustomer?"Customers (AR)":"Suppliers (AP)"}</div>
          </div>
        </div>

        {/* ── Tabs row + small download icon ── */}
        <div style={{display:"flex",padding:"0 16px",alignItems:"center",background:"#fff",borderBottom:`1px solid ${T.border}`}}>
          {[["open","Open items"],["period","Period"]].map(([id,label])=>(
            <button key={id} onClick={()=>setMode(id)} style={{flex:1,padding:"10px 0",border:"none",background:"none",fontSize:12,fontWeight:500,color:mode===id?accentColor:T.muted,borderBottom:mode===id?`2px solid ${accentColor}`:"2px solid transparent",cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>
              {label}
            </button>
          ))}
          <button title="Export PDF" onClick={()=>{
            const modeLabel=mode==="open"?`Open Items${asOfDate?" — As of "+asOfDate:" (All time)"}`:mode==="period"?`Period: ${periodFrom} → ${periodTo}`:`${isCustomer?"Customer":"Supplier"} View`;
            const contactLabel=(mode==="open"||mode==="period")&&filterContact!=="all"?(" — "+(list.find(c=>c.id===filterContact)||{name:filterContact}).name):"";
            const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${isCustomer?"Accounts Receivable":"Accounts Payable"} Report</title><style>
              *{box-sizing:border-box;}
              body{font-family:Arial,sans-serif;font-size:12px;color:#1e293b;margin:30px;}
              h1{font-size:17px;font-weight:bold;margin:0 0 4px;}
              .sub{font-size:11px;color:#64748b;margin:0 0 24px;}
              .contact-name{font-size:14px;font-weight:bold;margin:20px 0 2px;padding:8px 12px;background:#f8fafc;border-left:4px solid ${accentColor};color:${accentColor};}
              .contact-id{font-size:10px;color:#94a3b8;margin-bottom:6px;padding-left:12px;}
              table{width:100%;border-collapse:collapse;margin-bottom:4px;}
              th{font-size:10px;font-weight:bold;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0;padding:6px 8px;text-align:left;}
              td{padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:11px;}
              .subtotal td{font-weight:bold;background:#f8fafc;color:${accentColor};border-top:1.5px solid #e2e8f0;}
              .grand{margin-top:16px;text-align:right;font-size:14px;font-weight:bold;padding:10px 12px;background:#f0f9ff;border-radius:6px;}
              .pos{color:#16a34a;} .neg{color:#dc2626;}
              .matched{color:#16a34a;font-size:10px;}
              .footer{margin-top:24px;font-size:9px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px;}
              .btn-bar{display:flex;gap:10px;margin-top:24px;}
              @media print{body{margin:10px;} .btn-bar{display:none;}}
            </style></head><body>
            <h1>${isCustomer?"Accounts Receivable (AR)":"Accounts Payable (AP)"}</h1>
            <div class="sub">${modeLabel}${contactLabel} &nbsp;·&nbsp; Generated: ${new Date().toLocaleDateString()}</div>
            ${byContact.map(({contact:c,txns:ctxns})=>{
              const sub=ctxns.reduce((s,t)=>s+mv(t,code),0);
              return`<div class="contact-name">${c.name}</div>
              <div class="contact-id">${c.type==="customer"?"Customer":"Supplier"} · ${c.id}</div>
              <table><thead><tr><th>Ref No</th><th>Date</th><th>Description</th><th style="text-align:right">Amount (PKR)</th></tr></thead><tbody>
              ${ctxns.map(t=>{
                const m=mv(t,code);
                const dp=t.date.split("-");
                const dl=dp.length===3?`${dp[2]}.${dp[1]}.${dp[0].slice(2)}`:t.date;
                const matched=!!t.matchedWith&&!t.reversedBy&&!t.reversalOf;
                return`<tr><td>${fmtB(t.bilag)}${matched?` <span class="matched">✓</span>`:""}</td><td>${dl}</td><td>${t.description||""}</td><td style="text-align:right" class="${m>=0?"pos":"neg"}">${m>=0?"+":"−"}${fmt(Math.abs(m))}</td></tr>`;
              }).join("")}
              <tr class="subtotal"><td colspan="3" style="text-align:right">Total — ${c.name}</td><td style="text-align:right" class="${sub>=0?"pos":"neg"}">${sub>=0?"+":"−"}${fmt(Math.abs(sub))}</td></tr>
              </tbody></table>`;
            }).join("")}
            <div class="grand ${grandTotal>=0?"pos":"neg"}">Grand Total: ${grandTotal>=0?"+":"−"}${fmt(Math.abs(grandTotal))}</div>
            <div class="footer">Redrock Ledger Accountants &nbsp;·&nbsp; ${isCustomer?"Accounts Receivable":"Accounts Payable"} Report &nbsp;·&nbsp; ${new Date().toISOString().slice(0,10)}</div>
            <div class="btn-bar">
              <button onclick="window.print()" style="padding:8px 18px;background:#1A1A2E;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">🖨 Print / Save as PDF</button>
              <button onclick="window.close()" style="padding:8px 18px;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer;font-size:13px;">← Close</button>
            </div>
            <script>window.onload=function(){window.print();};</script>
            </body></html>`;
            openHtmlInNewTab(html,"width=750,height=900");
          }} style={{flexShrink:0,background:"none",border:"none",color:accentColor,fontSize:15,cursor:"pointer",width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center"}}>
            ⬇
          </button>
        </div>

        {/* ── Filter bar (Concept 3 — toolbar strip) ── */}
        <div style={{background:"#fff",borderBottom:`1px solid ${T.border}`}}>
          {/* Toolbar strip — light gray boxes for period (with calendar icon) and contact filter */}
          <div style={{display:"flex",alignItems:"stretch",background:"#F1EFE8",margin:"0 16px 10px",borderRadius:8,border:`1px solid ${T.border}`,overflow:"hidden"}}>
            <div style={{flex:2,padding:"7px 10px",borderRight:`1px solid ${T.border}`,minWidth:0,position:"relative",display:"flex",alignItems:"flex-end",gap:6}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:8,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,marginBottom:2}}>Period</div>
                {mode==="open"?(
                  <>
                    <input ref={asOfRef} type="date" value={asOfDate} onChange={e=>setAsOfDate(e.target.value)}
                      style={{border:"none",background:"none",fontSize:11,fontWeight:600,color:T.text,padding:0,outline:"none",fontFamily:"inherit",width:asOfDate?"88%":"100%"}}/>
                    {asOfDate&&(
                      <button onClick={()=>setAsOfDate("")} style={{position:"absolute",right:32,top:24,background:"none",border:"none",color:T.muted,fontSize:14,cursor:"pointer",padding:0,lineHeight:1}}>×</button>
                    )}
                  </>
                ):(
                  <div style={{display:"flex",alignItems:"center",gap:3}}>
                    <input ref={periodFromRef} type="date" value={periodFrom} onChange={e=>setPeriodFrom(e.target.value)}
                      style={{border:"none",background:"none",fontSize:10,fontWeight:600,color:T.text,padding:0,outline:"none",fontFamily:"inherit",width:"46%"}}/>
                    <span style={{fontSize:9,color:T.muted,flexShrink:0}}>→</span>
                    <input type="date" value={periodTo} onChange={e=>setPeriodTo(e.target.value)}
                      style={{border:"none",background:"none",fontSize:10,fontWeight:600,color:T.text,padding:0,outline:"none",fontFamily:"inherit",width:"46%"}}/>
                  </div>
                )}
              </div>
              <button onClick={()=>{const ref=mode==="open"?asOfRef:periodFromRef;if(ref.current){if(ref.current.showPicker)ref.current.showPicker();else ref.current.focus();}}}
                style={{flexShrink:0,background:"none",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:accentColor,fontSize:15,padding:0,lineHeight:1}} title="Open date picker" aria-label="Open date picker">
                🗓
              </button>
            </div>
            <div style={{flex:1.4,padding:"7px 10px",position:"relative",minWidth:0}}>
              <div style={{fontSize:8,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,marginBottom:2}}>{isCustomer?"Customer":"Supplier"}</div>
              <input list={contactDatalistId} value={contactSearch||contactFilterLabel} onChange={e=>setContactFilterFromText(e.target.value)} placeholder="All"
                style={{border:"none",background:"none",fontSize:11,fontWeight:600,color:T.text,padding:0,outline:"none",fontFamily:"inherit",width:"100%"}}/>
              <datalist id={contactDatalistId}>
                <option value="All"/>
                {list.map(c=><option key={c.id} value={`${c.id} — ${c.name}`}/>)}
              </datalist>
              {filterContact!=="all"&&(
                <button onClick={()=>{setFilterContact("all");setContactSearch("");}} style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:T.muted,fontSize:14,cursor:"pointer",padding:0,lineHeight:1}}>×</button>
              )}
            </div>
          </div>
        </div>

        {/* ── Match bar — always visible when items selected ── */}
        {selected.length>0&&(
          <div style={{background:"#0F2744",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                <div style={{width:20,height:20,borderRadius:4,background:accentColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,color:"#fff",flexShrink:0}}>{selected.length}</div>
                <span style={{fontSize:11,color:"rgba(255,255,255,0.7)"}}>selected</span>
                <span style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>·</span>
                <span style={{fontSize:11,fontWeight:700,color:Math.abs(selSum)<1?"#4ade80":"#f87171"}}>Net {sign(selSum)}</span>
              </div>
              <div style={{fontSize:10,color:Math.abs(selSum)<1?"#4ade80":"rgba(255,255,255,0.45)",fontWeight:600}}>
                {Math.abs(selSum)<1?"✓ Balances to zero — ready to match":"Entries must net to zero to match"}
              </div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setSelected([])} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:8,color:"rgba(255,255,255,0.7)",fontSize:11,cursor:"pointer",padding:"6px 12px",fontWeight:600,fontFamily:"inherit"}}>Clear</button>
              <button onClick={doMatch} disabled={Math.abs(selSum)>=1||selected.length<2}
                style={{background:Math.abs(selSum)<1&&selected.length>=2?T.green:"#374151",border:"none",borderRadius:8,color:"#fff",fontSize:11,cursor:Math.abs(selSum)<1&&selected.length>=2?"pointer":"not-allowed",padding:"6px 14px",fontWeight:700,fontFamily:"inherit",opacity:Math.abs(selSum)<1&&selected.length>=2?1:0.45,transition:"all 0.15s"}}>
                Match ✓
              </button>
            </div>
          </div>
        )}

        <div style={{padding:"12px 16px"}}>
          {/* ── Match hint banner — unmatched entries only ── */}
          {viewTxns.filter(t=>!t.matchedWith).length>1&&selected.length===0&&(
            <div style={{background:"#F0F9FF",border:"1px solid #BAE6FD",borderRadius:9,padding:"7px 12px",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:14}}>☑️</span>
              <span style={{fontSize:11,color:"#0369A1",fontWeight:600}}>Tap unmatched rows to select · green ✓ = already matched · only accounts with Match enabled can be selected</span>
            </div>
          )}

          {/* ── Column header ── */}
          {viewTxns.length>0&&(
            <div style={{display:"grid",gridTemplateColumns:ROW_COLS,gap:4,padding:"7px 8px",alignItems:"center",background:"#EEF4F3",border:`1px solid ${T.border}`,borderBottom:"none",borderRadius:"8px 8px 0 0"}}>
              {/* Checkbox placeholder */}
              <div/>
              <div style={hdStyle}>Bilag</div>
              <div style={hdStyle}>Date</div>
              <div style={hdStyle}>Description</div>
              <div style={{...hdStyle,textAlign:"right"}}>Amount</div>
            </div>
          )}

          {viewTxns.length===0&&(
            <div style={{textAlign:"center",color:T.muted,padding:"40px 0",fontSize:13}}>
              <div style={{fontSize:28,marginBottom:8}}>📭</div>
              No entries found
            </div>
          )}

          {/* ── Grouped by contact with sub-totals ── */}
          {byContact.map(({contact:c,txns:ctxns})=>{
            const subTotal=ctxns.reduce((s,t)=>s+mv(t,code),0);
            const incomingBalance=transactions.filter(t=>t.contactId===c.id&&(inBucket(t.debitCode)||inBucket(t.creditCode))&&t.date<periodFrom&&!t.reversedBy&&!t.reversalOf).reduce((s,t)=>s+mv(t,code),0);
            const outgoingBalance=incomingBalance+subTotal;
            const contactSummaryRows=mode==="period"
              ?[
                {label:"Balance this Period",value:subTotal},
                {label:"Incoming Balance",value:incomingBalance},
                {label:"Outgoing Balance",value:outgoingBalance}
              ]
              :[{label:"Sum",value:subTotal}];
            return(
              <div key={c.id} style={{marginBottom:14}}>
                {/* Contact header row */}
                <div style={{display:"flex",alignItems:"center",gap:8,padding:"9px 10px",background:"#EEF4F3",borderRadius:"8px 8px 0 0",border:`1px solid ${T.border}`,borderBottom:"none"}}>
                  <span style={{fontSize:10,fontWeight:800,color:"#0369A1",minWidth:36}}>{c.id}</span>
                  <span style={{fontSize:12,fontWeight:800,color:"#0369A1",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</span>
                </div>

                {/* Transactions */}
                <div style={{background:"#fff",border:`1px solid ${T.border}`,borderTop:"none",borderRadius:"0 0 8px 8px",overflow:"hidden"}}>
                  {ctxns.map((t,i)=>{
                    const m=mv(t,code);
                    const isSel=selected.includes(t.id);
                    const isRev=!!t.reversalOf;
                    const isRevd=!!t.reversedBy;
                    const isGhosted=isRevd||isRev;
                    const isMatched=!!t.matchedWith&&t.matchedAccount===code&&!isRevd&&!isRev;
                    // Format date as DD.MM.YY
                    const dateParts=t.date.split("-");
                    const dateLabel=dateParts.length===3?`${dateParts[2]}.${dateParts[1]}.${dateParts[0].slice(2)}`:t.date;
                    // Partners in the same match group
                    const matchPartners=(matchGroupMap[t.matchedWith]||[]).filter(x=>x.id!==t.id);
                    const isBilagPopupOpen=bilagPopup&&bilagPopup.txn.id===t.id;
                    const canMatchRow=!isGhosted&&isAccMatchable(t);
                    return(
                      <div key={t.id} className="rr-reskontro-row"
                        style={{display:"grid",gridTemplateColumns:ROW_COLS,gap:4,padding:"9px 8px",
                          borderBottom:`1px solid ${T.border}`,
                          alignItems:"center",
                          background:"#fff",
                          opacity:isGhosted?0.45:1,
                          borderLeft:isMatched?`3px solid ${T.green}`:isSel?`3px solid ${accentColor}`:"3px solid transparent",
                          transition:"background 0.1s,border-color 0.1s",
                          position:"relative"}}>

                        {/* ── Checkbox or match indicator — ONLY this toggles selection ── */}
                        <div onClick={()=>{if(!isMatched&&!isGhosted)toggleSel(t.id);}} style={{display:"flex",alignItems:"center",justifyContent:"center",cursor:isMatched||isGhosted?"default":"pointer"}}>
                          {isMatched?(
                            /* Green checkmark — matched, not selectable */
                            <div style={{width:16,height:16,borderRadius:"50%",background:T.green,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                              <span style={{color:"#fff",fontSize:9,fontWeight:900,lineHeight:1}}>✓</span>
                            </div>
                          ):(
                            /* Normal checkbox — blue when selected, grey outline when not */
                            <div style={{
                              width:16,height:16,borderRadius:4,
                              border:`2px solid ${isSel?accentColor:"#c0c0c0"}`,
                              background:isSel?accentColor:"#fff",
                              display:"flex",alignItems:"center",justifyContent:"center",
                              flexShrink:0,transition:"all 0.12s"
                            }}>
                              {isSel&&<span style={{color:"#fff",fontSize:10,fontWeight:900,lineHeight:1}}>✓</span>}
                            </div>
                          )}
                        </div>

                        {/* ── Bilag badge — matched: action popup; unmatched: opens entry detail ── */}
                        <div style={{position:"relative"}}>
                          <div onClick={e=>handleBilagClick(e,t,isMatched)} style={{cursor:"pointer",display:"inline-block"}}>
                            <span style={{
                              fontSize:9,fontWeight:800,
                              color:T.blue,
                              background:"transparent",
                              borderRadius:0,padding:0,
                              display:"inline-block",letterSpacing:0.2,
                              border:"none"
                            }}>
                              {fmtB(t.bilag)}
                              {isMatched&&<span style={{marginLeft:3,fontSize:8}}>✓</span>}
                            </span>
                          </div>
                          {/* Action popup — ONLY for matched bilags */}
                          {isBilagPopupOpen&&isMatched&&(
                            <>
                              <div onClick={e=>{e.stopPropagation();setBilagPopup(null);}} style={{position:"fixed",inset:0,zIndex:398}}/>
                              <div style={{position:"absolute",top:24,left:0,background:"#fff",border:`1.5px solid ${T.green}`,borderRadius:10,zIndex:399,minWidth:160,boxShadow:"0 8px 24px rgba(0,0,0,0.15)",overflow:"hidden"}}>
                                <div style={{fontSize:10,fontWeight:800,color:T.green,padding:"8px 12px 6px",textTransform:"uppercase",letterSpacing:0.5,borderBottom:`1px solid ${T.border}`}}>✓ {fmtB(t.bilag)} — Matched</div>
                                <button onClick={e=>{e.stopPropagation();setBilagPopup(null);setDetailTxn(t);}} style={{display:"block",width:"100%",background:"none",border:"none",borderBottom:`1px solid ${T.border}`,padding:"10px 14px",fontSize:12,fontWeight:600,color:T.text,cursor:"pointer",textAlign:"left",fontFamily:"inherit"}}>👁 View Entry</button>
                                <button onClick={e=>{e.stopPropagation();doUnmatchGroup(t.matchedWith);setBilagPopup(null);}} style={{display:"block",width:"100%",background:"none",border:"none",padding:"10px 14px",fontSize:12,fontWeight:600,color:"#DC2626",cursor:"pointer",textAlign:"left",fontFamily:"inherit"}}>✕ Unmatch Entry</button>
                              </div>
                            </>
                          )}
                        </div>

                        {/* ── Date DD.MM.YY ── */}
                        <div onClick={e=>e.stopPropagation()} style={{fontSize:10,color:"#111827",fontVariantNumeric:"tabular-nums",letterSpacing:0.1}}>
                          {dateLabel}
                        </div>

                        {/* ── Description — touch does nothing ── */}
                        <div onClick={e=>e.stopPropagation()} style={{fontSize:11,color:isGhosted?T.muted:"#111827",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontStyle:isRev?"italic":"normal"}}>
                          {t.description}
                          {isRevd&&<span style={{fontSize:9,color:T.muted,marginLeft:4}}>↩ reversed</span>}
                        </div>

                        {/* ── Amount ── */}
                        <div onClick={e=>e.stopPropagation()} style={{fontSize:12,fontWeight:800,textAlign:"right",color:"#111827",whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums"}}>
                          {m>=0?"+":"−"}{fmt(Math.abs(m))}
                        </div>
                      </div>
                    );
                  })}

                  {contactSummaryRows.map((row,idx)=>(
                    <div key={row.label} style={{display:"flex",justifyContent:"space-between",gap:12,padding:"9px 10px",background:"#fff",borderBottom:idx<contactSummaryRows.length-1?`1px solid ${T.border}`:"none"}}>
                      <div style={{fontSize:12,color:"#111827",fontWeight:800}}>{row.label}</div>
                      <div style={{fontSize:12,fontWeight:900,textAlign:"right",color:"#111827",whiteSpace:"nowrap"}}>{sign(row.value)}</div>
                    </div>
                  ))}
                  <div style={{height:18,background:"#fff",borderTop:`1px solid ${T.border}`}}/>
                </div>
              </div>
            );
          })}

          {/* ── Grand total ── */}
          {byContact.length>0&&(
            <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:8,padding:"12px 10px",display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
              <div style={{fontSize:13,color:"#111827",fontWeight:900}}>Total</div>
              <div style={{fontSize:14,fontWeight:900,color:"#111827"}}>{sign(grandTotal)}</div>
            </div>
          )}
        </div>

      </div>
    );
  }

  // ── Reskontro home ──
  const today=new Date().toISOString().split("T")[0];
  const agingBuckets=(contactType)=>{
    const code=contactType==="customer"?"1500":"2400";
    const inBucket=cc=>getSK(cc)===code;
    return contacts.filter(c=>c.type===contactType&&!c.inactive).map(c=>{
      const txns=transactions.filter(t=>t.contactId===c.id&&(inBucket(t.debitCode)||inBucket(t.creditCode)));
      const bal=txns.reduce((s,t)=>inBucket(t.debitCode)?s+t.amount:s-t.amount,0);
      if(Math.abs(bal)<1)return null;
      const unmatched=txns.filter(t=>!(t.matchedWith&&t.matchedAccount===code)).sort((a,b)=>a.date.localeCompare(b.date));
      const oldest=(unmatched[0]?unmatched[0].date:undefined)||today;
      const days=Math.floor((new Date(today)-new Date(oldest))/(1000*60*60*24));
      return{id:c.id,name:c.name,bal,days};
    }).filter(Boolean).sort((a,b)=>b.days-a.days);
  };

  return(
    <div style={{background:T.bg,minHeight:"100vh",fontFamily:"system-ui,sans-serif",maxWidth:430,margin:"0 auto"}}>
      <BackHeader title="Reskontro" sub="AR / AP LEDGER" onBack={onBack}/>
      <div style={{display:"flex",gap:4,padding:"10px 16px 0",background:"#fff",borderBottom:`1px solid ${T.border}`}}>
        {[["contacts","Contacts"],["aging","Aging Report"]].map(([id,label])=>(
          <button key={id} onClick={()=>setReskontroTab(id)} style={{padding:"7px 14px",border:"none",background:"none",fontSize:12,fontWeight:reskontroTab===id?700:500,color:reskontroTab===id?T.accent:T.muted,borderBottom:reskontroTab===id?`2px solid ${T.accent}`:"2px solid transparent",cursor:"pointer",fontFamily:"inherit",marginBottom:-1}}>{label}</button>
        ))}
      </div>
      <div style={{padding:16}}>
        {reskontroTab==="contacts"&&(
          <>
            <SL>Select Type</SL>
            {[
              {type:"customer",label:"Customers",sub:"Accounts Receivable · always posts to 1500",icon:"📥",color:T.accent,bg:T.accentLight,count:customers.length,code:"1500"},
              {type:"supplier",label:"Suppliers",sub:"Accounts Payable · always posts to 2400",icon:"📤",color:T.red,bg:T.redLight,count:suppliers.length,code:"2400"}
            ].map(item=>{
              const bal=transactions.reduce((s,t)=>{if(t.debitCode===item.code)return s+t.amount;if(t.creditCode===item.code)return s-t.amount;return s;},0);
              return(
              <div key={item.type}>
                <div onClick={()=>setView(item.type)} style={{background:T.card,borderRadius:14,border:`1px solid ${T.border}`,padding:"18px 16px",marginBottom:6,cursor:"pointer",display:"flex",alignItems:"center",gap:14,boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
                  <div style={{background:item.bg,borderRadius:12,width:48,height:48,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>{item.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,fontWeight:700}}>{item.label}</div>
                    <div style={{fontSize:11,color:T.sub,marginTop:2}}>{item.sub}</div>
                    <div style={{fontSize:11,color:item.color,fontWeight:600,marginTop:4}}>{item.count} active contacts</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:9,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,marginBottom:3}}>Balance</div>
                    <div style={{fontSize:15,fontWeight:800,color:item.color}}>{fmt(Math.abs(bal))}</div>
                  </div>
                </div>
                {contacts.filter(c=>c.type===item.type&&c.inactive).map(c=>(
                  <div key={c.id} style={{background:"#f9f9f9",borderRadius:10,border:`1px solid ${T.border}`,padding:"10px 14px",marginBottom:6,marginLeft:8,display:"flex",alignItems:"center",gap:10,opacity:0.6}}>
                    <span style={{fontSize:10,fontWeight:800,color:T.muted,background:T.border,padding:"2px 7px",borderRadius:5}}>{c.id}</span>
                    <span style={{fontSize:12,color:T.muted,flex:1,textDecoration:"line-through"}}>{c.name}</span>
                    <span style={{fontSize:9,fontWeight:800,color:T.muted,background:T.border,borderRadius:5,padding:"2px 6px"}}>INACTIVE</span>
                    <button onClick={()=>toggleInactive(c.id)} style={{fontSize:10,background:T.accentLight,color:T.accent,border:"none",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>Reactivate</button>
                  </div>
                ))}
              </div>
              );
            })}
          </>
        )}
        {reskontroTab==="aging"&&(
          <div>
            {[{type:"customer",label:"Receivables (AR)",color:T.accent},{type:"supplier",label:"Payables (AP)",color:T.red}].map(({type,label,color})=>{
              const rows=agingBuckets(type);
              return(
                <div key={type} style={{marginBottom:20}}>
                  <SL>{label}</SL>
                  {rows.length?(
                    rows.map(r=>{
                      const bucket=r.days<=30?"0-30d":r.days<=60?"31-60d":r.days<=90?"61-90d":"90d+";
                      const bucketColor=r.days<=30?T.green:r.days<=60?T.orange:T.red;
                      return(
                        <div key={r.id} style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,padding:"11px 14px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <div>
                            <div style={{fontSize:13,fontWeight:600,color:T.text}}>{r.name}</div>
                            <div style={{fontSize:10,color:T.muted,marginTop:2}}>{r.days} days outstanding</div>
                          </div>
                          <div style={{textAlign:"right"}}>
                            <div style={{fontSize:13,fontWeight:800,color}}>{fmt(r.bal)}</div>
                            <span style={{fontSize:9,fontWeight:700,color:bucketColor,background:r.days<=30?T.greenBg:r.days<=60?T.orangeBg:T.redLight,borderRadius:5,padding:"1px 6px"}}>{bucket}</span>
                          </div>
                        </div>
                      );
                    })
                  ):<div style={{textAlign:"center",color:T.muted,padding:20,fontSize:13}}>No outstanding {label}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Account Plan & Settings ──────────────────────────────────────────────────


export { SaveFlashButton, SL, Card, Pill, BilagText, BilagPill, BackHeader, AccDrop, AccDropFlat, Menu3, ContactSearch, EditModal, MatchDetailModal, ChangeLogModal, CommentsModal, DetailModal, TxnCard, MatchedGroups, LedgerScreen, MoneySourcesPanel, BankModule, ReskontroScreen, isFeatureOn, getAdminFeatures, getUserFeatures, setUserFeature, isDateClosed, getPeriodClose, isBankReconApproved, setBankReconApproved, getBankReconApprovals, hasBudgetMoved, markBudgetMoved, getBudgetMoves, sign, fmtBal, selSm, getBugs, saveBugsRaw, logBug, getGroupLinesMap, appendGroupLine, getGroupForTxn, ADMIN_KEY, USER_FEATS_KEY, signRs, FlexDateInput, NewContactModal, VatDrop };
