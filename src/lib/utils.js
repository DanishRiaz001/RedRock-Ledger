// Pure helper functions — account classification and PKR formatting.

export const getSK = (code) => {
  const n = parseInt(code);
  if (n >= 1900 && n < 2000) return "1900";
  if (n >= 1500 && n < 1600) return "1500";
  if (n >= 1000 && n < 2000) return "1000";
  if (n >= 2400 && n < 2500) return "2400";
  if (n >= 2000 && n < 3000) return "2000";
  if (n >= 3000 && n < 4000) return "3000";
  if (n >= 4000 && n < 5000) return "4000";
  return null;
};

export const fmt = (n) =>
  new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(Math.abs(n));

export const fmtB = (n) => `B-${String(n).padStart(3, "0")}`;

export const sign = (n) => (n >= 0 ? "+" : "−") + fmt(n);
