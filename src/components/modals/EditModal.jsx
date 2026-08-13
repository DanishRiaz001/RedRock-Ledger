import { useState } from "react";
import { T, inp, btnRed, btnGhost } from "../../lib/theme.js";
import { fmtB } from "../../lib/utils.js";
import SL from "../common/SL.jsx";
import AccDrop from "../common/AccDrop.jsx";

export default function EditModal({ txn, accounts, onSave, onClose }) {
  const [form, setForm] = useState({ ...txn, amount: String(txn.amount) });
  const valid = form.debitCode && form.creditCode && form.description && parseFloat(form.amount) > 0;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 400, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: T.bg, borderRadius: "20px 20px 0 0", padding: 20, width: "100%", maxWidth: 430, maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, letterSpacing: 1 }}>EDITING</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{fmtB(txn.bilag)}</div>
          </div>
          <button onClick={onClose} style={{ background: T.border, border: "none", borderRadius: 10, color: T.sub, fontSize: 18, cursor: "pointer", width: 36, height: 36 }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div><SL>Date</SL><input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} style={inp} /></div>
          <div><SL>Description</SL><input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} style={inp} /></div>
          <div><SL>Amount (PKR)</SL><input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} style={inp} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><SL>Debit Account</SL><AccDrop value={form.debitCode} onChange={(v) => setForm((f) => ({ ...f, debitCode: v }))} accounts={accounts} /></div>
            <div><SL>Credit Account</SL><AccDrop value={form.creditCode} onChange={(v) => setForm((f) => ({ ...f, creditCode: v }))} accounts={accounts} /></div>
          </div>
          <button style={{ ...btnRed, opacity: valid ? 1 : 0.5 }} onClick={() => valid && onSave({ ...form, amount: parseFloat(form.amount) })}>Save Changes</button>
          <button style={btnGhost} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
