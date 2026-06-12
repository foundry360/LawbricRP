import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar as CalendarIcon, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

type DatePickerProps = {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  displayMonth?: "short" | "long";
  minDate?: Date;
  maxDate?: Date;
  clearable?: boolean;
  monthYearPicker?: boolean;
  fromYear?: number;
  toYear?: number;
};

type DateTimePickerProps = DatePickerProps;

const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const MINUTES = ["00", "15", "30", "45"];

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateValue(value?: string) {
  if (!value) return undefined;
  const [datePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatDateTimeValue(date: Date, hour: string, minute: string, period: "AM" | "PM") {
  const hourNumber = Number(hour);
  const normalizedHour = period === "PM" ? (hourNumber % 12) + 12 : hourNumber % 12;
  return `${formatDateValue(date)}T${String(normalizedHour).padStart(2, "0")}:${minute}`;
}

function getTimeParts(value?: string) {
  const timePart = value?.split("T")[1] || "09:00";
  const [hourText = "09", minuteText = "00"] = timePart.split(":");
  const hour24 = Number(hourText);
  const period: "AM" | "PM" = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return {
    hour: String(hour12),
    minute: MINUTES.includes(minuteText) ? minuteText : "00",
    period,
  };
}

function formatDisplayDate(value?: string, displayMonth: "short" | "long" = "short") {
  const date = parseDateValue(value);
  if (!date) return "";
  return date.toLocaleDateString(undefined, { month: displayMonth, day: "numeric", year: "numeric" });
}

function formatDisplayDateTime(value?: string, displayMonth: "short" | "long" = "short") {
  const date = parseDateValue(value);
  if (!date) return "";
  const { hour, minute, period } = getTimeParts(value);
  return `${formatDisplayDate(value, displayMonth)} at ${hour}:${minute} ${period}`;
}

function DatePickerBase({
  value,
  onValueChange,
  placeholder = "Select date",
  disabled,
  displayMonth = "short",
  minDate,
  maxDate,
  clearable = true,
  monthYearPicker = false,
  fromYear,
  toYear,
  mode,
}: DatePickerProps & { mode: "date" | "datetime" }) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseDateValue(value);
  const [month, setMonth] = useState(selectedDate || new Date());
  const [time, setTime] = useState(getTimeParts(value));
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedDate) setMonth(selectedDate);
    setTime(getTimeParts(value));
  }, [selectedDate?.getTime(), value]);

  const updateMenuPosition = useCallback(() => {
    const trigger = buttonRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 16;
    const gap = 4;
    const menuWidth = 304;
    const estimatedHeight = mode === "datetime" ? 430 : 360;
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewportPadding;
    const openAbove = availableBelow < estimatedHeight && availableAbove > availableBelow;
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding),
    );

    setMenuStyle({
      left,
      top: openAbove ? Math.max(viewportPadding, rect.top - estimatedHeight - gap) : rect.bottom + gap,
      width: menuWidth,
    });
  }, [mode]);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
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

  const displayValue = mode === "datetime" ? formatDisplayDateTime(value, displayMonth) : formatDisplayDate(value, displayMonth);
  const selectedTimeValue = useMemo(
    () => formatDateTimeValue(selectedDate || new Date(), time.hour, time.minute, time.period),
    [selectedDate, time],
  );

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    setMonth(date);
    if (mode === "datetime") {
      onValueChange(formatDateTimeValue(date, time.hour, time.minute, time.period));
      return;
    }

    onValueChange(formatDateValue(date));
    setOpen(false);
  };

  const handleTimeChange = (nextTime: typeof time) => {
    setTime(nextTime);
    onValueChange(formatDateTimeValue(selectedDate || new Date(), nextTime.hour, nextTime.minute, nextTime.period));
  };

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[220] rounded-lg border border-border bg-background p-3 shadow-xl"
            style={menuStyle}
          >
            <Calendar
              selected={selectedDate}
              month={month}
              onMonthChange={setMonth}
              onSelect={handleDateSelect}
              disabled={(date) => Boolean((minDate && date < minDate) || (maxDate && date > maxDate))}
              className="w-full border-0 p-0 shadow-none"
              monthYearPicker={monthYearPicker}
              fromYear={fromYear}
              toYear={toYear}
            />

            {mode === "datetime" && (
              <div className="mt-3 border-t pt-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Time
                </div>
                <div className="grid grid-cols-[1fr_1fr_1fr] gap-2">
                  <select
                    value={time.hour}
                    onChange={(event) => handleTimeChange({ ...time, hour: event.target.value })}
                    className="h-9 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    {HOURS.map((hour) => (
                      <option key={hour} value={hour}>{hour}</option>
                    ))}
                  </select>
                  <select
                    value={time.minute}
                    onChange={(event) => handleTimeChange({ ...time, minute: event.target.value })}
                    className="h-9 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    {MINUTES.map((minute) => (
                      <option key={minute} value={minute}>{minute}</option>
                    ))}
                  </select>
                  <select
                    value={time.period}
                    onChange={(event) => handleTimeChange({ ...time, period: event.target.value as "AM" | "PM" })}
                    className="h-9 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
                <Button type="button" className="mt-3 w-full" onClick={() => {
                  if (!selectedDate) onValueChange(selectedTimeValue);
                  setOpen(false);
                }}>
                  Done
                </Button>
              </div>
            )}

            {clearable && value ? (
              <Button
                type="button"
                variant="ghost"
                className="mt-2 w-full text-muted-foreground"
                onClick={() => {
                  onValueChange("");
                  setOpen(false);
                }}
              >
                <X className="mr-2 h-4 w-4" />
                Clear
              </Button>
            ) : null}
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
        disabled={disabled}
        className={cn("w-full justify-between font-normal", !displayValue && "text-muted-foreground")}
        onClick={() => {
          updateMenuPosition();
          setOpen((nextOpen) => !nextOpen);
        }}
      >
        <span className="truncate">{displayValue || placeholder}</span>
        <CalendarIcon className="ml-2 h-4 w-4 shrink-0 opacity-60" />
      </Button>
      {menu}
    </>
  );
}

export function DatePicker(props: DatePickerProps) {
  return <DatePickerBase {...props} mode="date" />;
}

export function DateTimePicker(props: DateTimePickerProps) {
  return <DatePickerBase {...props} mode="datetime" placeholder={props.placeholder || "Select date and time"} />;
}
