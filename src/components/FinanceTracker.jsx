import React, { useState, useMemo, useEffect, useRef } from "react";
import { T, SERIES, getSK, inp, btnRed, btnGhost, btnSm } from "../lib/theme.js";
import { isIncomeSK, isExpenseSK, fmt, fmtB } from "../lib/utils.js";
import { LOGO_B64 } from "../lib/logo.js";
import { sb } from "../lib/supabaseClient.js";
import {
  BackHeader, DetailModal, TxnCard, LedgerScreen, BankModule, ReskontroScreen,
  isFeatureOn, getAdminFeatures, getUserFeatures, setUserFeature, isDateClosed,
  getPeriodClose, isBankReconApproved, setBankReconApproved, hasBudgetMoved, markBudgetMoved, getBugs,
} from "./ledger.jsx";
import {
  Dashboard, DesktopDashboard, SettingsMenu, AccountPlanScreen, TrialBalanceScreen,
  ResultatScreen, BalanceSheetScreen, VATReportScreen, VATTerminScreen, VATTerminDetailScreen,
  GeneralLedgerScreen, BankDashboardScreen, BankReconciliationScreen, ReskontroDesktopScreen,
  LedgerDrilldownScreen, PeriodSelector, AssistantPanel, OnboardingWizard, ReconciliationScreen,
} from "./reports.jsx";
import {
  VATCodesScreen, BankSettingsScreen, POSSettingsScreen, SAFTImportScreen, CustomerSettingsScreen,
  CustomersRegisterScreen, CompanyInfoScreen, RegisterVoucherQueueScreen, InvoiceFormScreen,
  InvoiceOverviewScreen, RecurringInvoicesScreen, EmployeesScreen, POSScreen, POSProductsScreen,
  PayrollScreen, QuoteFormScreen, QuoteOverviewScreen, AuditLogScreen, NewEntryForm,
  SinkingFundsScreen, ReportsHubScreen, MonthlyOverviewScreen, SalesPerCustomerScreen, AgedReskontroScreen,
} from "./invoicing.jsx";
import {
  BalanceListsScreen, ReportsScreen, ImportScreen, BudgetScreen, ProfileScreen, FilesScreen,
  DisabledScreen, ChequeScreen, BugLogScreen, ScreenErrorBoundary,
} from "./settings2.jsx";
import { AdminPanel, AIBookkeepingScreen, MENU, SIDEBAR } from "./admin.jsx";
import { CustomerImportScreen, VoucherSettingsScreen, InvoiceSettingsScreen, AccountingSettingsScreen, OpeningBalanceScreen, ProjectTrackingScreen } from "./settings3.jsx";

function FinanceTracker({accounts,setAccounts,addAccount,updateAccount,contacts,setContacts,transactions,addTransaction,saveEdit,deleteTxn,reverseTransaction,matchTransactions,unmatchTransactions,sinkingFunds,saveSinkingFunds,moneySources,saveMoneySources,tagTransaction,budgets,saveBudget,restoreBudgets,saveBudgetSurplusSetting,sweepBudgetSurplus,inboxFiles,attachedTxnIds,uploadInboxFile,deleteInboxFileEntry,restoreInboxFileEntry,permanentlyDeleteInboxFileEntry,renameInboxFileEntry,mergeInboxFilesEntry,moveInboxFileEntry,copyInboxFileEntry,attachFilesToTxnEntry,fetchTxnAttachments,bankStatementLines,uploadBankStatement,parseBankStatementFile,commitBankStatementRows,undoBankImport,postBankStatementLine,deleteBankStatementLine,matchBankStatementLine,unmatchBankStatementLine,invoices,createInvoice,updateInvoiceStatus,deleteInvoice,registerInvoicePayment,createCreditNote,toggleReconciled,nextInvoiceNo,companyProfile,saveCompanyProfile,recurringInvoices,createRecurringInvoice,updateRecurringInvoice,deleteRecurringInvoice,generateRecurringInvoicesForMonth,employees,createEmployee,updateEmployee,deleteEmployee,quotes,nextQuoteNo,createQuote,updateQuoteStatus,deleteQuote,convertQuoteToInvoice,auditLog,logUsageEvent,posProducts,createPosProduct,updatePosProduct,deletePosProduct,completeSale,payrollRuns,createPayrollRun,deletePayrollRun,nextBilag,onSignOut,isAdmin,canEdit,profiles,viewingUserId,setViewingUserId,myClientAccess=[],currentAccessLevel="full",profile,user,onToggleActive,fetchClientAccessFor,grantClientAccess,revokeClientAccess,fetchCompaniesFor,requestRedrockAccess,fetchAccessRequests,dismissAccessRequest,resolveAccessRequestAsGranted,fetchEntryComments,addEntryComment,mergeContacts,postBankStatementLinesBulk,getInvoicePaid,projects=[],saveProjects,tagTransactionProject,reconciliationStatus=[],saveReconciliationStatus,reconciliationFiles=[],attachReconciliationFile,removeReconciliationFile,mergeAccounts,companies=[],activeCompanyId,setActiveCompanyId,createCompany,renameCompany}){
  const[tab,setTab]=useState("Dashboard");
  const[sidebarOpen,setSidebarOpen]=useState(false);
  const[ledgerAcc,setLedgerAcc]=useState(null);
  // Opening an account ledger (e.g. from Trial Balance) pushes a browser
  // history entry, so the browser's own back button/gesture closes the
  // ledger and returns to whatever screen was open underneath — instead of
  // navigating the whole app away, which is what happened before this.
  useEffect(()=>{
    if(!ledgerAcc)return;
    window.history.pushState({ledgerDrilldown:true},"");
    const onPop=()=>setLedgerAcc(null);
    window.addEventListener("popstate",onPop);
    return()=>window.removeEventListener("popstate",onPop);
  },[ledgerAcc]);
  const[settingsWide,setSettingsWide]=useState(false);
  const[ledgerExpanded,setLedgerExpanded]=useState(false);
  const[lastDeleted,setLastDeleted]=useState(null);
  // Desktop gets a persistent sidebar + reflowed Dashboard; mobile keeps the
  // existing app-style layout untouched. One codebase, no separate app build —
  // this is just a width check, re-evaluated on resize.
  // Always the desktop layout now — the app used to switch to a separate,
  // less-complete mobile UI below 1024px (including whenever DevTools was
  // open, since that shrinks the viewport too), which was confusing and
  // inconsistent with the desktop experience this app is actually built
  // and tested against. isDesktop is kept as a variable (not deleted
  // outright) since dozens of screens still branch on it internally, but
  // it's now permanently true — the resize listener that used to flip it
  // is also removed below.
  const[isDesktop]=useState(true);
  const[onboardingDismissed,setOnboardingDismissedState]=useState(()=>{try{return localStorage.getItem("rr_onboarding_done")==="1";}catch{return false;}});
  const dismissOnboarding=()=>{setOnboardingDismissedState(true);try{localStorage.setItem("rr_onboarding_done","1");}catch{}};
  // Same as addTransaction, but also raises a save notification on the bell
  // icon — used by the flows where "did that actually save?" matters most:
  // registering vouchers from the Inbox, and the plain New Entry form.
  const addTransactionNotified=async(form)=>{
    const result=await addTransaction(form);
    pushToast(`Saved: ${form.description||"New entry"} — ${fmt(form.amount)}`);
    if(result&&result.id)showUndoSnackbar({id:result.id,bilag:result.bilag,description:result.description||"New entry"});
    return result;
  };
  useEffect(()=>{if(logUsageEvent)logUsageEvent(tab);},[tab]);
  useEffect(()=>{setScreenExcelExport(null);},[tab]);
  // Fix: an open ledger drill-down was overriding tab-based rendering
  // entirely — clicking Bank or any other sidebar item changed `tab` but had
  // no visible effect until the ledger was closed or the page refreshed.
  // Any real navigation should close the ledger view automatically.
  useEffect(()=>{setLedgerAcc(null);},[tab]);
  const[recentTabs,setRecentTabsState]=useState(()=>{try{return JSON.parse(localStorage.getItem("rr_recent_tabs")||"[]");}catch{return[];}});
  const NON_TRACKED_TABS=["Dashboard","Settings","Profile","AdminPanel","BugLog","AuditLog"];
  useEffect(()=>{
    if(NON_TRACKED_TABS.includes(tab))return;
    setRecentTabsState(prev=>{
      const next=[tab,...prev.filter(t=>t!==tab)].slice(0,6);
      try{localStorage.setItem("rr_recent_tabs",JSON.stringify(next));}catch{}
      return next;
    });
  },[tab]);
  const TAB_LABELS={NewVoucher:"New voucher",Files:"Inbox",Transactions:"New entry",Entries:"Voucher overview",AIBookkeeping:"AI bookkeeping",Import:"Import Excel",Accounts:"Account ledger",GeneralLedger:"General ledger",TrialBalance:"Trial balance",Reskontro:"Customer/supplier ledger",Resultat:"Income statement",BalanceSheet:"Balance sheet",VATReport:"VAT report",VATTermin:"Mva-meldinger",Reports:"Analytics",Budget:"Budget",SinkingFunds:"Sinking funds",Cheques:"Cheque tracker",InvoiceNew:"New invoice",InvoiceOverview:"Invoice overview",RecurringInvoices:"Recurring invoices",QuoteNew:"New quote",QuoteOverview:"Quotes",CompanyInfo:"Company information",Employees:"Employees",Payroll:"Payroll",POS:"Checkout",POSProducts:"POS products",Bank:"Bank",BankWhose:"Whose",Contacts:"Customers"};
  const searchInputRef=React.useRef(null);
  // Keyboard shortcuts — Ctrl/Cmd+K focuses search, Ctrl/Cmd+N jumps to New
  // Entry, Ctrl/Cmd+I jumps to New Invoice. Skipped entirely while typing in
  // any input/select/textarea so normal typing (including Cmd+A, etc.) is untouched.
  useEffect(()=>{
    const handler=(e)=>{
      const tag=(e.target.tagName||"").toLowerCase();
      const typing=tag==="input"||tag==="select"||tag==="textarea"||e.target.isContentEditable;
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){
        e.preventDefault();
        if(searchInputRef.current)searchInputRef.current.focus();
        return;
      }
      if(typing)return;
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="n"){e.preventDefault();setTab(isDesktop?"NewVoucher":"Transactions");}
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="i"){e.preventDefault();setTab("InvoiceNew");}
    };
    window.addEventListener("keydown",handler);
    return()=>window.removeEventListener("keydown",handler);
  },[]);
  // Access-level gating for the multi-tenant client-access feature. RLS
  // already enforces this server-side — this just makes the UI honest about
  // it, instead of letting someone click something they'll get blocked on.
  const canWriteEntries=currentAccessLevel==="full"||currentAccessLevel==="entries";
  const canWriteFull=currentAccessLevel==="full";
  const[expandedCat,setExpandedCat]=useState(null);
  const[expandedSubCat,setExpandedSubCat]=useState(null);
  const[reskontroDefaultType,setReskontroDefaultType]=useState("customer");
  // Auto-expand whichever sidebar category contains the current screen, so
  // arriving via a pin/shortcut/direct link doesn't leave the sidebar looking
  // like nothing is selected. Users can still manually collapse afterward.
  const TAB_TO_CATEGORY={
    NewVoucher:"voucher",Files:"voucher",Transactions:"voucher",Entries:"voucher",AIBookkeeping:"voucher",Import:"voucher",VoucherSettings:"voucher",
    Accounts:"accounting",GeneralLedger:"accounting",TrialBalance:"accounting",Reskontro:"accounting",
    Resultat:"accounting",BalanceSheet:"accounting",VATReport:"accounting",VATTermin:"accounting",VATCodes:"accounting",AccountingSettings:"accounting",
    Reports:"reports",Budget:"reports",SinkingFunds:"reports",ReportsHub:"reports",SalesPerCustomer:"reports",BalanceLists:"reports",
    AgedReskontro:"accounting",MonthlyOverview:"accounting",
    Bank:"bank",BankDashboard:"bank",BankWhose:"bank",Cheques:"bank",BankSettings:"bank",
    Contacts:"customers",ContactNew:"customers",CustomerImport:"customers",CustomerSettings:"customers",
    InvoiceNew:"invoicing",InvoiceOverview:"invoicing",RecurringInvoices:"invoicing",QuoteNew:"invoicing",QuoteOverview:"invoicing",InvoiceSettings:"invoicing",
    CompanyInfo:"company",Employees:"company",EmployeeNew:"company",Payroll:"company",Settings:"company",SAFTImport:"company",
    POS:"pos",POSProducts:"pos",POSSettings:"pos",
  };
  useEffect(()=>{
    const cat=TAB_TO_CATEGORY[tab];
    if(cat)setExpandedCat(cat);
  },[tab]);
  const[pinnedTabs,setPinnedTabsState]=useState(()=>{try{return JSON.parse(localStorage.getItem("rr_pinned_tabs")||"[]");}catch{return[];}});
  const togglePin=(tabId,label)=>{
    setPinnedTabsState(prev=>{
      const exists=prev.some(p=>p.tab===tabId);
      const next=exists?prev.filter(p=>p.tab!==tabId):[...prev,{tab:tabId,label}];
      try{localStorage.setItem("rr_pinned_tabs",JSON.stringify(next));}catch{}
      return next;
    });
  };
  const[profileMenuOpen,setProfileMenuOpen]=useState(false);
  const[downloadMenuOpen,setDownloadMenuOpen]=useState(false);
  const[screenExcelExport,setScreenExcelExport]=useState(null); // fn registered by whichever screen has its own Excel export
  // Save notifications — shown via the bell icon. A real, lightweight toast
  // system (not tied to bug reports, which live in Settings now).
  const[toasts,setToasts]=useState([]);
  const[toastPanelOpen,setToastPanelOpen]=useState(false);
  const[clientSwitcherOpen,setClientSwitcherOpen]=useState(false);
  const[companySwitcherOpen,setCompanySwitcherOpen]=useState(false);
  const[clientSwitcherSearch,setClientSwitcherSearch]=useState("");
  const[showInviteClient,setShowInviteClient]=useState(false);
  const[showAddClient,setShowAddClient]=useState(false);
  const[newClientName,setNewClientName]=useState("");
  const[creatingClient,setCreatingClient]=useState(false);
  const pushToast=(message)=>{
    const id=Date.now()+Math.random();
    setToasts(prev=>[{id,message,at:new Date().toISOString(),read:false},...prev].slice(0,20));
  };
  const unreadToastCount=toasts.filter(t=>!t.read).length;
  const markToastsRead=()=>setToasts(prev=>prev.map(t=>({...t,read:true})));
  // A brief, dismissable "Entry saved — Undo" snackbar, separate from the
  // persistent notification panel — this one's for catching a mistake in
  // the next few seconds, not a historical record.
  const[justSaved,setJustSaved]=useState(null); // {id,bilag,description}
  const justSavedTimerRef=React.useRef(null);
  const showUndoSnackbar=(txn)=>{
    if(justSavedTimerRef.current)clearTimeout(justSavedTimerRef.current);
    setJustSaved(txn);
    justSavedTimerRef.current=setTimeout(()=>setJustSaved(null),8000);
  };
  const undoJustSaved=async()=>{
    if(!justSaved)return;
    await deleteTxn(justSaved.id);
    setJustSaved(null);
    pushToast(`Undone: ${justSaved.description}`);
  };
  const[assistantOpen,setAssistantOpen]=useState(false);
  const[registrationQueue,setRegistrationQueue]=useState(null);
  // Register Bilag and the ledger drill-down are both "override" screens —
  // they sit on top of whatever tab is active without changing it, so a
  // sidebar click while either is open correctly updates `tab` but the
  // override just kept showing regardless, since nothing ever told it to
  // close. Closing both whenever tab actually changes means every sidebar
  // click genuinely navigates, no matter what was open before it.
  useEffect(()=>{setRegistrationQueue(null);setLedgerAcc(null);},[tab]);
  const[displayOptionsOpen,setDisplayOptionsOpen]=useState(false);
  const[entriesDisplayCols,setEntriesDisplayCols]=useState({date:true,accounts:true,invoiceRef:true});
  const[entriesSortKey,setEntriesSortKey]=useState("bilag");
  const[entriesShowCount,setEntriesShowCount]=useState(50);
  const[entriesSortDir,setEntriesSortDir]=useState("desc");
  const[entriesDetailTxn,setEntriesDetailTxn]=useState(null);
  const[vatTerminView,setVatTerminView]=useState(null); // null = Termin list, or {year,n} = drill-down
  const[entriesFixedBarHeight,setEntriesFixedBarHeight]=useState(90);
  const entriesFixedBarRef=React.useRef(null);
  useEffect(()=>{
    if(entriesFixedBarRef.current)setEntriesFixedBarHeight(entriesFixedBarRef.current.offsetHeight);
  });
  const deleteTxnWithUndo=(id)=>{
    const txn=transactions.find(t=>t.id===id);
    if(txn)setLastDeleted(txn);
    deleteTxn(id);
    setTimeout(()=>setLastDeleted(null),6000);
  };
  const undoDelete=()=>{
    if(!lastDeleted)return;
    addTransaction(lastDeleted);
    setLastDeleted(null);
  };
  const duplicateTransaction=(txn)=>{
    addTransaction({
      date:new Date().toISOString().split("T")[0],
      debitCode:txn.debitCode,creditCode:txn.creditCode,
      description:txn.description+" (copy)",
      amount:txn.amount,contactId:txn.contactId||null,
    });
  };




  const[entrySearch,setEntrySearch]=useState("");
  useEffect(()=>{setEntriesShowCount(50);},[entrySearch]);
  const[bankAttachments,setBankAttachmentsState]=useState(()=>{try{const saved=localStorage.getItem("rr_bank_attachments");return saved?JSON.parse(saved):{}}catch{return{};}});
  const setBankAttachments=(fn)=>{setBankAttachmentsState(prev=>{const next=typeof fn==="function"?fn(prev):fn;try{localStorage.setItem("rr_bank_attachments",JSON.stringify(next));}catch(e){}return next;});};
  const _now=new Date();
  const _y=_now.getFullYear();
  const _m=String(_now.getMonth()+1).padStart(2,"0");
  const _lastDay=new Date(_y,_now.getMonth()+1,0).getDate();
  const[filterFrom,setFilterFrom]=useState(`${_y}-${_m}-01`);
  const[filterTo,setFilterTo]=useState(`${_y}-${_m}-${String(_lastDay).padStart(2,"0")}`);
  const[reportPeriod,setReportPeriod]=useState({from:`${_y}-${_m}-01`,to:`${_y}-${_m}-${String(_lastDay).padStart(2,"0")}`});

  const getName=code=>((accounts.find(a=>a.code===code))||{name:code}).name;

  const filteredTxns=useMemo(()=>transactions.filter(t=>t.date>=filterFrom&&t.date<=filterTo),[transactions,filterFrom,filterTo]);
  const reportTxns=useMemo(()=>transactions.filter(t=>t.date>=reportPeriod.from&&t.date<=reportPeriod.to),[transactions,reportPeriod]);
  const reportIncome=useMemo(()=>{const m={};reportTxns.filter(t=>isIncomeSK(t.creditCode)).forEach(t=>{m[t.creditCode]=(m[t.creditCode]||0)+t.amount;});return m;},[reportTxns]);
  const reportExpenses=useMemo(()=>{const m={};reportTxns.filter(t=>isExpenseSK(t.debitCode)).forEach(t=>{m[t.debitCode]=(m[t.debitCode]||0)+t.amount;});return m;},[reportTxns]);
  const totalRI=Object.values(reportIncome).reduce((s,v)=>s+v,0);
  const totalRE=Object.values(reportExpenses).reduce((s,v)=>s+v,0);
  const searchedEntries=useMemo(()=>{const q=entrySearch.trim().toLowerCase();const all=[...transactions].sort((a,b)=>b.bilag-a.bilag);if(!q)return all;return all.filter(t=>fmtB(t.bilag).toLowerCase().includes(q)||t.description.toLowerCase().includes(q)||t.debitCode.includes(q)||t.creditCode.includes(q)||String(t.amount).includes(q));},[transactions,entrySearch]);

  // First-run onboarding — shown once, until the company has a name saved or
  // it's explicitly skipped. Doesn't block returning users at all.
  if(!onboardingDismissed&&!companyProfile.companyName&&!transactions.length)return(
    <OnboardingWizard companyProfile={companyProfile} saveCompanyProfile={saveCompanyProfile} accounts={accounts} onFinish={()=>{dismissOnboarding();setTab(isDesktop?"NewVoucher":"Transactions");}} onSkip={dismissOnboarding}/>
  );

  // ── Admin feature gate ── (uses global + per-user settings)
  const getFeature=(id)=>isFeatureOn(id,viewingUserId);
  // VAT/MVA features are gated by country, not the admin feature-flag system —
  // Norway keeps VAT fully on; Pakistan hides it until Pakistani tax rules
  // are built. Uses the SAME `feat.x` mechanism as every other feature gate
  // below, so nav filtering, tab routing, and the mobile "off" banner all
  // just work without special-casing VAT anywhere else.
  const isNorway=(companyProfile.country||"PK")==="NO";
  const feat={
    bank:getFeature("bank"),
    reskontro:getFeature("reskontro"),
    whose:getFeature("whose"),
    budget:getFeature("budget"),
    sinkingFunds:getFeature("sinkingFunds"),
    reports:getFeature("reports"),
    import:getFeature("import"),
    cheque:getFeature("cheque"),
    tags:getFeature("tags"),
    calcAmount:getFeature("calcAmount"),
    vat:isNorway,
  };
  // When "whose" is off for this user, every screen below simply sees an
  // empty money-source list — each already hides its own Whose UI whenever
  // that list is empty, so this one gate covers all of them.
  const effectiveMoneySources=feat.whose?moneySources:[];

  if(ledgerAcc&&!isDesktop)return(<LedgerScreen account={ledgerAcc} accounts={accounts} contacts={contacts} transactions={transactions} onBack={()=>setLedgerAcc(null)} onEditTxn={saveEdit} onDeleteTxn={deleteTxn} onReverseTxn={reverseTransaction} onMatchTxns={matchTransactions} onUnmatchTxns={unmatchTransactions} filterFrom={filterFrom} filterTo={filterTo} fetchTxnAttachments={fetchTxnAttachments} uploadInboxFile={uploadInboxFile} attachFilesToTxnEntry={attachFilesToTxnEntry} inboxFiles={inboxFiles} auditLog={auditLog} profiles={profiles} currentUserId={user?user.id:null} moneySources={effectiveMoneySources} tagTransaction={tagTransaction} fetchEntryComments={fetchEntryComments} addEntryComment={addEntryComment}/>);

  // Handle direct ledger navigation from home KPI cards — redirect to Reskontro
  if(tab==="ledger_1500"||tab==="ledger_2400"){
    if(!feat.reskontro)return(<DisabledScreen title="Reskontro" onBack={()=>setTab("Dashboard")}/>);
    const initView=tab==="ledger_1500"?"customer":"supplier";
    return(<ReskontroScreen contacts={contacts} setContacts={setContacts} transactions={transactions} matchTxns={matchTransactions} unmatchTxns={unmatchTransactions} editTxn={saveEdit} deleteTxn={deleteTxn} accounts={accounts} onBack={()=>setTab("Dashboard")} initialView={initView} fetchTxnAttachments={fetchTxnAttachments} uploadInboxFile={uploadInboxFile} attachFilesToTxnEntry={attachFilesToTxnEntry} inboxFiles={inboxFiles} auditLog={auditLog} profiles={profiles} currentUserId={user?user.id:null} moneySources={effectiveMoneySources} tagTransaction={tagTransaction} fetchEntryComments={fetchEntryComments} addEntryComment={addEntryComment}/>);
  }

  if(tab==="AdminPanel"&&!isDesktop)return isAdmin?(<AdminPanel onBack={()=>setTab("Dashboard")} profiles={profiles} onToggleActive={onToggleActive} fetchClientAccessFor={fetchClientAccessFor} grantClientAccess={grantClientAccess} revokeClientAccess={revokeClientAccess} fetchCompaniesFor={fetchCompaniesFor} fetchAccessRequests={fetchAccessRequests} dismissAccessRequest={dismissAccessRequest} resolveAccessRequestAsGranted={resolveAccessRequestAsGranted}/>):null;
  if(tab==="BugLog"&&!isDesktop)return isAdmin?(<BugLogScreen onBack={()=>setTab("Dashboard")}/>):null;
  if(tab==="AuditLog"&&!isDesktop)return(<div style={{background:T.bg,minHeight:"100vh",fontFamily:"system-ui,sans-serif",maxWidth:430,margin:"0 auto"}}><BackHeader title="Audit Trail" sub="SECURITY" onBack={()=>setTab("Dashboard")}/><div style={{padding:16}}><AuditLogScreen auditLog={auditLog} transactions={transactions}/></div></div>);
  if(tab==="Settings"&&!isDesktop)return(canWriteFull?<SettingsMenu accounts={accounts} onSave={setAccounts} onAddAccount={addAccount} onUpdateAccount={updateAccount} contacts={contacts} setContacts={setContacts} transactions={transactions} sinkingFunds={sinkingFunds} saveSinkingFunds={saveSinkingFunds} budgets={budgets} saveBudget={saveBudget} restoreBudgets={restoreBudgets} companyProfile={companyProfile} saveCompanyProfile={saveCompanyProfile} invoices={invoices} quotes={quotes} recurringInvoices={recurringInvoices} employees={employees} onBack={()=>setTab("Dashboard")} onNavigate={setTab} isAdmin={isAdmin}/>:<div style={{background:T.bg,minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,textAlign:"center"}}><i className="ti ti-lock" style={{fontSize:32,color:T.muted,marginBottom:12}}/><div style={{fontSize:14,fontWeight:700,color:T.text,marginBottom:6}}>Settings access restricted</div><div style={{fontSize:12,color:T.muted,marginBottom:16}}>Your access level for these books doesn't include Settings.</div><button onClick={()=>setTab("Dashboard")} style={{...btnRed,width:"auto",padding:"10px 20px"}}>Back to Dashboard</button></div>);
  if(tab==="Reskontro"&&!isDesktop){
    if(!feat.reskontro)return(<DisabledScreen title="Reskontro" onBack={()=>setTab("Dashboard")}/>);
    return(<ReskontroScreen contacts={contacts} setContacts={setContacts} transactions={transactions} matchTxns={matchTransactions} unmatchTxns={unmatchTransactions} editTxn={saveEdit} deleteTxn={deleteTxn} accounts={accounts} onBack={()=>setTab("Dashboard")} fetchTxnAttachments={fetchTxnAttachments} uploadInboxFile={uploadInboxFile} attachFilesToTxnEntry={attachFilesToTxnEntry} inboxFiles={inboxFiles} auditLog={auditLog} profiles={profiles} currentUserId={user?user.id:null} moneySources={effectiveMoneySources} tagTransaction={tagTransaction} fetchEntryComments={fetchEntryComments} addEntryComment={addEntryComment}/>);
  }
  if(tab==="Import"){
    if(!feat.import)return(<DisabledScreen title="Import Excel" onBack={()=>setTab("Dashboard")}/>);
    return(<ImportScreen accounts={accounts} addTransaction={addTransaction} nextBilag={nextBilag} onBack={()=>setTab("Dashboard")}/>);
  }
  if(tab==="SinkingFunds"&&!isDesktop){
    if(!feat.sinkingFunds)return(<DisabledScreen title="Sinking Funds" onBack={()=>setTab("Dashboard")}/>);
    return(<ScreenErrorBoundary name="Sinking Funds"><SinkingFundsScreen sinkingFunds={sinkingFunds} saveSinkingFunds={saveSinkingFunds} transactions={transactions} filterTo={filterTo} onBack={()=>setTab("Dashboard")}/></ScreenErrorBoundary>);
  }
  if(tab==="Budget"&&!isDesktop){
    if(!feat.budget)return(<DisabledScreen title="Budget" onBack={()=>setTab("Dashboard")}/>);
    return(<BudgetScreen accounts={accounts} transactions={transactions} budgets={budgets} saveBudget={saveBudget} saveBudgetSurplusSetting={saveBudgetSurplusSetting} sweepBudgetSurplus={sweepBudgetSurplus} sinkingFunds={sinkingFunds} filterFrom={filterFrom} filterTo={filterTo} onBack={()=>setTab("Dashboard")}/>);
  }
  if(tab==="Cheques"&&!isDesktop){
    if(!feat.cheque)return(<DisabledScreen title="Cheque Tracker" onBack={()=>setTab("Dashboard")}/>);
    return(<ChequeScreen onBack={()=>setTab("Dashboard")}/>);
  }
  if(tab==="AIBookkeeping"&&!isDesktop){
    if(!feat.aiBookkeeping)return(<DisabledScreen title="AI Bookkeeping" onBack={()=>setTab("Dashboard")}/>);
    return(<AIBookkeepingScreen accounts={accounts} contacts={contacts} setContacts={setContacts} addTransaction={addTransaction} nextBilag={nextBilag} inboxFiles={inboxFiles} uploadInboxFile={uploadInboxFile} attachFilesToTxnEntry={attachFilesToTxnEntry} onBack={()=>setTab("Dashboard")}/>);
  }
  if(tab==="Files"&&!isDesktop)return(<FilesScreen onBack={()=>setTab("Dashboard")} onNavigate={setTab} files={inboxFiles} onUpload={uploadInboxFile} onDelete={deleteInboxFileEntry} onRename={renameInboxFileEntry} onMove={moveInboxFileEntry} onCopy={copyInboxFileEntry} onMerge={mergeInboxFilesEntry} onStartRegistration={setRegistrationQueue}/>);
  if(tab==="Bank"&&!isDesktop){
    if(!feat.bank)return(<DisabledScreen title="Bank" onBack={()=>setTab("Dashboard")}/>);
    return(<div style={{background:T.bg,minHeight:"100vh",fontFamily:"system-ui,sans-serif",maxWidth:430,margin:"0 auto"}}><BackHeader title="Bank" sub="BANK ACCOUNTS" onBack={()=>setTab("Dashboard")}/><PeriodSelector from={filterFrom} to={filterTo} onChange={(f,t)=>{setFilterFrom(f);setFilterTo(t);}}/><div style={{padding:16}}><BankModule accounts={accounts} transactions={transactions} onOpenLedger={setLedgerAcc} filterFrom={filterFrom} filterTo={filterTo} attachments={bankAttachments} onAttach={(key,att)=>setBankAttachments(p=>({...p,[key]:att}))} moneySources={effectiveMoneySources} saveMoneySources={saveMoneySources} tagTransaction={tagTransaction}/></div></div>);
  }

  // Contextual export — Excel for the screens with structured tabular data
  // (Reskontro, Accounts overview, an open account ledger), PDF generically
  // for whatever's currently visible in the content area.
  const exportCurrentToExcel=()=>{
    if(screenExcelExport){screenExcelExport();setDownloadMenuOpen(false);return;}
    let aoa=[];
    let filename="export";
    if(ledgerAcc){
      const rows=[...transactions].filter(t=>t.date>=filterFrom&&t.date<=filterTo&&(t.debitCode===ledgerAcc.code||t.creditCode===ledgerAcc.code)).sort((a,b)=>a.date.localeCompare(b.date));
      aoa=[["Bilag","Date","Description","Movement"],...rows.map(t=>{
        const mv=t.debitCode===ledgerAcc.code?t.amount:-t.amount;
        return[fmtB(t.bilag),t.date,t.description,mv];
      })];
      filename=`Ledger_${ledgerAcc.code}_${filterFrom}_${filterTo}`;
    } else if(tab==="Reskontro"){
      aoa=[["Contact","Type","Bilag","Date","Description","Amount"]];
      contacts.forEach(c=>{
        const code=c.type==="customer"?"1500":"2400";
        const inBucket=cc=>getSK(cc)===code;
        transactions.filter(t=>t.contactId===c.id&&(inBucket(t.debitCode)||inBucket(t.creditCode))).forEach(t=>{
          const mv=inBucket(t.debitCode)?t.amount:-t.amount;
          aoa.push([c.name,c.type,fmtB(t.bilag),t.date,t.description,mv]);
        });
      });
      filename="Reskontro";
    } else if(tab==="Accounts"){
      aoa=[["Code","Name","Balance"]];
      accounts.forEach(a=>{
        const bal=transactions.reduce((s,t)=>{if(t.debitCode===a.code)return s+t.amount;if(t.creditCode===a.code)return s-t.amount;return s;},0);
        if(bal!==0)aoa.push([a.code,a.name,bal]);
      });
      filename="Accounts";
    } else {
      alert("Excel export isn't set up for this screen yet — try PDF instead.");
      return;
    }
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb,ws,"Export");
    XLSX.writeFile(wb,`${filename}.xlsx`);
    setDownloadMenuOpen(false);
  };
  const exportCurrentToPdf=()=>{
    // Prefer a screen's own dedicated print area (built specifically to
    // exclude filters/buttons/whatever else is on screen) over screenshotting
    // the whole content area — the generic fallback is only for tabs that
    // don't have one of these yet.
    const TAB_PRINT_AREA={TrialBalance:"trialbalance-print-area",Resultat:"resultat-print-area",BalanceSheet:"balancesheet-print-area",VATReport:"vatreport-print-area",GeneralLedger:"generalledger-print-area",Reskontro:"reskontro-print-area"};
    const targetedId=TAB_PRINT_AREA[tab];
    const el=(targetedId&&document.getElementById(targetedId))||document.getElementById("main-content-area");
    const periodEl=el&&el.querySelector(".print-only-period");
    if(periodEl)periodEl.style.display="block";
    if(el&&window.html2pdf)window.html2pdf().from(el).set({margin:20,filename:`${tab}_export.pdf`,html2canvas:{scale:2},jsPDF:{unit:"pt",format:"a4",orientation:"portrait"}}).save().then(()=>{if(periodEl)periodEl.style.display="none";});
    setDownloadMenuOpen(false);
  };
  const excelAvailable=!!ledgerAcc||tab==="Reskontro"||tab==="Accounts"||!!screenExcelExport;

  if(isDesktop)return(
    <div style={{background:"transparent",minHeight:"100vh",fontFamily:"'Plus Jakarta Sans',system-ui,-apple-system,sans-serif",display:"flex",flexDirection:"column",height:"100vh"}}>
      {/* Full-width top header — same height and color everywhere, sits above
          both the sidebar and the content area (not just to the right of the
          sidebar like before). The sidebar below it is visually distinct. */}
      <div style={{height:60,flexShrink:0,background:"rgba(255,255,255,0.7)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",borderBottom:`1px solid ${T.borderGlass}`,display:"flex",alignItems:"center",gap:10,padding:"0 18px",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0,width:220-18}}>
          <img src={LOGO_B64} style={{height:34,objectFit:"contain"}}/>
          <div>
            <div style={{fontSize:12,fontWeight:900,color:T.text,lineHeight:1.2}}>Redrock Danria</div>
            <div style={{fontSize:8,color:T.muted,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>Accountants</div>
          </div>
        </div>
        <div style={{position:"relative"}}>
          <div onClick={()=>setClientSwitcherOpen(o=>!o)} title="Switch which books you're viewing" style={{display:"flex",alignItems:"center",gap:6,background:viewingUserId!==user.id?T.accentLight:T.bg,borderRadius:20,padding:"4px 12px",cursor:"pointer",flexShrink:0,border:`1px solid ${viewingUserId!==user.id?T.accent:T.border}`}}>
            <i className="ti ti-building-store" style={{fontSize:12,color:viewingUserId!==user.id?T.accent:T.sub}}/>
            <span style={{fontSize:11,fontWeight:600,color:viewingUserId!==user.id?T.accent:T.text,whiteSpace:"nowrap"}}>{viewingUserId===user.id?"Redrock Danria":(myClientAccess.find(c=>c.clientUserId===viewingUserId)||{}).clientEmail||"Client"}</span>
            {viewingUserId===user.id&&(
              <span onClick={e=>{e.stopPropagation();setTab("CompanyInfo");}} title="Edit company information" style={{color:T.sub,fontSize:11,marginLeft:2,display:"flex",alignItems:"center"}}><i className="ti ti-settings" style={{fontSize:12}}/></span>
            )}
            <span style={{fontSize:8,color:viewingUserId!==user.id?T.accent:T.sub}}>▾</span>
          </div>
          {clientSwitcherOpen&&(<>
            <div onClick={()=>{setClientSwitcherOpen(false);setClientSwitcherSearch("");}} style={{position:"fixed",inset:0,zIndex:490}}/>
            <div style={{position:"absolute",left:0,top:36,background:"#fff",border:`1px solid ${T.border}`,borderRadius:T.radius.md,zIndex:500,minWidth:280,maxHeight:420,display:"flex",flexDirection:"column",boxShadow:"0 8px 24px rgba(20,40,40,0.12)",overflow:"hidden"}}>
              <div style={{padding:10,borderBottom:`1px solid ${T.border}`}}>
                <input autoFocus placeholder="Search company" value={clientSwitcherSearch} onChange={e=>setClientSwitcherSearch(e.target.value)} style={{...inp,width:"100%",fontSize:12}}/>
              </div>
              <div style={{overflowY:"auto"}}>
                {(()=>{
                  const initials=s=>(s||"?").trim().split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase();
                  const q=clientSwitcherSearch.trim().toLowerCase();
                  const rows=[{id:user.id,label:"Redrock Danria",sub:null},...myClientAccess.map(c=>({id:c.clientUserId,label:c.clientEmail,sub:c.accessLevel}))].filter(r=>!q||r.label.toLowerCase().includes(q));
                  return rows.map(r=>{
                    const active=viewingUserId===r.id;
                    return(
                      <div key={r.id} onClick={()=>{setViewingUserId(r.id);setClientSwitcherOpen(false);setClientSwitcherSearch("");}} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",cursor:"pointer",background:active?T.accentLight:"#fff"}}>
                        <div style={{width:26,height:26,borderRadius:"50%",background:active?T.accent:T.bg,color:active?"#fff":T.sub,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,flexShrink:0}}>{initials(r.label)}</div>
                        <span style={{fontSize:12,fontWeight:active?700:500,color:active?T.accent:T.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.label}</span>
                        {r.sub&&<span style={{fontSize:9,color:T.muted,textTransform:"capitalize",flexShrink:0}}>{r.sub}</span>}
                      </div>
                    );
                  });
                })()}
              </div>
              {isAdmin&&(
                <button onClick={()=>{setClientSwitcherOpen(false);setShowInviteClient(true);}} style={{display:"flex",alignItems:"center",gap:6,background:T.accent,color:"#fff",border:"none",borderTop:`1px solid ${T.border}`,padding:"11px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  <i className="ti ti-user-plus" style={{fontSize:14}}/>Invite new client
                </button>
              )}
            </div>
          </>)}
        </div>
        {/* Company switcher — every company under the current account, with
            a live count so a mismatch (data under a company you're not
            currently viewing) is immediately visible instead of silently
            looking like missing data. */}
        {companies.length>0&&(()=>{
          const active=companies.find(c=>c.id===activeCompanyId);
          return(
            <div style={{position:"relative",marginLeft:10}}>
              <button onClick={()=>setCompanySwitcherOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:6,background:"rgba(255,255,255,0.1)",border:"none",borderRadius:8,padding:"6px 12px",cursor:"pointer",color:"#fff"}}>
                <i className="ti ti-building-store" style={{fontSize:14}}/>
                <span style={{fontSize:12,fontWeight:700}}>{active?active.name:"Select company"}</span>
                {companies.length>1&&<span style={{fontSize:9,background:"rgba(255,255,255,0.2)",borderRadius:10,padding:"1px 6px",fontWeight:700}}>{companies.length}</span>}
                <i className="ti ti-chevron-down" style={{fontSize:12}}/>
              </button>
              {companySwitcherOpen&&(<>
                <div onClick={()=>setCompanySwitcherOpen(false)} style={{position:"fixed",inset:0,zIndex:498}}/>
                <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,zIndex:499,minWidth:240,boxShadow:"0 10px 32px rgba(0,0,0,0.18)",overflow:"hidden"}}>
                  <div style={{padding:"9px 14px",fontSize:10,color:T.muted,fontWeight:700,textTransform:"uppercase",borderBottom:`1px solid ${T.border}`}}>Your companies</div>
                  {companies.map(c=>(
                    <div key={c.id} onClick={()=>{setActiveCompanyId(c.id);setCompanySwitcherOpen(false);}} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 14px",cursor:"pointer",background:c.id===activeCompanyId?T.accentLight:"#fff",borderBottom:`1px solid ${T.border}`}}>
                      <span style={{fontSize:13,fontWeight:c.id===activeCompanyId?700:500,color:c.id===activeCompanyId?T.accent:T.text}}>{c.name}</span>
                      {c.id===activeCompanyId&&<i className="ti ti-check" style={{fontSize:14,color:T.accent}}/>}
                    </div>
                  ))}
                  <div onClick={()=>{setCompanySwitcherOpen(false);setNewClientName("");setShowAddClient(true);}} style={{display:"flex",alignItems:"center",gap:6,padding:"11px 14px",cursor:"pointer",color:T.accent,fontSize:12,fontWeight:700}}>
                    <i className="ti ti-plus" style={{fontSize:14}}/>Add client
                  </div>
                </div>
              </>)}
            </div>
          );
        })()}
        <div style={{flex:1}}/>
        {showAddClient&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:900,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>!creatingClient&&setShowAddClient(false)}>
            <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:14,maxWidth:420,width:"100%",padding:24,boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
              <div style={{fontSize:16,fontWeight:800,color:T.text,marginBottom:6}}>Add a new client</div>
              <div style={{fontSize:12,color:T.sub,marginBottom:16,lineHeight:1.5}}>Creates a separate, fully isolated set of books — nothing here is visible from any other client's company.</div>
              <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:6}}>COMPANY NAME *</div>
              {(()=>{
                const submitNewClient=async()=>{
                  if(!newClientName.trim()||!createCompany||creatingClient)return;
                  setCreatingClient(true);
                  const created=await createCompany(newClientName.trim());
                  setCreatingClient(false);
                  if(created){setShowAddClient(false);setNewClientName("");}
                };
                return(<>
                  <input autoFocus placeholder="e.g. Ventilasjonsspesialisten AS" value={newClientName} onChange={e=>setNewClientName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")submitNewClient();}} style={{...inp,marginBottom:14}}/>
                  <div style={{display:"flex",gap:8,alignItems:"flex-start",background:T.accentLight,borderRadius:10,padding:"10px 12px",marginBottom:18}}>
                    <i className="ti ti-list-check" style={{fontSize:14,color:T.accent,marginTop:1,flexShrink:0}}/>
                    <div style={{fontSize:11.5,color:T.accentHover,lineHeight:1.5}}>Starts pre-loaded with the standard Norwegian NS 4102 chart of accounts — every new client gets the same starting point, and any account can be renamed, added, or removed afterward from Accounting → Chart of accounts.</div>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button disabled={!newClientName.trim()||creatingClient} onClick={submitNewClient} style={{flex:1,background:newClientName.trim()?T.accent:T.border,color:newClientName.trim()?"#fff":T.muted,border:"none",borderRadius:8,padding:"11px",fontWeight:700,fontSize:13,cursor:newClientName.trim()&&!creatingClient?"pointer":"default",fontFamily:"inherit"}}>{creatingClient?"Creating…":"Create client"}</button>
                    <button onClick={()=>setShowAddClient(false)} disabled={creatingClient} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"11px 18px",fontWeight:600,fontSize:13,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                  </div>
                </>);
              })()}
            </div>
          </div>
        )}
        {showInviteClient&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:900,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setShowInviteClient(false)}>
            <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:14,maxWidth:440,width:"100%",padding:24,boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
              <div style={{fontSize:16,fontWeight:800,color:T.text,marginBottom:6}}>Invite a new client</div>
              <div style={{fontSize:12,color:T.sub,marginBottom:18,lineHeight:1.5}}>New clients set up their own login first, then you grant yourself (or your team) access to their books:</div>
              <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:20}}>
                <div style={{display:"flex",gap:10}}>
                  <div style={{width:22,height:22,borderRadius:"50%",background:T.accentLight,color:T.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,flexShrink:0}}>1</div>
                  <div style={{fontSize:12,color:T.text}}>Send them the sign-up link below. They create their own email + password and fill in their company info.</div>
                </div>
                <div style={{display:"flex",gap:10}}>
                  <div style={{width:22,height:22,borderRadius:"50%",background:T.accentLight,color:T.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,flexShrink:0}}>2</div>
                  <div style={{fontSize:12,color:T.text}}>Approve their account in <b>Admin Panel → Users</b> (new sign-ups start inactive until approved).</div>
                </div>
                <div style={{display:"flex",gap:10}}>
                  <div style={{width:22,height:22,borderRadius:"50%",background:T.accentLight,color:T.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,flexShrink:0}}>3</div>
                  <div style={{fontSize:12,color:T.text}}>Still in Admin Panel, grant yourself (or whichever team member is doing the bookkeeping) access to that client — they'll then show up in this dropdown for that team member too.</div>
                </div>
              </div>
              <div style={{display:"flex",gap:6,marginBottom:16}}>
                <input readOnly value={typeof window!=="undefined"?window.location.origin:""} style={{...inp,flex:1,background:T.bg,fontSize:11}}/>
                <button onClick={()=>{navigator.clipboard&&navigator.clipboard.writeText(window.location.origin);}} style={{background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"0 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Copy</button>
              </div>
              <button onClick={()=>setShowInviteClient(false)} style={{width:"100%",background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"10px",fontSize:13,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Close</button>
            </div>
          </div>
        )}
        <div style={{position:"relative",width:260}}>
          <i className="ti ti-search" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:T.muted,fontSize:13}}/>
          <input ref={searchInputRef} placeholder="Search within report…" title="Ctrl/Cmd+K to focus" value={entrySearch} onChange={e=>{setEntrySearch(e.target.value);setTab("Entries");}} style={{...inp,paddingLeft:28,height:32,fontSize:12,background:T.bg}}/>
        </div>
        <button onClick={()=>setAssistantOpen(true)} style={{display:"flex",alignItems:"center",gap:6,borderRadius:20,padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"inherit",flexShrink:0,background:"none",border:`1px solid ${T.border}`}}>
          <i className="ti ti-sparkles" style={{fontSize:13,color:T.accent}}/>Assistant
        </button>
        <div style={{position:"relative"}}>
          <button onClick={()=>setDownloadMenuOpen(o=>!o)} title="Download" style={{background:"none",border:"none",borderRadius:T.radius.sm,width:30,height:30,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <i className="ti ti-download" style={{fontSize:15,color:T.sub}}/>
          </button>
          {downloadMenuOpen&&(<>
            <div onClick={()=>setDownloadMenuOpen(false)} style={{position:"fixed",inset:0,zIndex:490}}/>
            <div style={{position:"absolute",right:0,top:36,background:"#fff",border:`1px solid ${T.border}`,borderRadius:T.radius.md,zIndex:500,minWidth:170,boxShadow:"0 8px 24px rgba(20,40,40,0.12)",overflow:"hidden"}}>
              <div onClick={exportCurrentToPdf} style={{padding:"10px 14px",fontSize:12,cursor:"pointer",borderBottom:`1px solid ${T.border}`,color:T.text,fontWeight:600}}><i className="ti ti-file-type-pdf" style={{fontSize:13,marginRight:6}}/>Download as PDF</div>
              <div onClick={excelAvailable?exportCurrentToExcel:undefined} style={{padding:"10px 14px",fontSize:12,cursor:excelAvailable?"pointer":"default",color:excelAvailable?T.text:T.muted,fontWeight:600,opacity:excelAvailable?1:0.5}}><i className="ti ti-file-type-xls" style={{fontSize:13,marginRight:6}}/>Download as Excel{!excelAvailable&&" (not on this screen)"}</div>
            </div>
          </>)}
        </div>
        <div style={{position:"relative"}}>
          <div onClick={()=>{setToastPanelOpen(o=>!o);if(!toastPanelOpen)markToastsRead();}} title="Notifications" style={{position:"relative",borderRadius:T.radius.sm,width:30,height:30,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <i className="ti ti-bell" style={{fontSize:15,color:T.sub}}/>
            {unreadToastCount>0&&<span style={{position:"absolute",top:-4,right:-4,fontSize:8,fontWeight:800,background:T.accent,color:"#fff",borderRadius:9,padding:"1px 4px",minWidth:12,textAlign:"center"}}>{unreadToastCount}</span>}
          </div>
          {toastPanelOpen&&(<>
            <div onClick={()=>setToastPanelOpen(false)} style={{position:"fixed",inset:0,zIndex:490}}/>
            <div style={{position:"absolute",right:0,top:36,background:"#fff",border:`1px solid ${T.border}`,borderRadius:T.radius.md,zIndex:500,minWidth:280,maxHeight:360,overflowY:"auto",boxShadow:"0 8px 24px rgba(20,40,40,0.12)"}}>
              <div style={{padding:"10px 14px",fontSize:11,fontWeight:800,color:T.text,textTransform:"uppercase",letterSpacing:0.4,borderBottom:`1px solid ${T.border}`}}>Notifications</div>
              {toasts.length?toasts.map(t=>(
                <div key={t.id} style={{padding:"10px 14px",fontSize:12,color:T.text,borderBottom:`1px solid ${T.border}`}}>
                  <div>{t.message}</div>
                  <div style={{fontSize:10,color:T.muted,marginTop:2}}>{new Date(t.at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
                </div>
              )):(
                <div style={{padding:"20px 14px",fontSize:12,color:T.muted,textAlign:"center"}}>Nothing yet — saved entries will show up here.</div>
              )}
            </div>
          </>)}
        </div>
        <div style={{position:"relative"}}>
          <div onClick={()=>setProfileMenuOpen(o=>!o)} style={{width:30,height:30,borderRadius:"50%",background:`linear-gradient(135deg, ${T.accent} 0%, ${T.accentHover} 100%)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff",cursor:"pointer",flexShrink:0}}>{(profile&&profile.email?profile.email[0]:"U").toUpperCase()}</div>
          {profileMenuOpen&&(<>
            <div onClick={()=>setProfileMenuOpen(false)} style={{position:"fixed",inset:0,zIndex:490}}/>
            <div style={{position:"absolute",right:0,top:36,background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,zIndex:500,minWidth:150,boxShadow:"0 8px 24px rgba(0,0,0,0.14)",overflow:"hidden"}}>
              <div onClick={()=>{setProfileMenuOpen(false);setTab("Profile");}} style={{padding:"10px 14px",fontSize:12,cursor:"pointer",borderBottom:`1px solid ${T.border}`,color:T.text,fontWeight:600}}><i className="ti ti-user" style={{fontSize:13,marginRight:6}}/>Profile</div>
              <div onClick={()=>{setProfileMenuOpen(false);setTab("Settings");}} style={{padding:"10px 14px",fontSize:12,cursor:"pointer",borderBottom:`1px solid ${T.border}`,color:T.text,fontWeight:600}}><i className="ti ti-settings" style={{fontSize:13,marginRight:6}}/>Settings</div>
              <div onClick={()=>{setProfileMenuOpen(false);onSignOut();}} style={{padding:"10px 14px",fontSize:12,cursor:"pointer",color:T.red,fontWeight:600}}><i className="ti ti-logout" style={{fontSize:13,marginRight:6}}/>Sign out</div>
            </div>
          </>)}
        </div>
      </div>

      {/* Below the header: sidebar (distinct background) + content, sharing
          the remaining vertical space. */}
      <div style={{display:"flex",flex:1,minHeight:0}}>
      {/* Persistent sidebar — same data/feature-gating as the mobile drawer, just always visible */}
      <div style={{width:220,flexShrink:0,borderRight:`1px solid ${T.borderGlass}`,background:"rgba(255,255,255,0.55)",backdropFilter:"blur(18px)",WebkitBackdropFilter:"blur(18px)",display:"flex",flexDirection:"column",height:"100%",overflowY:"auto"}}>
        <div style={{flex:1,overflowY:"auto",padding:"10px 0"}}>
          {pinnedTabs.length>0&&(
            <>
              <div style={{padding:"2px 16px 6px 13px",fontSize:9,color:T.muted,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase"}}>Favorites</div>
              {pinnedTabs.map(p=>{
                const active=tab===p.tab;
                return(
                  <div key={p.tab} onClick={()=>setTab(p.tab)} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 16px 6px 13px",cursor:"pointer",borderLeft:active?`3px solid ${T.accent}`:"3px solid transparent",background:active?T.accentLight:"transparent"}}>
                    <i className="ti ti-star-filled" style={{fontSize:12,color:active?T.accent:"#FBBF24",flexShrink:0,width:18,textAlign:"center"}}/>
                    <span style={{fontSize:12,fontWeight:active?700:400,color:active?T.accent:T.sub,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.label}</span>
                  </div>
                );
              })}
              <div style={{borderTop:`1px solid ${T.border}`,margin:"6px 16px 6px 13px"}}/>
            </>
          )}
          <div onClick={()=>setTab("Dashboard")} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 16px 7px 13px",cursor:"pointer",borderLeft:tab==="Dashboard"?`3px solid ${T.accent}`:"3px solid transparent",background:tab==="Dashboard"?T.accentLight:"transparent"}}>
            <div style={{width:24,height:24,borderRadius:8,background:tab==="Dashboard"?"linear-gradient(135deg, #0D9488 0%, #2DD4BF 100%)":"linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><i className="ti ti-home" style={{fontSize:13,color:tab==="Dashboard"?"#fff":T.sub}}/></div>
            <span style={{fontSize:12,fontWeight:tab==="Dashboard"?700:400,color:tab==="Dashboard"?T.accent:T.sub}}>Home</span>
          </div>
          {feat.bank&&(()=>{
            const bankItems=[
              {tab:"BankWhose",label:"Whose"},
              {tab:"Bank",label:"Bank reconciliation"},
              {tab:"Cheques",label:"Cheque tracker",featureKey:"cheque"},
              {tab:"BankSettings",label:"Settings"},
            ].filter(it=>!it.featureKey||feat[it.featureKey]);
            const bankExpanded=expandedCat==="bank";
            const bankActive=bankItems.some(it=>it.tab===tab);
            return(
              <div>
                <div onClick={()=>setExpandedCat(e=>e==="bank"?null:"bank")} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 16px 7px 13px",cursor:"pointer",borderLeft:bankActive&&!bankExpanded?`3px solid ${T.accent}`:"3px solid transparent",background:bankActive&&!bankExpanded?T.accentLight:"transparent"}}>
                  <div style={{width:24,height:24,borderRadius:8,background:bankActive?"linear-gradient(135deg, #0D9488 0%, #2DD4BF 100%)":"linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><i className="ti ti-building-bank" style={{fontSize:13,color:bankActive?"#fff":T.sub}}/></div>
                  <span style={{fontSize:12,fontWeight:bankActive?700:400,color:bankActive?T.accent:T.sub,flex:1}}>Bank</span>
                  <i className="ti ti-chevron-down" style={{fontSize:12,color:T.muted,transform:bankExpanded?"rotate(180deg)":"none"}}/>
                </div>
                {bankExpanded&&(
                  <div style={{marginLeft:22,paddingLeft:10,borderLeft:`1px solid ${T.border}`,marginBottom:2}}>
                    {bankItems.map(it=>{
                      const active=tab===it.tab;
                      return(
                        <div key={it.tab} onClick={()=>setTab(it.tab)} className="rr-sidebar-item" style={{padding:"6px 12px",cursor:"pointer",borderRadius:8}}>
                          <span style={{fontSize:11.5,color:active?T.accent:T.sub,fontWeight:active?700:400}}>{it.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
          {(()=>{
            const custItems=[
              {tab:"Contacts",label:"Customers/Suppliers"},
              {tab:"ContactNew",label:"New customer/supplier",requiresWrite:true},
              {tab:"CustomerSettings",label:"Settings"},
            ];
            const custExpanded=expandedCat==="customers";
            const custActive=custItems.some(it=>it.tab===tab);
            return(
              <div>
                <div onClick={()=>setExpandedCat(e=>e==="customers"?null:"customers")} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 16px 7px 13px",cursor:"pointer",borderLeft:custActive&&!custExpanded?`3px solid ${T.accent}`:"3px solid transparent",background:custActive&&!custExpanded?T.accentLight:"transparent"}}>
                  <div style={{width:24,height:24,borderRadius:8,background:custActive?"linear-gradient(135deg, #0D9488 0%, #2DD4BF 100%)":"linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><i className="ti ti-users" style={{fontSize:13,color:custActive?"#fff":T.sub}}/></div>
                  <span style={{fontSize:12,fontWeight:custActive?700:400,color:custActive?T.accent:T.sub,flex:1}}>Customers</span>
                  <i className="ti ti-chevron-down" style={{fontSize:12,color:T.muted,transform:custExpanded?"rotate(180deg)":"none"}}/>
                </div>
                {custExpanded&&(
                  <div style={{marginLeft:22,paddingLeft:10,borderLeft:`1px solid ${T.border}`,marginBottom:2}}>
                    {custItems.map(it=>{
                      const active=tab===it.tab;
                      const locked=it.requiresWrite&&!canWriteEntries;
                      return(
                        <div key={it.tab} onClick={()=>!locked&&setTab(it.tab)} title={locked?"You don't have entry access for these books":undefined} className="rr-sidebar-item" style={{padding:"6px 12px",cursor:locked?"default":"pointer",borderRadius:8,display:"flex",alignItems:"center",gap:6,opacity:locked?0.5:1}}>
                          <span style={{fontSize:11.5,color:active?T.accent:T.sub,fontWeight:active?700:400,flex:1}}>{it.label}</span>
                          {locked&&<i className="ti ti-lock" style={{fontSize:11,color:T.muted}}/>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {[
            {id:"voucher",label:"Voucher",icon:"ti-receipt-2",items:[
              {tab:"Files",label:"Inbox"},
              {tab:"NewVoucher",label:"New Entry",requiresWrite:true},
              {tab:"Entries",label:"Voucher overview"},
              {tab:"AIBookkeeping",label:"AI bookkeeping",featureKey:"aiBookkeeping",requiresWrite:true},
              {tab:"Import",label:"Import Excel",featureKey:"import",requiresWrite:true},
              {tab:"VoucherSettings",label:"Settings"},
            ]},
            {id:"invoicing",label:"Invoice",icon:"ti-file-invoice",items:[
              {tab:"InvoiceNew",label:"New invoice",requiresWrite:true},
              {tab:"InvoiceOverview",label:"Invoice overview"},
              {tab:"RecurringInvoices",label:"Recurring invoices"},
              {tab:"QuoteNew",label:"New quote",requiresWrite:true},
              {tab:"QuoteOverview",label:"Quotes"},
              {tab:"InvoiceSettings",label:"Settings"},
            ]},
            {id:"accounting",label:"Accounting",icon:"ti-book",items:[
              {tab:"GeneralLedger",label:"General ledger"},
              {tab:"TrialBalance",label:"Trial balance"},
              {tab:"Resultat",label:"Income statement"},
              {tab:"BalanceSheet",label:"Balance sheet"},
              {tab:"Reconciliation",label:"Reconciliation"},
              {label:"Customer/Supplier Ledger",featureKey:"reskontro",subItems:[
                {tab:"Reskontro",label:"Customers",param:"customer"},
                {tab:"Reskontro",label:"Suppliers",param:"supplier"},
              ]},
              {tab:"AgedReskontro",label:"Aged receivables/payables",featureKey:"reskontro"},
              {tab:"VATReport",label:"VAT report",featureKey:"vat"},
              {tab:"VATTermin",label:"Mva-meldinger",featureKey:"vat"},
              {tab:"VATCodes",label:"VAT codes",featureKey:"vat"},
              {tab:"AccountingSettings",label:"Settings"},
            ]},
            {id:"reports",label:"Reports",icon:"ti-chart-bar",items:[
              {tab:"ReportsHub",label:"Reports"},
              {tab:"Reports",label:"Analytics",featureKey:"reports"},
              {tab:"SalesPerCustomer",label:"Sales per customer"},
              {tab:"BalanceLists",label:"Balance lists"},
              {tab:"Budget",label:"Budget",featureKey:"budget"},
              {tab:"SinkingFunds",label:"Sinking funds",featureKey:"sinkingFunds"},
            ]},
            {id:"company",label:"Company",icon:"ti-building",items:[
              {tab:"CompanyInfo",label:"Company information"},
              {tab:"Accounts",label:"Chart of accounts"},
              {tab:"Employees",label:"Employees"},
              {tab:"EmployeeNew",label:"New employee",requiresWrite:true},
              {tab:"Payroll",label:"Payroll"},
              {tab:"SAFTImport",label:"Import account information",requiresWrite:true},
              {tab:"Settings",label:"Settings"},
            ]},
            {id:"pos",label:"Point of sale",icon:"ti-cash-register",items:[
              {tab:"POS",label:"Checkout"},
              {tab:"POSProducts",label:"Products"},
              {tab:"POSSettings",label:"Settings"},
            ]},
          ].map(cat=>{
            const visibleItems=cat.items.filter(it=>!it.featureKey||feat[it.featureKey]);
            if(!visibleItems.length)return null;
            const isExpanded=expandedCat===cat.id;
            const containsActive=visibleItems.some(it=>it.tab===tab||(it.subItems&&it.subItems.some(si=>si.tab===tab)));
            return(
              <div key={cat.id}>
                <div onClick={()=>{
                  const opening=expandedCat!==cat.id;
                  setExpandedCat(e=>e===cat.id?null:cat.id);
                  // Expanding a category with nothing from it currently
                  // active should also navigate to its first screen —
                  // otherwise the sidebar shows the new category open while
                  // the main content area is still stuck on whatever the
                  // previous category was showing, which reads as "this
                  // just goes to the wrong place."
                  if(opening&&!containsActive&&visibleItems[0]&&!visibleItems[0].subItems)setTab(visibleItems[0].tab);
                }} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 16px 7px 13px",cursor:"pointer",borderLeft:containsActive&&!isExpanded?`3px solid ${T.accent}`:"3px solid transparent",background:containsActive&&!isExpanded?T.accentLight:"transparent"}}>
                  <div style={{width:24,height:24,borderRadius:8,background:containsActive?"linear-gradient(135deg, #0D9488 0%, #2DD4BF 100%)":"linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <i className={`ti ${cat.icon}`} style={{fontSize:13,color:containsActive?"#fff":T.sub}}/>
                  </div>
                  <span style={{fontSize:12,fontWeight:containsActive?700:400,color:containsActive?T.accent:T.sub,flex:1}}>{cat.label}</span>
                  <i className="ti ti-chevron-down" style={{fontSize:12,color:T.muted,transition:"transform 0.15s",display:"inline-block",transform:isExpanded?"rotate(180deg)":"none"}}/>
                </div>
                {isExpanded&&(
                  <div style={{marginLeft:22,paddingLeft:10,borderLeft:`1px solid ${T.border}`,marginBottom:2}}>
                    {visibleItems.map(it=>{
                      if(it.subItems){
                        const subActive=it.subItems.some(si=>si.tab===tab);
                        const subOpen=expandedSubCat===it.label;
                        return(
                          <div key={it.label}>
                            <div onClick={()=>setExpandedSubCat(e=>e===it.label?null:it.label)} className="rr-sidebar-item" style={{padding:"6px 12px",cursor:"pointer",borderRadius:8,display:"flex",alignItems:"center",gap:6}}>
                              <span style={{fontSize:11.5,color:subActive?T.accent:T.sub,fontWeight:subActive?700:400,flex:1}}>{it.label}</span>
                              <i className="ti ti-chevron-down" style={{fontSize:10,color:T.muted,transform:subOpen?"rotate(180deg)":"none"}}/>
                            </div>
                            {subOpen&&(
                              <div style={{marginLeft:14,paddingLeft:8,borderLeft:`1px solid ${T.border}`}}>
                                {it.subItems.map(si=>{
                                  const active=tab===si.tab&&reskontroDefaultType===si.param;
                                  return(
                                    <div key={si.label} onClick={()=>{if(si.param)setReskontroDefaultType(si.param);setTab(si.tab);}} className="rr-sidebar-item" style={{padding:"5px 10px",cursor:"pointer",borderRadius:7}}>
                                      <span style={{fontSize:11,color:active?T.accent:T.sub,fontWeight:active?700:400}}>{si.label}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      }
                      const active=tab===it.tab;
                      const isPinned=pinnedTabs.some(p=>p.tab===it.tab);
                      const locked=it.requiresWrite&&!canWriteEntries;
                      return(
                        <div key={it.tab} className="rr-sidebar-item" style={{padding:"6px 12px",cursor:locked?"default":"pointer",borderRadius:8,display:"flex",alignItems:"center",gap:6,opacity:locked?0.5:1}}>
                          <span onClick={()=>!locked&&setTab(it.tab)} title={locked?"You don't have entry access for these books":undefined} style={{fontSize:11.5,color:active?T.accent:T.sub,fontWeight:active?700:400,flex:1}}>{it.label}</span>
                          {locked?(
                            <i className="ti ti-lock" style={{fontSize:11,color:T.muted,flexShrink:0}}/>
                          ):(
                            <i onClick={()=>togglePin(it.tab,it.label)} title={isPinned?"Remove from Favorites":"Add to Favorites"} className={isPinned?"ti ti-star-filled":"ti ti-star rr-sidebar-pin"} style={{fontSize:12,color:isPinned?"#FBBF24":T.muted,cursor:"pointer",flexShrink:0}}/>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <div style={{padding:"12px 16px 4px",marginTop:6,borderTop:`1px solid ${T.border}`,fontSize:9,color:T.muted,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase"}}>System</div>
          {SIDEBAR.filter(i=>i.group==="system"&&((i.id!=="AdminPanel"&&i.id!=="BugLog"&&i.id!=="AuditLog")||isAdmin)).map(item=>{
            const active=tab===item.id;
            const bugCount=item.id==="BugLog"?getBugs().filter(b=>!b.resolved).length:0;
            const tiIcon={Settings:"ti-settings",Profile:"ti-user",AdminPanel:"ti-shield-lock",BugLog:"ti-bug"}[item.id]||"ti-circle";
            return(
              <div key={item.id} onClick={()=>setTab(item.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 16px 7px 13px",cursor:"pointer",borderLeft:active?`3px solid ${T.accent}`:"3px solid transparent",background:active?T.accentLight:"transparent"}}>
                <i className={`ti ${tiIcon}`} style={{fontSize:16,width:18,textAlign:"center",color:active?T.accent:T.sub}}/>
                <span style={{fontSize:12,fontWeight:active?700:400,color:active?T.accent:T.sub,flex:1}}>{item.label}</span>
                {bugCount>0&&<span style={{fontSize:9,fontWeight:800,background:"#dc2626",color:"#fff",borderRadius:10,padding:"2px 6px"}}>{bugCount}</span>}
              </div>
            );
          })}
        </div>
        <div style={{padding:"12px 16px",borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:9,color:T.muted}}>PKR · v2.2</div>
          <button onClick={onSignOut} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,color:T.sub,fontSize:10,cursor:"pointer",padding:"4px 10px",fontWeight:600}}>Sign out</button>
        </div>
      </div>

      <div id="main-content-area" style={{flex:1,minWidth:0,padding:"26px 32px",overflowY:"auto",height:"100%"}}>
        {assistantOpen&&<AssistantPanel onClose={()=>setAssistantOpen(false)}/>}

        {currentAccessLevel!=="full"&&(
          <div style={{background:currentAccessLevel==="readonly"?"#FFF8EC":T.accentLight,border:`1px solid ${currentAccessLevel==="readonly"?"#F5C563":T.accent}`,borderRadius:10,padding:"10px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:8,fontSize:12,color:T.text}}>
            <i className="ti ti-lock" style={{fontSize:14,color:currentAccessLevel==="readonly"?"#B45309":T.accent}}/>
            {currentAccessLevel==="readonly"&&"You have read-only access to these books — nothing here can be edited."}
            {currentAccessLevel==="reports"&&"You have reports-only access — you can view reports and ledgers, but can't add or edit entries."}
            {currentAccessLevel==="entries"&&"You have entries access — you can add and edit entries, but can't change settings or delete records."}
          </div>
        )}

        {registrationQueue?(
          <RegisterVoucherQueueScreen fileIds={registrationQueue} inboxFiles={inboxFiles} accounts={accounts} contacts={contacts} addTransaction={addTransactionNotified} renameInboxFileEntry={renameInboxFileEntry} onDone={()=>setRegistrationQueue(null)} setAccounts={setAccounts}/>
        ):ledgerAcc?(
          <LedgerDrilldownScreen account={ledgerAcc} accounts={accounts} contacts={contacts} transactions={transactions} filterFrom={filterFrom} filterTo={filterTo} onEditTxn={saveEdit} onReverseTxn={reverseTransaction} onMatchTxns={matchTransactions} onUnmatchTxns={unmatchTransactions} fetchTxnAttachments={fetchTxnAttachments} uploadInboxFile={uploadInboxFile} attachFilesToTxnEntry={attachFilesToTxnEntry} inboxFiles={inboxFiles} auditLog={auditLog} profiles={profiles} currentUserId={user?user.id:null} moneySources={effectiveMoneySources} tagTransaction={tagTransaction} onClose={()=>setLedgerAcc(null)} fetchEntryComments={fetchEntryComments} addEntryComment={addEntryComment}/>
        ):(<>

        {tab==="Dashboard"&&<DesktopDashboard transactions={transactions} accounts={accounts} contacts={contacts} budgets={budgets} onNavigate={setTab} recentTabs={recentTabs} tabLabels={TAB_LABELS} auditLog={auditLog}/>}

        {tab==="Entries"&&(
          <div style={{maxWidth:1000}}>
            {(()=>{
              const sortKey=entriesSortKey, sortDir=entriesSortDir;
              const toggleSort=(k)=>{if(sortKey===k)setEntriesSortDir(d=>d==="asc"?"desc":"asc");else{setEntriesSortKey(k);setEntriesSortDir("desc");}};
              const sorted=[...searchedEntries].sort((a,b)=>{
                const mul=sortDir==="asc"?1:-1;
                if(sortKey==="amount")return(a.amount-b.amount)*mul;
                if(sortKey==="bilag")return(a.bilag-b.bilag)*mul;
                if(sortKey==="date")return a.date.localeCompare(b.date)*mul;
                return 0;
              });
              const cols=entriesDisplayCols;
              const headers=[
                {key:"bilag",label:"Bilag",always:true},
                {key:"date",label:"Date",show:cols.date},
                {key:"",label:"Debit",show:cols.accounts},{key:"",label:"Credit",show:cols.accounts},
                {key:"",label:"Description",always:true},
                {key:"",label:"Invoice / Due",show:cols.invoiceRef},
                {key:"amount",label:"Amount",always:true},
              ].filter(h=>h.always||h.show);
              return(<>
                <div ref={entriesFixedBarRef} style={{position:"fixed",top:60,left:220,right:0,zIndex:50,background:T.bg,padding:"16px 32px 8px"}}>
                <div style={{maxWidth:1000}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontSize:12,color:T.muted,fontWeight:600}}>{sorted.length} entries</div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <div style={{position:"relative"}}>
                      <button onClick={()=>setDisplayOptionsOpen(o=>!o)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:600,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Display options</button>
                      {displayOptionsOpen&&(<>
                        <div onClick={()=>setDisplayOptionsOpen(false)} style={{position:"fixed",inset:0,zIndex:490}}/>
                        <div style={{position:"absolute",right:0,top:36,background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,zIndex:500,minWidth:220,boxShadow:"0 8px 24px rgba(0,0,0,0.14)",padding:14}}>
                          <div style={{fontSize:12,fontWeight:800,color:T.text,marginBottom:10}}>Display options</div>
                          {[["date","Show date"],["accounts","Show debit/credit accounts"],["invoiceRef","Show invoice no. / due date"]].map(([key,label])=>(
                            <label key={key} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:T.sub,padding:"6px 0",cursor:"pointer"}}>
                              <input type="checkbox" checked={cols[key]} onChange={()=>setEntriesDisplayCols(p=>({...p,[key]:!p[key]}))}/>{label}
                            </label>
                          ))}
                        </div>
                      </>)}
                    </div>
                    <div style={{position:"relative",width:220}}>
                      <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:T.muted,fontSize:12}}>🔍</span>
                      <input placeholder="Search bilag, description, account" value={entrySearch} onChange={e=>setEntrySearch(e.target.value)} style={{...inp,paddingLeft:30,height:32,fontSize:12}}/>
                    </div>
                  </div>
                </div>
                {/* Shadow header — physically attached to the filter row with
                    zero gap (same technique as Trial Balance/Reskontro), so
                    sorting stays clickable right here while it's the part
                    that stays fixed on scroll. */}
                <table style={{width:"100%",fontSize:13,borderCollapse:"collapse",background:"#fff",borderRadius:"10px 10px 0 0",border:`1px solid ${T.border}`,borderBottom:"none"}}>
                  <tbody><tr style={{color:T.muted,fontSize:11}}>
                    {headers.map(h=>(
                      <td key={h.label} onClick={h.key?()=>toggleSort(h.key):undefined} style={{padding:"8px 8px 8px 14px",cursor:h.key?"pointer":"default",textAlign:h.label==="Amount"?"right":"left",userSelect:"none"}}>
                        {h.label}{sortKey===h.key&&h.key&&<span style={{marginLeft:3}}>{sortDir==="asc"?"▲":"▼"}</span>}
                      </td>
                    ))}
                  </tr></tbody>
                </table>
                </div>
                </div>
                <div style={{height:entriesFixedBarHeight}}/>
                <table style={{width:"100%",fontSize:13,borderCollapse:"collapse",background:"#fff",border:`1px solid ${T.border}`,borderTop:"none",borderRadius:"0 0 10px 10px",marginTop:-1}}>
                  <tbody>
                    {sorted.slice(0,entriesShowCount).map(t=>{
                      const isRev=!!t.reversalOf;
                      const isMatched=!!t.matchedWith;
                      return(
                        <tr key={t.id} className="rr-table-row" onClick={()=>setEntriesDetailTxn(t)} style={{borderTop:`1px solid ${T.border}`,cursor:"pointer",opacity:t.reversedBy?0.5:1}}>
                          <td style={{padding:"8px 8px 8px 14px",color:T.accent,fontWeight:700}}>{fmtB(t.bilag)}{isMatched&&<span title="Matched" style={{marginLeft:4,color:T.green}}>✓</span>}</td>
                          {cols.date&&<td style={{color:T.sub}}>{t.date}</td>}
                          {cols.accounts&&<td style={{color:T.red,fontSize:11}}>{t.debitCode}</td>}
                          {cols.accounts&&<td style={{color:T.green,fontSize:11}}>{t.creditCode}</td>}
                          <td style={{color:isRev?T.red:T.text,fontStyle:isRev?"italic":"normal",maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</td>
                          {cols.invoiceRef&&<td style={{fontSize:11,color:T.muted}}>{t.invoiceNo||""}{t.dueDate?(t.invoiceNo?" · ":"")+t.dueDate:""}</td>}
                          <td style={{textAlign:"right",fontWeight:700,padding:"8px 14px 8px 8px"}}>{fmt(t.amount)}</td>
                        </tr>
                      );
                    })}
                    {!sorted.length&&<tr><td colSpan={headers.length} style={{padding:"24px 0",textAlign:"center",color:T.muted}}>No entries match this search.</td></tr>}
                  </tbody>
                </table>
                {sorted.length>entriesShowCount&&(
                  <div style={{textAlign:"center",padding:"14px 0"}}>
                    <button onClick={()=>setEntriesShowCount(c=>c+50)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 20px",fontSize:12,fontWeight:600,color:T.accent,cursor:"pointer",fontFamily:"inherit"}}>Load more ({sorted.length-entriesShowCount} remaining)</button>
                  </div>
                )}
              </>);
            })()}
            {entriesDetailTxn&&(
              <DetailModal txn={entriesDetailTxn} accounts={accounts} contacts={contacts} auditLog={auditLog} profiles={profiles} currentUserId={user?user.id:null} moneySources={effectiveMoneySources} tagTransaction={tagTransaction}
                fetchTxnAttachments={fetchTxnAttachments} uploadInboxFile={uploadInboxFile} attachFilesToTxnEntry={attachFilesToTxnEntry} inboxFiles={inboxFiles} fetchEntryComments={fetchEntryComments} addEntryComment={addEntryComment}
                onEdit={u=>{saveEdit(u);setEntriesDetailTxn(null);}}
                onDelete={id=>{deleteTxnWithUndo(id);setEntriesDetailTxn(null);}}
                onReverse={tx=>{reverseTransaction(tx);setEntriesDetailTxn(null);}}
                onDuplicate={duplicateTransaction}
                onClose={()=>setEntriesDetailTxn(null)}/>
            )}
          </div>
        )}

        {tab==="AIBookkeeping"&&(
          feat.aiBookkeeping
            ?<div style={{maxWidth:700}}><AIBookkeepingScreen accounts={accounts} contacts={contacts} setContacts={setContacts} addTransaction={addTransaction} nextBilag={nextBilag} inboxFiles={inboxFiles} uploadInboxFile={uploadInboxFile} attachFilesToTxnEntry={attachFilesToTxnEntry} onBack={()=>setTab("Dashboard")} isDesktop={true}/></div>
            :<DisabledScreen title="AI Bookkeeping" onBack={()=>setTab("Dashboard")}/>
        )}

        {tab==="NewVoucher"&&(
          <div style={{maxWidth:1400}}>
            <NewEntryForm accounts={accounts} contacts={contacts} setContacts={setContacts} nextBilag={nextBilag} feat={feat} sinkingFunds={sinkingFunds} saveSinkingFunds={saveSinkingFunds} inboxFiles={inboxFiles} uploadInboxFile={uploadInboxFile} transactions={transactions} moneySources={effectiveMoneySources} tagTransaction={tagTransaction} isDesktop={true} projects={projects} trackProjects={!!companyProfile.trackProjects} saveProjects={saveProjects} onSave={async(form)=>{const r=await addTransactionNotified(form);setTab("Dashboard");return r;}} addEntryComment={addEntryComment}/>
          </div>
        )}

        {tab==="Accounts"&&(
          <div style={{maxWidth:700}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#EEF4F3",padding:"10px 14px",borderRadius:"10px 10px 0 0",border:`1px solid ${T.border}`,borderBottom:"none"}}>
              <div style={{fontSize:11,color:"#111827",fontWeight:800,textTransform:"uppercase"}}>Accounts</div>
              <div style={{fontSize:11,color:"#111827",fontWeight:800,textTransform:"uppercase"}}>Amounts</div>
            </div>
            <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:"0 0 10px 10px",overflow:"hidden"}}>
              {[...accounts].sort((a,b)=>a.code.localeCompare(b.code)).map(a=>{
                const openingBal=transactions.filter(t=>t.date<filterFrom).reduce((sum,t)=>{if(t.debitCode===a.code)return sum+t.amount;if(t.creditCode===a.code)return sum-t.amount;return sum;},0);
                const periodMov=transactions.filter(t=>t.date>=filterFrom&&t.date<=filterTo).reduce((sum,t)=>{if(t.debitCode===a.code)return sum+t.amount;if(t.creditCode===a.code)return sum-t.amount;return sum;},0);
                const closingBal=openingBal+periodMov;
                if(closingBal===0)return null;
                return(
                  <div key={a.code} className="rr-table-row" onClick={()=>setLedgerAcc(a)} style={{padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,cursor:"pointer",borderBottom:`1px solid ${T.border}`,background:"#fff"}}>
                    <div style={{fontSize:13,fontWeight:700,color:T.accent}}>{a.code} {a.name}</div>
                    <div style={{fontSize:13,fontWeight:800,color:T.text}}>{closingBal>=0?"+":"-"}{fmt(Math.abs(closingBal))}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(tab==="Contacts"||tab==="ContactNew")&&(
          <div style={{maxWidth:900}}>
            <ScreenErrorBoundary name="Customers/Suppliers">
              <CustomersRegisterScreen contacts={contacts} setContacts={setContacts} transactions={transactions} mergeContacts={mergeContacts} onOpenReskontro={(type)=>setTab("Reskontro")} autoOpenNew={tab==="ContactNew"} companyProfile={companyProfile} onNavigateImport={()=>setTab("CustomerImport")}/>
            </ScreenErrorBoundary>
          </div>
        )}

        {tab==="OpeningBalance"&&(
          <ScreenErrorBoundary name="Opening Balance">
            <OpeningBalanceScreen accounts={accounts} contacts={contacts} setContacts={setContacts} transactions={transactions} addTransaction={addTransactionNotified} onSave={setAccounts} onBack={()=>setTab("Settings")} uploadInboxFile={uploadInboxFile}/>
          </ScreenErrorBoundary>
        )}

        {tab==="ProjectTracking"&&(
          <ScreenErrorBoundary name="Project Tracking">
            <ProjectTrackingScreen companyProfile={companyProfile} saveCompanyProfile={saveCompanyProfile} projects={projects} saveProjects={saveProjects} transactions={transactions} onBack={()=>setTab("Settings")}/>
          </ScreenErrorBoundary>
        )}

        {tab==="Reconciliation"&&(
          <ScreenErrorBoundary name="Reconciliation">
            <ReconciliationScreen accounts={accounts} transactions={transactions} reconciliationStatus={reconciliationStatus} saveReconciliationStatus={saveReconciliationStatus} reconciliationFiles={reconciliationFiles} attachReconciliationFile={attachReconciliationFile} removeReconciliationFile={removeReconciliationFile} inboxFiles={inboxFiles} uploadInboxFile={uploadInboxFile} profiles={profiles} isDesktop={isDesktop}/>
          </ScreenErrorBoundary>
        )}

        {tab==="CustomerImport"&&<CustomerImportScreen contacts={contacts} setContacts={setContacts}/>}
        {tab==="CustomerSettings"&&<CustomerSettingsScreen contacts={contacts}/>}
        {tab==="VoucherSettings"&&<VoucherSettingsScreen companyProfile={companyProfile}/>}
        {tab==="InvoiceSettings"&&<InvoiceSettingsScreen companyProfile={companyProfile} saveCompanyProfile={saveCompanyProfile}/>}
        {tab==="AccountingSettings"&&<AccountingSettingsScreen onNavigate={setTab}/>}
        {tab==="VATCodes"&&<div style={{maxWidth:900}}>{feat.vat?<VATCodesScreen accounts={accounts}/>:<DisabledScreen title="VAT codes" onBack={()=>setTab("Dashboard")}/>}</div>}
        {tab==="BankSettings"&&<BankSettingsScreen accounts={accounts} onSaveAccounts={setAccounts}/>}
        {tab==="POSSettings"&&<POSSettingsScreen accounts={accounts}/>}
        {tab==="SAFTImport"&&<SAFTImportScreen accounts={accounts} setAccounts={setAccounts} contacts={contacts} setContacts={setContacts} addTransaction={addTransactionNotified}/>}
        {tab==="ReportsHub"&&<ScreenErrorBoundary name="Reports"><ReportsHubScreen onNavigate={setTab}/></ScreenErrorBoundary>}
        {tab==="SalesPerCustomer"&&<ScreenErrorBoundary name="Sales per Customer"><SalesPerCustomerScreen transactions={transactions} contacts={contacts}/></ScreenErrorBoundary>}
        {tab==="AgedReskontro"&&(feat.reskontro?<ScreenErrorBoundary name="Aged Reskontro"><AgedReskontroScreen contacts={contacts} transactions={transactions}/></ScreenErrorBoundary>:<DisabledScreen title="Aged Reskontro" onBack={()=>setTab("Dashboard")}/>)}
        {tab==="BalanceLists"&&<ScreenErrorBoundary name="Balance Lists"><BalanceListsScreen contacts={contacts} transactions={transactions} employees={employees}/></ScreenErrorBoundary>}

        {tab==="Reskontro"&&(
          feat.reskontro
            ?<div style={{maxWidth:1000}}><ReskontroDesktopScreen key={reskontroDefaultType} contacts={contacts} setContacts={setContacts} transactions={transactions} accounts={accounts} matchTxns={matchTransactions} unmatchTxns={unmatchTransactions} onOpenLedger={(acct,from,to)=>{setFilterFrom(from);setFilterTo(to);setLedgerAcc(acct);}} registerExcelExport={fn=>setScreenExcelExport(()=>fn)} defaultType={reskontroDefaultType} auditLog={auditLog} profiles={profiles} currentUserId={user?user.id:null} onNavigate={setTab}/></div>
            :<DisabledScreen title="Reskontro" onBack={()=>setTab("Dashboard")}/>
        )}

        {(tab==="BankDashboard"||tab==="BankWhose")&&(
          feat.bank
            ?<BankDashboardScreen accounts={accounts} transactions={transactions} invoices={invoices} contacts={contacts} onOpenLedger={(acct,from,to)=>{setFilterFrom(from);setFilterTo(to);setLedgerAcc(acct);}} moneySources={effectiveMoneySources} saveMoneySources={saveMoneySources} tagTransaction={tagTransaction} onSaveAccounts={setAccounts}/>
            :<DisabledScreen title="Bank" onBack={()=>setTab("Dashboard")}/>
        )}

        {tab==="Bank"&&(
          feat.bank
            ?<BankReconciliationScreen accounts={accounts} contacts={contacts} transactions={transactions} bankStatementLines={bankStatementLines} uploadBankStatement={uploadBankStatement} parseBankStatementFile={parseBankStatementFile} commitBankStatementRows={commitBankStatementRows} undoBankImport={undoBankImport} postBankStatementLine={postBankStatementLine} postBankStatementLinesBulk={postBankStatementLinesBulk} deleteBankStatementLine={deleteBankStatementLine} matchBankStatementLine={matchBankStatementLine} unmatchBankStatementLine={unmatchBankStatementLine} toggleReconciled={toggleReconciled} onEditTxn={saveEdit} onDeleteTxn={deleteTxn} onReverseTxn={reverseTransaction} fetchTxnAttachments={fetchTxnAttachments} uploadInboxFile={uploadInboxFile} attachFilesToTxnEntry={attachFilesToTxnEntry} inboxFiles={inboxFiles} fetchEntryComments={fetchEntryComments} addEntryComment={addEntryComment} auditLog={auditLog} profiles={profiles} currentUserId={user?user.id:null} moneySources={effectiveMoneySources} tagTransaction={tagTransaction} attachments={bankAttachments} onAttach={(key,att)=>setBankAttachments(p=>({...p,[key]:att}))} onRemoveAttach={key=>setBankAttachments(p=>{const n={...p};delete n[key];return n;})} addTransaction={addTransactionNotified} onSaveAccounts={setAccounts} onNavigate={setTab}/>
            :<DisabledScreen title="Bank" onBack={()=>setTab("Dashboard")}/>
        )}

        {tab==="Files"&&(
          <FilesScreen onBack={()=>setTab("Dashboard")} onNavigate={setTab} files={inboxFiles} onUpload={uploadInboxFile} onDelete={deleteInboxFileEntry} onRestore={restoreInboxFileEntry} onPermanentDelete={permanentlyDeleteInboxFileEntry} onRename={renameInboxFileEntry} onMove={moveInboxFileEntry} onCopy={copyInboxFileEntry} onMerge={mergeInboxFilesEntry} isDesktop={true} onStartRegistration={setRegistrationQueue}/>
        )}

        {tab==="GeneralLedger"&&(
          <div style={{maxWidth:1000}}>
            <ScreenErrorBoundary name="General Ledger">
              <GeneralLedgerScreen accounts={accounts} transactions={transactions} onOpenLedger={setLedgerAcc} attachedTxnIds={attachedTxnIds}/>
            </ScreenErrorBoundary>
          </div>
        )}

        {tab==="VATReport"&&(
          <div style={{maxWidth:1000}}>
            {feat.vat?<ScreenErrorBoundary name="VAT Report"><VATReportScreen invoices={invoices} contacts={contacts} transactions={transactions}/></ScreenErrorBoundary>:<DisabledScreen title="VAT report" onBack={()=>setTab("Dashboard")}/>}
          </div>
        )}

        {tab==="VATTermin"&&(
          !feat.vat?<DisabledScreen title="Mva-meldinger" onBack={()=>setTab("Dashboard")}/>
          :<ScreenErrorBoundary name="Mva-meldinger">
            {vatTerminView
              ?<VATTerminDetailScreen termin={vatTerminView} transactions={transactions} accounts={accounts} contacts={contacts} onBack={()=>setVatTerminView(null)} detailModalProps={{
                  auditLog,profiles,currentUserId:user?user.id:null,moneySources:effectiveMoneySources,tagTransaction,
                  fetchTxnAttachments,uploadInboxFile,attachFilesToTxnEntry,inboxFiles,fetchEntryComments,addEntryComment,
                  onEdit:saveEdit,onDelete:deleteTxnWithUndo,onReverse:reverseTransaction,onDuplicate:duplicateTransaction,
                }}/>
              :<VATTerminScreen transactions={transactions} accounts={accounts} contacts={contacts} onOpenTermin={setVatTerminView}/>}
          </ScreenErrorBoundary>
        )}

        {tab==="MonthlyOverview"&&(
          <div style={{maxWidth:1000}}>
            <ScreenErrorBoundary name="Monthly Overview">
              <MonthlyOverviewScreen accounts={accounts} transactions={transactions} onOpenLedger={(acct,from,to)=>{setFilterFrom(from);setFilterTo(to);setLedgerAcc(acct);}} budgets={budgets} moneySources={effectiveMoneySources}/>
            </ScreenErrorBoundary>
          </div>
        )}

        {tab==="Resultat"&&(
          <div style={{maxWidth:1000}}>
            <ScreenErrorBoundary name="Income Statement">
              <ResultatScreen accounts={accounts} transactions={transactions} onOpenLedger={(acct,from,to)=>{setFilterFrom(from);setFilterTo(to);setLedgerAcc(acct);}} isDesktop={isDesktop} projects={projects}/>
            </ScreenErrorBoundary>
          </div>
        )}

        {tab==="BalanceSheet"&&(
          <div style={{maxWidth:1000}}>
            <ScreenErrorBoundary name="Balance Sheet">
              <BalanceSheetScreen accounts={accounts} transactions={transactions} onOpenLedger={(acct,from,to)=>{setFilterFrom(from);setFilterTo(to);setLedgerAcc(acct);}} isDesktop={isDesktop}/>
            </ScreenErrorBoundary>
          </div>
        )}

        {tab==="TrialBalance"&&(
          <div style={{maxWidth:1000}}>
            <ScreenErrorBoundary name="Trial Balance">
              <TrialBalanceScreen accounts={accounts} transactions={transactions} onOpenLedger={(acct,from,to)=>{setFilterFrom(from);setFilterTo(to);setLedgerAcc(acct);}} onSaveAccounts={setAccounts} registerExcelExport={fn=>setScreenExcelExport(()=>fn)} isDesktop={isDesktop}/>
            </ScreenErrorBoundary>
          </div>
        )}

        {tab==="InvoiceNew"&&(
          <div style={{maxWidth:1000}}>
            <InvoiceFormScreen accounts={accounts} contacts={contacts} companyProfile={companyProfile} nextInvoiceNo={nextInvoiceNo} createInvoice={createInvoice} transactions={transactions} onDone={()=>setTab("InvoiceOverview")} posProducts={posProducts} onManageProducts={()=>setTab("POSProducts")}/>
          </div>
        )}

        {tab==="QuoteNew"&&(
          <div style={{maxWidth:600}}>
            <QuoteFormScreen accounts={accounts} contacts={contacts} companyProfile={companyProfile} nextQuoteNo={nextQuoteNo} createQuote={createQuote} onDone={()=>setTab("QuoteOverview")}/>
          </div>
        )}

        {tab==="QuoteOverview"&&(
          <div style={{maxWidth:900}}>
            <QuoteOverviewScreen quotes={quotes} contacts={contacts} createQuote={createQuote} updateQuoteStatus={updateQuoteStatus} deleteQuote={deleteQuote} convertQuoteToInvoice={convertQuoteToInvoice} onNewQuote={()=>setTab("QuoteNew")} onViewInvoice={()=>setTab("InvoiceOverview")}/>
          </div>
        )}

        {tab==="AuditLog"&&(
          <div style={{maxWidth:1000}}>
            <AuditLogScreen auditLog={auditLog} transactions={transactions}/>
          </div>
        )}

        {tab==="BugLog"&&(isAdmin?<BugLogScreen onBack={()=>setTab("Settings")} isDesktop={true}/>:null)}

        {tab==="CompanyInfo"&&<CompanyInfoScreen companyProfile={companyProfile} saveCompanyProfile={saveCompanyProfile} requestRedrockAccess={requestRedrockAccess} isViewingOwnBooks={viewingUserId===user.id}/>}

        {tab==="AdminPanel"&&(isAdmin?<AdminPanel onBack={()=>setTab("Dashboard")} profiles={profiles} onToggleActive={onToggleActive} fetchClientAccessFor={fetchClientAccessFor} grantClientAccess={grantClientAccess} revokeClientAccess={revokeClientAccess} fetchCompaniesFor={fetchCompaniesFor} fetchAccessRequests={fetchAccessRequests} dismissAccessRequest={dismissAccessRequest} resolveAccessRequestAsGranted={resolveAccessRequestAsGranted} isDesktop={true}/>:null)}

        {(tab==="Employees"||tab==="EmployeeNew")&&(
          <div style={{maxWidth:900}}>
            <EmployeesScreen employees={employees} createEmployee={createEmployee} updateEmployee={updateEmployee} deleteEmployee={deleteEmployee} autoOpenNew={tab==="EmployeeNew"}/>
          </div>
        )}

        {tab==="Payroll"&&(
          <div style={{maxWidth:900}}>
            <PayrollScreen employees={employees} payrollRuns={payrollRuns} accounts={accounts} createPayrollRun={createPayrollRun} deletePayrollRun={deletePayrollRun} companyProfile={companyProfile}/>
          </div>
        )}

        {tab==="POS"&&(
          <div style={{maxWidth:1000}}>
            <POSScreen posProducts={posProducts} accounts={accounts} transactions={transactions} completeSale={completeSale} onManageProducts={()=>setTab("POSProducts")}/>
          </div>
        )}

        {tab==="POSProducts"&&(
          <div style={{maxWidth:900}}>
            <POSProductsScreen posProducts={posProducts} accounts={accounts} createPosProduct={createPosProduct} updatePosProduct={updatePosProduct} deletePosProduct={deletePosProduct} onBack={()=>setTab("POS")}/>
          </div>
        )}

        {tab==="RecurringInvoices"&&(
          <div style={{maxWidth:900}}>
            <RecurringInvoicesScreen recurringInvoices={recurringInvoices} contacts={contacts} accounts={accounts} createRecurringInvoice={createRecurringInvoice} updateRecurringInvoice={updateRecurringInvoice} deleteRecurringInvoice={deleteRecurringInvoice} generateRecurringInvoicesForMonth={generateRecurringInvoicesForMonth}/>
          </div>
        )}

        {tab==="InvoiceOverview"&&(
          <div style={{maxWidth:900}}>
            <InvoiceOverviewScreen invoices={invoices} contacts={contacts} accounts={accounts} companyProfile={companyProfile} updateInvoiceStatus={updateInvoiceStatus} deleteInvoice={deleteInvoice} registerInvoicePayment={registerInvoicePayment} createCreditNote={createCreditNote} getInvoicePaid={getInvoicePaid} onNewInvoice={()=>setTab("InvoiceNew")}/>
          </div>
        )}

        {tab==="Budget"&&(
          feat.budget
            ?<div style={{maxWidth:1000}}><BudgetScreen accounts={accounts} transactions={transactions} budgets={budgets} saveBudget={saveBudget} saveBudgetSurplusSetting={saveBudgetSurplusSetting} sweepBudgetSurplus={sweepBudgetSurplus} sinkingFunds={sinkingFunds} filterFrom={filterFrom} filterTo={filterTo} onBack={()=>setTab("Dashboard")} isDesktop={true} onOpenLedger={setLedgerAcc}/></div>
            :<DisabledScreen title="Budget" onBack={()=>setTab("Dashboard")}/>
        )}

        {tab==="SinkingFunds"&&(
          feat.sinkingFunds
            ?<div style={{maxWidth:900}}><ScreenErrorBoundary name="Sinking Funds"><SinkingFundsScreen sinkingFunds={sinkingFunds} saveSinkingFunds={saveSinkingFunds} transactions={transactions} filterTo={filterTo} onBack={()=>setTab("Dashboard")} isDesktop={true}/></ScreenErrorBoundary></div>
            :<DisabledScreen title="Sinking Funds" onBack={()=>setTab("Dashboard")}/>
        )}

        {tab==="Cheques"&&(
          feat.cheque
            ?<ChequeScreen onBack={()=>setTab("Dashboard")} isDesktop={true}/>
            :<DisabledScreen title="Cheque Tracker" onBack={()=>setTab("Dashboard")}/>
        )}

        {tab==="Reports"&&(
          <div style={{maxWidth:1000}}>
            {feat.reports?<ReportsScreen accounts={accounts} transactions={transactions} getName={getName} filterFrom={filterFrom} filterTo={filterTo} sinkingFunds={sinkingFunds} budgets={budgets} onChangePeriod={(f,t)=>{setFilterFrom(f);setFilterTo(t);}} isDesktop={true}/>:<DisabledScreen title="Reports" onBack={()=>setTab("Dashboard")}/>}
          </div>
        )}

        {tab==="Settings"&&(canWriteFull?<div style={{maxWidth:settingsWide?"100%":900}}><SettingsMenu accounts={accounts} onSave={setAccounts} onAddAccount={addAccount} onUpdateAccount={updateAccount} contacts={contacts} setContacts={setContacts} transactions={transactions} sinkingFunds={sinkingFunds} saveSinkingFunds={saveSinkingFunds} budgets={budgets} saveBudget={saveBudget} restoreBudgets={restoreBudgets} companyProfile={companyProfile} saveCompanyProfile={saveCompanyProfile} invoices={invoices} quotes={quotes} recurringInvoices={recurringInvoices} employees={employees} onBack={()=>setTab("Dashboard")} onNavigate={setTab} isAdmin={isAdmin} isDesktop={true} onWideChange={setSettingsWide}/></div>:<div style={{background:"#fff",borderRadius:14,border:`1px solid ${T.border}`,padding:40,textAlign:"center",maxWidth:500}}><i className="ti ti-lock" style={{fontSize:32,color:T.muted,marginBottom:12}}/><div style={{fontSize:14,fontWeight:700,color:T.text,marginBottom:6}}>Settings access restricted</div><div style={{fontSize:12,color:T.muted}}>Your access level for these books doesn't include Settings.</div></div>)}

        {tab==="Profile"&&<div style={{maxWidth:700}}><ProfileScreen onSignOut={onSignOut} onNavigate={setTab} isAdmin={isAdmin} isDesktop={true}/></div>}

        </>)}
      </div>
      </div>

      {justSaved&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",zIndex:900,background:"#1F2937",color:"#fff",borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:14,boxShadow:"0 8px 24px rgba(0,0,0,0.25)",fontSize:13}}>
          <span>Saved {fmtB(justSaved.bilag)} — {justSaved.description}</span>
          <button onClick={undoJustSaved} style={{background:"none",border:"none",color:T.accent,fontWeight:800,cursor:"pointer",fontFamily:"inherit",fontSize:13}}>Undo</button>
          <button onClick={()=>setJustSaved(null)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.5)",cursor:"pointer",fontSize:14}}>✕</button>
        </div>
      )}
    </div>
  );

  return(
    <div style={{background:T.bg,minHeight:"100vh",fontFamily:"system-ui,-apple-system,sans-serif",maxWidth:430,margin:"0 auto",paddingBottom:80}}>
      {/* Sidebar */}
      {sidebarOpen&&(<>
        <div onClick={()=>setSidebarOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:200}}/>
        <div style={{position:"fixed",top:0,left:0,bottom:0,width:240,background:"#FFFFFF",zIndex:201,display:"flex",flexDirection:"column",boxShadow:"6px 0 32px rgba(0,0,0,0.15)"}}>
          <div style={{padding:"24px 20px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:12}}>
            <img src={LOGO_B64} style={{height:44,objectFit:"contain"}}/>
            <div>
              <div style={{fontSize:13,fontWeight:900,color:T.text,lineHeight:1.2}}>Redrock Danria</div>
              <div style={{fontSize:9,color:T.muted,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginTop:2}}>Accountants</div>
            </div>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"8px 0"}}>
            <div style={{padding:"8px 16px 4px",fontSize:9,color:T.muted,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase"}}>Main</div>
            {SIDEBAR.filter(i=>i.group==="main").map(item=>{
              const active=tab===item.id;
              const isLedger=item.id==="Accounts";
              return(
                <div key={item.id}>
                  <div onClick={()=>{if(isLedger){setLedgerExpanded(e=>!e);}else{setTab(item.id);setSidebarOpen(false);}}} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 16px 8px 13px",cursor:"pointer",borderLeft:active?`3px solid ${T.accent}`:"3px solid transparent",background:active?T.accentLight:"transparent"}}>
                    <span style={{fontSize:15,width:20,textAlign:"center"}}>{item.icon}</span>
                    <span style={{fontSize:12.5,fontWeight:active?700:400,color:active?T.accent:T.sub,flex:1}}>{item.label}</span>
                    {isLedger&&<span style={{fontSize:10,color:T.muted,transition:"transform 0.2s",display:"inline-block",transform:ledgerExpanded?"rotate(180deg)":"none"}}>▾</span>}
                  </div>
                  {isLedger&&ledgerExpanded&&(
                    <div style={{marginLeft:12,paddingLeft:8,borderLeft:`1px solid ${T.border}`}}>
                      <div onClick={()=>{setTab("Accounts");setSidebarOpen(false);}} style={{padding:"6px 16px 6px 13px",cursor:"pointer",borderLeft:tab==="Accounts"?`3px solid ${T.accent}`:"3px solid transparent",background:tab==="Accounts"?T.accentLight:"transparent"}}>
                        <span style={{fontSize:12,color:tab==="Accounts"?T.accent:T.sub,fontWeight:tab==="Accounts"?600:500}}>All Accounts</span>
                      </div>
                      {Object.entries(SERIES).map(([key,s])=>(
                        <div key={key} onClick={()=>{setTab("Accounts");setSidebarOpen(false);}} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 16px",cursor:"pointer",borderRadius:8,margin:"1px 8px"}}>
                          <span style={{fontSize:12}}>{s.icon}</span>
                          <span style={{fontSize:11,color:T.sub}}>{s.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{padding:"14px 16px 4px",marginTop:6,borderTop:`1px solid ${T.border}`,fontSize:9,color:T.muted,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase"}}>Tools</div>
            {SIDEBAR.filter(i=>i.group==="tools").map(item=>{
              const active=tab===item.id;
              const featureKey={Bank:"bank",Reskontro:"reskontro",Budget:"budget",SinkingFunds:"sinkingFunds",Reports:"reports",Import:"import",Cheques:"cheque",Files:"files",AIBookkeeping:"aiBookkeeping"}[item.id];
              const isOff=featureKey&&!feat[featureKey];
              if(isOff)return null;
              return(
                <div key={item.id} onClick={()=>{setTab(item.id);setSidebarOpen(false);}} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 16px 8px 13px",cursor:"pointer",borderLeft:active?`3px solid ${T.accent}`:"3px solid transparent",background:active?T.accentLight:"transparent",transition:"background 0.1s"}}>
                  <span style={{fontSize:15,width:20,textAlign:"center"}}>{item.icon}</span>
                  <span style={{fontSize:12.5,fontWeight:active?700:400,color:active?T.accent:T.sub}}>{item.label}</span>
                </div>
              );
            })}
            {/* System group */}
            <div style={{padding:"14px 16px 4px",marginTop:6,borderTop:`1px solid ${T.border}`,fontSize:9,color:T.muted,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase"}}>System</div>
            {SIDEBAR.filter(i=>i.group==="system"&&((i.id!=="AdminPanel"&&i.id!=="BugLog"&&i.id!=="AuditLog")||isAdmin)).map(item=>{const active=tab===item.id;const bugCount=item.id==="BugLog"?getBugs().filter(b=>!b.resolved).length:0;return(
              <div key={item.id} onClick={()=>{setTab(item.id);setSidebarOpen(false);}} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 16px 8px 13px",cursor:"pointer",borderLeft:active?`3px solid ${T.accent}`:"3px solid transparent",background:active?T.accentLight:"transparent"}}>
                <span style={{fontSize:15,width:20,textAlign:"center"}}>{item.icon}</span>
                <span style={{fontSize:12.5,fontWeight:active?700:400,color:active?T.accent:T.sub,flex:1}}>{item.label}</span>
                {bugCount>0&&<span style={{fontSize:9,fontWeight:800,background:"#dc2626",color:"#fff",borderRadius:10,padding:"2px 6px",minWidth:16,textAlign:"center"}}>{bugCount}</span>}
              </div>
            );})}
          </div>
          <div style={{padding:"14px 16px",borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:10,color:T.muted}}>PKR · v2.2</div>
            <button onClick={onSignOut} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,color:T.sub,fontSize:11,cursor:"pointer",padding:"5px 12px",fontWeight:600}}>Sign Out</button>
          </div>
        </div>
      </>)}

      {/* Top header */}
      <div style={{background:T.header,borderBottom:`1px solid rgba(255,255,255,0.1)`,padding:"0 16px",display:"flex",alignItems:"center",gap:12,boxShadow:"0 2px 8px rgba(13,115,119,0.2)",height:68}}>
        <button onClick={()=>setSidebarOpen(true)} style={{background:"rgba(255,255,255,0.12)",border:"none",borderRadius:10,color:"#fff",cursor:"pointer",width:36,height:36,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3.5,flexShrink:0}}>
          {[0,1,2].map(i=><div key={i} style={{width:14,height:1.5,background:"#fff",borderRadius:2}}/>)}
        </button>
        <div style={{flex:1,display:"flex",justifyContent:"center",alignItems:"center",height:"100%"}}>
          <img src={LOGO_B64} style={{height:"130%",width:"auto",objectFit:"contain",display:"block"}}/>
        </div>
        <div style={{width:36,flexShrink:0}}/>
      </div>

      {(tab==="Dashboard"||tab==="Accounts"||tab==="Reports"||tab==="Entries")&&(
        <PeriodSelector from={filterFrom} to={filterTo} onChange={(f,t)=>{setFilterFrom(f);setFilterTo(t);}}/>
      )}

      <div style={{padding:16}}>

        {tab==="Dashboard"&&(
          <Dashboard
            transactions={transactions}
            accounts={accounts}
            filterFrom={filterFrom}
            filterTo={filterTo}
            setFilterFrom={setFilterFrom}
            setFilterTo={setFilterTo}
            onNavigate={setTab}
            feat={feat}
            sinkingFunds={sinkingFunds}
            budgets={budgets}
            moneySources={effectiveMoneySources}
          />
        )}

        {tab==="Entries"&&(
          <div>
            {/* Undo toast */}
            {lastDeleted&&(
              <div style={{background:"#1A1A2A",borderRadius:12,padding:"10px 14px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:12,color:"#fff",fontWeight:500}}>Entry deleted</span>
                <button onClick={undoDelete} style={{background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"4px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Undo</button>
              </div>
            )}
            <div style={{position:"relative",marginBottom:12}}>
              <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:T.muted}}>🔍</span>
              <input placeholder="Search bilag, description, account..." value={entrySearch} onChange={e=>setEntrySearch(e.target.value)} style={{...inp,paddingLeft:42}}/>
            </div>
            <div style={{fontSize:12,color:T.muted,marginBottom:10,fontWeight:600}}>{searchedEntries.length} entries</div>
            {searchedEntries.map(t=><TxnCard key={t.id} t={t} accounts={accounts} contacts={contacts} attachedTxnIds={attachedTxnIds} fetchTxnAttachments={fetchTxnAttachments} uploadInboxFile={uploadInboxFile} attachFilesToTxnEntry={attachFilesToTxnEntry} inboxFiles={inboxFiles} auditLog={auditLog} profiles={profiles} currentUserId={user?user.id:null} onEdit={saveEdit} onDelete={deleteTxnWithUndo} onReverse={reverseTransaction} onDuplicate={duplicateTransaction} moneySources={effectiveMoneySources} tagTransaction={tagTransaction} fetchEntryComments={fetchEntryComments} addEntryComment={addEntryComment}/>)}
          </div>
        )}

        {tab==="Transactions"&&(
          <NewEntryForm accounts={accounts} contacts={contacts} setContacts={setContacts} nextBilag={nextBilag} feat={feat} sinkingFunds={sinkingFunds} saveSinkingFunds={saveSinkingFunds} inboxFiles={inboxFiles} uploadInboxFile={uploadInboxFile} transactions={transactions} moneySources={effectiveMoneySources} tagTransaction={tagTransaction} isDesktop={false} projects={projects} trackProjects={!!companyProfile.trackProjects} saveProjects={saveProjects} onSave={async(form)=>{const r=await addTransactionNotified(form);setTab("Dashboard");return r;}} addEntryComment={addEntryComment}/>
        )}

        {tab==="Accounts"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#EEF4F3",padding:"10px 14px",borderRadius:"10px 10px 0 0",border:`1px solid ${T.border}`,borderBottom:"none"}}>
              <div style={{fontSize:11,color:"#111827",fontWeight:800,textTransform:"uppercase",letterSpacing:0}}>Accounts</div>
              <div style={{fontSize:11,color:"#111827",fontWeight:800,textTransform:"uppercase",letterSpacing:0,textAlign:"right"}}>Amounts</div>
            </div>
            <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:"0 0 10px 10px",overflow:"hidden"}}>
              {[...accounts].sort((a,b)=>a.code.localeCompare(b.code)).map(a=>{
                const openingBal=transactions.filter(t=>t.date<filterFrom).reduce((sum,t)=>{
                  if(t.debitCode===a.code)return sum+t.amount;
                  if(t.creditCode===a.code)return sum-t.amount;
                  return sum;
                },0);
                const periodMov=transactions.filter(t=>t.date>=filterFrom&&t.date<=filterTo).reduce((sum,t)=>{
                  if(t.debitCode===a.code)return sum+t.amount;
                  if(t.creditCode===a.code)return sum-t.amount;
                  return sum;
                },0);
                const closingBal=openingBal+periodMov;
                if(closingBal===0)return null;
                return(
                  <div key={a.code} className="rr-table-row" onClick={()=>setLedgerAcc(a)} style={{padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,cursor:"pointer",borderBottom:`1px solid ${T.border}`,background:"#fff"}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#0369A1",lineHeight:1.35,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.code} {a.name}</div>
                    <div style={{fontSize:13,fontWeight:800,color:"#111827",textAlign:"right",whiteSpace:"nowrap"}}>{closingBal>=0?"+":"-"}{fmt(Math.abs(closingBal))}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab==="Reports"&&(
          feat.reports
            ?<ReportsScreen accounts={accounts} transactions={transactions} getName={getName} filterFrom={filterFrom} filterTo={filterTo} sinkingFunds={sinkingFunds} budgets={budgets} onChangePeriod={(f,t)=>{setFilterFrom(f);setFilterTo(t);}}/>
            :<DisabledScreen title="Reports" onBack={()=>setTab("Dashboard")}/>
        )}

        {tab==="Profile"&&(
          <ProfileScreen onSignOut={onSignOut} onNavigate={setTab} isAdmin={isAdmin}/>
        )}
      </div>

      {/* Bottom nav */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:"#fff",borderTop:`1px solid ${T.border}`,display:"flex",boxShadow:"0 -2px 16px rgba(13,115,119,0.08)",paddingBottom:"env(safe-area-inset-bottom)"}}>
        {MENU.map(t=>{
          const active=tab===t.id;
          const isNew=t.isNew;
          return(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,paddingTop:8,paddingBottom:10,background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,position:"relative"}}>
              {isNew?(
                <div style={{background:T.header,borderRadius:18,width:48,height:48,display:"flex",alignItems:"center",justifyContent:"center",marginTop:-20,boxShadow:"0 4px 14px rgba(13,115,119,0.4)"}}>
                  <span style={{color:"#fff",fontSize:26,fontWeight:300,lineHeight:1}}>+</span>
                </div>
              ):(
                <div style={{width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{fontSize:19,filter:active?"none":"grayscale(1)",opacity:active?1:0.4}}>{t.icon}</span>
                </div>
              )}
              {!isNew&&<span style={{fontSize:9,fontWeight:active?700:500,color:active?T.header:T.muted,letterSpacing:0.2}}>{t.label}</span>}
              {active&&!isNew&&<div style={{position:"absolute",bottom:0,width:20,height:2.5,background:T.header,borderRadius:2}}/>}
            </button>
          );
        })}
      </div>
    </div>
  );
}


export default FinanceTracker;
