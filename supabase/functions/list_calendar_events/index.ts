import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  getRequestContext,
  handleError,
  jsonResponse,
  readJsonBody,
} from "../_shared/case-utils.ts";

const GHL_CALENDAR_VERSION = "2021-04-15";
const START_DATE_FIELD_KEYS = ["startTime", "start_time", "start", "startDate", "startDateTime"];
const END_DATE_FIELD_KEYS = ["endTime", "end_time", "end", "endDate", "endDateTime"];

type CalendarMeta = {
  id: string;
  name?: string;
  color?: string;
};

type NormalizedCalendarEvent = {
  id: string;
  name: string;
  date: string | number;
  color?: string;
  calendarName?: string;
  calendarId: string;
  rawEvent: Record<string, unknown>;
};

function normalizeDateValue(value: unknown): string | number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return value;

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["iso", "dateTime", "date", "value", "timestamp", "startTime", "time"]) {
      const nested = normalizeDateValue(record[key]);
      if (nested != null) return nested;
    }

    if (typeof record.seconds === "number") {
      const millis = record.seconds * 1000;
      const nanos = typeof record.nanoseconds === "number" ? record.nanoseconds / 1_000_000 : 0;
      return millis + nanos;
    }

    if (typeof record._seconds === "number") {
      return record._seconds * 1000;
    }
  }

  return null;
}

function getFirstDateValue(source: Record<string, unknown>, keys: string[]) {
  const sources = [source, source?.appointment, source?.event].filter(Boolean) as Record<string, unknown>[];

  for (const candidate of sources) {
    for (const key of keys) {
      const normalized = normalizeDateValue(candidate[key]);
      if (normalized != null) return normalized;
    }
  }

  return "";
}

function buildCalendarEvent(
  eventDetails: Record<string, unknown>,
  calendarId: string,
  calendar?: CalendarMeta,
): NormalizedCalendarEvent | null {
  const id = typeof eventDetails.id === "string" ? eventDetails.id : "";
  if (!id) return null;

  const startTime = getFirstDateValue(eventDetails, START_DATE_FIELD_KEYS);
  const endTime = getFirstDateValue(eventDetails, END_DATE_FIELD_KEYS);
  const {
    startTime: _startTime,
    endTime: _endTime,
    start_time: _startSnake,
    end_time: _endSnake,
    start: _start,
    end: _end,
    startDate: _startDate,
    endDate: _endDate,
    startDateTime: _startDateTime,
    endDateTime: _endDateTime,
    ...rest
  } = eventDetails;

  return {
    id,
    name: String(eventDetails.title || eventDetails.contactName || "Booked Appointment"),
    date: startTime,
    color: typeof eventDetails.color === "string" ? eventDetails.color : calendar?.color,
    calendarName: calendar?.name,
    calendarId,
    rawEvent: {
      ...rest,
      ...(startTime !== "" ? { startTime } : {}),
      ...(endTime !== "" ? { endTime } : {}),
    },
  };
}

async function ghlCalendarRequest(apiKey: string, endpoint: string) {
  const baseUrl = Deno.env.get("GHL_API_BASE_URL") ?? "https://services.leadconnectorhq.com";
  const response = await fetch(new URL(endpoint, `${baseUrl.replace(/\/$/, "")}/`).toString(), {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Version": GHL_CALENDAR_VERSION,
    },
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message = parsed?.message || parsed?.error || text || `GHL request failed with status ${response.status}`;
    throw new Error(message);
  }

  return parsed;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await readJsonBody(req);
    const context = await getRequestContext(req, typeof body.locationId === "string" ? body.locationId : undefined);

    if (!context.location.encryptedApiKey || !context.location.ghlLocationId) {
      return jsonResponse({ error: "GHL is not configured for this location." }, 400);
    }

    const calendarIds = Array.isArray(body.calendarIds)
      ? body.calendarIds.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
      : [];
    const startTime = Number(body.startTime);
    const endTime = Number(body.endTime);

    if (calendarIds.length === 0) return jsonResponse({ error: "calendarIds is required" }, 400);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
      return jsonResponse({ error: "startTime and endTime are required" }, 400);
    }

    const calendarMeta = new Map<string, CalendarMeta>();
    if (Array.isArray(body.calendars)) {
      for (const calendar of body.calendars) {
        if (calendar && typeof calendar.id === "string") {
          calendarMeta.set(calendar.id, {
            id: calendar.id,
            name: typeof calendar.name === "string" ? calendar.name : undefined,
            color: typeof calendar.color === "string" ? calendar.color : undefined,
          });
        }
      }
    }

    const apiKey = context.location.encryptedApiKey;
    const ghlLocationId = context.location.ghlLocationId;
    const allEvents: NormalizedCalendarEvent[] = [];

    for (const calendarId of calendarIds) {
      try {
        const listResponse = await ghlCalendarRequest(
          apiKey,
          `/calendars/events?locationId=${encodeURIComponent(ghlLocationId)}&calendarId=${encodeURIComponent(calendarId)}&startTime=${startTime}&endTime=${endTime}`,
        );

        const listEvents = Array.isArray(listResponse?.events)
          ? listResponse.events.filter((event: Record<string, unknown>) => event?.deleted !== true)
          : [];

        const calendar = calendarMeta.get(calendarId);
        for (const event of listEvents) {
          const mapped = buildCalendarEvent(event, calendarId, calendar);
          if (mapped) allEvents.push(mapped);
        }
      } catch (error) {
        console.warn("Failed to fetch events for calendar", calendarId, error);
      }
    }

    return jsonResponse({ events: allEvents });
  } catch (error) {
    return handleError(error);
  }
});
