import { T } from "../lib/theme.js";
import { SERIES } from "../lib/constants.js";
import { getSK, sign } from "../lib/utils.js";

export default function AccountsTab({ accounts, transactions, onOpenLedger }) {
  return (
    <div>
      {Object.entries(SERIES).map(([key, s]) => {
        const grp = accounts.filter((a) => getSK(a.code) === key).sort((a, b) => a.code.localeCompare(b.code));
        if (!grp.length) return null;
        return (
          <div key={key} style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span>{s.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: s.color, textTransform: "uppercase" }}>{s.name}</span>
              <span style={{ fontSize: 11, color: T.muted }}>· {key}s</span>
            </div>
            {grp.map((a) => {
              const bal = transactions.reduce((sum, t) => {
                if (t.debitCode === a.code) return sum + t.amount;
                if (t.creditCode === a.code) return sum - t.amount;
                return sum;
              }, 0);
              return (
                <div key={a.code} onClick={() => onOpenLedger(a)} style={{ background: T.card, borderRadius: 12, padding: "13px 16px", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", border: `1px solid ${T.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ background: s.bg, borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 800, color: s.color }}>{a.code}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</div>
                      <div style={{ fontSize: 11, color: bal >= 0 ? T.green : T.red, fontWeight: 700, marginTop: 1 }}>{sign(bal)}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 20, color: T.red }}>›</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
