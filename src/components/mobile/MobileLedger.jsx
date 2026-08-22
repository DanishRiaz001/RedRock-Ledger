import { useState, useMemo, useRef } from "react";
import { T } from "../../lib/theme.js";
import { fmtBal, sign } from "../ledger.jsx";
import { fmtB } from "../../lib/utils.js";
import { SignedFileViewer } from "../shell.jsx";
import MobileScreen from "./MobileScreen.jsx";

export default function MobileLedger({account,accounts=[],transactions,onClose,onDeleteTxn,onReverseTxn,inboxFiles=[],uploadInboxFile}){
  const getName=code=>{const a=accounts.find(x=>x.code===code);return a?`${code} · ${a.name}`:code;};
  const now=new Date();
  const[year,setYear]=useState(now.getFullYear());
  const[month,setMonth]=useState(now.getMonth());
  const periodLabel=new Date(year,month,1).toLocaleString("default",{month:"long",year:"numeric"});
  const stepMonth=dir=>{let m=month+dir,y=year;if(m<0){m=11;y--;}else if(m>11){m=0;y++;}setMonth(m);setYear(y);};
  const from=`${year}-${String(month+1).padStart(2,"0")}-01`;
  const to=new Date(year,month+1,0).toISOString().slice(0,10);

  const[detail,setDetail]=useState(null);
  const[showAttachments,setShowAttachments]=useState(false);
  const[uploading,setUploading]=useState(false);
  const fileInputRef=useRef(null);
  const folder=`Bank · ${account.code}`;
  const attachments=useMemo(()=>inboxFiles.filter(f=>f.folder===folder&&!f.deletedAt),[inboxFiles,folder]);
  const[viewFile,setViewFile]=useState(null);

  const pickFile=()=>fileInputRef.current&&fileInputRef.current.click();
  const onFileChosen=async e=>{
    const file=e.target.files&&e.target.files[0];
    e.target.value="";
    if(!file||!uploadInboxFile)return;
    setUploading(true);
    await uploadInboxFile(file,folder);
    setUploading(false);
  };

  const openingBal=useMemo(()=>
    transactions.filter(t=>t.date<from&&(t.debitCode===account.code||t.creditCode===account.code))
      .reduce((s,t)=>t.debitCode===account.code?s+t.amount:s-t.amount,0),
  [transactions,account.code,from]);

  const rows=useMemo(()=>{
    let running=openingBal;
    return transactions
      .filter(t=>t.date>=from&&t.date<=to&&(t.debitCode===account.code||t.creditCode===account.code))
      .sort((a,b)=>a.date.localeCompare(b.date)||a.bilag-b.bilag)
      .map(t=>{const isDr=t.debitCode===account.code;const movement=isDr?t.amount:-t.amount;running+=movement;return{...t,movement,balance:running};});
  },[transactions,account.code,from,to,openingBal]);

  const closingBal=rows.length?rows[rows.length-1].balance:openingBal;
  const periodMovement=rows.reduce((s,r)=>s+r.movement,0);

  return(
    <MobileScreen title={account.name} subtitle={`${account.code} · Balance ${fmtBal(closingBal)}`} onClose={onClose}
      headerRight={
        <div onClick={()=>setShowAttachments(true)} style={{position:"relative",width:38,height:38,borderRadius:12,background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 1px 6px rgba(20,40,50,0.08)"}}>
          <i className="ti ti-paperclip" style={{fontSize:16,color:T.accent}}/>
          {attachments.length>0&&<div style={{position:"absolute",top:-3,right:-3,minWidth:16,height:16,borderRadius:8,background:"#FF6B4A",color:"#fff",fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{attachments.length}</div>}
        </div>
      }>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fff",borderRadius:14,padding:"10px 16px",marginBottom:16,boxShadow:"0 1px 6px rgba(20,40,50,0.05)"}}>
        <div onClick={()=>stepMonth(-1)} style={{fontSize:18,color:"#8A93A3",padding:"0 10px"}}>‹</div>
        <div style={{fontSize:13.5,fontWeight:800,color:"#0F172A"}}>{periodLabel}</div>
        <div onClick={()=>stepMonth(1)} style={{fontSize:18,color:"#8A93A3",padding:"0 10px"}}>›</div>
      </div>

      <div style={{display:"flex",gap:10,marginBottom:18}}>
        <div style={{flex:1,background:"rgba(13,148,136,0.08)",borderRadius:14,padding:"11px 12px"}}>
          <div style={{fontSize:10,color:T.accent,fontWeight:700}}>Opening</div>
          <div style={{fontSize:12.5,fontWeight:800,color:"#0F172A",marginTop:2}}>{fmtBal(openingBal)}</div>
        </div>
        <div style={{flex:1,background:periodMovement>=0?"rgba(14,159,110,0.08)":"rgba(225,72,72,0.08)",borderRadius:14,padding:"11px 12px"}}>
          <div style={{fontSize:10,color:periodMovement>=0?"#0E9F6E":"#E14848",fontWeight:700}}>Movement</div>
          <div style={{fontSize:12.5,fontWeight:800,color:"#0F172A",marginTop:2}}>{sign(periodMovement)}</div>
        </div>
        <div style={{flex:1,background:"rgba(13,148,136,0.08)",borderRadius:14,padding:"11px 12px"}}>
          <div style={{fontSize:10,color:T.accent,fontWeight:700}}>Closing</div>
          <div style={{fontSize:12.5,fontWeight:800,color:"#0F172A",marginTop:2}}>{fmtBal(closingBal)}</div>
        </div>
      </div>

      {rows.map(r=>(
        <div key={r.id} onClick={()=>setDetail(r)} style={{display:"flex",alignItems:"center",gap:12,background:"#fff",borderRadius:14,padding:"12px 14px",marginBottom:8,boxShadow:"0 1px 6px rgba(20,40,50,0.04)"}}>
          <div style={{width:34,height:34,borderRadius:10,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,background:r.movement>=0?"rgba(14,159,110,0.12)":"rgba(225,72,72,0.1)",color:r.movement>=0?"#0E9F6E":"#E14848"}}>{fmtB(r.bilag)}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:700,color:"#0F172A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.description}</div>
            <div style={{fontSize:11,color:"#98A2B3",marginTop:1}}>{r.date}</div>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{fontSize:13,fontWeight:800,color:r.movement>=0?"#0E9F6E":"#E14848"}}>{sign(r.movement)}</div>
            <div style={{fontSize:10,color:"#98A2B3",marginTop:1}}>{fmtBal(r.balance)}</div>
          </div>
        </div>
      ))}
      {!rows.length&&<div style={{textAlign:"center",padding:"30px 0",color:"#98A2B3",fontSize:12}}>No entries in {periodLabel}.</div>}

      {detail&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:150,display:"flex",alignItems:"flex-end"}} onClick={()=>setDetail(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"22px 22px 0 0",padding:"22px 20px calc(env(safe-area-inset-bottom) + 20px)",width:"100%"}}>
            <div style={{fontSize:11,color:T.accent,fontWeight:700,marginBottom:3}}>{fmtB(detail.bilag)} · {detail.date}</div>
            <div style={{fontSize:15,fontWeight:800,color:"#0F172A",marginBottom:14}}>{detail.description}</div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderTop:`1px solid ${T.border}`}}>
              <div style={{fontSize:12,color:"#8A93A3"}}>Amount</div>
              <div style={{fontSize:13,fontWeight:800,color:"#0F172A"}}>{fmtBal(detail.amount)}</div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderTop:`1px solid ${T.border}`}}>
              <div style={{fontSize:12,color:"#8A93A3"}}>Debit</div>
              <div style={{fontSize:12.5,fontWeight:700,color:"#0F172A",textAlign:"right",marginLeft:16}}>{getName(detail.debitCode)}</div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderTop:`1px solid ${T.border}`}}>
              <div style={{fontSize:12,color:"#8A93A3"}}>Credit</div>
              <div style={{fontSize:12.5,fontWeight:700,color:"#0F172A",textAlign:"right",marginLeft:16}}>{getName(detail.creditCode)}</div>
            </div>
            <div style={{display:"flex",gap:10,marginTop:16}}>
              <div onClick={()=>{onReverseTxn(detail);setDetail(null);}} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,border:`1px solid ${T.border}`,color:"#5C6B73",fontWeight:700,fontSize:13}}>Reverse</div>
              <div onClick={()=>{if(window.confirm("Delete this entry?")){onDeleteTxn(detail.id);setDetail(null);}}} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,background:"#E14848",color:"#fff",fontWeight:700,fontSize:13}}>Delete</div>
            </div>
          </div>
        </div>
      )}

      {showAttachments&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:150,display:"flex",alignItems:"flex-end"}} onClick={()=>setShowAttachments(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"22px 22px 0 0",padding:"22px 20px calc(env(safe-area-inset-bottom) + 20px)",width:"100%",maxHeight:"75vh",overflowY:"auto"}}>
            <div style={{fontSize:14,fontWeight:800,color:"#0F172A",marginBottom:2}}>Attachments</div>
            <div style={{fontSize:11.5,color:"#8A93A3",marginBottom:16}}>Statements & documents saved for {account.name}</div>
            <input ref={fileInputRef} type="file" style={{display:"none"}} onChange={onFileChosen}/>
            <div onClick={pickFile} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"13px",borderRadius:14,border:`1.5px dashed ${T.border}`,color:T.accent,fontSize:12.5,fontWeight:700,marginBottom:16}}>
              <i className={`ti ${uploading?"ti-loader-2":"ti-upload"}`} style={{fontSize:15}}/>{uploading?"Uploading…":"Upload a file"}
            </div>
            {attachments.map(f=>(
              <div key={f.id} onClick={()=>setViewFile(f)} style={{display:"flex",alignItems:"center",gap:12,background:"#F6F8FA",borderRadius:12,padding:"11px 13px",marginBottom:8}}>
                <div style={{width:32,height:32,borderRadius:9,background:T.accentLight,color:T.accent,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><i className="ti ti-file-text" style={{fontSize:15}}/></div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12.5,fontWeight:700,color:"#0F172A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
                  <div style={{fontSize:10.5,color:"#98A2B3",marginTop:1}}>{f.date}</div>
                </div>
                <i className="ti ti-chevron-right" style={{fontSize:14,color:"#B0BAC3"}}/>
              </div>
            ))}
            {!attachments.length&&<div style={{textAlign:"center",padding:"20px 0",color:"#98A2B3",fontSize:12}}>No attachments saved yet.</div>}
          </div>
        </div>
      )}

      {viewFile&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:200,display:"flex",flexDirection:"column"}} onClick={()=>setViewFile(null)}>
          <div style={{padding:"calc(env(safe-area-inset-top) + 14px) 16px 10px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{color:"#fff",fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginRight:10}}>{viewFile.name}</div>
            <div onClick={()=>setViewFile(null)} style={{width:32,height:32,borderRadius:10,background:"rgba(255,255,255,0.15)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><i className="ti ti-x" style={{fontSize:16,color:"#fff"}}/></div>
          </div>
          <div onClick={e=>e.stopPropagation()} style={{flex:1,padding:"0 16px 16px"}}>
            <SignedFileViewer storagePath={viewFile.storagePath} type={viewFile.type} name={viewFile.name} style={{width:"100%",height:"100%",borderRadius:12,background:"#fff"}}/>
          </div>
        </div>
      )}
    </MobileScreen>
  );
}
