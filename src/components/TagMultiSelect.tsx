import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TagMultiSelectProps = {
  value: string[];
  onValueChange: (value: string[]) => void;
  options: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  onCreateOption?: (name: string) => Promise<string | void> | string | void;
};

export function TagMultiSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select tags",
  searchPlaceholder = "Search tags...",
  emptyMessage = "No tags found.",
  onCreateOption,
}: TagMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const normalizedOptions = useMemo(() => Array.from(new Set(options.filter(Boolean))), [options]);
  const selected = useMemo(() => new Set(value), [value]);
  const filteredOptions = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return normalizedOptions;
    return normalizedOptions.filter((option) => option.toLowerCase().includes(search));
  }, [normalizedOptions, query]);
  const trimmedQuery = query.trim();
  const canCreate =
    Boolean(onCreateOption) &&
    trimmedQuery.length > 0 &&
    !normalizedOptions.some((option) => option.toLowerCase() === trimmedQuery.toLowerCase());

  const updateMenuPosition = useCallback(() => {
    const trigger = buttonRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 16;
    const gap = 4;
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewportPadding;
    const openAbove = availableBelow < 220 && availableAbove > availableBelow;
    const availableHeight = openAbove ? availableAbove : availableBelow;
    const maxHeight = Math.min(320, Math.max(160, availableHeight));
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      Math.max(viewportPadding, window.innerWidth - rect.width - viewportPadding),
    );

    setMenuStyle({
      left,
      top: openAbove ? Math.max(viewportPadding, rect.top - maxHeight - gap) : rect.bottom + gap,
      width: rect.width,
      maxHeight,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    updateMenuPosition();
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  const toggleOption = (option: string) => {
    const next = selected.has(option) ? value.filter((item) => item !== option) : [...value, option];
    onValueChange(next);
  };

  const handleCreateOption = async () => {
    if (!onCreateOption || !trimmedQuery || isCreating) return;

    setIsCreating(true);
    try {
      const createdName = (await onCreateOption(trimmedQuery)) || trimmedQuery;
      onValueChange(Array.from(new Set([...value, createdName])));
      setQuery("");
    } catch (error) {
      console.error("Failed to create tag", error);
    } finally {
      setIsCreating(false);
    }
  };

  const label = value.length > 0 ? `${value.length} tag${value.length === 1 ? "" : "s"} selected` : placeholder;
  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[200] rounded-md border border-border bg-background p-0 shadow-lg"
            style={menuStyle}
          >
            <div className="border-b border-border p-2">
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div
              className="hover-scrollbar overflow-y-auto p-1"
              style={{ maxHeight: Math.max(110, Number(menuStyle.maxHeight || 320) - 58) }}
            >
              {filteredOptions.length === 0 ? (
                <div className="px-2 py-3 text-center text-sm text-muted-foreground">{emptyMessage}</div>
              ) : (
                filteredOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => toggleOption(option)}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-border",
                        selected.has(option) && "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {selected.has(option) && <Check className="h-3 w-3" strokeWidth={2.5} />}
                    </span>
                    <span className="truncate">{option}</span>
                  </button>
                ))
              )}
              {canCreate && (
                <button
                  type="button"
                  className="mt-1 flex w-full items-center gap-2 border-t px-2 py-2 text-left text-sm font-medium text-primary hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleCreateOption}
                  disabled={isCreating}
                >
                  {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  <span className="truncate">Create tag "{trimmedQuery}"</span>
                </button>
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <Button
        ref={buttonRef}
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        className={cn("w-full justify-between font-normal", value.length === 0 && "text-muted-foreground")}
        onClick={() => {
          updateMenuPosition();
          setOpen((nextOpen) => !nextOpen);
        }}
      >
        <span className="truncate">{label}</span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
      {menu}
    </>
  );
}
