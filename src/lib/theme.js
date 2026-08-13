// Design tokens for RedRock Ledger.
// Centralized here so future theming (e.g. per-client branding in the
// accountant portal) only requires touching this one file.

export const T = {
  bg: "#F7F8FA", card: "#FFFFFF", border: "#E8ECF0",
  red: "#D0021B", redLight: "#FFF0F2", redMid: "#FFCDD3",
  green: "#00875A", greenBg: "#E6F6F1",
  blue: "#0057B8", blueBg: "#EBF2FF",
  orange: "#B45309", orangeBg: "#FFF8EC",
  text: "#111827", sub: "#6B7280", muted: "#9CA3AF",
  header: "#1A1A2E", sidebar: "#16213E",
};

export const inp = {
  background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10,
  color: T.text, padding: "11px 14px", width: "100%", fontSize: 16,
  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};

export const btnRed = {
  background: T.red, color: "#fff", border: "none", borderRadius: 10,
  padding: "13px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer",
  width: "100%", fontFamily: "inherit",
};

export const btnGhost = {
  background: "#fff", color: T.red, border: `1.5px solid ${T.red}`,
  borderRadius: 10, padding: "12px 18px", fontWeight: 700, fontSize: 14,
  cursor: "pointer", width: "100%", fontFamily: "inherit",
};

export const btnSm = {
  background: T.blueBg, color: T.blue, border: "none", borderRadius: 8,
  padding: "6px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer",
  fontFamily: "inherit",
};
