import { useState } from "react";
import { T } from "../../lib/theme.js";
import { isFeatureOn } from "../ledger.jsx";
import MobileHome from "./MobileHome.jsx";
import MobileBank from "./MobileBank.jsx";
import MobileVouchers from "./MobileVouchers.jsx";
import MobileReports from "./MobileReports.jsx";
import MobileMore from "./MobileMore.jsx";

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
    <div style={{position:"fixed",inset:0,display:"flex",flexDirection:"column",background:T.bg,fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif"}}>
      <div style={{flex:1,minHeight:0,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
        {tab==="Home"&&<MobileHome {...props} onNavigate={setTab} onOpenOverlay={setOverlay}/>}
        {tab==="Bank"&&<MobileBank {...props}/>}
        {tab==="Vouchers"&&<MobileVouchers {...props} feat={feat} moneySources={effectiveMoneySources} overlay={overlay} setOverlay={setOverlay}/>}
        {tab==="Reports"&&<MobileReports {...props} feat={feat}/>}
        {tab==="More"&&<MobileMore {...props} onNavigate={setTab}/>}
      </div>

      <div style={{
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
    </div>
  );
}
