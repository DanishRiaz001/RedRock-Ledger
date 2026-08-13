import { useState } from "react";
import { T } from "../lib/theme.js";
import SL from "../components/common/SL.jsx";
import BackHeader from "../components/common/BackHeader.jsx";
import AccountPlanScreen from "./AccountPlanScreen.jsx";

export default function SettingsMenu({ accounts, onSave, onBack }) {
  const [screen, setScreen] = useState(null);
  if (screen === "plan") {
    return <AccountPlanScreen accounts={accounts} onSave={(a) => { onSave(a); setScreen(null); }} onBack={() => setScreen(null)} />;
  }
  return (
    <div style={{ background: T.bg, minHeight: "100vh", fontFamily: "system-ui,sans-serif", maxWidth: 430, margin: "0 auto" }}>
      <BackHeader title="Settings" sub="MY FINANCE LEDGER" onBack={onBack} />
      <div style={{ padding: 16 }}>
        <SL>Account Management</SL>
        <div onClick={() => setScreen("plan")} style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, padding: "16px", marginBottom: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <div style={{ background: T.blueBg, borderRadius: 12, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📋</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Account Plan</div>
            <div style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>Edit all accounts, codes and names</div>
          </div>
          <span style={{ fontSize: 20, color: T.muted }}>›</span>
        </div>
      </div>
    </div>
  );
}
