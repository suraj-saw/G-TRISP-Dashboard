// frontend/src/config/ircBlackspotConfig.ts
//
// Configuration-driven IRC blackspot priority palette.
//
// Risk tiers are driven by the Category calculated by the backend using IRC AATC method:
// Category 1 (Red): >= 15 * M
// Category 2 (Orange): >= 10 * M
// Category 3 (Yellow): >= 5 * M
// Category 4 (Green): >= 3 * M

export const IRC_CATEGORY_COLORS = {
  cat1: "#D73027", // red          — Category 1 (highest priority)
  cat2: "#FD8D3C", // orange       — Category 2
  cat3: "#FFEB64", // yellow       — Category 3
  cat4: "#91CF60", // light green  — Category 4 (lowest priority)
  default: "#94A3B8"
} as const;

export const IRC_CATEGORY_HALO_COLORS = {
  cat1: "rgba(215, 48, 39, 0.46)",
  cat2: "rgba(253, 141, 60, 0.34)",
  cat3: "rgba(255, 235, 100, 0.30)",
  cat4: "rgba(145, 207, 96, 0.26)",
  default: "rgba(148, 163, 184, 0.20)",
} as const;

// ── Priority-driven colour match expression (MapLibre GL) ──────────────────────
export const IRC_CATEGORY_COLOR_EXPR = [
  "match",
  ["get", "category"],
  1, IRC_CATEGORY_COLORS.cat1,
  2, IRC_CATEGORY_COLORS.cat2,
  3, IRC_CATEGORY_COLORS.cat3,
  4, IRC_CATEGORY_COLORS.cat4,
  IRC_CATEGORY_COLORS.default,
] as const;

export const IRC_CATEGORY_HALO_COLOR_EXPR = [
  "match",
  ["get", "category"],
  1, IRC_CATEGORY_HALO_COLORS.cat1,
  2, IRC_CATEGORY_HALO_COLORS.cat2,
  3, IRC_CATEGORY_HALO_COLORS.cat3,
  4, IRC_CATEGORY_HALO_COLORS.cat4,
  IRC_CATEGORY_HALO_COLORS.default,
] as const;

export function getIrcCategoryLabel(category: number): string {
  if (category === 1) return "Category 1 (Highest Priority)";
  if (category === 2) return "Category 2";
  if (category === 3) return "Category 3";
  if (category === 4) return "Category 4 (Lowest Priority)";
  return "Unknown Category";
}

export function getIrcCategoryColor(category: number): string {
  if (category === 1) return IRC_CATEGORY_COLORS.cat1;
  if (category === 2) return IRC_CATEGORY_COLORS.cat2;
  if (category === 3) return IRC_CATEGORY_COLORS.cat3;
  if (category === 4) return IRC_CATEGORY_COLORS.cat4;
  return IRC_CATEGORY_COLORS.default;
}
