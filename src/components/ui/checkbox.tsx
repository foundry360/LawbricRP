import { InputHTMLAttributes, forwardRef } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "checked" | "onChange" | "type"> & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked = false, onCheckedChange, ...props }, ref) => {
    return (
      <label className="relative inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center">
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          onChange={(event) => onCheckedChange?.(event.target.checked)}
          className="peer sr-only"
          {...props}
        />
        <span
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded-sm border border-border bg-background peer-focus:ring-2 peer-focus:ring-primary/20 peer-checked:bg-primary peer-checked:text-primary-foreground",
            className,
          )}
        >
          {checked && <Check className="h-3 w-3" strokeWidth={2.5} />}
        </span>
      </label>
    );
  },
);

Checkbox.displayName = "Checkbox";
