import { useState } from "react";
import { T, btnSm } from "../lib/theme.js";
import { getSK, sign } from "../lib/utils.js";
import SL from "../components/common/SL.jsx";
import Card from "../components/common/Card.jsx";

export default function BankModule({ accounts, transactions, onOpenLedger }) {
  const [uploaded, setUploaded] = useState({});
  const banks = accounts.filter((a) => getSK(a.code) === "1900");
  const getBal = (code) => transactions.reduce((s, t) => {
    if (t.debitCode === code) return s + t.amount;
    if (t.creditCode === code) return s - t.amount;
    return s;
  }, 0);
  return (
    <div>
      <SL>Bank Accounts</SL>
      {banks.map((a) => {
        const bal = getBal(a.code);
        const has = !!uploaded[a.code];
        return (
          <Card key={a.code}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: T.blue, background: T.blueBg, padding: "3px 8px", borderRadius: 6 }}>{a.code}</span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{a.name}</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: bal >= 0 ? T.green : T.red, marginTop: 6 }}>{sign(bal)}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                <button style={btnSm} onClick={() => onOpenLedger(a)}>Ledger ›</button>
                <label style={{ ...btnSm, background: has ? T.greenBg : T.bg, color: has ? T.green : T.sub, border: `1px solid ${T.border}`, cursor: "pointer" }}>
                  {has ? "✓ Statement" : "Upload"}
                  <input type="file" accept=".pdf,.csv,.xlsx" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) setUploaded((p) => ({ ...p, [a.code]: e.target.files[0].name })); }} />
                </label>
              </div>
            </div>
            {has && <div style={{ marginTop: 8, background: T.greenBg, borderRadius: 8, padding: "6px 10px", fontSize: 11, color: T.green, fontWeight: 600 }}>✓ {uploaded[a.code]}</div>}
          </Card>
        );
      })}
      {!banks.length && <div style={{ textAlign: "center", color: T.muted, padding: 30, fontSize: 13 }}>No bank accounts. Add 1900-series accounts in Settings.</div>}
    </div>
  );
}
