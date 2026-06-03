import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Clock,
  Edit,
  FileText,
  Loader2,
  Mail,
  Phone,
  Plus,
  Trash2,
  User,
  UserCheck,
  UserPlus,
} from "lucide-react";
import {
  endOfMonth,
  format,
  isBefore,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiClient, createCalendar, getActiveGhlLocationId } from "@/lib/api";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { formatPhoneNumber } from "@/lib/phone";
import { cn } from "@/lib/utils";

const CALENDAR_ID = "oU7nwKUfwAL5rhpTmgbV";
const CALENDAR_COLORS = ["#2384CA", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f43f5e"];
const BOOKING_DURATION_OPTIONS = ["15", "30", "45", "60"];
const SELECTED_CALENDARS_STORAGE_PREFIX = "lawbric:selectedCalendars";
const DEFAULT_SCHEDULE_START_TIME = "08:00";
const DEFAULT_SCHEDULE_END_TIME = "18:00";

const CALENDAR_SCHEDULE_DAYS = [
  { day: "sunday", label: "Sun" },
  { day: "monday", label: "Mon" },
  { day: "tuesday", label: "Tue" },
  { day: "wednesday", label: "Wed" },
  { day: "thursday", label: "Thu" },
  { day: "friday", label: "Fri" },
  { day: "saturday", label: "Sat" },
] as const;

type CalendarScheduleDayName = (typeof CALENDAR_SCHEDULE_DAYS)[number]["day"];

type CalendarScheduleDay = {
  day: CalendarScheduleDayName;
  label: string;
  enabled: boolean;
  startTime: string;
  endTime: string;
};

type CalendarOption = {
  id: string;
  name: string;
  color: string;
  description?: string;
  meetingLocation?: string;
  slotDuration?: number;
  slotInterval?: number;
  assignedUserId?: string;
  assignedUserName?: string;
  scheduleDays?: CalendarScheduleDay[];
  teamMembers?: any[];
  rawCalendar?: any;
};

type CalendarEvent = {
  id: string;
  name: string;
  date: string;
  color?: string;
  calendarName?: string;
  calendarId?: string;
  rawEvent?: any;
};

type SlotMap = Record<string, { slots: string[] }>;

type CreateCalendarForm = {
  name: string;
  description: string;
  meetingLocation: string;
  slotDuration: string;
  color: string;
  assignedUserId: string;
  assignedUserName: string;
  scheduleDays: CalendarScheduleDay[];
};

function getDisplayName(entity: any) {
  return (
    entity?.name ||
    `${entity?.firstName || ""} ${entity?.lastName || ""}`.trim() ||
    entity?.email ||
    (entity?.id ? `User (${String(entity.id).slice(0, 4)})` : "Unknown")
  );
}

function formatContactName(contact: any) {
  return (
    `${contact?.firstName ? contact.firstName.charAt(0).toUpperCase() + contact.firstName.slice(1).toLowerCase() : ""} ${
      contact?.lastName ? contact.lastName.charAt(0).toUpperCase() + contact.lastName.slice(1).toLowerCase() : ""
    }`.trim() ||
    contact?.email ||
    "Unknown Contact"
  );
}

function getCalendarColor(index: number) {
  return CALENDAR_COLORS[index % CALENDAR_COLORS.length];
}

function getSelectedCalendarsStorageKey(locationId: string) {
  return `${SELECTED_CALENDARS_STORAGE_PREFIX}:${locationId}`;
}

function getStoredSelectedCalendarIds(locationId: string) {
  try {
    const storedValue = window.localStorage.getItem(getSelectedCalendarsStorageKey(locationId));
    const parsedValue = storedValue ? JSON.parse(storedValue) : [];

    return Array.isArray(parsedValue) ? parsedValue.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function persistSelectedCalendarIds(locationId: string, calendarIds: string[]) {
  if (!locationId || calendarIds.length === 0) return;

  window.localStorage.setItem(getSelectedCalendarsStorageKey(locationId), JSON.stringify(calendarIds));
}

function createDefaultScheduleDays(): CalendarScheduleDay[] {
  return CALENDAR_SCHEDULE_DAYS.map(({ day, label }) => ({
    day,
    label,
    enabled: day !== "sunday" && day !== "saturday",
    startTime: DEFAULT_SCHEDULE_START_TIME,
    endTime: DEFAULT_SCHEDULE_END_TIME,
  }));
}

function getTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function normalizeScheduleTime(value: unknown, fallback: string) {
  return typeof value === "string" && /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value) ? value.padStart(5, "0") : fallback;
}

function parseScheduleTime(time: string) {
  const [hour, minute] = time.split(":").map((value) => Number.parseInt(value, 10));

  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function getScheduleRules(scheduleDays: CalendarScheduleDay[]) {
  return scheduleDays
    .filter((scheduleDay) => scheduleDay.enabled)
    .map((scheduleDay) => ({
      type: "wday",
      day: scheduleDay.day,
      intervals: [
        {
          from: normalizeScheduleTime(scheduleDay.startTime, DEFAULT_SCHEDULE_START_TIME),
          to: normalizeScheduleTime(scheduleDay.endTime, DEFAULT_SCHEDULE_END_TIME),
        },
      ],
    }));
}

function getCalendarOpenHours(scheduleDays: CalendarScheduleDay[]) {
  return scheduleDays
    .filter((scheduleDay) => scheduleDay.enabled)
    .map((scheduleDay) => {
      const dayIndex = CALENDAR_SCHEDULE_DAYS.findIndex((dayOption) => dayOption.day === scheduleDay.day);
      const start = parseScheduleTime(normalizeScheduleTime(scheduleDay.startTime, DEFAULT_SCHEDULE_START_TIME));
      const end = parseScheduleTime(normalizeScheduleTime(scheduleDay.endTime, DEFAULT_SCHEDULE_END_TIME));

      return {
        daysOfTheWeek: [dayIndex],
        hours: [
          {
            openHour: start.hour,
            openMinute: start.minute,
            closeHour: end.hour,
            closeMinute: end.minute,
          },
        ],
      };
    });
}

function getInvalidScheduleDay(scheduleDays: CalendarScheduleDay[]) {
  return scheduleDays.find(
    (scheduleDay) =>
      scheduleDay.enabled &&
      normalizeScheduleTime(scheduleDay.startTime, DEFAULT_SCHEDULE_START_TIME) >=
        normalizeScheduleTime(scheduleDay.endTime, DEFAULT_SCHEDULE_END_TIME),
  );
}

function normalizeScheduleDays(schedule?: any, calendar?: any): CalendarScheduleDay[] {
  const scheduleDays = createDefaultScheduleDays().map((scheduleDay) => ({ ...scheduleDay, enabled: false }));
  const rules = Array.isArray(schedule?.rules) ? schedule.rules : [];

  if (rules.length > 0) {
    rules.forEach((rule: any) => {
      if (rule?.type !== "wday" || !rule.day) return;
      const day = scheduleDays.find((item) => item.day === String(rule.day).toLowerCase());
      const interval = Array.isArray(rule.intervals) ? rule.intervals[0] : null;
      if (!day || !interval) return;

      day.enabled = true;
      day.startTime = normalizeScheduleTime(interval.from, DEFAULT_SCHEDULE_START_TIME);
      day.endTime = normalizeScheduleTime(interval.to, DEFAULT_SCHEDULE_END_TIME);
    });

    return scheduleDays;
  }

  const openHours = Array.isArray(calendar?.openHours) ? calendar.openHours : [];
  if (openHours.length > 0) {
    openHours.forEach((openHourGroup: any) => {
      const firstHours = Array.isArray(openHourGroup.hours) ? openHourGroup.hours[0] : null;
      if (!firstHours || !Array.isArray(openHourGroup.daysOfTheWeek)) return;

      openHourGroup.daysOfTheWeek.forEach((dayIndex: number) => {
        const scheduleDay = scheduleDays[dayIndex];
        if (!scheduleDay) return;

        scheduleDay.enabled = true;
        scheduleDay.startTime = `${String(firstHours.openHour ?? 8).padStart(2, "0")}:${String(firstHours.openMinute ?? 0).padStart(2, "0")}`;
        scheduleDay.endTime = `${String(firstHours.closeHour ?? 18).padStart(2, "0")}:${String(firstHours.closeMinute ?? 0).padStart(2, "0")}`;
      });
    });

    return scheduleDays;
  }

  return createDefaultScheduleDays();
}

function getCalendarSlug(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${slug || "calendar"}-${Date.now().toString(36)}`;
}

function normalizeCalendar(calendar: any, index: number): CalendarOption {
  const slotDuration = Number.parseInt(String(calendar.slotDuration || calendar.slotInterval || 30), 10);
  const slotInterval = Number.parseInt(String(calendar.slotInterval || slotDuration || 30), 10);
  const meetingLocation = calendar.locationConfigurations?.[0]?.location || calendar.meetingLocation || "";
  const assignedMember = calendar.teamMembers?.find((member: any) => member.userId || member.id);
  const assignedUserId = assignedMember?.userId || assignedMember?.id || "";
  const assignedUserName = assignedMember ? getDisplayName({ ...assignedMember, id: assignedUserId }) : "";

  return {
    id: calendar.id,
    name: calendar.name || "Calendar",
    color: calendar.color || calendar.eventColor || getCalendarColor(index),
    description: calendar.description || "",
    meetingLocation,
    slotDuration: Number.isFinite(slotDuration) && slotDuration > 0 ? slotDuration : 30,
    slotInterval: Number.isFinite(slotInterval) && slotInterval > 0 ? slotInterval : 30,
    assignedUserId,
    assignedUserName,
    scheduleDays: normalizeScheduleDays(undefined, calendar),
    teamMembers: calendar.teamMembers || [],
    rawCalendar: calendar,
  };
}

async function fetchCalendarScheduleDays(calendarId: string) {
  try {
    const response: any = await apiClient(`/calendars/schedules/event-calendar/${encodeURIComponent(calendarId)}`, {
      ghlVersion: "2021-04-15",
    });

    return normalizeScheduleDays(response?.schedule || response);
  } catch {
    return undefined;
  }
}

async function syncCalendarSchedule(calendarId: string, scheduleDays: CalendarScheduleDay[], preferredMethod: "POST" | "PUT") {
  const body = JSON.stringify({
    rules: getScheduleRules(scheduleDays),
    timezone: getTimezone(),
  });

  try {
    await apiClient(`/calendars/schedules/event-calendar/${encodeURIComponent(calendarId)}`, {
      method: preferredMethod,
      ghlVersion: "2021-04-15",
      body,
    });
    return;
  } catch (error) {
    const fallbackMethod = preferredMethod === "POST" ? "PUT" : "POST";

    try {
      await apiClient(`/calendars/schedules/event-calendar/${encodeURIComponent(calendarId)}`, {
        method: fallbackMethod,
        ghlVersion: "2021-04-15",
        body,
      });
    } catch (fallbackError) {
      console.warn("Failed to sync calendar availability schedule", calendarId, fallbackError || error);
    }
  }
}

function getCalendarName(calendars: CalendarOption[], calendarId: string) {
  return calendars.find((calendar) => calendar.id === calendarId)?.name || "";
}

function getCalendarSlotDuration(calendars: CalendarOption[], calendarId: string) {
  return calendars.find((calendar) => calendar.id === calendarId)?.slotDuration || 30;
}

function getCalendarSlotInterval(calendars: CalendarOption[], calendarId: string) {
  return calendars.find((calendar) => calendar.id === calendarId)?.slotInterval || getCalendarSlotDuration(calendars, calendarId);
}

function isCalendarTeamMember(calendar: CalendarOption | undefined, userId: string) {
  if (!calendar || !userId) return false;

  return calendar.teamMembers?.some((member: any) => member.userId === userId || member.id === userId) ?? false;
}

function getUserDefaultCalendar(calendars: CalendarOption[], userId: string) {
  if (!userId) return undefined;

  return calendars.find((calendar) => isCalendarTeamMember(calendar, userId));
}

function getCalendarTeamMembers(userId: string, meetingLocation: string) {
  if (!userId || userId === "unassigned") return [];

  return [
    {
      userId,
      priority: 1,
      isPrimary: true,
      locationConfigurations: [
        {
          kind: "custom",
          location: meetingLocation || "To be determined",
        },
      ],
    },
  ];
}

function formatSlotRange(slot: string, durationMinutes = 30) {
  const start = new Date(slot);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  return `${format(start, "h:mm a")} to ${format(end, "h:mm a")}`;
}

function getFirstDateValue(source: any, keys: string[]) {
  for (const key of keys) {
    if (source?.[key]) return source[key];
  }

  return "";
}

function getEventStartTime(event: CalendarEvent) {
  const rawStart = getFirstDateValue(event.rawEvent, ["startTime", "start_time", "start", "startDate", "startDateTime"]);
  const start = new Date(rawStart || event.date);

  return Number.isNaN(start.getTime()) ? new Date(event.date) : start;
}

function getEventEndTime(event: CalendarEvent) {
  const start = getEventStartTime(event);
  const rawEnd = getFirstDateValue(event.rawEvent, ["endTime", "end_time", "end", "endDate", "endDateTime"]);
  const end = rawEnd ? new Date(rawEnd) : null;

  return end && end.getTime() > start.getTime() ? end : new Date(start.getTime() + 30 * 60 * 1000);
}

function getEventDurationMinutes(event: CalendarEvent) {
  const start = getEventStartTime(event);
  const end = getEventEndTime(event);

  return Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000));
}

function getAppointmentPayload(response: any) {
  return response?.appointment || response?.event || response?.data?.appointment || response?.data?.event || response?.data || response;
}

function getPositionedEvents(events: CalendarEvent[]) {
  const sortedEvents = [...events].sort((a, b) => getEventStartTime(a).getTime() - getEventStartTime(b).getTime());
  const positionedEvents: Array<{ event: CalendarEvent; column: number; columns: number }> = [];

  const positionCluster = (cluster: CalendarEvent[]) => {
    const columnEndTimes: number[] = [];
    const assignments = cluster.map((event) => {
      const start = getEventStartTime(event).getTime();
      const end = getEventEndTime(event).getTime();
      let column = columnEndTimes.findIndex((columnEndTime) => start >= columnEndTime);

      if (column === -1) {
        column = columnEndTimes.length;
      }

      columnEndTimes[column] = end;

      return { event, column };
    });

    const columns = Math.max(1, columnEndTimes.length);
    positionedEvents.push(...assignments.map((assignment) => ({ ...assignment, columns })));
  };

  let cluster: CalendarEvent[] = [];
  let clusterEnd = 0;

  sortedEvents.forEach((event) => {
    const start = getEventStartTime(event).getTime();
    const end = getEventEndTime(event).getTime();

    if (cluster.length > 0 && start >= clusterEnd) {
      positionCluster(cluster);
      cluster = [];
      clusterEnd = 0;
    }

    cluster.push(event);
    clusterEnd = Math.max(clusterEnd, end);
  });

  if (cluster.length > 0) {
    positionCluster(cluster);
  }

  return positionedEvents;
}

function filterSlotsByDuration(slots: string[], durationMinutes: number, intervalMinutes: number) {
  if (durationMinutes <= intervalMinutes) return slots;

  const slotTimes = new Set(slots.map((slot) => new Date(slot).getTime()));
  const intervalMs = intervalMinutes * 60 * 1000;
  const durationMs = durationMinutes * 60 * 1000;

  return slots.filter((slot) => {
    const startTime = new Date(slot).getTime();

    for (let offset = intervalMs; offset < durationMs; offset += intervalMs) {
      if (!slotTimes.has(startTime + offset)) return false;
    }

    return true;
  });
}

export function CalendarPage() {
  const [locationId, setLocationId] = useState("");
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [month, setMonth] = useState(new Date());
  const [slots, setSlots] = useState<SlotMap>({});
  const [loading, setLoading] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isEditingEvent, setIsEditingEvent] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [bookingDuration, setBookingDuration] = useState("30");
  const [bookingCalendarId, setBookingCalendarId] = useState("");
  const [bookingDate, setBookingDate] = useState<Date | undefined>(new Date());
  const [bookingSlots, setBookingSlots] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState<"month" | "week" | "day">("week");
  const { toast } = useToast();
  const [bookedEvents, setBookedEvents] = useState<CalendarEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isEventDetailsOpen, setIsEventDetailsOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    calendarId: "",
    date: new Date(),
    slot: "",
    duration: "30",
    contactId: "",
    assignedUserId: "unassigned",
    notes: "",
    appointmentStatus: "",
  });
  const [editSlots, setEditSlots] = useState<string[]>([]);
  const [savingEvent, setSavingEvent] = useState(false);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);

  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [isContactPopoverOpen, setIsContactPopoverOpen] = useState(false);
  const [isEditContactPopoverOpen, setIsEditContactPopoverOpen] = useState(false);

  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [isUserPopoverOpen, setIsUserPopoverOpen] = useState(false);
  const [isEditUserPopoverOpen, setIsEditUserPopoverOpen] = useState(false);

  const [selectedCalendars, setSelectedCalendars] = useState<string[]>([CALENDAR_ID]);
  const [availableCalendars, setAvailableCalendars] = useState<CalendarOption[]>([
    { id: CALENDAR_ID, name: "Main Calendar", color: "#2384CA", slotDuration: 30, slotInterval: 30 },
  ]);
  const [isCreateCalendarOpen, setIsCreateCalendarOpen] = useState(false);
  const [isCreatingCalendar, setIsCreatingCalendar] = useState(false);
  const [isUpdatingCalendar, setIsUpdatingCalendar] = useState(false);
  const [editingCalendarId, setEditingCalendarId] = useState<string | null>(null);
  const [createCalendarForm, setCreateCalendarForm] = useState<CreateCalendarForm>({
    name: "",
    description: "",
    meetingLocation: "",
    slotDuration: "30",
    color: getCalendarColor(1),
    assignedUserId: "unassigned",
    assignedUserName: "",
    scheduleDays: createDefaultScheduleDays(),
  });

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    notes: "",
  });

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(new Date()), 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scrollRef.current && (view === "week" || view === "day")) {
      const currentHour = new Date().getHours();
      const targetHour = Math.max(0, currentHour - 1);
      const rowHeight = view === "week" ? 80 : 100;
      scrollRef.current.scrollTop = targetHour * rowHeight;
    }
  }, [view]);

  const loadCalendars = async (
    locId: string,
    options: { preserveSelection?: boolean; selectedCalendarId?: string } = {},
  ) => {
    if (!locId) return;

    const res: any = await apiClient(`/calendars/?locationId=${locId}`);
    if (res?.calendars?.length > 0) {
      const calendars: CalendarOption[] = await Promise.all(
        res.calendars.map(async (calendar: any, index: number) => {
          const normalizedCalendar = normalizeCalendar(calendar, index);
          const scheduleDays = await fetchCalendarScheduleDays(normalizedCalendar.id);

          return scheduleDays ? { ...normalizedCalendar, scheduleDays } : normalizedCalendar;
        }),
      );
      setAvailableCalendars(calendars);
      setSelectedCalendars((current) => {
        if (options.selectedCalendarId && calendars.some((calendar) => calendar.id === options.selectedCalendarId)) {
          return [options.selectedCalendarId];
        }
        const validSelected = current.filter((calendarId) => calendars.some((calendar) => calendar.id === calendarId));
        if (options.preserveSelection && validSelected.length > 0) return validSelected;
        const storedSelected = getStoredSelectedCalendarIds(locId).filter((calendarId) =>
          calendars.some((calendar) => calendar.id === calendarId),
        );
        if (storedSelected.length > 0) return storedSelected;
        return [calendars[0].id];
      });
      setBookingCalendarId((current) => {
        if (options.selectedCalendarId && calendars.some((calendar) => calendar.id === options.selectedCalendarId)) {
          return options.selectedCalendarId;
        }

        return current && calendars.some((calendar) => calendar.id === current) ? current : calendars[0].id;
      });

      const extractedUsers = new Map<string, any>();
      calendars.forEach((calendar: CalendarOption) => {
        calendar.teamMembers?.forEach((member: any) => {
          const userId = member.userId || member.id;
          if (userId) extractedUsers.set(userId, { ...member, id: userId, name: getDisplayName({ ...member, id: userId }) });
        });
      });
      if (extractedUsers.size > 0) {
        setUsers((previous) => {
          const usersById = new Map(previous.map((user) => [user.id, user]));
          extractedUsers.forEach((user, userId) => {
            if (!usersById.has(userId)) usersById.set(userId, user);
          });
          return Array.from(usersById.values());
        });
      }
    }
  };

  useEffect(() => {
    const loadLocation = async () => {
      const locId = await getActiveGhlLocationId();
      setLocationId(locId);

      try {
        await loadCalendars(locId);
      } catch (error) {
        console.error("Failed to fetch available calendars", error);
      }
    };

    loadLocation();
  }, []);

  const fetchEvents = async () => {
    if (!locationId) return;

    try {
      const start = startOfMonth(month).getTime();
      const end = endOfMonth(month).getTime();
      const allEvents: CalendarEvent[] = [];

      for (const calendarId of selectedCalendars) {
        try {
          const res: any = await apiClient(
            `/calendars/events?locationId=${locationId}&calendarId=${calendarId}&startTime=${start}&endTime=${end}`,
            { ghlVersion: "2021-04-15" },
          );
          if (res?.events) {
            const calendar = availableCalendars.find((item) => item.id === calendarId);
            const hydratedEvents = await Promise.all(
              res.events.map(async (event: any) => {
                let eventDetails = event;

                try {
                  if (event.id) {
                    const detailResponse: any = await apiClient(
                      `/calendars/events/appointments/${encodeURIComponent(event.id)}`,
                      { ghlVersion: "2021-04-15" },
                    );
                    eventDetails = { ...event, ...getAppointmentPayload(detailResponse) };
                  }
                } catch (error) {
                  console.error("Failed to fetch appointment details", event.id, error);
                }

                const startTime = getFirstDateValue(eventDetails, ["startTime", "start_time", "start", "startDate", "startDateTime"]);
                const endTime = getFirstDateValue(eventDetails, ["endTime", "end_time", "end", "endDate", "endDateTime"]);

                return {
                  id: eventDetails.id || event.id,
                  name: eventDetails.title || eventDetails.contactName || event.title || event.contactName || "Booked Appointment",
                  date: startTime,
                  color: eventDetails.color || event.color || calendar?.color,
                  calendarName: calendar?.name,
                  calendarId,
                  rawEvent: { ...eventDetails, startTime, ...(endTime ? { endTime } : {}) },
                };
              }),
            );
            allEvents.push(...hydratedEvents);
          }
        } catch (error) {
          console.error("Failed to fetch events for calendar", calendarId, error);
        }
      }

      setBookedEvents(allEvents);
    } catch (error) {
      const message = getUserFriendlyErrorMessage(error, "Could not load calendar events. Please refresh and try again.");
      toast({ title: "Sync Error", description: message, variant: "destructive" });
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [month, locationId, selectedCalendars.join(",")]);

  const fetchSlots = async () => {
    setLoading(true);
    try {
      let start = startOfMonth(month);
      const end = endOfMonth(month);
      const today = startOfDay(new Date());

      if (isBefore(start, today)) start = today;
      if (isBefore(end, today)) {
        setSlots({});
        return;
      }

      const endLimit = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
      const finalEnd = isBefore(endLimit, end) ? endLimit : end;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const allSlots: SlotMap = {};

      for (const calendarId of selectedCalendars) {
        const data = await apiClient<any>(
          `/calendars/${encodeURIComponent(calendarId)}/free-slots?startDate=${start.getTime()}&endDate=${finalEnd.getTime()}&timezone=${encodeURIComponent(timezone)}`,
          { ghlVersion: "2021-04-15" },
        );
        Object.keys(data).forEach((dateStr) => {
          if (!allSlots[dateStr]) allSlots[dateStr] = { slots: [] };
          if (Array.isArray(data[dateStr]?.slots)) {
            allSlots[dateStr].slots = [...new Set([...allSlots[dateStr].slots, ...data[dateStr].slots])].sort();
          }
        });
      }

      setSlots(allSlots);
    } catch (error) {
      console.error("Failed to fetch slots", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSlots();
  }, [month, selectedCalendars.join(",")]);

  useEffect(() => {
    if (isSheetOpen || isEventDetailsOpen || isCreateCalendarOpen) {
      if (isSheetOpen) {
        setBookingDate(date || new Date());
        if (!bookingCalendarId && availableCalendars.length > 0) {
          const defaultCalendar = getUserDefaultCalendar(availableCalendars, selectedUserId) || availableCalendars[0];
          setBookingCalendarId(defaultCalendar.id);
          setBookingDuration(String(getCalendarSlotDuration(availableCalendars, defaultCalendar.id)));
        }
      }

      if (locationId && contacts.length === 0) {
        apiClient<any>(`/contacts/?locationId=${locationId}&limit=100`)
          .then((res) => setContacts(res?.contacts || []))
          .catch(console.error);
      }
      if (locationId && users.length === 0) {
        apiClient<any>(`/users/?locationId=${locationId}`)
          .then((res) => setUsers(res?.users || res?.data || (Array.isArray(res) ? res : [])))
          .catch(console.error);
      }
    }
  }, [isSheetOpen, isEventDetailsOpen, isCreateCalendarOpen, date, availableCalendars, locationId, contacts.length, users.length, bookingCalendarId, selectedUserId]);

  useEffect(() => {
    if (!locationId) return;
    apiClient<any>(`/users/?locationId=${locationId}`)
      .then((res) => {
        const fetchedUsers = res?.users || res?.data || (Array.isArray(res) ? res : []);
        if (fetchedUsers.length > 0) setUsers(fetchedUsers);
      })
      .catch((error) => {
        console.error("Failed to fetch users", error);
      });
  }, [locationId]);

  useEffect(() => {
    if (users.length === 0 && bookedEvents.length > 0) {
      const extractedUsers = new Map<string, any>();
      bookedEvents.forEach((event) => {
        event.rawEvent?.users?.forEach((user: any) => {
          if (user.id) extractedUsers.set(user.id, user);
        });
      });
      if (extractedUsers.size > 0) setUsers(Array.from(extractedUsers.values()));
    }
  }, [bookedEvents, users.length]);

  useEffect(() => {
    if (isSheetOpen && bookingCalendarId && bookingDate) {
      fetchDaySlots(bookingCalendarId, bookingDate).then(setBookingSlots).catch(console.error);
    }
  }, [isSheetOpen, bookingCalendarId, bookingDate]);

  useEffect(() => {
    if (isEventDetailsOpen && isEditingEvent && editFormData.calendarId && editFormData.date) {
      fetchDaySlots(editFormData.calendarId, editFormData.date, selectedEvent?.date).then(setEditSlots).catch(console.error);
    }
  }, [isEventDetailsOpen, isEditingEvent, editFormData.calendarId, editFormData.date, selectedEvent?.date]);

  const fetchDaySlots = async (calendarId: string, targetDate: Date, originalSlot?: string) => {
    let start = startOfDay(targetDate).getTime();
    const todayStart = startOfDay(new Date()).getTime();
    if (start < todayStart && startOfDay(targetDate).getTime() !== startOfDay(new Date(originalSlot || new Date())).getTime()) {
      start = todayStart;
    }
    const end = new Date(start + 24 * 60 * 60 * 1000).getTime();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const data = await apiClient<any>(
      `/calendars/${encodeURIComponent(calendarId)}/free-slots?startDate=${start}&endDate=${end}&timezone=${encodeURIComponent(timezone)}`,
      { ghlVersion: "2021-04-15" },
    );
    const dateStr = format(targetDate, "yyyy-MM-dd");
    const fetchedSlots = data[dateStr]?.slots?.sort() || [];
    return originalSlot && format(new Date(originalSlot), "yyyy-MM-dd") === dateStr && !fetchedSlots.includes(originalSlot)
      ? [...fetchedSlots, originalSlot].sort()
      : fetchedSlots;
  };

  const handleBookingCalendarChange = (calendarId: string) => {
    setBookingCalendarId(calendarId);
    setBookingDuration(String(getCalendarSlotDuration(availableCalendars, calendarId)));
    setSelectedSlot("");
  };

  const handleBookingDurationChange = (duration: string) => {
    setBookingDuration(duration);
    setSelectedSlot("");
  };

  const handleBookingOwnerChange = (userId: string) => {
    setSelectedUserId(userId);
    const defaultCalendar = getUserDefaultCalendar(availableCalendars, userId);

    if (defaultCalendar && defaultCalendar.id !== bookingCalendarId) {
      setBookingCalendarId(defaultCalendar.id);
      setBookingDuration(String(getCalendarSlotDuration(availableCalendars, defaultCalendar.id)));
      setSelectedSlot("");
    }
  };

  const updateSelectedCalendars = (calendarIds: string[]) => {
    if (calendarIds.length === 0) return;

    setSelectedCalendars(calendarIds);
    persistSelectedCalendarIds(locationId, calendarIds);
  };

  const handlePrev = () => {
    const next = new Date(month);
    if (view === "month") next.setMonth(next.getMonth() - 1);
    if (view === "week") next.setDate(next.getDate() - 7);
    if (view === "day") next.setDate(next.getDate() - 1);
    setMonth(next);
  };

  const handleNext = () => {
    const next = new Date(month);
    if (view === "month") next.setMonth(next.getMonth() + 1);
    if (view === "week") next.setDate(next.getDate() + 7);
    if (view === "day") next.setDate(next.getDate() + 1);
    setMonth(next);
  };

  const handleToday = () => {
    const today = new Date();
    setMonth(today);
    setDate(today);
  };

  const getEmptyCalendarForm = (colorIndex = availableCalendars.length): CreateCalendarForm => ({
    name: "",
    description: "",
    meetingLocation: "",
    slotDuration: "30",
    color: getCalendarColor(colorIndex),
    assignedUserId: "unassigned",
    assignedUserName: "",
    scheduleDays: createDefaultScheduleDays(),
  });

  const openCreateCalendarSheet = () => {
    setEditingCalendarId(null);
    setCreateCalendarForm(getEmptyCalendarForm());
    setIsCreateCalendarOpen(true);
  };

  const openEditCalendarSheet = (calendar: CalendarOption) => {
    setEditingCalendarId(calendar.id);
    setCreateCalendarForm({
      name: calendar.name,
      description: calendar.description || "",
      meetingLocation: calendar.meetingLocation || "",
      slotDuration: String(calendar.slotDuration || 30),
      color: calendar.color || getCalendarColor(availableCalendars.length),
      assignedUserId: calendar.assignedUserId || "unassigned",
      assignedUserName: calendar.assignedUserName || "",
      scheduleDays: calendar.scheduleDays || createDefaultScheduleDays(),
    });
    setIsCreateCalendarOpen(true);
  };

  const handleCreateCalendar = async (event: React.FormEvent) => {
    event.preventDefault();

    const name = createCalendarForm.name.trim();
    if (!name) {
      toast({ title: "Calendar Name Required", description: "Please enter a calendar name.", variant: "destructive" });
      return;
    }

    if (!locationId) {
      toast({
        title: "Location Not Ready",
        description: "Please wait for the GHL location to finish loading, then try again.",
        variant: "destructive",
      });
      return;
    }

    const slotDuration = Number.parseInt(createCalendarForm.slotDuration, 10) || 30;
    const slug = getCalendarSlug(name);
    const color = createCalendarForm.color || getCalendarColor(availableCalendars.length);
    const meetingLocation = createCalendarForm.meetingLocation.trim() || "To be determined";
    const teamMembers = getCalendarTeamMembers(createCalendarForm.assignedUserId, meetingLocation);
    const openHours = getCalendarOpenHours(createCalendarForm.scheduleDays);
    const invalidScheduleDay = getInvalidScheduleDay(createCalendarForm.scheduleDays);

    if (invalidScheduleDay) {
      toast({
        title: "Schedule Time Invalid",
        description: `${invalidScheduleDay.label} must end after it starts.`,
        variant: "destructive",
      });
      return;
    }

    setIsCreatingCalendar(true);
    try {
      const response: any = await createCalendar({
        isActive: true,
        locationId,
        name,
        description: createCalendarForm.description.trim(),
        slug,
        widgetSlug: slug,
        calendarType: teamMembers.length > 0 ? "personal" : "event",
        widgetType: "classic",
        eventTitle: "{{contact.name}}",
        eventColor: color,
        ...(teamMembers.length > 0 ? { teamMembers } : {}),
        openHours,
        locationConfigurations: [
          {
            kind: "custom",
            location: meetingLocation,
          },
        ],
        slotDuration,
        slotDurationUnit: "mins",
        slotInterval: slotDuration,
        slotIntervalUnit: "mins",
        slotBuffer: 0,
        slotBufferUnit: "mins",
        preBuffer: 0,
        preBufferUnit: "mins",
        appoinmentPerSlot: 1,
        appoinmentPerDay: 0,
        allowBookingAfter: 0,
        allowBookingAfterUnit: "days",
        allowBookingFor: 0,
        allowBookingForUnit: "days",
        enableRecurring: false,
        autoConfirm: true,
        allowReschedule: true,
        allowCancellation: true,
      });

      const calendar = {
        ...normalizeCalendar(response?.calendar || response, availableCalendars.length),
        scheduleDays: createCalendarForm.scheduleDays,
      };
      if (calendar.id) {
        await syncCalendarSchedule(calendar.id, createCalendarForm.scheduleDays, "POST");
        setAvailableCalendars((current) => [...current, calendar]);
        setSelectedCalendars([calendar.id]);
        persistSelectedCalendarIds(locationId, [calendar.id]);
        setBookingCalendarId(calendar.id);
      }

      toast({ title: "Calendar Created", description: `${name} has been created in GHL.` });
      setCreateCalendarForm({
        name: "",
        description: "",
        meetingLocation: "",
        slotDuration: "30",
        color: getCalendarColor(availableCalendars.length + 1),
        assignedUserId: "unassigned",
        assignedUserName: "",
        scheduleDays: createDefaultScheduleDays(),
      });
      setIsCreateCalendarOpen(false);
      await loadCalendars(locationId, { preserveSelection: true, selectedCalendarId: calendar.id });
    } catch (error) {
      const message = getUserFriendlyErrorMessage(error, "Could not create the calendar in GHL. Please try again.");
      toast({ title: "Calendar Not Created", description: message, variant: "destructive" });
    } finally {
      setIsCreatingCalendar(false);
    }
  };

  const handleUpdateCalendar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingCalendarId) return;

    const name = createCalendarForm.name.trim();
    if (!name) {
      toast({ title: "Calendar Name Required", description: "Please enter a calendar name.", variant: "destructive" });
      return;
    }

    const slotDuration = Number.parseInt(createCalendarForm.slotDuration, 10) || 30;
    const color = createCalendarForm.color || getCalendarColor(availableCalendars.length);
    const meetingLocation = createCalendarForm.meetingLocation.trim() || "To be determined";
    const teamMembers = getCalendarTeamMembers(createCalendarForm.assignedUserId, meetingLocation);
    const openHours = getCalendarOpenHours(createCalendarForm.scheduleDays);
    const invalidScheduleDay = getInvalidScheduleDay(createCalendarForm.scheduleDays);

    if (invalidScheduleDay) {
      toast({
        title: "Schedule Time Invalid",
        description: `${invalidScheduleDay.label} must end after it starts.`,
        variant: "destructive",
      });
      return;
    }

    setIsUpdatingCalendar(true);
    try {
      await apiClient(`/calendars/${encodeURIComponent(editingCalendarId)}`, {
        method: "PUT",
        ghlVersion: "2021-04-15",
        body: JSON.stringify({
          name,
          description: createCalendarForm.description.trim(),
          eventColor: color,
          ...(teamMembers.length > 0 ? { teamMembers } : {}),
          openHours,
          locationConfigurations: [
            {
              kind: "custom",
              location: meetingLocation,
            },
          ],
          slotDuration,
          slotDurationUnit: "mins",
          slotInterval: slotDuration,
          slotIntervalUnit: "mins",
        }),
      });

      toast({ title: "Calendar Updated", description: `${name} has been updated in GHL.` });
      setAvailableCalendars((current) =>
        current.map((calendar) =>
          calendar.id === editingCalendarId
            ? {
                ...calendar,
                name,
                description: createCalendarForm.description.trim(),
                meetingLocation,
                color,
                slotDuration,
                slotInterval: slotDuration,
                assignedUserId: createCalendarForm.assignedUserId === "unassigned" ? "" : createCalendarForm.assignedUserId,
                teamMembers,
                scheduleDays: createCalendarForm.scheduleDays,
              }
            : calendar,
        ),
      );
      setBookedEvents((current) =>
        current.map((eventItem) =>
          eventItem.calendarId === editingCalendarId
            ? { ...eventItem, color, calendarName: name }
            : eventItem,
        ),
      );
      if (createCalendarForm.assignedUserId !== "unassigned" && selectedUserId === createCalendarForm.assignedUserId) {
        setBookingCalendarId(editingCalendarId);
      }
      await syncCalendarSchedule(editingCalendarId, createCalendarForm.scheduleDays, "PUT");
      setIsCreateCalendarOpen(false);
      setEditingCalendarId(null);
      await loadCalendars(locationId, { preserveSelection: true, selectedCalendarId: editingCalendarId });
    } catch (error) {
      const message = getUserFriendlyErrorMessage(error, "Could not update the calendar in GHL. Please try again.");
      toast({ title: "Calendar Not Updated", description: message, variant: "destructive" });
    } finally {
      setIsUpdatingCalendar(false);
    }
  };

  const handleBookingSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!selectedSlot) {
      toast({ title: "Time Slot Required", description: "Please select a time slot.", variant: "destructive" });
      return;
    }
    if (!selectedContactId) {
      toast({ title: "Contact Required", description: "Please select a contact.", variant: "destructive" });
      return;
    }
    if (!locationId) {
      toast({
        title: "Location Not Ready",
        description: "Please wait for the GHL location to finish loading, then try again.",
        variant: "destructive",
      });
      return;
    }

    const contact = contacts.find((item) => item.id === selectedContactId);
    const calendarId = bookingCalendarId || selectedCalendars[0] || CALENDAR_ID;
    const calendar = availableCalendars.find((item) => item.id === calendarId);
    const durationMinutes = Number.parseInt(bookingDuration, 10) || getCalendarSlotDuration(availableCalendars, calendarId);
    const endTime = new Date(new Date(selectedSlot).getTime() + durationMinutes * 60 * 1000).toISOString();
    const bookableAssignedUserId = isCalendarTeamMember(calendar, selectedUserId) ? selectedUserId : "";
    setSubmitting(true);

    try {
      const data: any = await apiClient("/calendars/events/appointments", {
        method: "POST",
        body: JSON.stringify({
          calendarId,
          locationId,
          contactId: selectedContactId,
          startTime: selectedSlot,
          endTime,
          title: contact ? formatContactName(contact) : "New Appointment",
          description: formData.notes || undefined,
          appointmentStatus: "confirmed",
          ignoreDateRange: true,
          ignoreFreeSlotValidation: true,
          toNotify: false,
          ...(bookableAssignedUserId ? { assignedUserId: bookableAssignedUserId } : {}),
        }),
        ghlVersion: "2021-04-15",
      });

      toast({ title: "Success", description: "Appointment booked successfully." });
      setBookedEvents((previous) => [
        ...previous,
        {
          id: data?.appointment?.id || data?.event?.id || data?.id || data?.appointmentId || crypto.randomUUID(),
          name: contact ? formatContactName(contact) : "New Appointment",
          date: selectedSlot,
          calendarId,
          rawEvent: {
            ...(data?.appointment || data?.event || {}),
            contactId: data?.contactId || selectedContactId,
            contactEmail: contact?.email,
            contactPhone: formatPhoneNumber(contact?.phone, ""),
            assignedUserId: bookableAssignedUserId || undefined,
            notes: formData.notes,
            startTime: selectedSlot,
            endTime,
            appointmentStatus: "confirmed",
          },
        },
      ]);
      setIsSheetOpen(false);
      setFormData({ firstName: "", lastName: "", email: "", phone: "", notes: "" });
      setSelectedContactId("");
      setSelectedSlot("");
      setSelectedUserId("");
      window.setTimeout(fetchSlots, 2000);
    } catch (error) {
      const message = getUserFriendlyErrorMessage(error, "Could not book the appointment. Please try again.");
      toast({ title: "Appointment Not Booked", description: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent) return;
    if (!window.confirm("Are you sure you want to delete this appointment?")) return;

    setIsDeletingEvent(true);
    try {
      await apiClient(`/calendars/events/${selectedEvent.id}`, { method: "DELETE" });
      toast({ title: "Success", description: "Appointment deleted successfully." });
      setIsEventDetailsOpen(false);
      setBookedEvents((previous) => previous.filter((event) => event.id !== selectedEvent.id));
      window.setTimeout(fetchSlots, 3000);
    } catch (error) {
      const message = getUserFriendlyErrorMessage(error, "Could not delete the appointment. Please try again.");
      toast({ title: "Appointment Not Deleted", description: message, variant: "destructive" });
    } finally {
      setIsDeletingEvent(false);
    }
  };

  const handleEditEvent = async () => {
    if (!selectedEvent) return;
    if (!editFormData.slot) {
      toast({ title: "Time Slot Required", description: "Please select a time slot.", variant: "destructive" });
      return;
    }

    setSavingEvent(true);
    try {
      const startTime = editFormData.slot;
      const durationMinutes = Number.parseInt(editFormData.duration, 10) || getEventDurationMinutes(selectedEvent);
      const endTime = new Date(new Date(startTime).getTime() + durationMinutes * 60 * 1000).toISOString();
      const calendarId = editFormData.calendarId || selectedEvent.calendarId;

      const payload: any = {
        calendarId,
        locationId,
        contactId: editFormData.contactId || selectedEvent.rawEvent?.contactId,
        startTime,
        endTime,
        title: selectedEvent.rawEvent?.title || selectedEvent.name,
        ignoreDateRange: true,
        ignoreFreeSlotValidation: true,
        notes: editFormData.notes,
        appointmentStatus: editFormData.appointmentStatus || selectedEvent.rawEvent?.appointmentStatus,
      };
      if (editFormData.assignedUserId !== "unassigned") payload.assignedUserId = editFormData.assignedUserId;

      const updatedEventRes: any = await apiClient(`/calendars/events/appointments/${selectedEvent.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      const newId = updatedEventRes?.event?.id || updatedEventRes?.id || updatedEventRes?.appointmentId || selectedEvent.id;
      const calendar = availableCalendars.find((item) => item.id === calendarId);

      toast({ title: "Success", description: "Appointment updated successfully." });
      setIsEventDetailsOpen(false);
      window.setTimeout(() => setIsEditingEvent(false), 300);
      setBookedEvents((previous) =>
        previous.map((event) =>
          event.id === selectedEvent.id
            ? {
                ...event,
                id: newId,
                date: startTime,
                calendarId: calendar?.id || event.calendarId,
                color: calendar?.color || event.color,
                calendarName: calendar?.name || event.calendarName,
                name: payload.title,
                rawEvent: { ...event.rawEvent, startTime, endTime, notes: payload.notes, appointmentStatus: payload.appointmentStatus },
              }
            : event,
        ),
      );
      window.setTimeout(() => {
        fetchSlots();
        fetchEvents();
      }, 3000);
    } catch (error) {
      const message = getUserFriendlyErrorMessage(error, "Could not update the appointment. Please try again.");
      toast({ title: "Appointment Not Updated", description: message, variant: "destructive" });
    } finally {
      setSavingEvent(false);
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-64px)] w-full max-w-[1600px] flex-col overflow-hidden px-0 py-4">
      <CreateCalendarSheet
        open={isCreateCalendarOpen}
        onOpenChange={(open) => {
          setIsCreateCalendarOpen(open);
          if (!open) setEditingCalendarId(null);
        }}
        formData={createCalendarForm}
        setFormData={setCreateCalendarForm}
        users={users}
        submitting={isCreatingCalendar || isUpdatingCalendar}
        mode={editingCalendarId ? "edit" : "create"}
        onSubmit={editingCalendarId ? handleUpdateCalendar : handleCreateCalendar}
      />

      <BookingSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        availableCalendars={availableCalendars}
        bookingCalendarId={bookingCalendarId}
        setBookingCalendarId={handleBookingCalendarChange}
        bookingDate={bookingDate}
        setBookingDate={setBookingDate}
        bookingSlots={bookingSlots}
        selectedSlot={selectedSlot}
        setSelectedSlot={setSelectedSlot}
        bookingDuration={bookingDuration}
        setBookingDuration={handleBookingDurationChange}
        contacts={contacts}
        selectedContactId={selectedContactId}
        setSelectedContactId={setSelectedContactId}
        isContactPopoverOpen={isContactPopoverOpen}
        setIsContactPopoverOpen={setIsContactPopoverOpen}
        users={users}
        selectedUserId={selectedUserId}
        setSelectedUserId={handleBookingOwnerChange}
        isUserPopoverOpen={isUserPopoverOpen}
        setIsUserPopoverOpen={setIsUserPopoverOpen}
        notes={formData.notes}
        setNotes={(notes) => setFormData({ ...formData, notes })}
        submitting={submitting}
        onSubmit={handleBookingSubmit}
      />

      <EventDetailsSheet
        open={isEventDetailsOpen}
        onOpenChange={setIsEventDetailsOpen}
        selectedEvent={selectedEvent}
        isEditingEvent={isEditingEvent}
        setIsEditingEvent={setIsEditingEvent}
        editFormData={editFormData}
        setEditFormData={setEditFormData}
        editSlots={editSlots}
        availableCalendars={availableCalendars}
        contacts={contacts}
        users={users}
        isEditContactPopoverOpen={isEditContactPopoverOpen}
        setIsEditContactPopoverOpen={setIsEditContactPopoverOpen}
        isEditUserPopoverOpen={isEditUserPopoverOpen}
        setIsEditUserPopoverOpen={setIsEditUserPopoverOpen}
        savingEvent={savingEvent}
        isDeletingEvent={isDeletingEvent}
        onEdit={handleEditEvent}
        onDelete={handleDeleteEvent}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 border-t md:grid-cols-[220px_1fr] lg:grid-cols-[240px_1fr]">
        <aside className="flex min-h-0 flex-col border-r">
          <div className="shrink-0 pb-2 pl-0 pr-6 pt-4">
            <h1 className="text-2xl font-bold tracking-tight">Calendars</h1>
          </div>
          <div className="flex shrink-0 justify-start border-b py-2 pl-0 pr-6">
            <div className="-mb-10 origin-top-left scale-[0.85]">
              <CalendarComponent
                mode="single"
                selected={date}
                onSelect={setDate}
                month={month}
                onMonthChange={setMonth}
                disabled={(day) => isBefore(startOfDay(day), startOfDay(new Date()))}
                className="border-0 p-0 shadow-none"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 py-4 pl-0 pr-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Calendars</h3>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={openCreateCalendarSheet}
                aria-label="Add calendar"
                title="Add calendar"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-0.5">
              <div className="mb-1 flex h-7 items-center gap-1.5 border-b border-border/50 pb-2">
                <Checkbox
                  id="cal-all"
                  checked={selectedCalendars.length === availableCalendars.length && availableCalendars.length > 0}
                  onCheckedChange={(checked) => {
                    updateSelectedCalendars(checked ? availableCalendars.map((calendar) => calendar.id) : [availableCalendars[0]?.id].filter(Boolean));
                  }}
                />
                <Label htmlFor="cal-all" className="flex-1 cursor-pointer truncate text-sm font-medium leading-none">
                  All Calendars
                </Label>
              </div>
              <div className="space-y-0.5 pt-2">
                {availableCalendars.map((calendar) => (
                  <div key={calendar.id} className="group flex h-6 items-center gap-1.5">
                    <Checkbox
                      id={`cal-${calendar.id}`}
                      checked={selectedCalendars.includes(calendar.id)}
                      onCheckedChange={(checked) => {
                        if (checked) updateSelectedCalendars([...selectedCalendars, calendar.id]);
                        else if (selectedCalendars.length > 1) updateSelectedCalendars(selectedCalendars.filter((id) => id !== calendar.id));
                      }}
                    />
                    <Label htmlFor={`cal-${calendar.id}`} className="min-w-0 flex-1 cursor-pointer truncate text-sm leading-none">
                      {calendar.name}
                    </Label>
                    <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: calendar.color }} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0 p-0 opacity-70 hover:opacity-100"
                      onClick={() => openEditCalendarSheet(calendar)}
                      aria-label={`Edit ${calendar.name}`}
                      title={`Edit ${calendar.name}`}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <main className="flex min-h-0 flex-col bg-muted/10">
          <div className="flex shrink-0 flex-row items-center justify-between border-b bg-background p-4">
            <h2 className="text-xl font-semibold tracking-tight">
              {view === "month" && format(month, "MMMM yyyy")}
              {view === "week" && `Week of ${format(startOfWeek(month), "MMM d, yyyy")}`}
              {view === "day" && format(month, "MMMM d, yyyy")}
            </h2>
            <div className="mt-0 flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Button variant="outline" size="icon" onClick={handlePrev}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={handleToday}>
                  Today
                </Button>
                <Button variant="outline" size="icon" onClick={handleNext}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1 rounded-md bg-muted p-1">
                  {(["day", "week", "month"] as const).map((item) => (
                    <Button
                      key={item}
                      variant={view === item ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setView(item)}
                      className="h-7 px-3 text-xs shadow-none"
                    >
                      {item[0].toUpperCase() + item.slice(1)}
                    </Button>
                  ))}
                </div>
                <Button
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => setIsSheetOpen(true)}
                >
                  <Plus className="h-5 w-5" />
                  <span className="sr-only">New Appointment</span>
                </Button>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden p-0 sm:p-6 sm:pt-6">
            <div className="flex h-full flex-col overflow-hidden rounded-md border bg-background shadow-sm">
              {loading && (
                <div className="absolute right-8 top-24 z-10 flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm shadow">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading slots
                </div>
              )}
              {view === "month" && <MonthView month={month} date={date} setDate={setDate} setMonth={setMonth} events={bookedEvents} openEvent={(event: CalendarEvent) => { setSelectedEvent(event); setIsEventDetailsOpen(true); }} />}
              {view === "week" && <WeekView month={month} date={date} setDate={setDate} events={bookedEvents} currentTime={currentTime} scrollRef={scrollRef} openEvent={(event: CalendarEvent) => { setSelectedEvent(event); setIsEventDetailsOpen(true); }} />}
              {view === "day" && <DayView month={month} events={bookedEvents} currentTime={currentTime} scrollRef={scrollRef} openEvent={(event: CalendarEvent) => { setSelectedEvent(event); setIsEventDetailsOpen(true); }} />}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

type BookingSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableCalendars: CalendarOption[];
  bookingCalendarId: string;
  setBookingCalendarId: (id: string) => void;
  bookingDate?: Date;
  setBookingDate: (date: Date | undefined) => void;
  bookingSlots: string[];
  selectedSlot: string;
  setSelectedSlot: (slot: string) => void;
  bookingDuration: string;
  setBookingDuration: (duration: string) => void;
  contacts: any[];
  selectedContactId: string;
  setSelectedContactId: (id: string) => void;
  isContactPopoverOpen: boolean;
  setIsContactPopoverOpen: (open: boolean) => void;
  users: any[];
  selectedUserId: string;
  setSelectedUserId: (id: string) => void;
  isUserPopoverOpen: boolean;
  setIsUserPopoverOpen: (open: boolean) => void;
  notes: string;
  setNotes: (notes: string) => void;
  submitting: boolean;
  onSubmit: (event: React.FormEvent) => void;
};

type CreateCalendarSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: CreateCalendarForm;
  setFormData: (formData: CreateCalendarForm) => void;
  users: any[];
  submitting: boolean;
  mode: "create" | "edit";
  onSubmit: (event: React.FormEvent) => void;
};

function CreateCalendarSheet({
  open,
  onOpenChange,
  formData,
  setFormData,
  users,
  submitting,
  mode,
  onSubmit,
}: CreateCalendarSheetProps) {
  const isEditMode = mode === "edit";
  const selectedAssignedUser = users.find((user) => user.id === formData.assignedUserId);
  const selectedAssignedUserName =
    formData.assignedUserId === "unassigned"
      ? "Unassigned"
      : selectedAssignedUser
        ? getDisplayName(selectedAssignedUser)
        : formData.assignedUserName || "Selected user";
  const shouldShowAssignedUserFallback =
    formData.assignedUserId !== "unassigned" && !users.some((user) => user.id === formData.assignedUserId);
  const updateScheduleDay = (day: CalendarScheduleDayName, updates: Partial<CalendarScheduleDay>) => {
    setFormData({
      ...formData,
      scheduleDays: formData.scheduleDays.map((scheduleDay) =>
        scheduleDay.day === day ? { ...scheduleDay, ...updates } : scheduleDay,
      ),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto p-6 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEditMode ? "Edit Calendar" : "Add Calendar"}</SheetTitle>
          <SheetDescription>
            {isEditMode ? "Update this calendar in GHL." : "Create a new calendar in GHL for this location."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="calendar-name">Calendar Name</Label>
            <Input
              id="calendar-name"
              value={formData.name}
              onChange={(event) => setFormData({ ...formData, name: event.target.value })}
              placeholder="Initial Consultations"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Select User</Label>
            <Select
              value={formData.assignedUserId}
              onValueChange={(assignedUserId) => {
                const user = users.find((item) => item.id === assignedUserId);
                setFormData({
                  ...formData,
                  assignedUserId,
                  assignedUserName: assignedUserId === "unassigned" ? "" : user ? getDisplayName(user) : formData.assignedUserName,
                });
              }}
            >
              <SelectTrigger>
                <span className={cn(!formData.assignedUserId && "text-muted-foreground")}>
                  {selectedAssignedUserName || "Select user"}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {shouldShowAssignedUserFallback && (
                  <SelectItem value={formData.assignedUserId}>{selectedAssignedUserName}</SelectItem>
                )}
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {getDisplayName(user)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Assigning a user saves them as the team member for this GHL calendar.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="calendar-description">Description</Label>
            <Textarea
              id="calendar-description"
              value={formData.description}
              onChange={(event) => setFormData({ ...formData, description: event.target.value })}
              placeholder="Optional internal description"
              rows={3}
            />
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="space-y-1">
              <Label>Schedule</Label>
              <p className="text-xs text-muted-foreground">{getTimezone()}</p>
            </div>
            <div className="space-y-2">
              {formData.scheduleDays.map((scheduleDay) => (
                <div key={scheduleDay.day} className="grid grid-cols-[72px_1fr_1fr] items-center gap-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`schedule-${scheduleDay.day}`}
                      checked={scheduleDay.enabled}
                      onCheckedChange={(checked) => updateScheduleDay(scheduleDay.day, { enabled: checked })}
                    />
                    <Label htmlFor={`schedule-${scheduleDay.day}`} className="cursor-pointer text-sm font-normal">
                      {scheduleDay.label}
                    </Label>
                  </div>
                  <Input
                    type="time"
                    value={scheduleDay.startTime}
                    disabled={!scheduleDay.enabled}
                    onChange={(event) => updateScheduleDay(scheduleDay.day, { startTime: event.target.value })}
                  />
                  <Input
                    type="time"
                    value={scheduleDay.endTime}
                    disabled={!scheduleDay.enabled}
                    onChange={(event) => updateScheduleDay(scheduleDay.day, { endTime: event.target.value })}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="calendar-location">Meeting Location</Label>
            <Input
              id="calendar-location"
              value={formData.meetingLocation}
              onChange={(event) => setFormData({ ...formData, meetingLocation: event.target.value })}
              placeholder="Phone call, Zoom, office, etc."
            />
          </div>

          <div className="space-y-2">
            <Label>Calendar Color</Label>
            <div className="flex flex-wrap gap-2">
              {CALENDAR_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Select calendar color ${color}`}
                  className={cn(
                    "h-6 w-6 rounded-full border-2 transition-transform hover:scale-105",
                    formData.color === color ? "border-foreground ring-2 ring-ring ring-offset-2" : "border-transparent",
                  )}
                  style={{ backgroundColor: color }}
                  onClick={() => setFormData({ ...formData, color })}
                />
              ))}
              <Input
                type="color"
                value={formData.color}
                onChange={(event) => setFormData({ ...formData, color: event.target.value })}
                className="h-6 w-10 cursor-pointer p-0.5"
                aria-label="Custom calendar color"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Slot Duration</Label>
            <Select
              value={formData.slotDuration}
              onValueChange={(slotDuration) => setFormData({ ...formData, slotDuration })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="45">45 minutes</SelectItem>
                <SelectItem value="60">60 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isEditMode ? "Save Calendar" : "Create Calendar"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function BookingSheet(props: BookingSheetProps) {
  const slotDuration = Number.parseInt(props.bookingDuration, 10) || getCalendarSlotDuration(props.availableCalendars, props.bookingCalendarId);
  const slotInterval = getCalendarSlotInterval(props.availableCalendars, props.bookingCalendarId);
  const availableSlots = filterSlotsByDuration(props.bookingSlots, slotDuration, slotInterval);

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className="overflow-y-auto p-6 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Book Appointment</SheetTitle>
          <SheetDescription className="sr-only">Book a new appointment</SheetDescription>
        </SheetHeader>
        <form onSubmit={props.onSubmit} className="mt-6 space-y-4">
          <div className="space-y-4 border-b pb-4">
            <div className="space-y-2">
              <Label>Calendar</Label>
              <Select value={props.bookingCalendarId} onValueChange={props.setBookingCalendarId} required>
                <SelectTrigger>
                  <span className={cn(!props.bookingCalendarId && "text-muted-foreground")}>
                    {getCalendarName(props.availableCalendars, props.bookingCalendarId) || "Select a calendar"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {props.availableCalendars.map((calendar) => (
                    <SelectItem key={calendar.id} value={calendar.id}>
                      {calendar.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  required
                  min={format(new Date(), "yyyy-MM-dd")}
                  value={props.bookingDate ? format(props.bookingDate, "yyyy-MM-dd") : ""}
                  onChange={(event) => {
                    if (event.target.value) props.setBookingDate(new Date(`${event.target.value}T12:00:00`));
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Duration</Label>
                <Select value={props.bookingDuration} onValueChange={props.setBookingDuration} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    {BOOKING_DURATION_OPTIONS.map((duration) => (
                      <SelectItem key={duration} value={duration}>
                        {duration} minutes
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Time Slot</Label>
              <Select value={props.selectedSlot} onValueChange={props.setSelectedSlot} required>
                <SelectTrigger>
                  <span className={cn(!props.selectedSlot && "text-muted-foreground")}>
                    {props.selectedSlot ? formatSlotRange(props.selectedSlot, slotDuration) : "Select time"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {availableSlots.length > 0 ? (
                    availableSlots.map((slot, index) => (
                      <SelectItem key={index} value={slot}>
                        {format(new Date(slot), "h:mm a")}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>
                      No slots available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <ContactAndOwnerFields
            contacts={props.contacts}
            selectedContactId={props.selectedContactId}
            setSelectedContactId={props.setSelectedContactId}
            isContactPopoverOpen={props.isContactPopoverOpen}
            setIsContactPopoverOpen={props.setIsContactPopoverOpen}
            users={props.users}
            selectedUserId={props.selectedUserId}
            setSelectedUserId={props.setSelectedUserId}
            isUserPopoverOpen={props.isUserPopoverOpen}
            setIsUserPopoverOpen={props.setIsUserPopoverOpen}
          />

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" placeholder="Appointment notes..." value={props.notes} onChange={(event) => props.setNotes(event.target.value)} />
          </div>

          <Button type="submit" className="w-full" disabled={props.submitting}>
            {props.submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {props.submitting ? "Booking..." : "Book Appointment"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function ContactAndOwnerFields({
  contacts,
  selectedContactId,
  setSelectedContactId,
  isContactPopoverOpen,
  setIsContactPopoverOpen,
  users,
  selectedUserId,
  setSelectedUserId,
  isUserPopoverOpen,
  setIsUserPopoverOpen,
}: {
  contacts: any[];
  selectedContactId: string;
  setSelectedContactId: (id: string) => void;
  isContactPopoverOpen: boolean;
  setIsContactPopoverOpen: (open: boolean) => void;
  users: any[];
  selectedUserId: string;
  setSelectedUserId: (id: string) => void;
  isUserPopoverOpen: boolean;
  setIsUserPopoverOpen: (open: boolean) => void;
}) {
  return (
    <div className="space-y-4 pt-2">
      <h4 className="text-sm font-medium text-muted-foreground">Contact Details</h4>
      <div className="space-y-2">
        <Label>Select Contact</Label>
        <Popover open={isContactPopoverOpen} onOpenChange={setIsContactPopoverOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
              {selectedContactId ? formatContactName(contacts.find((contact) => contact.id === selectedContactId)) : "Select contact..."}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[380px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search contacts..." />
              <CommandList>
                <CommandEmpty>No contact found.</CommandEmpty>
                <CommandGroup>
                  {contacts.map((contact) => (
                    <CommandItem
                      key={contact.id}
                      value={`${contact.firstName || ""} ${contact.lastName || ""} ${contact.email || ""}`}
                      onSelect={() => {
                        setSelectedContactId(contact.id);
                        setIsContactPopoverOpen(false);
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", selectedContactId === contact.id ? "opacity-100" : "opacity-0")} />
                      {formatContactName(contact)}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <div className="space-y-2">
        <Label>Appointment Owner</Label>
        <Popover open={isUserPopoverOpen} onOpenChange={setIsUserPopoverOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
              {selectedUserId ? getDisplayName(users.find((user) => user.id === selectedUserId)) : "Select a user"}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search users..." />
              <CommandList>
                <CommandEmpty>{users.length === 0 ? "Loading users..." : "No user found."}</CommandEmpty>
                <CommandGroup>
                  {users.map((user) => (
                    <CommandItem
                      key={user.id}
                      value={`${getDisplayName(user)} ${user.id}`}
                      onSelect={() => {
                        setSelectedUserId(user.id);
                        setIsUserPopoverOpen(false);
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", selectedUserId === user.id ? "opacity-100" : "opacity-0")} />
                      {getDisplayName(user)}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function EventDetailsSheet({
  open,
  onOpenChange,
  selectedEvent,
  isEditingEvent,
  setIsEditingEvent,
  editFormData,
  setEditFormData,
  editSlots,
  availableCalendars,
  contacts,
  users,
  isEditContactPopoverOpen,
  setIsEditContactPopoverOpen,
  isEditUserPopoverOpen,
  setIsEditUserPopoverOpen,
  savingEvent,
  isDeletingEvent,
  onEdit,
  onDelete,
}: any) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto p-6 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Appointment Details</SheetTitle>
          <SheetDescription className="sr-only">View appointment details</SheetDescription>
        </SheetHeader>
        {selectedEvent && (
          <div className="mt-6 space-y-6">
            <div className="flex items-center justify-between space-y-1 border-b pb-4">
              <h3 className="text-xl font-semibold">{selectedEvent.name}</h3>
              {!isEditingEvent && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10"
                    onClick={() => {
                      setEditFormData({
                        calendarId: selectedEvent.calendarId || "",
                        date: getEventStartTime(selectedEvent),
                        slot: getEventStartTime(selectedEvent).toISOString(),
                        duration: String(getEventDurationMinutes(selectedEvent)),
                        contactId: selectedEvent.rawEvent?.contactId || "",
                        assignedUserId: selectedEvent.rawEvent?.assignedUserId || "unassigned",
                        notes: selectedEvent.rawEvent?.notes || "",
                        appointmentStatus: selectedEvent.rawEvent?.appointmentStatus || "",
                      });
                      setIsEditingEvent(true);
                    }}
                  >
                    <Edit className="h-6 w-6 text-muted-foreground hover:text-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-10 w-10" onClick={onDelete} disabled={isDeletingEvent}>
                    {isDeletingEvent ? <Loader2 className="h-6 w-6 animate-spin" /> : <Trash2 className="h-6 w-6 text-muted-foreground hover:text-foreground" />}
                  </Button>
                </div>
              )}
            </div>

            {isEditingEvent ? (
              <EditEventForm
                editFormData={editFormData}
                setEditFormData={setEditFormData}
                editSlots={editSlots}
                availableCalendars={availableCalendars}
                contacts={contacts}
                users={users}
                isEditContactPopoverOpen={isEditContactPopoverOpen}
                setIsEditContactPopoverOpen={setIsEditContactPopoverOpen}
                isEditUserPopoverOpen={isEditUserPopoverOpen}
                setIsEditUserPopoverOpen={setIsEditUserPopoverOpen}
                savingEvent={savingEvent}
                onCancel={() => setIsEditingEvent(false)}
                onSave={onEdit}
              />
            ) : (
              <EventDetails selectedEvent={selectedEvent} users={users} />
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EditEventForm(props: any) {
  const slotDuration = Number.parseInt(props.editFormData.duration, 10) || getCalendarSlotDuration(props.availableCalendars, props.editFormData.calendarId);
  const slotInterval = getCalendarSlotInterval(props.availableCalendars, props.editFormData.calendarId);
  const availableSlots = filterSlotsByDuration(props.editSlots, slotDuration, slotInterval);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Calendar</Label>
        <Select value={props.editFormData.calendarId} onValueChange={(value) => props.setEditFormData({ ...props.editFormData, calendarId: value })} required>
          <SelectTrigger>
            <span className={cn(!props.editFormData.calendarId && "text-muted-foreground")}>
              {getCalendarName(props.availableCalendars, props.editFormData.calendarId) || "Select a calendar"}
            </span>
          </SelectTrigger>
          <SelectContent>
            {props.availableCalendars.map((calendar: CalendarOption) => (
              <SelectItem key={calendar.id} value={calendar.id}>
                {calendar.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Date</Label>
          <Input
            type="date"
            required
            value={props.editFormData.date ? format(props.editFormData.date, "yyyy-MM-dd") : ""}
            onChange={(event) => event.target.value && props.setEditFormData({ ...props.editFormData, date: new Date(`${event.target.value}T12:00:00`), slot: "" })}
          />
        </div>
        <div className="space-y-2">
          <Label>Duration</Label>
          <Select value={props.editFormData.duration} onValueChange={(duration) => props.setEditFormData({ ...props.editFormData, duration, slot: "" })} required>
            <SelectTrigger>
              <SelectValue placeholder="Select duration" />
            </SelectTrigger>
            <SelectContent>
              {BOOKING_DURATION_OPTIONS.map((duration) => (
                <SelectItem key={duration} value={duration}>
                  {duration} minutes
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Time Slot</Label>
        <Select value={props.editFormData.slot} onValueChange={(value) => props.setEditFormData({ ...props.editFormData, slot: value })} required>
          <SelectTrigger>
            <span className={cn(!props.editFormData.slot && "text-muted-foreground")}>
              {props.editFormData.slot ? formatSlotRange(props.editFormData.slot, slotDuration) : "Select time"}
            </span>
          </SelectTrigger>
          <SelectContent>
            {availableSlots.length > 0 ? (
              availableSlots.map((slot: string, index: number) => (
                <SelectItem key={index} value={slot}>
                  {format(new Date(slot), "h:mm a")}
                </SelectItem>
              ))
            ) : (
              <SelectItem value="none" disabled>
                No slots available
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
      <ContactAndOwnerFields
        contacts={props.contacts}
        selectedContactId={props.editFormData.contactId}
        setSelectedContactId={(contactId) => props.setEditFormData({ ...props.editFormData, contactId })}
        isContactPopoverOpen={props.isEditContactPopoverOpen}
        setIsContactPopoverOpen={props.setIsEditContactPopoverOpen}
        users={props.users}
        selectedUserId={props.editFormData.assignedUserId}
        setSelectedUserId={(assignedUserId) => props.setEditFormData({ ...props.editFormData, assignedUserId })}
        isUserPopoverOpen={props.isEditUserPopoverOpen}
        setIsUserPopoverOpen={props.setIsEditUserPopoverOpen}
      />
      <div className="space-y-2">
        <Label>Status</Label>
        <Select value={props.editFormData.appointmentStatus} onValueChange={(value) => props.setEditFormData({ ...props.editFormData, appointmentStatus: value })}>
          <SelectTrigger>
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="showed">Showed</SelectItem>
            <SelectItem value="noshow">No Show</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea value={props.editFormData.notes} onChange={(event) => props.setEditFormData({ ...props.editFormData, notes: event.target.value })} rows={4} />
      </div>
      <div className="flex gap-3 pt-4">
        <Button variant="outline" className="flex-1" onClick={props.onCancel} disabled={props.savingEvent}>
          Cancel
        </Button>
        <Button className="flex-1" onClick={props.onSave} disabled={props.savingEvent}>
          {props.savingEvent && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}

function EventDetails({ selectedEvent, users }: { selectedEvent: CalendarEvent; users: any[] }) {
  const startTime = getEventStartTime(selectedEvent);
  const endTime = getEventEndTime(selectedEvent);

  return (
    <div className="space-y-4">
      <DetailRow icon={Clock} label="Appointment Time">
        {format(startTime, "EEE, MMM d, yyyy 'at' h:mm a")} - {format(endTime, "h:mm a")}
      </DetailRow>
      {selectedEvent.rawEvent?.appointmentStatus && (
        <DetailRow icon={Check} label="Status">
          <span className="capitalize">{selectedEvent.rawEvent.appointmentStatus === "noshow" ? "No Show" : selectedEvent.rawEvent.appointmentStatus}</span>
        </DetailRow>
      )}
      <DetailRow icon={User} label="Name">
        {selectedEvent.rawEvent?.contactId ? (
          <Link to={`/contact/${selectedEvent.rawEvent.contactId}`} className="text-blue-600 hover:underline">
            {selectedEvent.name}
          </Link>
        ) : (
          selectedEvent.name
        )}
      </DetailRow>
      <DetailRow icon={CalendarIcon} label="Calendar">
        {selectedEvent.calendarName || "Main Calendar"}
      </DetailRow>
      {selectedEvent.rawEvent?.contactEmail && <DetailRow icon={Mail} label="Email">{selectedEvent.rawEvent.contactEmail}</DetailRow>}
      {selectedEvent.rawEvent?.contactPhone && (
        <DetailRow icon={Phone} label="Phone">
          {formatPhoneNumber(selectedEvent.rawEvent.contactPhone)}
        </DetailRow>
      )}
      <DetailRow icon={UserCheck} label="Appointment Owner">
        {selectedEvent.rawEvent?.assignedUserId
          ? getDisplayName(users.find((user) => user.id === selectedEvent.rawEvent?.assignedUserId) || { id: selectedEvent.rawEvent.assignedUserId })
          : "Unassigned"}
      </DetailRow>
      {selectedEvent.rawEvent?.users?.length > 0 && (
        <DetailRow icon={UserPlus} label="Booked By">
          {selectedEvent.rawEvent.users.map((user: any) => user.name || user.email || user.id).join(", ")}
        </DetailRow>
      )}
      {selectedEvent.rawEvent?.notes && <DetailRow icon={FileText} label="Notes">{selectedEvent.rawEvent.notes}</DetailRow>}
    </div>
  );
}

function DetailRow({ icon: Icon, label, children }: { icon: typeof Clock; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 border-b pb-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon className="h-5 w-5 text-primary" />
        {label}
      </div>
      <div className="flex items-center pl-7 text-sm text-foreground">{children}</div>
    </div>
  );
}

function EventTooltipContent({ event }: { event: CalendarEvent }) {
  const start = getEventStartTime(event);
  const end = getEventEndTime(event);

  return (
    <TooltipContent className="z-[100] border bg-popover p-3 text-popover-foreground shadow-md">
      <div className="font-semibold">{event.name}</div>
      <div className="mt-1 text-xs text-muted-foreground">{format(start, "EEEE, MMMM d, yyyy")}</div>
      <div className="text-xs text-muted-foreground">
        {format(start, "h:mm a")} to {format(end, "h:mm a")}
      </div>
    </TooltipContent>
  );
}

function getEventTooltipText(event: CalendarEvent) {
  const start = getEventStartTime(event);
  const end = getEventEndTime(event);

  return `${event.name}\n${format(start, "EEEE, MMMM d, yyyy")}\n${format(start, "h:mm a")} to ${format(end, "h:mm a")}`;
}

function EventPill({
  event,
  onClick,
  compact = false,
  className,
  style,
  neutral = false,
}: {
  event: CalendarEvent;
  onClick: (event: CalendarEvent, ev: React.MouseEvent) => void;
  compact?: boolean;
  className?: string;
  style?: React.CSSProperties;
  neutral?: boolean;
}) {
  const cancelled = event.rawEvent?.appointmentStatus === "cancelled";
  const colorStyle = !neutral && !cancelled && event.color ? { backgroundColor: event.color, color: "#ffffff" } : {};

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex cursor-pointer items-center truncate border-2 font-normal leading-none",
            compact ? "rounded-sm px-1.5 py-0.5 text-[10px] sm:text-xs" : "rounded p-1.5 text-sm",
            neutral
              ? "border-transparent bg-transparent text-foreground"
              : cancelled
                ? "border-primary bg-background text-primary line-through"
                : "border-background bg-primary text-primary-foreground",
            className,
          )}
          style={{ ...colorStyle, ...style }}
          onClick={(ev) => onClick(event, ev)}
        >
          {neutral ? <span className="mr-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: event.color || "#2384CA" }} /> : null}
          <span className="truncate">{event.name} - {format(getEventStartTime(event), "h:mm a")}</span>
        </div>
      </TooltipTrigger>
      <EventTooltipContent event={event} />
    </Tooltip>
  );
}

function MonthView({ month, date, setDate, setMonth, events, openEvent }: any) {
  const visibleEventLimit = 3;
  const [overflowDay, setOverflowDay] = useState<{ day: Date; events: CalendarEvent[] } | null>(null);

  return (
    <>
      <div className="grid grid-cols-7 border-b bg-muted/50">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="p-3 text-center text-sm font-medium">
            {day}
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 auto-rows-[minmax(100px,1fr)]">
        {Array.from({ length: 35 }).map((_, index) => {
          const firstDayOfMonth = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
          const day = new Date(month.getFullYear(), month.getMonth(), index - firstDayOfMonth + 1);
          const isCurrentMonth = day.getMonth() === month.getMonth();
          const isSelected = date && day.toDateString() === date.toDateString();
          const dayEvents = events
            .filter((event: CalendarEvent) => getEventStartTime(event).toDateString() === day.toDateString())
            .sort((a: CalendarEvent, b: CalendarEvent) => getEventStartTime(a).getTime() - getEventStartTime(b).getTime());
          const visibleEvents = dayEvents.slice(0, visibleEventLimit);
          const hiddenEvents = dayEvents.slice(visibleEventLimit);

          return (
            <div
              key={index}
              className={cn(
                "cursor-pointer border-b border-r p-2 transition-colors",
                !isCurrentMonth ? "bg-muted/20 text-muted-foreground/50" : "hover:bg-muted/30",
                isSelected && "bg-primary/5",
              )}
              onClick={() => {
                setDate(day);
                if (!isCurrentMonth) setMonth(day);
              }}
            >
              <div className={cn("flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium", isSelected && "bg-primary text-primary-foreground")}>
                {day.getDate()}
              </div>
              <div className="mt-1 flex flex-col gap-0 overflow-hidden">
                {visibleEvents.map((event: CalendarEvent, eventIndex: number) => (
                  <EventPill
                    key={event.id}
                    event={event}
                    compact
                    neutral
                    className={cn(eventIndex > 0 && "-mt-0.5")}
                    onClick={(item, ev) => { ev.stopPropagation(); openEvent(item); }}
                  />
                ))}
                {hiddenEvents.length > 0 ? (
                  <button
                    type="button"
                    className="border-2 border-transparent bg-transparent px-1.5 py-0 text-left text-[9px] font-normal leading-none text-primary hover:underline sm:text-[10px]"
                    onClick={(event) => {
                      event.stopPropagation();
                      setOverflowDay({ day, events: hiddenEvents });
                    }}
                  >
                    +{hiddenEvents.length} more
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <Dialog open={Boolean(overflowDay)} onOpenChange={(open) => !open && setOverflowDay(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{overflowDay ? format(overflowDay.day, "EEEE, MMMM d") : "More appointments"}</DialogTitle>
            <DialogDescription>Additional appointments for this day.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-0">
            {overflowDay?.events.map((event, index) => (
              <EventPill
                key={event.id}
                event={event}
                neutral
                className={cn("rounded-none", index > 0 && "-mt-0.5")}
                onClick={(item, ev) => {
                  ev.stopPropagation();
                  setOverflowDay(null);
                  openEvent(item);
                }}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function WeekView({ month, date, setDate, events, currentTime, scrollRef, openEvent }: any) {
  const weekStart = startOfWeek(month);
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex border-b bg-muted/50">
        <div className="w-16 shrink-0 border-r bg-blue-50/50" />
        <div className="grid flex-1 grid-cols-7">
          {Array.from({ length: 7 }).map((_, index) => {
            const day = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index);
            const isSelected = date && day.toDateString() === date.toDateString();
            return (
              <div key={index} className={cn("cursor-pointer border-r p-2 text-center transition-colors last:border-r-0 hover:bg-muted/30", isSelected && "bg-primary text-primary-foreground")} onClick={() => setDate(day)}>
                <div className="mx-auto inline-flex items-center justify-center px-3 py-1 text-sm font-medium">{format(day, "EEE, MMM d")}</div>
              </div>
            );
          })}
        </div>
      </div>
      <TimeGrid
        mode="week"
        month={month}
        selectedDate={date}
        events={events}
        currentTime={currentTime}
        scrollRef={scrollRef}
        openEvent={openEvent}
      />
    </div>
  );
}

function DayView({ month, events, currentTime, scrollRef, openEvent }: any) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-center border-b bg-muted/50 p-4">
        <div className="text-xl font-bold text-primary">{format(month, "EEEE, MMMM d, yyyy")}</div>
      </div>
      <TimeGrid mode="day" month={month} selectedDate={month} events={events} currentTime={currentTime} scrollRef={scrollRef} openEvent={openEvent} />
    </div>
  );
}

function TimeGrid({ mode, month, selectedDate, events, currentTime, scrollRef, openEvent }: any) {
  const isWeek = mode === "week";
  const rowHeight = isWeek ? 80 : 100;
  const leftWidth = isWeek ? "left-16" : "left-20";
  const labelWidth = isWeek ? "w-16" : "w-20";
  const gridHeight = 24 * rowHeight;
  const [hoveredEvent, setHoveredEvent] = useState<{ event: CalendarEvent; x: number; y: number } | null>(null);
  const days = isWeek
    ? Array.from({ length: 7 }, (_, index) => {
        const weekStart = startOfWeek(month);
        return new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index);
      })
    : [month];

  const showCurrentLine = isWeek
    ? currentTime >= startOfWeek(month) && currentTime < new Date(startOfWeek(month).getTime() + 7 * 24 * 60 * 60 * 1000)
    : currentTime.toDateString() === month.toDateString();

  return (
    <div ref={scrollRef} className="no-scrollbar relative flex-1 overflow-y-auto bg-card">
      <div className="relative" style={{ height: `${gridHeight}px` }}>
        {showCurrentLine && (
          <div className={cn("pointer-events-none absolute right-0 z-10 border-t-2 border-blue-400/60", leftWidth)} style={{ top: `${(currentTime.getHours() + currentTime.getMinutes() / 60) * rowHeight}px` }}>
            <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-blue-400 shadow-sm" />
          </div>
        )}
        {Array.from({ length: 24 }).map((_, hour) => (
          <div key={hour} className="relative flex border-b" style={{ height: `${rowHeight}px` }}>
            <div className={cn("absolute right-0 top-1/2 pointer-events-none z-0 border-t border-dashed border-muted-foreground/20", leftWidth)} />
            <div className={cn("relative z-10 shrink-0 border-r bg-blue-50/50 p-2 text-right text-xs text-muted-foreground", labelWidth, !isWeek && "text-sm font-medium")}>
              {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
            </div>
            <div className={cn("grid flex-1 bg-card", isWeek ? "grid-cols-7" : "grid-cols-1")}>
              {days.map((day: Date, index: number) => {
                const isSelectedDay = isWeek && selectedDate && day.toDateString() === selectedDate.toDateString();

                return (
                  <div
                    key={index}
                    className="border-r transition-colors last:border-r-0 hover:bg-muted/10"
                    style={isSelectedDay ? { backgroundColor: "#F8FAFC" } : undefined}
                  />
                );
              })}
            </div>
          </div>
        ))}
        <div className={cn("pointer-events-none absolute inset-y-0 right-0 grid", leftWidth, isWeek ? "grid-cols-7" : "grid-cols-1")}>
          {days.map((day: Date, index: number) => (
            <div key={index} className="relative border-r last:border-r-0">
              {getPositionedEvents(
                events.filter((event: CalendarEvent) => getEventStartTime(event).toDateString() === day.toDateString()),
              ).map(({ event, column, columns }) => {
                  const start = getEventStartTime(event);
                  const top = (start.getHours() + start.getMinutes() / 60) * rowHeight;
                  const height = Math.max(24, (getEventDurationMinutes(event) / 60) * rowHeight);
                  const laneWidth = 100 / columns;
                  const laneLeft = column * laneWidth;
                  const cancelled = event.rawEvent?.appointmentStatus === "cancelled";
                  const eventStyle = cancelled
                    ? {}
                    : {
                        backgroundColor: event.color || "#2384CA",
                        color: "#ffffff",
                      };

                  return (
                    <div
                      key={event.id}
                      className={cn(
                        "pointer-events-auto absolute z-20 cursor-pointer overflow-hidden rounded border-2 border-background p-1 font-medium shadow-sm",
                        isWeek ? "text-[10px] sm:text-xs" : "text-sm",
                        cancelled ? "border-primary bg-background text-primary line-through" : "border-primary/20 bg-primary text-primary-foreground",
                      )}
                      style={{
                        top: `${top}px`,
                        left: `${laneLeft}%`,
                        width: `${laneWidth}%`,
                        height: `${height}px`,
                        ...eventStyle,
                      }}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        openEvent(event);
                      }}
                      onMouseEnter={(ev) => setHoveredEvent({ event, x: ev.clientX, y: ev.clientY })}
                      onMouseMove={(ev) => setHoveredEvent({ event, x: ev.clientX, y: ev.clientY })}
                      onMouseLeave={() => setHoveredEvent(null)}
                    >
                      <div className="truncate">
                        {event.name} - {format(start, "h:mm a")}
                      </div>
                      {height >= 44 ? (
                        <div className="mt-0.5 truncate text-[10px] opacity-90">
                          {format(start, "h:mm a")} to {format(getEventEndTime(event), "h:mm a")}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
        {hoveredEvent ? (
          <div
            className="pointer-events-none fixed z-[100] rounded-md border border-white/10 bg-[#0F1729] p-3 text-white shadow-md"
            style={{ left: hoveredEvent.x + 12, top: hoveredEvent.y + 12 }}
          >
            <div className="font-semibold">{hoveredEvent.event.name}</div>
            <div className="mt-1 text-xs text-white/70">
              {format(getEventStartTime(hoveredEvent.event), "EEEE, MMMM d, yyyy")}
            </div>
            <div className="text-xs text-white/70">
              {format(getEventStartTime(hoveredEvent.event), "h:mm a")} to {format(getEventEndTime(hoveredEvent.event), "h:mm a")}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
