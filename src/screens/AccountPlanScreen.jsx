import { useState } from "react";
import { T, inp, btnRed, btnGhost, btnSm } from "../lib/theme.js";
import { SERIES } from "../lib/constants.js";
import { getSK } from "../lib/utils.js";
import SL from "../components/common/SL.jsx";
import Card from "../components/common/Card.jsx";
import BackHeader from "../components/common/BackHeader.jsx";

export default function AccountPlanScreen({ accounts, onSave, onBack }) {
  const [list, setList] = useState(accounts.map((a) => ({ ...a })));
  const [editingIdx, setEditingIdx] = useState(null);
  const [newAcc, setNewAcc] = useState({ code: "", name: "" });
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = list.filter((a) => a.code.includes(search) || a.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div style={{ background: T.bg, minHeight: "100vh", fontFamily: "system-ui,sans-serif", maxWidth: 430, margin: "0 auto" }}>
      <BackHeader title="Account Plan" sub="SETTINGS" onBack={onBack} />
      <div style={{ padding: 16 }}>
        <input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inp, marginBottom: 12 }} />
        <button style={{ ...btnRed, marginBottom: 14 }} onClick={() => setShowNew((s) => !s)}>{showNew ? "✕ Cancel" : "+ New Account"}</button>
        {showNew && (
          <Card style={{ marginBottom: 14 }}>
            <SL>New Account</SL>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input placeholder="Code" value={newAcc.code} onChange={(e) => setNewAcc((p) => ({ ...p, code: e.target.value }))} style={inp} />
              <input placeholder="Name" value={newAcc.name} onChange={(e) => setNewAcc((p) => ({ ...p, name: e.target.value }))} style={inp} />
              <div style={{ fontSize: 11, color: T.muted, background: T.bg, borderRadius: 8, padding: "8px 12px", lineHeight: 1.7 }}>1000s=Assets · 1500=AR · 1900s=Bank · 2000s=Equity · 2400=AP · 3000s=Income · 4000s=Expenses</div>
              <button style={btnRed} onClick={() => { if (!newAcc.code || !newAcc.name) return; setList((p) => [...p, { ...newAcc }]); setNewAcc({ code: "", name: "" }); setShowNew(false); }}>Add</button>
            </div>
          </Card>
        )}
        {Object.entries(SERIES).map(([key, s]) => {
          const grp = filtered.filter((a) => getSK(a.code) === key).sort((a, b) => a.code.localeCompare(b.code));
          if (!grp.length) return null;
          return (
            <div key={key} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span>{s.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: s.color, textTransform: "uppercase" }}>{s.name}</span>
              </div>
              {grp.map((a) => {
                const ri = list.findIndex((x) => x.code === a.code);
                const isE = editingIdx === ri;
                return (
                  <div key={a.code} style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, padding: "12px 14px", marginBottom: 6 }}>
                    {isE ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 8 }}>
                          <input value={list[ri].code} onChange={(e) => { const n = [...list]; n[ri] = { ...n[ri], code: e.target.value }; setList(n); }} style={{ ...inp, fontSize: 13 }} />
                          <input value={list[ri].name} onChange={(e) => { const n = [...list]; n[ri] = { ...n[ri], name: e.target.value }; setList(n); }} style={{ ...inp, fontSize: 13 }} />
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button style={{ ...btnRed, flex: 1, padding: "8px" }} onClick={() => setEditingIdx(null)}>✓ Done</button>
                          <button style={{ ...btnGhost, flex: 1, padding: "8px" }} onClick={() => setEditingIdx(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ background: s.bg, color: s.color, borderRadius: 7, padding: "4px 9px", fontSize: 12, fontWeight: 800 }}>{a.code}</span>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</span>
                        </div>
                        <button style={btnSm} onClick={() => setEditingIdx(ri)}>✏️ Edit</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
        <button style={btnRed} onClick={() => onSave(list)}>💾 Save All Changes</button>
      </div>
    </div>
  );
}
