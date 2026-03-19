import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Pencil, UserRound, Users2, Check, X } from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────
interface StaffRoleType {
  id: number; name: string; color?: string | null; sortOrder: number;
}
interface Employee {
  id: number; name: string; role: string; email?: string | null;
}
interface StaffSlot {
  id: number; eventId: number;
  roleTypeId?: number | null; roleName?: string | null; roleColor?: string | null;
  assignedEmployeeId?: number | null; assignedEmployeeName?: string | null; assignedEmployeeRole?: string | null;
  startTime?: string | null; endTime?: string | null; notes?: string | null;
  confirmed?: boolean | null; isAutoCreated?: boolean | null;
}
interface EventMeta {
  id: number; title: string; startDate?: string | null; endDate?: string | null; location?: string | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toDatePart(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toTimePart(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtDateLabel(dateStr: string): string {
  if (!dateStr) return "";
  return format(new Date(dateStr + "T00:00:00"), "EEE, MMM d");
}
const TIME_OPTIONS: { value: string; label: string }[] = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  const pad = (n: number) => String(n).padStart(2, "0");
  const value = `${pad(h)}:${pad(m)}`;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const label = `${h12}:${pad(m)} ${period}`;
  return { value, label };
});
function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return format(new Date(iso), "EEE M/d, h:mm a");
}
function fmtTimeShort(iso: string | null | undefined): string {
  if (!iso) return "";
  return format(new Date(iso), "h:mm a");
}
function sameDay(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return format(new Date(a), "yyyy-MM-dd") === format(new Date(b), "yyyy-MM-dd");
}
function shiftLabel(startTime: string | null | undefined, endTime: string | null | undefined): string {
  if (!startTime && !endTime) return "Time TBD";
  if (startTime && !endTime) return fmtTime(startTime);
  if (!startTime && endTime) return `Until ${fmtTimeShort(endTime)}`;
  if (sameDay(startTime, endTime)) {
    return `${fmtTime(startTime)} – ${fmtTimeShort(endTime)}`;
  }
  return `${fmtTime(startTime)} – ${fmtTime(endTime)}`;
}

// ── SlotCard ─────────────────────────────────────────────────────────────────
function SlotCard({
  slot, employees, onUpdate, onDelete,
}: {
  slot: StaffSlot;
  employees: Employee[];
  onUpdate: (id: number, data: Record<string, unknown>) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    assignedEmployeeId: slot.assignedEmployeeId ? String(slot.assignedEmployeeId) : "unassigned",
    startTime: toLocalInput(slot.startTime),
    endTime: toLocalInput(slot.endTime),
    notes: slot.notes ?? "",
  });

  const filled = !!slot.assignedEmployeeId;

  function save() {
    onUpdate(slot.id, {
      assignedEmployeeId: form.assignedEmployeeId && form.assignedEmployeeId !== "unassigned" ? Number(form.assignedEmployeeId) : null,
      startTime: form.startTime || null,
      endTime: form.endTime || null,
      notes: form.notes || null,
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="rounded-xl border border-primary/40 bg-muted/20 p-3 space-y-3">
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Assign To</label>
          <Select value={form.assignedEmployeeId} onValueChange={v => setForm(f => ({ ...f, assignedEmployeeId: v }))}>
            <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue placeholder="Leave unassigned…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {employees.map(e => (
                <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Start</label>
            <Input type="datetime-local" className="h-8 rounded-lg text-xs" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">End</label>
            <Input type="datetime-local" className="h-8 rounded-lg text-xs" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Notes</label>
          <Textarea className="rounded-lg text-xs min-h-[48px]" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes…" />
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" className="h-7 text-xs rounded-lg" onClick={() => setEditing(false)}><X className="h-3 w-3 mr-1" />Cancel</Button>
          <Button size="sm" className="h-7 text-xs rounded-lg gap-1" onClick={save}><Check className="h-3 w-3" />Save</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${filled ? "border-border/30 bg-muted/20" : "border-dashed border-border/50 bg-transparent"}`}>
      <div className={`shrink-0 flex items-center justify-center w-7 h-7 rounded-full ${filled ? "bg-primary/10 text-primary" : "bg-muted/40 text-muted-foreground/40"}`}>
        <UserRound className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className={`text-sm font-medium truncate ${filled ? "text-foreground" : "text-muted-foreground/50 italic"}`}>
            {filled ? slot.assignedEmployeeName : "Unassigned"}
          </p>
          {filled && (
            slot.confirmed
              ? <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400"><Check className="h-2.5 w-2.5" />Confirmed</span>
              : <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">Pending</span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground truncate">{shiftLabel(slot.startTime, slot.endTime)}</p>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={() => { setForm({ assignedEmployeeId: slot.assignedEmployeeId ? String(slot.assignedEmployeeId) : "unassigned", startTime: toLocalInput(slot.startTime), endTime: toLocalInput(slot.endTime), notes: slot.notes ?? "" }); setEditing(true); }} className="text-muted-foreground hover:text-foreground p-1">
          <Pencil className="h-3 w-3" />
        </button>
        <button onClick={() => onDelete(slot.id)} className="text-muted-foreground hover:text-destructive p-1">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ── Main Sheet ────────────────────────────────────────────────────────────────
export function StaffSlotsSheet({
  event, open, onClose,
}: {
  event: EventMeta | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: roleTypes = [] } = useQuery<StaffRoleType[]>({
    queryKey: ["/api/staff-role-types"],
    queryFn: async () => {
      const r = await fetch("/api/staff-role-types", { credentials: "include" });
      return r.json();
    },
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
    queryFn: async () => {
      const r = await fetch("/api/employees", { credentials: "include" });
      return r.json();
    },
  });

  const { data: slots = [] } = useQuery<StaffSlot[]>({
    queryKey: [`/api/events/${event?.id}/staff-slots`],
    queryFn: async () => {
      const r = await fetch(`/api/events/${event!.id}/staff-slots`, { credentials: "include" });
      return r.json();
    },
    enabled: !!event?.id,
  });

  // ── Add slot dialog ────────────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    roleTypeId: "", assignedEmployeeId: "unassigned",
    startDate: "", startTime: "", endDate: "", endTime: "", notes: "",
  });

  function openAddDialog(presetRoleTypeId?: string) {
    const sd = toDatePart(event?.startDate);
    const st = toTimePart(event?.startDate);
    const ed = toDatePart(event?.endDate) || sd;
    const et = toTimePart(event?.endDate) || st;
    setAddForm({
      roleTypeId: presetRoleTypeId || "",
      assignedEmployeeId: "unassigned",
      startDate: sd, startTime: st, endDate: ed, endTime: et, notes: "",
    });
    setAddOpen(true);
  }

  const { mutate: addSlot, isPending: adding } = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const r = await fetch(`/api/events/${event!.id}/staff-slots`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), credentials: "include" });
      if (!r.ok) throw new Error("Failed to create slot");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${event?.id}/staff-slots`] });
      setAddForm({ roleTypeId: "", assignedEmployeeId: "unassigned", startDate: "", startTime: "", endDate: "", endTime: "", notes: "" });
      setAddOpen(false);
      toast({ title: "Slot added" });
    },
    onError: () => toast({ title: "Failed to add slot", variant: "destructive" }),
  });

  const { mutate: updateSlot } = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const r = await fetch(`/api/events/${event!.id}/staff-slots/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), credentials: "include" });
      if (!r.ok) throw new Error("Failed to update slot");
      return r.json();
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${event?.id}/staff-slots`] });
      // Show toast only if employee was assigned
      if (vars.data.assignedEmployeeId) toast({ title: "Assigned — confirmation email sent" });
    },
    onError: () => toast({ title: "Failed to update slot", variant: "destructive" }),
  });

  const { mutate: deleteSlot } = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/events/${event!.id}/staff-slots/${id}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/events/${event?.id}/staff-slots`] }),
  });

  // Group slots by roleTypeId
  const grouped = roleTypes
    .map(rt => ({
      roleType: rt,
      slots: slots.filter(s => s.roleTypeId === rt.id),
    }))
    .filter(g => g.slots.length > 0);

  // Slots without a role (auto-created from employee assignment)
  const unroledSlots = slots.filter(s => !s.roleTypeId);

  // Roles that have no slots yet (for empty state)
  const allRolesWithSlots = new Set(slots.map(s => s.roleTypeId));

  const totalSlots = slots.length;
  const filledSlots = slots.filter(s => s.assignedEmployeeId).length;

  if (!event) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
        <SheetContent side="right" className="w-full sm:w-full sm:max-w-2xl p-0 flex flex-col overflow-hidden">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/30 shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <SheetTitle className="font-display text-xl">
                  Staff Schedule — <span className="text-muted-foreground font-normal">{event.title}</span>
                </SheetTitle>
                {event.startDate && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {format(new Date(event.startDate), "EEE, MMM d")}
                    {event.endDate && !sameDay(event.startDate, event.endDate)
                      ? ` – ${format(new Date(event.endDate), "EEE, MMM d")}`
                      : ""}
                    {event.location ? ` · ${event.location}` : ""}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="text-xs rounded-lg">
                  {filledSlots}/{totalSlots} filled
                </Badge>
                <Button size="sm" className="rounded-xl gap-1.5 shadow-sm shadow-primary/20" onClick={() => openAddDialog()}>
                  <Plus className="h-3.5 w-3.5" /> Add Slot
                </Button>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {slots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-border/50 text-center">
                <Users2 className="h-10 w-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No staff slots yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Click "Add Slot" to start scheduling staff for this event</p>
              </div>
            ) : (
              <>
                {/* Auto-created slots (no role) from simple employee assignment */}
                {unroledSlots.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-block w-2 h-2 rounded-full shrink-0 bg-muted-foreground/40" />
                      <span className="text-sm font-semibold">Assigned Staff</span>
                      <span className="text-xs text-muted-foreground">
                        {unroledSlots.filter(s => s.assignedEmployeeId).length}/{unroledSlots.length} filled
                      </span>
                      <span className="text-[10px] text-muted-foreground/50 italic ml-1">auto-scheduled</span>
                    </div>
                    <div className="space-y-2">
                      {unroledSlots.map(slot => (
                        <SlotCard
                          key={slot.id}
                          slot={slot}
                          employees={employees}
                          onUpdate={(id, data) => updateSlot({ id, data })}
                          onDelete={deleteSlot}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {/* Role-grouped slots */}
                {grouped.map(({ roleType, slots: roleSlots }) => (
                  <div key={roleType.id}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: roleType.color ?? "#7250ef" }}
                        />
                        <span className="text-sm font-semibold">{roleType.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {roleSlots.filter(s => s.assignedEmployeeId).length}/{roleSlots.length} filled
                        </span>
                      </div>
                      <button
                        className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                        onClick={() => openAddDialog(String(roleType.id))}
                      >
                        <Plus className="h-3 w-3" /> slot
                      </button>
                    </div>
                    <div className="space-y-2">
                      {roleSlots.map(slot => (
                        <SlotCard
                          key={slot.id}
                          slot={slot}
                          employees={employees}
                          onUpdate={(id, data) => updateSlot({ id, data })}
                          onDelete={deleteSlot}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Add Slot Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[420px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Add Staff Slot</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Role *</label>
              <Select value={addForm.roleTypeId} onValueChange={v => setAddForm(f => ({ ...f, roleTypeId: v }))}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select a role…" /></SelectTrigger>
                <SelectContent position="popper">
                  {roleTypes.map(rt => (
                    <SelectItem key={rt.id} value={String(rt.id)}>
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: rt.color ?? "#7250ef" }} />
                        {rt.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Assign To (optional)</label>
              <Select value={addForm.assignedEmployeeId} onValueChange={v => setAddForm(f => ({ ...f, assignedEmployeeId: v }))}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Leave unassigned for now…" /></SelectTrigger>
                <SelectContent position="popper" className="max-h-60 overflow-y-auto">
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Shift Start</label>
                <Input type="date" className="rounded-xl h-9 text-sm" value={addForm.startDate} onChange={e => setAddForm(f => ({ ...f, startDate: e.target.value }))} />
                <Input type="time" className="rounded-xl h-9 text-sm" value={addForm.startTime} onChange={e => setAddForm(f => ({ ...f, startTime: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Shift End</label>
                <Input type="date" className="rounded-xl h-9 text-sm" value={addForm.endDate} onChange={e => setAddForm(f => ({ ...f, endDate: e.target.value }))} />
                <Input type="time" className="rounded-xl h-9 text-sm" value={addForm.endTime} onChange={e => setAddForm(f => ({ ...f, endTime: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Notes</label>
              <Textarea className="rounded-xl min-h-[60px]" value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} placeholder="Setup instructions, parking info, etc." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button className="rounded-xl" disabled={!addForm.roleTypeId || adding}
              onClick={() => addSlot({
                roleTypeId: Number(addForm.roleTypeId),
                assignedEmployeeId: addForm.assignedEmployeeId && addForm.assignedEmployeeId !== "unassigned" ? Number(addForm.assignedEmployeeId) : null,
                startTime: addForm.startDate && addForm.startTime ? `${addForm.startDate}T${addForm.startTime}:00` : null,
                endTime: addForm.endDate && addForm.endTime ? `${addForm.endDate}T${addForm.endTime}:00` : null,
                notes: addForm.notes || null,
              })}>
              Add Slot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
