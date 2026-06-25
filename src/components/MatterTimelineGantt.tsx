import { useMemo, useState } from "react";
import { ArrowUpDown, Calendar, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CaseRecord } from "@/lib/cases";
import {
  buildMatterTimelineItems,
  buildMatterTimelineTicks,
  formatMatterTimelineDate,
  formatMatterTimelineDuration,
  getMatterTimelineRange,
  getTimelineBarGeometry,
  getTodayPositionPercent,
  type MatterTimelineItem,
  type MatterTimelineItemKind,
} from "@/lib/matter-timeline";
import { cn } from "@/lib/utils";

type MatterTimelineZoom = "fit" | "90d" | "180d" | "365d";

type MatterTimelineGanttProps = {
  caseRecord: CaseRecord;
  tasks?: any[];
  events?: any[];
  onItemClick?: (item: MatterTimelineItem) => void;
};

type TimelineSortColumn = "title" | "typeLabel" | "startMs" | "endMs" | "duration" | "statusLabel";

const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 40;
const LABEL_WIDTH = 240;

function getKindBadgeClass(kind: MatterTimelineItemKind) {
  switch (kind) {
    case "milestone":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "stage":
      return "border-violet-200 bg-violet-50 text-violet-800";
    case "event":
      return "border-violet-200 bg-violet-50 text-violet-800";
    case "task":
      return "border-sky-200 bg-sky-50 text-sky-800";
    default:
      return "";
  }
}

function TimelineSymbolTooltipContent({ item }: { item: MatterTimelineItem }) {
  return (
    <TooltipContent
      className="bottom-full left-1/2 top-auto z-[200] mb-2 mt-0 w-max max-w-xs -translate-x-1/2 border-slate-900 bg-slate-900 p-3 text-white shadow-lg"
    >
      <div className="space-y-2 text-xs">
        <div className="font-semibold leading-snug">{item.title}</div>
        <div className="space-y-1 text-slate-200">
          <div className="flex justify-between gap-3">
            <span className="text-slate-400">Type</span>
            <span className="text-right capitalize">{item.typeLabel}</span>
          </div>
          {item.isMilestone ? (
            <div className="flex justify-between gap-3">
              <span className="text-slate-400">Date</span>
              <span className="text-right">{formatMatterTimelineDate(item.startMs)}</span>
            </div>
          ) : (
            <>
              <div className="flex justify-between gap-3">
                <span className="text-slate-400">Start</span>
                <span className="text-right">{formatMatterTimelineDate(item.startMs)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-400">End</span>
                <span className="text-right">{formatMatterTimelineDate(item.endMs)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-400">Duration</span>
                <span className="text-right">{formatMatterTimelineDuration(item.startMs, item.endMs)}</span>
              </div>
            </>
          )}
          {item.statusLabel ? (
            <div className="flex justify-between gap-3">
              <span className="text-slate-400">Status</span>
              <span className="text-right capitalize">{item.statusLabel}</span>
            </div>
          ) : null}
          {item.assignee ? (
            <div className="flex justify-between gap-3">
              <span className="text-slate-400">Assignee</span>
              <span className="text-right">{item.assignee}</span>
            </div>
          ) : null}
        </div>
      </div>
    </TooltipContent>
  );
}

function TimelineGanttSymbol({
  item,
  geometry,
  clickable,
  onItemClick,
}: {
  item: MatterTimelineItem;
  geometry: { leftPercent: number; widthPercent: number };
  clickable: boolean;
  onItemClick?: (item: MatterTimelineItem) => void;
}) {
  const handleClick = () => {
    if (clickable) onItemClick?.(item);
  };

  if (item.isMilestone) {
    return (
      <div
        className="absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${geometry.leftPercent}%` }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={!clickable}
              className={cn(clickable && "cursor-pointer")}
              onClick={handleClick}
            >
              <span
                className={cn(
                  "block h-3 w-3 rotate-45 rounded-[2px] shadow-sm ring-2 ring-background",
                  item.barClass,
                )}
              />
            </button>
          </TooltipTrigger>
          <TimelineSymbolTooltipContent item={item} />
        </Tooltip>
      </div>
    );
  }

  return (
    <div
      className="absolute top-1/2 z-20 -translate-y-1/2"
      style={{
        left: `${geometry.leftPercent}%`,
        width: `${geometry.widthPercent}%`,
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            disabled={!clickable}
            className={cn(
              "h-5 w-full min-w-[6px] rounded-full shadow-sm",
              item.barClass,
              clickable && "cursor-pointer hover:opacity-90",
            )}
            onClick={handleClick}
          />
        </TooltipTrigger>
        <TimelineSymbolTooltipContent item={item} />
      </Tooltip>
    </div>
  );
}

export function MatterTimelineGantt({
  caseRecord,
  tasks = [],
  events = [],
  onItemClick,
}: MatterTimelineGanttProps) {
  const [zoom, setZoom] = useState<MatterTimelineZoom>("fit");
  const [kindFilter, setKindFilter] = useState<"all" | MatterTimelineItemKind>("all");
  const [sortColumn, setSortColumn] = useState<TimelineSortColumn>("startMs");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const allItems = useMemo(
    () => buildMatterTimelineItems(caseRecord, tasks, events),
    [caseRecord, tasks, events],
  );

  const filteredItems = useMemo(() => {
    if (kindFilter === "all") return allItems;
    return allItems.filter((item) => item.kind === kindFilter);
  }, [allItems, kindFilter]);

  const sortedItems = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...filteredItems].sort((first, second) => {
      const getValue = (item: MatterTimelineItem) => {
        switch (sortColumn) {
          case "title":
            return item.title;
          case "typeLabel":
            return item.typeLabel;
          case "startMs":
            return item.startMs;
          case "endMs":
            return item.endMs;
          case "duration":
            return item.endMs - item.startMs;
          case "statusLabel":
            return item.statusLabel || "";
          default:
            return item.startMs;
        }
      };

      const firstValue = getValue(first);
      const secondValue = getValue(second);
      if (typeof firstValue === "number" && typeof secondValue === "number") {
        return (firstValue - secondValue) * direction;
      }
      return String(firstValue).localeCompare(String(secondValue)) * direction;
    });
  }, [filteredItems, sortColumn, sortDirection]);

  const chartRange = useMemo(() => {
    const baseRange = getMatterTimelineRange(allItems, caseRecord);
    if (zoom === "fit") return baseRange;

    const zoomDays = zoom === "90d" ? 90 : zoom === "180d" ? 180 : 365;
    const zoomMs = zoomDays * 86_400_000;
    const todayMs = Date.now();
    const endMs = Math.max(baseRange.endMs, todayMs);
    const startMs = endMs - zoomMs;
    return { startMs, endMs, rangeMs: endMs - startMs };
  }, [allItems, caseRecord, zoom]);

  const ticks = useMemo(
    () => buildMatterTimelineTicks(chartRange.startMs, chartRange.endMs),
    [chartRange.startMs, chartRange.endMs],
  );

  const chartWidthPx = useMemo(() => {
    const rangeDays = chartRange.rangeMs / 86_400_000;
    return Math.max(720, Math.round(rangeDays * 14));
  }, [chartRange.rangeMs]);

  const todayPercent = getTodayPositionPercent(chartRange.startMs, chartRange.rangeMs);

  const handleSort = (column: TimelineSortColumn) => {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(column);
    setSortDirection("asc");
  };

  const renderSortIcon = (column: TimelineSortColumn) => (
    <ArrowUpDown
      className={cn(
        "ml-1.5 h-3.5 w-3.5",
        sortColumn === column ? "text-primary" : "text-muted-foreground/50",
        sortColumn === column && sortDirection === "desc" && "rotate-180",
      )}
    />
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4" />
              Matter Timeline
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Tasks, events, deadlines, and milestones on a shared timeline.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={kindFilter} onValueChange={(value) => setKindFilter(value as "all" | MatterTimelineItemKind)}>
              <SelectTrigger className="h-9 w-[150px] rounded-full">
                <SelectValue placeholder="Filter type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="milestone">Milestones</SelectItem>
                <SelectItem value="stage">Stage changes</SelectItem>
                <SelectItem value="event">Events</SelectItem>
                <SelectItem value="task">Tasks</SelectItem>
              </SelectContent>
            </Select>
            <Select value={zoom} onValueChange={(value) => setZoom(value as MatterTimelineZoom)}>
              <SelectTrigger className="h-9 w-[140px] rounded-full">
                <SelectValue placeholder="Zoom" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fit">Fit all</SelectItem>
                <SelectItem value="90d">90 days</SelectItem>
                <SelectItem value="180d">6 months</SelectItem>
                <SelectItem value="365d">1 year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {sortedItems.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No timeline items match this filter yet. Add tasks or events to populate the chart.
            </div>
          ) : (
            <div className="rounded-lg border">
              <div className="flex">
                <div
                  className="shrink-0 border-r bg-muted/20"
                  style={{ width: LABEL_WIDTH }}
                >
                  <div
                    className="flex items-center border-b px-3 text-xs font-medium text-muted-foreground"
                    style={{ height: HEADER_HEIGHT }}
                  >
                    Item
                  </div>
                  {sortedItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center border-b px-3 text-sm last:border-b-0"
                      style={{ height: ROW_HEIGHT }}
                    >
                      <span className="truncate font-medium" title={item.title}>{item.title}</span>
                    </div>
                  ))}
                </div>

                <div className="min-w-0 flex-1 overflow-x-auto">
                  <div style={{ width: chartWidthPx, minWidth: "100%" }}>
                    <div
                      className="relative border-b bg-muted/10"
                      style={{ height: HEADER_HEIGHT }}
                    >
                      {ticks.map((tick) => (
                        <div
                          key={`${tick.ms}-${tick.label}`}
                          className="absolute top-0 flex h-full flex-col justify-end"
                          style={{ left: `${tick.positionPercent}%` }}
                        >
                          <div className="h-full w-px bg-border" />
                          <span className="absolute -translate-x-1/2 whitespace-nowrap px-1 text-[10px] text-muted-foreground">
                            {tick.label}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="relative">
                      {ticks.map((tick) => (
                        <div
                          key={`grid-${tick.ms}`}
                          className="absolute top-0 bottom-0 w-px bg-border/60"
                          style={{ left: `${tick.positionPercent}%` }}
                        />
                      ))}
                      {todayPercent !== null ? (
                        <div
                          className="absolute top-0 bottom-0 z-10 w-0.5 bg-[#2384CA]"
                          style={{ left: `${todayPercent}%` }}
                          aria-hidden="true"
                        />
                      ) : null}

                      {sortedItems.map((item) => {
                        const geometry = getTimelineBarGeometry(item, chartRange.startMs, chartRange.rangeMs);
                        const clickable = Boolean(onItemClick) && (item.sourceType === "task" || item.sourceType === "event");

                        return (
                          <div
                            key={item.id}
                            className="relative border-b last:border-b-0"
                            style={{ height: ROW_HEIGHT }}
                          >
                            <TimelineGanttSymbol
                              item={item}
                              geometry={geometry}
                              clickable={clickable}
                              onItemClick={onItemClick}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 border-t bg-muted/10 px-4 py-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#2384CA]" />
                  Tasks
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
                  Events
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rotate-45 rounded-[1px] bg-emerald-600" />
                  Milestones
                </span>
                {todayPercent !== null ? (
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-1 bg-[#2384CA]" />
                    Today
                  </span>
                ) : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Timeline Table</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">
                    <button type="button" className="flex items-center font-medium" onClick={() => handleSort("title")}>
                      Item
                      {renderSortIcon("title")}
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" className="flex items-center font-medium" onClick={() => handleSort("typeLabel")}>
                      Type
                      {renderSortIcon("typeLabel")}
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" className="flex items-center font-medium" onClick={() => handleSort("startMs")}>
                      Start
                      {renderSortIcon("startMs")}
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" className="flex items-center font-medium" onClick={() => handleSort("endMs")}>
                      End
                      {renderSortIcon("endMs")}
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" className="flex items-center font-medium" onClick={() => handleSort("duration")}>
                      Duration
                      {renderSortIcon("duration")}
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" className="flex items-center font-medium" onClick={() => handleSort("statusLabel")}>
                      Status
                      {renderSortIcon("statusLabel")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">Assignee</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No timeline items to display.
                    </td>
                  </tr>
                ) : (
                  sortedItems.map((item) => {
                    const clickable = Boolean(onItemClick) && (item.sourceType === "task" || item.sourceType === "event");
                    return (
                      <tr
                        key={item.id}
                        className={cn(
                          "border-b last:border-0",
                          clickable && "cursor-pointer hover:bg-muted/30",
                        )}
                        onClick={() => clickable && onItemClick?.(item)}
                      >
                        <td className="px-4 py-3 font-medium">{item.title}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={cn("capitalize", getKindBadgeClass(item.kind))}>
                            {item.typeLabel}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 shrink-0" />
                            {formatMatterTimelineDate(item.startMs)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatMatterTimelineDate(item.endMs)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatMatterTimelineDuration(item.startMs, item.endMs)}
                        </td>
                        <td className="px-4 py-3">
                          {item.statusLabel ? (
                            <Badge variant="outline" className="capitalize">
                              {item.statusLabel}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {item.assignee || "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
