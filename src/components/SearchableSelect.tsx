import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SearchableSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  getOptionLabel?: (value: string) => string;
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
};

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select option",
  searchPlaceholder = "Search...",
  emptyMessage = "No options found.",
  getOptionLabel = (option) => option,
  className,
  contentClassName,
  disabled,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const normalizedOptions = useMemo(() => {
    const uniqueOptions = new Set<string>();
    if (value) uniqueOptions.add(value);
    options.forEach((option) => {
      if (option) uniqueOptions.add(option);
    });
    return Array.from(uniqueOptions);
  }, [options, value]);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return normalizedOptions;
    return normalizedOptions.filter((option) => getOptionLabel(option).toLowerCase().includes(normalizedQuery));
  }, [getOptionLabel, normalizedOptions, query]);

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
      ...(openAbove
        ? { bottom: window.innerHeight - rect.top + gap }
        : { top: rect.bottom + gap }),
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

  const selectOption = (option: string) => {
    onValueChange(option);
    setOpen(false);
    setQuery("");
  };

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            data-searchable-select-content="true"
            className={cn(
              "fixed z-[200] rounded-md border border-border bg-background p-0 shadow-lg",
              contentClassName,
            )}
            style={menuStyle}
          >
            <div className="border-b border-border p-2">
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && filteredOptions[0]) {
                    event.preventDefault();
                    selectOption(filteredOptions[0]);
                  }
                }}
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
                    className="flex w-full items-center rounded-sm px-2 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => selectOption(option)}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === option ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{getOptionLabel(option)}</span>
                  </button>
                ))
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
          disabled={disabled}
          onClick={() => {
            updateMenuPosition();
            setOpen((nextOpen) => !nextOpen);
          }}
          className={cn("w-full justify-between font-normal", !value && "text-muted-foreground", className)}
        >
          <span className="truncate">{value ? getOptionLabel(value) : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      {menu}
    </>
  );
}
