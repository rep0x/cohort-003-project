import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { Reply, Pencil, Trash2 } from "lucide-react";
import { UserAvatar } from "~/components/user-avatar";
import { Button } from "~/components/ui/button";
import { ReplyComposer } from "~/components/comment-reply";
import { CommentEditor } from "~/components/comment-editor";
import { MAX_COMMENT_CHARS } from "~/lib/comment-colors";
import { cn } from "~/lib/utils";

// Viewer identity passed down for action affordances (who may reply / edit).
export type CommentViewer = { id: number; role: string };

// Serializable shape of a comment as it crosses the loader boundary.
export type CommentView = {
  id: number;
  userId: number;
  parentId: number | null;
  contentHtml: string;
  createdAt: string;
  updatedAt: string;
  author: {
    id: number;
    name: string;
    avatarUrl: string | null;
    role: string;
  };
  replies?: CommentView[];
};

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.max(0, Math.round((now - then) / 1000));
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(day / 365)}y ago`;
}

function StaffBadge({ role }: { role: string }) {
  if (role !== "instructor" && role !== "admin") return null;
  const label = role === "admin" ? "Admin" : "Instructor";
  return (
    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      {label}
    </span>
  );
}

export function CommentItem({
  comment,
  isReply = false,
  viewer,
  canReply = false,
  canModerate,
  lessonId,
}: {
  comment: CommentView;
  isReply?: boolean;
  viewer?: CommentViewer | null;
  canReply?: boolean;
  canModerate?: boolean;
  lessonId?: number;
}) {
  const edited = comment.updatedAt !== comment.createdAt;
  const canEdit = viewer?.id === comment.userId;
  const canDelete = !!(canModerate || viewer?.id === comment.userId);
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  // Reply is a top-level-only, staff-only affordance.
  const showReply = !isReply && canReply && lessonId !== undefined;

  return (
    <div className={cn("flex gap-3", isReply && "mt-3")}>
      <UserAvatar
        name={comment.author.name}
        avatarUrl={comment.author.avatarUrl}
        className="size-8 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-foreground">
            {comment.author.name}
          </span>
          <StaffBadge role={comment.author.role} />
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(comment.createdAt)}
          </span>
          {edited && (
            <span className="text-xs text-muted-foreground">(edited)</span>
          )}
        </div>

        {editing ? (
          <CommentEditForm
            commentId={comment.id}
            initialContent={comment.contentHtml}
            onDone={() => setEditing(false)}
          />
        ) : (
          <div
            className="prose prose-sm prose-neutral dark:prose-invert mt-1 max-w-none break-words"
            dangerouslySetInnerHTML={{ __html: comment.contentHtml }}
          />
        )}

        {/* Action affordances (reply / edit / delete). */}
        {!editing && (showReply || canEdit || canDelete) && (
          <div className="mt-1 flex items-center gap-1">
            {showReply && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={() => setReplying((r) => !r)}
              >
                <Reply className="mr-1 size-3.5" />
                Reply
              </Button>
            )}
            {canEdit && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={() => setEditing(true)}
              >
                <Pencil className="mr-1 size-3.5" />
                Edit
              </Button>
            )}
            {canDelete && (
              <DeleteCommentButton commentId={comment.id} lessonId={lessonId} />
            )}
          </div>
        )}

        {showReply && replying && (
          <ReplyComposer
            parentId={comment.id}
            lessonId={lessonId!}
            onPosted={() => setReplying(false)}
          />
        )}

        {/* Replies render oldest-first beneath their parent. */}
        {!isReply && comment.replies && comment.replies.length > 0 && (
          <div className="mt-3 space-y-3 border-l border-border pl-4">
            {comment.replies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                isReply
                viewer={viewer}
                canModerate={canModerate}
                lessonId={lessonId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Inline editor for an existing comment. Posts the "edit" intent to the
// comments resource route; on success the loader revalidates and the parent
// closes the editor (showing the updated body + "(edited)").
function CommentEditForm({
  commentId,
  initialContent,
  onDone,
}: {
  commentId: number;
  initialContent: string;
  onDone: () => void;
}) {
  const fetcher = useFetcher<{
    success?: boolean;
    errors?: Record<string, string>;
  }>();
  const [html, setHtml] = useState(initialContent);
  // Seed the counter from the existing content so an unchanged comment (TipTap
  // only fires onUpdate on edits, not on mount) can still be saved.
  const [textLen, setTextLen] = useState(() =>
    initialContent.replace(/<[^>]*>/g, "").trim().length
  );

  const submitting = fetcher.state !== "idle";
  const serverError = fetcher.data?.errors?.contentHtml;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      onDone();
    }
  }, [fetcher.state, fetcher.data, onDone]);

  const tooLong = textLen > MAX_COMMENT_CHARS;
  const canSubmit = textLen > 0 && !tooLong && !submitting;

  return (
    <fetcher.Form
      method="post"
      action="/api/comments"
      className="mt-1"
      onSubmit={(e) => {
        if (!canSubmit) e.preventDefault();
      }}
    >
      <input type="hidden" name="intent" value="edit" />
      <input type="hidden" name="commentId" value={commentId} />
      <input type="hidden" name="contentHtml" value={html} />

      <CommentEditor
        initialContent={initialContent}
        onChange={setHtml}
        onTextChange={(text) => setTextLen(text.trim().length)}
      />

      <div className="mt-2 flex items-center justify-between">
        <div className="text-xs">
          {serverError ? (
            <span className="text-destructive">{serverError}</span>
          ) : (
            <span
              className={tooLong ? "text-destructive" : "text-muted-foreground"}
            >
              {textLen}/{MAX_COMMENT_CHARS}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDone}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!canSubmit}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </fetcher.Form>
  );
}

// Hard-deletes a comment (cascading to replies if it's top-level). Permission
// is enforced server-side; the button only renders when the viewer may delete.
function DeleteCommentButton({
  commentId,
  lessonId,
}: {
  commentId: number;
  lessonId?: number;
}) {
  const fetcher = useFetcher<{ success?: boolean }>();
  const deleting = fetcher.state !== "idle";

  return (
    <fetcher.Form
      method="post"
      action="/api/comments"
      onSubmit={(e) => {
        if (!window.confirm("Delete this comment?")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="intent" value="delete" />
      <input type="hidden" name="commentId" value={commentId} />
      {lessonId !== undefined && (
        <input type="hidden" name="lessonId" value={lessonId} />
      )}
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        disabled={deleting}
        className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="mr-1 size-3.5" />
        {deleting ? "Deleting…" : "Delete"}
      </Button>
    </fetcher.Form>
  );
}
