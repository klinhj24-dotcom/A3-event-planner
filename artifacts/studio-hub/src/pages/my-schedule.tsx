import { AppLayout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { format, isPast } from "date-fns";
import { Calendar, MapPin, CalendarDays, Info } from "lucide-react";

const TAG_NAMES: Record<string, string> = {
  TW: "Teachers in the Wild",
  MSH: "Music Space Hollywood",
  MSS: "Music Space Silver Lake",
  CF: "Camp Forte",
  CAL: "All Locations",
};

const STATUS_STYLES: Record<string, string> = {
  planning: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  confirmed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  completed: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function MySchedule() {
  const { data, isLoading } = useQuery<{ events: any[]; employee: any | null }>({
    queryKey: ["/api/my-events"],
    queryFn: async () => {
      const res = await fetch("/api/my-events");
      if (!res.ok) throw new Error("Failed to load schedule");
      return res.json();
    },
  });

  const upcoming = data?.events?.filter(e => !e.startDate || !isPast(new Date(e.startDate))) ?? [];
  const past = data?.events?.filter(e => e.startDate && isPast(new Date(e.startDate))) ?? [];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">My Schedule</h1>
          {data?.employee && (
            <p className="text-muted-foreground mt-1">
              Showing events assigned to <span className="text-foreground font-medium">{data.employee.name}</span>
            </p>
          )}
          {!isLoading && !data?.employee && (
            <p className="text-muted-foreground mt-1">
              Your account hasn't been linked to an employee record yet. Contact an admin to get set up.
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array(3).fill(0).map((_, i) => (
              <div key={i} className="h-24 bg-muted/50 animate-pulse rounded-2xl border border-border/50" />
            ))}
          </div>
        ) : !data?.employee ? (
          <div className="flex flex-col items-center justify-center py-20 bg-card border border-border/50 rounded-2xl text-center">
            <Info className="h-10 w-10 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground font-medium">No employee profile linked</p>
            <p className="text-sm text-muted-foreground/60 mt-1 max-w-xs">Ask an admin to link your portal account to your employee record in the Team Roster.</p>
          </div>
        ) : data.events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-card border border-border/50 rounded-2xl text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground font-medium">No events assigned yet</p>
            <p className="text-sm text-muted-foreground/60 mt-1">You'll see events here once an admin assigns you.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {upcoming.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Upcoming</h2>
                <div className="space-y-3">
                  {upcoming.map((ev) => <EventCard key={ev.id} event={ev} />)}
                </div>
              </section>
            )}
            {past.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Past</h2>
                <div className="space-y-3 opacity-60">
                  {past.map((ev) => <EventCard key={ev.id} event={ev} />)}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function EventCard({ event }: { event: any }) {
  return (
    <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold text-foreground">
              {event.title}
              {event.calendarTag && event.calendarTag !== "none" && (
                <span className="ml-2 text-muted-foreground font-normal text-sm">[{event.calendarTag}]</span>
              )}
            </h3>
          </div>
          <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1.5">
            {event.startDate && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {format(new Date(event.startDate), "EEE, MMM d, yyyy")}
                {event.endDate && event.endDate !== event.startDate && (
                  <span> – {format(new Date(event.endDate), "MMM d")}</span>
                )}
              </span>
            )}
            {event.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {event.location}
              </span>
            )}
          </div>
          {event.eventRole && (
            <p className="text-xs text-primary mt-2 font-medium">Your role: {event.eventRole}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <Badge variant="secondary" className="text-[10px] capitalize">{event.type}</Badge>
          {event.status && (
            <Badge variant="outline" className={`text-[10px] capitalize border ${STATUS_STYLES[event.status] || ""}`}>
              {event.status}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
