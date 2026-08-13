import { T } from "../lib/theme.js";
import { fmt } from "../lib/utils.js";

export default function MiniBarChart({ income, expenses }) {
  const max = Math.max(income, expenses, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 70, padding: "0 8px" }}>
      {[{ val: income, color: T.green, label: "Income" }, { val: expenses, color: T.red, label: "Expenses" }].map((b, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: b.color }}>{fmt(b.val)}</div>
          <div style={{ width: "100%", background: b.color, borderRadius: "4px 4px 0 0", height: `${Math.max((b.val / max) * 48, 4)}px` }} />
          <div style={{ fontSize: 10, color: T.muted, fontWeight: 600 }}>{b.label}</div>
        </div>
      ))}
    </div>
  );
}
