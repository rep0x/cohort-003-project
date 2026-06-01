import { UserAvatar } from "~/components/user-avatar";
import { cn } from "~/lib/utils";

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
}: {
  comment: CommentView;
  isReply?: boolean;
}) {
  const edited = comment.updatedAt !== comment.createdAt;

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

        <div
          className="prose prose-sm prose-neutral dark:prose-invert mt-1 max-w-none break-words"
          dangerouslySetInnerHTML={{ __html: comment.contentHtml }}
        />

        {/* Action affordances (reply / edit / delete) are added by later slices. */}

        {/* Replies render oldest-first beneath their parent. */}
        {!isReply && comment.replies && comment.replies.length > 0 && (
          <div className="mt-3 space-y-3 border-l border-border pl-4">
            {comment.replies.map((reply) => (
              <CommentItem key={reply.id} comment={reply} isReply />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
