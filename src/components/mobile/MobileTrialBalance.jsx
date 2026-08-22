import { TrialBalanceScreen } from "../reports.jsx";
import MobileScreen from "./MobileScreen.jsx";

export default function MobileTrialBalance({accounts,transactions,setAccounts,onOpenLedger,onClose}){
  return(
    <MobileScreen title="Trial balance" subtitle="All accounts for the period" onClose={onClose}>
      <TrialBalanceScreen accounts={accounts} transactions={transactions} onOpenLedger={onOpenLedger}
        onSaveAccounts={setAccounts} registerExcelExport={()=>{}} isDesktop={false}/>
    </MobileScreen>
  );
}
