// Centralized design tokens for the Swiss/Editorial Light Theme
export const theme = {
  colors: {
    pageGround: "#ffffff",
    surfaceSubtle: "#f7f6f6",
    surfaceWhite: "#ffffff",
    textPrimary: "#201f20",
    textSecondary: "#494949",
    textMuted: "#606060",
    inverseGround: "#141314",
    inverseText: "#fcfcfd",
    brandAccent: "#2e5bff",
    brandHover: "#1e46db",
    borderHairline: "#e0e0df",
    success: "#15966A",
    warning: "#C58A18",
    danger: "#d93838",
  },
  fonts: {
    sans: "Host Grotesk, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
    mono: "JetBrains Mono, monospace",
  },
};

export type Theme = typeof theme;
