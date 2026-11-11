import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "~": resolve(__dirname, "./src"),
    },
  },
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
  build: {
    outDir: "../api/static/react",
    emptyOutDir: true,
    manifest: true,
    cssCodeSplit: false,
    rolldownOptions: {
      input: {
        main: "./src/main.tsx",
      },
      output: {
        entryFileNames: "assets/main-react-app.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.names.includes("style.css")) {
            return "assets/main-react-app.css";
          }
          return "assets/[name][extname]";
        },
      },
    },
  },
});
