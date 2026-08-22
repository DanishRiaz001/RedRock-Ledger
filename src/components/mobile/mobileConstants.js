// Height of the fixed bottom tab bar (content + safe-area inset), shared by
// MobileApp (which renders it) and every full-screen overlay (MobileScreen)
// so pushed screens stop above it instead of covering it.
export const TABBAR_H = "calc(58px + env(safe-area-inset-bottom))";
