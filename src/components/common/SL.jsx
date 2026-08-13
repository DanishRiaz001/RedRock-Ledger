import { T } from "../../lib/theme.js";

export default function SL({ children, mt }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8, marginTop: mt || 0 }}>
      {children}
    </div>
  );
}
