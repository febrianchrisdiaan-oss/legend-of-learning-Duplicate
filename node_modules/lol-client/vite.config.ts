import { defineConfig } from "vite";

export default defineConfig({
  envPrefix: ["VITE_"],
  build: {
    outDir: "../server/public",
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5173,
  },
  clearScreen: false,
});