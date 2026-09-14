// Historical foreign-exchange rates — for converting an invoice/sale amount
// posted in a currency other than the company's own base currency into that
// base currency, using the rate as of the ENTRY'S date, never today's rate
// (a backdated or historical entry must convert at the rate that actually
// applied on that day).
//
// Norges Bank's own published rates (data.norges-bank.no) are the primary
// source: free, no API key, no rate limit tied to a key, and — since it's
// Norway's central bank — the officially published rate for Norwegian
// bookkeeping purposes. It only ever quotes a currency's value in NOK
// though (foreign units -> NOK), so any pair not involving NOK is bridged
// through it: amount_in_toCcy = amount * nokValue(fromCcy) / nokValue(toCcy).
// Norges Bank only tracks a limited set of currencies; if either side isn't
// one of them, fxratesapi.com (a keyless commercial service) is used as a
// fallback for a direct cross rate.
//
// A null return means "no automatic rate available" — every caller must
// treat that as normal and fall back to manual entry, never block on it.

const rateCache = new Map(); // key -> Promise<{rate, source, date} | null>

function isoDaysBefore(dateISO, days) {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// NOK value of 1 unit of `ccy` on/before `dateISO` (the last published
// business-day rate at or before that date — Norges Bank only quotes
// business days, so a weekend/holiday invoice date falls back to the most
// recent prior quote, standard practice for a non-trading-day rate). NOK
// itself is the identity, 1.
async function nokValue(ccy, dateISO) {
  const CCY = (ccy || "").toUpperCase();
  if (CCY === "NOK") return 1;
  const url = `https://data.norges-bank.no/api/data/EXR/B.${CCY}.NOK.SP?format=sdmx-json&startPeriod=${isoDaysBefore(dateISO, 12)}&endPeriod=${dateISO}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const json = await res.json();
    const ds = json && json.data && json.data.dataSets && json.data.dataSets[0];
    const series = ds && ds.series && ds.series["0:0:0:0"];
    const obs = series && series.observations;
    if (!obs) return null;
    // Observation attributes carry UNIT_MULT (Norges Bank quotes many
    // currencies per 100 units, some per unit) — read it instead of
    // assuming, so the divisor is always right regardless of the currency.
    // SDMX-JSON encodes each series attribute as a positional index into
    // that attribute descriptor's own `values` list (e.g. series.attributes
    // [0,0,0,0] paired against structure.attributes.series[0..3]).
    let divisor = 1;
    const attrDescs = (json.data.structure && json.data.structure.attributes && json.data.structure.attributes.series) || [];
    const unitMultPos = attrDescs.findIndex(a => a.id === "UNIT_MULT");
    const seriesAttrVals = series.attributes || [];
    if (unitMultPos >= 0 && seriesAttrVals[unitMultPos] != null) {
      const valIdx = seriesAttrVals[unitMultPos];
      const multEntry = attrDescs[unitMultPos].values && attrDescs[unitMultPos].values[valIdx];
      const mult = multEntry ? parseInt(multEntry.id, 10) : NaN;
      if (!isNaN(mult)) divisor = Math.pow(10, mult);
    }
    const keys = Object.keys(obs).map(Number).sort((a, b) => a - b);
    if (!keys.length) return null;
    const lastVal = parseFloat(obs[keys[keys.length - 1]][0]);
    if (!lastVal || isNaN(lastVal)) return null;
    return lastVal / divisor;
  } catch {
    return null;
  }
}

async function fxratesapiRate(fromCcy, toCcy, dateISO) {
  try {
    const url = `https://api.fxratesapi.com/historical?date=${dateISO}&base=${fromCcy}&currencies=${toCcy}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const rate = json && json.rates && json.rates[toCcy];
    if (!rate || isNaN(rate)) return null;
    return rate;
  } catch {
    return null;
  }
}

// Returns {rate, source, date} where `rate` converts 1 unit of `fromCcy`
// into `toCcy` (multiply an amount in fromCcy by `rate` to get toCcy), or
// null if no automatic rate could be found for this pair/date.
export async function fetchHistoricalRate(fromCcy, toCcy, dateISO) {
  const FROM = (fromCcy || "").toUpperCase();
  const TO = (toCcy || "").toUpperCase();
  if (!FROM || !TO || !dateISO) return null;
  if (FROM === TO) return { rate: 1, source: "same currency", date: dateISO };
  const key = `${FROM}|${TO}|${dateISO}`;
  if (rateCache.has(key)) return rateCache.get(key);
  const promise = (async () => {
    const [fromNok, toNok] = await Promise.all([nokValue(FROM, dateISO), nokValue(TO, dateISO)]);
    if (fromNok != null && toNok != null) {
      return { rate: fromNok / toNok, source: "Norges Bank", date: dateISO };
    }
    const direct = await fxratesapiRate(FROM, TO, dateISO);
    if (direct != null) return { rate: direct, source: "fxratesapi.com", date: dateISO };
    return null;
  })();
  rateCache.set(key, promise);
  return promise;
}
