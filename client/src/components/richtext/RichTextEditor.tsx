import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Mention from "@tiptap/extension-mention";
import { useEffect, useCallback, useState, useRef, forwardRef, useImperativeHandle } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Link as LinkIcon,
  Unlink,
  Smile,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Paperclip,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import EmojiPicker, { Theme, EmojiClickData } from "emoji-picker-react";
import { useTheme } from "@/lib/theme-provider";
import { getDocForEditor, serializeDocToString } from "./richTextUtils";
import { PromptDialog } from "@/components/prompt-dialog";
import type { User } from "@shared/schema";

interface RichTextEditorProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onAttachmentClick?: () => void;
  placeholder?: string;
  className?: string;
  editorClassName?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  minHeight?: string;
  showToolbar?: boolean;
  showAlignment?: boolean;
  showAttachment?: boolean;
  users?: User[];
  "data-testid"?: string;
}

interface MenuBarProps {
  editor: Editor | null;
  onOpenLinkDialog: () => void;
  onEmojiSelect: (emoji: string) => void;
  onAttachmentClick?: () => void;
  showAlignment?: boolean;
  showAttachment?: boolean;
}

interface MentionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface MentionSuggestionProps {
  query: string;
  users: User[];
  command: (props: { id: string; label: string }) => void;
}

const MentionList = forwardRef<MentionListHandle, MentionSuggestionProps>(
  function MentionList({ query, users, command }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const filteredUsers = users.filter((user) => {
      const searchText = query.toLowerCase();
      const name = (user.displayName || user.name || "").toLowerCase();
      const email = user.email?.toLowerCase() || "";
      const firstName = user.firstName?.toLowerCase() || "";
      const lastName = user.lastName?.toLowerCase() || "";
      return (
        name.includes(searchText) ||
        email.includes(searchText) ||
        firstName.includes(searchText) ||
        lastName.includes(searchText)
      );
    }).slice(0, 5);

    useEffect(() => {
      setSelectedIndex(0);
    }, [query]);

    const selectUser = useCallback(
      (index: number) => {
        const user = filteredUsers[index];
        if (user) {
          command({
            id: user.id,
            label: user.displayName || user.name || user.email,
          });
        }
      },
      [filteredUsers, command]
    );

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === "ArrowDown") {
          setSelectedIndex((prev) => (prev + 1) % Math.max(filteredUsers.length, 1));
          return true;
        }
        if (event.key === "ArrowUp") {
          setSelectedIndex((prev) => (prev - 1 + filteredUsers.length) % Math.max(filteredUsers.length, 1));
          return true;
        }
        if (event.key === "Enter") {
          selectUser(selectedIndex);
          return true;
        }
        return false;
      },
    }), [filteredUsers.length, selectedIndex, selectUser]);

    if (filteredUsers.length === 0) {
      return (
        <div className="bg-popover border rounded-md shadow-md p-2 text-sm text-muted-foreground">
          No users found
        </div>
      );
    }

    return (
      <div className="bg-popover border rounded-md shadow-md overflow-hidden">
        {filteredUsers.map((user, index) => (
          <button
            key={user.id}
            type="button"
            className={cn(
              "w-full px-3 py-2 text-left text-sm flex flex-col",
              index === selectedIndex && "bg-accent"
            )}
            onClick={() => selectUser(index)}
            data-testid={`mention-option-${user.id}`}
          >
            <span className="font-medium">{user.displayName || user.name || "Unknown"}</span>
            <span className="text-xs text-muted-foreground">{user.email}</span>
          </button>
        ))}
      </div>
    );
  }
);

function MenuBar({ editor, onOpenLinkDialog, onEmojiSelect, onAttachmentClick, showAlignment = true, showAttachment = false }: MenuBarProps) {
  const { theme } = useTheme();
  const [emojiOpen, setEmojiOpen] = useState(false);

  if (!editor) return null;

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    onEmojiSelect(emojiData.emoji);
    setEmojiOpen(false);
  };

  return (
    <div className="flex flex-wrap gap-1 border-b border-border p-1 bg-muted/30" data-testid="richtext-toolbar">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn("px-2 toggle-elevate", editor.isActive("bold") && "toggle-elevated")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={!editor.can().chain().focus().toggleBold().run()}
        data-testid="button-bold"
      >
        <Bold className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn("px-2 toggle-elevate", editor.isActive("italic") && "toggle-elevated")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={!editor.can().chain().focus().toggleItalic().run()}
        data-testid="button-italic"
      >
        <Italic className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn("px-2 toggle-elevate", editor.isActive("underline") && "toggle-elevated")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        disabled={!editor.can().chain().focus().toggleUnderline().run()}
        data-testid="button-underline"
      >
        <UnderlineIcon className="h-4 w-4" />
      </Button>
      <div className="w-px bg-border mx-1" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn("px-2 toggle-elevate", editor.isActive("bulletList") && "toggle-elevated")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        data-testid="button-bullet-list"
      >
        <List className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn("px-2 toggle-elevate", editor.isActive("orderedList") && "toggle-elevated")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        data-testid="button-ordered-list"
      >
        <ListOrdered className="h-4 w-4" />
      </Button>
      {showAlignment && (
        <>
          <div className="w-px bg-border mx-1" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("px-2 toggle-elevate", editor.isActive({ textAlign: "left" }) && "toggle-elevated")}
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            data-testid="button-align-left"
          >
            <AlignLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("px-2 toggle-elevate", editor.isActive({ textAlign: "center" }) && "toggle-elevated")}
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            data-testid="button-align-center"
          >
            <AlignCenter className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("px-2 toggle-elevate", editor.isActive({ textAlign: "right" }) && "toggle-elevated")}
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            data-testid="button-align-right"
          >
            <AlignRight className="h-4 w-4" />
          </Button>
        </>
      )}
      <div className="w-px bg-border mx-1" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn("px-2 toggle-elevate", editor.isActive("link") && "toggle-elevated")}
        onClick={onOpenLinkDialog}
        data-testid="button-link"
      >
        <LinkIcon className="h-4 w-4" />
      </Button>
      {editor.isActive("link") && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="px-2"
          onClick={() => editor.chain().focus().unsetLink().run()}
          data-testid="button-unlink"
        >
          <Unlink className="h-4 w-4" />
        </Button>
      )}
      {showAttachment && onAttachmentClick && (
        <>
          <div className="w-px bg-border mx-1" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="px-2"
            onClick={onAttachmentClick}
            data-testid="button-attachment"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
        </>
      )}
      <div className="w-px bg-border mx-1" />
      <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="px-2"
            data-testid="button-emoji"
          >
            <Smile className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          side="bottom" 
          align="start" 
          className="w-auto p-0 border-0"
          sideOffset={8}
        >
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
            theme={theme === "dark" ? Theme.DARK : Theme.LIGHT}
            width={300}
            height={350}
            searchPlaceHolder="Search emoji..."
            previewConfig={{ showPreview: false }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function RichTextEditor({
  value,
  onChange,
  onBlur,
  onAttachmentClick,
  placeholder = "Enter text...",
  className,
  editorClassName,
  disabled = false,
  autoFocus = false,
  minHeight = "100px",
  showToolbar = true,
  showAlignment = true,
  showAttachment = false,
  users = [],
  "data-testid": testId,
}: RichTextEditorProps) {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkDefaultValue, setLinkDefaultValue] = useState("");
  const [mentionPopupOpen, setMentionPopupOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionCommand, setMentionCommand] = useState<((props: { id: string; label: string }) => void) | null>(null);
  const [mentionRect, setMentionRect] = useState<{ top: number; left: number } | null>(null);

  const usersRef = useRef<User[]>(users);
  useEffect(() => { usersRef.current = users; }, [users]);

  const mentionListRef = useRef<MentionListHandle>(null);

  const extensions = [
    StarterKit.configure({
      heading: false,
      codeBlock: false,
      blockquote: false,
      horizontalRule: false,
    }),
    Underline,
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        rel: "noopener noreferrer",
        target: "_blank",
      },
      validate: (href) => /^https?:\/\//.test(href),
    }),
    TextAlign.configure({
      types: ["paragraph", "heading"],
    }),
    Mention.configure({
      HTMLAttributes: {
        class: "mention",
      },
      suggestion: {
        char: "@",
        items: ({ query }: { query: string }) => {
          return usersRef.current.filter((user) => {
            const searchText = query.toLowerCase();
            const name = (user.displayName || user.name || "").toLowerCase();
            const email = user.email?.toLowerCase() || "";
            return name.includes(searchText) || email.includes(searchText);
          }).slice(0, 5);
        },
        render: () => {
          return {
            onStart: (props: { query: string; command: (props: { id: string; label: string }) => void; clientRect?: (() => DOMRect | null) | null }) => {
              setMentionQuery(props.query);
              setMentionCommand(() => props.command);
              setMentionPopupOpen(true);
              if (props.clientRect) {
                const rect = props.clientRect();
                if (rect) {
                  setMentionRect({ top: rect.top + window.scrollY, left: rect.left + window.scrollX });
                }
              }
            },
            onUpdate: (props: { query: string; clientRect?: (() => DOMRect | null) | null }) => {
              setMentionQuery(props.query);
              if (props.clientRect) {
                const rect = props.clientRect();
                if (rect) {
                  setMentionRect({ top: rect.top + window.scrollY, left: rect.left + window.scrollX });
                }
              }
            },
            onKeyDown: (props: { event: KeyboardEvent }) => {
              if (props.event.key === "Escape") {
                setMentionPopupOpen(false);
                return true;
              }
              if (mentionListRef.current) {
                return mentionListRef.current.onKeyDown(props.event);
              }
              return false;
            },
            onExit: () => {
              setMentionPopupOpen(false);
              setMentionCommand(null);
              setMentionRect(null);
            },
          };
        },
      },
    }),
  ];

  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const onBlurRef = useRef(onBlur);
  useEffect(() => { onBlurRef.current = onBlur; }, [onBlur]);

  const prevValueRef = useRef(value);
  const suppressOnChangeRef = useRef(false);

  const editor = useEditor({
    extensions,
    content: getDocForEditor(value),
    editable: !disabled,
    autofocus: autoFocus,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none",
          "min-h-[100px] px-3 py-2",
          editorClassName
        ),
        style: `min-height: ${minHeight}`,
        "data-testid": testId ? `${testId}-content` : "richtext-content",
      },
      handlePaste: (_view, event) => {
        const text = event.clipboardData?.getData("text/plain");
        if (text) {
          event.preventDefault();
          editor?.commands.insertContent(text);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      if (suppressOnChangeRef.current) return;
      const doc = editor.getJSON();
      onChangeRef.current(serializeDocToString(doc));
    },
    onBlur: () => {
      onBlurRef.current?.();
    },
  });

  useEffect(() => {
    if (editor && value !== undefined) {
      const currentDoc = serializeDocToString(editor.getJSON());
      const newDoc = serializeDocToString(getDocForEditor(value));
      
      if (currentDoc !== newDoc) {
        const prevDoc = serializeDocToString(getDocForEditor(prevValueRef.current));
        const isExternalChange = prevDoc !== newDoc;
        if (isExternalChange || !editor.isFocused) {
          suppressOnChangeRef.current = true;
          editor.commands.setContent(getDocForEditor(value));
          suppressOnChangeRef.current = false;
        }
      }
      prevValueRef.current = value;
    }
  }, [editor, value]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [editor, disabled]);

  const openLinkDialog = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href || "";
    setLinkDefaultValue(previousUrl || "https://");
    setLinkDialogOpen(true);
  }, [editor]);

  const handleLinkConfirm = useCallback((url: string) => {
    if (!editor) return;
    
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const handleEmojiSelect = useCallback((emoji: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent(emoji).run();
  }, [editor]);

  return (
    <div
      className={cn(
        "border border-input rounded-md overflow-hidden bg-background relative",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      data-testid={testId}
    >
      {showToolbar && <MenuBar editor={editor} onOpenLinkDialog={openLinkDialog} onEmojiSelect={handleEmojiSelect} onAttachmentClick={onAttachmentClick} showAlignment={showAlignment} showAttachment={showAttachment} />}
      <EditorContent
        editor={editor}
        className={cn(
          "[&_.ProseMirror]:focus:outline-none",
          "[&_.ProseMirror_p]:my-1",
          "[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:ml-4",
          "[&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:ml-4",
          "[&_.ProseMirror_a]:text-primary [&_.ProseMirror_a]:underline",
          "[&_.ProseMirror.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
          "[&_.ProseMirror.is-editor-empty:first-child::before]:text-muted-foreground",
          "[&_.ProseMirror.is-editor-empty:first-child::before]:float-left",
          "[&_.ProseMirror.is-editor-empty:first-child::before]:pointer-events-none",
          "[&_.ProseMirror.is-editor-empty:first-child::before]:h-0",
          "[&_.ProseMirror_.mention]:bg-primary/20 [&_.ProseMirror_.mention]:text-primary [&_.ProseMirror_.mention]:rounded [&_.ProseMirror_.mention]:px-1"
        )}
      />
      {mentionPopupOpen && mentionCommand && mentionRect && createPortal(
        <div
          className="fixed z-[9999]"
          style={{
            top: mentionRect.top - 4,
            left: mentionRect.left,
            transform: "translateY(-100%)",
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <MentionList
            ref={mentionListRef}
            query={mentionQuery}
            users={users}
            command={mentionCommand}
          />
        </div>,
        document.body
      )}

      <PromptDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        title="Insert Link"
        description="Enter a URL starting with http:// or https://"
        label="URL"
        placeholder="https://..."
        defaultValue={linkDefaultValue}
        confirmText="Insert"
        onConfirm={handleLinkConfirm}
      />
    </div>
  );
}

export default RichTextEditor;
