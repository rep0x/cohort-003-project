import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;
let lesson: typeof schema.lessons.$inferSelect;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

// Import after mock so the module picks up our test db
import {
  createComment,
  listTopLevelComments,
  countTopLevelComments,
  getCommentById,
} from "./commentService";
import {
  sanitizeCommentHtml,
  extractCommentText,
  COLOR_STYLE_REGEX,
} from "~/lib/comment-sanitize.server";
import { COMMENT_COLOR_VALUES } from "~/lib/comment-colors";

function makeLesson() {
  const mod = testDb
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Module 1", position: 0 })
    .returning()
    .get();
  return testDb
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: "Lesson 1", position: 0 })
    .returning()
    .get();
}

describe("commentService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
    lesson = makeLesson();
  });

  describe("createComment", () => {
    it("creates a top-level comment", () => {
      const comment = createComment(
        lesson.id,
        base.user.id,
        "<p>Hello world</p>"
      );

      expect(comment).toBeDefined();
      expect(comment.lessonId).toBe(lesson.id);
      expect(comment.userId).toBe(base.user.id);
      expect(comment.parentId).toBeNull();
      expect(comment.contentHtml).toContain("Hello world");
      expect(comment.createdAt).toBeDefined();
      expect(comment.updatedAt).toBeDefined();
    });

    it("sanitizes HTML before insert (strips disallowed tags/attrs)", () => {
      const comment = createComment(
        lesson.id,
        base.user.id,
        '<p>hi</p><script>alert(1)</script><a href="http://evil">x</a>'
      );

      expect(comment.contentHtml).not.toContain("<script>");
      expect(comment.contentHtml).not.toContain("alert");
      expect(comment.contentHtml).not.toContain("<a");
      expect(comment.contentHtml).toContain("hi");
    });

    it("keeps allowed marks and palette-colored spans", () => {
      const html = `<p><strong>b</strong><em>i</em><s>strike</s><span style="color:${COMMENT_COLOR_VALUES[0]}">red</span></p>`;
      const comment = createComment(lesson.id, base.user.id, html);

      expect(comment.contentHtml).toContain("<strong>");
      expect(comment.contentHtml).toContain("<em>");
      expect(comment.contentHtml).toContain("<s>");
      expect(comment.contentHtml.toLowerCase()).toContain(
        COMMENT_COLOR_VALUES[0]
      );
    });
  });

  describe("listTopLevelComments", () => {
    it("returns top-level comments newest-first with author info", () => {
      const first = createComment(lesson.id, base.user.id, "<p>first</p>");
      const second = createComment(
        lesson.id,
        base.instructor.id,
        "<p>second</p>"
      );
      // Make ordering deterministic regardless of timestamp resolution.
      testDb
        .update(schema.comments)
        .set({ createdAt: "2020-01-01T00:00:00.000Z" })
        .where(eq(schema.comments.id, first.id))
        .run();
      testDb
        .update(schema.comments)
        .set({ createdAt: "2020-02-01T00:00:00.000Z" })
        .where(eq(schema.comments.id, second.id))
        .run();

      const list = listTopLevelComments(lesson.id);
      expect(list).toHaveLength(2);
      expect(list[0].id).toBe(second.id);
      expect(list[1].id).toBe(first.id);
      expect(list[0].author.name).toBe(base.instructor.name);
      expect(list[0].author.role).toBe(schema.UserRole.Instructor);
    });

    it("supports limit/offset for pagination", () => {
      for (let i = 0; i < 5; i++) {
        createComment(lesson.id, base.user.id, `<p>c${i}</p>`);
      }
      expect(listTopLevelComments(lesson.id, 2)).toHaveLength(2);
      expect(listTopLevelComments(lesson.id, 2, 4)).toHaveLength(1);
      expect(countTopLevelComments(lesson.id)).toBe(5);
    });

    it("getCommentById returns the stored row", () => {
      const c = createComment(lesson.id, base.user.id, "<p>x</p>");
      expect(getCommentById(c.id)?.id).toBe(c.id);
    });
  });
});

describe("comment sanitization", () => {
  it("strips non-palette colors but keeps palette colors", () => {
    const dirty = `<span style="color:#123456">no</span><span style="color:${COMMENT_COLOR_VALUES[1]}">yes</span>`;
    const clean = sanitizeCommentHtml(dirty);
    expect(clean).not.toContain("#123456");
    expect(clean.toLowerCase()).toContain(COMMENT_COLOR_VALUES[1]);
  });

  it("removes whitespace-only text to nothing meaningful", () => {
    expect(extractCommentText("<p>   </p>").trim()).toBe("");
    expect(extractCommentText("<p>real text</p>").trim()).toBe("real text");
  });

  it("COLOR_STYLE_REGEX matches exactly the palette hexes", () => {
    for (const hex of COMMENT_COLOR_VALUES) {
      expect(COLOR_STYLE_REGEX.test(hex)).toBe(true);
      expect(COLOR_STYLE_REGEX.test(hex.toUpperCase())).toBe(true);
    }
    expect(COLOR_STYLE_REGEX.test("#000000")).toBe(false);
    expect(COLOR_STYLE_REGEX.test("#ffffff")).toBe(false);
    expect(COLOR_STYLE_REGEX.test("red")).toBe(false);
  });
});
