import { useState, useEffect, useRef, type CSSProperties } from "react";
import { useSearch } from "wouter";
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
  List, CalendarDays, Radio, ClipboardList, Mail, Instagram, Printer, Globe, AlertCircle, MailWarning, ClipboardCheck, ImageIcon, Pencil, X, Users2, Music, Receipt, Package, FileText, UserCheck,
  Clock, ExternalLink, ChevronRight, Info, Ticket, Copy, Check, CheckCircle2, Trash2, Send, Users, Phone, UserRound, TrendingUp, Download, Mic
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format, isPast, differenceInDays } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { EventsCalendar } from "@/components/events-calendar";
import { useCommTasks, useUpdateCommTask, useSendLateReport, useUpdateEventEmployee, useTeamMembers, type CommTask } from "@/hooks/use-team";
import { DebriefSheet } from "@/components/debrief-sheet";
import { LineupSheet } from "@/components/lineup-sheet";
import { PackingSheet } from "@/components/packing-sheet";
import { StaffSlotsSheet } from "@/components/staff-slots-sheet";
import { SendInviteDialog } from "@/components/send-invite-dialog";
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
  const [pendingCompleteId, setPendingCompleteId] = useState<number | null>(null);
  const [pendingCompletedBy, setPendingCompletedBy] = useState<string>("");
  const { mutate: pushComms, isPending: pushing } = useMutation({
    mutationFn: () =>
      fetch(`/api/calendar/sync-comms/${event!.id}`, { method: "POST", credentials: "include" }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/comm-schedule/tasks`, event?.id] }),
  });
  const { mutate: bulkAssign, isPending: bulkAssigning } = useMutation({
    mutationFn: async (assignedToEmployeeId: number | null) => {
      const res = await fetch("/api/comm-schedule/tasks/bulk-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ eventId: event!.id, assignedToEmployeeId }),
      });
      if (!res.ok) throw new Error("Failed to bulk assign");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/comm-schedule/tasks`, event?.id] });
      toast({ title: `${data.updated} tasks assigned${data.assignedToEmployeeId ? " — notification email sent" : " — assignments cleared"}` });
    },
    onError: () => toast({ title: "Failed to assign tasks", variant: "destructive" }),
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  if (!event) return null;

  // Only staff can be credited for completing a comm task (no interns, no teachers)
  const eligibleEmployees = employees.filter((e: any) => e.role?.toLowerCase() === "staff");

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
    if (task.status === "done") {
      // Unchecking: immediately revert to pending, clear completion info
      updateTask(
        { id: task.id, eventId: event!.id, status: "pending" },
        { onError: () => toast({ title: "Failed to update task", variant: "destructive" }) }
      );
      if (pendingCompleteId === task.id) setPendingCompleteId(null);
    } else {
      // Checking: open inline "who completed this?" panel
      setPendingCompleteId(task.id);
      setPendingCompletedBy("");
    }
  }

  function confirmComplete(task: CommTask) {
    if (!pendingCompletedBy) return;
    updateTask(
      {
        id: task.id,
        eventId: event!.id,
        status: "done",
        completedByEmployeeId: parseInt(pendingCompletedBy),
      },
      {
        onSuccess: () => { setPendingCompleteId(null); setPendingCompletedBy(""); },
        onError: () => toast({ title: "Failed to mark task done", variant: "destructive" }),
      }
    );
  }

  function handlePushComms() {
    pushComms(undefined, {
      onSuccess: (data: any) => {
        if (data?.error) { toast({ title: data.error, variant: "destructive" }); return; }
        if (data?.total === 0 && data?.message) {
          toast({ title: "No comm tasks found", description: "Comm tasks are auto-generated when an event is confirmed.", variant: "destructive" });
          return;
        }
        const synced = data?.synced ?? 0;
        const skipped = data?.skipped ?? 0;
        if (synced === 0) {
          toast({ title: "All tasks already on calendar", description: `${skipped} task${skipped !== 1 ? "s" : ""} were already synced — nothing to do.` });
        } else {
          toast({ title: `${synced} task${synced !== 1 ? "s" : ""} pushed to Comms Calendar`, description: skipped > 0 ? `${skipped} were already synced and left untouched.` : undefined });
        }
      },
      onError: () => toast({ title: "Failed to sync comms to calendar", variant: "destructive" }),
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
              Comm tasks auto-generate when this event is confirmed.
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
            Sync to Comms Calendar
          </Button>
          <p className="text-xs text-muted-foreground mt-1.5 text-center leading-snug">
            Only pushes tasks missing a calendar entry — existing ones are never touched.
          </p>

          {employees.length > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <UserCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground shrink-0">Assign all to:</span>
              <Select
                onValueChange={(val) => bulkAssign(val === "clear" ? null : parseInt(val))}
                disabled={bulkAssigning}
              >
                <SelectTrigger className="rounded-xl h-8 text-xs flex-1">
                  <SelectValue placeholder={bulkAssigning ? "Assigning…" : "Pick a staff member…"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="clear" className="text-xs text-muted-foreground">— Clear all assignments —</SelectItem>
                  {employees.map((emp: any) => (
                    <SelectItem key={emp.id} value={String(emp.id)} className="text-xs">{emp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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
              <p className="text-sm">No comm tasks yet — they'll appear here once the event is confirmed.</p>
            </div>
          ) : (
            sorted.map(task => {
              const isDone = task.status === "done";
              const isLate = task.status === "late";
              const isPendingComplete = pendingCompleteId === task.id;
              const dateInfo = dueDateLabel(task.dueDate);
              return (
                <div
                  key={task.id}
                  className={`rounded-xl border transition-all
                    ${isDone
                      ? "bg-muted/20 border-border/30"
                      : isLate
                      ? "bg-amber-500/5 border-amber-500/40"
                      : isPendingComplete
                      ? "bg-primary/5 border-primary/40"
                      : "bg-card border-border/50"
                    }`}
                >
                  <div
                    onClick={() => !isPendingComplete && toggle(task)}
                    className={`flex items-start gap-3 p-3 select-none ${!isPendingComplete ? "cursor-pointer" : ""}`}
                  >
                    <Checkbox
                      checked={isDone || isPendingComplete}
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
                      {/* Completed by badge */}
                      {isDone && task.completedByEmployeeName && (
                        <div className="flex items-center gap-1 text-[11px] text-emerald-400">
                          <Check className="h-3 w-3" />
                          <span>Completed by <strong>{task.completedByEmployeeName}</strong></span>
                        </div>
                      )}
                      {/* Assignment dropdown (only when not in pending-complete mode) */}
                      {!isPendingComplete && eligibleEmployees.length > 0 && (
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
                              {eligibleEmployees.map((emp: any) => (
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
                  {/* Inline "who completed this?" panel */}
                  {isPendingComplete && (
                    <div className="px-3 pb-3 pt-0 flex items-center gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
                      <span className="text-[12px] text-muted-foreground">Who completed this?</span>
                      <Select value={pendingCompletedBy} onValueChange={setPendingCompletedBy}>
                        <SelectTrigger className="h-7 rounded-lg text-xs w-auto min-w-[140px] border-border/60 bg-card px-2">
                          <SelectValue placeholder="Select person…" />
                        </SelectTrigger>
                        <SelectContent>
                          {eligibleEmployees.map((emp: any) => (
                            <SelectItem key={emp.id} value={String(emp.id)} className="text-xs">{emp.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button
                        onClick={() => confirmComplete(task)}
                        disabled={!pendingCompletedBy}
                        className="h-7 px-3 rounded-lg text-xs bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors"
                      >
                        Mark Done
                      </button>
                      <button
                        onClick={() => { setPendingCompleteId(null); setPendingCompletedBy(""); }}
                        className="h-7 px-2 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
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

// ─── CallSheet ────────────────────────────────────────────────────────────────
function CallSheet({
  event,
  open,
  onClose,
}: {
  event: { id: number; title: string; type: string; startDate?: string | null; endDate?: string | null; location?: string | null } | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data: staff = [], isLoading: loadingStaff } = useQuery<any[]>({
    queryKey: [`/api/events/${event?.id}/employees`],
    queryFn: async () => {
      const res = await fetch(`/api/events/${event!.id}/employees`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!event,
  });

  const { data: staffSlots = [], isLoading: loadingSlots } = useQuery<any[]>({
    queryKey: [`/api/events/${event?.id}/staff-slots`],
    queryFn: async () => {
      const res = await fetch(`/api/events/${event!.id}/staff-slots`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!event,
  });

  if (!event) return null;

  function getArrivalTime(startDate: string | null | undefined, minutesBefore: number | null) {
    if (!startDate) return "—";
    const d = new Date(startDate);
    if (minutesBefore) d.setMinutes(d.getMinutes() - minutesBefore);
    return format(d, "h:mm a");
  }

  function getDepartureTime(endDate: string | null | undefined, minutesAfter: number | null) {
    if (!endDate) return "—";
    const d = new Date(endDate);
    if (minutesAfter) d.setMinutes(d.getMinutes() + minutesAfter);
    return format(d, "h:mm a");
  }

  const eventDateStr = event.startDate ? format(new Date(event.startDate), "EEEE, MMMM d, yyyy") : "";
  const startTimeStr = event.startDate ? format(new Date(event.startDate), "h:mm a") : "";
  const endTimeStr = event.endDate ? format(new Date(event.endDate), "h:mm a") : "";

  const isLoading = loadingStaff || loadingSlots;
  const hasContent = staff.length > 0 || staffSlots.length > 0;

  // Group slots by role name for the call sheet
  const slotsByRole = staffSlots.reduce((acc: Record<string, any[]>, s: any) => {
    const key = s.roleName ?? "Other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto flex flex-col gap-0 p-0 print:shadow-none print:border-0">
        {/* Header */}
        <div className="p-6 border-b border-border/50 bg-muted/10 print:bg-white print:border-gray-200">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SheetHeader className="space-y-1 text-left">
                <SheetTitle className="font-display text-xl leading-tight">{event.title}</SheetTitle>
              </SheetHeader>
              <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                {eventDateStr && <p>{eventDateStr}{startTimeStr && ` · ${startTimeStr}${endTimeStr && endTimeStr !== startTimeStr ? ` – ${endTimeStr}` : ""}`}</p>}
                {event.location && <p>{event.location}</p>}
                <p className="capitalize text-xs">{event.type}</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl shrink-0 print:hidden"
              onClick={() => window.print()}
            >
              <Printer className="h-3.5 w-3.5 mr-2" />
              Print
            </Button>
          </div>
        </div>

        <div className="flex-1 p-6 space-y-8">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !hasContent ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users2 className="h-10 w-10 mx-auto opacity-20 mb-3" />
              <p className="text-sm">No staff assigned to this event yet.</p>
              <p className="text-xs mt-1">Use the Staff Schedule to add role-based slots.</p>
            </div>
          ) : (
            <>
              {/* Role-based staff slots */}
              {staffSlots.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Role Assignments</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="text-left pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                          <th className="text-left pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role</th>
                          <th className="text-left pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shift Start</th>
                          <th className="text-left pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shift End</th>
                          <th className="text-left pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staffSlots.map((s: any) => (
                          <tr key={s.id} className="border-b border-border/30 hover:bg-muted/20">
                            <td className="py-3 pr-4 font-semibold text-foreground">
                              {s.assignedEmployeeName
                                ? s.assignedEmployeeName
                                : <span className="text-muted-foreground/50 italic font-normal text-xs">Unassigned</span>}
                            </td>
                            <td className="py-3 pr-4">
                              <span
                                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: `${s.roleColor ?? "#7250ef"}20`, color: s.roleColor ?? "#7250ef" }}
                              >
                                {s.roleName}
                              </span>
                            </td>
                            <td className="py-3 pr-4 font-medium text-foreground">
                              {s.startTime ? format(new Date(s.startTime), "EEE M/d, h:mm a") : "—"}
                            </td>
                            <td className="py-3 pr-4 font-medium text-foreground">
                              {s.endTime ? format(new Date(s.endTime), "EEE M/d, h:mm a") : "—"}
                            </td>
                            <td className="py-3 text-xs text-muted-foreground">{s.notes || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Legacy event_employees (general assignment) */}
              {staff.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">General Staff</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="text-left pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                          <th className="text-left pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role</th>
                          <th className="text-left pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Arrive By</th>
                          <th className="text-left pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Depart By</th>
                          <th className="text-left pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staff.map((s: any) => {
                          const arriveTime = getArrivalTime(event.startDate, s.minutesBefore);
                          const departTime = getDepartureTime(event.endDate, s.minutesAfter);
                          return (
                            <tr key={s.id} className="border-b border-border/30 hover:bg-muted/20">
                              <td className="py-3.5 pr-4 font-semibold text-foreground">{s.employeeName}</td>
                              <td className="py-3.5 pr-4 text-muted-foreground capitalize text-xs">{s.role || s.employeeRole || "—"}</td>
                              <td className="py-3.5 pr-4">
                                <span className="text-foreground font-medium">{arriveTime}</span>
                                {s.minutesBefore ? <span className="text-muted-foreground text-[11px] ml-1.5 block">{s.minutesBefore} min early</span> : null}
                              </td>
                              <td className="py-3.5 pr-4">
                                <span className="text-foreground font-medium">{departTime}</span>
                                {s.minutesAfter ? <span className="text-muted-foreground text-[11px] ml-1.5 block">{s.minutesAfter} min after</span> : null}
                              </td>
                              <td className="py-3.5 text-xs text-muted-foreground">{s.notes || "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
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
  { value: "none", label: "No Tag — Keep off public calendar", color: null },
  { value: "TW",  label: "Teachers in the Wild",              color: "#ff4329" },
  { value: "MSH", label: "Music Space Hosted Event",          color: "#00b199" },
  { value: "MSS", label: "Music Space Sponsored Event",       color: "#cddb29" },
  { value: "CF",  label: "Community Friends Event",           color: "#94a3b8" },
  { value: "CAL", label: "Music Space Calendar Event",        color: "#7250ef" },
];

function tagStyle(tagValue: string | null | undefined): CSSProperties {
  const color = CALENDAR_TAGS.find(t => t.value === tagValue)?.color;
  if (!color) return {};
  return {
    backgroundColor: `${color}22`,
    color,
    borderColor: `${color}55`,
  };
}

function fmt12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Split date + time picker — time snaps to 15-min intervals properly
const EVENT_TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  const pad = (n: number) => String(n).padStart(2, "0");
  const value = `${pad(h)}:${pad(m)}`;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return { value, label: `${h12}:${pad(m)} ${period}` };
});

function DateTimeSplit({ value, onChange, onBlur }: { value?: string; onChange: (v: string) => void; onBlur?: () => void }) {
  const datePart = value ? value.split("T")[0] : "";
  const timePart = value ? (value.split("T")[1] ?? "").slice(0, 5) : "";
  const combine = (d: string, t: string) => d ? `${d}T${t || "00:00"}` : "";
  return (
    <div className="flex gap-2">
      <Input
        type="date"
        value={datePart}
        onChange={e => onChange(combine(e.target.value, timePart))}
        onBlur={onBlur}
        className="rounded-xl flex-1"
      />
      <Select value={timePart} onValueChange={t => { onChange(combine(datePart, t)); onBlur?.(); }}>
        <SelectTrigger className="rounded-xl w-[120px]">
          <SelectValue placeholder="Time" />
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-60 overflow-y-auto">
          {EVENT_TIME_OPTIONS.map(o => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function localsToUtc(data: Record<string, any>) {
  const out = { ...data };
  if (out.startDate) out.startDate = new Date(out.startDate).toISOString();
  if (out.endDate) out.endDate = new Date(out.endDate).toISOString();
  if (out.signupDeadline) out.signupDeadline = new Date(out.signupDeadline).toISOString();
  return out;
}

const eventSchema = z.object({
  title: z.string().min(1, "Title is required"),
  type: z.string().min(1, "Type is required"),
  status: z.string().min(1, "Status is required"),
  location: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  isTwoDay: z.boolean().default(false),
  day1EndTime: z.string().optional(),
  day2StartTime: z.string().optional(),
  calendarTag: z.string().optional(),
  isPaid: z.boolean().default(false),
  revenue: z.coerce.number().optional(),
  cost: z.coerce.number().optional(),
  notes: z.string().optional(),
  flyerUrl: z.string().optional(),
  ticketsUrl: z.string().optional(),
  ctaLabel: z.string().optional(),
  ticketFormType: z.string().optional(),
  ticketPrice: z.coerce.number().min(0).optional(),
  day1Price: z.coerce.number().min(0).optional(),
  day2Price: z.coerce.number().min(0).optional(),
  externalTicketSales: z.coerce.number().min(0).optional(),
  revenueSharePercent: z.coerce.number().min(0).max(100).optional(),
  perTicketVenueFee: z.coerce.number().min(0).optional(),
  hasBandLineup: z.boolean().default(false),
  hasStaffSchedule: z.boolean().default(false),
  hasCallSheet: z.boolean().default(false),
  hasPackingList: z.boolean().default(false),
  allowGuestList: z.boolean().default(false),
  hasDebrief: z.boolean().default(false),
  isLeadGenerating: z.boolean().default(false),
  guestListPolicy: z.string().optional(),
  hasPoc: z.boolean().default(false),
  pocName: z.string().optional(),
  pocEmail: z.string().optional(),
  pocPhone: z.string().optional(),
  primaryStaffId: z.string().nullable().optional(),
});

// ─── Shared helpers ───────────────────────────────────────────────────────────
function getStatusColor(status: string) {
  switch (status) {
    case 'confirmed': return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    case 'completed': return "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20";
    case 'cancelled': return "bg-destructive/15 text-destructive border-destructive/20";
    default: return "bg-secondary text-secondary-foreground";
  }
}

// ─── TicketFormLinkRow ────────────────────────────────────────────────────────
function TicketFormLinkRow({ event }: { event: any }) {
  const [copied, setCopied] = useState(false);
  const domain = window.location.origin;
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
  const url = `${domain}${base}/ticket/${event.signupToken}`;
  const label = event.ticketFormType === "recital" ? "Recital Registration Form" : "Ticket Request Form";

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Ticket className="h-3.5 w-3.5 text-primary shrink-0" />
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate flex-1">
        {label}
      </a>
      <button onClick={handleCopy} title="Copy link" className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
        {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ─── GuestListLinkButton ──────────────────────────────────────────────────────
function GuestListLinkButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}
      title="Copy parent registration link"
      className="text-muted-foreground hover:text-primary transition-colors"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

// ─── CheckInToggle ────────────────────────────────────────────────────────────
function CheckInToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-1 text-[10px] font-medium rounded-md px-1.5 py-0.5 transition-all border ${checked ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/25" : "text-muted-foreground border-border/40 hover:border-emerald-500/40"}`}
    >
      <span className={`h-2.5 w-2.5 rounded-full border flex items-center justify-center ${checked ? "bg-emerald-500 border-emerald-500" : "border-muted-foreground/40"}`}>
        {checked && <span className="block h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
      {label}
    </button>
  );
}

// ─── EventOverviewSheet ───────────────────────────────────────────────────────
type OverviewEvent = any;
type OverviewActions = {
  onEdit: (ev: OverviewEvent) => void;
  onTasks: (ev: OverviewEvent) => void;
  onDebrief: (ev: OverviewEvent) => void;
  onLineup: (ev: OverviewEvent) => void;
  onStaffSlots: (ev: OverviewEvent) => void;
  onCallSheet: (ev: OverviewEvent) => void;
  onInvite: (ev: OverviewEvent) => void;
  onPacking: (ev: OverviewEvent) => void;
  onDelete: (ev: OverviewEvent) => void;
};

function EventOverviewSheet({
  event,
  open,
  onClose,
  actions,
  canViewFinances,
}: {
  event: OverviewEvent | null;
  open: boolean;
  onClose: () => void;
  actions: OverviewActions;
  canViewFinances?: boolean;
}) {
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: ticketRequests, refetch: refetchTickets } = useQuery<any[]>({
    queryKey: [`/api/events/${event?.id}/ticket-requests`],
    queryFn: () => fetch(`/api/events/${event!.id}/ticket-requests`).then(r => r.json()),
    enabled: !!event?.id && !!event?.ticketFormType && event?.ticketFormType !== "none",
  });
  const { data: eventSignups = [] } = useQuery<any[]>({
    queryKey: [`/api/events/${event?.id}/signups`],
    queryFn: () => fetch(`/api/events/${event!.id}/signups`, { credentials: "include" }).then(r => r.json()),
    enabled: !!event?.id,
  });
  const { data: openMicPerformers = [] } = useQuery<any[]>({
    queryKey: [`/api/open-mic/events/${event?.id}/performers`],
    queryFn: () => fetch(`/api/open-mic/events/${event!.id}/performers`, { credentials: "include" }).then(r => r.json()),
    enabled: !!event?.id && !!event?.openMicSeriesId,
  });
  const { mutate: remindSignups, isPending: remindingSignups } = useMutation({
    mutationFn: () => fetch(`/api/events/${event!.id}/signups/remind`, { method: "POST", credentials: "include" }).then(r => r.json()),
    onSuccess: (d) => toast({ title: d.sent > 0 ? `Sent ${d.sent} reminder${d.sent !== 1 ? "s" : ""}` : "No signups with email addresses" }),
    onError: () => toast({ title: "Failed to send reminders", variant: "destructive" }),
  });
  const { mutate: remindTickets, isPending: remindingTickets } = useMutation({
    mutationFn: () => fetch(`/api/events/${event!.id}/ticket-requests/remind`, { method: "POST", credentials: "include" }).then(r => r.json()),
    onSuccess: (d) => toast({ title: d.sent > 0 ? `Sent ${d.sent} reminder${d.sent !== 1 ? "s" : ""}` : "No registrants with email addresses" }),
    onError: () => toast({ title: "Failed to send reminders", variant: "destructive" }),
  });

  const { mutate: toggleCharged } = useMutation({
    mutationFn: async ({ requestId, charged }: { requestId: number; charged: boolean }) => {
      const res = await fetch(`/api/events/${event!.id}/ticket-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ charged }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => refetchTickets(),
  });

  const { mutate: updateTicketStatus } = useMutation({
    mutationFn: async ({ requestId, status }: { requestId: number; status: string }) => {
      const res = await fetch(`/api/events/${event!.id}/ticket-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => refetchTickets(),
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  const { mutate: deleteTicketRequest } = useMutation({
    mutationFn: async (requestId: number) => {
      const res = await fetch(`/api/events/${event!.id}/ticket-requests/${requestId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      refetchTickets();
      toast({ title: "Registration removed" });
    },
    onError: () => toast({ title: "Failed to remove registration", variant: "destructive" }),
  });

  // ── Guest list ────────────────────────────────────────────────────────────────
  const { data: guestListEntries = [], refetch: refetchGuestList } = useQuery<any[]>({
    queryKey: [`/api/events/${event?.id}/guest-list`],
    queryFn: () => fetch(`/api/events/${event!.id}/guest-list`, { credentials: "include" }).then(r => r.json()),
    enabled: !!event?.id && !!event?.allowGuestList,
  });

  const { mutate: generateGuestList, isPending: generatingGuestList } = useMutation({
    mutationFn: () => fetch(`/api/events/${event!.id}/guest-list/generate`, { method: "POST", credentials: "include" }).then(r => r.json()),
    onSuccess: (d) => {
      toast({ title: `Generated ${d.created} entr${d.created !== 1 ? "ies" : "y"}${d.skipped > 0 ? `, ${d.skipped} already existed` : ""}` });
      refetchGuestList();
    },
    onError: () => toast({ title: "Failed to generate guest list", variant: "destructive" }),
  });

  const { mutate: toggleGuestCheckin } = useMutation({
    mutationFn: async ({ entryId, field, value }: { entryId: number; field: string; value: boolean }) => {
      const res = await fetch(`/api/events/${event!.id}/guest-list/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => refetchGuestList(),
  });

  const { mutate: deleteGuestEntry } = useMutation({
    mutationFn: async (entryId: number) => {
      await fetch(`/api/events/${event!.id}/guest-list/${entryId}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => refetchGuestList(),
  });

  const [showAddManual, setShowAddManual] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualBand, setManualBand] = useState("");
  const { mutate: addManual, isPending: addingManual } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/events/${event!.id}/guest-list/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentName: manualName, bandName: manualBand }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to add");
      return res.json();
    },
    onSuccess: () => { refetchGuestList(); setShowAddManual(false); setManualName(""); setManualBand(""); },
    onError: () => toast({ title: "Failed to add entry", variant: "destructive" }),
  });

  const { mutate: sendGuestListLinks, isPending: sendingGuestListLinks } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/events/${event!.id}/guest-list/send-links`, { method: "POST", credentials: "include" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed to send"); }
      return res.json();
    },
    onSuccess: (d) => toast({ title: d.message || `Sent ${d.sent} emails` }),
    onError: (e: any) => toast({ title: e.message || "Failed to send guest list links", variant: "destructive" }),
  });

  function printGuestList() {
    if (!event || guestListEntries.length === 0) return;
    const eventTitle = event.title;
    const eventDate = event.startDate ? new Date(event.startDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";
    const policy = event.guestListPolicy === "plus_two" ? "+2" : event.guestListPolicy === "plus_one" ? "+1" : "Students only";
    const plusOneCol = event.guestListPolicy === "plus_one" || event.guestListPolicy === "plus_two";
    const plusTwoCol = event.guestListPolicy === "plus_two";

    const rows = guestListEntries.map((e: any) => `
      <tr>
        <td>${e.studentName ?? ""}</td>
        <td>${e.bandName ?? ""}</td>
        <td>${e.contactName ?? ""}${e.contactEmail ? `<br><span style="color:#888;font-size:12px;">${e.contactEmail}</span>` : ""}</td>
        ${plusOneCol ? `<td>${e.guestOneName ?? ""}</td>` : ""}
        ${plusTwoCol ? `<td>${e.guestTwoName ?? ""}</td>` : ""}
        <td style="text-align:center;">${e.submitted ? "✓" : ""}</td>
        <td style="text-align:center;">${e.studentCheckedIn ? "✓" : ""}</td>
        ${plusOneCol ? `<td style="text-align:center;">${e.guestOneCheckedIn ? "✓" : ""}</td>` : ""}
        ${plusTwoCol ? `<td style="text-align:center;">${e.guestTwoCheckedIn ? "✓" : ""}</td>` : ""}
      </tr>
    `).join("");

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html><head><title>Guest List — ${eventTitle}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; color: #111; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p { margin: 0 0 16px; color: #555; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f0f0f0; text-align: left; padding: 7px 8px; border: 1px solid #ddd; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
  td { padding: 7px 8px; border: 1px solid #ddd; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  @media print { body { margin: 0; } }
</style></head><body>
<h1>Guest List — ${eventTitle}</h1>
<p>${eventDate}${eventDate && policy ? " · " : ""}${policy} · ${guestListEntries.length} entr${guestListEntries.length !== 1 ? "ies" : "y"}</p>
<table>
  <thead><tr>
    <th>Student</th><th>Band</th><th>Contact</th>
    ${plusOneCol ? "<th>Guest +1</th>" : ""}
    ${plusTwoCol ? "<th>Guest +2</th>" : ""}
    <th>Submitted</th><th>✓ Student</th>
    ${plusOneCol ? "<th>✓ +1</th>" : ""}
    ${plusTwoCol ? "<th>✓ +2</th>" : ""}
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<script>window.onload = () => { window.print(); }</script>
</body></html>`);
    win.document.close();
  }

  if (!event) return null;

  const startDate = event.startDate ? new Date(event.startDate) : null;
  const endDate = event.endDate ? new Date(event.endDate) : null;
  const ACTIONS = [
    { label: "Edit Event", icon: <Pencil className="h-4 w-4" />, color: "text-primary", bg: "hover:bg-primary/10", fn: () => { onClose(); actions.onEdit(event); } },
    { label: "Comm Tasks", icon: <ClipboardList className="h-4 w-4" />, color: "text-foreground", bg: "hover:bg-muted/60", fn: () => { onClose(); actions.onTasks(event); } },
    ...(event.hasDebrief ? [{ label: "Post-Event Debrief", icon: <ClipboardCheck className="h-4 w-4" />, color: "text-[#00b199]", bg: "hover:bg-[#00b199]/10", fn: () => { onClose(); actions.onDebrief(event); } }] : []),
    ...(event.hasBandLineup ? [{ label: event.type === "Recital" ? "Recital Order" : "Band Lineup", icon: <Music className="h-4 w-4" />, color: "text-primary", bg: "hover:bg-primary/10", fn: () => { onClose(); actions.onLineup(event); } }] : []),
    ...(event.hasStaffSchedule ? [{ label: "Staff Schedule", icon: <Users2 className="h-4 w-4" />, color: "text-emerald-500", bg: "hover:bg-emerald-500/10", fn: () => { onClose(); actions.onStaffSlots(event); } }] : []),
    ...(event.hasCallSheet ? [{ label: "Call Sheet", icon: <FileText className="h-4 w-4" />, color: "text-sky-400", bg: "hover:bg-sky-500/10", fn: () => { onClose(); actions.onCallSheet(event); } }] : []),
    { label: "Send Invite", icon: <Mail className="h-4 w-4" />, color: "text-violet-400", bg: "hover:bg-violet-500/10", fn: () => { onClose(); actions.onInvite(event); } },
    ...(event.hasPackingList ? [{ label: "Packing List", icon: <Package className="h-4 w-4" />, color: "text-amber-400", bg: "hover:bg-amber-500/10", fn: () => { onClose(); actions.onPacking(event); } }] : []),
  ];

  const handleDeleteConfirm = () => {
    setConfirmDelete(false);
    onClose();
    actions.onDelete(event);
  };

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:w-full sm:max-w-xl overflow-y-auto flex flex-col gap-0 p-0">
        {/* Hero image */}
        {event.imageUrl && (
          <div className="w-full h-48 overflow-hidden shrink-0">
            <img src={event.imageUrl} alt={event.title} className="w-full h-full object-cover" />
          </div>
        )}

        {/* Header */}
        <div className={`p-6 border-b border-border/50 ${event.imageUrl ? "" : "pt-8"}`}>
          <div className="flex items-start gap-3">
            {!event.imageUrl && (
              <div className="h-12 w-12 rounded-xl bg-muted/40 border border-border/30 shrink-0 flex items-center justify-center">
                <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <SheetHeader className="space-y-1 text-left">
                <SheetTitle className="font-display text-xl leading-tight">{event.title}</SheetTitle>
              </SheetHeader>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Badge variant="outline" className="text-xs capitalize text-muted-foreground border-border/50">{event.type}</Badge>
                <Badge variant="outline" className={`text-xs capitalize ${getStatusColor(event.status)}`}>{event.status}</Badge>
                {canViewFinances && (event.isPaid ? (
                  <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-semibold tracking-wide">PAID</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground bg-muted/50 border-border/50">UNPAID</Badge>
                ))}
                <div className="flex items-center gap-1 ml-auto">
                  <CalendarPushButton eventId={event.id} />
                  <CommsPushButton eventId={event.id} eventTitle={event.title} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 p-6 space-y-6 overflow-y-auto">
          {/* Date & Time */}
          {startDate && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                Date & Time
                {event.isTwoDay && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 normal-case">2-Day Event</span>}
              </h4>
              {event.isTwoDay ? (
                <div className="space-y-2">
                  <div className="rounded-xl bg-muted/30 border border-border/30 px-3 py-2.5 space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Day 1 · {format(startDate, "EEE, MMMM d, yyyy")}</p>
                    <div className="flex items-center gap-2 text-sm text-foreground">
                      <Clock className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                      <span>
                        {format(startDate, "h:mm a")}
                        {event.day1EndTime ? ` – ${fmt12(event.day1EndTime)}` : ""}
                      </span>
                    </div>
                  </div>
                  {endDate && (
                    <div className="rounded-xl bg-muted/30 border border-border/30 px-3 py-2.5 space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Day 2 · {format(endDate, "EEE, MMMM d, yyyy")}</p>
                      <div className="flex items-center gap-2 text-sm text-foreground">
                        <Clock className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                        <span>
                          {event.day2StartTime ? fmt12(event.day2StartTime) : "?"}
                          {` – ${format(endDate, "h:mm a")}`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <CalendarCheck className="h-4 w-4 text-primary/70 shrink-0" />
                    <span>{format(startDate, "EEEE, MMMM d, yyyy")}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4 shrink-0 opacity-60" />
                    <span>
                      {format(startDate, "h:mm a")}
                      {endDate ? ` – ${format(endDate, "h:mm a")}` : ""}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Location */}
          {event.location && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Location</h4>
              <div className="flex items-center gap-2 text-sm text-foreground">
                <MapPin className="h-4 w-4 text-primary/70 shrink-0" />
                <span>{event.location}</span>
              </div>
            </div>
          )}

          {/* Point of Contact */}
          {(event.pocName || event.pocEmail || event.pocPhone) && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Point of Contact</h4>
              <div className="space-y-1">
                {event.pocName && (
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <UserRound className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                    <span>{event.pocName}</span>
                  </div>
                )}
                {event.pocEmail && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                    <a href={`mailto:${event.pocEmail}`} className="text-primary hover:underline">{event.pocEmail}</a>
                  </div>
                )}
                {event.pocPhone && (
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <Phone className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                    <a href={`tel:${event.pocPhone}`} className="hover:underline">{event.pocPhone}</a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Financials */}
          {canViewFinances && (() => {
            const eventFee = event.revenue ? parseFloat(event.revenue as string) : 0;
            const expense = event.cost ? parseFloat(event.cost as string) : 0;
            const externalSales = (event as any).externalTicketSales ? parseFloat((event as any).externalTicketSales) : 0;
            const isRecitalSection = event.ticketFormType === "recital";
            const unitPrice = event.ticketPrice ? parseFloat(event.ticketPrice as string) : (isRecitalSection ? 30 : 0);
            const internalTicketTotal = ticketRequests
              ? (ticketRequests as any[]).filter(r => r.charged).reduce((sum, r) => {
                  const rawPrice = (event as any).isTwoDay && r.ticketType
                    ? r.ticketType === "day1" ? (event as any).day1Price
                    : r.ticketType === "day2" ? (event as any).day2Price
                    : event.ticketPrice : event.ticketPrice;
                  const price = rawPrice ? parseFloat(rawPrice) : unitPrice;
                  const count = r.ticketCount ?? (isRecitalSection ? 1 : 0);
                  return sum + price * count;
                }, 0)
              : 0;
            const staffPayTotal = event.staffPayTotal ? parseFloat(event.staffPayTotal) : 0;
            const sharePercent = (event as any).revenueSharePercent ?? 100;
            const perTicketFee = (event as any).perTicketVenueFee ? parseFloat((event as any).perTicketVenueFee) : 0;
            const totalTicketCount = ticketRequests
              ? (ticketRequests as any[]).filter(r => r.charged).reduce((s: number, r: any) => s + (r.ticketCount ?? (isRecitalSection ? 1 : 0)), 0)
              : 0;
            const grossTicketRevenue = internalTicketTotal + externalSales;
            const netTicketRevenue = grossTicketRevenue * (sharePercent / 100);
            const venueFees = totalTicketCount * perTicketFee;
            const totalIncome = eventFee + netTicketRevenue;
            const net = totalIncome - venueFees - expense - staffPayTotal;
            const splitDeduction = grossTicketRevenue - netTicketRevenue;
            const hasAny = eventFee > 0 || expense > 0 || grossTicketRevenue > 0 || staffPayTotal > 0;
            if (!hasAny) return null;
            return (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5" /> Financials
                  <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${net >= 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-blue-500/10 text-blue-400"}`}>
                    {net >= 0 ? "+" : ""}${net.toFixed(2)} net
                  </span>
                </h4>
                <div className="rounded-xl border border-border/30 bg-muted/20 divide-y divide-border/20 text-sm overflow-hidden">
                  {eventFee > 0 && (
                    <div className="flex items-center justify-between px-3 py-2">
                      <span className="text-muted-foreground text-xs">Event fee / gig pay</span>
                      <span className="font-semibold text-emerald-500">+${eventFee.toFixed(2)}</span>
                    </div>
                  )}
                  {internalTicketTotal > 0 && (
                    <div className="flex items-center justify-between px-3 py-2">
                      <span className="text-muted-foreground text-xs">Ticket sales <span className="text-muted-foreground/50">(internal, gross)</span></span>
                      <span className="font-semibold text-emerald-500">+${internalTicketTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {externalSales > 0 && (
                    <div className="flex items-center justify-between px-3 py-2">
                      <span className="text-muted-foreground text-xs">Ticket sales <span className="text-muted-foreground/50">(external, gross)</span></span>
                      <span className="font-semibold text-emerald-500">+${externalSales.toFixed(2)}</span>
                    </div>
                  )}
                  {splitDeduction > 0 && (
                    <div className="flex items-center justify-between px-3 py-2">
                      <span className="text-muted-foreground text-xs">Venue revenue split <span className="text-muted-foreground/50">({sharePercent}% kept)</span></span>
                      <span className="font-semibold text-blue-400">-${splitDeduction.toFixed(2)}</span>
                    </div>
                  )}
                  {venueFees > 0 && (
                    <div className="flex items-center justify-between px-3 py-2">
                      <span className="text-muted-foreground text-xs">Per-ticket venue fee <span className="text-muted-foreground/50">({totalTicketCount} × ${perTicketFee.toFixed(2)})</span></span>
                      <span className="font-semibold text-blue-400">-${venueFees.toFixed(2)}</span>
                    </div>
                  )}
                  {expense > 0 && (
                    <div className="flex items-center justify-between px-3 py-2">
                      <span className="text-muted-foreground text-xs">Cost / sponsorship</span>
                      <span className="font-semibold text-blue-400">-${expense.toFixed(2)}</span>
                    </div>
                  )}
                  {staffPayTotal > 0 && (
                    <div className="flex items-center justify-between px-3 py-2">
                      <span className="text-muted-foreground text-xs">Staff pay</span>
                      <span className="font-semibold text-blue-400">-${staffPayTotal.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Net</span>
                    <span className={`font-bold text-sm ${net >= 0 ? "text-emerald-500" : "text-blue-400"}`}>{net >= 0 ? "+" : ""}${net.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            );
          })?.()}

          {/* Description / Notes */}
          {event.description && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</h4>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{event.description}</p>
            </div>
          )}

          {event.notes && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Internal Notes</h4>
              <div className="p-3 rounded-xl bg-muted/30 border border-border/40">
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{event.notes}</p>
              </div>
            </div>
          )}

          {/* Website fields */}
          {(event.flyerUrl || event.ticketsUrl || (event.ticketFormType && event.ticketFormType !== "none")) && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Website</h4>
              <div className="space-y-2">
                {event.ticketsUrl && event.ctaLabel !== "none" && (!event.ticketFormType || event.ticketFormType === "none") && (
                  <a href={event.ticketsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{event.ctaLabel || "Tickets"} link</span>
                  </a>
                )}
                {event.flyerUrl && (
                  <a href={event.flyerUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Flyer image</span>
                  </a>
                )}
                {event.ticketFormType && event.ticketFormType !== "none" && event.signupToken && (
                  <TicketFormLinkRow event={event} />
                )}
              </div>
            </div>
          )}

          {/* Ticket requests */}
          {event.ticketFormType && event.ticketFormType !== "none" && ticketRequests && ticketRequests.length > 0 && (() => {
            const isRecitalSection = event.ticketFormType === "recital";
            const sectionUnitPrice = event.ticketPrice ? parseFloat(event.ticketPrice) : (isRecitalSection ? 30 : null);
            const chargedDollarTotal = (ticketRequests as any[]).filter(r => r.charged).reduce((sum, r) => {
              const rawPrice = (event as any).isTwoDay && r.ticketType
                ? r.ticketType === "day1" ? (event as any).day1Price
                : r.ticketType === "day2" ? (event as any).day2Price
                : event.ticketPrice : event.ticketPrice;
              const price = rawPrice ? parseFloat(rawPrice) : (sectionUnitPrice ?? 0);
              const count = r.ticketCount ?? (isRecitalSection ? 1 : 0);
              return sum + price * count;
            }, 0);
            return (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 flex-wrap">
                <Ticket className="h-3.5 w-3.5" /> {isRecitalSection ? "Recital Signups" : "Ticket Requests"}
                <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[10px] font-bold">{ticketRequests.length}</span>
                {sectionUnitPrice != null && (
                  <span className="text-muted-foreground/60 text-[10px]">${sectionUnitPrice.toFixed(2)}/{isRecitalSection ? "performer" : "ticket"}</span>
                )}
                <span className="text-emerald-500/80 text-[10px] font-medium">
                  {(ticketRequests as any[]).filter(r => r.charged).length}/{ticketRequests.length} charged
                  {chargedDollarTotal > 0 && ` · $${chargedDollarTotal.toFixed(2)}`}
                </span>
              </h4>
              {/* Table header */}
              <div className="grid grid-cols-[44px_1fr_auto] gap-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-2 pb-1 border-b border-border/20">
                <span className="text-center">Chrgd</span>
                <span>Name / Details</span>
                <span className="text-right">Status</span>
              </div>
              <div className="space-y-1 max-h-[420px] overflow-y-auto">
                {ticketRequests.map((r: any, idx: number) => {
                  const resolvedPrice = (event as any).isTwoDay && r.ticketType
                    ? r.ticketType === "day1" ? (event as any).day1Price
                    : r.ticketType === "day2" ? (event as any).day2Price
                    : event.ticketPrice
                    : event.ticketPrice;
                  const price = resolvedPrice ? parseFloat(resolvedPrice) : (isRecitalSection ? sectionUnitPrice : null);
                  const rowCount = r.ticketCount ?? (isRecitalSection ? 1 : 0);
                  const lineTotal = price && rowCount ? (price * rowCount).toFixed(2) : null;
                  const isRecitalEntry = r.formType === "recital" && r.studentFirstName;
                  return (
                  <div key={r.id} className={`grid grid-cols-[44px_1fr_auto] gap-0 items-start rounded-xl border transition-colors text-xs ${r.charged ? "bg-emerald-500/8 border-emerald-500/25" : "bg-muted/30 border-border/30 hover:border-border/50"}`}>
                    {/* Big charge checkbox */}
                    <div className="flex items-start justify-center pt-3 pb-2">
                      <button
                        onClick={() => toggleCharged({ requestId: r.id, charged: !r.charged })}
                        title={r.charged ? `Charged on ${r.chargedAt ? new Date(r.chargedAt).toLocaleDateString() : "?"}` : "Mark as charged"}
                        className={`h-7 w-7 rounded-lg border-2 flex items-center justify-center transition-all shadow-sm ${
                          r.charged
                            ? "bg-emerald-500 border-emerald-500 text-white shadow-emerald-500/30"
                            : "border-border/60 bg-background hover:border-emerald-500 hover:bg-emerald-500/5"
                        }`}
                      >
                        {r.charged && <CheckCircle2 className="h-4 w-4" />}
                      </button>
                    </div>

                    {/* Name + details */}
                    <div className="py-2.5 pr-2 min-w-0">
                      {isRecitalEntry ? (
                        <>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-primary/60 tabular-nums">#{idx + 1}</span>
                            <span className="font-semibold text-foreground text-[13px] leading-tight">{r.studentFirstName} {r.studentLastName}</span>
                          </div>
                          <div className="text-muted-foreground text-[11px] mt-0.5">
                            {[r.instrument, r.recitalSong].filter(Boolean).join(" · ")}
                          </div>
                          {r.teacher && <div className="text-muted-foreground text-[11px]">Teacher: {r.teacher}</div>}
                          {r.specialConsiderations && (
                            <div className="text-amber-500/80 text-[11px] mt-0.5">⚠ {r.specialConsiderations}</div>
                          )}
                          <div className="text-muted-foreground/60 text-[11px] mt-1 truncate">
                            {r.contactFirstName} {r.contactLastName} · {r.contactEmail}
                          </div>
                          {lineTotal && (
                            <div className="text-[11px] mt-0.5">
                              <span className="font-bold text-foreground">${lineTotal}</span>
                            </div>
                          )}
                          {r.charged && r.chargedAt && (
                            <div className="text-emerald-500 text-[10px] font-medium mt-0.5">✓ Charged {new Date(r.chargedAt).toLocaleDateString()}</div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="font-semibold text-foreground text-[13px] leading-tight">{r.contactFirstName} {r.contactLastName}</div>
                          <div className="text-muted-foreground text-[11px] truncate mt-0.5">{r.contactEmail}</div>
                          {r.ticketCount && (
                            <div className="text-[11px] mt-0.5">
                              <span className="text-muted-foreground">{r.ticketCount} ticket{r.ticketCount !== 1 ? "s" : ""}</span>
                              {r.ticketType && (event as any).isTwoDay && (
                                <span className="ml-1 text-muted-foreground/60">
                                  · {r.ticketType === "day1" ? "Day 1" : r.ticketType === "day2" ? "Day 2" : "Both Days"}
                                </span>
                              )}
                              {lineTotal && <span className="ml-1.5 font-bold text-foreground">${lineTotal}</span>}
                            </div>
                          )}
                          {r.charged && r.chargedAt && (
                            <div className="text-emerald-500 text-[10px] font-medium mt-0.5">✓ Charged {new Date(r.chargedAt).toLocaleDateString()}</div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Status + delete */}
                    <div className="flex flex-col items-end gap-1.5 py-2.5 pr-2.5">
                      <select
                        value={r.status}
                        onChange={e => updateTicketStatus({ requestId: r.id, status: e.target.value })}
                        className={`rounded-lg px-1.5 py-0.5 text-[10px] font-semibold capitalize border-0 outline-none cursor-pointer ${
                          r.status === "confirmed" ? "bg-emerald-500/10 text-emerald-600" :
                          r.status === "cancelled" ? "bg-destructive/10 text-destructive" :
                          "bg-amber-500/10 text-amber-600"
                        }`}
                      >
                        <option value="pending">pending</option>
                        <option value="confirmed">confirmed</option>
                        <option value="cancelled">cancelled</option>
                      </select>
                      <button
                        onClick={() => {
                          const name = isRecitalEntry
                            ? `${r.studentFirstName} ${r.studentLastName ?? ""}`.trim()
                            : `${r.contactFirstName} ${r.contactLastName ?? ""}`.trim();
                          if (window.confirm(`Remove ${name}'s registration? This will also remove them from the performance order if present.`)) {
                            deleteTicketRequest(r.id);
                          }
                        }}
                        title="Delete registration"
                        className="text-muted-foreground/40 hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
            );
          })()}
          {event.ticketFormType && event.ticketFormType !== "none" && ticketRequests && ticketRequests.length === 0 && (
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Ticket className="h-3.5 w-3.5" />
              {event.ticketFormType === "recital" ? "No recital signups yet — share the registration link with families." : "No ticket requests yet — share the form link with parents."}
            </div>
          )}
          {event.ticketFormType && event.ticketFormType !== "none" && ticketRequests && ticketRequests.length > 0 && (
            <button
              onClick={() => {
                const eligible = ticketRequests.filter((r: any) => r.contactEmail && r.status !== "cancelled").length;
                if (window.confirm(`This will send a reminder email to ${eligible} ${event.ticketFormType === "recital" ? "recital registrant" : "registrant"}${eligible !== 1 ? "s" : ""}. Continue?`)) remindTickets();
              }}
              disabled={remindingTickets}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {remindingTickets ? "Sending reminders…" : `Send reminders to all ${event.ticketFormType === "recital" ? "registrants" : "registrants"}`}
            </button>
          )}

          {/* Guest list */}
          {event.allowGuestList && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Guest List
                  <span className="ml-1 bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[10px] font-bold">{guestListEntries.length}</span>
                </h4>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {event.guestListPolicy === "students_only" ? "Students only" : event.guestListPolicy === "plus_one" ? "+1 allowed" : "+2 allowed"}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => generateGuestList()}
                  disabled={generatingGuestList}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 border border-border/40 rounded-lg px-2.5 py-1"
                >
                  {generatingGuestList ? <Loader2 className="h-3 w-3 animate-spin" /> : <Users className="h-3 w-3" />}
                  Generate from Lineup
                </button>
                <button
                  onClick={() => setShowAddManual(v => !v)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-border/40 rounded-lg px-2.5 py-1"
                >
                  <Plus className="h-3 w-3" /> Add Manual
                </button>
                {guestListEntries.length > 0 && (
                  <button
                    onClick={() => printGuestList()}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-border/40 rounded-lg px-2.5 py-1"
                  >
                    <Printer className="h-3 w-3" /> Print
                  </button>
                )}
              </div>

              {/* Add manual form */}
              {showAddManual && (
                <div className="flex items-end gap-2 p-2.5 rounded-xl border border-border/40 bg-muted/30">
                  <div className="flex-1 space-y-1.5">
                    <input
                      className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs"
                      placeholder="Name / VIP *"
                      value={manualName}
                      onChange={e => setManualName(e.target.value)}
                    />
                    <input
                      className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs"
                      placeholder="Band / group (optional)"
                      value={manualBand}
                      onChange={e => setManualBand(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={() => manualName.trim() && addManual()}
                    disabled={addingManual || !manualName.trim()}
                    className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
                  >
                    {addingManual ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                  </button>
                </div>
              )}

              {/* Entries list */}
              {guestListEntries.length > 0 && (
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {guestListEntries.map((entry: any) => {
                    const domain = window.location.origin;
                    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
                    const guestLink = `${domain}${base}/guest-list/${entry.token}`;
                    return (
                      <div key={entry.id} className={`p-2.5 rounded-xl border text-xs space-y-1.5 ${entry.submitted ? "bg-emerald-500/5 border-emerald-500/15" : "bg-muted/30 border-border/40"}`}>
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-foreground flex items-center gap-1.5">
                              {entry.studentName}
                              {entry.submitted && <span className="text-[9px] bg-emerald-500/15 text-emerald-600 rounded px-1 py-0.5 font-semibold">Submitted</span>}
                              {!entry.submitted && <span className="text-[9px] bg-muted text-muted-foreground rounded px-1 py-0.5">Pending</span>}
                            </div>
                            {entry.bandName && <div className="text-muted-foreground">{entry.bandName}</div>}
                            {entry.contactEmail && <div className="text-muted-foreground truncate">{entry.contactEmail}</div>}
                            {entry.guestOneName && <div className="text-foreground/80">+1: {entry.guestOneName}</div>}
                            {entry.guestTwoName && <div className="text-foreground/80">+2: {entry.guestTwoName}</div>}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Copy guest list link */}
                            <GuestListLinkButton link={guestLink} />
                            <button
                              onClick={() => deleteGuestEntry(entry.id)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              title="Remove entry"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        {/* Check-in row */}
                        <div className="flex items-center gap-2 pt-1 border-t border-border/20">
                          <CheckInToggle
                            label="Student"
                            checked={entry.studentCheckedIn}
                            onChange={(v) => toggleGuestCheckin({ entryId: entry.id, field: "studentCheckedIn", value: v })}
                          />
                          {(entry.guestOneName || event.guestListPolicy === "plus_one" || event.guestListPolicy === "plus_two") && (
                            <CheckInToggle
                              label={entry.guestOneName || "+1"}
                              checked={entry.guestOneCheckedIn}
                              onChange={(v) => toggleGuestCheckin({ entryId: entry.id, field: "guestOneCheckedIn", value: v })}
                            />
                          )}
                          {(entry.guestTwoName || event.guestListPolicy === "plus_two") && (
                            <CheckInToggle
                              label={entry.guestTwoName || "+2"}
                              checked={entry.guestTwoCheckedIn}
                              onChange={(v) => toggleGuestCheckin({ entryId: entry.id, field: "guestTwoCheckedIn", value: v })}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {guestListEntries.length === 0 && (
                <p className="text-xs text-muted-foreground">No entries yet. Click "Generate from Lineup" to auto-populate from your band roster.</p>
              )}
            </div>
          )}

          {/* Band / group signups */}
          {eventSignups.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Signups
                <span className="ml-auto bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[10px] font-bold">{eventSignups.length}</span>
              </h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {eventSignups.map((s: any) => (
                  <div key={s.id} className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border/40 bg-muted/40 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground">{s.name}</div>
                      {s.email && <div className="text-muted-foreground truncate">{s.email}</div>}
                      {s.role && <div className="text-muted-foreground">{s.role}</div>}
                    </div>
                    <span className={`shrink-0 rounded-lg px-1.5 py-0.5 text-[10px] font-semibold capitalize ${
                      s.status === "confirmed" ? "bg-emerald-500/10 text-emerald-600" :
                      s.status === "cancelled" ? "bg-destructive/10 text-destructive" :
                      "bg-amber-500/10 text-amber-600"
                    }`}>{s.status}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => remindSignups()}
                disabled={remindingSignups}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {remindingSignups ? "Sending reminders…" : "Send reminders to all signups"}
              </button>
            </div>
          )}

          {/* Open Mic performer signup list */}
          {event.openMicSeriesId && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Mic className="h-3.5 w-3.5" /> Performers Signed Up
                <span className="ml-auto bg-[#7250ef]/10 text-[#7250ef] rounded-full px-2 py-0.5 text-[10px] font-bold">{openMicPerformers.length}</span>
              </h4>
              {openMicPerformers.length === 0 ? (
                <p className="text-xs text-muted-foreground/60 py-1">No one has signed up yet.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {openMicPerformers.map((p: any, i: number) => (
                    <div key={p.id} className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border/40 bg-muted/40 text-xs">
                      <span className="text-muted-foreground/40 font-mono w-4 shrink-0 text-right">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground">{p.name}</div>
                        <div className="text-muted-foreground truncate">{p.instrument}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quick actions */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quick Actions</h4>
            <div className="grid grid-cols-2 gap-2">
              {ACTIONS.map((a) => (
                <button
                  key={a.label}
                  onClick={a.fn}
                  className={`flex items-center gap-2.5 p-3 rounded-xl border border-border/50 bg-card text-left transition-colors ${a.bg}`}
                >
                  <span className={a.color}>{a.icon}</span>
                  <span className={`text-xs font-medium flex-1 ${a.color}`}>{a.label}</span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Delete Event */}
          <div className="pt-2 border-t border-border/40">
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-2.5 w-full p-3 rounded-xl border border-red-500/20 bg-red-500/5 text-left transition-colors hover:bg-red-500/15"
            >
              <Trash2 className="h-4 w-4 text-red-500 shrink-0" />
              <span className="text-xs font-medium text-red-500 flex-1">Delete Event</span>
            </button>
          </div>
        </div>
      </SheetContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{event?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the event, all comm tasks, staff assignments, and any related data. Google Calendar entries will also be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDeleteConfirm}
            >
              Delete Event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Events() {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "calendar">("list");
  const { data: events, isLoading } = useListEvents();
  const { data: eventTypeList = [] } = useActiveEventTypes();
  const { data: currentUser } = useQuery<any>({
    queryKey: ["/api/auth/user"],
    queryFn: async () => { const r = await fetch("/api/auth/user", { credentials: "include" }); const d = await r.json(); return d.user; },
  });
  const canViewFinances = currentUser?.canViewFinances === true || currentUser?.email === "justin@themusicspace.com";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<any | null>(null);
  const [tasksEvent, setTasksEvent] = useState<{ id: number; title: string; type: string; startDate?: string | null } | null>(null);
  const [debriefEvent, setDebriefEvent] = useState<{ id: number; title: string; type: string; imageUrl?: string | null; isLeadGenerating?: boolean; primaryStaffId?: string | null; startDate?: string | null; endDate?: string | null; isTwoDay?: boolean; day1EndTime?: string | null; day2StartTime?: string | null } | null>(null);
  const [lineupEvent, setLineupEvent] = useState<{ id: number; title: string; type: string; isTwoDay?: boolean } | null>(null);
  const [packingEvent, setPackingEvent] = useState<{ id: number; title: string; type?: string } | null>(null);
  const [callSheetEvent, setCallSheetEvent] = useState<{ id: number; title: string; type: string; startDate?: string | null; endDate?: string | null; location?: string | null } | null>(null);
  const [staffSlotsEvent, setStaffSlotsEvent] = useState<{ id: number; title: string; startDate?: string | null; endDate?: string | null; location?: string | null; isTwoDay?: boolean } | null>(null);
  const [inviteEvent, setInviteEvent] = useState<{ id: number; title: string; startDate?: string | null; location?: string | null; signupToken?: string | null } | null>(null);
  const [overviewEvent, setOverviewEvent] = useState<any | null>(null);
  const [applyToSeries, setApplyToSeries] = useState<"this" | "future">("this");
  const searchStr = useSearch();
  useEffect(() => {
    if (!events) return;
    const params = new URLSearchParams(searchStr);
    const openId = params.get("open");
    if (openId) {
      const found = events.find((e: any) => String(e.id) === openId);
      if (found) setOverviewEvent(found);
    }
  }, [searchStr, events]);
  const [createStaff, setCreateStaff] = useState<number[]>([]);
  const [createTicketSource, setCreateTicketSource] = useState<"none" | "external" | "internal">("none");
  const [editTicketSource, setEditTicketSource] = useState<"none" | "external" | "internal">("none");

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
        body: JSON.stringify(localsToUtc(data)),
      });
      if (!res.ok) throw new Error("Failed to create event");
      return res.json();
    },
  });

  const { mutate: updateEvent, isPending: isUpdating } = useMutation({
    mutationFn: async (data: z.infer<typeof eventSchema> & { id: number; openMicSeriesId?: number | null }) => {
      const res = await fetch(`/api/events/${data.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(localsToUtc(data)),
      });
      if (!res.ok) throw new Error("Failed to update event");
      return res.json();
    },
    onSuccess: async (_, variables) => {
      // Propagate to all future series events if requested
      if (applyToSeries === "future" && variables.openMicSeriesId) {
        try {
          await fetch(`/api/open-mic/series/${variables.openMicSeriesId}/propagate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              location: variables.location,
              startDate: variables.startDate,
              hasDebrief: variables.hasDebrief,
              hasBandLineup: variables.hasBandLineup,
              hasStaffSchedule: variables.hasStaffSchedule,
              hasCallSheet: variables.hasCallSheet,
              hasPackingList: variables.hasPackingList,
              allowGuestList: variables.allowGuestList,
              isLeadGenerating: variables.isLeadGenerating,
            }),
          });
        } catch {}
      }
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setApplyToSeries("this");
      setEditEvent(null);
      toast({ title: applyToSeries === "future" ? "Event updated — changes applied to all future events" : "Event updated" });
    },
    onError: () => toast({ title: "Failed to update event", variant: "destructive" }),
  });

  const { mutate: deleteEvent } = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete event");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Event deleted" });
    },
    onError: () => toast({ title: "Failed to delete event", variant: "destructive" }),
  });

  const form = useForm<z.infer<typeof eventSchema>>({
    resolver: zodResolver(eventSchema),
    defaultValues: { title: "", type: "Recital", status: "planning", isPaid: false, isTwoDay: false, ctaLabel: "", ticketFormType: "none", hasBandLineup: false, hasStaffSchedule: false, hasCallSheet: false, hasPackingList: false, allowGuestList: false, isLeadGenerating: false, hasDebrief: false, guestListPolicy: "students_only", hasPoc: false, pocName: "", pocEmail: "", pocPhone: "", primaryStaffId: null, revenueSharePercent: 100 }
  });

  const editForm = useForm<z.infer<typeof eventSchema>>({
    resolver: zodResolver(eventSchema),
    defaultValues: { title: "", type: "Recital", status: "planning", isPaid: false, isTwoDay: false, ctaLabel: "", ticketFormType: "none", hasBandLineup: false, hasStaffSchedule: false, hasCallSheet: false, hasPackingList: false, allowGuestList: false, isLeadGenerating: false, hasDebrief: false, guestListPolicy: "students_only", hasPoc: false, pocName: "", pocEmail: "", pocPhone: "", primaryStaffId: null, revenueSharePercent: 100 }
  });

  const { data: teamMembers = [] } = useTeamMembers();

  // Auto-fill end date when start date changes (create form)
  const prevCreateStart = useRef("");
  const watchCreateStart = form.watch("startDate");
  useEffect(() => {
    if (!watchCreateStart) return;
    const newDatePart = watchCreateStart.split("T")[0];
    const prevDatePart = prevCreateStart.current ? prevCreateStart.current.split("T")[0] : "";
    const currentEnd = form.getValues("endDate");
    if (!currentEnd) {
      const [h, m] = (watchCreateStart.split("T")[1] ?? "00:00").split(":").map(Number);
      const endH = String((h + 1) % 24).padStart(2, "0");
      form.setValue("endDate", `${newDatePart}T${endH}:${String(m).padStart(2, "0")}`);
    } else if (prevDatePart && newDatePart !== prevDatePart) {
      form.setValue("endDate", `${newDatePart}T${(currentEnd.split("T")[1] ?? "20:00")}`);
    }
    prevCreateStart.current = watchCreateStart;
  }, [watchCreateStart]);

  // Auto-fill end date when start date changes (edit form)
  const prevEditStart = useRef("");
  const watchEditStart = editForm.watch("startDate");
  useEffect(() => {
    if (!watchEditStart) return;
    const newDatePart = watchEditStart.split("T")[0];
    const prevDatePart = prevEditStart.current ? prevEditStart.current.split("T")[0] : "";
    const currentEnd = editForm.getValues("endDate");
    if (!currentEnd) {
      const [h, m] = (watchEditStart.split("T")[1] ?? "00:00").split(":").map(Number);
      const endH = String((h + 1) % 24).padStart(2, "0");
      editForm.setValue("endDate", `${newDatePart}T${endH}:${String(m).padStart(2, "0")}`);
    } else if (prevDatePart && newDatePart !== prevDatePart) {
      editForm.setValue("endDate", `${newDatePart}T${(currentEnd.split("T")[1] ?? "20:00")}`);
    }
    prevEditStart.current = watchEditStart;
  }, [watchEditStart]);

  function openEdit(ev: any) {
    setEditEvent(ev);
    // Derive ticket source from saved values
    const isInternal = ev.ticketFormType && ev.ticketFormType !== "none";
    if (isInternal) {
      setEditTicketSource("internal");
    } else if (ev.ticketsUrl) {
      setEditTicketSource("external");
    } else {
      setEditTicketSource("none");
    }
    editForm.reset({
      title: ev.title ?? "",
      type: ev.type ?? "Recital",
      status: ev.status ?? "planning",
      location: ev.location ?? "",
      startDate: ev.startDate ? toDatetimeLocal(new Date(ev.startDate)) : "",
      endDate: ev.endDate ? toDatetimeLocal(new Date(ev.endDate)) : "",
      isTwoDay: ev.isTwoDay ?? false,
      day1EndTime: ev.day1EndTime ?? "",
      day2StartTime: ev.day2StartTime ?? "",
      calendarTag: ev.calendarTag ?? "",
      isPaid: ev.isPaid ?? false,
      revenue: ev.revenue ? Number(ev.revenue) : undefined,
      cost: ev.cost ? Number(ev.cost) : undefined,
      externalTicketSales: ev.externalTicketSales ? Number(ev.externalTicketSales) : undefined,
      revenueSharePercent: ev.revenueSharePercent != null ? Number(ev.revenueSharePercent) : 100,
      perTicketVenueFee: ev.perTicketVenueFee ? Number(ev.perTicketVenueFee) : undefined,
      notes: ev.notes ?? "",
      flyerUrl: ev.flyerUrl ?? "",
      // Clear ticketsUrl if event is using the internal form — stale external URLs cause dead links
      ticketsUrl: isInternal ? "" : (ev.ticketsUrl ?? ""),
      ctaLabel: isInternal ? "REGISTER" : (ev.ctaLabel ?? ""),
      ticketFormType: ev.ticketFormType ?? "none",
      ticketPrice: ev.ticketPrice ? Number(ev.ticketPrice) : undefined,
      day1Price: (ev as any).day1Price ? Number((ev as any).day1Price) : undefined,
      day2Price: (ev as any).day2Price ? Number((ev as any).day2Price) : undefined,
      hasBandLineup: ev.hasBandLineup ?? false,
      hasStaffSchedule: ev.hasStaffSchedule ?? false,
      hasCallSheet: ev.hasCallSheet ?? false,
      hasPackingList: ev.hasPackingList ?? false,
      hasDebrief: (ev as any).hasDebrief ?? false,
      allowGuestList: ev.allowGuestList ?? false,
      isLeadGenerating: (ev as any).isLeadGenerating ?? false,
      guestListPolicy: ev.guestListPolicy ?? "students_only",
      hasPoc: !!(ev.pocName || ev.pocEmail || ev.pocPhone),
      pocName: ev.pocName ?? "",
      pocEmail: ev.pocEmail ?? "",
      pocPhone: ev.pocPhone ?? "",
      primaryStaffId: (ev as any).primaryStaffId ?? null,
    });
    // Seed ref so auto-fill effect doesn't trigger on load
    prevEditStart.current = ev.startDate ? toDatetimeLocal(new Date(ev.startDate)) : "";
  }

  const { mutate: sendLateReport, isPending: sendingReport } = useSendLateReport();

  const filteredEvents = events?.filter(e =>
    e.title.toLowerCase().includes(search.toLowerCase()) ||
    e.location?.toLowerCase().includes(search.toLowerCase())
  );

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
              className="rounded-xl gap-2"
              onClick={() => {
                const headers = ["Title", "Type", "Status", "Start Date", "End Date", "Location", "Is Paid", ...(canViewFinances ? ["Revenue", "Cost"] : []), "Lead Generating", "Has Debrief"];
                const rows = [headers, ...(events ?? []).map((e: any) => [
                  e.title ?? "", e.type ?? "", e.status ?? "",
                  e.startDate ? format(new Date(e.startDate), "yyyy-MM-dd") : "",
                  e.endDate ? format(new Date(e.endDate), "yyyy-MM-dd") : "",
                  e.location ?? "", e.isPaid ? "Yes" : "No",
                  ...(canViewFinances ? [e.revenue ?? "0", e.cost ?? "0"] : []),
                  e.isLeadGenerating ? "Yes" : "No", e.hasDebrief ? "Yes" : "No",
                ])];
                const csv = rows.map(r => r.map((v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a"); a.href = url; a.download = `events-${format(new Date(), "yyyy-MM-dd")}.csv`; a.click(); URL.revokeObjectURL(url);
              }}
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>

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

            <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) setCreateTicketSource("none"); }}>
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField control={form.control} name="type" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Type *</FormLabel>
                          <Select onValueChange={(val) => {
                            field.onChange(val);
                            const et = eventTypeList.find(t => t.name === val);
                            if (et) {
                              form.setValue("hasBandLineup", et.defaultHasBandLineup ?? false);
                              form.setValue("hasStaffSchedule", et.defaultHasStaffSchedule ?? false);
                              form.setValue("hasCallSheet", et.defaultHasCallSheet ?? false);
                              form.setValue("hasPackingList", et.defaultHasPackingList ?? false);
                            }
                          }} defaultValue={field.value}>
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
                    <FormField control={form.control} name="isTwoDay" render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-xl border border-border/50 px-3 py-2.5 bg-card">
                        <div>
                          <FormLabel className="text-sm font-medium cursor-pointer">Two-day event</FormLabel>
                          <p className="text-[10px] text-muted-foreground">Appears on both days in the events calendar</p>
                        </div>
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      </FormItem>
                    )} />
                    {form.watch("isTwoDay") ? (
                      <div className="space-y-3">
                        <div className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Day 1</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <FormField control={form.control} name="startDate" render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">Day 1 Date & Start Time</FormLabel>
                                <FormControl><DateTimeSplit value={field.value} onChange={field.onChange} onBlur={field.onBlur} /></FormControl>
                              </FormItem>
                            )} />
                            <FormField control={form.control} name="day1EndTime" render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">Day 1 End Time</FormLabel>
                                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                                  <FormControl><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select time…" /></SelectTrigger></FormControl>
                                  <SelectContent position="popper" className="max-h-60 overflow-y-auto">
                                    {EVENT_TIME_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )} />
                          </div>
                        </div>
                        <div className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Day 2</p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <FormField control={form.control} name="endDate" render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">Day 2 Date</FormLabel>
                                <FormControl>
                                  <Input
                                    type="date"
                                    className="rounded-xl"
                                    value={field.value ? field.value.split("T")[0] : ""}
                                    onChange={e => {
                                      const timePart = field.value ? (field.value.split("T")[1] ?? "").slice(0, 5) : "00:00";
                                      field.onChange(e.target.value ? `${e.target.value}T${timePart}` : "");
                                    }}
                                    onBlur={field.onBlur}
                                  />
                                </FormControl>
                              </FormItem>
                            )} />
                            <FormField control={form.control} name="day2StartTime" render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">Start Time</FormLabel>
                                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                                  <FormControl><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select time…" /></SelectTrigger></FormControl>
                                  <SelectContent position="popper" className="max-h-60 overflow-y-auto">
                                    {EVENT_TIME_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )} />
                            <FormField control={form.control} name="endDate" render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">End Time</FormLabel>
                                <Select
                                  value={field.value ? (field.value.split("T")[1] ?? "").slice(0, 5) : ""}
                                  onValueChange={t => {
                                    const datePart = field.value ? field.value.split("T")[0] : "";
                                    field.onChange(datePart ? `${datePart}T${t}` : "");
                                    field.onBlur?.();
                                  }}
                                >
                                  <FormControl><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select time…" /></SelectTrigger></FormControl>
                                  <SelectContent position="popper" className="max-h-60 overflow-y-auto">
                                    {EVENT_TIME_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )} />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField control={form.control} name="startDate" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Start Date & Time</FormLabel>
                            <FormControl><DateTimeSplit value={field.value} onChange={field.onChange} onBlur={field.onBlur} /></FormControl>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="endDate" render={({ field }) => (
                          <FormItem>
                            <FormLabel>End Date & Time</FormLabel>
                            <FormControl><DateTimeSplit value={field.value} onChange={field.onChange} onBlur={field.onBlur} /></FormControl>
                          </FormItem>
                        )} />
                      </div>
                    )}
                    <FormField control={form.control} name="location" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location / Venue</FormLabel>
                        <FormControl><Input placeholder="Zen West, Main Stage, etc." className="rounded-xl" {...field} /></FormControl>
                      </FormItem>
                    )} />
                    {canViewFinances && <div className="p-4 bg-muted/40 rounded-xl border border-border/50 space-y-4">
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField control={form.control} name="revenue" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">TMS earns ($) <span className="font-normal text-muted-foreground">gig fee, sound pay, etc.</span></FormLabel>
                            <FormControl><Input type="number" placeholder="0.00" className="rounded-xl h-9" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === "" ? undefined : e.target.value)} /></FormControl>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="cost" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">TMS pays ($) <span className="font-normal text-muted-foreground">booth, sponsorship, etc.</span></FormLabel>
                            <FormControl><Input type="number" placeholder="0.00" className="rounded-xl h-9" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === "" ? undefined : e.target.value)} /></FormControl>
                          </FormItem>
                        )} />
                      </div>
                      <FormField control={form.control} name="externalTicketSales" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">External ticket gross ($) <span className="font-normal text-muted-foreground">enter after event — Eventbrite, etc.</span></FormLabel>
                          <FormControl><Input type="number" placeholder="0.00" className="rounded-xl h-9" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === "" ? undefined : e.target.value)} /></FormControl>
                        </FormItem>
                      )} />
                    </div>}
                    {/* Revenue split */}
                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={form.control} name="revenueSharePercent" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">% of ticket revenue kept <span className="font-normal text-muted-foreground">100 = keep all</span></FormLabel>
                          <FormControl><Input type="number" min="0" max="100" placeholder="100" className="rounded-xl h-9" {...field} value={field.value ?? 100} onChange={e => field.onChange(e.target.value === "" ? 100 : Number(e.target.value))} /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="perTicketVenueFee" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Per-ticket venue fee ($) <span className="font-normal text-muted-foreground">owed to venue</span></FormLabel>
                          <FormControl><Input type="number" min="0" placeholder="0.00" className="rounded-xl h-9" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === "" ? undefined : e.target.value)} /></FormControl>
                        </FormItem>
                      )} />
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
                    {/* Debrief Owner */}
                    <FormField control={form.control} name="primaryStaffId" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm flex items-center gap-1.5"><ClipboardCheck className="h-3.5 w-3.5 text-secondary" /> Debrief Owner</FormLabel>
                        <Select value={field.value ?? "none"} onValueChange={v => field.onChange(v === "none" ? null : v)}>
                          <FormControl><SelectTrigger className="rounded-xl"><SelectValue placeholder="Anyone can fill out debrief" /></SelectTrigger></FormControl>
                          <SelectContent position="popper">
                            <SelectItem value="none">Anyone</SelectItem>
                            {teamMembers.map(m => (
                              <SelectItem key={m.id} value={m.id}>{m.firstName && m.lastName ? `${m.firstName} ${m.lastName}` : m.email ?? m.id}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    {/* Point of Contact */}
                    <FormField control={form.control} name="hasPoc" render={({ field }) => (
                      <FormItem className="flex flex-row items-center gap-3 rounded-xl border border-border/40 px-3 py-2.5 bg-card">
                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        <FormLabel className="text-sm font-medium flex items-center gap-1.5 cursor-pointer mb-0"><UserRound className="h-3.5 w-3.5 text-muted-foreground" /> Add Point of Contact</FormLabel>
                      </FormItem>
                    )} />
                    {form.watch("hasPoc") && (
                      <div className="pl-1 space-y-2 border-l-2 border-primary/20 ml-1">
                        <FormField control={form.control} name="pocName" render={({ field }) => (
                          <FormItem><FormControl><Input placeholder="Contact name" className="rounded-xl" {...field} value={field.value || ''} /></FormControl></FormItem>
                        )} />
                        <FormField control={form.control} name="pocEmail" render={({ field }) => (
                          <FormItem><FormControl><Input type="email" placeholder="Email address" className="rounded-xl" {...field} value={field.value || ''} /></FormControl></FormItem>
                        )} />
                        <FormField control={form.control} name="pocPhone" render={({ field }) => (
                          <FormItem><FormControl><Input type="tel" placeholder="Phone number" className="rounded-xl" {...field} value={field.value || ''} /></FormControl></FormItem>
                        )} />
                      </div>
                    )}
                    {/* Features section */}
                    <div className="p-4 bg-muted/40 rounded-xl border border-border/50 space-y-3">
                      <h4 className="font-semibold text-sm flex items-center gap-1.5"><List className="h-4 w-4 text-primary" /> Features</h4>
                      <p className="text-[11px] text-muted-foreground -mt-1">Auto-set from event type. Toggle individually to override.</p>
                      {([
                        { name: "hasBandLineup" as const, icon: <Music className="h-3.5 w-3.5 text-primary" />, label: "Band Lineup", desc: "Band lineup builder" },
                        { name: "hasStaffSchedule" as const, icon: <Users2 className="h-3.5 w-3.5 text-emerald-500" />, label: "Staff Schedule", desc: "Assign staff to this event" },
                        { name: "hasCallSheet" as const, icon: <FileText className="h-3.5 w-3.5 text-sky-500" />, label: "Call Sheet", desc: "Generate a call sheet" },
                        { name: "hasPackingList" as const, icon: <Package className="h-3.5 w-3.5 text-amber-500" />, label: "Packing List", desc: "Equipment packing list" },
                        { name: "hasDebrief" as const, icon: <ClipboardList className="h-3.5 w-3.5 text-[#00b199]" />, label: "Post-Event Debrief", desc: "Owner fills out debrief after the event" },
                        { name: "isLeadGenerating" as const, icon: <TrendingUp className="h-3.5 w-3.5 text-violet-400" />, label: "Lead Generating", desc: "Track leads, trials & vibe in debrief" },
                      ]).map(({ name, icon, label, desc }) => (
                        <FormField key={name} control={form.control} name={name} render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border/40 px-3 py-2 bg-card">
                            <div className="space-y-0.5">
                              <FormLabel className="text-sm font-medium flex items-center gap-1.5">{icon} {label}</FormLabel>
                              <p className="text-[10px] text-muted-foreground">{desc}</p>
                            </div>
                            <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                          </FormItem>
                        )} />
                      ))}
                    </div>

                    {/* Ticketing section */}
                    <div className="p-4 bg-muted/40 rounded-xl border border-border/50 space-y-4">
                      <h4 className="font-semibold text-sm flex items-center gap-1.5">
                        <Ticket className="h-4 w-4 text-primary" /> Ticketing
                      </h4>
                      {/* Source toggle */}
                      <div className="grid grid-cols-3 gap-1.5 p-1 bg-background rounded-xl border border-border/50">
                        {([["none","No Tickets"],["external","External Link"],["internal","Registration Form"]] as const).map(([val, label]) => (
                          <button key={val} type="button"
                            onClick={() => {
                              setCreateTicketSource(val);
                              if (val === "internal") { form.setValue("ticketFormType", "general"); form.setValue("ctaLabel", "REGISTER"); form.setValue("ticketsUrl", ""); }
                              if (val === "external") { form.setValue("ticketFormType", "none"); }
                              if (val === "none") { form.setValue("ticketFormType", "none"); form.setValue("ctaLabel", "none"); form.setValue("ticketsUrl", ""); }
                            }}
                            className={`py-1.5 rounded-lg text-xs font-medium transition-all ${createTicketSource === val ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                          >{label}</button>
                        ))}
                      </div>

                      {/* External link fields */}
                      {createTicketSource === "external" && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                                  <FormLabel className="text-xs">External Link URL</FormLabel>
                                  <FormControl><Input placeholder="https://www.eventbrite.com/e/..." className="rounded-xl h-9" {...field} value={field.value || ''} /></FormControl>
                                </FormItem>
                              )} />
                            </div>
                          </div>
                          <p className="text-[10px] text-muted-foreground">This link + button label will appear on the website calendar. The calendar entry is updated automatically when you save.</p>
                        </div>
                      )}

                      {/* Internal registration form fields */}
                      {createTicketSource === "internal" && (
                        <div className="space-y-2">
                          <FormField control={form.control} name="ticketFormType" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Form Type</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value ?? "general"}>
                                <FormControl><SelectTrigger className="rounded-xl h-9"><SelectValue /></SelectTrigger></FormControl>
                                <SelectContent>
                                  <SelectItem value="general">General Ticket Request (name, email, qty)</SelectItem>
                                  <SelectItem value="recital">Recital Registration (student + parent details)</SelectItem>
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )} />
                          {(form.watch("ticketFormType") === "general" || form.watch("ticketFormType") === "recital") && (
                            form.watch("ticketFormType") === "general" && form.watch("isTwoDay") ? (
                              <div className="space-y-2">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ticket Prices <span className="normal-case font-normal">(optional)</span></p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  {([["day1Price", "Day 1"], ["day2Price", "Day 2"], ["ticketPrice", "Both Days"]] as const).map(([name, label]) => (
                                    <FormField key={name} control={form.control} name={name} render={({ field }) => (
                                      <FormItem>
                                        <FormLabel className="text-xs">{label}</FormLabel>
                                        <FormControl>
                                          <div className="relative">
                                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                                            <Input type="number" min="0" step="0.01" placeholder="0.00" className="rounded-xl h-9 pl-5 text-xs" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? undefined : e.target.value)} />
                                          </div>
                                        </FormControl>
                                      </FormItem>
                                    )} />
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <FormField control={form.control} name="ticketPrice" render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">{form.watch("ticketFormType") === "recital" ? "Registration Fee ($)" : "Ticket Price ($)"} <span className="text-muted-foreground font-normal">optional</span></FormLabel>
                                  <FormControl>
                                    <div className="relative">
                                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                                      <Input type="number" min="0" step="0.01" placeholder="15.00" className="rounded-xl h-9 pl-6" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? undefined : e.target.value)} />
                                    </div>
                                  </FormControl>
                                </FormItem>
                              )} />
                            )
                          )}
                          <p className="text-[10px] text-muted-foreground">A shareable registration link will be created automatically. The website calendar will show a REGISTER button pointing to it.</p>
                        </div>
                      )}

                      {/* Guest list — only for ticketed events */}
                      {createTicketSource !== "none" && (
                        <div className="pt-1 border-t border-border/30 space-y-3">
                          <FormField control={form.control} name="allowGuestList" render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center gap-2.5">
                                <button
                                  type="button"
                                  onClick={() => field.onChange(!field.value)}
                                  className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${field.value ? "bg-primary" : "bg-input"}`}
                                >
                                  <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${field.value ? "translate-x-4" : "translate-x-0"}`} />
                                </button>
                                <FormLabel className="text-xs font-medium cursor-pointer" onClick={() => field.onChange(!field.value)}>
                                  Allow performer guest list
                                </FormLabel>
                              </div>
                              <p className="text-[10px] text-muted-foreground ml-11">Performers register their guests via a unique link. Each student gets free admission.</p>
                            </FormItem>
                          )} />

                          {form.watch("allowGuestList") && (
                            <FormField control={form.control} name="guestListPolicy" render={({ field }) => (
                              <FormItem className="ml-11">
                                <FormLabel className="text-xs">Guest policy</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value ?? "students_only"}>
                                  <FormControl><SelectTrigger className="rounded-xl h-8 text-xs"><SelectValue /></SelectTrigger></FormControl>
                                  <SelectContent>
                                    <SelectItem value="students_only">Students only (no plus-ones)</SelectItem>
                                    <SelectItem value="plus_one">Students + optional +1</SelectItem>
                                    <SelectItem value="plus_two">Students + optional +2</SelectItem>
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )} />
                          )}
                        </div>
                      )}

                      {/* Flyer URL always visible */}
                      <div className="pt-1 border-t border-border/30">
                        <FormField control={form.control} name="flyerUrl" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Flyer Image URL (ImageKit) <span className="text-muted-foreground font-normal">optional</span></FormLabel>
                            <FormControl><Input placeholder="https://ik.imagekit.io/... (.jpg/.png)" className="rounded-xl h-9" {...field} value={field.value || ''} /></FormControl>
                          </FormItem>
                        )} />
                      </div>
                    </div>

                    {/* Staff assignment */}
                    {allEmployees && allEmployees.length > 0 && (
                      <div className="pt-1 space-y-3">
                        <div className="flex items-center gap-2">
                          <Users2 className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">Assign Staff <span className="text-muted-foreground font-normal text-xs">optional</span></span>
                        </div>
                        {Object.entries(
                          (allEmployees as any[]).reduce((acc: Record<string, any[]>, emp) => {
                            const role = emp.role ?? "staff";
                            if (!acc[role]) acc[role] = [];
                            acc[role].push(emp);
                            return acc;
                          }, {})
                        ).sort(([a], [b]) => a.localeCompare(b)).map(([role, emps]) => (
                          <div key={role} className="space-y-1.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{role}</p>
                            <div className="flex flex-wrap gap-2">
                              {(emps as any[]).map((emp) => {
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
                        ))}
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
                    <TableHead className="font-semibold hidden sm:table-cell">Date & Location</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold hidden md:table-cell">Financials</TableHead>
                    <TableHead className="text-right font-semibold hidden lg:table-cell">Sync & Tasks</TableHead>
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
                          <button
                            className="flex items-center gap-3 text-left group hover:opacity-80 transition-opacity"
                            onClick={() => setOverviewEvent(event)}
                          >
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
                              <div className="font-medium text-foreground text-base group-hover:text-primary transition-colors">{event.title}</div>
                              <span className="text-xs text-muted-foreground mt-0.5 block">{event.type}</span>
                            </div>
                          </button>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
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
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center text-sm">
                            {canViewFinances && event.isPaid ? (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-semibold tracking-wide">PAID</Badge>
                            ) : canViewFinances ? (
                              <Badge variant="outline" className="text-muted-foreground bg-muted/50 border-border/50">UNPAID</Badge>
                            ) : null}
                            {canViewFinances && (event.revenue || event.cost || (event as any).externalTicketSales || (event as any).internalTicketTotal > 0) && (() => {
                              const sharePercent = (event as any).revenueSharePercent ?? 100;
                              const perTicketFee = (event as any).perTicketVenueFee ? parseFloat((event as any).perTicketVenueFee) : 0;
                              const grossTickets = ((event as any).internalTicketTotal ?? 0) + ((event as any).externalTicketSales ? parseFloat((event as any).externalTicketSales) : 0);
                              const netTickets = grossTickets * (sharePercent / 100);
                              const venueFees = ((event as any).totalTicketCount ?? 0) * perTicketFee;
                              const net = (event.revenue ? parseFloat(event.revenue as string) : 0)
                                + netTickets
                                - venueFees
                                - (event.cost ? parseFloat(event.cost as string) : 0)
                                - ((event as any).staffPayTotal ?? 0);
                              return (
                                <span className={`ml-3 text-xs font-mono font-semibold ${net >= 0 ? "text-emerald-500" : "text-blue-400"}`}>
                                  {net >= 0 ? "+" : ""}${net.toFixed(2)}
                                </span>
                              );
                            })()}
                          </div>
                        </TableCell>
                        <TableCell className="text-right hidden lg:table-cell">
                          <div className="flex items-center justify-end gap-1">
                            {event.isTwoDay && (
                              <Badge variant="outline" className="text-[10px] font-semibold mr-1 border border-primary/30 bg-primary/10 text-primary">2-Day</Badge>
                            )}
                            {event.calendarTag && event.calendarTag !== "none" && (
                              <Badge variant="outline" className="text-[10px] font-semibold mr-1 border" style={tagStyle(event.calendarTag)}>
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
                            {(event as any).hasDebrief && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Post-event debrief"
                              className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-secondary hover:bg-secondary/10"
                              onClick={() => setDebriefEvent({ id: event.id, title: event.title, type: event.type, imageUrl: (event as any).imageUrl, isLeadGenerating: (event as any).isLeadGenerating ?? false, primaryStaffId: (event as any).primaryStaffId ?? null, startDate: event.startDate, endDate: event.endDate, isTwoDay: event.isTwoDay ?? false, day1EndTime: (event as any).day1EndTime ?? null, day2StartTime: (event as any).day2StartTime ?? null })}
                            >
                              <ClipboardCheck className="h-3.5 w-3.5" />
                            </Button>
                            )}
                            {/* Band lineup */}
                            {event.hasBandLineup && (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Band lineup builder"
                                className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10"
                                onClick={() => setLineupEvent({ id: event.id, title: event.title, type: event.type, isTwoDay: event.isTwoDay ?? false })}
                              >
                                <Music className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {/* Staff schedule */}
                            {event.hasStaffSchedule && (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Staff schedule"
                                className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10"
                                onClick={() => setStaffSlotsEvent({ id: event.id, title: event.title, startDate: event.startDate, endDate: event.endDate, location: event.location, isTwoDay: event.isTwoDay ?? false })}
                              >
                                <Users2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {/* Call sheet */}
                            {event.hasCallSheet && (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Call sheet"
                                className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-sky-500 hover:bg-sky-500/10"
                                onClick={() => setCallSheetEvent({ id: event.id, title: event.title, type: event.type, startDate: event.startDate, endDate: event.endDate, location: event.location })}
                              >
                                <FileText className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {/* Send invite email */}
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Send invite email"
                              className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-violet-400 hover:bg-violet-500/10"
                              onClick={() => setInviteEvent({ id: event.id, title: event.title, startDate: event.startDate, location: event.location, signupToken: event.signupToken })}
                            >
                              <Mail className="h-3.5 w-3.5" />
                            </Button>
                            {/* Packing list */}
                            {event.hasPackingList && (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Packing list"
                                className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10"
                                onClick={() => setPackingEvent({ id: event.id, title: event.title, type: event.type })}
                              >
                                <Package className="h-3.5 w-3.5" />
                              </Button>
                            )}
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
      <Dialog open={!!editEvent} onOpenChange={(open) => { if (!open) { setEditEvent(null); setApplyToSeries("this"); } }}>
        <DialogContent className="sm:max-w-[620px] rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Edit Event</DialogTitle>
            <DialogDescription>Update event details. Hit Save when done.</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit((data) => updateEvent({ ...data, id: editEvent.id, openMicSeriesId: editEvent.openMicSeriesId ?? null }))} className="space-y-5 py-4">
              <FormField control={editForm.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel>Event Title *</FormLabel>
                  <FormControl><Input className="rounded-xl" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <FormField control={editForm.control} name="isTwoDay" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-xl border border-border/50 px-3 py-2.5 bg-card">
                  <div>
                    <FormLabel className="text-sm font-medium cursor-pointer">Two-day event</FormLabel>
                    <p className="text-[10px] text-muted-foreground">Appears on both days in the events calendar</p>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />
              {editForm.watch("isTwoDay") ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Day 1</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormField control={editForm.control} name="startDate" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Day 1 Date & Start Time</FormLabel>
                          <FormControl><DateTimeSplit value={field.value} onChange={field.onChange} onBlur={field.onBlur} /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={editForm.control} name="day1EndTime" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Day 1 End Time</FormLabel>
                          <Select value={field.value ?? ""} onValueChange={field.onChange}>
                            <FormControl><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select time…" /></SelectTrigger></FormControl>
                            <SelectContent position="popper" className="max-h-60 overflow-y-auto">
                              {EVENT_TIME_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Day 2</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <FormField control={editForm.control} name="endDate" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Day 2 Date</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              className="rounded-xl"
                              value={field.value ? field.value.split("T")[0] : ""}
                              onChange={e => {
                                const timePart = field.value ? (field.value.split("T")[1] ?? "").slice(0, 5) : "00:00";
                                field.onChange(e.target.value ? `${e.target.value}T${timePart}` : "");
                              }}
                              onBlur={field.onBlur}
                            />
                          </FormControl>
                        </FormItem>
                      )} />
                      <FormField control={editForm.control} name="day2StartTime" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Start Time</FormLabel>
                          <Select value={field.value ?? ""} onValueChange={field.onChange}>
                            <FormControl><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select time…" /></SelectTrigger></FormControl>
                            <SelectContent position="popper" className="max-h-60 overflow-y-auto">
                              {EVENT_TIME_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                      <FormField control={editForm.control} name="endDate" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">End Time</FormLabel>
                          <Select
                            value={field.value ? (field.value.split("T")[1] ?? "").slice(0, 5) : ""}
                            onValueChange={t => {
                              const datePart = field.value ? field.value.split("T")[0] : "";
                              field.onChange(datePart ? `${datePart}T${t}` : "");
                              field.onBlur?.();
                            }}
                          >
                            <FormControl><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select time…" /></SelectTrigger></FormControl>
                            <SelectContent position="popper" className="max-h-60 overflow-y-auto">
                              {EVENT_TIME_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={editForm.control} name="startDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Date & Time</FormLabel>
                      <FormControl><DateTimeSplit value={field.value} onChange={field.onChange} onBlur={field.onBlur} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={editForm.control} name="endDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Date & Time</FormLabel>
                      <FormControl><DateTimeSplit value={field.value} onChange={field.onChange} onBlur={field.onBlur} /></FormControl>
                    </FormItem>
                  )} />
                </div>
              )}
              <FormField control={editForm.control} name="location" render={({ field }) => (
                <FormItem>
                  <FormLabel>Location / Venue</FormLabel>
                  <FormControl><Input placeholder="Zen West, Main Stage, etc." className="rounded-xl" {...field} /></FormControl>
                </FormItem>
              )} />
              {canViewFinances && <div className="p-4 bg-muted/40 rounded-xl border border-border/50 space-y-4">
                <h4 className="font-semibold text-sm flex items-center"><DollarSign className="h-4 w-4 mr-1 text-primary" /> Financials</h4>
                <FormField control={editForm.control} name="isPaid" render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border/50 p-3 shadow-sm bg-card">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm font-medium">Paid Event?</FormLabel>
                    </div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={editForm.control} name="revenue" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">TMS earns ($) <span className="font-normal text-muted-foreground">gig fee, sound pay, etc.</span></FormLabel>
                      <FormControl><Input type="number" placeholder="0.00" className="rounded-xl h-9" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === "" ? undefined : e.target.value)} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={editForm.control} name="cost" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">TMS pays ($) <span className="font-normal text-muted-foreground">booth, sponsorship, etc.</span></FormLabel>
                      <FormControl><Input type="number" placeholder="0.00" className="rounded-xl h-9" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === "" ? undefined : e.target.value)} /></FormControl>
                    </FormItem>
                  )} />
                </div>
                <FormField control={editForm.control} name="externalTicketSales" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">External ticket gross ($) <span className="font-normal text-muted-foreground">enter after event — Eventbrite, etc.</span></FormLabel>
                    <FormControl><Input type="number" placeholder="0.00" className="rounded-xl h-9" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === "" ? undefined : e.target.value)} /></FormControl>
                  </FormItem>
                )} />
              </div>}
              {/* Revenue split */}
              <div className="grid grid-cols-2 gap-3">
                <FormField control={editForm.control} name="revenueSharePercent" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">% of ticket revenue kept <span className="font-normal text-muted-foreground">100 = keep all</span></FormLabel>
                    <FormControl><Input type="number" min="0" max="100" placeholder="100" className="rounded-xl h-9" {...field} value={field.value ?? 100} onChange={e => field.onChange(e.target.value === "" ? 100 : Number(e.target.value))} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="perTicketVenueFee" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Per-ticket venue fee ($) <span className="font-normal text-muted-foreground">owed to venue</span></FormLabel>
                    <FormControl><Input type="number" min="0" placeholder="0.00" className="rounded-xl h-9" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === "" ? undefined : e.target.value)} /></FormControl>
                  </FormItem>
                )} />
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
              {/* Debrief Owner */}
              <FormField control={editForm.control} name="primaryStaffId" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm flex items-center gap-1.5"><ClipboardCheck className="h-3.5 w-3.5 text-secondary" /> Debrief Owner</FormLabel>
                  <Select value={field.value ?? "none"} onValueChange={v => field.onChange(v === "none" ? null : v)}>
                    <FormControl><SelectTrigger className="rounded-xl"><SelectValue placeholder="Anyone can fill out debrief" /></SelectTrigger></FormControl>
                    <SelectContent position="popper">
                      <SelectItem value="none">Anyone</SelectItem>
                      {teamMembers.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.firstName && m.lastName ? `${m.firstName} ${m.lastName}` : m.email ?? m.id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              {/* Point of Contact */}
              <FormField control={editForm.control} name="hasPoc" render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-3 rounded-xl border border-border/40 px-3 py-2.5 bg-card">
                  <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  <FormLabel className="text-sm font-medium flex items-center gap-1.5 cursor-pointer mb-0"><UserRound className="h-3.5 w-3.5 text-muted-foreground" /> Add Point of Contact</FormLabel>
                </FormItem>
              )} />
              {editForm.watch("hasPoc") && (
                <div className="pl-1 space-y-2 border-l-2 border-primary/20 ml-1">
                  <FormField control={editForm.control} name="pocName" render={({ field }) => (
                    <FormItem><FormControl><Input placeholder="Contact name" className="rounded-xl" {...field} value={field.value || ''} /></FormControl></FormItem>
                  )} />
                  <FormField control={editForm.control} name="pocEmail" render={({ field }) => (
                    <FormItem><FormControl><Input type="email" placeholder="Email address" className="rounded-xl" {...field} value={field.value || ''} /></FormControl></FormItem>
                  )} />
                  <FormField control={editForm.control} name="pocPhone" render={({ field }) => (
                    <FormItem><FormControl><Input type="tel" placeholder="Phone number" className="rounded-xl" {...field} value={field.value || ''} /></FormControl></FormItem>
                  )} />
                </div>
              )}
              {/* Features section */}
              <div className="p-4 bg-muted/40 rounded-xl border border-border/50 space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-1.5"><List className="h-4 w-4 text-primary" /> Features</h4>
                {([
                  { name: "hasBandLineup" as const, icon: <Music className="h-3.5 w-3.5 text-primary" />, label: "Band Lineup", desc: "Band lineup builder" },
                  { name: "hasStaffSchedule" as const, icon: <Users2 className="h-3.5 w-3.5 text-emerald-500" />, label: "Staff Schedule", desc: "Assign staff to this event" },
                  { name: "hasCallSheet" as const, icon: <FileText className="h-3.5 w-3.5 text-sky-500" />, label: "Call Sheet", desc: "Generate a call sheet" },
                  { name: "hasPackingList" as const, icon: <Package className="h-3.5 w-3.5 text-amber-500" />, label: "Packing List", desc: "Equipment packing list" },
                  { name: "hasDebrief" as const, icon: <ClipboardList className="h-3.5 w-3.5 text-[#00b199]" />, label: "Post-Event Debrief", desc: "Owner fills out debrief after the event" },
                  { name: "isLeadGenerating" as const, icon: <TrendingUp className="h-3.5 w-3.5 text-violet-400" />, label: "Lead Generating", desc: "Track leads, trials & vibe in debrief" },
                ]).map(({ name, icon, label, desc }) => (
                  <FormField key={name} control={editForm.control} name={name} render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border/40 px-3 py-2 bg-card">
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm font-medium flex items-center gap-1.5">{icon} {label}</FormLabel>
                        <p className="text-[10px] text-muted-foreground">{desc}</p>
                      </div>
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    </FormItem>
                  )} />
                ))}
              </div>

              {/* Ticketing section */}
              <div className="p-4 bg-muted/40 rounded-xl border border-border/50 space-y-4">
                <h4 className="font-semibold text-sm flex items-center gap-1.5">
                  <Ticket className="h-4 w-4 text-primary" /> Ticketing
                </h4>
                {/* Source toggle */}
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-background rounded-xl border border-border/50">
                  {([["none","No Tickets"],["external","External Link"],["internal","Registration Form"]] as const).map(([val, label]) => (
                    <button key={val} type="button"
                      onClick={() => {
                        setEditTicketSource(val);
                        if (val === "internal") { editForm.setValue("ticketFormType", "general"); editForm.setValue("ctaLabel", "REGISTER"); editForm.setValue("ticketsUrl", ""); }
                        if (val === "external") { editForm.setValue("ticketFormType", "none"); }
                        if (val === "none") { editForm.setValue("ticketFormType", "none"); editForm.setValue("ctaLabel", "none"); editForm.setValue("ticketsUrl", ""); }
                      }}
                      className={`py-1.5 rounded-lg text-xs font-medium transition-all ${editTicketSource === val ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >{label}</button>
                  ))}
                </div>

                {/* External link fields */}
                {editTicketSource === "external" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                            <FormLabel className="text-xs">External Link URL</FormLabel>
                            <FormControl><Input placeholder="https://www.eventbrite.com/e/..." className="rounded-xl h-9" {...field} value={field.value || ''} /></FormControl>
                          </FormItem>
                        )} />
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">This link + button label will appear on the website calendar. The calendar entry is updated automatically when you save.</p>
                  </div>
                )}

                {/* Internal registration form fields */}
                {editTicketSource === "internal" && (
                  <div className="space-y-2">
                    <FormField control={editForm.control} name="ticketFormType" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Form Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? "general"}>
                          <FormControl><SelectTrigger className="rounded-xl h-9"><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="general">General Ticket Request (name, email, qty)</SelectItem>
                            <SelectItem value="recital">Recital Registration (student + parent details)</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    {(editForm.watch("ticketFormType") === "general" || editForm.watch("ticketFormType") === "recital") && (
                      editForm.watch("ticketFormType") === "general" && editForm.watch("isTwoDay") ? (
                        <div className="space-y-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ticket Prices <span className="normal-case font-normal">(optional)</span></p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {([["day1Price", "Day 1"], ["day2Price", "Day 2"], ["ticketPrice", "Both Days"]] as const).map(([name, label]) => (
                              <FormField key={name} control={editForm.control} name={name} render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">{label}</FormLabel>
                                  <FormControl>
                                    <div className="relative">
                                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                                      <Input type="number" min="0" step="0.01" placeholder="0.00" className="rounded-xl h-9 pl-5 text-xs" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? undefined : e.target.value)} />
                                    </div>
                                  </FormControl>
                                </FormItem>
                              )} />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <FormField control={editForm.control} name="ticketPrice" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">{editForm.watch("ticketFormType") === "recital" ? "Registration Fee ($)" : "Ticket Price ($)"} <span className="text-muted-foreground font-normal">optional</span></FormLabel>
                            <FormControl>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                                <Input type="number" min="0" step="0.01" placeholder="15.00" className="rounded-xl h-9 pl-6" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? undefined : e.target.value)} />
                              </div>
                            </FormControl>
                          </FormItem>
                        )} />
                      )
                    )}
                    <p className="text-[10px] text-muted-foreground">The website calendar will show a REGISTER button linking to your registration form automatically.</p>
                  </div>
                )}

                {/* Guest list — only for ticketed events */}
                {editTicketSource !== "none" && (
                  <div className="pt-1 border-t border-border/30 space-y-3">
                    <FormField control={editForm.control} name="allowGuestList" render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => field.onChange(!field.value)}
                            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${field.value ? "bg-primary" : "bg-input"}`}
                          >
                            <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${field.value ? "translate-x-4" : "translate-x-0"}`} />
                          </button>
                          <FormLabel className="text-xs font-medium cursor-pointer" onClick={() => field.onChange(!field.value)}>
                            Allow performer guest list
                          </FormLabel>
                        </div>
                        <p className="text-[10px] text-muted-foreground ml-11">Performers register their guests via a unique link. Each student gets free admission.</p>
                      </FormItem>
                    )} />

                    {editForm.watch("allowGuestList") && (
                      <FormField control={editForm.control} name="guestListPolicy" render={({ field }) => (
                        <FormItem className="ml-11">
                          <FormLabel className="text-xs">Guest policy</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? "students_only"}>
                            <FormControl><SelectTrigger className="rounded-xl h-8 text-xs"><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="students_only">Students only (no plus-ones)</SelectItem>
                              <SelectItem value="plus_one">Students + optional +1</SelectItem>
                              <SelectItem value="plus_two">Students + optional +2</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                    )}
                  </div>
                )}

                {/* Flyer URL always visible */}
                <div className="pt-1 border-t border-border/30">
                  <FormField control={editForm.control} name="flyerUrl" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Flyer Image URL (ImageKit) <span className="text-muted-foreground font-normal">optional</span></FormLabel>
                      <FormControl><Input placeholder="https://ik.imagekit.io/... (.jpg/.png)" className="rounded-xl h-9" {...field} value={field.value || ''} /></FormControl>
                    </FormItem>
                  )} />
                </div>
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

              {editEvent?.openMicSeriesId && (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Apply changes to</p>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input type="radio" name="applyToSeries" value="this" checked={applyToSeries === "this"}
                        onChange={() => setApplyToSeries("this")}
                        className="accent-[#7250ef] w-4 h-4" />
                      <span className="text-sm">This event only</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input type="radio" name="applyToSeries" value="future" checked={applyToSeries === "future"}
                        onChange={() => setApplyToSeries("future")}
                        className="accent-[#7250ef] w-4 h-4" />
                      <span className="text-sm">All future events in this series</span>
                      <span className="text-[10px] text-muted-foreground">(location, time, features)</span>
                    </label>
                  </div>
                </div>
              )}

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
      <CallSheet
        event={callSheetEvent}
        open={!!callSheetEvent}
        onClose={() => setCallSheetEvent(null)}
      />
      <PackingSheet
        event={packingEvent}
        open={!!packingEvent}
        onClose={() => setPackingEvent(null)}
      />
      <StaffSlotsSheet
        event={staffSlotsEvent}
        open={!!staffSlotsEvent}
        onClose={() => setStaffSlotsEvent(null)}
      />
      {inviteEvent && (
        <SendInviteDialog
          event={inviteEvent}
          open={!!inviteEvent}
          onClose={() => setInviteEvent(null)}
        />
      )}

      <EventOverviewSheet
        event={overviewEvent}
        open={!!overviewEvent}
        onClose={() => setOverviewEvent(null)}
        canViewFinances={canViewFinances}
        actions={{
          onEdit: (ev) => openEdit(ev),
          onTasks: (ev) => setTasksEvent({ id: ev.id, title: ev.title, type: ev.type, startDate: ev.startDate }),
          onDebrief: (ev) => setDebriefEvent({ id: ev.id, title: ev.title, type: ev.type, imageUrl: ev.imageUrl, isLeadGenerating: (ev as any).isLeadGenerating ?? false, primaryStaffId: (ev as any).primaryStaffId ?? null, startDate: ev.startDate, endDate: ev.endDate, isTwoDay: ev.isTwoDay ?? false, day1EndTime: (ev as any).day1EndTime ?? null, day2StartTime: (ev as any).day2StartTime ?? null }),
          onLineup: (ev) => setLineupEvent({ id: ev.id, title: ev.title, type: ev.type, isTwoDay: ev.isTwoDay ?? false }),
          onStaffSlots: (ev) => setStaffSlotsEvent({ id: ev.id, title: ev.title, startDate: ev.startDate, endDate: ev.endDate, location: ev.location, isTwoDay: ev.isTwoDay ?? false }),
          onCallSheet: (ev) => setCallSheetEvent({ id: ev.id, title: ev.title, type: ev.type, startDate: ev.startDate, endDate: ev.endDate, location: ev.location }),
          onInvite: (ev) => setInviteEvent({ id: ev.id, title: ev.title, startDate: ev.startDate, location: ev.location, signupToken: ev.signupToken }),
          onPacking: (ev) => setPackingEvent({ id: ev.id, title: ev.title, type: ev.type }),
          onDelete: (ev) => deleteEvent(ev.id),
        }}
      />
    </AppLayout>
  );
}
