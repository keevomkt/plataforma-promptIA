import type { Config } from "tailwindcss";

// Sistema de tokens do Keevo Prompt Studio (roxo Keevo como acento).
// Paleta pensada para uma ferramenta interna de governança de IA:
// grafite/tinta para leitura longa, papel neutro (não creme) de fundo,
// índigo como único acento de ação, e a dupla verde/vermelho reservada
// exclusivamente para diffs e status de teste (não usada como decoração).
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F7F6FA",
        surface: "#FFFFFF",
        sunken: "#F1EFF5",
        ink: {
          DEFAULT: "#181B20",
          soft: "#3C4148",
          faint: "#6B7178",
        },
        line: {
          DEFAULT: "#E4E1EA",
          strong: "#CBC6D6",
        },
        accent: {
          DEFAULT: "#7A1FC9",
          soft: "#F4EAFD",
          strong: "#5A1296",
        },
        // Cores da marca Keevo (logo): usadas só em detalhes, como a faixa em degradê
        brand: {
          orange: "#FF9A1F",
          pink: "#EE2A8B",
          purple: "#8A12D6",
          cyan: "#16D2F5",
        },
        added: {
          DEFAULT: "#1E7B4D",
          bg: "#E9F6EE",
          border: "#BFE3CC",
        },
        removed: {
          DEFAULT: "#B3261E",
          bg: "#FBEAEA",
          border: "#F0C4C1",
        },
        warn: {
          DEFAULT: "#966018",
          bg: "#FBF1DF",
          border: "#ECD6A6",
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
