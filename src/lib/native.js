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
    await Keyboard.setResizeMode({ mode: "body" });
  } catch {
    // Keyboard plugin may be unavailable on some platforms — safe to skip.
  }
  // Give the first paint a moment before dropping the launch screen so the
  // user never sees a blank white flash between splash and real content.
  setTimeout(() => SplashScreen.hide().catch(() => {}), 250);
}
