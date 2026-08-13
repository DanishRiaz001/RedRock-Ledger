import { useState } from "react";
import { T } from "../../lib/theme.js";

export default function Menu3({ items }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        style={{ background: T.border, border: "none", borderRadius: 8, color: T.sub, fontSize: 15, cursor: "pointer", padding: "5px 11px", fontWeight: 900, lineHeight: 1 }}
      >
        •••
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 90 }} />
          <div style={{ position: "absolute", right: 0, top: 36, background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, zIndex: 100, minWidth: 170, boxShadow: "0 8px 32px rgba(0,0,0,0.14)" }}>
            {items.map((item, i) => (
              <div
                key={i}
                onClick={() => { if (!item.disabled) { setOpen(false); item.action(); } }}
                style={{ padding: "13px 16px", fontSize: 13, cursor: item.disabled ? "not-allowed" : "pointer", color: item.disabled ? T.muted : item.color || T.blue, fontWeight: 600, borderBottom: i < items.length - 1 ? `1px solid ${T.border}` : "none", display: "flex", alignItems: "center", gap: 8, opacity: item.disabled ? 0.5 : 1 }}
              >
                <span>{item.icon}</span>{item.label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
