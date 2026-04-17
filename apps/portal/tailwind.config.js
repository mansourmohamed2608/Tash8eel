/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Brand palette — TASH8EEL_BRAND_IDENTITY_PACKAGE.md
        brand: {
          blue: "#2D6BE4",
          navy: "#1A2B4A",
          ai: "#1AAFA0",
          "ai-bg": "#E8F6F5",
        },
        // Semantic status palette
        status: {
          success: "#1A7A4A",
          "success-bg": "#EBF7F1",
          warning: "#B45309",
          "warning-bg": "#FFF7EB",
          danger: "#C0291D",
          "danger-bg": "#FEF0EE",
        },
        // Neutral scale
        neutral: {
          900: "#1C1E23",
          700: "#3D4250",
          500: "#6B7280",
          300: "#C4C7D0",
          150: "#E4E6EC",
          50: "#F3F4F7",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        // Arabic-first: IBM Plex Arabic covers all Arabic + Latin glyphs
        arabic: ["var(--font-ibm-plex-arabic)", "sans-serif"],
        sans: [
          "var(--font-ibm-plex-arabic)",
          "var(--font-ibm-plex-sans)",
          "sans-serif",
        ],
        // IBM Plex Sans as Latin companion — English-only contexts
        latin: ["var(--font-ibm-plex-sans)", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-slow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(-100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "slide-out-left": {
          "0%": { transform: "translateX(0)", opacity: "1" },
          "100%": { transform: "translateX(-100%)", opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-slow": "pulse-slow 2s ease-in-out infinite",
        shimmer: "shimmer 1.5s infinite",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "slide-out-left": "slide-out-left 0.3s ease-out",
      },
    },
  },
  plugins: [],
};
