import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type CalendarProps = {
  mode?: "single";
  selected?: Date;
  onSelect?: (date: Date | undefined) => void;
  month?: Date;
  onMonthChange?: (date: Date) => void;
  disabled?: (date: Date) => boolean;
  className?: string;
  monthYearPicker?: boolean;
  fromYear?: number;
  toYear?: number;
};

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: index,
  label: new Date(2000, index, 1).toLocaleDateString(undefined, { month: "long" }),
}));

export function Calendar({
  selected,
  onSelect,
  month = new Date(),
  onMonthChange,
  disabled,
  className,
  monthYearPicker = false,
  fromYear,
  toYear,
}: CalendarProps) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const startOffset = firstDay.getDay();
  const visibleDays = Array.from({ length: 42 }, (_, index) => {
    return new Date(month.getFullYear(), month.getMonth(), index - startOffset + 1);
  });
  const currentYear = new Date().getFullYear();
  const startYear = fromYear ?? currentYear - 120;
  const endYear = toYear ?? currentYear + 10;
  const yearOptions = Array.from({ length: Math.max(0, endYear - startYear + 1) }, (_, index) => startYear + index);

  const moveMonth = (offset: number) => {
    onMonthChange?.(new Date(month.getFullYear(), month.getMonth() + offset, 1));
  };

  const updateMonth = (nextMonth: number) => {
    onMonthChange?.(new Date(month.getFullYear(), nextMonth, 1));
  };

  const updateYear = (nextYear: number) => {
    onMonthChange?.(new Date(nextYear, month.getMonth(), 1));
  };

  return (
    <div className={cn("w-[280px] rounded-md border border-border bg-background p-3 shadow-sm", className)}>
      <div className="mb-3 flex items-center justify-between">
        <button className="rounded-md p-1 hover:bg-muted" onClick={() => moveMonth(-1)} type="button">
          <ChevronLeft className="h-4 w-4" />
        </button>
        {monthYearPicker ? (
          <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_5rem] gap-2 px-2">
            <select
              value={month.getMonth()}
              onChange={(event) => updateMonth(Number(event.target.value))}
              className="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            >
              {MONTH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={month.getFullYear()}
              onChange={(event) => updateYear(Number(event.target.value))}
              className="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="text-sm font-medium">
            {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </div>
        )}
        <button className="rounded-md p-1 hover:bg-muted" onClick={() => moveMonth(1)} type="button">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
          <div key={day} className="py-1">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {visibleDays.map((day) => {
          const isCurrentMonth = day.getMonth() === month.getMonth();
          const isSelected = selected?.toDateString() === day.toDateString();
          const isDisabled = disabled?.(day) ?? false;

          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={isDisabled}
              onClick={() => onSelect?.(day)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-40",
                !isCurrentMonth && "text-muted-foreground/40",
                isSelected && "bg-primary text-primary-foreground hover:bg-primary",
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
