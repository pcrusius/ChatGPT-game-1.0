import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages project site: https://<user>.github.io/ChatGPT-game-1.0/
  base: "/ChatGPT-game-1.0/",
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 4173,
  },
});
