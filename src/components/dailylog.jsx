import { useState, useEffect, useRef, useCallback } from "react";
import { T } from "../lib/theme.js";
import { sb, getCurrentBooksOwnerId, getCurrentCompanyId } from "../lib/supabaseClient.js";
import { uploadFileToStorage, getSignedUrl } from "../lib/storage.js";

// ============================================================================
// Daily Log — "capture anything from your day" in the fewest taps possible.
//
// Deliberately SELF-CONTAINED: it fetches / uploads / writes its own data
// straight through `sb`, so it can be dropped into the desktop router or the
// mobile app without threading anything through appshell's big load path.
// The files it captures are ordinary `inbox_files` rows (folder "Daily Log"),
// so they also appear in the normal Inbox and can be turned into vouchers
// later. This table (`daily_log_entries`) only ties a note + date to a set of
// those file ids.
//
// Needs sql/add_daily_log.sql run once in Supabase.
// ============================================================================

const isImage=(type,name)=>{
  if(type&&type.startsWith("image/"))return true;
  return /\.(png|jpe?g|gif|webp|heic|heif|bmp|avif)$/i.test(name||"");
};
const humanSize=(b)=>{
  if(b==null)return"";
  if(b<1024)return b+" B";
  if(b<1024*1024)return(b/1024).toFixed(0)+" KB";
  return(b/1024/1024).toFixed(1)+" MB";
};
const fmtDay=(d)=>{
  try{
    const dt=new Date(d+"T00:00:00");
    const today=new Date();today.setHours(0,0,0,0);
    const diff=Math.round((today-dt)/86400000);
    if(diff===0)return"Today";
    if(diff===1)return"Yesterday";
    return dt.toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long",year:dt.getFullYear()!==today.getFullYear()?"numeric":undefined});
  }catch(e){return d;}
};
const todayISO=()=>new Date().toISOString().slice(0,10);

// A tiny image tile that resolves its own signed URL lazily.
function Thumb({file,size=64,onOpen}){
  const[url,setUrl]=useState(null);
  useEffect(()=>{
    let alive=true;
    if(isImage(file.type,file.name)&&file.storagePath){
      getSignedUrl(file.storagePath,3600).then(u=>{if(alive)setUrl(u);});
    }
    return()=>{alive=false;};
  },[file.storagePath]);
  const img=isImage(file.type,file.name);
  return(
    <div onClick={()=>onOpen&&onOpen(file,url)} title={file.name}
      style={{width:size,height:size,borderRadius:10,border:`1px solid ${T.border}`,overflow:"hidden",flexShrink:0,cursor:"pointer",
        background:img?"#000":T.accentLight,display:"flex",alignItems:"center",justifyContent:"center"}}>
      {img&&url
        ? <img src={url} alt={file.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
        : <i className={`ti ${img?"ti-photo":"ti-file-text"}`} style={{fontSize:size*0.34,color:T.accent}}/>}
    </div>
  );
}

export default function DailyLogScreen({onBack,onNavigate}){
  const[entries,setEntries]=useState([]);
  const[loading,setLoading]=useState(true);
  const[err,setErr]=useState("");
  const[search,setSearch]=useState("");

  // pending capture
  const[pending,setPending]=useState([]);        // File[]
  const[note,setNote]=useState("");
  const[day,setDay]=useState(todayISO());
  const[saving,setSaving]=useState(false);
  const[progress,setProgress]=useState("");
  const[dragOver,setDragOver]=useState(false);

  const[lightbox,setLightbox]=useState(null);    // {url,name}
  const fileRef=useRef(null);
  const camRef=useRef(null);

  const load=useCallback(async()=>{
    setLoading(true);setErr("");
    const owner=getCurrentBooksOwnerId();
    const{data,error}=await sb.from("daily_log_entries").select("*").eq("user_id",owner).order("happened_on",{ascending:false}).order("created_at",{ascending:false});
    if(error){setErr(error.message);setLoading(false);return;}
    const rows=data||[];
    const allIds=[...new Set(rows.flatMap(r=>r.file_ids||[]))];
    let filesById={};
    if(allIds.length){
      const{data:fdata}=await sb.from("inbox_files").select("id,name,type,size,storage_path").in("id",allIds);
      (fdata||[]).forEach(f=>{filesById[f.id]={id:f.id,name:f.name,type:f.type,size:f.size,storagePath:f.storage_path};});
    }
    setEntries(rows.map(r=>({...r,files:(r.file_ids||[]).map(id=>filesById[id]).filter(Boolean)})));
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  // paste-to-capture
  useEffect(()=>{
    const onPaste=(e)=>{
      const items=[...(e.clipboardData?.items||[])];
      const imgs=items.filter(it=>it.type.startsWith("image/")).map(it=>it.getAsFile()).filter(Boolean);
      if(imgs.length)setPending(p=>[...p,...imgs]);
    };
    window.addEventListener("paste",onPaste);
    return()=>window.removeEventListener("paste",onPaste);
  },[]);

  const addFiles=(list)=>{
    const arr=[...list].filter(Boolean);
    if(arr.length)setPending(p=>[...p,...arr]);
  };
  const clearPending=()=>{setPending([]);setNote("");setDay(todayISO());setProgress("");};

  const saveCapture=async()=>{
    if(saving)return;
    if(!pending.length&&!note.trim()){return;}
    setSaving(true);setErr("");
    try{
      const owner=getCurrentBooksOwnerId();
      const cid=getCurrentCompanyId();
      const now=new Date();
      const ids=[];
      for(let i=0;i<pending.length;i++){
        const file=pending[i];
        setProgress(`Uploading ${i+1} / ${pending.length}…`);
        const storagePath=await uploadFileToStorage(file);
        const row={user_id:owner,...(cid?{company_id:cid}:{}),storage_path:storagePath,name:file.name||`capture-${Date.now()}.jpg`,type:file.type||"",size:file.size,
          date:day,month:now.toLocaleString("default",{month:"long"}),year:Number(day.slice(0,4))||now.getFullYear(),folder:"Daily Log"};
        const{data,error}=await sb.from("inbox_files").insert([row]).select("id").single();
        if(error)throw error;
        ids.push(data.id);
      }
      setProgress("Saving…");
      const{data:entry,error:eErr}=await sb.from("daily_log_entries").insert([{user_id:owner,...(cid?{company_id:cid}:{}),note:note.trim(),happened_on:day,file_ids:ids}]).select("*").single();
      if(eErr)throw eErr;
      // stitch files locally so it shows instantly
      const{data:fdata}=await sb.from("inbox_files").select("id,name,type,size,storage_path").in("id",ids.length?ids:[-1]);
      const files=(fdata||[]).map(f=>({id:f.id,name:f.name,type:f.type,size:f.size,storagePath:f.storage_path}));
      setEntries(p=>[{...entry,files},...p]);
      clearPending();
    }catch(e){setErr(e.message||String(e));}
    setSaving(false);setProgress("");
  };

  const saveNote=async(id,newNote)=>{
    setEntries(p=>p.map(e=>e.id===id?{...e,note:newNote}:e));
    await sb.from("daily_log_entries").update({note:newNote,updated_at:new Date().toISOString()}).eq("id",id);
  };
  const deleteEntry=async(id)=>{
    if(!window.confirm("Delete this capture? The photos stay in your Inbox."))return;
    setEntries(p=>p.filter(e=>e.id!==id));
    await sb.from("daily_log_entries").delete().eq("id",id);
  };

  const openFile=async(file,maybeUrl)=>{
    if(isImage(file.type,file.name)){
      const url=maybeUrl||await getSignedUrl(file.storagePath,3600);
      if(url)setLightbox({url,name:file.name});
    }else{
      const url=await getSignedUrl(file.storagePath,3600);
      if(url)window.open(url,"_blank","noopener");
    }
  };

  const q=search.trim().toLowerCase();
  const shown=q?entries.filter(e=>(e.note||"").toLowerCase().includes(q)):entries;
  // group by day
  const groups=[];
  shown.forEach(e=>{
    const g=groups.find(x=>x.day===e.happened_on);
    if(g)g.items.push(e);else groups.push({day:e.happened_on,items:[e]});
  });

  const card={background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:18};

  return(
    <div style={{maxWidth:760,margin:"0 auto",padding:"0 4px 60px",fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,margin:"6px 0 16px"}}>
        {onBack&&<button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:T.sub,fontSize:18,padding:4}}><i className="ti ti-arrow-left"/></button>}
        <div>
          <div style={{fontSize:22,fontWeight:800,color:T.text}}>Daily Log</div>
          <div style={{fontSize:12.5,color:T.sub,marginTop:1}}>Snap it, say what it is, done. Everything lands in your Inbox too.</div>
        </div>
      </div>

      {/* ---- capture zone ---- */}
      <div style={card}>
        <div
          onDragOver={e=>{e.preventDefault();setDragOver(true);}}
          onDragLeave={()=>setDragOver(false)}
          onDrop={e=>{e.preventDefault();setDragOver(false);addFiles(e.dataTransfer.files);}}
          style={{border:`2px dashed ${dragOver?T.accent:T.borderActive}`,borderRadius:14,background:dragOver?T.accentLight:T.bg,
            padding:"26px 18px",textAlign:"center",transition:"all .12s"}}>
          <i className="ti ti-camera-plus" style={{fontSize:34,color:T.accent}}/>
          <div style={{fontSize:15,fontWeight:700,color:T.text,marginTop:8}}>Add a photo or any file</div>
          <div style={{fontSize:12,color:T.muted,marginTop:2}}>Drag &amp; drop, paste, or pick — any format, any size, as many as you like</div>
          <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:14,flexWrap:"wrap"}}>
            <button onClick={()=>camRef.current&&camRef.current.click()} style={{background:T.accent,color:"#fff",border:"none",borderRadius:12,padding:"11px 20px",fontWeight:700,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:7}}>
              <i className="ti ti-camera"/> Take photo
            </button>
            <button onClick={()=>fileRef.current&&fileRef.current.click()} style={{background:"#fff",color:T.accent,border:`1.5px solid ${T.accent}`,borderRadius:12,padding:"11px 20px",fontWeight:700,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:7}}>
              <i className="ti ti-paperclip"/> Choose files
            </button>
          </div>
          <input ref={camRef} type="file" accept="image/*" capture="environment" multiple style={{display:"none"}} onChange={e=>{addFiles(e.target.files);e.target.value="";}}/>
          <input ref={fileRef} type="file" multiple style={{display:"none"}} onChange={e=>{addFiles(e.target.files);e.target.value="";}}/>
        </div>

        {(pending.length>0||note)&&(
          <div style={{marginTop:16}}>
            {pending.length>0&&(
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
                {pending.map((f,i)=>(
                  <div key={i} style={{position:"relative"}}>
                    <div style={{width:64,height:64,borderRadius:10,border:`1px solid ${T.border}`,overflow:"hidden",background:isImage(f.type,f.name)?"#000":T.accentLight,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {isImage(f.type,f.name)
                        ? <img src={URL.createObjectURL(f)} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                        : <i className="ti ti-file-text" style={{fontSize:22,color:T.accent}}/>}
                    </div>
                    <div style={{fontSize:9,color:T.muted,maxWidth:64,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{humanSize(f.size)}</div>
                    <button onClick={()=>setPending(p=>p.filter((_,j)=>j!==i))} style={{position:"absolute",top:-6,right:-6,width:18,height:18,borderRadius:9,border:"none",background:T.red,color:"#fff",fontSize:11,cursor:"pointer",lineHeight:1}}>×</button>
                  </div>
                ))}
              </div>
            )}
            <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2}
              placeholder="What is this?  e.g. “Charged the car at Circle K on the way to the client”"
              style={{width:"100%",border:`1px solid ${T.border}`,borderRadius:12,padding:"10px 12px",fontSize:13.5,fontFamily:"inherit",outline:"none",boxSizing:"border-box",resize:"vertical"}}/>
            <div style={{display:"flex",alignItems:"center",gap:10,marginTop:10,flexWrap:"wrap"}}>
              <label style={{fontSize:12,color:T.sub}}>Date</label>
              <input type="date" value={day} onChange={e=>setDay(e.target.value)} style={{border:`1px solid ${T.border}`,borderRadius:10,padding:"7px 10px",fontSize:12.5,fontFamily:"inherit"}}/>
              <div style={{flex:1}}/>
              <button onClick={clearPending} disabled={saving} style={{background:"none",border:"none",color:T.sub,fontSize:12.5,fontWeight:600,cursor:"pointer"}}>Discard</button>
              <button onClick={saveCapture} disabled={saving||(!pending.length&&!note.trim())} style={{background:T.accent,color:"#fff",border:"none",borderRadius:12,padding:"10px 22px",fontWeight:700,fontSize:13,cursor:saving?"default":"pointer",opacity:saving||(!pending.length&&!note.trim())?0.6:1}}>
                {saving?(progress||"Saving…"):"Save capture"}
              </button>
            </div>
          </div>
        )}
      </div>

      {err&&<div style={{background:T.redLight,color:T.red,borderRadius:10,padding:"10px 14px",fontSize:12.5,marginTop:12}}>{err}</div>}

      {/* ---- timeline ---- */}
      <div style={{display:"flex",alignItems:"center",gap:10,margin:"26px 0 12px"}}>
        <div style={{fontSize:15,fontWeight:800,color:T.text}}>History</div>
        <div style={{flex:1}}/>
        {entries.length>0&&(
          <div style={{position:"relative"}}>
            <i className="ti ti-search" style={{position:"absolute",left:10,top:8,fontSize:13,color:T.muted}}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search notes"
              style={{border:`1px solid ${T.border}`,borderRadius:10,padding:"6px 10px 6px 28px",fontSize:12.5,fontFamily:"inherit",outline:"none",width:180}}/>
          </div>
        )}
      </div>

      {loading?(
        <div style={{color:T.muted,fontSize:13,padding:"20px 0"}}>Loading…</div>
      ):groups.length===0?(
        <div style={{...card,textAlign:"center",color:T.muted,fontSize:13,padding:"34px 18px"}}>
          {q?"No captures match that search.":"Nothing yet. Your first capture will show up here."}
        </div>
      ):groups.map(g=>(
        <div key={g.day} style={{marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:800,color:T.sub,textTransform:"uppercase",letterSpacing:0.4,margin:"0 0 8px 2px"}}>{fmtDay(g.day)}</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {g.items.map(e=>(
              <div key={e.id} style={card}>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:e.files.length?10:0}}>
                  {e.files.map(f=>(<Thumb key={f.id} file={f} onOpen={openFile}/>))}
                </div>
                <NoteEditor value={e.note} onSave={v=>saveNote(e.id,v)}/>
                <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8}}>
                  <div style={{fontSize:11,color:T.muted}}>{e.files.length} file{e.files.length===1?"":"s"}</div>
                  <div style={{flex:1}}/>
                  {onNavigate&&<button onClick={()=>onNavigate("Files")} style={{background:"none",border:"none",color:T.accent,fontSize:11.5,fontWeight:700,cursor:"pointer"}}>Open in Inbox</button>}
                  <button onClick={()=>deleteEntry(e.id)} style={{background:"none",border:"none",color:T.muted,fontSize:12,cursor:"pointer"}}><i className="ti ti-trash"/></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {lightbox&&(
        <div onClick={()=>setLightbox(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.86)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <img src={lightbox.url} alt={lightbox.name} style={{maxWidth:"100%",maxHeight:"100%",borderRadius:10}}/>
          <button onClick={()=>setLightbox(null)} style={{position:"absolute",top:20,right:24,background:"rgba(255,255,255,0.15)",color:"#fff",border:"none",borderRadius:20,width:38,height:38,fontSize:18,cursor:"pointer"}}>×</button>
        </div>
      )}
    </div>
  );
}

function NoteEditor({value,onSave}){
  const[editing,setEditing]=useState(false);
  const[v,setV]=useState(value||"");
  useEffect(()=>{setV(value||"");},[value]);
  if(!editing){
    return(
      <div onClick={()=>setEditing(true)} style={{fontSize:13.5,color:value?T.text:T.muted,cursor:"text",lineHeight:1.45,whiteSpace:"pre-wrap"}}>
        {value||"Add a note…"}
      </div>
    );
  }
  return(
    <div>
      <textarea autoFocus value={v} onChange={e=>setV(e.target.value)} rows={2}
        style={{width:"100%",border:`1px solid ${T.borderActive}`,borderRadius:10,padding:"8px 10px",fontSize:13.5,fontFamily:"inherit",outline:"none",boxSizing:"border-box",resize:"vertical"}}/>
      <div style={{display:"flex",gap:8,marginTop:6}}>
        <button onClick={()=>{onSave(v.trim());setEditing(false);}} style={{background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"5px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Save</button>
        <button onClick={()=>{setV(value||"");setEditing(false);}} style={{background:"none",border:"none",color:T.sub,fontSize:12,cursor:"pointer"}}>Cancel</button>
      </div>
    </div>
  );
}
