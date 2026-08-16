import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: false,
    target: "es2020",
    sourcemap: false,
    modulePreload: false,
    rollupOptions: {
      input: path.resolve(__dirname, "src/content/index.tsx"),
      output: {
        entryFileNames: "content.js",
        inlineDynamicImports: true,
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
