import { useEffect } from "react";
import { Root } from "./components/appshell.jsx";
import { initNativeApp } from "./lib/native.js";

/**
 * This is the real app entry point -- every screen from the original
 * 17,430-line index.html has been extracted, wired, and validated in stages.
 * Root handles Supabase auth and renders AppShell -> FinanceTracker
 * (the full screen router) once a user is authenticated.
 */
export default function App() {
  useEffect(() => { initNativeApp(); }, []);
  // A trackpad pinch (or Ctrl+scroll) anywhere on the page was zooming the
  // WHOLE BROWSER WINDOW, not just the document/receipt preview the person
  // was actually trying to zoom into -- the preview's own zoom controls
  // already work independently via React state, so this only needs to stop
  // the browser's native page-zoom gesture from firing in the first place.
  // Chrome/Firefox represent that gesture as a wheel event with ctrlKey set;
  // Safari fires its own non-standard gesture* events for the same trackpad
  // pinch, so both are covered. Deliberate keyboard zoom (Ctrl +/-) is left
  // alone -- that's an accessibility feature, not the bug being fixed here.
  useEffect(() => {
    const blockWheelZoom = (e) => { if (e.ctrlKey) e.preventDefault(); };
    const blockGesture = (e) => { e.preventDefault(); };
    window.addEventListener("wheel", blockWheelZoom, { passive: false });
    window.addEventListener("gesturestart", blockGesture);
    window.addEventListener("gesturechange", blockGesture);
    return () => {
      window.removeEventListener("wheel", blockWheelZoom);
      window.removeEventListener("gesturestart", blockGesture);
      window.removeEventListener("gesturechange", blockGesture);
    };
  }, []);
  return <Root />;
}
