import { useState } from "react";
import { T } from "../../lib/theme.js";
import { ReskontroScreen } from "../ledger.jsx";
import { AdminPanel } from "../admin.jsx";

const MENU=[
  {id:"customers",label:"Customers & Suppliers",icon:"ti-users",bg:"rgba(13,148,136,0.12)",fg:"#0D9488"},
  {id:"invoices",label:"Invoices",icon:"ti-file-invoice",bg:"rgba(36,97,217,0.12)",fg:"#2461D9"},
  {id:"settings",label:"Settings",icon:"ti-settings",bg:"rgba(180,116,14,0.12)",fg:"#B4740E"},
];

export default function MobileMore(props){
  const{contacts,setContacts,transactions,matchTransactions,unmatchTransactions,saveEdit,deleteTxn,accounts,fetchTxnAttachments,uploadInboxFile,attachFilesToTxnEntry,inboxFiles,auditLog,profiles,user,moneySources,tagTransaction,fetchEntryComments,addEntryComment,isAdmin,onToggleActive,fetchClientAccessFor,grantClientAccess,revokeClientAccess,fetchCompaniesFor,fetchAccessRequests,dismissAccessRequest,resolveAccessRequestAsGranted,onSignOut}=props;
  const[screen,setScreen]=useState(null);
  const[showAdmin,setShowAdmin]=useState(false);

  if(showAdmin)return(
    <AdminPanel onBack={()=>setShowAdmin(false)} profiles={profiles} onToggleActive={onToggleActive} fetchClientAccessFor={fetchClientAccessFor} grantClientAccess={grantClientAccess} revokeClientAccess={revokeClientAccess} fetchCompaniesFor={fetchCompaniesFor} fetchAccessRequests={fetchAccessRequests} dismissAccessRequest={dismissAccessRequest} resolveAccessRequestAsGranted={resolveAccessRequestAsGranted} isDesktop={false}/>
  );

  if(screen==="customers")return(
    <ReskontroScreen contacts={contacts} setContacts={setContacts} transactions={transactions} matchTxns={matchTransactions} unmatchTxns={unmatchTransactions} editTxn={saveEdit} deleteTxn={deleteTxn} accounts={accounts} onBack={()=>setScreen(null)} fetchTxnAttachments={fetchTxnAttachments} uploadInboxFile={uploadInboxFile} attachFilesToTxnEntry={attachFilesToTxnEntry} inboxFiles={inboxFiles} auditLog={auditLog} profiles={profiles} currentUserId={user?user.id:null} moneySources={moneySources} tagTransaction={tagTransaction} fetchEntryComments={fetchEntryComments} addEntryComment={addEntryComment}/>
  );

  return(
    <div style={{paddingBottom:24}}>
      <div style={{padding:"calc(env(safe-area-inset-top) + 18px) 20px 18px"}}>
        <div style={{fontSize:22,fontWeight:800,color:"#0F172A"}}>More</div>
      </div>
      <div style={{padding:"0 20px"}}>
        <div style={{background:"#fff",borderRadius:16,overflow:"hidden",boxShadow:"0 1px 6px rgba(20,40,50,0.05)",marginBottom:16}}>
          {MENU.map((m,i)=>(
            <div key={m.id} onClick={()=>m.id==="customers"?setScreen("customers"):null} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",borderBottom:i<MENU.length-1?"1px solid #F1F5F4":"none",cursor:"pointer"}}>
              <div style={{width:32,height:32,borderRadius:9,background:m.bg,color:m.fg,display:"flex",alignItems:"center",justifyContent:"center"}}><i className={`ti ${m.icon}`} style={{fontSize:15}}/></div>
              <div style={{flex:1,fontSize:13.5,fontWeight:600,color:"#0F172A"}}>{m.label}</div>
              <i className="ti ti-chevron-right" style={{fontSize:14,color:"#C7C7CC"}}/>
            </div>
          ))}
        </div>

        {isAdmin&&(
          <div onClick={()=>setShowAdmin(true)} style={{display:"flex",alignItems:"center",gap:12,background:"#fff",borderRadius:16,padding:"14px 16px",marginBottom:16,boxShadow:"0 1px 6px rgba(20,40,50,0.05)",cursor:"pointer"}}>
            <div style={{width:32,height:32,borderRadius:9,background:"rgba(232,90,59,0.12)",color:"#E85A3B",display:"flex",alignItems:"center",justifyContent:"center"}}><i className="ti ti-shield" style={{fontSize:15}}/></div>
            <div style={{flex:1,fontSize:13.5,fontWeight:600,color:"#0F172A"}}>Admin Panel</div>
            <i className="ti ti-chevron-right" style={{fontSize:14,color:"#C7C7CC"}}/>
          </div>
        )}

        <div onClick={onSignOut} style={{textAlign:"center",background:"#fff",borderRadius:16,padding:"14px",fontSize:13.5,fontWeight:700,color:"#E14848",boxShadow:"0 1px 6px rgba(20,40,50,0.05)",cursor:"pointer"}}>Sign out</div>
      </div>
    </div>
  );
}
