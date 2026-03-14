import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    {
      name: "agent-debug-log-endpoint",
      apply: "serve",
      configureServer(server) {
        server.middlewares.use("/__agent_debug_log", (req, res) => {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end("Method Not Allowed");
            return;
          }
          let raw = "";
          req.on("data", (chunk) => {
            raw += String(chunk);
          });
          req.on("end", () => {
            try {
              const payload = JSON.parse(raw || "{}");
              fs.appendFileSync(
                "/opt/cursor/logs/debug.log",
                `${JSON.stringify({
                  hypothesisId: payload?.hypothesisId ?? "unknown",
                  location: payload?.location ?? "unknown",
                  message: payload?.message ?? "unknown",
                  data: payload?.data ?? {},
                  timestamp: payload?.timestamp ?? Date.now(),
                })}\n`,
              );
              res.statusCode = 204;
              res.end();
            } catch {
              res.statusCode = 400;
              res.end("Invalid JSON payload");
            }
          });
        });
      },
    },
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "pwa-icon-192.png", "pwa-icon-512.png"],
      manifest: {
        name: "TableMate - Gestão de Pedidos",
        short_name: "TableMate",
        description: "Sistema de gestão de mesas e pedidos para restaurantes",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          {
            src: "pwa-icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallbackDenylist: [/^\/~oauth/],
        importScripts: ["/sw-push.js"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*supabase.*\/rest\/v1\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
