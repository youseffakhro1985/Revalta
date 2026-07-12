import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        petroleum: {
          50:  "#f2f6f5",
          100: "#e0edea",
          200: "#c2dcd6",
          300: "#99c3ba",
          400: "#6ba398",
          500: "#4b877b",
          600: "#386b61",
          700: "#2f5750",
          800: "#274641",
          900: "#223b37",
          950: "#11221f",
        },
        sand: {
          50:  "#fafaf8",
          100: "#f4f4f0",
          200: "#ebe8e0",
          300: "#e0dcd0",
          400: "#c7c1b1",
          500: "#afaa99",
          600: "#999382",
          700: "#807b6c",
          800: "#696459",
          900: "#57534a",
          950: "#302e29",
        },
        ink: {
          50:  "#f6f6f6",
          100: "#e7e7e7",
          200: "#d1d1d1",
          300: "#b0b0b0",
          400: "#888888",
          500: "#6d6d6d",
          600: "#5d5d5d",
          700: "#4f4f4f",
          800: "#454545",
          900: "#3d3d3d",
          950: "#1a1a1a",
        },
        brand: {
          50:  "#f0f4ff",
          100: "#e0eaff",
          200: "#c7d7fe",
          300: "#a5bcfc",
          400: "#8098f9",
          500: "#6172f3",
          600: "#444ce7",
          700: "#3538cd",
          800: "#2d31a6",
          900: "#2d3282",
          950: "#1f2064",
        },
        slate: {
          50:  "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
          950: "#020617",
        },
        success: {
          50:  "#f0fdf4",
          500: "#22c55e",
          600: "#16a34a",
        },
        warning: {
          50:  "#fffbeb",
          500: "#f59e0b",
          600: "#d97706",
        },
        danger: {
          50:  "#fef2f2",
          500: "#ef4444",
          600: "#dc2626",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "-apple-system", "sans-serif"],
        display: ["var(--font-display)", "Manrope", "Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      boxShadow: {
        "card":     "0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)",
        "card-md":  "0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05)",
        "card-lg":  "0 10px 15px -3px rgb(0 0 0 / 0.06), 0 4px 6px -4px rgb(0 0 0 / 0.06)",
        "inner-sm": "inset 0 1px 2px 0 rgb(0 0 0 / 0.05)",
        "premium-sm": "0 2px 8px -2px rgba(26, 26, 26, 0.04), 0 1px 2px -1px rgba(26, 26, 26, 0.02)",
        "premium-md": "0 4px 16px -4px rgba(26, 26, 26, 0.06), 0 2px 4px -2px rgba(26, 26, 26, 0.03)",
        "premium-lg": "0 12px 32px -4px rgba(26, 26, 26, 0.08), 0 4px 12px -4px rgba(26, 26, 26, 0.04)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      animation: {
        "fade-in":     "fadeIn 0.2s ease-in-out",
        "slide-up":    "slideUp 0.3s ease-out",
        "slide-right": "slideRight 0.3s ease-out",
        "pulse-soft":  "pulseSoft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in-soft": "fadeInSoft 0.5s ease-out",
        "slide-up-soft": "slideUpSoft 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideRight: {
          "0%":   { opacity: "0", transform: "translateX(-8px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0.6" },
        },
        fadeInSoft: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUpSoft: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
