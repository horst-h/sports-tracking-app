import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icons/favicon-16.png",
        "icons/favicon-32.png",
        "icons/apple-touch-icon.png",
      ],
      manifest: false, // Use external manifest.webmanifest
    }),
  ],
  define: {
    __VITE_BUILD_TIME__: JSON.stringify(new Date().toLocaleString("de-DE")),
  },
  server: { port: 5173, strictPort: true },
});
