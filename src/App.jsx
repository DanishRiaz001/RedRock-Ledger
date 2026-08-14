import { Root } from "./components/appshell.jsx";

/**
 * This is the real app entry point -- every screen from the original
 * 17,430-line index.html has been extracted, wired, and validated in stages.
 * Root handles Supabase auth and renders AppShell -> FinanceTracker
 * (the full screen router) once a user is authenticated.
 */
export default function App() {
  return <Root />;
}
