import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "shared")
    }
  },
  build: {
    outDir: "dist-renderer"
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
