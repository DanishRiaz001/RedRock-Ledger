import { T } from "../../lib/theme.js";

export default function Card({ children, style }) {
  return (
    <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, padding: "14px 16px", marginBottom: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.04)", ...style }}>
      {children}
    </div>
  );
}
