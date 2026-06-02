import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "ghost" | "outline" | "destructive";
  size?: "default" | "icon" | "sm" | "lg";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const hasCustomRounded = /\b(?:[a-z]+:)*rounded/.test(className ?? "");
    const hasCustomHoverBackground = /\b(?:[a-z]+:)*hover:bg-/.test(className ?? "");
    const subtleBlueHover = hasCustomHoverBackground ? "" : "hover:bg-primary/10 hover:text-primary";

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:pointer-events-none disabled:opacity-50",
          hasCustomRounded ? "" : "rounded-md",
          variant === "default" && "bg-primary text-primary-foreground hover:bg-primary/90",
          variant === "ghost" && subtleBlueHover,
          variant === "outline" && `border border-border bg-background ${subtleBlueHover}`,
          variant === "destructive" && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
          size === "default" && "h-10 px-4 py-2 text-sm",
          size === "sm" && "h-8 px-3 text-xs",
          size === "lg" && "h-11 px-8 text-sm",
          size === "icon" && "h-9 w-9",
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
