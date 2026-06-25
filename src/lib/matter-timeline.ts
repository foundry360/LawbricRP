import type { CaseRecord } from "@/lib/cases";
import { formatTaskStatusLabel } from "@/lib/tasks";

export type MatterTimelineItemKind = "milestone" | "task" | "event" | "stage";

export type MatterTimelineItem = {
  id: string;
  kind: MatterTimelineItemKind;
  sourceType: "case" | "task" | "event";
  sourceId: string;
  title: string;
  typeLabel: string;
  startMs: number;
  endMs: number;
  isMilestone: boolean;
  status?: string;
  statusLabel?: string;
  assignee?: string;
  colorClass: string;
  barClass: string;
};

const DAY_MS = 86_400_000;

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatLifecycleLabel(value?: string | null) {
  const text = String(value || "").trim();
  if (!text) return "No Stage";
  return text
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeInterval(start: Date, end: Date | null, options?: { minDurationMs?: number; openEndMs?: number }) {
  const minDurationMs = options?.minDurationMs ?? DAY_MS;
  const startMs = start.getTime();
  let endMs = end?.getTime() ?? options?.openEndMs ?? startMs;
  if (endMs < startMs) endMs = startMs;
  if (endMs - startMs < minDurationMs) endMs = startMs + minDurationMs;
  return { startMs, endMs };
}

function getTaskAssigneeName(task: any) {
  return (
    task.assigned_user?.full_name ||
    task.assigned_user?.email ||
    ""
  ).trim();
}

function getTaskBarClass(task: any) {
  const status = String(task.status || "").toLowerCase();
  if (status === "done" || status === "completed" || status === "cancelled") return "bg-slate-400";
  const dueAt = parseDate(task.due_at);
  if (dueAt && dueAt.getTime() < Date.now()) return "bg-red-500";
  if (status === "blocked") return "bg-amber-500";
  if (status === "in_progress") return "bg-[#2384CA]";
  return "bg-sky-500";
}

export function buildMatterTimelineItems(
  caseRecord: CaseRecord,
  tasks: any[] = [],
  events: any[] = [],
): MatterTimelineItem[] {
  const items: MatterTimelineItem[] = [];
  const todayMs = Date.now();

  const openedAt = parseDate(caseRecord.opened_at || caseRecord.created_at);
  if (openedAt) {
    const { startMs, endMs } = normalizeInterval(openedAt, openedAt);
    items.push({
      id: `case-opened-${caseRecord.id}`,
      kind: "milestone",
      sourceType: "case",
      sourceId: caseRecord.id,
      title: "Matter Opened",
      typeLabel: "Milestone",
      startMs,
      endMs,
      isMilestone: true,
      statusLabel: "Opened",
      colorClass: "bg-emerald-600",
      barClass: "bg-emerald-600",
    });
  }

  const statuteAt = parseDate(caseRecord.statute_of_limitations_at);
  if (statuteAt) {
    const { startMs, endMs } = normalizeInterval(statuteAt, statuteAt);
    items.push({
      id: `case-statute-${caseRecord.id}`,
      kind: "milestone",
      sourceType: "case",
      sourceId: caseRecord.id,
      title: "Filing Deadline",
      typeLabel: "Deadline",
      startMs,
      endMs,
      isMilestone: true,
      statusLabel: "Deadline",
      colorClass: "bg-red-600",
      barClass: "bg-red-600",
    });
  }

  const closedAt = parseDate(caseRecord.closed_at);
  if (closedAt) {
    const { startMs, endMs } = normalizeInterval(closedAt, closedAt);
    items.push({
      id: `case-closed-${caseRecord.id}`,
      kind: "milestone",
      sourceType: "case",
      sourceId: caseRecord.id,
      title: "Matter Closed",
      typeLabel: "Milestone",
      startMs,
      endMs,
      isMilestone: true,
      statusLabel: "Closed",
      colorClass: "bg-slate-600",
      barClass: "bg-slate-600",
    });
  }

  for (const event of events) {
    const eventType = String(event.event_type || "").toLowerCase();
    const startAt = parseDate(event.start_at || event.created_at);
    if (!startAt) continue;

    if (eventType === "stage_change") {
      const stageLabel = formatLifecycleLabel(event.metadata?.stage);
      const { startMs, endMs } = normalizeInterval(startAt, startAt);
      items.push({
        id: `event-stage-${event.id}`,
        kind: "stage",
        sourceType: "event",
        sourceId: event.id,
        title: `Stage: ${stageLabel}`,
        typeLabel: "Stage Change",
        startMs,
        endMs,
        isMilestone: true,
        statusLabel: stageLabel,
        colorClass: "bg-violet-600",
        barClass: "bg-violet-600",
      });
      continue;
    }

    const endAt = parseDate(event.end_at) || startAt;
    const { startMs, endMs } = normalizeInterval(startAt, endAt, { minDurationMs: 4 * 60 * 60 * 1000 });
    items.push({
      id: `event-${event.id}`,
      kind: "event",
      sourceType: "event",
      sourceId: event.id,
      title: event.title || "Event",
      typeLabel: event.event_type || "Event",
      startMs,
      endMs,
      isMilestone: false,
      status: event.status,
      statusLabel: String(event.status || "scheduled").replace(/_/g, " "),
      colorClass: "bg-violet-500",
      barClass: "bg-violet-500",
    });
  }

  for (const task of tasks) {
    const createdAt = parseDate(task.created_at);
    if (!createdAt) continue;

    const completedAt = parseDate(task.completed_at);
    const dueAt = parseDate(task.due_at);
    const status = String(task.status || "").toLowerCase();
    const isComplete = status === "done" || status === "completed" || status === "cancelled";

    let endDate: Date | null = completedAt || dueAt;
    if (!endDate && !isComplete) {
      endDate = new Date(todayMs);
    }
    if (!endDate) {
      endDate = createdAt;
    }

    const { startMs, endMs } = normalizeInterval(createdAt, endDate, {
      minDurationMs: isComplete && !completedAt && !dueAt ? DAY_MS : DAY_MS,
      openEndMs: todayMs,
    });

    items.push({
      id: `task-${task.id}`,
      kind: "task",
      sourceType: "task",
      sourceId: task.id,
      title: task.title || "Task",
      typeLabel: "Task",
      startMs,
      endMs,
      isMilestone: false,
      status: task.status,
      statusLabel: formatTaskStatusLabel(task.status),
      assignee: getTaskAssigneeName(task),
      colorClass: "bg-[#2384CA]",
      barClass: getTaskBarClass(task),
    });
  }

  return items.sort((first, second) => {
    if (first.startMs !== second.startMs) return first.startMs - second.startMs;
    return first.title.localeCompare(second.title);
  });
}

export function getMatterTimelineRange(items: MatterTimelineItem[], caseRecord: CaseRecord) {
  const openedAt = parseDate(caseRecord.opened_at || caseRecord.created_at);
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  let startMs = openedAt?.getTime() ?? Date.now();
  let endMs = today.getTime();

  for (const item of items) {
    startMs = Math.min(startMs, item.startMs);
    endMs = Math.max(endMs, item.endMs);
  }

  const padding = 7 * DAY_MS;
  startMs -= padding;
  endMs += padding;

  const rangeMs = Math.max(endMs - startMs, 14 * DAY_MS);
  return { startMs, endMs, rangeMs };
}

export function formatMatterTimelineDate(valueMs: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(valueMs));
}

export function formatMatterTimelineDuration(startMs: number, endMs: number) {
  const days = Math.max(1, Math.round((endMs - startMs) / DAY_MS));
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export type MatterTimelineTick = {
  ms: number;
  label: string;
  positionPercent: number;
};

export function buildMatterTimelineTicks(startMs: number, endMs: number): MatterTimelineTick[] {
  const rangeMs = Math.max(endMs - startMs, DAY_MS);
  const rangeDays = rangeMs / DAY_MS;
  const ticks: MatterTimelineTick[] = [];

  const addTick = (ms: number, label: string) => {
    if (ms < startMs || ms > endMs) return;
    ticks.push({
      ms,
      label,
      positionPercent: ((ms - startMs) / rangeMs) * 100,
    });
  };

  if (rangeDays <= 120) {
    const cursor = new Date(startMs);
    cursor.setHours(0, 0, 0, 0);
    while (cursor.getTime() <= endMs) {
      addTick(
        cursor.getTime(),
        new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(cursor),
      );
      cursor.setDate(cursor.getDate() + 7);
    }
  } else if (rangeDays <= 540) {
    const cursor = new Date(startMs);
    cursor.setDate(1);
    cursor.setHours(0, 0, 0, 0);
    while (cursor.getTime() <= endMs) {
      addTick(
        cursor.getTime(),
        new Intl.DateTimeFormat(undefined, { month: "short", year: "2-digit" }).format(cursor),
      );
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    const cursor = new Date(startMs);
    cursor.setDate(1);
    cursor.setHours(0, 0, 0, 0);
    const startQuarterMonth = Math.floor(cursor.getMonth() / 3) * 3;
    cursor.setMonth(startQuarterMonth);
    while (cursor.getTime() <= endMs) {
      addTick(
        cursor.getTime(),
        new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(cursor),
      );
      cursor.setMonth(cursor.getMonth() + 3);
    }
  }

  return ticks;
}

export function getTimelineBarGeometry(
  item: MatterTimelineItem,
  startMs: number,
  rangeMs: number,
) {
  const leftPercent = ((item.startMs - startMs) / rangeMs) * 100;
  const widthPercent = ((item.endMs - item.startMs) / rangeMs) * 100;
  return {
    leftPercent: Math.max(0, Math.min(100, leftPercent)),
    widthPercent: Math.max(item.isMilestone ? 0 : 0.4, Math.min(100 - leftPercent, widthPercent)),
  };
}

export function getTodayPositionPercent(startMs: number, rangeMs: number) {
  const todayMs = Date.now();
  if (todayMs < startMs || todayMs > startMs + rangeMs) return null;
  return ((todayMs - startMs) / rangeMs) * 100;
}
