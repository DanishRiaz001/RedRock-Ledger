// Everything in here is a no-op in the browser — @capacitor/core detects
// there's no native bridge and Capacitor.isNativePlatform() just returns
// false, so this file is safe to import unconditionally from the web build
// too instead of needing a separate native-only entry point.
import { Capacitor } from "@capacitor/core";

export const isNativeApp = () => Capacitor.isNativePlatform();

export async function initNativeApp() {
  if (!isNativeApp()) return;
  const [{ StatusBar, Style }, { SplashScreen }, { Keyboard }] = await Promise.all([
    import("@capacitor/status-bar"),
    import("@capacitor/splash-screen"),
    import("@capacitor/keyboard"),
  ]);
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#FFFFFF" });
  } catch {
    // Not fatal — some devices/OS versions restrict status bar color control.
  }
  try {
    // Must match capacitor.config.json's Keyboard.resize — "body" here
    // fights the app's own position:fixed layout (and contentInset:"never"),
    // producing a permanently mis-scaled/zoomed page after the keyboard is
    // used once. "native" lets iOS handle keyboard avoidance without
    // resizing the webview itself.
    await Keyboard.setResizeMode({ mode: "native" });
  } catch {
    // Keyboard plugin may be unavailable on some platforms — safe to skip.
  }
  // The native mobile UI is a fixed single-column layout, not a pinch-zoom
  // desktop-width one — a stray pinch/double-tap on a real device sends the
  // whole page into a permanently zoomed state (content overflowing off
  // both edges) since the shared viewport meta still allows scaling for the
  // website's benefit. Lock it down only inside the native app.
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) {
    viewport.setAttribute("content", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover");
  }
  // Give the first paint a moment before dropping the launch screen so the
  // user never sees a blank white flash between splash and real content.
  setTimeout(() => SplashScreen.hide().catch(() => {}), 250);
}
