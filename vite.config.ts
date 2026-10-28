import { defineConfig } from "vite";

export default defineConfig({
  // A GitHub Pages project site serves from /<repo>/, so the bundle has to be linked from that
  // prefix; anywhere else serves from the domain root. The deploy workflow sets PUBLIC_BASE, and
  // the default keeps `npm run dev` and `npm run preview` at the root.
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
