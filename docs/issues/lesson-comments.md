# PRD — Lesson Comments

## Summary

Add a comments feature to lessons. Any user who can view a lesson can post a
top-level comment using a small rich-text editor (bold, italic, strikethrough,
and a few text colors — nothing else). Only admins and instructors may reply,
and only one level deep (Comment → Reply, no reply-to-reply). A comment may have
many staff replies.

## Goals

- Let learners ask questions / discuss directly on the lesson they're viewing.
- Let staff (admins + instructors) answer visibly, with their role surfaced.
- Keep formatting deliberately minimal and safe (sanitized HTML).

## Non-goals

- Notifications of any kind (no infra exists; out of scope).
- Lists, alignment, headings, media/embeds, tables, links.
- Replies to replies, or nesting beyond one level.
- Reactions, upvotes, mentions, search.

---

## Scope & data model

- Comments are **attached to a lesson** (`lesson_id` FK). UI lives on the
  learner-facing lesson page (`app/routes/courses.$slug.lessons.$lessonId.tsx`).
- **Single `comments` table** with a self-referencing nullable `parent_id`.
  - `parent_id IS NULL` → top-level comment.
  - `parent_id` set → reply.
  - **Depth guard (service-enforced):** a reply's parent must itself be
    top-level (`parent_id IS NULL`). This guarantees exactly one level.

### Schema — `comments`

| column        | type / notes                                          |
| ------------- | ----------------------------------------------------- |
| `id`          | integer PK, autoincrement                             |
| `lessonId`    | integer → `lessons.id`                                |
| `userId`      | integer → `users.id` (author)                         |
| `parentId`    | integer → `comments.id`, **nullable** (null = top)    |
| `contentHtml` | text — **sanitized** HTML                             |
| `createdAt`   | text ISO string, `$defaultFn(() => new Date()...)`    |
| `updatedAt`   | text ISO string — drives "(edited)" when ≠ createdAt  |

Plus a Drizzle migration (`drizzle-kit generate`).

---

## Permissions

| Action               | Who                                                                 |
| -------------------- | ------------------------------------------------------------------- |
| Post top-level       | Anyone who can **view** the lesson: enrolled student **OR** course instructor **OR** admin |
| Reply                | **Admins and instructors only** (tutor = `instructor` role)         |
| Edit                 | The **author** of the comment/reply (any type)                      |
| Delete               | The **author**; **any admin**; **the course's instructor** (own course) |

- "Tutor" maps to the existing `UserRole.Instructor`. There is no separate tutor role.
- View predicate is shared via a new helper `canViewLesson(user, course)`:
  `admin OR course.instructorId === user.id OR isUserEnrolled(user.id, course.id)`.
  Used by both the lesson view-gate and the comment action.
- **Delete is hard delete.** Deleting a top-level comment **cascades** to its
  replies.

---

## Editor & rendering

- **TipTap** (`@tiptap/react`) with a minimal extension set:
  **Bold, Italic, Strike, TextStyle + Color**. No lists, alignment, headings,
  media, tables, or links.
- **Color palette:** ~5 fixed mid-tone hex values (e.g. red / amber / green /
  blue / purple) chosen to remain legible on **both light and dark** themes.
  Written as inline `style="color:#..."` via the stock Color extension.
- **Storage = sanitized HTML.** Sanitize **server-side** with `sanitize-html`
  (pure JS, no DOM polyfill needed) **in the service before insert**:
  - Allowed tags: `strong`, `b`, `em`, `i`, `s`, `del`, `p`, `br`, `span`.
  - `span` may carry only `style="color:#..."`, restricted to the exact palette
    hexes (`allowedStyles` color regex matching just those values).
  - Everything else stripped.
- **Render** stored HTML with `dangerouslySetInnerHTML` — safe because it was
  sanitized on write.

### Implementation notes / risks

- **TipTap + SSR:** must render client-only under React Router framework mode
  (`immediatelyRender: false`).
- **`sanitize-html` `allowedStyles`:** the color regex must match exactly the
  palette hexes; verify with a test.

---

## Validation

- Reject **empty / whitespace-only** content (strip tags, check for non-whitespace text).
- Cap **~5000 chars of visible text**, checked **server-side after sanitization**.
- Client-side character counter for feedback.
- Zod-validated in the resource route (follows existing `parseFormData` pattern).

---

## Wiring & display

- **Dedicated resource route `app/routes/api.comments.ts`** handles all comment
  intents (`create`, `reply`, `edit`, `delete`) via `useFetcher`. Keeps the
  already-large lesson route lean.
- Comments are **loaded through the lesson route loader** (SSR).
- **Ordering:** top-level **newest-first**; replies **oldest-first**
  (conversation reads top-to-bottom).
- **Pagination:** load **20 top-level** initially + a **"Show more"** button.
- **Author display:** `UserAvatar` + name + relative timestamp ("2h ago"),
  with an **Instructor / Admin badge** on staff posts so official answers stand
  out. Show **"(edited)"** when `updatedAt ≠ createdAt`.
- The **Reply** affordance is shown only to admins/instructors.

---

## Testing & seed

- `app/services/commentService.test.ts` (Vitest, matching existing service
  tests): create, reply, **depth guard**, permission checks, **cascade delete**,
  and sanitization behavior.
- Add a few sample comments + staff replies to `scripts/seed.ts` so the UI has
  content on first run.

---

## File plan (new / changed)

- `app/db/schema.ts` — add `comments` table (+ Drizzle migration)
- `app/services/commentService.ts` (+ `commentService.test.ts`)
- `app/lib/comment-sanitize.server.ts` — `sanitize-html` config + color palette
- helper for `canViewLesson` / moderation checks (location per existing convention)
- `app/components/comment-editor.tsx` — TipTap, client-only
- `app/components/comment-list.tsx`, `comment-item.tsx`
- `app/routes/api.comments.ts` (+ entry in `app/routes.ts`)
- `app/routes/courses.$slug.lessons.$lessonId.tsx` — loader loads comments; page renders the section
- `scripts/seed.ts` — sample comments
- `package.json` — add `@tiptap/react`, `@tiptap/starter-kit`,
  `@tiptap/extension-text-style`, `@tiptap/extension-color`, `sanitize-html`

---

## Suggested build order (TDD)

1. Schema + migration.
2. `commentService` test-first: create / reply / depth guard / permissions /
   cascade delete / sanitization.
3. `comment-sanitize.server.ts` with palette + allowlist (+ test).
4. `api.comments.ts` resource route (Zod validation, permission gating).
5. UI: editor → list/item components → wire into lesson page.
6. Seed data.
