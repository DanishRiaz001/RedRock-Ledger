import { useState, useMemo, useEffect } from "react";
import { T } from "../../lib/theme.js";
import { sign, fmtBal, AccDrop, FlexDateInput } from "../ledger.jsx";
import { fmtB } from "../../lib/utils.js";
import { NewEntryForm } from "../invoicing.jsx";

const fieldStyle={width:"100%",background:"#F6F8FA",border:`1px solid ${T.border}`,borderRadius:12,padding:"12px 14px",fontSize:16,fontFamily:"inherit",boxSizing:"border-box",marginBottom:12};

// Tapping a voucher previously did nothing — there was no way to edit or
// delete an existing entry from the mobile app at all. This bottom sheet
// is the minimum viable fix: date, description, debit, credit, amount,
// plus delete, wired to the same saveEdit/deleteTxn functions the desktop
// edit modal already uses.
function EditVoucherSheet({txn,accounts,saveEdit,deleteTxn,onClose}){
  const[form,setForm]=useState({date:txn.date,description:txn.description,debitCode:txn.debitCode,creditCode:txn.creditCode,amount:String(txn.amount)});
  const[saving,setSaving]=useState(false);
  const valid=form.date&&form.description.trim()&&form.debitCode&&form.creditCode&&parseFloat(form.amount)>0;
  const save=async()=>{
    if(!valid||saving)return;
    setSaving(true);
    await saveEdit({...txn,date:form.date,description:form.description.trim(),debitCode:form.debitCode,creditCode:form.creditCode,amount:parseFloat(form.amount)});
    setSaving(false);
    onClose();
  };
  const del=()=>{
    if(!window.confirm(`Delete ${fmtB(txn.bilag)}? This can't be undone.`))return;
    deleteTxn&&deleteTxn(txn.id);
    onClose();
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:200,display:"flex",alignItems:"flex-end"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"22px 22px 0 0",padding:"20px 20px calc(env(safe-area-inset-bottom) + 20px)",width:"100%",maxHeight:"85vh",overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div>
            <div style={{fontSize:14,fontWeight:800,color:"#0F172A"}}>Edit entry</div>
            <div style={{fontSize:11,color:"#8A93A3",marginTop:1}}>{fmtB(txn.bilag)}</div>
          </div>
          <div onClick={del} style={{width:32,height:32,borderRadius:10,background:"#FEF2F2",display:"flex",alignItems:"center",justifyContent:"center"}}><i className="ti ti-trash" style={{fontSize:15,color:"#E14848"}}/></div>
        </div>

        <div style={{marginBottom:12}}>
          <FlexDateInput value={form.date} onChange={v=>setForm(p=>({...p,date:v}))}/>
        </div>
        <input placeholder="Description" value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} style={fieldStyle}/>

        <div style={{fontSize:9,color:"#E14848",fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Debit</div>
        <div style={{marginBottom:12}}><AccDrop value={form.debitCode} onChange={v=>setForm(p=>({...p,debitCode:v}))} accounts={accounts}/></div>

        <div style={{fontSize:9,color:"#0E9F6E",fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Credit</div>
        <div style={{marginBottom:12}}><AccDrop value={form.creditCode} onChange={v=>setForm(p=>({...p,creditCode:v}))} accounts={accounts}/></div>

        <input placeholder="0" type="number" value={form.amount} onChange={e=>setForm(p=>({...p,amount:e.target.value}))} style={{...fieldStyle,marginBottom:16,fontWeight:700,fontSize:18}}/>

        <div style={{display:"flex",gap:10}}>
          <div onClick={onClose} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,border:`1px solid ${T.border}`,color:"#5C6B73",fontWeight:700,fontSize:13}}>Cancel</div>
          <div onClick={save} style={{flex:1,textAlign:"center",padding:"12px",borderRadius:12,background:valid&&!saving?T.accent:T.border,color:valid&&!saving?"#fff":"#98A2B3",fontWeight:700,fontSize:13}}>{saving?"Saving…":"Save"}</div>
        </div>
      </div>
    </div>
  );
}

export default function MobileVouchers(props){
  const{accounts,contacts,setContacts,nextBilag,feat,sinkingFunds,saveSinkingFunds,inboxFiles,uploadInboxFile,transactions,moneySources,tagTransaction,projects,companyProfile,saveProjects,addTransaction,addEntryComment,overlay,setOverlay,saveEdit,deleteTxn}=props;
  const[showNew,setShowNew]=useState(false);
  const[search,setSearch]=useState("");
  const[editTxn,setEditTxn]=useState(null);

  // Home's "+" FAB signals a new entry via the shared overlay state (rather
  // than switching tabs and leaving it at that) — consume it here and clear
  // it right away so it doesn't also try to open one of the overlay screens.
  useEffect(()=>{
    if(overlay&&overlay.type==="NewVoucher"){setShowNew(true);setOverlay&&setOverlay(null);}
  },[overlay]);

  const list=useMemo(()=>{
    const sorted=[...transactions].sort((a,b)=>b.bilag-a.bilag);
    if(!search.trim())return sorted.slice(0,40);
    const q=search.toLowerCase();
    return sorted.filter(t=>(t.description||"").toLowerCase().includes(q)||fmtB(t.bilag).toLowerCase().includes(q)).slice(0,40);
  },[transactions,search]);

  if(showNew)return(
    <div style={{minHeight:"100%",background:T.bg}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"calc(env(safe-area-inset-top) + 14px) 20px 12px"}}>
        <div onClick={()=>setShowNew(false)} style={{width:32,height:32,borderRadius:10,background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 1px 6px rgba(20,40,50,0.06)"}}><i className="ti ti-x" style={{fontSize:15,color:"#3A4750"}}/></div>
        <div style={{fontSize:16,fontWeight:800,color:"#0F172A"}}>New voucher</div>
      </div>
      <div style={{padding:"0 16px 30px"}}>
        <NewEntryForm accounts={accounts} contacts={contacts} setContacts={setContacts} nextBilag={nextBilag} feat={feat}
          sinkingFunds={sinkingFunds} saveSinkingFunds={saveSinkingFunds} inboxFiles={inboxFiles} uploadInboxFile={uploadInboxFile}
          transactions={transactions} moneySources={moneySources} tagTransaction={tagTransaction} isDesktop={false}
          projects={projects} trackProjects={!!(companyProfile&&companyProfile.trackProjects)} saveProjects={saveProjects}
          addEntryComment={addEntryComment}
          onSave={async(form)=>{const r=await addTransaction(form);setShowNew(false);return r;}}/>
      </div>
    </div>
  );

  return(
    <div style={{paddingBottom:24}}>
      <div style={{padding:"calc(env(safe-area-inset-top) + 18px) 20px 0"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:22,fontWeight:800,color:"#0F172A"}}>Vouchers</div>
          <div onClick={()=>setShowNew(true)} style={{display:"flex",alignItems:"center",gap:6,background:"linear-gradient(135deg,#FF6B4A,#FF8266)",color:"#fff",borderRadius:12,padding:"9px 14px",fontSize:12.5,fontWeight:700,boxShadow:"0 6px 16px rgba(255,107,74,0.3)"}}>
            <i className="ti ti-plus" style={{fontSize:14}}/>New
          </div>
        </div>
        <div style={{position:"relative",marginBottom:16}}>
          <i className="ti ti-search" style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"#98A2B3",fontSize:13}}/>
          <input placeholder="Search vouchers…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:"100%",background:"#fff",border:"1px solid #E1EEEB",borderRadius:12,padding:"10px 12px 10px 34px",fontSize:16,fontFamily:"inherit",boxSizing:"border-box"}}/>
        </div>
      </div>
      <div style={{padding:"0 20px"}}>
        {list.map(t=>(
          <div key={t.id} onClick={()=>setEditTxn(t)} style={{display:"flex",alignItems:"center",gap:12,background:"#fff",borderRadius:14,padding:"12px 14px",marginBottom:8,boxShadow:"0 1px 6px rgba(20,40,50,0.04)",cursor:"pointer"}}>
            <div style={{width:34,height:34,borderRadius:10,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10.5,fontWeight:800,background:T.accentLight,color:T.accent}}>{fmtB(t.bilag)}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700,color:"#0F172A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</div>
              <div style={{fontSize:11,color:"#98A2B3",marginTop:1}}>{t.date}</div>
            </div>
            <div style={{fontSize:13,fontWeight:800,color:"#0F172A",flexShrink:0}}>{fmtBal(t.amount)}</div>
            <i className="ti ti-chevron-right" style={{fontSize:14,color:"#B0BAC3",flexShrink:0}}/>
          </div>
        ))}
        {!list.length&&<div style={{textAlign:"center",padding:"40px 0",color:"#98A2B3",fontSize:12}}>No vouchers found.</div>}
      </div>
      {editTxn&&saveEdit&&(
        <EditVoucherSheet txn={editTxn} accounts={accounts} saveEdit={saveEdit} deleteTxn={deleteTxn} onClose={()=>setEditTxn(null)}/>
      )}
    </div>
  );
}
