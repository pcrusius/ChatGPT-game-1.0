import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages serves a project site from /<repo>/, so the bundle has to be linked relatively
  // rather than from the domain root. Nothing is fetched at runtime — every mesh, texture and
  // sound is generated in code — so a relative base is enough to host the build anywhere,
  // at any path. Left at "/" for local dev and preview, where the game is at the root.
  base: process.env.PUBLIC_BASE ?? "/",
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
