export default function Pill({ label, color, bg }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 6, background: bg, color }}>
      {label}
    </span>
  );
}
