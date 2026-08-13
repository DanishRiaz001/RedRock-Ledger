import { T, inp } from "../lib/theme.js";
import { fmt, sign } from "../lib/utils.js";
import Card from "../components/common/Card.jsx";
import Pill from "../components/common/Pill.jsx";

export default function ReportsTab({ reportPeriod, setReportPeriod, reportIncome, reportExpenses, totalRI, totalRE, getName }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input type="date" value={reportPeriod.from} onChange={(e) => setReportPeriod((p) => ({ ...p, from: e.target.value }))} style={{ ...inp, flex: 1 }} />
        <input type="date" value={reportPeriod.to} onChange={(e) => setReportPeriod((p) => ({ ...p, to: e.target.value }))} style={{ ...inp, flex: 1 }} />
      </div>
      <Card>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <Pill label="P&L" color={T.blue} bg={T.blueBg} /> Income Statement
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: T.green, fontWeight: 800, marginBottom: 8 }}>INCOME · 3000s</div>
          {Object.entries(reportIncome).map(([code, amt]) => (
            <div key={code} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5, paddingLeft: 8 }}>
              <span style={{ color: T.sub }}>{code} · {getName(code)}</span>
              <span style={{ fontWeight: 700, color: T.green }}>+{fmt(amt)}</span>
            </div>
          ))}
          {!Object.keys(reportIncome).length && <div style={{ fontSize: 12, color: T.muted, paddingLeft: 8 }}>No income entries</div>}
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 13, color: T.green, borderTop: `1px solid ${T.border}`, paddingTop: 8, marginTop: 8 }}>
            <span>Total Income</span><span>+{fmt(totalRI)}</span>
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: T.orange, fontWeight: 800, marginBottom: 8 }}>EXPENSES · 4000s</div>
          {Object.entries(reportExpenses).map(([code, amt]) => (
            <div key={code} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5, paddingLeft: 8 }}>
              <span style={{ color: T.sub }}>{code} · {getName(code)}</span>
              <span style={{ fontWeight: 700, color: T.orange }}>−{fmt(amt)}</span>
            </div>
          ))}
          {!Object.keys(reportExpenses).length && <div style={{ fontSize: 12, color: T.muted, paddingLeft: 8 }}>No expense entries</div>}
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 13, color: T.orange, borderTop: `1px solid ${T.border}`, paddingTop: 8, marginTop: 8 }}>
            <span>Total Expenses</span><span>−{fmt(totalRE)}</span>
          </div>
        </div>
        <div style={{ background: totalRI - totalRE >= 0 ? T.greenBg : T.redLight, borderRadius: 10, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Net Profit / Loss</span>
          <span style={{ fontSize: 20, fontWeight: 900, color: totalRI - totalRE >= 0 ? T.green : T.red }}>{sign(totalRI - totalRE)}</span>
        </div>
      </Card>
    </div>
  );
}
