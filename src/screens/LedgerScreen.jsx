import { useState, useMemo } from "react";
import { T, inp, btnSm } from "../lib/theme.js";
import { SERIES } from "../lib/constants.js";
import { getSK, fmt, fmtB, sign } from "../lib/utils.js";
import BackHeader from "../components/common/BackHeader.jsx";
import DetailModal from "../components/modals/DetailModal.jsx";

export default function LedgerScreen({ account, accounts, transactions, onBack, onEditTxn, onReverseTxn, onMatchTxns }) {
  const today = new Date().toISOString().split("T")[0];
  const [from, setFrom] = useState("2026-01-01");
  const [to, setTo] = useState(today);
  const [detailTxn, setDetailTxn] = useState(null);
  const [selected, setSelected] = useState([]);
  const [showMatched, setShowMatched] = useState(false);
  const sk = getSK(account.code);
  const series = sk ? SERIES[sk] : null;

  const openingBal = useMemo(() =>
    transactions.filter((t) => t.date < from && (t.debitCode === account.code || t.creditCode === account.code))
      .reduce((s, t) => (t.debitCode === account.code ? s + t.amount : s - t.amount), 0),
    [transactions, account.code, from]);

  const allRows = useMemo(() => {
    let running = openingBal;
    return transactions
      .filter((t) => t.date >= from && t.date <= to && (t.debitCode === account.code || t.creditCode === account.code))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t) => {
        const isDr = t.debitCode === account.code;
        const movement = isDr ? t.amount : -t.amount;
        running += movement;
        return { ...t, movement, balance: running };
      });
  }, [transactions, account.code, from, to, openingBal]);

  const rows = allRows.filter((r) => !r.matchedWith);
  const matchedRows = allRows.filter((r) => !!r.matchedWith);
  const closingBal = allRows.length > 0 ? allRows[allRows.length - 1].balance : openingBal;
  const periodMovement = allRows.reduce((s, r) => s + r.movement, 0);

  const toggleSel = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const selSum = selected.reduce((s, id) => { const r = rows.find((x) => x.id === id); return r ? s + r.movement : s; }, 0);
  const doMatch = () => { if (selected.length < 2 || Math.abs(selSum) >= 1) return; onMatchTxns(selected, Date.now().toString()); setSelected([]); };

  return (
    <div style={{ background: T.bg, minHeight: "100vh", fontFamily: "system-ui,sans-serif", maxWidth: 430, margin: "0 auto", paddingBottom: 90 }}>
      {detailTxn && (
        <DetailModal
          txn={detailTxn}
          accounts={accounts}
          onEdit={(u) => { onEditTxn(u); setDetailTxn(null); }}
          onReverse={(tx) => { onReverseTxn(tx); setDetailTxn(null); }}
          onClose={() => setDetailTxn(null)}
        />
      )}
      <BackHeader
        title={account.name}
        sub={`${series ? series.icon : ""} ${series ? series.name : ""} · ${account.code}`}
        color={series ? series.color : undefined}
        onBack={onBack}
      />
      <div style={{ background: "#fff", borderBottom: `1px solid ${T.border}`, padding: "10px 16px", display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: T.muted, fontWeight: 700, minWidth: 30 }}>FROM</span>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...inp, flex: 1, padding: "7px 10px", fontSize: 12 }} />
        <span style={{ fontSize: 11, color: T.muted, fontWeight: 700 }}>TO</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...inp, flex: 1, padding: "7px 10px", fontSize: 12 }} />
      </div>
      <div style={{ padding: 16 }}>
        {selected.length > 0 && (
          <div style={{ background: T.header, borderRadius: 12, padding: "12px 16px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 11, color: "#aaa" }}>{selected.length} selected · Net: <span style={{ color: Math.abs(selSum) < 1 ? T.green : "#f87171" }}>{sign(selSum)}</span></div>
              <div style={{ fontSize: 12, color: "#fff", fontWeight: 700, marginTop: 2 }}>{Math.abs(selSum) < 1 ? "✓ Ready to match" : "Entries must net to zero"}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setSelected([])} style={{ ...btnSm, background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 11 }}>Clear</button>
              <button onClick={doMatch} style={{ ...btnSm, background: Math.abs(selSum) < 1 ? T.green : "#555", color: "#fff", fontSize: 11, opacity: Math.abs(selSum) < 1 ? 1 : 0.5 }}>Match ✓</button>
            </div>
          </div>
        )}
        {matchedRows.length > 0 && (
          <button onClick={() => setShowMatched((s) => !s)} style={{ ...btnSm, marginBottom: 10, fontSize: 11 }}>
            {showMatched ? "▲ Hide" : "▼ Show"} Matched ({matchedRows.length})
          </button>
        )}
        {showMatched && (
          <div style={{ background: "#f0faf5", borderRadius: 12, padding: "10px 12px", marginBottom: 10, border: "1px solid #b7e4d4" }}>
            <div style={{ fontSize: 11, color: T.green, fontWeight: 800, marginBottom: 6 }}>✓ MATCHED</div>
            {matchedRows.map((r) => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #d1f5e5", fontSize: 12 }}>
                <span style={{ color: T.sub }}>{fmtB(r.bilag)} · {r.description}</span>
                <span style={{ fontWeight: 700, color: r.movement >= 0 ? T.green : T.red }}>{sign(r.movement)}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "24px 46px 42px 1fr 76px", gap: 4, padding: "6px 6px", borderBottom: `2px solid ${T.border}` }}>
          {["", "Bilag", "Date", "Description", "Amount"].map((h) => (
            <div key={h} style={{ fontSize: 10, color: T.muted, fontWeight: 700, textAlign: h === "Amount" ? "right" : "left", textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</div>
          ))}
        </div>
        {rows.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0", color: T.muted }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>No transactions in this period</div>
          </div>
        )}
        {rows.map((r, i) => {
          const isSel = selected.includes(r.id);
          const isRev = !!r.reversalOf;
          return (
            <div key={r.id} style={{ display: "grid", gridTemplateColumns: "24px 46px 42px 1fr 76px", gap: 4, padding: "9px 6px", borderBottom: `1px solid ${T.border}`, alignItems: "center", background: isSel ? T.blueBg : i % 2 === 0 ? "#fff" : T.bg, borderLeft: isSel ? `3px solid ${T.blue}` : "3px solid transparent" }}>
              <input type="checkbox" checked={isSel} onChange={() => toggleSel(r.id)} style={{ width: 14, height: 14, cursor: "pointer", accentColor: T.blue }} />
              <div onClick={() => setDetailTxn(r)} style={{ fontSize: 10, color: T.blue, fontWeight: 800, cursor: "pointer", textDecoration: "underline dotted" }}>{fmtB(r.bilag)}</div>
              <div style={{ fontSize: 10, color: T.sub }}>{r.date.slice(5)}</div>
              <div style={{ fontSize: 12, color: isRev ? T.red : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: isRev ? "italic" : "normal" }}>{r.description}</div>
              <div style={{ fontSize: 12, fontWeight: 800, textAlign: "right", color: r.movement >= 0 ? T.green : T.red }}>{r.movement >= 0 ? "+" : "−"}{fmt(r.movement)}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: T.header, borderTop: "1px solid #2a3a5e", padding: "12px 16px", boxShadow: "0 -4px 20px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[{ label: "Opening Bal", value: openingBal, color: "#93A8D0" }, { label: "Period Mvmt", value: periodMovement, color: periodMovement >= 0 ? T.green : T.red }, { label: "Closing Bal", value: closingBal, color: closingBal >= 0 ? "#4ade80" : T.red }].map((c, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#6C7A9C", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>{c.label}</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: c.color }}>{sign(c.value)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
