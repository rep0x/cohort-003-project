import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/components/ui/button";
import { CommentEditor } from "~/components/comment-editor";
import { MAX_COMMENT_CHARS } from "~/lib/comment-colors";

// Staff-only composer for replying to a top-level comment (one level deep).
// Posts to the comments resource route with intent=reply via useFetcher.

export function ReplyComposer({
  parentId,
  lessonId,
  onPosted,
}: {
  parentId: number;
  lessonId: number;
  onPosted?: () => void;
}) {
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
      onPosted?.();
    }
  }, [fetcher.state, fetcher.data, onPosted]);

  const tooLong = textLen > MAX_COMMENT_CHARS;
  const canSubmit = textLen > 0 && !tooLong && !submitting;

  return (
    <fetcher.Form
      method="post"
      action="/api/comments"
      className="mt-3"
      onSubmit={(e) => {
        if (!canSubmit) e.preventDefault();
      }}
    >
      <input type="hidden" name="intent" value="reply" />
      <input type="hidden" name="parentId" value={parentId} />
      <input type="hidden" name="lessonId" value={lessonId} />
      <input type="hidden" name="contentHtml" value={html} />

      <CommentEditor
        key={editorKey}
        onChange={setHtml}
        onTextChange={(text) => setTextLen(text.trim().length)}
        placeholder="Write a reply…"
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
          {onPosted && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onPosted}
              disabled={submitting}
            >
              Cancel
            </Button>
          )}
          <Button type="submit" size="sm" disabled={!canSubmit}>
            {submitting ? "Posting…" : "Post reply"}
          </Button>
        </div>
      </div>
    </fetcher.Form>
  );
}
