/** Shared Recharts palette for light minimal theme */
export const CHART_THEME = {
  grid: "#e5e5e5",
  axis: "#737373",
  primary: "#171717",
  secondary: "#525252",
  tertiary: "#a3a3a3",
  positive: "#16a34a",
  negative: "#dc2626",
  series: {
    blue: "#2563eb",
    violet: "#7c3aed",
    amber: "#d97706",
    cyan: "#0891b2",
    slate: "#525252",
  },
} as const;

export const chartTooltipStyle = {
  background: "#ffffff",
  border: "1px solid #e5e5e5",
  borderRadius: 8,
  fontSize: 12,
  color: "#171717",
} as const;
