import { useState, useMemo } from "react";
import { T, inp } from "./lib/theme.js";
import { INIT_ACCOUNTS, INIT_CONTACTS, INIT_TXN, MENU, SIDEBAR } from "./lib/constants.js";
import { getSK, fmtB } from "./lib/utils.js";

import LedgerScreen from "./screens/LedgerScreen.jsx";
import BankModule from "./screens/BankModule.jsx";
import ReskontroScreen from "./screens/ReskontroScreen.jsx";
import SettingsMenu from "./screens/SettingsMenu.jsx";
import DashboardTab from "./screens/DashboardTab.jsx";
import EntriesTab from "./screens/EntriesTab.jsx";
import TransactionsTab from "./screens/TransactionsTab.jsx";
import AccountsTab from "./screens/AccountsTab.jsx";
import ReportsTab from "./screens/ReportsTab.jsx";
import BackHeader from "./components/common/BackHeader.jsx";

export default function FinanceTracker() {
  const [tab, setTab] = useState("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ledgerAcc, setLedgerAcc] = useState(null);
  const [accounts, setAccounts] = useState(INIT_ACCOUNTS);
  const [contacts, setContacts] = useState(INIT_CONTACTS);
  const [nextBilag, setNextBilag] = useState(10);
  const [transactions, setTransactions] = useState(INIT_TXN);
  const [entrySearch, setEntrySearch] = useState("");
  const [filterFrom, setFilterFrom] = useState("2026-06-01");
  const [filterTo, setFilterTo] = useState("2026-06-30");
  const [reportPeriod, setReportPeriod] = useState({ from: "2026-06-01", to: "2026-06-30" });
  const emptyTxn = { date: new Date().toISOString().split("T")[0], debitCode: "", creditCode: "", description: "", amount: "" };
  const [newTxn, setNewTxn] = useState(emptyTxn);

  const getName = (code) => {
    const acc = accounts.find((a) => a.code === code);
    return acc ? acc.name : code;
  };

  const saveEdit = (updated) => setTransactions((p) => p.map((t) => (t.id === updated.id ? { ...updated } : t)));

  const reverseTransaction = (t) => {
    const rb = nextBilag;
    setTransactions((p) => [
      ...p.map((x) => (x.id === t.id ? { ...x, reversedBy: rb } : x)),
      { id: Date.now(), bilag: rb, date: new Date().toISOString().split("T")[0], debitCode: t.creditCode, creditCode: t.debitCode, description: `Reversed bilag ${fmtB(t.bilag)}`, amount: t.amount, reversalOf: t.bilag },
    ]);
    setNextBilag((n) => n + 1);
  };

  const matchTransactions = (ids, grpId) => setTransactions((p) => p.map((t) => (ids.includes(t.id) ? { ...t, matchedWith: grpId } : t)));

  const addTransaction = () => {
    if (!newTxn.debitCode || !newTxn.creditCode || !newTxn.amount || !newTxn.description) return;
    setTransactions((p) => [...p, { ...newTxn, id: Date.now(), bilag: nextBilag, amount: parseFloat(newTxn.amount) }]);
    setNextBilag((n) => n + 1); setNewTxn(emptyTxn);
  };

  const filteredTxns = useMemo(() => transactions.filter((t) => t.date >= filterFrom && t.date <= filterTo), [transactions, filterFrom, filterTo]);
  const totalIncome = useMemo(() => filteredTxns.filter((t) => getSK(t.creditCode) === "3000").reduce((s, t) => s + t.amount, 0), [filteredTxns]);
  const totalExpenses = useMemo(() => filteredTxns.filter((t) => getSK(t.debitCode) === "4000").reduce((s, t) => s + t.amount, 0), [filteredTxns]);
  const reportTxns = useMemo(() => transactions.filter((t) => t.date >= reportPeriod.from && t.date <= reportPeriod.to), [transactions, reportPeriod]);
  const reportIncome = useMemo(() => {
    const m = {};
    reportTxns.filter((t) => getSK(t.creditCode) === "3000").forEach((t) => { m[t.creditCode] = (m[t.creditCode] || 0) + t.amount; });
    return m;
  }, [reportTxns]);
  const reportExpenses = useMemo(() => {
    const m = {};
    reportTxns.filter((t) => getSK(t.debitCode) === "4000").forEach((t) => { m[t.debitCode] = (m[t.debitCode] || 0) + t.amount; });
    return m;
  }, [reportTxns]);
  const totalRI = Object.values(reportIncome).reduce((s, v) => s + v, 0);
  const totalRE = Object.values(reportExpenses).reduce((s, v) => s + v, 0);
  const searchedEntries = useMemo(() => {
    const q = entrySearch.trim().toLowerCase();
    const all = [...transactions].sort((a, b) => b.bilag - a.bilag);
    if (!q) return all;
    return all.filter((t) => fmtB(t.bilag).toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.debitCode.includes(q) || t.creditCode.includes(q) || String(t.amount).includes(q));
  }, [transactions, entrySearch]);

  if (ledgerAcc) {
    return (
      <LedgerScreen
        account={ledgerAcc}
        accounts={accounts}
        transactions={transactions}
        onBack={() => setLedgerAcc(null)}
        onEditTxn={saveEdit}
        onReverseTxn={reverseTransaction}
        onMatchTxns={matchTransactions}
      />
    );
  }
  if (tab === "Settings") return <SettingsMenu accounts={accounts} onSave={setAccounts} onBack={() => setTab("Dashboard")} />;
  if (tab === "Reskontro") return <ReskontroScreen contacts={contacts} setContacts={setContacts} transactions={transactions} accounts={accounts} onBack={() => setTab("Dashboard")} />;
  if (tab === "Bank") {
    return (
      <div style={{ background: T.bg, minHeight: "100vh", fontFamily: "system-ui,sans-serif", maxWidth: 430, margin: "0 auto" }}>
        <BackHeader title="Bank" sub="BANK ACCOUNTS" onBack={() => setTab("Dashboard")} />
        <div style={{ padding: 16 }}>
          <BankModule accounts={accounts} transactions={transactions} onOpenLedger={setLedgerAcc} />
        </div>
      </div>
    );
  }

  const periodBar = (
    <div style={{ background: "#fff", borderBottom: `1px solid ${T.border}`, padding: "10px 16px", display: "flex", gap: 8, alignItems: "center" }}>
      <span style={{ fontSize: 11, color: T.muted, fontWeight: 700, minWidth: 30 }}>FROM</span>
      <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} style={{ ...inp, flex: 1, padding: "7px 10px", fontSize: 12 }} />
      <span style={{ fontSize: 11, color: T.muted, fontWeight: 700 }}>TO</span>
      <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} style={{ ...inp, flex: 1, padding: "7px 10px", fontSize: 12 }} />
    </div>
  );

  return (
    <div style={{ background: T.bg, minHeight: "100vh", fontFamily: "system-ui,-apple-system,sans-serif", maxWidth: 430, margin: "0 auto", paddingBottom: 80 }}>
      {sidebarOpen && (
        <>
          <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200 }} />
          <div style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: 230, background: T.sidebar, zIndex: 201, display: "flex", flexDirection: "column", boxShadow: "4px 0 24px rgba(0,0,0,0.3)" }}>
            <div style={{ padding: "28px 20px 16px" }}>
              <div style={{ fontSize: 10, color: "#6C7A9C", fontWeight: 700, letterSpacing: 2, marginBottom: 2 }}>MY FINANCE LEDGER</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>Menu</div>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {SIDEBAR.map((item) => {
                const active = tab === item.id;
                return (
                  <div key={item.id} onClick={() => { setTab(item.id); setSidebarOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 20px", cursor: "pointer", background: active ? "#D0021B" : "transparent", borderLeft: active ? "3px solid #fff" : "3px solid transparent" }}>
                    <span style={{ fontSize: 17, width: 22, textAlign: "center" }}>{item.icon}</span>
                    <span style={{ fontSize: 14, fontWeight: active ? 700 : 400, color: active ? "#fff" : "#8A9BBF" }}>{item.label}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: "14px 20px", borderTop: "1px solid #2A3A5E" }}>
              <div style={{ fontSize: 11, color: "#6C7A9C" }}>PKR · My Finance Ledger v1.0</div>
            </div>
          </div>
        </>
      )}

      <div style={{ background: T.header, padding: "16px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => setSidebarOpen(true)} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 10, color: "#fff", cursor: "pointer", width: 38, height: 38, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
          {[0, 1, 2].map((i) => <div key={i} style={{ width: 16, height: 1.5, background: "#fff", borderRadius: 2 }} />)}
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: "#6C7A9C", fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>My Finance Ledger · PKR</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#fff" }}>{(SIDEBAR.find((m) => m.id === tab) || {}).label || tab}</div>
        </div>
      </div>

      {(tab === "Dashboard" || tab === "Accounts" || tab === "Reports") && periodBar}

      <div style={{ padding: 16 }}>
        {tab === "Dashboard" && (
          <DashboardTab totalIncome={totalIncome} totalExpenses={totalExpenses} filteredTxns={filteredTxns} accounts={accounts} onEdit={saveEdit} onReverse={reverseTransaction} />
        )}
        {tab === "Entries" && (
          <EntriesTab entrySearch={entrySearch} setEntrySearch={setEntrySearch} searchedEntries={searchedEntries} accounts={accounts} onEdit={saveEdit} onReverse={reverseTransaction} />
        )}
        {tab === "Transactions" && (
          <TransactionsTab nextBilag={nextBilag} newTxn={newTxn} setNewTxn={setNewTxn} accounts={accounts} getName={getName} onAdd={addTransaction} />
        )}
        {tab === "Accounts" && (
          <AccountsTab accounts={accounts} transactions={transactions} onOpenLedger={setLedgerAcc} />
        )}
        {tab === "Reports" && (
          <ReportsTab reportPeriod={reportPeriod} setReportPeriod={setReportPeriod} reportIncome={reportIncome} reportExpenses={reportExpenses} totalRI={totalRI} totalRE={totalRE} getName={getName} />
        )}
      </div>

      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: "#fff", borderTop: `1px solid ${T.border}`, display: "flex", boxShadow: "0 -4px 20px rgba(0,0,0,0.08)" }}>
        {MENU.map((t) => {
          const active = tab === t.id;
          const isNew = t.id === "Transactions";
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: isNew ? "6px 2px 10px" : "9px 2px 11px", background: "none", border: "none", color: active ? T.red : T.muted, fontSize: 9, fontWeight: active ? 800 : 500, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              {isNew ? (
                <span style={{ background: T.red, color: "#fff", borderRadius: 14, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 900 }}>+</span>
              ) : (
                <span style={{ fontSize: 17 }}>{t.icon}</span>
              )}
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
