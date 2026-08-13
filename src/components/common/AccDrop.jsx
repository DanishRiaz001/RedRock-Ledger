import { inp } from "../../lib/theme.js";
import { SERIES } from "../../lib/constants.js";
import { getSK } from "../../lib/utils.js";

export default function AccDrop({ value, onChange, accounts }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={inp}>
      <option value="">— Select Account —</option>
      {Object.entries(SERIES).map(([key, s]) => {
        const grp = accounts.filter((a) => getSK(a.code) === key).sort((a, b) => a.code.localeCompare(b.code));
        if (!grp.length) return null;
        return (
          <optgroup key={key} label={`${s.icon} ${s.name}`}>
            {grp.map((a) => (
              <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}
