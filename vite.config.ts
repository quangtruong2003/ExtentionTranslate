import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import fs from "node:fs";

export default defineConfig(({ mode }) => ({
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [
    react(),
    {
      name: "copy-extension-files",
      closeBundle() {
        // Vite emits settings HTML as index.html by default; rename to settings.html.
        const dist = path.resolve(__dirname, "dist");
        fs.mkdirSync(dist, { recursive: true });
        const generatedIndex = path.join(dist, "index.html");
        if (fs.existsSync(generatedIndex)) {
          const generatedSettings = path.join(dist, "settings.html");
          if (fs.existsSync(generatedSettings)) fs.rmSync(generatedSettings);
          fs.renameSync(generatedIndex, path.join(dist, "settings.html"));
        }
        fs.copyFileSync(
          path.resolve(__dirname, "public/manifest.json"),
          path.join(dist, "manifest.json"),
        );
        const iconsDir = path.resolve(__dirname, "public/icons");
        const targetIcons = path.join(dist, "icons");
        if (fs.existsSync(iconsDir)) {
          fs.mkdirSync(targetIcons, { recursive: true });
          for (const file of fs.readdirSync(iconsDir)) {
            if (file.toLowerCase().endsWith(".png")) {
              fs.copyFileSync(path.join(iconsDir, file), path.join(targetIcons, file));
            }
          }
        }
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: mode !== "development",
    target: "es2020",
    sourcemap: false,
    // Extension pages load chunks via the extension URL; emitting <link rel="modulepreload">
    // causes Chrome to warn "cross-world extension resource mismatch" and can break loading.
    modulePreload: false,
    rollupOptions: {
      input: {
        background: path.resolve(__dirname, "src/background/index.ts"),
        settings: path.resolve(__dirname, "index.html"),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "background") return "background.js";
          return "assets/[name].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: (asset) => {
          if (asset.name === "popup.css") return "assets/popup.css";
          if (asset.name?.endsWith(".css")) return "assets/[name]-[hash][extname]";
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
}));
