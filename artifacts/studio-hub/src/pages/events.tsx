import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListEvents, useListEmployees } from "@workspace/api-client-react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Search, Plus, MapPin, DollarSign, CalendarCheck, Tag, Loader2,
  List, CalendarDays, Radio, ClipboardList, Mail, Instagram, Printer, Globe, AlertCircle, MailWarning, ClipboardCheck, ImageIcon, Pencil, X, Users2, Music, Receipt, Package
} from "lucide-react";
import { format, isPast, differenceInDays } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { EventsCalendar } from "@/components/events-calendar";
import { useCommTasks, useUpdateCommTask, useSendLateReport, useUpdateEventEmployee, type CommTask } from "@/hooks/use-team";
import { DebriefSheet } from "@/components/debrief-sheet";
import { LineupSheet } from "@/components/lineup-sheet";
import { PackingSheet } from "@/components/packing-sheet";
import { useActiveEventTypes } from "@/hooks/use-event-types";

// ─── Channel icon map ─────────────────────────────────────────────────────────
const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  "Email": <Mail className="h-3.5 w-3.5" />,
  "Email to Past Clients": <Mail className="h-3.5 w-3.5" />,
  "Email to Enrolled Students": <Mail className="h-3.5 w-3.5" />,
  "Email to Enrolled Clients": <Mail className="h-3.5 w-3.5" />,
  "Instagram Post": <Instagram className="h-3.5 w-3.5" />,
  "Instagram Story": <Instagram className="h-3.5 w-3.5" />,
  "Print": <Printer className="h-3.5 w-3.5" />,
  "Website": <Globe className="h-3.5 w-3.5" />,
  "Invoice": <Receipt className="h-3.5 w-3.5" />,
};

const COMM_TYPE_COLORS: Record<string, string> = {
  "Email": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "Social Media": "bg-pink-500/10 text-pink-400 border-pink-500/20",
  "In-Studio": "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "Print": "bg-green-500/10 text-green-400 border-green-500/20",
  "Website": "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

// ─── CommTasksSheet ───────────────────────────────────────────────────────────
function CommTasksSheet({
  event,
  open,
  onClose,
  employees = [],
}: {
  event: { id: number; title: string; type: string; startDate?: string | null } | null;
  open: boolean;
  onClose: () => void;
  employees?: any[];
}) {
  const { data: tasks = [], isLoading } = useCommTasks(event?.id ?? null);
  const { mutate: updateTask } = useUpdateCommTask();
  const { mutate: pushComms, isPending: pushing } = useMutation({
    mutationFn: () =>
      fetch(`/api/calendar/push-comms/${event!.id}`, { method: "POST", credentials: "include" }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/comm-schedule/tasks`, event?.id] }),
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  if (!event) return null;

  const sorted = [...tasks].sort((a, b) => {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  const doneCount = tasks.filter(t => t.status === "done").length;
  const lateCount = tasks.filter(t => t.status === "late").length;
  const total = tasks.length;
  const progressPct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  function toggle(task: CommTask) {
    const newStatus = task.status === "done" ? "pending" : "done";
    // note: "late" → checking = "done", unchecking a "done" late = "pending" (auto-re-marks late on reload)
    updateTask(
      { id: task.id, eventId: event!.id, status: newStatus },
      {
        onError: () => toast({ title: "Failed to update task", variant: "destructive" }),
      }
    );
  }

  function handlePushComms() {
    pushComms(undefined, {
      onSuccess: (data: any) => {
        if (data?.error) { toast({ title: data.error, variant: "destructive" }); return; }
        if (data?.pushed === 0 && data?.message) {
          toast({ title: "No rules matched", description: data.message, variant: "destructive" });
          return;
        }
        toast({ title: `${data?.pushed} comm tasks generated & pushed to calendar` });
      },
      onError: () => toast({ title: "Failed to push comms", variant: "destructive" }),
    });
  }

  function dueDateLabel(dateStr: string | null | undefined) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const daysUntil = differenceInDays(d, new Date());
    if (isPast(d) && daysUntil < 0) return { text: `${Math.abs(daysUntil)}d overdue`, cls: "text-destructive" };
    if (daysUntil <= 3) return { text: `In ${daysUntil}d`, cls: "text-amber-400" };
    return { text: format(d, "MMM d"), cls: "text-muted-foreground" };
  }

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto flex flex-col gap-0 p-0">
        {/* Header */}
        <div className="p-6 border-b border-border/50 bg-muted/10">
          <SheetHeader className="space-y-1">
            <SheetTitle className="font-display text-lg leading-tight">{event.title}</SheetTitle>
            <SheetDescription className="text-xs">{event.type}</SheetDescription>
          </SheetHeader>

          {total > 0 ? (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">
                  {doneCount} of {total} complete
                  {lateCount > 0 && (
                    <span className="ml-2 text-xs font-semibold text-amber-400">
                      · {lateCount} late
                    </span>
                  )}
                </span>
                <span className={`font-semibold text-sm ${progressPct === 100 ? "text-emerald-400" : lateCount > 0 ? "text-amber-400" : "text-primary"}`}>
                  {progressPct}%
                </span>
              </div>
              <Progress value={progressPct} className="h-2 rounded-full" />
            </div>
          ) : (
            <div className="mt-4 text-sm text-muted-foreground">
              No comm tasks yet — push to generate them.
            </div>
          )}

          <Button
            size="sm"
            variant="outline"
            className="mt-4 rounded-xl w-full border-[#00b199]/40 text-[#00b199] hover:bg-[#00b199]/10 hover:text-[#00b199]"
            onClick={handlePushComms}
            disabled={pushing}
          >
            {pushing
              ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
              : <Radio className="h-3.5 w-3.5 mr-2" />}
            {total > 0 ? "Regenerate & push to Comms Calendar" : "Generate & push to Comms Calendar"}
          </Button>
        </div>

        {/* Task list */}
        <div className="flex-1 p-4 space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground space-y-2">
              <ClipboardList className="h-10 w-10 mx-auto opacity-20" />
              <p className="text-sm">No tasks yet. Hit the button above to generate them.</p>
            </div>
          ) : (
            sorted.map(task => {
              const isDone = task.status === "done";
              const isLate = task.status === "late";
              const dateInfo = dueDateLabel(task.dueDate);
              return (
                <div
                  key={task.id}
                  onClick={() => toggle(task)}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all select-none
                    ${isDone
                      ? "bg-muted/20 border-border/30 opacity-60"
                      : isLate
                      ? "bg-amber-500/5 border-amber-500/40 hover:border-amber-400/60"
                      : "bg-card border-border/50 hover:border-primary/30 hover:bg-primary/5"
                    }`}
                >
                  <Checkbox
                    checked={isDone}
                    onCheckedChange={() => toggle(task)}
                    onClick={e => e.stopPropagation()}
                    className="mt-0.5 shrink-0 rounded-md"
                  />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <p className={`text-sm font-medium leading-snug ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
                      {task.messageName || task.commType}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {isLate && (
                        <Badge className="text-[10px] rounded-md px-1.5 bg-amber-500/20 text-amber-400 border-amber-500/30">
                          ⚠️ LATE
                        </Badge>
                      )}
                      {task.commType && (
                        <Badge variant="outline" className={`text-[10px] rounded-md px-1.5 ${COMM_TYPE_COLORS[task.commType] || "bg-muted/40 text-muted-foreground"}`}>
                          {task.commType}
                        </Badge>
                      )}
                      {task.channel && (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          {CHANNEL_ICONS[task.channel]}
                          {task.channel}
                        </span>
                      )}
                    </div>
                    {employees.length > 0 && (
                      <div onClick={e => e.stopPropagation()} className="pt-1">
                        <Select
                          value={task.assignedToEmployeeId ? String(task.assignedToEmployeeId) : "unassigned"}
                          onValueChange={(val) => updateTask({ id: task.id, eventId: event!.id, assignedToEmployeeId: val === "unassigned" ? null : parseInt(val) })}
                        >
                          <SelectTrigger className="h-6 rounded-lg text-[11px] w-auto min-w-[120px] border-dashed border-border/60 bg-transparent px-2 gap-1">
                            <SelectValue placeholder="Assign to…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned" className="text-xs text-muted-foreground">Unassigned</SelectItem>
                            {employees.map((emp: any) => (
                              <SelectItem key={emp.id} value={String(emp.id)} className="text-xs">{emp.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  {dateInfo && !isLate && (
                    <div className={`shrink-0 text-[11px] font-medium flex items-center gap-1 ${dateInfo.cls}`}>
                      {dateInfo.cls === "text-destructive" && <AlertCircle className="h-3 w-3" />}
                      {dateInfo.text}
                    </div>
                  )}
                  {isLate && task.dueDate && (
                    <div className="shrink-0 text-[11px] font-medium text-amber-400">
                      Due {format(new Date(task.dueDate), "MMM d")}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Sync buttons ─────────────────────────────────────────────────────────────
function CalendarPushButton({ eventId }: { eventId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { mutate: push, isPending } = useMutation({
    mutationFn: () => fetch(`/api/calendar/push/${eventId}`, { method: "POST", credentials: "include" }).then(r => r.json()),
    onSuccess: (data) => {
      if (data.error) { toast({ title: data.error, variant: "destructive" }); return; }
      toast({ title: "Pushed to Events Calendar" });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    },
    onError: () => toast({ title: "Failed to push to calendar", variant: "destructive" }),
  });
  return (
    <Button size="sm" variant="ghost" title="Push to Events Calendar" className="h-7 w-7 p-0 rounded-lg text-primary hover:bg-primary/10" onClick={() => push()} disabled={isPending}>
      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarCheck className="h-3.5 w-3.5" />}
    </Button>
  );
}

function CommsPushButton({ eventId, eventTitle, onPushed }: { eventId: number; eventTitle: string; onPushed?: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { mutate: pushComms, isPending } = useMutation({
    mutationFn: () =>
      fetch(`/api/calendar/push-comms/${eventId}`, { method: "POST", credentials: "include" }).then(r => r.json()),
    onSuccess: (data) => {
      if (data.error) { toast({ title: data.error, variant: "destructive" }); return; }
      if (data.pushed === 0 && data.message) {
        toast({ title: "No rules matched", description: data.message, variant: "destructive" });
        return;
      }
      toast({ title: `${data.pushed} comm tasks pushed`, description: eventTitle });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: [`/api/comm-schedule/tasks`, eventId] });
      onPushed?.();
    },
    onError: () => toast({ title: "Failed to push comms to calendar", variant: "destructive" }),
  });
  return (
    <Button size="sm" variant="ghost" title="Push comm schedule to Comms Calendar" className="h-7 w-7 p-0 rounded-lg text-[#00b199] hover:bg-[#00b199]/10" onClick={() => pushComms()} disabled={isPending}>
      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />}
    </Button>
  );
}

// ─── Event schema ─────────────────────────────────────────────────────────────
const CALENDAR_TAGS = [
  { value: "none", label: "No Tag — Keep off public calendar" },
  { value: "TW",  label: "Teachers in the Wild" },
  { value: "MSH", label: "Music Space Hosted Event" },
  { value: "MSS", label: "Music Space Sponsored Event" },
  { value: "CF",  label: "Community Friends Event" },
  { value: "CAL", label: "Music Space Calendar Event" },
];

const eventSchema = z.object({
  title: z.string().min(1, "Title is required"),
  type: z.string().min(1, "Type is required"),
  status: z.string().min(1, "Status is required"),
  location: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  calendarTag: z.string().optional(),
  isPaid: z.boolean().default(false),
  revenue: z.coerce.number().optional(),
  cost: z.coerce.number().optional(),
  notes: z.string().optional(),
  flyerUrl: z.string().optional(),
  ticketsUrl: z.string().optional(),
  ctaLabel: z.string().optional(),
});

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Events() {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "calendar">("list");
  const { data: events, isLoading } = useListEvents();
  const { data: eventTypeList = [] } = useActiveEventTypes();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<any | null>(null);
  const [tasksEvent, setTasksEvent] = useState<{ id: number; title: string; type: string; startDate?: string | null } | null>(null);
  const [debriefEvent, setDebriefEvent] = useState<{ id: number; title: string; type: string; imageUrl?: string | null } | null>(null);
  const [lineupEvent, setLineupEvent] = useState<{ id: number; title: string } | null>(null);
  const [packingEvent, setPackingEvent] = useState<{ id: number; title: string; type?: string } | null>(null);
  const [createStaff, setCreateStaff] = useState<number[]>([]);

  const { data: allEmployees } = useListEmployees();

  const { data: editEventStaff } = useQuery<any[]>({
    queryKey: [`/api/events/${editEvent?.id}/employees`],
    queryFn: async () => {
      const res = await fetch(`/api/events/${editEvent!.id}/employees`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!editEvent,
  });

  const { mutate: addEditStaff } = useMutation({
    mutationFn: async (employeeId: number) => {
      const res = await fetch(`/api/events/${editEvent!.id}/employees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId }),
      });
      if (!res.ok) throw new Error("Failed to add staff");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/events/${editEvent?.id}/employees`] }),
    onError: () => toast({ title: "Failed to add staff member", variant: "destructive" }),
  });

  const { mutate: removeEditStaff } = useMutation({
    mutationFn: async (assignmentId: number) => {
      const res = await fetch(`/api/events/${editEvent!.id}/employees/${assignmentId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove staff");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/events/${editEvent?.id}/employees`] }),
    onError: () => toast({ title: "Failed to remove staff member", variant: "destructive" }),
  });

  const { mutate: updateStaffTiming } = useUpdateEventEmployee(editEvent?.id);

  const { mutateAsync: createEventAsync, isPending } = useMutation({
    mutationFn: async (data: z.infer<typeof eventSchema>) => {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create event");
      return res.json();
    },
  });

  const { mutate: updateEvent, isPending: isUpdating } = useMutation({
    mutationFn: async (data: z.infer<typeof eventSchema> & { id: number }) => {
      const res = await fetch(`/api/events/${data.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update event");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setEditEvent(null);
      toast({ title: "Event updated" });
    },
    onError: () => toast({ title: "Failed to update event", variant: "destructive" }),
  });

  const form = useForm<z.infer<typeof eventSchema>>({
    resolver: zodResolver(eventSchema),
    defaultValues: { title: "", type: "Recital", status: "planning", isPaid: false, ctaLabel: "TICKETS" }
  });

  const editForm = useForm<z.infer<typeof eventSchema>>({
    resolver: zodResolver(eventSchema),
    defaultValues: { title: "", type: "Recital", status: "planning", isPaid: false, ctaLabel: "TICKETS" }
  });

  function openEdit(ev: any) {
    setEditEvent(ev);
    editForm.reset({
      title: ev.title ?? "",
      type: ev.type ?? "Recital",
      status: ev.status ?? "planning",
      location: ev.location ?? "",
      startDate: ev.startDate ? new Date(ev.startDate).toISOString().slice(0, 16) : "",
      endDate: ev.endDate ? new Date(ev.endDate).toISOString().slice(0, 16) : "",
      calendarTag: ev.calendarTag ?? "",
      isPaid: ev.isPaid ?? false,
      revenue: ev.revenue ? Number(ev.revenue) : undefined,
      cost: ev.cost ? Number(ev.cost) : undefined,
      notes: ev.notes ?? "",
      flyerUrl: ev.flyerUrl ?? "",
      ticketsUrl: ev.ticketsUrl ?? "",
      ctaLabel: ev.ctaLabel ?? "TICKETS",
    });
  }

  const { mutate: sendLateReport, isPending: sendingReport } = useSendLateReport();

  const filteredEvents = events?.filter(e =>
    e.title.toLowerCase().includes(search.toLowerCase()) ||
    e.location?.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
      case 'completed': return "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20";
      case 'cancelled': return "bg-destructive/15 text-destructive border-destructive/20";
      default: return "bg-secondary text-secondary-foreground";
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Events</h1>
            <p className="text-muted-foreground mt-1">Manage studio events, shows, and gigs.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-xl border border-border/60 bg-muted/30 p-1 gap-1">
              <button onClick={() => setView("list")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${view === "list" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <List className="h-3.5 w-3.5" /> List
              </button>
              <button onClick={() => setView("calendar")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${view === "calendar" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <CalendarDays className="h-3.5 w-3.5" /> Calendar
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
              disabled={sendingReport}
              onClick={() => sendLateReport(undefined, {
                onSuccess: (data) => {
                  if (data.sent) {
                    toast({ title: `Late report sent — ${data.count} task${data.count !== 1 ? "s" : ""} listed`, description: `Sent to ${data.to}` });
                  } else {
                    toast({ title: data.message || "No late tasks found" });
                  }
                },
                onError: (err: any) => toast({ title: err.message || "Failed to send report", variant: "destructive" })
              })}
            >
              {sendingReport
                ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                : <MailWarning className="h-3.5 w-3.5 mr-2" />}
              Late Report
            </Button>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-xl shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all">
                  <Plus className="h-4 w-4 mr-2" /> Create Event
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] rounded-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-display text-2xl">Create Event</DialogTitle>
                  <DialogDescription>Schedule a new event and configure sync tags.</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(async (data) => {
                    try {
                      const event = await createEventAsync(data);
                      if (createStaff.length > 0 && event?.id) {
                        await Promise.all(createStaff.map(empId =>
                          fetch(`/api/events/${event.id}/employees`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ employeeId: empId }),
                          })
                        ));
                      }
                      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
                      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
                      setCreateOpen(false);
                      form.reset();
                      setCreateStaff([]);
                      toast({ title: "Event created successfully" });
                    } catch {
                      toast({ title: "Failed to create event", variant: "destructive" });
                    }
                  })} className="space-y-5 py-4">
                    <FormField control={form.control} name="title" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Event Title *</FormLabel>
                        <FormControl><Input placeholder="Summer Recital 2026" className="rounded-xl" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="type" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Type *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent className="max-h-72 overflow-y-auto">
                              {eventTypeList.map(t => (
                                <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="status" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="planning">Planning</SelectItem>
                              <SelectItem value="confirmed">Confirmed</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="startDate" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Date & Time</FormLabel>
                          <FormControl><Input type="datetime-local" className="rounded-xl" {...field} /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="endDate" render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Date & Time</FormLabel>
                          <FormControl><Input type="datetime-local" className="rounded-xl" {...field} /></FormControl>
                        </FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="location" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location / Venue</FormLabel>
                        <FormControl><Input placeholder="Zen West, Main Stage, etc." className="rounded-xl" {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <div className="p-4 bg-muted/40 rounded-xl border border-border/50 space-y-4">
                      <h4 className="font-semibold text-sm flex items-center"><DollarSign className="h-4 w-4 mr-1 text-primary" /> Financials</h4>
                      <FormField control={form.control} name="isPaid" render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border/50 p-3 shadow-sm bg-card">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm font-medium">Paid Event?</FormLabel>
                            <p className="text-[10px] text-muted-foreground">Are we receiving payment for sound/services?</p>
                          </div>
                          <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        </FormItem>
                      )} />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="revenue" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Revenue ($)</FormLabel>
                            <FormControl><Input type="number" placeholder="0.00" className="rounded-xl h-9" {...field} value={field.value || ''} /></FormControl>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="cost" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Cost — booth / sponsorship ($)</FormLabel>
                            <FormControl><Input type="number" placeholder="0.00" className="rounded-xl h-9" {...field} value={field.value || ''} /></FormControl>
                          </FormItem>
                        )} />
                      </div>
                    </div>
                    <FormField control={form.control} name="calendarTag" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center"><Tag className="h-3 w-3 mr-1" /> Website Calendar Tag</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select tag…" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {CALENDAR_TAGS.map(t => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="notes" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm">Internal Notes</FormLabel>
                        <FormControl><textarea placeholder="Staff notes, logistics, reminders…" className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm min-h-[72px] resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" {...field} value={field.value || ''} /></FormControl>
                      </FormItem>
                    )} />
                    <div className="p-4 bg-muted/40 rounded-xl border border-border/50 space-y-4">
                      <h4 className="font-semibold text-sm flex items-center gap-1.5">
                        <Globe className="h-4 w-4 text-secondary" /> Website Calendar Fields
                      </h4>
                      <p className="text-[10px] text-muted-foreground -mt-2">Written into the Google Calendar description — your website script reads these automatically.</p>
                      <div className="grid grid-cols-3 gap-3">
                        <FormField control={form.control} name="ctaLabel" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Button Label</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value ?? "TICKETS"}>
                              <FormControl><SelectTrigger className="rounded-xl h-9"><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="TICKETS">TICKETS</SelectItem>
                                <SelectItem value="REGISTER">REGISTER</SelectItem>
                                <SelectItem value="SIGN UP">SIGN UP</SelectItem>
                                <SelectItem value="RSVP">RSVP</SelectItem>
                                <SelectItem value="INFO">INFO</SelectItem>
                                <SelectItem value="FLYER">FLYER</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )} />
                        <div className="col-span-2">
                          <FormField control={form.control} name="ticketsUrl" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Tickets / Link URL</FormLabel>
                              <FormControl><Input placeholder="https://app.tickethive.com/e/..." className="rounded-xl h-9" {...field} value={field.value || ''} /></FormControl>
                            </FormItem>
                          )} />
                        </div>
                      </div>
                      <FormField control={form.control} name="flyerUrl" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Flyer Image URL (ImageKit)</FormLabel>
                          <FormControl><Input placeholder="https://ik.imagekit.io/... (.jpg/.png)" className="rounded-xl h-9" {...field} value={field.value || ''} /></FormControl>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Paste your ImageKit URL — website script reads it as the event flyer photo.</p>
                        </FormItem>
                      )} />
                    </div>

                    {/* Staff assignment */}
                    {allEmployees && allEmployees.length > 0 && (
                      <div className="pt-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Users2 className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">Assign Staff <span className="text-muted-foreground font-normal text-xs">optional</span></span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {allEmployees.map((emp: any) => {
                            const selected = createStaff.includes(emp.id);
                            return (
                              <button
                                type="button"
                                key={emp.id}
                                onClick={() => setCreateStaff(s => selected ? s.filter(x => x !== emp.id) : [...s, emp.id])}
                                className={`px-3 py-1.5 rounded-xl text-xs border transition-all ${selected ? 'bg-primary text-primary-foreground border-primary' : 'border-border/60 text-muted-foreground hover:border-primary/50 hover:text-foreground'}`}
                              >
                                {selected && <span className="mr-1">✓</span>}
                                {emp.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <DialogFooter className="pt-4">
                      <Button type="submit" disabled={isPending} className="w-full rounded-xl h-11">
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Create Event
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Calendar or list view */}
        {view === "calendar" ? (
          isLoading ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading events...
            </div>
          ) : (
            <EventsCalendar events={events ?? []} />
          )
        ) : (
          <div className="bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border/50 bg-muted/10">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search events by title or location..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 rounded-xl border-border/60 bg-background focus-visible:ring-primary/20"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-semibold">Event</TableHead>
                    <TableHead className="font-semibold">Date & Location</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Financials</TableHead>
                    <TableHead className="text-right font-semibold">Sync & Tasks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Loading events...</TableCell></TableRow>
                  ) : filteredEvents?.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">No events found.</TableCell></TableRow>
                  ) : (
                    filteredEvents?.map((event) => (
                      <TableRow key={event.id} className="hover:bg-muted/20 transition-colors">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {(event as any).imageUrl ? (
                              <img
                                src={(event as any).imageUrl}
                                alt={event.title}
                                className="h-10 w-10 rounded-lg object-cover shrink-0 border border-border/40"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-lg bg-muted/40 border border-border/30 shrink-0 flex items-center justify-center">
                                <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
                              </div>
                            )}
                            <div>
                              <div className="font-medium text-foreground text-base">{event.title}</div>
                              <span className="text-xs text-muted-foreground mt-0.5 block">{event.type}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-sm">
                            <div className="flex items-center text-foreground">
                              <CalendarCheck className="h-3.5 w-3.5 mr-2 text-primary/70" />
                              {event.startDate ? format(new Date(event.startDate), "MMM d, yyyy h:mm a") : "TBD"}
                            </div>
                            {event.location && (
                              <div className="flex items-center text-muted-foreground">
                                <MapPin className="h-3.5 w-3.5 mr-2 opacity-70" />
                                {event.location}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`capitalize ${getStatusColor(event.status)}`}>
                            {event.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center text-sm">
                            {event.isPaid ? (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-semibold tracking-wide">PAID</Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground bg-muted/50 border-border/50">UNPAID</Badge>
                            )}
                            {(event.revenue || event.cost) && (
                              <span className="ml-3 text-xs text-muted-foreground font-mono">
                                {event.revenue ? `+$${event.revenue}` : ''}{event.cost ? ` -$${event.cost}` : ''}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {event.calendarTag && event.calendarTag !== "none" && (
                              <Badge variant="secondary" className="text-[10px] bg-secondary border border-border/50 mr-1">
                                {CALENDAR_TAGS.find(t => t.value === event.calendarTag)?.label ?? event.calendarTag}
                              </Badge>
                            )}
                            {/* Edit event */}
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Edit event"
                              className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10"
                              onClick={() => openEdit(event)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {/* Push to Events Calendar */}
                            <CalendarPushButton eventId={event.id} />
                            {/* Generate & push comm tasks */}
                            <CommsPushButton
                              eventId={event.id}
                              eventTitle={event.title}
                              onPushed={() => setTasksEvent({ id: event.id, title: event.title, type: event.type, startDate: event.startDate })}
                            />
                            {/* Open comm tasks checklist */}
                            <Button
                              size="sm"
                              variant="ghost"
                              title="View comm task checklist"
                              className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60"
                              onClick={() => setTasksEvent({ id: event.id, title: event.title, type: event.type, startDate: event.startDate })}
                            >
                              <ClipboardList className="h-3.5 w-3.5" />
                            </Button>
                            {/* Debrief */}
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Post-event debrief"
                              className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-secondary hover:bg-secondary/10"
                              onClick={() => setDebriefEvent({ id: event.id, title: event.title, type: event.type, imageUrl: (event as any).imageUrl })}
                            >
                              <ClipboardCheck className="h-3.5 w-3.5" />
                            </Button>
                            {/* Band lineup */}
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Band lineup builder"
                              className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10"
                              onClick={() => setLineupEvent({ id: event.id, title: event.title })}
                            >
                              <Music className="h-3.5 w-3.5" />
                            </Button>
                            {/* Packing list */}
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Packing list"
                              className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10"
                              onClick={() => setPackingEvent({ id: event.id, title: event.title, type: event.type })}
                            >
                              <Package className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      {/* Edit Event Dialog */}
      <Dialog open={!!editEvent} onOpenChange={(open) => !open && setEditEvent(null)}>
        <DialogContent className="sm:max-w-[620px] rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Edit Event</DialogTitle>
            <DialogDescription>Update event details. Hit Save when done.</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit((data) => updateEvent({ ...data, id: editEvent.id }))} className="space-y-5 py-4">
              <FormField control={editForm.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel>Event Title *</FormLabel>
                  <FormControl><Input className="rounded-xl" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent className="max-h-72 overflow-y-auto">
                        {eventTypeList.map(t => (
                          <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="planning">Planning</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="startDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date & Time</FormLabel>
                    <FormControl><Input type="datetime-local" className="rounded-xl" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="endDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date & Time</FormLabel>
                    <FormControl><Input type="datetime-local" className="rounded-xl" {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <FormField control={editForm.control} name="location" render={({ field }) => (
                <FormItem>
                  <FormLabel>Location / Venue</FormLabel>
                  <FormControl><Input placeholder="Zen West, Main Stage, etc." className="rounded-xl" {...field} /></FormControl>
                </FormItem>
              )} />
              <div className="p-4 bg-muted/40 rounded-xl border border-border/50 space-y-4">
                <h4 className="font-semibold text-sm flex items-center"><DollarSign className="h-4 w-4 mr-1 text-primary" /> Financials</h4>
                <FormField control={editForm.control} name="isPaid" render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border/50 p-3 shadow-sm bg-card">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm font-medium">Paid Event?</FormLabel>
                    </div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={editForm.control} name="revenue" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Revenue ($)</FormLabel>
                      <FormControl><Input type="number" placeholder="0.00" className="rounded-xl h-9" {...field} value={field.value || ''} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={editForm.control} name="cost" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Cost — booth / sponsorship ($)</FormLabel>
                      <FormControl><Input type="number" placeholder="0.00" className="rounded-xl h-9" {...field} value={field.value || ''} /></FormControl>
                    </FormItem>
                  )} />
                </div>
              </div>
              <FormField control={editForm.control} name="calendarTag" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center"><Tag className="h-3 w-3 mr-1" /> Website Calendar Tag</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select tag…" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {CALENDAR_TAGS.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={editForm.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">Internal Notes</FormLabel>
                  <FormControl><textarea placeholder="Staff notes, logistics, reminders…" className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm min-h-[72px] resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" {...field} value={field.value || ''} /></FormControl>
                </FormItem>
              )} />
              <div className="p-4 bg-muted/40 rounded-xl border border-border/50 space-y-4">
                <h4 className="font-semibold text-sm flex items-center gap-1.5">
                  <Globe className="h-4 w-4 text-secondary" /> Website Calendar Fields
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <FormField control={editForm.control} name="ctaLabel" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Button Label</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? "TICKETS"}>
                        <FormControl><SelectTrigger className="rounded-xl h-9"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="TICKETS">TICKETS</SelectItem>
                          <SelectItem value="REGISTER">REGISTER</SelectItem>
                          <SelectItem value="SIGN UP">SIGN UP</SelectItem>
                          <SelectItem value="RSVP">RSVP</SelectItem>
                          <SelectItem value="INFO">INFO</SelectItem>
                          <SelectItem value="FLYER">FLYER</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <div className="col-span-2">
                    <FormField control={editForm.control} name="ticketsUrl" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Tickets / Link URL</FormLabel>
                        <FormControl><Input placeholder="https://app.tickethive.com/e/..." className="rounded-xl h-9" {...field} value={field.value || ''} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                </div>
                <FormField control={editForm.control} name="flyerUrl" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Flyer Image URL (ImageKit)</FormLabel>
                    <FormControl><Input placeholder="https://ik.imagekit.io/... (.jpg/.png)" className="rounded-xl h-9" {...field} value={field.value || ''} /></FormControl>
                  </FormItem>
                )} />
              </div>

              {/* Assigned Staff */}
              <div className="pt-2 border-t border-border/30">
                <div className="flex items-center gap-2 mb-3">
                  <Users2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Assigned Staff</span>
                </div>
                <div className="flex flex-wrap gap-3 mb-3 min-h-[28px]">
                  {(!editEventStaff || editEventStaff.length === 0) && (
                    <span className="text-xs text-muted-foreground">No staff assigned yet.</span>
                  )}
                  {editEventStaff?.map((s: any) => (
                    <div key={s.id} className="bg-primary/5 border border-primary/20 rounded-xl p-2.5 flex flex-col gap-1.5 w-44">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-xs text-foreground">{s.employeeName}</span>
                        <button type="button" onClick={() => removeEditStaff(s.id)} className="hover:text-destructive transition-colors ml-1 shrink-0">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-0.5">Arrive before</label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              className="w-full rounded-lg border border-border bg-background px-1.5 py-1 text-[11px] text-foreground"
                              defaultValue={s.minutesBefore ?? ""}
                              placeholder="—"
                              onBlur={(e) => {
                                const val = e.target.value === "" ? null : parseInt(e.target.value);
                                updateStaffTiming({ assignmentId: s.id, minutesBefore: val });
                              }}
                            />
                            <span className="text-[10px] text-muted-foreground shrink-0">min</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-0.5">Stay after</label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              className="w-full rounded-lg border border-border bg-background px-1.5 py-1 text-[11px] text-foreground"
                              defaultValue={s.minutesAfter ?? ""}
                              placeholder="—"
                              onBlur={(e) => {
                                const val = e.target.value === "" ? null : parseInt(e.target.value);
                                updateStaffTiming({ assignmentId: s.id, minutesAfter: val });
                              }}
                            />
                            <span className="text-[10px] text-muted-foreground shrink-0">min</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {allEmployees && allEmployees.filter((e: any) => !editEventStaff?.some((s: any) => s.employeeId === e.id)).length > 0 && (
                  <Select onValueChange={(val) => addEditStaff(parseInt(val))}>
                    <SelectTrigger className="rounded-xl h-9 text-xs w-52">
                      <SelectValue placeholder="+ Add staff member" />
                    </SelectTrigger>
                    <SelectContent>
                      {allEmployees
                        .filter((e: any) => !editEventStaff?.some((s: any) => s.employeeId === e.id))
                        .map((emp: any) => (
                          <SelectItem key={emp.id} value={String(emp.id)}>{emp.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => setEditEvent(null)}>Cancel</Button>
                <Button type="submit" disabled={isUpdating} className="rounded-xl h-11 px-8">
                  {isUpdating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Comm tasks slide-out panel */}
      <CommTasksSheet
        event={tasksEvent}
        open={!!tasksEvent}
        onClose={() => setTasksEvent(null)}
        employees={allEmployees ?? []}
      />

      {/* Post-event debrief panel */}
      <DebriefSheet
        event={debriefEvent}
        onClose={() => setDebriefEvent(null)}
      />

      {/* Band lineup builder */}
      <LineupSheet
        event={lineupEvent}
        open={!!lineupEvent}
        onClose={() => setLineupEvent(null)}
      />

      {/* Packing list */}
      <PackingSheet
        event={packingEvent}
        open={!!packingEvent}
        onClose={() => setPackingEvent(null)}
      />
    </AppLayout>
  );
}
