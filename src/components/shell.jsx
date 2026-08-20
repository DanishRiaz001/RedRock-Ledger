import React, { useState, useEffect } from "react";
import { T } from "../lib/theme.js";
import { callClaudeAPI } from "../lib/utils.js";
import { sb, SUPPORT_EMAIL } from "../lib/supabaseClient.js";
import { getSignedUrl } from "../lib/storage.js";
import { ADMIN_FEATURES, PACKAGE_TIERS } from "./settings2.jsx";
import { LOGO_B64, LOGO_FULL_B64 } from "../lib/logo.js";

function Spinner(){return <div style={{textAlign:"center",padding:60,color:"#9CA3AF",fontSize:14}}>Loading…</div>;}
// Files now live in Supabase Storage, not as inline base64 — this resolves a
// storage_path to a short-lived signed URL on demand and renders the file,
// so nothing needs to prefetch/store URLs that would just expire anyway.
function SignedFileViewer({storagePath,type,name,style}){
  const[url,setUrl]=useState(null);
  const[loading,setLoading]=useState(true);
  const[extractedText,setExtractedText]=useState("");
  const[extracting,setExtracting]=useState(false);
  const[zoom,setZoom]=useState(1);
  const[pan,setPan]=useState({x:0,y:0});
  const[rotation,setRotation]=useState(0);
  const dragRef=React.useRef(null);
  const wheelZoneRef=React.useRef(null);
  useEffect(()=>{
    let alive=true;
    setLoading(true);
    setExtractedText("");
    setZoom(1);setPan({x:0,y:0});setRotation(0);
    getSignedUrl(storagePath).then(u=>{if(alive){setUrl(u);setLoading(false);}});
    return()=>{alive=false;};
  },[storagePath]);
  const isImage=type&&type.startsWith("image");
  const extractText=async()=>{
    if(!url)return;
    setExtracting(true);
    try{
      const imgResp=await fetch(url);
      const blob=await imgResp.blob();
      const base64=await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(reader.result.split(",")[1]);
        reader.onerror=reject;
        reader.readAsDataURL(blob);
      });
      const{data,error}=await callClaudeAPI({
        model:"claude-sonnet-4-6",max_tokens:1500,
        messages:[{role:"user",content:[
          {type:"image",source:{type:"base64",media_type:blob.type||"image/jpeg",data:base64}},
          {type:"text",text:"Transcribe every piece of text visible in this image exactly as it appears, preserving line breaks. Return only the transcribed text, nothing else — no commentary."},
        ]}],
      });
      if(error==="NO_KEY"){setExtractedText("NO_KEY");setExtracting(false);return;}
      if(error){setExtractedText("Couldn't read text from this image: "+error);setExtracting(false);return;}
      const text=data.content.map(b=>b.text||"").join("");
      setExtractedText(text.trim()||"No text found in this image.");
    }catch(e){setExtractedText("Couldn't read text from this image.");}
    setExtracting(false);
  };
  const startDrag=(e)=>{
    if(zoom<=1)return;
    const startX=e.clientX,startY=e.clientY;
    const startPan={...pan};
    dragRef.current={startX,startY,startPan};
    const onMove=(ev)=>{
      if(!dragRef.current)return;
      setPan({x:startPan.x+(ev.clientX-startX),y:startPan.y+(ev.clientY-startY)});
    };
    const onUp=()=>{dragRef.current=null;window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
  };
  // Scroll wheel zoom — zooms toward wherever the cursor is, not just the
  // center, so it feels like a real image viewer rather than a fixed-point zoom.
  const onWheel=(e)=>{
    e.preventDefault();
    const delta=e.deltaY>0?-0.15:0.15;
    setZoom(z=>Math.max(1,Math.min(4,z+delta)));
  };
  // React's JSX onWheel is registered as a passive listener in some browser/
  // version combinations, which silently makes e.preventDefault() above do
  // nothing — the page (or whole browser) ends up scrolling/zooming right
  // along with the image. A real, non-passive listener attached directly
  // guarantees the browser actually honors preventDefault, keeping the zoom
  // contained to just the image.
  useEffect(()=>{
    const el=wheelZoneRef.current;
    if(!el||!isImage)return;
    const handler=ev=>onWheel(ev);
    el.addEventListener("wheel",handler,{passive:false});
    return()=>el.removeEventListener("wheel",handler);
  },[isImage]);
  const downloadFile=async()=>{
    if(!url)return;
    const a=document.createElement("a");
    a.href=url;a.download=name||"attachment";a.target="_blank";
    document.body.appendChild(a);a.click();a.remove();
  };
  const printFile=()=>{
    if(!url)return;
    const iframe=document.createElement("iframe");
    iframe.style.cssText="position:fixed;right:0;bottom:0;width:0;height:0;border:none;";
    iframe.src=url;
    document.body.appendChild(iframe);
    iframe.onload=()=>{
      try{iframe.contentWindow.print();}catch(e){}
      setTimeout(()=>{if(iframe.parentNode)iframe.parentNode.removeChild(iframe);},1000);
    };
  };
  if(loading)return<div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:120,color:"#9CA3AF",fontSize:12,...style}}>Loading {name||"file"}…</div>;
  if(!url)return<div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:120,color:"#EF4444",fontSize:12,...style}}>Couldn't load {name||"file"}.</div>;

  const toolbarBtn={width:28,height:28,border:"none",background:"none",cursor:"pointer",color:"#D1D5DB",borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center"};
  const Toolbar=()=>(
    <div style={{display:"flex",alignItems:"center",gap:2,background:"#1F2937",padding:"6px 10px",borderRadius:"8px 8px 0 0",flexShrink:0}}>
      {isImage&&(<>
        <button onClick={()=>setZoom(z=>Math.max(1,z-0.25))} title="Zoom out" style={toolbarBtn}><i className="ti ti-zoom-out" style={{fontSize:15}}/></button>
        <span onClick={()=>{setZoom(1);setPan({x:0,y:0});setRotation(0);}} title="Reset zoom (scroll to zoom too)" style={{fontSize:11,color:"#D1D5DB",padding:"0 6px",fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>{Math.round(zoom*100)}%</span>
        <button onClick={()=>setZoom(z=>Math.min(4,z+0.25))} title="Zoom in" style={toolbarBtn}><i className="ti ti-zoom-in" style={{fontSize:15}}/></button>
        <div style={{width:1,height:16,background:"#374151",margin:"0 4px"}}/>
        <button onClick={()=>setRotation(r=>r-90)} title="Rotate" style={toolbarBtn}><i className="ti ti-rotate-2" style={{fontSize:15}}/></button>
      </>)}
      <div style={{flex:1,fontSize:11,color:"#9CA3AF",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",padding:"0 8px"}}>{name}</div>
      <button onClick={printFile} title="Print" style={toolbarBtn}><i className="ti ti-printer" style={{fontSize:15}}/></button>
      <button onClick={downloadFile} title="Download" style={toolbarBtn}><i className="ti ti-download" style={{fontSize:15}}/></button>
    </div>
  );

  if(!isImage)return(
    <div style={{...style,padding:0,display:"flex",flexDirection:"column"}}>
      <Toolbar/>
      <iframe src={url} style={{border:"none",background:"#fff",width:"100%",flex:1}} title={name||"attachment"}/>
    </div>
  );
  return(
    <div style={{...style,padding:0,display:"flex",flexDirection:"column"}}>
      <Toolbar/>
      <div ref={wheelZoneRef} style={{position:"relative",overflow:"hidden",background:"#fafafa",flex:1}}>
        <div onMouseDown={startDrag} style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",cursor:zoom>1?"grab":"default",overflow:"hidden"}}>
          <img src={url} draggable={false} alt={name||"attachment"} style={{maxWidth:"100%",maxHeight:"100%",transform:`translate(${pan.x}px,${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,transformOrigin:"center center",transition:dragRef.current?"none":"transform .15s ease",userSelect:"none"}}/>
        </div>
      </div>
      {extractedText==="NO_KEY"?(
        <div style={{marginTop:8,background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:8,padding:10,flexShrink:0,fontSize:11,color:"#92400E"}}>
          Add your Anthropic API key in <b>Company → Settings</b> to enable text extraction — it's stored only in this browser.
        </div>
      ):extractedText?(
        <div style={{marginTop:8,background:"#F7F8FA",border:"1px solid #E8ECF0",borderRadius:8,padding:10,flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <div style={{fontSize:10,color:"#9CA3AF",fontWeight:700,textTransform:"uppercase"}}>Extracted text</div>
            <button onClick={()=>navigator.clipboard&&navigator.clipboard.writeText(extractedText)} style={{background:"none",border:"none",color:"#FF5A1F",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:0}}>Copy</button>
          </div>
          <textarea readOnly value={extractedText} onClick={e=>e.target.select()} style={{width:"100%",minHeight:80,fontSize:12,fontFamily:"inherit",border:"none",background:"transparent",resize:"vertical",color:"#111827"}}/>
        </div>
      ):(
        <button onClick={extractText} disabled={extracting} style={{marginTop:8,background:"none",border:"1px solid #E8ECF0",borderRadius:8,padding:"7px 12px",fontSize:11,fontWeight:600,color:"#FF5A1F",cursor:extracting?"wait":"pointer",fontFamily:"inherit",flexShrink:0}}>{extracting?"Reading text…":"📋 Extract text from image"}</button>
      )}
    </div>
  );
}

// A real resizable split — drag the divider with the mouse to widen either
// side. Used anywhere a form sits next to a document/image preview.
function ResizableSplit({left,right,defaultRightWidth=360,minRightWidth=260,maxRightWidth=640,collapsible=false,collapseLabel="Hide attachment",expandLabel="Show attachment"}){
  const[rightWidth,setRightWidth]=useState(defaultRightWidth);
  const[collapsed,setCollapsed]=useState(false);
  const draggingRef=React.useRef(false);
  const rafRef=React.useRef(null);
  // Past this width, the preview stops squeezing the entry form further and
  // instead floats over it, anchored to the true right edge of the screen —
  // this is what makes dragging the splitter left past the midpoint feel
  // like "make the preview bigger" instead of "crush everything else."
  const overlapAt=Math.round(maxRightWidth*0.72);
  const overlapping=rightWidth>=overlapAt;
  const startDrag=(e)=>{
    e.preventDefault();
    draggingRef.current={startX:e.clientX,startWidth:rightWidth};
    // Mark the body while dragging so preview content (esp. the image's
    // transform transition) doesn't animate — without this the document
    // preview visibly "zooms" as the panel width changes mid-drag.
    document.body.classList.add("rr-panel-resizing");
    const onMove=(ev)=>{
      if(!draggingRef.current)return;
      // Only apply the resize once per animation frame — applying it on
      // every raw mousemove event causes rapid, jittery reflows of the
      // preview content that read as "zooming" rather than a smooth resize.
      if(rafRef.current)cancelAnimationFrame(rafRef.current);
      rafRef.current=requestAnimationFrame(()=>{
        if(!draggingRef.current)return;
        const delta=draggingRef.current.startX-ev.clientX;
        const next=Math.min(maxRightWidth,Math.max(minRightWidth,draggingRef.current.startWidth+delta));
        setRightWidth(next);
      });
    };
    const onUp=()=>{
      draggingRef.current=null;
      if(rafRef.current)cancelAnimationFrame(rafRef.current);
      document.body.classList.remove("rr-panel-resizing");
      window.removeEventListener("mousemove",onMove);
      window.removeEventListener("mouseup",onUp);
    };
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
  };
  const tabStyle={writingMode:"vertical-rl",background:"#EEF2FF",color:"#4F46E5",fontSize:11,fontWeight:700,padding:"14px 6px",borderRadius:"8px 0 0 8px",cursor:"pointer",display:"flex",alignItems:"center",gap:6,flexShrink:0,userSelect:"none",whiteSpace:"nowrap"};
  return(
    <div style={{display:"flex",alignItems:"stretch",gap:0,minWidth:0,position:"relative"}}>
      <div style={{flex:1,minWidth:0}}>{left}</div>
      {collapsible&&collapsed?(
        // Collapsed state sits fixed to the true right screen edge (not just
        // the container edge) and the tab itself is what you click to slide
        // the panel back in — so "hidden" genuinely reads as tucked away at
        // the edge of the screen, not just an inline placeholder.
        <div onClick={()=>setCollapsed(false)} title={expandLabel} style={{...tabStyle,position:"fixed",right:0,top:"50%",transform:"translateY(-50%)",zIndex:60,boxShadow:"-2px 0 8px rgba(0,0,0,0.08)"}}>
          <i className="ti ti-chevron-left" style={{fontSize:12,transform:"rotate(90deg)"}}/>{expandLabel}
        </div>
      ):(<>
        {/* Widened from 8px and given a permanently-visible (not just
            hover) grip strip — it used to be thin and easy to miss
            entirely, which meant a drag attempt often landed on the
            "Hide attachment" tab instead (they used to overlap the same
            few pixels at the seam), instantly collapsing the panel to the
            screen edge instead of resizing it. The tab below is now offset
            clear of this handle's own width so the two can't compete for
            the same click. */}
        <div onMouseDown={startDrag} title="Drag left to enlarge the preview" style={{width:14,alignSelf:"stretch",cursor:"col-resize",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,zIndex:overlapping?61:62,background:"#F5F9FA"}}>
          <div style={{width:4,height:44,borderRadius:2,background:overlapping?"#FF5A1F":"#C9D6D6"}}/>
        </div>
        <div style={overlapping?{
          // Overlap mode: anchored to the actual right edge of the viewport
          // via position:fixed, so it's genuinely screen-edge-aligned no
          // matter what padding the page around it has — and it floats over
          // the entry form rather than continuing to squeeze it.
          position:"fixed",top:60,right:0,bottom:0,width:rightWidth,
          boxShadow:"-8px 0 24px rgba(0,0,0,0.12)",background:"#fff",zIndex:60,
          transition:draggingRef.current?"none":"box-shadow .15s ease",
        }:{width:rightWidth,flexShrink:0,minWidth:minRightWidth,position:"relative"}}>
          {right}
          {collapsible&&(
            <div onClick={()=>setCollapsed(true)} title={collapseLabel} style={{position:"absolute",left:-15,top:70,transform:"translateX(-100%)",background:"#EEF2FF",color:"#4F46E5",fontSize:11,fontWeight:700,padding:"14px 6px",borderRadius:"8px 0 0 8px",cursor:"pointer",writingMode:"vertical-rl",display:"flex",alignItems:"center",gap:6,userSelect:"none",whiteSpace:"nowrap",zIndex:59}}>
              <i className="ti ti-chevron-right" style={{fontSize:12,transform:"rotate(90deg)"}}/>{collapseLabel}
            </div>
          )}
        </div>
      </>)}
    </div>
  );
}

function LoginScreen({onLogin}){
  const[email,setEmail]=useState("");
  const[pass,setPass]=useState("");
  const[mode,setMode]=useState("login");
  const[err,setErr]=useState("");
  const[loading,setLoading]=useState(false);
  const[done,setDone]=useState(false);
  const[publicPage,setPublicPage]=useState(null); // null | "pricing" | "privacy" | "terms" | "status"
  const inp2={background:"#FAF9F7",border:`1px solid ${T.border}`,borderRadius:12,color:T.text,padding:"13px 16px",width:"100%",fontSize:15,outline:"none",boxSizing:"border-box",fontFamily:"inherit"};
  const handle=async()=>{
    setErr("");setLoading(true);
    if(mode==="login"){
      const{data,error}=await sb.auth.signInWithPassword({email,password:pass});
      if(error)setErr(error.message); else onLogin(data.user);
    } else if(mode==="signup"){
      // Explicit emailRedirectTo — this is a real safeguard, not just
      // belt-and-suspenders: without it, Supabase falls back entirely to
      // whatever "Site URL" is configured in the dashboard, and if that's
      // ever wrong (like it currently is, still pointing at a local dev
      // address), every new signup's confirmation email silently sends
      // people to a dead link. window.location.origin is always wherever
      // this page is actually being served from, so it's correct whether
      // that's the live app, a preview deploy, or local development.
      const{error}=await sb.auth.signUp({email,password:pass,options:{emailRedirectTo:window.location.origin}});
      if(error)setErr(error.message); else setDone(true);
    } else {
      const{error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});
      if(error)setErr(error.message); else setDone(true);
    }
    setLoading(false);
  };
  const onKey=e=>{if(e.key==="Enter")handle();};

  if(publicPage)return(
    <div style={{minHeight:"100vh",background:"#FAF9F7",padding:"40px 20px",fontFamily:"system-ui,sans-serif"}}>
      <div style={{maxWidth:publicPage==="pricing"?900:600,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <img src={LOGO_FULL_B64} style={{width:180,objectFit:"contain"}}/>
        </div>
        <button onClick={()=>setPublicPage(null)} style={{background:"none",border:"none",color:T.accent,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginBottom:20}}>← Back to sign in</button>

        {publicPage==="pricing"&&(<>
          <h1 style={{fontSize:28,fontWeight:900,color:"#0F172A",textAlign:"center",marginBottom:8}}>Simple pricing for real bookkeeping</h1>
          <p style={{fontSize:14,color:"#64748B",textAlign:"center",marginBottom:36,maxWidth:520,margin:"0 auto 36px"}}>Double-entry accounting, invoicing, bank reconciliation, and AI-assisted entry — without needing to think like an accountant.</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,marginBottom:32}}>
            {PACKAGE_TIERS.map(tier=>(
              <div key={tier.id} style={{background:"#fff",border:`2px solid ${tier.id==="standard"?tier.color:"#E2E8F0"}`,borderRadius:16,padding:24,position:"relative"}}>
                {tier.id==="standard"&&<div style={{position:"absolute",top:-12,left:"50%",transform:"translateX(-50%)",background:tier.color,color:"#fff",fontSize:10,fontWeight:800,padding:"3px 12px",borderRadius:20}}>MOST POPULAR</div>}
                <div style={{fontSize:16,fontWeight:800,color:"#0F172A",marginBottom:4}}>{tier.label}</div>
                <div style={{fontSize:24,fontWeight:900,color:tier.color,marginBottom:16}}>{tier.price}</div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {ADMIN_FEATURES.filter(f=>tier.features.includes(f.id)).map(f=>(
                    <div key={f.id} style={{fontSize:12,color:"#334155",display:"flex",alignItems:"center",gap:6}}><span style={{color:tier.color}}>✓</span>{f.label}</div>
                  ))}
                  {tier.id!=="complete"&&<div style={{fontSize:11,color:"#94A3B8",marginTop:4}}>+ {ADMIN_FEATURES.length-tier.features.length} more on higher plans</div>}
                </div>
              </div>
            ))}
          </div>
          <p style={{textAlign:"center",fontSize:12,color:"#94A3B8"}}>All plans include double-entry bookkeeping, invoicing, and reports. Contact us to get started.</p>
        </>)}

        {publicPage==="privacy"&&(
          <div style={{background:"#fff",borderRadius:16,padding:28,border:"1px solid #E2E8F0",fontSize:13,color:"#334155",lineHeight:1.7}}>
            <h2 style={{fontSize:18,fontWeight:800,marginBottom:14}}>Privacy Policy</h2>
            <p>Your financial data belongs to you. We store it securely using Supabase (PostgreSQL) with row-level security, meaning your data is isolated from every other account on this platform.</p>
            <p>We do not sell, share, or use your financial data for advertising. Data you enter — transactions, invoices, contacts, company information — is used only to provide the accounting features you're using.</p>
            <p>Uploaded documents (receipts, invoices) are stored in encrypted cloud storage and are only accessible to your account and platform administrators for support purposes.</p>
            <p>You can export a complete copy of your data at any time from Settings → Backup & Restore.</p>
            <p style={{color:"#94A3B8",fontSize:11,marginTop:20}}>This is a working draft — have a lawyer review it before relying on it for real customers.</p>
          </div>
        )}

        {publicPage==="terms"&&(
          <div style={{background:"#fff",borderRadius:16,padding:28,border:"1px solid #E2E8F0",fontSize:13,color:"#334155",lineHeight:1.7}}>
            <h2 style={{fontSize:18,fontWeight:800,marginBottom:14}}>Terms of Service</h2>
            <p>By using this software, you agree to use it for legitimate business accounting purposes. You are responsible for the accuracy of the data you enter.</p>
            <p>This software is provided to assist with bookkeeping; it does not constitute professional accounting, tax, or legal advice. Consult a qualified accountant for advice specific to your business and jurisdiction.</p>
            <p>Accounts may be suspended for abuse, non-payment, or violation of these terms. You may export your data and close your account at any time.</p>
            <p style={{color:"#94A3B8",fontSize:11,marginTop:20}}>This is a working draft — have a lawyer review it before relying on it for real customers.</p>
          </div>
        )}

        {publicPage==="status"&&(
          <div style={{background:"#fff",borderRadius:16,padding:28,border:"1px solid #E2E8F0"}}>
            <h2 style={{fontSize:18,fontWeight:800,marginBottom:16,color:"#334155"}}>System Status</h2>
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",background:"#E6F6F1",borderRadius:10,marginBottom:12}}>
              <span style={{width:10,height:10,borderRadius:"50%",background:T.green,display:"inline-block"}}/>
              <span style={{fontSize:13,fontWeight:700,color:T.green}}>All systems operational</span>
            </div>
            <div style={{fontSize:12,color:"#64748B",lineHeight:1.8}}>
              <div>Application — Operational</div>
              <div>Database — Operational</div>
              <div>File storage — Operational</div>
              <div>AI bookkeeping — Operational</div>
            </div>
            <p style={{fontSize:11,color:"#94A3B8",marginTop:16}}>This is a static status page for now — a real incident history and uptime monitoring would replace this before launch.</p>
          </div>
        )}
      </div>
    </div>
  );

  if(done)return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#FAF9F7",padding:24}}>
      <div style={{textAlign:"center",maxWidth:340}}>
        <img src={LOGO_FULL_B64} style={{width:220,marginBottom:24,objectFit:"contain"}}/>
        <div style={{fontSize:16,fontWeight:800,marginBottom:8,color:"#0F172A"}}>{mode==="signup"?"Check your email":"Reset link sent"}</div>
        <div style={{fontSize:13,color:"#64748B",marginBottom:24,lineHeight:1.6}}>{mode==="signup"?`We sent a confirmation link. Click it, then come back to sign in. This app is invite-only, so an admin still needs to approve your account before you'll see any data — contact ${SUPPORT_EMAIL} if you're in a hurry.`:"Check your email for a reset link."}</div>
        <button style={{background:"linear-gradient(135deg,#FF5A1F,#E04810)",color:"#fff",border:"none",borderRadius:12,padding:"13px",fontWeight:700,fontSize:14,cursor:"pointer",width:"100%",fontFamily:"inherit"}} onClick={()=>{setDone(false);setMode("login");}}>Back to Sign In</button>
      </div>
    </div>
  );

  return(
    <div style={{minHeight:"100vh",background:"#FAF9F7",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{width:"100%",maxWidth:360}}>
        {/* Full logo with name */}
        <div style={{textAlign:"center",marginBottom:24}}>
          <img src={LOGO_FULL_B64} style={{width:240,objectFit:"contain"}}/>
        </div>

        {/* Card */}
        <div style={{background:"#fff",borderRadius:20,padding:"24px 20px",boxShadow:"0 4px 24px rgba(0,0,0,0.08)",border:"1px solid #E2E8F0"}}>
          <div style={{fontSize:13,fontWeight:700,color:"#334155",marginBottom:16,textAlign:"center"}}>
            {{login:"Sign in to your account",signup:"Create a new account",forgot:"Reset your password"}[mode]}
          </div>
          {err&&<div style={{background:"#FFF0F2",border:"1px solid #FFCDD3",borderRadius:10,padding:"10px 14px",fontSize:12,color:T.red,marginBottom:14,fontWeight:600}}>{err}</div>}

          <div style={{marginBottom:12}}>
            <div style={{fontSize:10,fontWeight:700,color:"#64748B",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Email</div>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={onKey} placeholder="you@example.com" style={inp2}/>
          </div>

          {mode!=="forgot"&&(
            <div style={{marginBottom:18}}>
              <div style={{fontSize:10,fontWeight:700,color:"#64748B",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Password</div>
              <input type="password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={onKey} placeholder="••••••••" style={inp2}/>
            </div>
          )}

          <button
            onClick={handle}
            disabled={loading}
            style={{background:"linear-gradient(135deg,#FF5A1F,#E04810)",color:"#fff",border:"none",borderRadius:12,padding:"13px",fontWeight:800,fontSize:14,cursor:"pointer",width:"100%",fontFamily:"inherit",marginBottom:14,opacity:loading?0.7:1}}
          >
            {loading?"...":{login:"Sign In",signup:"Create Account",forgot:"Send Reset Link"}[mode]}
          </button>

          <div style={{display:"flex",flexDirection:"column",gap:8,alignItems:"center"}}>
            {mode==="login"&&(
              <>
                <button onClick={()=>{setMode("signup");setErr("");}} style={{background:"none",border:"none",color:T.accent,fontSize:12,cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>Don't have an account? Sign up</button>
                <button onClick={()=>{setMode("forgot");setErr("");}} style={{background:"none",border:"none",color:"#94A3B8",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Forgot password?</button>
              </>
            )}
            {mode!=="login"&&(
              <button onClick={()=>{setMode("login");setErr("");}} style={{background:"none",border:"none",color:T.accent,fontSize:12,cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>← Back to Sign In</button>
            )}
          </div>
        </div>

        <div style={{textAlign:"center",marginTop:20,fontSize:10,color:"#CBD5E1",letterSpacing:0.5}}>REDROCK DANRIA ACCOUNTANTS · SECURE LOGIN</div>
        <div style={{display:"flex",justifyContent:"center",gap:14,marginTop:14}}>
          {[["pricing","Pricing"],["privacy","Privacy"],["terms","Terms"],["status","Status"]].map(([id,label])=>(
            <button key={id} onClick={()=>setPublicPage(id)} style={{background:"none",border:"none",color:"#94A3B8",fontSize:11,cursor:"pointer",fontFamily:"inherit",textDecoration:"underline"}}>{label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Shown instead of the app when a user has no profile row (never provisioned/approved)
// or has been explicitly deactivated by an admin. RLS already blocks all data access
// for both cases — this screen just explains why, since the app can't do anything else.
function PendingAccessScreen({reason,onSignOut}){
  const isPending=reason==="pending";
  return(
    <div style={{minHeight:"100vh",background:"#FAF9F7",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"system-ui,sans-serif"}}>
      <div style={{width:"100%",maxWidth:360,textAlign:"center"}}>
        <img src={LOGO_FULL_B64} style={{width:220,objectFit:"contain",marginBottom:24}}/>
        <div style={{background:"#fff",borderRadius:20,padding:"28px 22px",boxShadow:"0 4px 24px rgba(0,0,0,0.08)",border:"1px solid #E2E8F0"}}>
          <div style={{fontSize:32,marginBottom:10}}>{isPending?"⏳":"🚫"}</div>
          <div style={{fontSize:15,fontWeight:800,color:"#0F172A",marginBottom:8}}>
            {isPending?"Access pending approval":"Access has been deactivated"}
          </div>
          <div style={{fontSize:13,color:"#64748B",marginBottom:20,lineHeight:1.6}}>
            {isPending
              ?"Your account has been created but hasn't been approved yet. This app is invite-only — an admin needs to activate your access before you can use it."
              :"Your access to this app has been turned off by an admin. If you believe this is a mistake, please get in touch."}
          </div>
          <div style={{background:"#FAF9F7",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#334155",fontWeight:600,marginBottom:20}}>
            Contact {SUPPORT_EMAIL} for access
          </div>
          <button onClick={onSignOut} style={{background:"none",border:"1px solid #E2E8F0",color:"#64748B",borderRadius:12,padding:"11px",fontWeight:700,fontSize:13,cursor:"pointer",width:"100%",fontFamily:"inherit"}}>Sign Out</button>
        </div>
      </div>
    </div>
  );
}





export { Spinner, SignedFileViewer, ResizableSplit, LoginScreen, PendingAccessScreen };
