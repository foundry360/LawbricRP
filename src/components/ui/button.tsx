import { ButtonHTMLAttributes, forwardRef, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "ghost" | "outline" | "destructive";
  size?: "default" | "icon" | "sm" | "lg";
  tooltip?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", title, tooltip, ...props }, ref) => {
    const hasCustomRounded = /\b(?:[a-z]+:)*rounded/.test(className ?? "");
    const hasCustomHoverBackground = /\b(?:[a-z]+:)*hover:bg-/.test(className ?? "");
    const controlHover = hasCustomHoverBackground ? "" : "hover:bg-[#0484C8] hover:text-white";
    const tooltipContent =
      tooltip ||
      (size === "icon" && typeof title === "string" ? title : undefined);

    const button = (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:pointer-events-none disabled:opacity-50",
          hasCustomRounded ? "" : "rounded-md",
          variant === "default" && "bg-primary text-primary-foreground hover:bg-[#0484C8]",
          variant === "ghost" && controlHover,
          variant === "outline" && `border border-border bg-background ${controlHover}`,
          variant === "destructive" && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
          size === "default" && "h-10 px-4 py-2 text-sm",
          size === "sm" && "h-8 px-3 text-xs",
          size === "lg" && "h-11 px-8 text-sm",
          size === "icon" && "h-9 w-9",
          className,
        )}
        title={tooltipContent ? undefined : title}
        {...props}
      />
    );

    if (!tooltipContent) return button;

    return (
      <Tooltip>
        <TooltipTrigger>{button}</TooltipTrigger>
        <TooltipContent className="left-1/2 -translate-x-1/2 whitespace-nowrap border-slate-900 bg-slate-900 px-2 py-1 text-xs text-white shadow-md">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    );
  },
);

Button.displayName = "Button";
