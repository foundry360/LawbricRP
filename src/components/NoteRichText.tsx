import { type ReactNode, useEffect, useRef } from "react";
import { Bold, Italic, LinkIcon, List, ListOrdered, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NoteRichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
};

type ToolbarAction = {
  label: string;
  icon: ReactNode;
  apply: () => void;
};

function isSafeHref(href: string) {
  return /^(https?:\/\/|mailto:|tel:)/i.test(href.trim());
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderMarkdownInlineToHtml(text: string) {
  const parts: string[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(escapeHtml(text.slice(lastIndex, match.index)));

    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(`<strong>${escapeHtml(token.slice(2, -2))}</strong>`);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(`<em>${escapeHtml(token.slice(1, -1))}</em>`);
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const label = linkMatch?.[1] || token;
      const href = linkMatch?.[2] || "";
      parts.push(isSafeHref(href) ? `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>` : escapeHtml(label));
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) parts.push(escapeHtml(text.slice(lastIndex)));
  return parts.join("");
}

function markdownToHtml(value: string) {
  const lines = value.split(/\r?\n/);
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(`<li>${renderMarkdownInlineToHtml(lines[index].replace(/^[-*]\s+/, ""))}</li>`);
        index += 1;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(`<li>${renderMarkdownInlineToHtml(lines[index].replace(/^\d+\.\s+/, ""))}</li>`);
        index += 1;
      }
      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    if (/^>\s+/.test(line)) {
      blocks.push(`<blockquote>${renderMarkdownInlineToHtml(line.replace(/^>\s+/, ""))}</blockquote>`);
      index += 1;
      continue;
    }

    blocks.push(`<p>${renderMarkdownInlineToHtml(line)}</p>`);
    index += 1;
  }

  return blocks.join("");
}

function looksLikeHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function styleIncludes(style: string, pattern: RegExp) {
  return pattern.test(style.replace(/\s+/g, " ").toLowerCase());
}

function normalizeStyledSpan(element: HTMLElement) {
  if (element.tagName !== "SPAN") return false;

  const style = element.getAttribute("style") || "";
  const isBold = styleIncludes(style, /font-weight:\s*(bold|[6-9]00|[6-9]\d\d)/);
  const isItalic = styleIncludes(style, /font-style:\s*italic/);
  const isUnderline = styleIncludes(style, /text-decoration(?:-line)?:\s*[^;]*underline/);

  if (!isBold && !isItalic && !isUnderline) return false;

  let wrapper: HTMLElement = element.ownerDocument.createElement(isBold ? "strong" : isItalic ? "em" : "u");
  let currentWrapper = wrapper;

  if (isBold && isItalic) {
    const em = element.ownerDocument.createElement("em");
    currentWrapper.append(...Array.from(element.childNodes));
    em.append(wrapper);
    wrapper = em;
  } else {
    currentWrapper.append(...Array.from(element.childNodes));
  }

  if (isUnderline) {
    const underline = element.ownerDocument.createElement("u");
    underline.append(wrapper);
    wrapper = underline;
  }

  element.replaceWith(wrapper);
  return true;
}

export function sanitizeNoteHtml(value?: string | null) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";
  const html = looksLikeHtml(rawValue) ? rawValue : markdownToHtml(rawValue);

  if (typeof window === "undefined" || typeof DOMParser === "undefined") return escapeHtml(rawValue);

  const allowedTags = new Set(["A", "B", "BLOCKQUOTE", "BR", "DIV", "EM", "I", "LI", "OL", "P", "STRONG", "U", "UL"]);
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const cleanNode = (node: Node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as HTMLElement;
        if (normalizeStyledSpan(element)) {
          cleanNode(node);
          return;
        }

        if (!allowedTags.has(element.tagName)) {
          element.replaceWith(...Array.from(element.childNodes));
          cleanNode(node);
          return;
        }

        const href = element.getAttribute("href") || "";
        Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name));
        if (element.tagName === "A") {
          if (isSafeHref(href)) {
            element.setAttribute("href", href);
            if (href.startsWith("http")) {
              element.setAttribute("target", "_blank");
              element.setAttribute("rel", "noreferrer");
            }
          } else {
            element.removeAttribute("href");
          }
        }

        cleanNode(element);
      } else if (child.nodeType !== Node.TEXT_NODE) {
        child.remove();
      }
    });
  };

  cleanNode(doc.body);
  return doc.body.innerHTML;
}

export function NoteRichTextBody({ value, className }: { value?: string | null; className?: string }) {
  const html = sanitizeNoteHtml(value);
  if (!html) return <span className={className}>Untitled note</span>;

  return (
    <div
      className={cn(
        "note-rich-text-body space-y-2 whitespace-pre-wrap [&_a]:font-medium [&_a]:text-[#2384CA] [&_a:hover]:text-[#1b6da8] [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_em]:italic [&_i]:italic [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_u]:underline [&_ul]:list-disc [&_ul]:pl-5",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function NoteRichTextEditor({ value, onChange, readOnly, placeholder = "Add a note" }: NoteRichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastSyncedValueRef = useRef("");

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const sanitizedValue = sanitizeNoteHtml(value);
    if (sanitizedValue !== lastSyncedValueRef.current && sanitizedValue !== editor.innerHTML) {
      editor.innerHTML = sanitizedValue;
      lastSyncedValueRef.current = sanitizedValue;
    }
  }, [value]);

  const syncEditorValue = () => {
    const nextValue = sanitizeNoteHtml(editorRef.current?.innerHTML || "");
    lastSyncedValueRef.current = nextValue;
    onChange(nextValue);
  };

  const focusEditor = () => {
    editorRef.current?.focus();
  };

  const runCommand = (command: string, commandValue?: string) => {
    focusEditor();
    document.execCommand(command, false, commandValue);
    syncEditorValue();
  };

  const actions: ToolbarAction[] = [
    {
      label: "Bold",
      icon: <Bold className="h-4 w-4" />,
      apply: () => runCommand("bold"),
    },
    {
      label: "Italic",
      icon: <Italic className="h-4 w-4" />,
      apply: () => runCommand("italic"),
    },
    {
      label: "Bulleted list",
      icon: <List className="h-4 w-4" />,
      apply: () => runCommand("insertUnorderedList"),
    },
    {
      label: "Numbered list",
      icon: <ListOrdered className="h-4 w-4" />,
      apply: () => runCommand("insertOrderedList"),
    },
    {
      label: "Quote",
      icon: <Quote className="h-4 w-4" />,
      apply: () => runCommand("formatBlock", "blockquote"),
    },
    {
      label: "Link",
      icon: <LinkIcon className="h-4 w-4" />,
      apply: () => {
        const href = window.prompt("Enter a link URL");
        if (href && isSafeHref(href)) runCommand("createLink", href);
      },
    },
  ];

  return (
    <div className="space-y-2">
      {!readOnly ? (
        <div className="flex flex-wrap gap-1 rounded-md border bg-muted/30 p-1">
          {actions.map((action) => (
            <Button
              key={action.label}
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title={action.label}
              aria-label={action.label}
              onClick={action.apply}
            >
              {action.icon}
            </Button>
          ))}
        </div>
      ) : null}
      <div
        ref={editorRef}
        contentEditable={!readOnly}
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        data-placeholder={placeholder}
        className={cn(
          "note-rich-text-editor min-h-48 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] focus:ring-2 focus:ring-primary/20 [&_a]:font-medium [&_a]:text-[#2384CA] [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_em]:italic [&_i]:italic [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_u]:underline [&_ul]:list-disc [&_ul]:pl-5",
          readOnly && "cursor-default opacity-80",
        )}
        onInput={syncEditorValue}
        onBlur={syncEditorValue}
        suppressContentEditableWarning
      />
    </div>
  );
}
