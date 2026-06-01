import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/api.comments";
import { getCurrentUserId } from "~/lib/session";
import { parseFormData } from "~/lib/validation";
import { getUserById } from "~/services/userService";
import { getLessonById } from "~/services/lessonService";
import { getModuleById } from "~/services/moduleService";
import { getCourseById } from "~/services/courseService";
import { canViewLesson } from "~/lib/permissions";
import { createComment } from "~/services/commentService";
import {
  sanitizeCommentHtml,
  extractCommentText,
} from "~/lib/comment-sanitize.server";
import { MAX_COMMENT_CHARS } from "~/lib/comment-colors";

// ─── Comments resource route ───
// Handles all comment intents (create / reply / edit / delete) via useFetcher,
// keeping the already-large lesson route lean.

const createSchema = z.object({
  intent: z.literal("create"),
  lessonId: z.coerce.number().int().positive(),
  contentHtml: z.string(),
});

/** Resolve the course a lesson belongs to (for permission checks). */
export function resolveCourseForLesson(lessonId: number) {
  const lesson = getLessonById(lessonId);
  if (!lesson) return null;
  const mod = getModuleById(lesson.moduleId);
  if (!mod) return null;
  return getCourseById(mod.courseId) ?? null;
}

/**
 * Validate sanitized comment HTML: reject empty/whitespace-only content and
 * content over the visible-character cap. Returns an error string or null.
 */
export function validateCommentContent(sanitizedHtml: string): string | null {
  const text = extractCommentText(sanitizedHtml).trim();
  if (text.length === 0) return "Comment cannot be empty";
  if (text.length > MAX_COMMENT_CHARS) {
    return `Comment is too long (max ${MAX_COMMENT_CHARS} characters)`;
  }
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("You must be logged in", { status: 401 });
  }
  const user = getUserById(currentUserId);
  if (!user) {
    throw data("You must be logged in", { status: 401 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    const parsed = parseFormData(formData, createSchema);
    if (!parsed.success) {
      return data({ errors: parsed.errors }, { status: 400 });
    }
    const { lessonId, contentHtml } = parsed.data;

    const course = resolveCourseForLesson(lessonId);
    if (!course) {
      throw data("Lesson not found", { status: 404 });
    }
    if (!canViewLesson(user, course)) {
      throw data("You don't have access to this lesson", { status: 403 });
    }

    // Sanitize first (storage boundary), then validate the visible text.
    const sanitized = sanitizeCommentHtml(contentHtml);
    const error = validateCommentContent(sanitized);
    if (error) {
      return data({ errors: { contentHtml: error } }, { status: 400 });
    }

    const comment = createComment(lessonId, user.id, sanitized);
    return { success: true, commentId: comment.id };
  }

  throw data("Invalid action", { status: 400 });
}
