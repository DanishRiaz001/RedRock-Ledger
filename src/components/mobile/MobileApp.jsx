import { useState, useEffect } from "react";
import { StatusBar, Style } from "@capacitor/status-bar";
import { T } from "../../lib/theme.js";
import { isFeatureOn } from "../ledger.jsx";
import MobileHome from "./MobileHome.jsx";
import MobileBank from "./MobileBank.jsx";
import MobileVouchers from "./MobileVouchers.jsx";
import MobileReports from "./MobileReports.jsx";
import MobileMore from "./MobileMore.jsx";
import MobileScreen from "./MobileScreen.jsx";
import MobileBudget from "./MobileBudget.jsx";
import MobileSinkingFunds from "./MobileSinkingFunds.jsx";
import MobileAnalytics from "./MobileAnalytics.jsx";
import MobileLedger from "./MobileLedger.jsx";
import MobileTrialBalance from "./MobileTrialBalance.jsx";
import MobileSettings from "./MobileSettings.jsx";
import MobileWhose from "./MobileWhose.jsx";
import MobileReskontro from "./MobileReskontro.jsx";
import { TABBAR_H } from "./mobileConstants.js";

const OVERLAY_META={
  Budget:{title:"Budget",subtitle:"Monthly spending vs. plan"},
  SinkingFund:{title:"Sinking funds",subtitle:"Savings goals"},
  Analytics:{title:"Analytics",subtitle:"Income & expenses by account"},
};

// Root of the entire native-app UI — a completely separate component tree
// from FinanceTracker (the website/desktop router). appshell.jsx renders
// this INSTEAD of FinanceTracker when running inside the Capacitor app, so
// nothing in here can affect the website's rendering path at all — the only
// thing shared is the props (data + save functions) both trees receive
// from the same place.
const TABS=[
  {id:"Home",label:"Home",icon:"ti-home"},
  {id:"Bank",label:"Bank",icon:"ti-building-bank"},
  {id:"Vouchers",label:"Vouchers",icon:"ti-receipt-2"},
  {id:"Reports",label:"Reports",icon:"ti-chart-bar"},
  {id:"More",label:"More",icon:"ti-dots"},
];

export default function MobileApp(props){
  const[tab,setTab]=useState("Home");
  // A screen can push a temporary full-screen view (e.g. New Entry) without
  // actually switching tabs, so the tab bar's active state doesn't jump
  // around underneath a modal-like flow.
  const[overlay,setOverlay]=useState(null);

  useEffect(()=>{
    const light=tab==="Home"&&!overlay;
    StatusBar.setStyle({style:light?Style.Light:Style.Dark}).catch(()=>{});
  },[tab,overlay]);

  const getFeature=id=>isFeatureOn(id,props.viewingUserId);
  const isNorway=(props.companyProfile.country||"PK")==="NO";
  const feat={
    bank:getFeature("bank"),reskontro:getFeature("reskontro"),whose:getFeature("whose"),
    budget:getFeature("budget"),sinkingFunds:getFeature("sinkingFunds"),reports:getFeature("reports"),
    import:getFeature("import"),cheque:getFeature("cheque"),tags:getFeature("tags"),
    calcAmount:getFeature("calcAmount"),vat:isNorway,
  };
  const effectiveMoneySources=feat.whose?props.moneySources:[];

  return(
    <div style={{position:"fixed",inset:0,background:T.bg,fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,bottom:0,overflowY:"auto",WebkitOverflowScrolling:"touch",paddingBottom:TABBAR_H}}>
        {tab==="Home"&&<MobileHome {...props} feat={feat} onNavigate={setTab} onOpenOverlay={setOverlay}/>}
        {tab==="Bank"&&<MobileBank {...props}/>}
        {tab==="Vouchers"&&<MobileVouchers {...props} feat={feat} moneySources={effectiveMoneySources} overlay={overlay} setOverlay={setOverlay}/>}
        {tab==="Reports"&&<MobileReports {...props} feat={feat}/>}
        {tab==="More"&&<MobileMore {...props} onNavigate={setTab}/>}
      </div>

      <div style={{
        position:"fixed",left:0,right:0,bottom:0,zIndex:200,
        display:"flex",background:"rgba(255,255,255,0.92)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
        borderTop:`1px solid ${T.borderGlass||T.border}`,paddingBottom:"env(safe-area-inset-bottom)",flexShrink:0,
      }}>
        {TABS.map(t=>{
          const active=tab===t.id;
          return(
            <div key={t.id} onClick={()=>{setTab(t.id);setOverlay(null);}} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"9px 0 8px",cursor:"pointer"}}>
              <i className={`ti ${t.icon}`} style={{fontSize:20,color:active?T.accent:"#9AA5B1"}}/>
              <span style={{fontSize:9.5,fontWeight:700,color:active?T.accent:"#9AA5B1"}}>{t.label}</span>
            </div>
          );
        })}
      </div>

      {overlay&&overlay.type==="Settings"&&(
        <MobileSettings accounts={props.accounts} setAccounts={props.setAccounts} addAccount={props.addAccount} updateAccount={props.updateAccount}
          transactions={props.transactions} budgets={props.budgets} saveBudget={props.saveBudget} mergeAccounts={props.mergeAccounts}
          companyProfile={props.companyProfile} saveCompanyProfile={props.saveCompanyProfile} requestRedrockAccess={props.requestRedrockAccess}
          onClose={()=>setOverlay(null)}/>
      )}

      {overlay&&OVERLAY_META[overlay.type]&&(
        <MobileScreen title={OVERLAY_META[overlay.type].title} subtitle={OVERLAY_META[overlay.type].subtitle} onClose={()=>setOverlay(null)}>
          {overlay.type==="Budget"&&<MobileBudget accounts={props.accounts} transactions={props.transactions} budgets={props.budgets} saveBudget={props.saveBudget}/>}
          {overlay.type==="SinkingFund"&&<MobileSinkingFunds sinkingFunds={props.sinkingFunds} saveSinkingFunds={props.saveSinkingFunds}/>}
          {overlay.type==="Analytics"&&<MobileAnalytics accounts={props.accounts} transactions={props.transactions}/>}
        </MobileScreen>
      )}

      {overlay&&overlay.type==="Ledger"&&(
        <MobileLedger account={overlay.account} accounts={props.accounts} transactions={props.transactions}
          onClose={()=>setOverlay(null)} onDeleteTxn={props.deleteTxn} onReverseTxn={props.reverseTransaction}
          inboxFiles={props.inboxFiles} uploadInboxFile={props.uploadInboxFile}/>
      )}

      {overlay&&overlay.type==="TrialBalance"&&(
        <MobileTrialBalance accounts={props.accounts} transactions={props.transactions} setAccounts={props.setAccounts}
          onClose={()=>setOverlay(null)} onOpenLedger={account=>setOverlay({type:"Ledger",account})}/>
      )}

      {overlay&&overlay.type==="Whose"&&(
        <MobileWhose moneySources={effectiveMoneySources} saveMoneySources={props.saveMoneySources}
          transactions={props.transactions} accounts={props.accounts} tagTransaction={props.tagTransaction}
          onClose={()=>setOverlay(null)}/>
      )}

      {overlay&&overlay.type==="Reskontro"&&(
        <MobileReskontro contacts={props.contacts} transactions={props.transactions}
          matchTxns={props.matchTransactions} unmatchTxns={props.unmatchTransactions}
          defaultType={overlay.defaultType} onClose={()=>setOverlay(null)}/>
      )}
    </div>
  );
}
