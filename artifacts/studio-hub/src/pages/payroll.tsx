import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Pencil, DollarSign, Clock, Users, Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── date helpers ──────────────────────────────────────────────────────────────

function toYMD(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Return the most recent Saturday on or before `d`. */
function startOfPayPeriod(d: Date): Date {
  const day = d.getDay(); // 0=Sun … 6=Sat
  const diff = day === 6 ? 0 : day + 1; // days to go back to reach Saturday
  const sat = new Date(d);
  sat.setDate(d.getDate() - diff);
  return sat;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso + "T12:00:00Z") : iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

// ── types ─────────────────────────────────────────────────────────────────────

interface HoursEntry {
  id: number;
  employeeId: number;
  eventId: number | null;
  workDate: string;
  hours: string;
  notes: string | null;
  eventTitle?: string | null;
}

interface EmployeeSummary {
  id: number;
  name: string;
  role: string;
  hourlyRate: string | null;
  entries: HoursEntry[];
  totalHours: number;
  totalPay: number;
}

interface EventOption {
  id: number;
  title: string;
  startDate: string;
}

// ── api helpers ───────────────────────────────────────────────────────────────

async function fetchJson(url: string, opts?: RequestInit) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(await r.text());
  if (r.status === 204) return null;
  return r.json();
}

// ── component ─────────────────────────────────────────────────────────────────

export default function Payroll() {
  const qc = useQueryClient();
  const { toast } = useToast();

  // Current pay-period state
  const [weekStart, setWeekStart] = useState<Date>(() => startOfPayPeriod(new Date()));
  const weekStartStr = toYMD(weekStart);
  const weekEndDate = addDays(weekStart, 6);

  // Log-hours dialog
  const [logOpen, setLogOpen] = useState(false);
  const [logForm, setLogForm] = useState({
    employeeId: "",
    eventId: "",
    workDate: weekStartStr,
    hours: "",
    notes: "",
  });

  // Edit rate dialog
  const [rateOpen, setRateOpen] = useState(false);
  const [rateForm, setRateForm] = useState({ employeeId: 0, name: "", hourlyRate: "" });

  // Expanded rows
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // ── queries ──
  const { data: summary = [], isLoading } = useQuery<EmployeeSummary[]>({
    queryKey: ["/api/payroll/summary", weekStartStr],
    queryFn: () => fetchJson(`/api/payroll/summary?weekStart=${weekStartStr}`),
  });

  const { data: events = [] } = useQuery<EventOption[]>({
    queryKey: ["/api/events"],
    queryFn: () => fetchJson("/api/events"),
  });

  // ── mutations ──
  const logHours = useMutation({
    mutationFn: (data: typeof logForm) =>
      fetchJson("/api/payroll/hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: parseInt(data.employeeId),
          eventId: data.eventId ? parseInt(data.eventId) : null,
          workDate: data.workDate,
          hours: parseFloat(data.hours),
          notes: data.notes || null,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/payroll/summary", weekStartStr] });
      setLogOpen(false);
      setLogForm({ employeeId: "", eventId: "", workDate: weekStartStr, hours: "", notes: "" });
      toast({ title: "Hours logged" });
    },
    onError: () => toast({ title: "Failed to log hours", variant: "destructive" }),
  });

  const deleteHours = useMutation({
    mutationFn: (id: number) => fetchJson(`/api/payroll/hours/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/payroll/summary", weekStartStr] });
      toast({ title: "Entry removed" });
    },
    onError: () => toast({ title: "Failed to remove entry", variant: "destructive" }),
  });

  const updateRate = useMutation({
    mutationFn: ({ id, rate }: { id: number; rate: string }) =>
      fetchJson(`/api/payroll/employees/${id}/rate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hourlyRate: parseFloat(rate) }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/payroll/summary", weekStartStr] });
      setRateOpen(false);
      toast({ title: "Hourly rate updated" });
    },
    onError: () => toast({ title: "Failed to update rate", variant: "destructive" }),
  });

  // ── derived stats ──
  const totals = useMemo(() => {
    const totalHours = summary.reduce((s, e) => s + e.totalHours, 0);
    const totalPay = summary.reduce((s, e) => s + e.totalPay, 0);
    const activeCount = summary.filter((e) => e.totalHours > 0).length;
    return { totalHours, totalPay, activeCount };
  }, [summary]);

  function toggleRow(id: number) {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function openLogForEmployee(empId: number) {
    setLogForm((f) => ({ ...f, employeeId: String(empId), workDate: weekStartStr }));
    setLogOpen(true);
  }

  function openRateEdit(emp: EmployeeSummary) {
    setRateForm({ employeeId: emp.id, name: emp.name, hourlyRate: emp.hourlyRate ?? "" });
    setRateOpen(true);
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Payroll</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Track employee hours and calculate pay by period
            </p>
          </div>
          <Button
            onClick={() => {
              setLogForm({ employeeId: "", eventId: "", workDate: weekStartStr, hours: "", notes: "" });
              setLogOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Log Hours
          </Button>
        </div>

        {/* ── Period Picker ── */}
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekStart((d) => addDays(d, -7))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center min-w-[200px]">
            <p className="font-semibold text-base">
              {formatDate(weekStart)} – {formatDate(weekEndDate)}
            </p>
            <p className="text-xs text-muted-foreground">Pay period (Sat–Fri)</p>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekStart((d) => addDays(d, 7))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border bg-card p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Active Staff
              </p>
              <p className="text-2xl font-bold">{totals.activeCount}</p>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-secondary/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-secondary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Total Hours
              </p>
              <p className="text-2xl font-bold">{totals.totalHours.toFixed(1)}</p>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Total Payroll
              </p>
              <p className="text-2xl font-bold">{formatCurrency(totals.totalPay)}</p>
            </div>
          </div>
        </div>

        {/* ── Table ── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Employee</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Rate / hr</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Total Pay</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                      No employees found. Add team members in the Employees page.
                    </TableCell>
                  </TableRow>
                )}
                {summary.map((emp) => (
                  <>
                    <TableRow
                      key={emp.id}
                      className="cursor-pointer hover:bg-accent/30 transition-colors"
                      onClick={() => toggleRow(emp.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center text-sm font-semibold text-primary">
                            {emp.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium">{emp.name}</span>
                          {emp.totalHours > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {emp.entries.length} {emp.entries.length === 1 ? "entry" : "entries"}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground capitalize">{emp.role}</TableCell>
                      <TableCell className="text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); openRateEdit(emp); }}
                          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                          title="Edit hourly rate"
                        >
                          {emp.hourlyRate ? formatCurrency(parseFloat(emp.hourlyRate)) : (
                            <span className="text-destructive text-xs">Not set</span>
                          )}
                          <Pencil className="h-3 w-3 opacity-50" />
                        </button>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {emp.totalHours > 0 ? emp.totalHours.toFixed(2) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-green-500">
                        {emp.totalPay > 0 ? formatCurrency(emp.totalPay) : (
                          <span className="text-muted-foreground font-normal">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs gap-1"
                            onClick={(e) => { e.stopPropagation(); openLogForEmployee(emp.id); }}
                          >
                            <Plus className="h-3 w-3" />
                            Hours
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Expanded entries */}
                    {expanded.has(emp.id) && emp.entries.length > 0 && emp.entries.map((entry) => (
                      <TableRow key={`entry-${entry.id}`} className="bg-muted/20 hover:bg-muted/30">
                        <TableCell colSpan={2} className="pl-14 py-2">
                          <div className="flex flex-col">
                            <span className="text-sm text-muted-foreground">
                              {formatDate(entry.workDate)}
                              {entry.eventTitle && (
                                <> — <span className="text-foreground">{entry.eventTitle}</span></>
                              )}
                            </span>
                            {entry.notes && (
                              <span className="text-xs text-muted-foreground/70 mt-0.5">{entry.notes}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell />
                        <TableCell className="text-right text-sm py-2">{parseFloat(entry.hours).toFixed(2)}</TableCell>
                        <TableCell className="text-right text-sm py-2 text-green-500">
                          {emp.hourlyRate
                            ? formatCurrency(parseFloat(entry.hours) * parseFloat(emp.hourlyRate))
                            : "—"}
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={(e) => { e.stopPropagation(); deleteHours.mutate(entry.id); }}
                              disabled={deleteHours.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}

                    {expanded.has(emp.id) && emp.entries.length === 0 && (
                      <TableRow className="bg-muted/20">
                        <TableCell colSpan={6} className="pl-14 py-3 text-sm text-muted-foreground">
                          No hours logged this period.{" "}
                          <button
                            className="text-primary underline-offset-2 hover:underline"
                            onClick={(e) => { e.stopPropagation(); openLogForEmployee(emp.id); }}
                          >
                            Log hours
                          </button>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* ── Log Hours Dialog ── */}
      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log Hours</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Employee</Label>
              <Select
                value={logForm.employeeId}
                onValueChange={(v) => setLogForm((f) => ({ ...f, employeeId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {summary.map((emp) => (
                    <SelectItem key={emp.id} value={String(emp.id)}>{emp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Event <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Select
                value={logForm.eventId}
                onValueChange={(v) => setLogForm((f) => ({ ...f, eventId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select event" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None / General</SelectItem>
                  {events.map((ev: EventOption) => (
                    <SelectItem key={ev.id} value={String(ev.id)}>{ev.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Work Date</Label>
                <Input
                  type="date"
                  value={logForm.workDate}
                  onChange={(e) => setLogForm((f) => ({ ...f, workDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Hours</Label>
                <Input
                  type="number"
                  step="0.25"
                  min="0.25"
                  placeholder="e.g. 4.5"
                  value={logForm.hours}
                  onChange={(e) => setLogForm((f) => ({ ...f, hours: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                placeholder="Any notes about this entry"
                value={logForm.notes}
                onChange={(e) => setLogForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => logHours.mutate(logForm)}
              disabled={!logForm.employeeId || !logForm.workDate || !logForm.hours || logHours.isPending}
            >
              {logHours.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Log Hours
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Rate Dialog ── */}
      <Dialog open={rateOpen} onOpenChange={setRateOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Hourly Rate — {rateForm.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Rate per hour ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 18.00"
                value={rateForm.hourlyRate}
                onChange={(e) => setRateForm((f) => ({ ...f, hourlyRate: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => updateRate.mutate({ id: rateForm.employeeId, rate: rateForm.hourlyRate })}
              disabled={!rateForm.hourlyRate || updateRate.isPending}
            >
              {updateRate.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Rate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
