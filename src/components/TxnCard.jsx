import { useState } from "react";
import { T } from "../lib/theme.js";
import { fmt, fmtB } from "../lib/utils.js";
import Pill from "./common/Pill.jsx";
import DetailModal from "./modals/DetailModal.jsx";

export default function TxnCard({ t, accounts, onEdit, onReverse }) {
  const [detail, setDetail] = useState(false);
  const isReversed = !!t.reversedBy;
  const isReversal = !!t.reversalOf;
  if (t.matchedWith) return null;
  return (
    <>
      {detail && (
        <DetailModal
          txn={t}
          accounts={accounts}
          onEdit={(u) => { onEdit(u); setDetail(false); }}
          onReverse={(tx) => { onReverse(tx); setDetail(false); }}
          onClose={() => setDetail(false)}
        />
      )}
      <div
        onClick={() => setDetail(true)}
        style={{ background: T.card, borderRadius: 14, border: `1px solid ${isReversal ? T.redMid : T.border}`, padding: "13px 15px", marginBottom: 8, cursor: "pointer", opacity: isReversed ? 0.55 : 1, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
            <Pill label={fmtB(t.bilag)} color={isReversal ? T.red : T.blue} bg={isReversal ? T.redLight : T.blueBg} />
            <div style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
              {t.description}
              {isReversed && <span style={{ fontSize: 10, color: T.muted, marginLeft: 5 }}>[reversed]</span>}
              {isReversal && <span style={{ fontSize: 10, color: T.red, marginLeft: 5 }}>[reversal]</span>}
            </div>
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: isReversal ? T.red : T.text, marginLeft: 8 }}>{fmt(t.amount)}</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 10, background: T.redLight, color: T.red, padding: "2px 8px", borderRadius: 6, fontWeight: 700 }}>Dr {t.debitCode}</span>
          <span style={{ fontSize: 12, color: T.muted }}>→</span>
          <span style={{ fontSize: 10, background: T.greenBg, color: T.green, padding: "2px 8px", borderRadius: 6, fontWeight: 700 }}>Cr {t.creditCode}</span>
          <span style={{ fontSize: 10, color: T.muted, marginLeft: "auto" }}>{t.date}</span>
        </div>
      </div>
    </>
  );
}
