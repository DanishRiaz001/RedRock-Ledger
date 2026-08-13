import { useState } from "react";
import { T, inp, btnRed, btnSm } from "../lib/theme.js";
import { fmt, fmtB, sign } from "../lib/utils.js";
import SL from "../components/common/SL.jsx";
import Card from "../components/common/Card.jsx";
import BackHeader from "../components/common/BackHeader.jsx";

export default function ReskontroScreen({ contacts, setContacts, transactions, accounts, onBack }) {
  const [view, setView] = useState(null);
  const [contactDetail, setContactDetail] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [selected, setSelected] = useState([]);
  const [showMatched, setShowMatched] = useState(false);

  const customers = contacts.filter((c) => c.type === "customer");
  const suppliers = contacts.filter((c) => c.type === "supplier");

  const nextId = (type) => {
    const prefix = type === "customer" ? "C" : "S";
    const nums = contacts.filter((c) => c.type === type).map((c) => parseInt(c.id.slice(1)) || 0);
    return `${prefix}${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0")}`;
  };

  const addContact = () => {
    if (!newName) return;
    setContacts((p) => [...p, { id: nextId(view), type: view, name: newName, notes: "" }]);
    setNewName(""); setShowNew(false);
  };

  const getContactTxns = (cid) => transactions.filter((t) => t.contactId === cid);

  const getBalance = (cid) => {
    const c = contacts.find((x) => x.id === cid);
    if (!c) return 0;
    const code = c.type === "customer" ? "1500" : "2400";
    return getContactTxns(cid).reduce((s, t) => (t.debitCode === code ? s + t.amount : t.creditCode === code ? s - t.amount : s), 0);
  };

  if (contactDetail) {
    const c = contacts.find((x) => x.id === contactDetail);
    const isCustomer = c.type === "customer";
    const code = isCustomer ? "1500" : "2400";
    const txns = getContactTxns(c.id);
    const openTxns = txns.filter((t) => !t.matchedWith);
    const matchedTxns = txns.filter((t) => !!t.matchedWith);
    const bal = getBalance(c.id);
    const toggleSel = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    const selSum = selected.reduce((s, id) => {
      const t = openTxns.find((x) => x.id === id);
      if (!t) return s;
      const mv = t.debitCode === code ? t.amount : -t.amount;
      return s + mv;
    }, 0);
    return (
      <div style={{ background: T.bg, minHeight: "100vh", fontFamily: "system-ui,sans-serif", maxWidth: 430, margin: "0 auto", paddingBottom: 80 }}>
        <BackHeader title={c.name} sub={`${c.id} · ${isCustomer ? "Customer" : "Supplier"}`} color={isCustomer ? T.blue : T.red} onBack={() => { setContactDetail(null); setSelected([]); }} />
        <div style={{ padding: 16 }}>
          <div style={{ background: bal >= 0 ? T.blueBg : T.redLight, borderRadius: 14, padding: "16px", marginBottom: 14, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, marginBottom: 4 }}>{isCustomer ? "OUTSTANDING RECEIVABLE" : "OUTSTANDING PAYABLE"}</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: bal >= 0 ? T.blue : T.red }}>{sign(bal)}</div>
          </div>
          {selected.length > 0 && (
            <div style={{ background: T.header, borderRadius: 12, padding: "12px 14px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, color: "#aaa" }}>{selected.length} selected · Net: <span style={{ color: Math.abs(selSum) < 1 ? T.green : "#f87171" }}>{sign(selSum)}</span></div>
                <div style={{ fontSize: 12, color: "#fff", fontWeight: 700, marginTop: 1 }}>{Math.abs(selSum) < 1 ? "✓ Ready to match" : "Must net to zero"}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setSelected([])} style={{ ...btnSm, background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 11 }}>Clear</button>
                <button onClick={() => { if (Math.abs(selSum) >= 1) return; alert("Matched! Connect Firebase to persist."); setSelected([]); }} style={{ ...btnSm, background: Math.abs(selSum) < 1 ? T.green : "#555", color: "#fff", fontSize: 11 }}>Match ✓</button>
              </div>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <SL>Open Entries</SL>
            {matchedTxns.length > 0 && <button onClick={() => setShowMatched((s) => !s)} style={{ ...btnSm, fontSize: 10 }}>{showMatched ? "Hide" : "Show"} Matched ({matchedTxns.length})</button>}
          </div>
          {showMatched && (
            <div style={{ background: "#f0faf5", borderRadius: 12, padding: "10px 12px", marginBottom: 10, border: "1px solid #b7e4d4" }}>
              <div style={{ fontSize: 11, color: T.green, fontWeight: 800, marginBottom: 6 }}>✓ MATCHED</div>
              {matchedTxns.map((t) => (
                <div key={t.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: "1px solid #d1f5e5" }}>
                  <span style={{ color: T.sub }}>{fmtB(t.bilag)} · {t.description}</span>
                  <span style={{ fontWeight: 700, color: T.green }}>{fmt(t.amount)}</span>
                </div>
              ))}
            </div>
          )}
          {openTxns.length === 0 && <div style={{ textAlign: "center", color: T.muted, padding: 20, fontSize: 13 }}>No open entries.</div>}
          {openTxns.map((t) => {
            const mv = t.debitCode === code ? t.amount : -t.amount;
            const isSel = selected.includes(t.id);
            return (
              <div key={t.id} onClick={() => toggleSel(t.id)} style={{ background: isSel ? T.blueBg : T.card, borderRadius: 12, border: `1px solid ${isSel ? T.blue : T.border}`, padding: "12px 14px", marginBottom: 7, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={isSel} onChange={() => toggleSel(t.id)} style={{ accentColor: T.blue }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{t.description}</div>
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{fmtB(t.bilag)} · {t.date}</div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 13, color: mv >= 0 ? T.blue : T.red }}>{sign(mv)}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (view) {
    const list = view === "customer" ? customers : suppliers;
    const isCustomer = view === "customer";
    return (
      <div style={{ background: T.bg, minHeight: "100vh", fontFamily: "system-ui,sans-serif", maxWidth: 430, margin: "0 auto" }}>
        <BackHeader title={isCustomer ? "Customers" : "Suppliers"} sub={`RESKONTRO · ${isCustomer ? "📥 AR" : "📤 AP"}`} color={isCustomer ? T.blue : T.red} onBack={() => setView(null)} />
        <div style={{ padding: 16 }}>
          <button style={{ ...btnRed, marginBottom: 14 }} onClick={() => setShowNew((s) => !s)}>{showNew ? "✕ Cancel" : `+ New ${isCustomer ? "Customer" : "Supplier"}`}</button>
          {showNew && (
            <Card style={{ marginBottom: 14 }}>
              <SL>New {isCustomer ? "Customer" : "Supplier"}</SL>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input placeholder="Full Name / Company" value={newName} onChange={(e) => setNewName(e.target.value)} style={inp} />
                <button style={btnRed} onClick={addContact}>Add</button>
              </div>
            </Card>
          )}
          {list.map((c) => {
            const bal = getBalance(c.id);
            const isE = editingId === c.id;
            return (
              <Card key={c.id}>
                {isE ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: 8 }}>
                      <input value={c.id} readOnly style={{ ...inp, fontSize: 13, background: T.bg, color: T.muted }} />
                      <input value={c.name} onChange={(e) => setContacts((p) => p.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))} style={{ ...inp, fontSize: 13 }} />
                    </div>
                    <button style={{ ...btnRed, padding: "8px" }} onClick={() => setEditingId(null)}>✓ Done</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }} onClick={() => setContactDetail(c.id)}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: isCustomer ? T.blue : T.red, background: isCustomer ? T.blueBg : T.redLight, padding: "2px 7px", borderRadius: 5 }}>{c.id}</span>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: bal >= 0 ? T.green : T.red, marginLeft: 2 }}>{sign(bal)}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                      <button style={btnSm} onClick={() => setEditingId(c.id)}>✏️</button>
                      <span style={{ fontSize: 18, color: T.muted }}>›</span>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
          {!list.length && <div style={{ textAlign: "center", color: T.muted, padding: 30 }}>No {isCustomer ? "customers" : "suppliers"} yet.</div>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: T.bg, minHeight: "100vh", fontFamily: "system-ui,sans-serif", maxWidth: 430, margin: "0 auto" }}>
      <BackHeader title="Reskontro" sub="ACCOUNTS OVERVIEW" onBack={onBack} />
      <div style={{ padding: 16 }}>
        <SL>Select Type</SL>
        {[
          { type: "customer", label: "Customers", sub: "Accounts Receivable · 1500", icon: "📥", color: T.blue, bg: T.blueBg, count: customers.length },
          { type: "supplier", label: "Suppliers", sub: "Accounts Payable · 2400", icon: "📤", color: T.red, bg: T.redLight, count: suppliers.length },
        ].map((item) => (
          <div key={item.type} onClick={() => setView(item.type)} style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, padding: "18px 16px", marginBottom: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
            <div style={{ background: item.bg, borderRadius: 12, width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{item.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{item.label}</div>
              <div style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>{item.sub}</div>
              <div style={{ fontSize: 11, color: item.color, fontWeight: 600, marginTop: 4 }}>{item.count} contacts</div>
            </div>
            <span style={{ fontSize: 20, color: T.muted }}>›</span>
          </div>
        ))}
      </div>
    </div>
  );
}
