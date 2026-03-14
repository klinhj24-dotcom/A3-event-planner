import { AppLayout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format, isPast } from "date-fns";
import { Calendar, MapPin, CalendarDays, Info, ClipboardList, AlertCircle } from "lucide-react";

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

const TASK_STATUS_STYLES: Record<string, string> = {
  done: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  late: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  pending: "bg-muted text-muted-foreground border-border/50",
};

export default function MySchedule() {
  const [taskStatusFilter, setTaskStatusFilter] = useState<"all" | "late" | "pending">("all");
  const [taskEventFilter, setTaskEventFilter] = useState<string>("all");

  const { data, isLoading } = useQuery<{ events: any[]; employee: any | null }>({
    queryKey: ["/api/my-events"],
    queryFn: async () => {
      const res = await fetch("/api/my-events");
      if (!res.ok) throw new Error("Failed to load schedule");
      return res.json();
    },
  });

  const { data: taskData } = useQuery<{ tasks: any[]; employee: any | null }>({
    queryKey: ["/api/comm-schedule/my-tasks"],
    queryFn: async () => {
      const res = await fetch("/api/comm-schedule/my-tasks", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load tasks");
      return res.json();
    },
    enabled: !!data?.employee,
  });

  const upcoming = data?.events?.filter(e => !e.startDate || !isPast(new Date(e.startDate))) ?? [];
  const past = data?.events?.filter(e => e.startDate && isPast(new Date(e.startDate))) ?? [];

  const allNonDoneTasks = taskData?.tasks?.filter(t => t.status !== "done") ?? [];
  const doneTasks = taskData?.tasks?.filter(t => t.status === "done") ?? [];
  const lateCount = allNonDoneTasks.filter(t => t.status === "late").length;

  const taskEventOptions = Array.from(
    new Map(allNonDoneTasks.filter(t => t.eventId).map(t => [t.eventId, t.eventTitle ?? `Event #${t.eventId}`])).entries()
  );

  const filteredTasks = allNonDoneTasks.filter(t => {
    const statusOk =
      taskStatusFilter === "all" ? true :
      taskStatusFilter === "late" ? t.status === "late" :
      taskStatusFilter === "pending" ? t.status === "pending" : true;
    const eventOk = taskEventFilter === "all" ? true : String(t.eventId) === taskEventFilter;
    return statusOk && eventOk;
  });

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
        ) : (
          <div className="space-y-8">
            {/* Assigned comm tasks */}
            {((allNonDoneTasks.length > 0) || (doneTasks.length > 0)) && (
              <section>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 shrink-0">
                    <ClipboardList className="h-3.5 w-3.5" />
                    My Comm Tasks
                    {lateCount > 0 && (
                      <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-500 bg-amber-500/10">
                        {lateCount} late
                      </Badge>
                    )}
                  </h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Status filter chips */}
                    <div className="flex items-center gap-1">
                      {(["all", "late", "pending"] as const).map(f => (
                        <button
                          key={f}
                          onClick={() => setTaskStatusFilter(f)}
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                            taskStatusFilter === f
                              ? f === "late"
                                ? "bg-amber-500/20 text-amber-500 border-amber-500/40"
                                : "bg-primary/20 text-primary border-primary/40"
                              : "bg-transparent text-muted-foreground border-border/50 hover:border-border"
                          }`}
                        >
                          {f === "all" ? "All" : f === "late" ? "Late" : "Pending"}
                        </button>
                      ))}
                    </div>
                    {/* Event filter dropdown */}
                    {taskEventOptions.length > 1 && (
                      <Select value={taskEventFilter} onValueChange={setTaskEventFilter}>
                        <SelectTrigger className="rounded-full h-7 text-[11px] px-3 w-auto min-w-[130px] border-border/50">
                          <SelectValue placeholder="All events" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="text-xs">All events</SelectItem>
                          {taskEventOptions.map(([evId, evTitle]) => (
                            <SelectItem key={evId} value={String(evId)} className="text-xs">{evTitle}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  {filteredTasks.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">No tasks match the current filter.</p>
                  ) : (
                    filteredTasks.map(task => (
                      <CommTaskCard key={task.id} task={task} />
                    ))
                  )}
                  {doneTasks.length > 0 && allNonDoneTasks.length > 0 && (
                    <p className="text-xs text-muted-foreground pt-1">{doneTasks.length} completed task{doneTasks.length !== 1 ? "s" : ""} not shown</p>
                  )}
                  {doneTasks.length > 0 && allNonDoneTasks.length === 0 && (
                    <p className="text-xs text-muted-foreground">All {doneTasks.length} assigned tasks completed.</p>
                  )}
                </div>
              </section>
            )}

            {/* Upcoming events */}
            {upcoming.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Upcoming</h2>
                <div className="space-y-3">
                  {upcoming.map((ev) => <EventCard key={ev.id} event={ev} />)}
                </div>
              </section>
            )}

            {/* Past events */}
            {past.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Past</h2>
                <div className="space-y-3 opacity-60">
                  {past.map((ev) => <EventCard key={ev.id} event={ev} />)}
                </div>
              </section>
            )}

            {data.events.length === 0 && pendingTasks.length === 0 && doneTasks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 bg-card border border-border/50 rounded-2xl text-center">
                <CalendarDays className="h-10 w-10 text-muted-foreground/40 mb-4" />
                <p className="text-muted-foreground font-medium">No events or tasks assigned yet</p>
                <p className="text-sm text-muted-foreground/60 mt-1">You'll see events here once an admin assigns you.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function CommTaskCard({ task }: { task: any }) {
  const isLate = task.status === "late";
  const dueDate = task.dueDate ? new Date(task.dueDate) : null;

  return (
    <div className={`bg-card border rounded-xl p-4 shadow-sm ${isLate ? "border-amber-500/30 bg-amber-500/5" : "border-border/50"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {isLate && <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
            <p className="text-sm font-medium text-foreground">{task.messageName || task.commType}</p>
          </div>
          <p className="text-xs text-muted-foreground">{task.eventTitle}</p>
          {task.channel && (
            <p className="text-xs text-muted-foreground mt-0.5">{task.channel}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Badge variant="outline" className={`text-[10px] capitalize border ${TASK_STATUS_STYLES[task.status] || ""}`}>
            {task.status}
          </Badge>
          {dueDate && (
            <span className={`text-[11px] font-medium ${isLate ? "text-amber-500" : "text-muted-foreground"}`}>
              {format(dueDate, "MMM d")}
            </span>
          )}
        </div>
      </div>
    </div>
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
