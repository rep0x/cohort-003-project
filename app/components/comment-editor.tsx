import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Bold, Italic, Strikethrough, Ban } from "lucide-react";
import { cn } from "~/lib/utils";
import { COMMENT_COLORS } from "~/lib/comment-colors";

// Minimal rich-text editor for lesson comments: Bold, Italic, Strike, and a
// fixed text-color palette. Nothing else. Client-only under React Router
// framework mode via `immediatelyRender: false`.

export function CommentEditor({
  initialContent = "",
  onChange,
  onTextChange,
  placeholder,
}: {
  initialContent?: string;
  onChange: (html: string) => void;
  onTextChange?: (text: string) => void;
  placeholder?: string;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
      }),
      TextStyle,
      Color.configure({ types: ["textStyle"] }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm prose-neutral dark:prose-invert max-w-none min-h-[80px] px-3 py-2 focus:outline-none",
        ...(placeholder ? { "data-placeholder": placeholder } : {}),
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
      onTextChange?.(editor.getText());
    },
  });

  if (!editor) {
    return (
      <div className="min-h-[120px] rounded-md border border-input bg-background" />
    );
  }

  return (
    <div className="rounded-md border border-input bg-background focus-within:ring-[3px] focus-within:ring-ring/50">
      <div className="flex flex-wrap items-center gap-1 border-b border-border p-1.5">
        <ToolbarButton
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          label="Bold"
        >
          <Bold className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          label="Italic"
        >
          <Italic className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          label="Strikethrough"
        >
          <Strikethrough className="size-4" />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-border" />

        {COMMENT_COLORS.map((color) => (
          <button
            key={color.value}
            type="button"
            title={color.name}
            aria-label={`Text color ${color.name}`}
            onClick={() =>
              editor.chain().focus().setColor(color.value).run()
            }
            className={cn(
              "size-5 rounded-full border border-border/60 transition-transform hover:scale-110",
              editor.isActive("textStyle", { color: color.value }) &&
                "ring-2 ring-offset-1 ring-ring"
            )}
            style={{ backgroundColor: color.value }}
          />
        ))}
        <ToolbarButton
          active={false}
          onClick={() => editor.chain().focus().unsetColor().run()}
          label="Clear color"
        >
          <Ban className="size-4" />
        </ToolbarButton>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        active && "bg-muted text-foreground"
      )}
    >
      {children}
    </button>
  );
}
