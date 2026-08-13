import { T, inp } from "../lib/theme.js";
import TxnCard from "../components/TxnCard.jsx";

export default function EntriesTab({ entrySearch, setEntrySearch, searchedEntries, accounts, onEdit, onReverse }) {
  return (
    <div>
      <div style={{ position: "relative", marginBottom: 12 }}>
        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.muted }}>🔍</span>
        <input placeholder="Search bilag, description, account..." value={entrySearch} onChange={(e) => setEntrySearch(e.target.value)} style={{ ...inp, paddingLeft: 42 }} />
      </div>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 10, fontWeight: 600 }}>{searchedEntries.length} entries</div>
      {searchedEntries.map((t) => (
        <TxnCard key={t.id} t={t} accounts={accounts} onEdit={onEdit} onReverse={onReverse} />
      ))}
    </div>
  );
}
