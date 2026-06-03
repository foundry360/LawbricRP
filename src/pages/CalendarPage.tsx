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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiClient, getActiveGhlLocationId } from "@/lib/api";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { formatPhoneNumber } from "@/lib/phone";
import { cn } from "@/lib/utils";

const CALENDAR_ID = "oU7nwKUfwAL5rhpTmgbV";

type CalendarOption = {
  id: string;
  name: string;
  color: string;
  teamMembers?: any[];
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

export function CalendarPage() {
  const [locationId, setLocationId] = useState("");
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [month, setMonth] = useState(new Date());
  const [slots, setSlots] = useState<SlotMap>({});
  const [loading, setLoading] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isEditingEvent, setIsEditingEvent] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState("");
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
    { id: CALENDAR_ID, name: "Main Calendar", color: "#2384CA" },
  ]);

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

  useEffect(() => {
    const loadLocation = async () => {
      const locId = await getActiveGhlLocationId();
      setLocationId(locId);

      if (!locId) return;

      try {
        const res: any = await apiClient(`/calendars/?locationId=${locId}`);
        if (res?.calendars?.length > 0) {
          const colors = ["#2384CA", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f43f5e"];
          const calendars = res.calendars.map((calendar: any, index: number) => ({
            id: calendar.id,
            name: calendar.name || "Calendar",
            color: colors[index % colors.length],
            teamMembers: calendar.teamMembers || [],
          }));
          setAvailableCalendars(calendars);
          setSelectedCalendars([calendars[0].id]);
          setBookingCalendarId(calendars[0].id);

          const extractedUsers = new Map<string, any>();
          calendars.forEach((calendar: CalendarOption) => {
            calendar.teamMembers?.forEach((member: any) => {
              if (member.userId) extractedUsers.set(member.userId, { id: member.userId, name: member.name || "" });
            });
          });
          if (extractedUsers.size > 0) setUsers((previous) => (previous.length > 0 ? previous : Array.from(extractedUsers.values())));
        }
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
          );
          if (res?.events) {
            const calendar = availableCalendars.find((item) => item.id === calendarId);
            allEvents.push(
              ...res.events.map((event: any) => ({
                id: event.id,
                name: event.title || event.contactName || "Booked Appointment",
                date: event.startTime,
                color: event.color || calendar?.color,
                calendarName: calendar?.name,
                calendarId,
                rawEvent: event,
              })),
            );
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
        const res = await fetch(
          `https://backend.leadconnectorhq.com/calendars/${calendarId}/free-slots?startDate=${start.getTime()}&endDate=${finalEnd.getTime()}&timezone=${timezone}`,
        );
        if (res.ok) {
          const data = await res.json();
          Object.keys(data).forEach((dateStr) => {
            if (!allSlots[dateStr]) allSlots[dateStr] = { slots: [] };
            if (Array.isArray(data[dateStr]?.slots)) {
              allSlots[dateStr].slots = [...new Set([...allSlots[dateStr].slots, ...data[dateStr].slots])].sort();
            }
          });
        }
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
    if (isSheetOpen || isEventDetailsOpen) {
      if (isSheetOpen) {
        setBookingDate(date || new Date());
        if (!bookingCalendarId && availableCalendars.length > 0) setBookingCalendarId(availableCalendars[0].id);
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
  }, [isSheetOpen, isEventDetailsOpen, date, availableCalendars, locationId, contacts.length, users.length, bookingCalendarId]);

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
    const res = await fetch(
      `https://backend.leadconnectorhq.com/calendars/${calendarId}/free-slots?startDate=${start}&endDate=${end}&timezone=${timezone}`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    const dateStr = format(targetDate, "yyyy-MM-dd");
    const fetchedSlots = data[dateStr]?.slots?.sort() || [];
    return originalSlot && format(new Date(originalSlot), "yyyy-MM-dd") === dateStr && !fetchedSlots.includes(originalSlot)
      ? [...fetchedSlots, originalSlot].sort()
      : fetchedSlots;
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

    const contact = contacts.find((item) => item.id === selectedContactId);
    setSubmitting(true);

    try {
      const response = await fetch("https://backend.leadconnectorhq.com/vibe-ai/booking/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          calendarId: bookingCalendarId || selectedCalendars[0] || CALENDAR_ID,
          firstName: contact?.firstName || "",
          lastName: contact?.lastName || "",
          email: contact?.email || "",
          phone: formatPhoneNumber(contact?.phone, ""),
          notes: formData.notes,
          selectedSlot,
          selectedTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          sessionId: crypto.randomUUID(),
          ...(selectedUserId ? { assignedUserId: selectedUserId } : {}),
        }),
      });

      if (!response.ok) throw new Error("Failed to book appointment.");

      const data = await response.json().catch(() => ({}));
      toast({ title: "Success", description: "Appointment booked successfully." });
      setBookedEvents((previous) => [
        ...previous,
        {
          id: data.appointmentId || crypto.randomUUID(),
          name: contact ? formatContactName(contact) : "New Appointment",
          date: selectedSlot,
          calendarId: bookingCalendarId || selectedCalendars[0] || CALENDAR_ID,
          rawEvent: {
            contactId: data.contactId || selectedContactId,
            contactEmail: contact?.email,
            contactPhone: formatPhoneNumber(contact?.phone, ""),
            assignedUserId: selectedUserId || undefined,
            notes: formData.notes,
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
      const originalStart = new Date(selectedEvent.date);
      const originalEnd = selectedEvent.rawEvent?.endTime
        ? new Date(selectedEvent.rawEvent.endTime)
        : new Date(originalStart.getTime() + 30 * 60000);
      const duration = Math.max(30 * 60000, originalEnd.getTime() - originalStart.getTime());
      const endTime = new Date(new Date(startTime).getTime() + duration).toISOString();
      const calendarId = editFormData.calendarId || selectedEvent.calendarId;

      const payload: any = {
        calendarId,
        locationId,
        contactId: editFormData.contactId || selectedEvent.rawEvent?.contactId,
        startTime,
        endTime,
        title: selectedEvent.rawEvent?.title || selectedEvent.name,
        ignoreDateRange: true,
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
      <BookingSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        availableCalendars={availableCalendars}
        bookingCalendarId={bookingCalendarId}
        setBookingCalendarId={setBookingCalendarId}
        bookingDate={bookingDate}
        setBookingDate={setBookingDate}
        bookingSlots={bookingSlots}
        selectedSlot={selectedSlot}
        setSelectedSlot={setSelectedSlot}
        contacts={contacts}
        selectedContactId={selectedContactId}
        setSelectedContactId={setSelectedContactId}
        isContactPopoverOpen={isContactPopoverOpen}
        setIsContactPopoverOpen={setIsContactPopoverOpen}
        users={users}
        selectedUserId={selectedUserId}
        setSelectedUserId={setSelectedUserId}
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
            <h3 className="mb-3 text-sm font-medium">Calendars</h3>
            <div className="space-y-3">
              <div className="mb-1 flex items-center space-x-2 border-b border-border/50 pb-3">
                <Checkbox
                  id="cal-all"
                  checked={selectedCalendars.length === availableCalendars.length && availableCalendars.length > 0}
                  onCheckedChange={(checked) => {
                    setSelectedCalendars(checked ? availableCalendars.map((calendar) => calendar.id) : [availableCalendars[0]?.id].filter(Boolean));
                  }}
                />
                <Label htmlFor="cal-all" className="flex-1 cursor-pointer truncate text-sm font-medium">
                  All Calendars
                </Label>
              </div>
              {availableCalendars.map((calendar) => (
                <div key={calendar.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`cal-${calendar.id}`}
                    checked={selectedCalendars.includes(calendar.id)}
                    onCheckedChange={(checked) => {
                      if (checked) setSelectedCalendars([...selectedCalendars, calendar.id]);
                      else if (selectedCalendars.length > 1) setSelectedCalendars(selectedCalendars.filter((id) => id !== calendar.id));
                    }}
                  />
                  <Label htmlFor={`cal-${calendar.id}`} className="flex-1 cursor-pointer truncate text-sm">
                    {calendar.name}
                  </Label>
                  <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: calendar.color }} />
                </div>
              ))}
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

function BookingSheet(props: BookingSheetProps) {
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
                  <SelectValue placeholder="Select a calendar" />
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
                <Label>Time Slot</Label>
                <Select value={props.selectedSlot} onValueChange={props.setSelectedSlot} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select time" />
                  </SelectTrigger>
                  <SelectContent>
                    {props.bookingSlots.length > 0 ? (
                      props.bookingSlots.map((slot, index) => (
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
            <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
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
            <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
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
                        date: new Date(selectedEvent.date),
                        slot: selectedEvent.date,
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
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Calendar</Label>
        <Select value={props.editFormData.calendarId} onValueChange={(value) => props.setEditFormData({ ...props.editFormData, calendarId: value })} required>
          <SelectTrigger>
            <SelectValue placeholder="Select a calendar" />
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
          <Label>Time Slot</Label>
          <Select value={props.editFormData.slot} onValueChange={(value) => props.setEditFormData({ ...props.editFormData, slot: value })} required>
            <SelectTrigger>
              <SelectValue placeholder="Select time" />
            </SelectTrigger>
            <SelectContent>
              {props.editSlots.length > 0 ? (
                props.editSlots.map((slot: string, index: number) => (
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
  const endTime = selectedEvent.rawEvent?.endTime
    ? new Date(selectedEvent.rawEvent.endTime)
    : new Date(new Date(selectedEvent.date).getTime() + 30 * 60000);

  return (
    <div className="space-y-4">
      <DetailRow icon={Clock} label="Appointment Time">
        {format(new Date(selectedEvent.date), "EEE, MMM d, yyyy 'at' h:mm a")} - {format(endTime, "h:mm a")}
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

function EventPill({ event, onClick, compact = false }: { event: CalendarEvent; onClick: (event: CalendarEvent, ev: React.MouseEvent) => void; compact?: boolean }) {
  const cancelled = event.rawEvent?.appointmentStatus === "cancelled";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "cursor-pointer truncate rounded border font-medium",
            compact ? "p-1 text-[10px] sm:text-xs" : "p-1.5 text-sm",
            cancelled ? "border-primary bg-background text-primary line-through" : "border-primary/20 bg-primary text-primary-foreground",
          )}
          style={cancelled ? {} : event.color ? { backgroundColor: event.color, color: "#ffffff", borderColor: event.color } : {}}
          onClick={(ev) => onClick(event, ev)}
        >
          {event.name} - {format(new Date(event.date), "h:mm a")}
        </div>
      </TooltipTrigger>
      <TooltipContent className="z-[100] border bg-popover p-3 text-popover-foreground shadow-md">
        <div className="font-semibold">{event.name}</div>
        <div className="mt-1 text-xs text-muted-foreground">{format(new Date(event.date), "EEEE, MMMM d, yyyy")}</div>
        <div className="text-xs text-muted-foreground">{format(new Date(event.date), "h:mm a")}</div>
      </TooltipContent>
    </Tooltip>
  );
}

function MonthView({ month, date, setDate, setMonth, events, openEvent }: any) {
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
          return (
            <div
              key={index}
              className={cn(
                "cursor-pointer border-b border-r p-2 transition-colors",
                !isCurrentMonth ? "bg-muted/20 text-muted-foreground/50" : "hover:bg-muted/30",
                isSelected && "bg-primary/5 ring-1 ring-inset ring-primary",
              )}
              onClick={() => {
                setDate(day);
                if (!isCurrentMonth) setMonth(day);
              }}
            >
              <div className={cn("flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium", isSelected && "bg-primary text-primary-foreground")}>
                {day.getDate()}
              </div>
              <div className="no-scrollbar mt-1 max-h-[80px] space-y-1 overflow-y-auto">
                {events
                  .filter((event: CalendarEvent) => new Date(event.date).toDateString() === day.toDateString())
                  .sort((a: CalendarEvent, b: CalendarEvent) => new Date(a.date).getTime() - new Date(b.date).getTime())
                  .map((event: CalendarEvent) => (
                    <EventPill key={event.id} event={event} compact onClick={(item, ev) => { ev.stopPropagation(); openEvent(item); }} />
                  ))}
              </div>
            </div>
          );
        })}
      </div>
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
      <TimeGrid mode="day" month={month} events={events} currentTime={currentTime} scrollRef={scrollRef} openEvent={openEvent} />
    </div>
  );
}

function TimeGrid({ mode, month, events, currentTime, scrollRef, openEvent }: any) {
  const isWeek = mode === "week";
  const rowHeight = isWeek ? 80 : 100;
  const leftWidth = isWeek ? "left-16" : "left-20";
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
      {showCurrentLine && (
        <div className={cn("pointer-events-none absolute right-0 z-10 border-t-2 border-blue-400/60", leftWidth)} style={{ top: `${(currentTime.getHours() + currentTime.getMinutes() / 60) * rowHeight}px` }}>
          <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-blue-400 shadow-sm" />
        </div>
      )}
      {Array.from({ length: 24 }).map((_, hour) => (
        <div key={hour} className="relative flex border-b" style={{ height: `${rowHeight}px` }}>
          <div className={cn("absolute right-0 top-1/2 pointer-events-none z-0 border-t border-dashed border-muted-foreground/20", leftWidth)} />
          <div className={cn("relative z-10 shrink-0 border-r bg-blue-50/50 p-2 text-right text-xs text-muted-foreground", isWeek ? "w-16" : "w-20 text-sm font-medium")}>
            {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
          </div>
          <div className={cn("grid flex-1 bg-card", isWeek ? "grid-cols-7" : "grid-cols-1")}>
            {days.map((day: Date, index: number) => {
              const hourEvents = events.filter((event: CalendarEvent) => new Date(event.date).toDateString() === day.toDateString() && new Date(event.date).getHours() === hour);
              return (
                <div key={index} className="no-scrollbar relative flex flex-col overflow-x-auto border-r p-1 transition-colors last:border-r-0 hover:bg-muted/10">
                  <div className="flex h-1/2 w-full flex-row gap-1 pb-1">
                    {hourEvents.filter((event: CalendarEvent) => new Date(event.date).getMinutes() < 30).map((event: CalendarEvent) => (
                      <EventPill key={event.id} event={event} compact={isWeek} onClick={(item, ev) => { ev.stopPropagation(); openEvent(item); }} />
                    ))}
                  </div>
                  <div className="flex h-1/2 w-full flex-row gap-1 pt-1">
                    {hourEvents.filter((event: CalendarEvent) => new Date(event.date).getMinutes() >= 30).map((event: CalendarEvent) => (
                      <EventPill key={event.id} event={event} compact={isWeek} onClick={(item, ev) => { ev.stopPropagation(); openEvent(item); }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
