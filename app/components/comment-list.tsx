import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { MessageSquare } from "lucide-react";
import { Button } from "~/components/ui/button";
import { CommentEditor } from "~/components/comment-editor";
import {
  CommentItem,
  type CommentView,
  type CommentViewer,
} from "~/components/comment-item";
import { MAX_COMMENT_CHARS } from "~/lib/comment-colors";

// Lesson comments section: a composer (for anyone who can view the lesson)
// plus the rendered list of top-level comments and their replies.

export function CommentsSection({
  lessonId,
  comments,
  canComment,
  viewer,
  canReply = false,
  canModerate = false,
}: {
  lessonId: number;
  comments: CommentView[];
  canComment: boolean;
  viewer?: CommentViewer | null;
  canReply?: boolean;
  canModerate?: boolean;
}) {
  return (
    <section className="mb-8 border-t pt-8">
      <div className="mb-6 flex items-center gap-2">
        <MessageSquare className="size-5 text-muted-foreground" />
        <h2 className="text-xl font-semibold">
          Comments
          {comments.length > 0 && (
            <span className="ml-2 text-base font-normal text-muted-foreground">
              {comments.length}
            </span>
          )}
        </h2>
      </div>

      {canComment ? (
        <CommentComposer lessonId={lessonId} />
      ) : (
        <p className="mb-6 text-sm text-muted-foreground">
          Enroll in this course to join the discussion.
        </p>
      )}

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No comments yet. Be the first to start the discussion.
        </p>
      ) : (
        <div className="space-y-6">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              lessonId={lessonId}
              viewer={viewer}
              canReply={canReply}
              canModerate={canModerate}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CommentComposer({ lessonId }: { lessonId: number }) {
  const fetcher = useFetcher<{
    success?: boolean;
    errors?: Record<string, string>;
  }>();
  const [html, setHtml] = useState("");
  const [textLen, setTextLen] = useState(0);
  // Bumping the key remounts the editor to clear it after a successful post.
  const [editorKey, setEditorKey] = useState(0);

  const submitting = fetcher.state !== "idle";
  const serverError = fetcher.data?.errors?.contentHtml;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      setHtml("");
      setTextLen(0);
      setEditorKey((k) => k + 1);
    }
  }, [fetcher.state, fetcher.data]);

  const tooLong = textLen > MAX_COMMENT_CHARS;
  const canSubmit = textLen > 0 && !tooLong && !submitting;

  return (
    <fetcher.Form
      method="post"
      action="/api/comments"
      className="mb-8"
      onSubmit={(e) => {
        if (!canSubmit) e.preventDefault();
      }}
    >
      <input type="hidden" name="intent" value="create" />
      <input type="hidden" name="lessonId" value={lessonId} />
      <input type="hidden" name="contentHtml" value={html} />

      <CommentEditor
        key={editorKey}
        onChange={setHtml}
        onTextChange={(text) => setTextLen(text.trim().length)}
        placeholder="Add a comment…"
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
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {submitting ? "Posting…" : "Post comment"}
        </Button>
      </div>
    </fetcher.Form>
  );
}
