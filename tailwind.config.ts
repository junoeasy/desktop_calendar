import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: "var(--accent)"
      }
    }
  },
  darkMode: ["class"],
  plugins: []
} satisfies Config;
