import { T } from "../../lib/theme.js";

export default function BackHeader({ title, sub, color, onBack }) {
  return (
    <div style={{ background: T.header, padding: "16px", display: "flex", alignItems: "center", gap: 12 }}>
      <button onClick={onBack} style={{ background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 10, color: "#fff", fontSize: 20, cursor: "pointer", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>
        ‹
      </button>
      <div>
        <div style={{ fontSize: 11, color: color || "#aaa", fontWeight: 700, letterSpacing: 1 }}>{sub}</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{title}</div>
      </div>
    </div>
  );
}
