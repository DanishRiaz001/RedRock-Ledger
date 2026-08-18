import { createClient } from "@supabase/supabase-js";

// Extracted from the original single-file app (lines 72-82).
const SUPABASE_URL = "https://rxarhvbqwwmipgvwdwvw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4YXJodmJxd3dtaXBndndkd3Z3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNDg5MzEsImV4cCI6MjA5NzkyNDkzMX0.wwRARzljhLraDaawC-Ol20TMJeakCFiRBJWUYwlfYyk";

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const SUPPORT_EMAIL = "danishriaz001@gmail.com";

// The original app used a mutable global `CURRENT_USER_ID` (set by AppShell on
// every render) so the Inbox/attachments feature — which keys localStorage and
// Storage paths by user id — always reflects the real logged-in user, since
// localStorage belongs to the BROWSER, not the account. We replace the bare
// global with a small module-level getter/setter so every importer reads the
// same live value without needing prop-drilling.
let _currentUserId = null;
export function getCurrentUserId() {
  return _currentUserId;
}
export function setCurrentUserId(id) {
  _currentUserId = id;
}

// Same pattern, for the active company — standalone helper functions (Inbox
// attachments, entry comments) that can't reach AppShell's activeCompanyId
// through React closures need a live value too, for the same reason.
let _currentCompanyId = null;
export function getCurrentCompanyId() {
  return _currentCompanyId;
}
export function setCurrentCompanyId(id) {
  _currentCompanyId = id;
}

// Same pattern again, for the feature-flag system — previously read straight
// from localStorage on every call (per-browser, resets if storage is
// cleared). Now populated once from Supabase on load and cached here, so
// isFeatureOn() etc. can stay synchronous (used throughout render code)
// while the real source of truth lives in the database.
let _adminFeaturesCache = {};
export function getAdminFeaturesCache() {
  return _adminFeaturesCache;
}
export function setAdminFeaturesCache(obj) {
  _adminFeaturesCache = obj || {};
}
let _userFeaturesCache = {}; // {userId: {featureId: bool}}
export function getUserFeaturesCache() {
  return _userFeaturesCache;
}
export function setUserFeaturesCache(obj) {
  _userFeaturesCache = obj || {};
}
