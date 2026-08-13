import { T, inp, btnRed } from "../lib/theme.js";
import { fmtB } from "../lib/utils.js";
import SL from "../components/common/SL.jsx";
import Card from "../components/common/Card.jsx";
import Pill from "../components/common/Pill.jsx";
import AccDrop from "../components/common/AccDrop.jsx";

export default function TransactionsTab({ nextBilag, newTxn, setNewTxn, accounts, getName, onAdd }) {
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, letterSpacing: 1 }}>NEXT ENTRY</div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>{fmtB(nextBilag)}</div>
        </div>
        <Pill label="Double Entry" color={T.red} bg={T.redLight} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div><SL>Date</SL><input type="date" value={newTxn.date} onChange={(e) => setNewTxn((p) => ({ ...p, date: e.target.value }))} style={inp} /></div>
        <div><SL>Description</SL><input placeholder="e.g. June Salary received" value={newTxn.description} onChange={(e) => setNewTxn((p) => ({ ...p, description: e.target.value }))} style={inp} /></div>
        <div><SL>Amount (PKR)</SL><input type="number" placeholder="0" value={newTxn.amount} onChange={(e) => setNewTxn((p) => ({ ...p, amount: e.target.value }))} style={inp} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <SL>Debit Account</SL>
            <AccDrop value={newTxn.debitCode} onChange={(v) => setNewTxn((p) => ({ ...p, debitCode: v }))} accounts={accounts} />
            {newTxn.debitCode && <div style={{ fontSize: 10, color: T.red, marginTop: 5, fontWeight: 600 }}>{getName(newTxn.debitCode)}</div>}
          </div>
          <div>
            <SL>Credit Account</SL>
            <AccDrop value={newTxn.creditCode} onChange={(v) => setNewTxn((p) => ({ ...p, creditCode: v }))} accounts={accounts} />
            {newTxn.creditCode && <div style={{ fontSize: 10, color: T.green, marginTop: 5, fontWeight: 600 }}>{getName(newTxn.creditCode)}</div>}
          </div>
        </div>
        <button style={btnRed} onClick={onAdd}>Save Entry</button>
      </div>
    </Card>
  );
}
