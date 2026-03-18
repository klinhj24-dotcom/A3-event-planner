import { useState } from "react";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday, addMonths, subMonths
} from "date-fns";
import { ChevronLeft, ChevronRight, MapPin, Clock, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Event = {
  id: number;
  title: string;
  type: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  location?: string | null;
  isPaid?: boolean;
  revenue?: string | null;
  cost?: string | null;
  calendarTag?: string | null;
  isTwoDay?: boolean | null;
  day1EndTime?: string | null;
  day2StartTime?: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  planning:  "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  confirmed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  completed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
};

const STATUS_DOT: Record<string, string> = {
  planning:  "bg-yellow-400",
  confirmed: "bg-emerald-400",
  completed: "bg-blue-400",
  cancelled: "bg-red-400",
};

function fmt12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function EventPill({ event, dayLabel }: { event: Event; dayLabel?: string }) {
  const isDay1 = !dayLabel || dayLabel === "day1";
  const startDate = event.startDate ? new Date(event.startDate) : null;
  const endDate = event.endDate ? new Date(event.endDate) : null;

  const day1Start = startDate ? format(startDate, "h:mm a") : null;
  const day1End = event.day1EndTime ? fmt12(event.day1EndTime) : (isDay1 && endDate && !event.isTwoDay ? format(endDate, "h:mm a") : null);
  const day2Start = event.day2StartTime ? fmt12(event.day2StartTime) : null;
  const day2End = endDate ? format(endDate, "h:mm a") : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`w-full text-left text-[10px] leading-tight px-1.5 py-0.5 rounded font-medium truncate border transition-opacity hover:opacity-80 ${STATUS_COLORS[event.status] ?? "bg-muted text-muted-foreground border-border"}`}
        >
          {event.isTwoDay && dayLabel === "day2" ? `${event.title} (Day 2)` : event.title}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 rounded-xl shadow-xl border-border/50" side="top" align="start">
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-semibold text-sm leading-tight">{event.title}</h4>
            <div className="flex items-center gap-1 shrink-0">
              {event.isTwoDay && (
                <Badge variant="outline" className="text-[9px] px-1.5 bg-primary/10 text-primary border-primary/20">2-Day</Badge>
              )}
              <Badge variant="outline" className={`text-[10px] capitalize ${STATUS_COLORS[event.status]}`}>
                {event.status}
              </Badge>
            </div>
          </div>

          {event.isTwoDay ? (
            <div className="space-y-2">
              {/* Day 1 */}
              {startDate && (
                <div className="rounded-lg bg-muted/30 px-3 py-2 space-y-0.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Day 1 · {format(startDate, "EEE, MMM d")}</p>
                  {day1Start && (
                    <p className="text-xs text-foreground flex items-center gap-1.5">
                      <Clock className="h-3 w-3 opacity-60" />
                      {day1Start}{day1End ? ` – ${day1End}` : ""}
                    </p>
                  )}
                </div>
              )}
              {/* Day 2 */}
              {endDate && (
                <div className="rounded-lg bg-muted/30 px-3 py-2 space-y-0.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Day 2 · {format(endDate, "EEE, MMM d")}</p>
                  {(day2Start || day2End) && (
                    <p className="text-xs text-foreground flex items-center gap-1.5">
                      <Clock className="h-3 w-3 opacity-60" />
                      {day2Start ?? "?"}{day2End ? ` – ${day2End}` : ""}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            startDate && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {format(startDate, "MMM d, yyyy · h:mm a")}
                {endDate ? ` – ${format(endDate, "h:mm a")}` : ""}
              </div>
            )
          )}

          {event.location && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {event.location}
            </div>
          )}
          <div className="flex items-center gap-2 pt-1 border-t border-border/50">
            <span className="text-xs text-muted-foreground capitalize">{event.type.replace(/_/g, " ")}</span>
            {event.isPaid && (
              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20 ml-auto">PAID</Badge>
            )}
          </div>
          {(event.revenue || event.cost) && (
            <div className="flex gap-3 text-xs font-mono">
              {event.revenue && <span className="text-emerald-400">+${event.revenue}</span>}
              {event.cost && <span className="text-red-400">-${event.cost}</span>}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function EventsCalendar({ events }: { events: Event[] }) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  // Returns events for a day with a label so we know which day of the event it is
  const eventsOnDay = (day: Date): { event: Event; dayLabel: string }[] => {
    const result: { event: Event; dayLabel: string }[] = [];
    for (const e of events) {
      if (e.startDate && isSameDay(new Date(e.startDate), day)) {
        result.push({ event: e, dayLabel: e.isTwoDay ? "day1" : "" });
      } else if (e.isTwoDay && e.endDate && isSameDay(new Date(e.endDate), day)) {
        result.push({ event: e, dayLabel: "day2" });
      }
    }
    return result;
  };

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Status counts — deduplicate two-day events by ID (count once)
  const seenIds = new Set<number>();
  const monthEvents: Event[] = [];
  for (const e of events) {
    if (seenIds.has(e.id)) continue;
    const start = e.startDate ? new Date(e.startDate) : null;
    const end = e.endDate ? new Date(e.endDate) : null;
    if ((start && isSameMonth(start, currentDate)) || (e.isTwoDay && end && isSameMonth(end, currentDate))) {
      seenIds.add(e.id);
      monthEvents.push(e);
    }
  }
  const counts = monthEvents.reduce<Record<string, number>>((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold font-display">
            {format(currentDate, "MMMM yyyy")}
          </h2>
          {Object.entries(counts).map(([status, count]) => (
            <span key={status} className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status] ?? "bg-muted-foreground"}`} />
              {count} {status}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg h-8 w-8 p-0"
            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg h-8 px-3 text-xs"
            onClick={() => setCurrentDate(new Date())}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg h-8 w-8 p-0"
            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-border/50 bg-muted/20">
          {weekDays.map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const dayItems = eventsOnDay(day);
            const inMonth = isSameMonth(day, currentDate);
            const today = isToday(day);
            const isLastRow = i >= days.length - 7;
            const isLastCol = (i + 1) % 7 === 0;

            return (
              <div
                key={day.toISOString()}
                className={`
                  min-h-[96px] p-1.5 flex flex-col gap-1
                  ${!isLastRow ? "border-b border-border/30" : ""}
                  ${!isLastCol ? "border-r border-border/30" : ""}
                  ${!inMonth ? "opacity-35 bg-muted/10" : ""}
                `}
              >
                {/* Day number */}
                <div className="flex justify-end">
                  <span
                    className={`
                      h-6 w-6 flex items-center justify-center text-xs font-medium rounded-full
                      ${today
                        ? "bg-primary text-primary-foreground font-bold"
                        : inMonth
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }
                    `}
                  >
                    {format(day, "d")}
                  </span>
                </div>

                {/* Event pills */}
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  {dayItems.slice(0, 3).map(({ event, dayLabel }) => (
                    <EventPill key={`${event.id}-${dayLabel}`} event={event} dayLabel={dayLabel} />
                  ))}
                  {dayItems.length > 3 && (
                    <span className="text-[10px] text-muted-foreground pl-1">
                      +{dayItems.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
        {Object.entries(STATUS_DOT).map(([status, dot]) => (
          <span key={status} className="flex items-center gap-1.5 capitalize">
            <span className={`h-2 w-2 rounded-sm ${dot}`} />
            {status}
          </span>
        ))}
        <span className="flex items-center gap-1.5 ml-auto text-muted-foreground/60">
          <CalendarDays className="h-3 w-3" /> Two-day events appear on both days
        </span>
      </div>
    </div>
  );
}
