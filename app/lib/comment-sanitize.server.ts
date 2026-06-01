import sanitizeHtml from "sanitize-html";
import { COMMENT_COLOR_VALUES } from "~/lib/comment-colors";

// ─── Comment HTML sanitization (server-side) ───
// Comments are stored as sanitized HTML and rendered back via
// dangerouslySetInnerHTML, so sanitization on write is the security boundary.
// We allow only the marks the TipTap editor can produce — bold, italic,
// strike, paragraphs/breaks, and palette-colored spans. Everything else is
// stripped.

// Build a regex that matches ONLY the exact palette hexes (case-insensitive).
// e.g. /^#(dc2626|d97706|16a34a|2563eb|9333ea)$/i
const paletteHexes = COMMENT_COLOR_VALUES.map((hex) =>
  hex.replace(/^#/, "").toLowerCase()
).join("|");
export const COLOR_STYLE_REGEX = new RegExp(`^#(?:${paletteHexes})$`, "i");

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["strong", "b", "em", "i", "s", "del", "p", "br", "span"],
  allowedAttributes: {
    span: ["style"],
  },
  allowedStyles: {
    span: {
      // Only a `color` of an exact palette hex survives.
      color: [COLOR_STYLE_REGEX],
    },
  },
  // Drop the contents of any disallowed tag we don't explicitly want to keep
  // text from (e.g. <script>), rather than surfacing their text.
  disallowedTagsMode: "discard",
};

/**
 * Sanitize comment HTML to the allow-list above. Always run before insert.
 */
export function sanitizeCommentHtml(dirtyHtml: string): string {
  return sanitizeHtml(dirtyHtml, SANITIZE_OPTIONS);
}

/**
 * Extract the visible text from comment HTML (all tags stripped) for
 * emptiness and length validation. Run AFTER sanitization.
 */
export function extractCommentText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
}
