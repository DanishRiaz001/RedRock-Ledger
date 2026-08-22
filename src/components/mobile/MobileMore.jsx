import { useState } from "react";
import { T } from "../../lib/theme.js";
import { ReskontroScreen } from "../ledger.jsx";
import { AdminPanel } from "../admin.jsx";
import MobileSettings from "./MobileSettings.jsx";
import MobileInvoices from "./MobileInvoices.jsx";
import MobileTrialBalance from "./MobileTrialBalance.jsx";
import MobileLedger from "./MobileLedger.jsx";

const MENU=[
  {id:"customers",label:"Customers & Suppliers",sub:"AR/AP contacts & ledgers",icon:"ti-users-group",bg:"rgba(13,148,136,0.12)",fg:"#0D9488"},
  {id:"invoices",label:"Invoices",sub:"Create, send & track payments",icon:"ti-file-invoice",bg:"rgba(36,97,217,0.12)",fg:"#2461D9"},
  {id:"trialbalance",label:"Trial balance",sub:"Every account, opening to closing",icon:"ti-scale",bg:"rgba(124,58,237,0.12)",fg:"#7C3AED"},
  {id:"settings",label:"Settings",sub:"Chart of accounts & company profile",icon:"ti-adjustments",bg:"rgba(180,116,14,0.12)",fg:"#B4740E"},
];

export default function MobileMore(props){
  const{contacts,setContacts,transactions,matchTransactions,unmatchTransactions,saveEdit,deleteTxn,accounts,fetchTxnAttachments,uploadInboxFile,attachFilesToTxnEntry,inboxFiles,auditLog,profiles,user,moneySources,tagTransaction,fetchEntryComments,addEntryComment,isAdmin,onToggleActive,fetchClientAccessFor,grantClientAccess,revokeClientAccess,fetchCompaniesFor,fetchAccessRequests,dismissAccessRequest,resolveAccessRequestAsGranted,onSignOut,setAccounts,addAccount,updateAccount,budgets,saveBudget,mergeAccounts,companyProfile,saveCompanyProfile,requestRedrockAccess,invoices,updateInvoiceStatus,deleteInvoice,registerInvoicePayment,createCreditNote,getInvoicePaid,nextInvoiceNo,createInvoice,reverseTransaction}=props;
  const[screen,setScreen]=useState(null);
  const[showAdmin,setShowAdmin]=useState(false);
  const[tbLedger,setTbLedger]=useState(null);

  if(showAdmin)return(
    <AdminPanel onBack={()=>setShowAdmin(false)} profiles={profiles} onToggleActive={onToggleActive} fetchClientAccessFor={fetchClientAccessFor} grantClientAccess={grantClientAccess} revokeClientAccess={revokeClientAccess} fetchCompaniesFor={fetchCompaniesFor} fetchAccessRequests={fetchAccessRequests} dismissAccessRequest={dismissAccessRequest} resolveAccessRequestAsGranted={resolveAccessRequestAsGranted} isDesktop={false}/>
  );

  if(screen==="customers")return(
    <ReskontroScreen contacts={contacts} setContacts={setContacts} transactions={transactions} matchTxns={matchTransactions} unmatchTxns={unmatchTransactions} editTxn={saveEdit} deleteTxn={deleteTxn} accounts={accounts} onBack={()=>setScreen(null)} fetchTxnAttachments={fetchTxnAttachments} uploadInboxFile={uploadInboxFile} attachFilesToTxnEntry={attachFilesToTxnEntry} inboxFiles={inboxFiles} auditLog={auditLog} profiles={profiles} currentUserId={user?user.id:null} moneySources={moneySources} tagTransaction={tagTransaction} fetchEntryComments={fetchEntryComments} addEntryComment={addEntryComment}/>
  );

  if(screen==="invoices")return(
    <MobileInvoices invoices={invoices} contacts={contacts} accounts={accounts} companyProfile={companyProfile}
      updateInvoiceStatus={updateInvoiceStatus} deleteInvoice={deleteInvoice} registerInvoicePayment={registerInvoicePayment}
      createCreditNote={createCreditNote} getInvoicePaid={getInvoicePaid} nextInvoiceNo={nextInvoiceNo} createInvoice={createInvoice}
      transactions={transactions} onClose={()=>setScreen(null)}/>
  );

  if(screen==="trialbalance"){
    if(tbLedger)return(
      <MobileLedger account={tbLedger} accounts={accounts} transactions={transactions} onClose={()=>setTbLedger(null)}
        onDeleteTxn={deleteTxn} onReverseTxn={reverseTransaction} inboxFiles={inboxFiles} uploadInboxFile={uploadInboxFile}/>
    );
    return(
      <MobileTrialBalance accounts={accounts} transactions={transactions} setAccounts={setAccounts}
        onOpenLedger={acct=>setTbLedger(acct)} onClose={()=>setScreen(null)}/>
    );
  }

  if(screen==="settings")return(
    <MobileSettings accounts={accounts} setAccounts={setAccounts} addAccount={addAccount} updateAccount={updateAccount}
      transactions={transactions} budgets={budgets} saveBudget={saveBudget} mergeAccounts={mergeAccounts}
      companyProfile={companyProfile} saveCompanyProfile={saveCompanyProfile} requestRedrockAccess={requestRedrockAccess}
      onClose={()=>setScreen(null)}/>
  );

  return(
    <div style={{paddingBottom:24}}>
      <div style={{padding:"calc(env(safe-area-inset-top) + 18px) 20px 18px"}}>
        <div style={{fontSize:22,fontWeight:800,color:"#0F172A"}}>More</div>
      </div>
      <div style={{padding:"0 20px"}}>
        <div style={{background:"#fff",borderRadius:16,overflow:"hidden",boxShadow:"0 1px 6px rgba(20,40,50,0.05)",marginBottom:16}}>
          {MENU.map((m,i)=>(
            <div key={m.id} onClick={()=>setScreen(m.id)} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",borderBottom:i<MENU.length-1?"1px solid #F1F5F4":"none",cursor:"pointer"}}>
              <div style={{width:34,height:34,borderRadius:10,background:m.bg,color:m.fg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><i className={`ti ${m.icon}`} style={{fontSize:16}}/></div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13.5,fontWeight:700,color:"#0F172A"}}>{m.label}</div>
                <div style={{fontSize:10.5,color:"#8A93A3",marginTop:1}}>{m.sub}</div>
              </div>
              <i className="ti ti-chevron-right" style={{fontSize:14,color:"#C7C7CC"}}/>
            </div>
          ))}
        </div>

        {isAdmin&&(
          <div onClick={()=>setShowAdmin(true)} style={{display:"flex",alignItems:"center",gap:12,background:"#fff",borderRadius:16,padding:"14px 16px",marginBottom:16,boxShadow:"0 1px 6px rgba(20,40,50,0.05)",cursor:"pointer"}}>
            <div style={{width:34,height:34,borderRadius:10,background:"rgba(232,90,59,0.12)",color:"#E85A3B",display:"flex",alignItems:"center",justifyContent:"center"}}><i className="ti ti-shield-lock" style={{fontSize:16}}/></div>
            <div style={{flex:1,fontSize:13.5,fontWeight:700,color:"#0F172A"}}>Admin Panel</div>
            <i className="ti ti-chevron-right" style={{fontSize:14,color:"#C7C7CC"}}/>
          </div>
        )}

        <div onClick={onSignOut} style={{textAlign:"center",background:"#fff",borderRadius:16,padding:"14px",fontSize:13.5,fontWeight:700,color:"#E14848",boxShadow:"0 1px 6px rgba(20,40,50,0.05)",cursor:"pointer"}}>Sign out</div>
      </div>
    </div>
  );
}
