import { T } from "../lib/theme.js";
import { fmt, sign } from "../lib/utils.js";
import SL from "../components/common/SL.jsx";
import Card from "../components/common/Card.jsx";
import MiniBarChart from "../components/MiniBarChart.jsx";
import TxnCard from "../components/TxnCard.jsx";

export default function DashboardTab({ totalIncome, totalExpenses, filteredTxns, accounts, onEdit, onReverse }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div style={{ background: T.greenBg, borderRadius: 14, padding: "14px", border: "1px solid #b7e4d4" }}>
          <div style={{ fontSize: 10, color: T.green, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Income</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: T.green, marginTop: 4 }}>+{fmt(totalIncome)}</div>
        </div>
        <div style={{ background: T.redLight, borderRadius: 14, padding: "14px", border: `1px solid ${T.redMid}` }}>
          <div style={{ fontSize: 10, color: T.red, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Expenses</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: T.red, marginTop: 4 }}>−{fmt(totalExpenses)}</div>
        </div>
      </div>
      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.sub, marginBottom: 10 }}>Income vs Expenses</div>
        <MiniBarChart income={totalIncome} expenses={totalExpenses} />
        <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 10, paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.sub }}>Net Balance</span>
          <span style={{ fontSize: 18, fontWeight: 900, color: totalIncome - totalExpenses >= 0 ? T.green : T.red }}>{sign(totalIncome - totalExpenses)}</span>
        </div>
      </Card>
      <SL>Last 5 Entries</SL>
      {filteredTxns.filter((t) => !t.matchedWith).slice(-5).reverse().map((t) => (
        <TxnCard key={t.id} t={t} accounts={accounts} onEdit={onEdit} onReverse={onReverse} />
      ))}
    </div>
  );
}
