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
  createReply,
  listReplies,
  listTopLevelComments,
  countTopLevelComments,
  getCommentById,
  updateComment,
  deleteComment,
} from "./commentService";
import { isStaff } from "~/lib/permissions";
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

describe("createReply / listReplies", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
    lesson = makeLesson();
  });

  it("creates a reply with parentId set and lessonId inherited from parent", () => {
    const parent = createComment(lesson.id, base.user.id, "<p>parent</p>");
    const reply = createReply(parent.id, base.instructor.id, "<p>reply</p>");

    expect(reply.parentId).toBe(parent.id);
    expect(reply.lessonId).toBe(lesson.id);
    expect(reply.userId).toBe(base.instructor.id);
    expect(reply.contentHtml).toContain("reply");
  });

  it("sanitizes reply HTML before insert", () => {
    const parent = createComment(lesson.id, base.user.id, "<p>parent</p>");
    const reply = createReply(
      parent.id,
      base.instructor.id,
      "<p>hi</p><script>alert(1)</script>"
    );

    expect(reply.contentHtml).not.toContain("<script>");
    expect(reply.contentHtml).toContain("hi");
  });

  it("throws when the parent comment does not exist", () => {
    expect(() => createReply(9999, base.instructor.id, "<p>x</p>")).toThrow(
      "Parent comment not found"
    );
  });

  it("depth guard: rejects replying to a reply", () => {
    const parent = createComment(lesson.id, base.user.id, "<p>parent</p>");
    const reply = createReply(parent.id, base.instructor.id, "<p>reply</p>");

    expect(() =>
      createReply(reply.id, base.instructor.id, "<p>nope</p>")
    ).toThrow("Cannot reply to a reply");
  });

  it("supports multiple replies under one comment, listed oldest-first", () => {
    const parent = createComment(lesson.id, base.user.id, "<p>parent</p>");
    const first = createReply(parent.id, base.instructor.id, "<p>first</p>");
    const second = createReply(parent.id, base.instructor.id, "<p>second</p>");
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

    const replies = listReplies(parent.id);
    expect(replies).toHaveLength(2);
    expect(replies[0].id).toBe(first.id);
    expect(replies[1].id).toBe(second.id);
    expect(replies[0].author.name).toBe(base.instructor.name);
    expect(replies[0].author.role).toBe(schema.UserRole.Instructor);
  });

  it("listReplies returns an empty array for a comment with no replies", () => {
    const parent = createComment(lesson.id, base.user.id, "<p>parent</p>");
    expect(listReplies(parent.id)).toEqual([]);
  });

  it("staff-only permission: only admins/instructors are staff", () => {
    expect(isStaff({ id: base.user.id, role: schema.UserRole.Student })).toBe(
      false
    );
    expect(
      isStaff({ id: base.instructor.id, role: schema.UserRole.Instructor })
    ).toBe(true);
    expect(isStaff({ id: 0, role: schema.UserRole.Admin })).toBe(true);
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

describe("updateComment", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
    lesson = makeLesson();
  });

  it("lets the author edit their own comment and re-sanitizes the content", () => {
    const comment = createComment(lesson.id, base.user.id, "<p>original</p>");
    // Force a distinct createdAt so updatedAt is guaranteed to differ.
    testDb
      .update(schema.comments)
      .set({
        createdAt: "2020-01-01T00:00:00.000Z",
        updatedAt: "2020-01-01T00:00:00.000Z",
      })
      .where(eq(schema.comments.id, comment.id))
      .run();

    const updated = updateComment(
      comment.id,
      base.user.id,
      '<p>edited <strong>bold</strong></p><script>alert(1)</script>'
    );

    expect(updated.id).toBe(comment.id);
    expect(updated.contentHtml).toContain("edited");
    expect(updated.contentHtml).toContain("<strong>");
    // Re-sanitized on write: disallowed tags/contents are stripped.
    expect(updated.contentHtml).not.toContain("<script>");
    expect(updated.contentHtml).not.toContain("alert");
    // updatedAt advances past createdAt.
    expect(updated.updatedAt).not.toBe(updated.createdAt);
    expect(updated.createdAt).toBe("2020-01-01T00:00:00.000Z");
  });

  it("rejects edits from anyone who is not the author", () => {
    const comment = createComment(lesson.id, base.user.id, "<p>original</p>");

    expect(() =>
      updateComment(comment.id, base.instructor.id, "<p>hijack</p>")
    ).toThrow("Only the author can edit this comment");

    // Content is unchanged.
    expect(getCommentById(comment.id)?.contentHtml).toContain("original");
  });
});

describe("deleteComment", () => {
  let lesson: typeof schema.lessons.$inferSelect;

  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
    lesson = testDb
      .insert(schema.lessons)
      .values({
        moduleId: testDb
          .insert(schema.modules)
          .values({ courseId: base.course.id, title: "Module 1", position: 0 })
          .returning()
          .get().id,
        title: "Lesson 1",
        position: 0,
      })
      .returning()
      .get();
  });

  // The course in seedBaseData has instructorId = base.instructor.id.
  const courseCtx = () => ({
    id: base.course.id,
    instructorId: base.course.instructorId,
  });

  function makeReply(parentId: number, userId: number) {
    return testDb
      .insert(schema.comments)
      .values({
        lessonId: lesson.id,
        userId,
        parentId,
        contentHtml: "<p>reply</p>",
      })
      .returning()
      .get();
  }

  function makeAdmin() {
    return testDb
      .insert(schema.users)
      .values({
        name: "Admin User",
        email: "admin@example.com",
        role: schema.UserRole.Admin,
      })
      .returning()
      .get();
  }

  it("lets the author delete their own comment", () => {
    const comment = createComment(lesson.id, base.user.id, "<p>mine</p>");

    deleteComment(
      comment.id,
      { id: base.user.id, role: schema.UserRole.Student },
      courseCtx()
    );

    expect(getCommentById(comment.id)).toBeUndefined();
  });

  it("lets an admin delete any comment", () => {
    const comment = createComment(lesson.id, base.user.id, "<p>mine</p>");
    const admin = makeAdmin();

    deleteComment(
      comment.id,
      { id: admin.id, role: schema.UserRole.Admin },
      courseCtx()
    );

    expect(getCommentById(comment.id)).toBeUndefined();
  });

  it("lets the course's instructor delete any comment", () => {
    const comment = createComment(lesson.id, base.user.id, "<p>mine</p>");

    deleteComment(
      comment.id,
      { id: base.instructor.id, role: schema.UserRole.Instructor },
      courseCtx()
    );

    expect(getCommentById(comment.id)).toBeUndefined();
  });

  it("rejects a different student who is not the author", () => {
    const comment = createComment(lesson.id, base.user.id, "<p>mine</p>");
    const other = testDb
      .insert(schema.users)
      .values({
        name: "Other Student",
        email: "other@example.com",
        role: schema.UserRole.Student,
      })
      .returning()
      .get();

    expect(() =>
      deleteComment(
        comment.id,
        { id: other.id, role: schema.UserRole.Student },
        courseCtx()
      )
    ).toThrow("Not allowed to delete this comment");
    expect(getCommentById(comment.id)).toBeDefined();
  });

  it("rejects an instructor who is not the course's instructor or author", () => {
    const comment = createComment(lesson.id, base.user.id, "<p>mine</p>");
    const otherInstructor = testDb
      .insert(schema.users)
      .values({
        name: "Other Instructor",
        email: "other-instructor@example.com",
        role: schema.UserRole.Instructor,
      })
      .returning()
      .get();

    expect(() =>
      deleteComment(
        comment.id,
        { id: otherInstructor.id, role: schema.UserRole.Instructor },
        courseCtx()
      )
    ).toThrow("Not allowed to delete this comment");
    expect(getCommentById(comment.id)).toBeDefined();
  });

  it("throws when the comment does not exist", () => {
    expect(() =>
      deleteComment(
        99999,
        { id: base.user.id, role: schema.UserRole.Student },
        courseCtx()
      )
    ).toThrow("Comment not found");
  });

  it("cascades: deleting a top-level comment removes its replies", () => {
    const parent = createComment(lesson.id, base.user.id, "<p>parent</p>");
    const reply1 = makeReply(parent.id, base.instructor.id);
    const reply2 = makeReply(parent.id, base.user.id);

    deleteComment(
      parent.id,
      { id: base.instructor.id, role: schema.UserRole.Instructor },
      courseCtx()
    );

    expect(getCommentById(parent.id)).toBeUndefined();
    expect(getCommentById(reply1.id)).toBeUndefined();
    expect(getCommentById(reply2.id)).toBeUndefined();
  });

  it("deleting a single reply removes only that reply", () => {
    const parent = createComment(lesson.id, base.user.id, "<p>parent</p>");
    const reply1 = makeReply(parent.id, base.instructor.id);
    const reply2 = makeReply(parent.id, base.user.id);

    // The reply's author deletes only their reply.
    deleteComment(
      reply2.id,
      { id: base.user.id, role: schema.UserRole.Student },
      courseCtx()
    );

    expect(getCommentById(reply2.id)).toBeUndefined();
    expect(getCommentById(parent.id)).toBeDefined();
    expect(getCommentById(reply1.id)).toBeDefined();
  });
});
