import { useState } from "react";
import { T } from "../../lib/theme.js";
import { fmt, fmtB } from "../../lib/utils.js";
import Pill from "../common/Pill.jsx";
import Menu3 from "../common/Menu3.jsx";
import EditModal from "./EditModal.jsx";

export default function DetailModal({ txn, accounts, onEdit, onReverse, onClose }) {
  const [showEdit, setShowEdit] = useState(false);
  const getName = (code) => {
    const acc = accounts.find((a) => a.code === code);
    return acc ? acc.name : code;
  };
  const isReversed = !!txn.reversedBy;
  const isReversal = !!txn.reversalOf;

  if (showEdit) {
    return (
      <EditModal
        txn={txn}
        accounts={accounts}
        onSave={(u) => { onEdit(u); setShowEdit(false); }}
        onClose={() => setShowEdit(false)}
      />
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: T.bg, borderRadius: "20px 20px 0 0", padding: 20, width: "100%", maxWidth: 430 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <Pill label={fmtB(txn.bilag)} color={isReversal ? T.red : T.blue} bg={isReversal ? T.redLight : T.blueBg} />
            <div style={{ fontSize: 17, fontWeight: 800, marginTop: 6 }}>{txn.description}</div>
            {isReversed && <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>Reversed by {fmtB(txn.reversedBy)}</div>}
            {isReversal && <div style={{ fontSize: 11, color: T.red, marginTop: 2 }}>↩ Reversal of {fmtB(txn.reversalOf)}</div>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!isReversal && (
              <Menu3 items={[
                { icon: "✏️", label: "Edit Entry", disabled: isReversed, action: () => setShowEdit(true) },
                { icon: "↩️", label: "Reverse Entry", color: T.red, disabled: isReversed, action: () => { onReverse(txn); onClose(); } },
              ]} />
            )}
            <button onClick={onClose} style={{ background: T.border, border: "none", borderRadius: 10, color: T.sub, fontSize: 16, cursor: "pointer", width: 34, height: 34 }}>✕</button>
          </div>
        </div>
        <div style={{ background: isReversal ? T.redLight : T.blueBg, borderRadius: 14, padding: "16px 18px", marginBottom: 12, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: T.sub, fontWeight: 600, marginBottom: 4 }}>AMOUNT</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: isReversal ? T.red : T.text }}>{fmt(txn.amount)}</div>
          <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>{txn.date}</div>
        </div>
        {isReversal && <div style={{ background: T.redLight, borderRadius: 10, padding: "10px 14px", marginBottom: 10, fontSize: 12, color: T.red, fontWeight: 600, textAlign: "center" }}>🔒 Reversal entries cannot be edited</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ background: T.redLight, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: T.red, fontWeight: 800, marginBottom: 4 }}>⬆ DEBIT</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{txn.debitCode}</div>
            <div style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>{getName(txn.debitCode)}</div>
          </div>
          <div style={{ background: T.greenBg, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: T.green, fontWeight: 800, marginBottom: 4 }}>⬇ CREDIT</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{txn.creditCode}</div>
            <div style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>{getName(txn.creditCode)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
