import { useState } from "react";
import { InvoiceOverviewScreen, InvoiceFormScreen } from "../invoicing.jsx";
import MobileScreen from "./MobileScreen.jsx";

export default function MobileInvoices(props){
  const{invoices,contacts,accounts,companyProfile,updateInvoiceStatus,deleteInvoice,registerInvoicePayment,createCreditNote,getInvoicePaid,nextInvoiceNo,createInvoice,transactions,onClose}=props;
  const[showNew,setShowNew]=useState(false);

  if(showNew)return(
    <MobileScreen title="New invoice" onClose={()=>setShowNew(false)}>
      <InvoiceFormScreen accounts={accounts} contacts={contacts} companyProfile={companyProfile} nextInvoiceNo={nextInvoiceNo}
        createInvoice={createInvoice} transactions={transactions} onDone={()=>setShowNew(false)}/>
    </MobileScreen>
  );

  return(
    <MobileScreen title="Invoices" subtitle="Customer invoices & payments" onClose={onClose}>
      <InvoiceOverviewScreen invoices={invoices} contacts={contacts} accounts={accounts} companyProfile={companyProfile}
        updateInvoiceStatus={updateInvoiceStatus} deleteInvoice={deleteInvoice} registerInvoicePayment={registerInvoicePayment}
        createCreditNote={createCreditNote} getInvoicePaid={getInvoicePaid} onNewInvoice={()=>setShowNew(true)}/>
    </MobileScreen>
  );
}
