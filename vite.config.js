import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// RedRock Ledger — Vite build config
// Base path is "/" for a custom domain / Cloudflare Pages deploy.
// If ever deployed to a GitHub Pages *project* page (username.github.io/RedRock-Ledger/),
// set base: "/RedRock-Ledger/" instead.
export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
