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
        background: "#FAF7F2",
        primary: {
          DEFAULT: "#475E4E",
          hover: "#5A725E",
        },
        secondary: {
          DEFAULT: "#5A725E",
        },
        border: {
          DEFAULT: "#ECEBE7",
        },
        accent: {
          DEFAULT: "#DDE3DC",
        },
        ink: {
          DEFAULT: "#2E372F",
          50:  "#f6f6f6",
          100: "#e7e7e7",
          200: "#d1d1d1",
          300: "#b0b0b0",
          400: "#888888",
          500: "#6d6d6d",
          600: "#5d5d5d",
          700: "#4f4f4f",
          800: "#454545",
          900: "#2E372F",
          950: "#1a1a1a",
        },
        success: {
          50:  "#f0fdf4",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
        },
        warning: {
          50:  "#fffbeb",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
        },
        danger: {
          50:  "#fef2f2",
          500: "#ef4444",
          600: "#dc2626",
          700: "#b91c1c",
        },
      },
      fontFamily: {
        sans: ["Manrope", "system-ui", "-apple-system", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      boxShadow: {
        "card":     "0 2px 8px rgba(46, 55, 47, 0.04)",
        "card-md":  "0 4px 16px rgba(46, 55, 47, 0.06)",
        "card-lg":  "0 8px 24px rgba(46, 55, 47, 0.08)",
        "premium-sm": "0 2px 12px rgba(46, 55, 47, 0.03)",
        "premium-md": "0 8px 24px rgba(46, 55, 47, 0.04)",
        "premium-lg": "0 16px 48px rgba(46, 55, 47, 0.05)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
    },
  },
  plugins: [],
};

export default config;
