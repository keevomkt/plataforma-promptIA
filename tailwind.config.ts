import type { Config } from "tailwindcss";

// Sistema de tokens do Keevo Prompt IA (roxo Keevo como acento).
// Cada cor é uma variável CSS (globals.css) com valor para o tema claro e
// para o escuro (classe `dark` no <html>); o `<alpha-value>` mantém os
// modificadores de opacidade (ex.: bg-accent/10) funcionando nos dois.
// Verde/vermelho ficam reservados para diffs e status de teste.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: token("paper"),
        surface: token("surface"),
        sunken: token("sunken"),
        ink: {
          DEFAULT: token("ink"),
          soft: token("ink-soft"),
          faint: token("ink-faint"),
        },
        line: {
          DEFAULT: token("line"),
          strong: token("line-strong"),
        },
        accent: {
          DEFAULT: token("accent"),
          soft: token("accent-soft"),
          strong: token("accent-strong"),
        },
        // Cores da marca Keevo (logo): usadas só em detalhes, como a faixa em degradê
        brand: {
          orange: "#FF9A1F",
          pink: "#EE2A8B",
          purple: "#8A12D6",
          cyan: "#16D2F5",
        },
        added: {
          DEFAULT: token("added"),
          bg: token("added-bg"),
          border: token("added-border"),
        },
        removed: {
          DEFAULT: token("removed"),
          bg: token("removed-bg"),
          border: token("removed-border"),
        },
        warn: {
          DEFAULT: token("warn"),
          bg: token("warn-bg"),
          border: token("warn-border"),
        },
      },
      fontFamily: {
        sans: ["var(--font-plex-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
      },
      boxShadow: {
        panel: "0 1px 2px rgba(24, 27, 32, 0.04)",
        pop: "0 8px 24px rgba(24, 27, 32, 0.12)",
      },
      maxWidth: {
        prose: "72ch",
      },
    },
  },
  plugins: [],
};

export default config;
