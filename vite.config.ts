import { defineConfig } from "vite";

// base "./" so the built site works from any path (GitHub Pages project URL or Vercel root).
export default defineConfig({
  base: "./",
  build: { target: "es2022", outDir: "dist" },
  test: { include: ["tests/**/*.test.ts"] },
} as any);
