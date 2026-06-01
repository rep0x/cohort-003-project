// Shared comment text-color palette.
// ~5 mid-tone hex values chosen to stay legible on BOTH light and dark themes.
// Imported by the client editor (to offer the swatches) and by the server-side
// sanitizer (to build the allow-list regex), so the two can never drift apart.

export const COMMENT_COLORS = [
  { name: "Red", value: "#dc2626" },
  { name: "Amber", value: "#d97706" },
  { name: "Green", value: "#16a34a" },
  { name: "Blue", value: "#2563eb" },
  { name: "Purple", value: "#9333ea" },
] as const;

export const COMMENT_COLOR_VALUES = COMMENT_COLORS.map((c) => c.value);

// Max visible (tags-stripped) characters allowed in a comment. Enforced
// server-side after sanitization; mirrored by the client-side counter.
export const MAX_COMMENT_CHARS = 5000;

