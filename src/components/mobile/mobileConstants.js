// Height of the fixed bottom tab bar (content + safe-area inset), shared by
// MobileApp (which renders it) and every full-screen overlay (MobileScreen)
// so pushed screens stop above it instead of covering it.
export const TABBAR_H = "calc(58px + env(safe-area-inset-bottom))";

// Rotating palette for bank account cards — gives each account a distinct
// identity at a glance instead of every card looking identical.
export const BANK_COLORS = [
  {bg:"rgba(13,148,136,0.12)",fg:"#0D9488"},
  {bg:"rgba(36,97,217,0.12)",fg:"#2461D9"},
  {bg:"rgba(180,116,14,0.12)",fg:"#B4740E"},
  {bg:"rgba(124,58,237,0.12)",fg:"#7C3AED"},
  {bg:"rgba(232,90,59,0.12)",fg:"#E85A3B"},
  {bg:"rgba(14,159,110,0.12)",fg:"#0E9F6E"},
];
