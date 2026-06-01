import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "~/db";
import { comments, users, UserRole } from "~/db/schema";
import { sanitizeCommentHtml } from "~/lib/comment-sanitize.server";

// ─── Comment Service ───
// Lesson comments: top-level comments and (one level deep) staff replies.
// HTML is sanitized HERE before insert/update — this is the storage boundary.
// Uses positional parameters (project convention).

export type CommentAuthor = {
  id: number;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
};

export type CommentWithAuthor = {
  id: number;
  lessonId: number;
  userId: number;
  parentId: number | null;
  contentHtml: string;
  createdAt: string;
  updatedAt: string;
  author: CommentAuthor;
};

const authorSelection = {
  id: comments.id,
  lessonId: comments.lessonId,
  userId: comments.userId,
  parentId: comments.parentId,
  contentHtml: comments.contentHtml,
  createdAt: comments.createdAt,
  updatedAt: comments.updatedAt,
  authorName: users.name,
  authorAvatarUrl: users.avatarUrl,
  authorRole: users.role,
};

type AuthorRow = {
  id: number;
  lessonId: number;
  userId: number;
  parentId: number | null;
  contentHtml: string;
  createdAt: string;
  updatedAt: string;
  authorName: string;
  authorAvatarUrl: string | null;
  authorRole: UserRole;
};

function toCommentWithAuthor(row: AuthorRow): CommentWithAuthor {
  return {
    id: row.id,
    lessonId: row.lessonId,
    userId: row.userId,
    parentId: row.parentId,
    contentHtml: row.contentHtml,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: {
      id: row.userId,
      name: row.authorName,
      avatarUrl: row.authorAvatarUrl,
      role: row.authorRole,
    },
  };
}

export function getCommentById(id: number) {
  return db.select().from(comments).where(eq(comments.id, id)).get();
}

/**
 * Create a top-level comment on a lesson. HTML is sanitized before insert.
 */
export function createComment(
  lessonId: number,
  userId: number,
  dirtyHtml: string
) {
  const contentHtml = sanitizeCommentHtml(dirtyHtml);

  return db
    .insert(comments)
    .values({ lessonId, userId, parentId: null, contentHtml })
    .returning()
    .get();
}

/**
 * List a lesson's top-level comments (newest-first), with author info.
 * Optional limit/offset support paginated loading.
 */
export function listTopLevelComments(
  lessonId: number,
  limit?: number,
  offset?: number
): CommentWithAuthor[] {
  let query = db
    .select(authorSelection)
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(and(eq(comments.lessonId, lessonId), isNull(comments.parentId)))
    .orderBy(sql`${comments.createdAt} DESC`, sql`${comments.id} DESC`)
    .$dynamic();

  if (limit !== undefined) query = query.limit(limit);
  if (offset !== undefined) query = query.offset(offset);

  return query.all().map(toCommentWithAuthor);
}

/**
 * Create a staff reply to a top-level comment. Replies are one level deep:
 * the depth guard rejects replying to something that is itself a reply.
 * HTML is sanitized before insert. Permission (staff-only) is enforced at the
 * route boundary, not here.
 */
export function createReply(
  parentId: number,
  userId: number,
  dirtyHtml: string
) {
  const parent = getCommentById(parentId);
  if (!parent) throw new Error("Parent comment not found");
  // Depth guard: only top-level comments (parentId === null) can be replied to.
  if (parent.parentId !== null) throw new Error("Cannot reply to a reply");

  const contentHtml = sanitizeCommentHtml(dirtyHtml);

  return db
    .insert(comments)
    .values({ lessonId: parent.lessonId, userId, parentId: parent.id, contentHtml })
    .returning()
    .get();
}

/**
 * List a comment's replies (oldest-first), with author info.
 */
export function listReplies(parentId: number): CommentWithAuthor[] {
  return db
    .select(authorSelection)
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.parentId, parentId))
    .orderBy(sql`${comments.createdAt} ASC`, sql`${comments.id} ASC`)
    .all()
    .map(toCommentWithAuthor);
}

/** Count a lesson's top-level comments (for pagination). */
export function countTopLevelComments(lessonId: number): number {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(comments)
    .where(and(eq(comments.lessonId, lessonId), isNull(comments.parentId)))
    .get();

  return result?.count ?? 0;
}
