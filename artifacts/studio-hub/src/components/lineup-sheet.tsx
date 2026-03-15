import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical, Plus, Trash2, Music, Megaphone, Coffee, ChevronDown, ChevronUp,
  Clock, Timer, Save, Pencil, X, Users, Layers,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Band { id: number; name: string; genre?: string | null; members?: number | null; notes?: string | null; }
interface LineupSlot {
  id: number; eventId: number; bandId?: number | null; bandName?: string | null;
  position: number; label?: string | null; startTime?: string | null;
  durationMinutes?: number | null; bufferMinutes?: number | null;
  isOverlapping: boolean; type: string; notes?: string | null;
}

// ── Time helpers ───────────────────────────────────────────────────────────────
function fmt12(t: string | null | undefined): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${period}`;
}

function addMinutes(t: string, mins: number): string {
  const [h, m] = t.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function computeTimes(slots: LineupSlot[]): (string | null)[] {
  const out: (string | null)[] = [];
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s.startTime) { out.push(s.startTime); continue; }
    if (i === 0) { out.push(null); continue; }
    if (s.isOverlapping) { out.push(out[i - 1]); continue; }
    const prev = slots[i - 1];
    const prevT = out[i - 1];
    if (!prevT || !prev.durationMinutes) { out.push(null); continue; }
    out.push(addMinutes(prevT, prev.durationMinutes + (prev.bufferMinutes ?? 0)));
  }
  return out;
}

const SLOT_TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  act:          { label: "Act",          icon: <Music className="h-3.5 w-3.5" />,     color: "text-primary" },
  announcement: { label: "Announcement", icon: <Megaphone className="h-3.5 w-3.5" />, color: "text-amber-500" },
  break:        { label: "Break",        icon: <Coffee className="h-3.5 w-3.5" />,     color: "text-emerald-500" },
};

// ── Sortable slot row ──────────────────────────────────────────────────────────
function SlotRow({
  slot, calcTime, bands, eventId,
  onUpdate, onDelete,
}: {
  slot: LineupSlot; calcTime: string | null; bands: Band[]; eventId: number;
  onUpdate: (id: number, data: Partial<LineupSlot>) => void;
  onDelete: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: slot.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState({
    label: slot.label ?? "",
    startTime: slot.startTime ?? "",
    duration: slot.durationMinutes ? String(slot.durationMinutes) : "",
    buffer: slot.bufferMinutes !== null && slot.bufferMinutes !== undefined ? String(slot.bufferMinutes) : "15",
    isOverlapping: slot.isOverlapping,
    notes: slot.notes ?? "",
    bandId: slot.bandId ? String(slot.bandId) : "",
  });

  const displayName = slot.bandName || slot.label || (SLOT_TYPE_META[slot.type]?.label ?? slot.type);
  const meta = SLOT_TYPE_META[slot.type] ?? SLOT_TYPE_META.act;

  function save() {
    onUpdate(slot.id, {
      label: draft.label || null,
      startTime: draft.startTime || null,
      durationMinutes: draft.duration ? Number(draft.duration) : null,
      bufferMinutes: Number(draft.buffer) || 15,
      isOverlapping: draft.isOverlapping,
      notes: draft.notes || null,
      bandId: draft.bandId ? Number(draft.bandId) : null,
    });
  }

  return (
    <div ref={setNodeRef} style={style} className={`rounded-xl border transition-all ${slot.isOverlapping ? "border-[#00b199]/30 bg-[#00b199]/5 ml-6" : "border-border/50 bg-card"} ${isDragging ? "shadow-lg" : "shadow-sm"}`}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Drag handle */}
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground p-0.5 touch-none">
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Time */}
        <div className="w-20 shrink-0 text-sm font-mono font-medium text-muted-foreground">
          {calcTime ? (
            <span className="text-foreground/80">{fmt12(calcTime)}</span>
          ) : (
            <span className="text-muted-foreground/40 text-xs">set time</span>
          )}
        </div>

        {/* Type icon */}
        <span className={`shrink-0 ${meta.color}`}>{meta.icon}</span>

        {/* Name */}
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm truncate block">{displayName}</span>
          {slot.isOverlapping && (
            <span className="text-[10px] text-[#00b199] font-medium">↪ overlaps with previous</span>
          )}
        </div>

        {/* Duration */}
        {slot.durationMinutes && (
          <Badge variant="outline" className="text-[10px] shrink-0 gap-1 border-border/40">
            <Timer className="h-2.5 w-2.5" />{slot.durationMinutes}m
          </Badge>
        )}
        {!slot.isOverlapping && slot.bufferMinutes != null && slot.bufferMinutes > 0 && (
          <Badge variant="outline" className="text-[10px] shrink-0 border-dashed border-border/30 text-muted-foreground gap-1">
            +{slot.bufferMinutes}m
          </Badge>
        )}

        {/* Expand / delete */}
        <button onClick={() => setExpanded(e => !e)} className="text-muted-foreground hover:text-foreground transition-colors p-0.5">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <button onClick={() => onDelete(slot.id)} className="text-muted-foreground hover:text-destructive transition-colors p-0.5">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Expanded edit panel */}
      {expanded && (
        <div className="border-t border-border/40 px-4 pb-4 pt-3 space-y-3">
          {slot.type === "act" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Band / Act</label>
                <Select value={draft.bandId} onValueChange={(v) => setDraft(d => ({ ...d, bandId: v, label: v === "_custom" ? d.label : "" }))}>
                  <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue placeholder="Pick a band…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_custom">Custom name…</SelectItem>
                    {bands.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {(draft.bandId === "_custom" || !draft.bandId) && (
                <div className="space-y-1">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Custom Label</label>
                  <Input className="h-8 rounded-lg text-xs" value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} placeholder="Act name…" />
                </div>
              )}
            </div>
          )}
          {slot.type !== "act" && (
            <div className="space-y-1">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Label</label>
              <Input className="h-8 rounded-lg text-xs" value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} placeholder="e.g. MC introduces headliner, Intermission…" />
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Set time (manual)</label>
              <Input type="time" className="h-8 rounded-lg text-xs" value={draft.startTime} onChange={e => setDraft(d => ({ ...d, startTime: e.target.value }))} />
              {draft.startTime && <p className="text-[10px] text-muted-foreground">Overrides auto-calc</p>}
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Duration (min)</label>
              <Input type="number" min="0" className="h-8 rounded-lg text-xs" value={draft.duration} onChange={e => setDraft(d => ({ ...d, duration: e.target.value }))} placeholder="30" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Buffer after (min)</label>
              <Input type="number" min="0" className="h-8 rounded-lg text-xs" value={draft.buffer} onChange={e => setDraft(d => ({ ...d, buffer: e.target.value }))} placeholder="15" />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2">
            <div>
              <p className="text-xs font-medium">Overlaps with previous act</p>
              <p className="text-[10px] text-muted-foreground">Runs at the same time — e.g. dance group while next band sets up</p>
            </div>
            <Switch checked={draft.isOverlapping} onCheckedChange={v => setDraft(d => ({ ...d, isOverlapping: v }))} />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Notes / Announcements</label>
            <textarea
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs min-h-[60px] resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={draft.notes}
              onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
              placeholder="MC script, announcement text, setup notes…"
            />
          </div>

          <Button size="sm" className="w-full rounded-lg h-8 text-xs" onClick={save}>
            <Save className="h-3 w-3 mr-1.5" /> Save Changes
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main sheet ─────────────────────────────────────────────────────────────────
export function LineupSheet({ event, open, onClose }: {
  event: { id: number; title: string } | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const eventId = event?.id;

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: rawBands = [] } = useQuery<Band[]>({
    queryKey: ["/api/bands"],
    queryFn: async () => { const r = await fetch("/api/bands"); return r.json(); },
    enabled: open,
  });
  const { data: rawSlots = [] } = useQuery<LineupSlot[]>({
    queryKey: [`/api/events/${eventId}/lineup`],
    queryFn: async () => { const r = await fetch(`/api/events/${eventId}/lineup`); return r.json(); },
    enabled: open && !!eventId,
  });

  // Local optimistic slots state for smooth drag-and-drop
  const [localSlots, setLocalSlots] = useState<LineupSlot[] | null>(null);
  const slots = localSlots ?? rawSlots;

  // Reset local state whenever server data refreshes or event changes
  useEffect(() => { setLocalSlots(null); }, [rawSlots, eventId]);

  // ── Band mutations ────────────────────────────────────────────────────────────
  const [newBandName, setNewBandName] = useState("");
  const [newBandGenre, setNewBandGenre] = useState("");
  const [newBandMembers, setNewBandMembers] = useState("");
  const [addBandOpen, setAddBandOpen] = useState(false);

  const { mutate: createBand, isPending: creatingBand } = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch("/api/bands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bands"] });
      setNewBandName(""); setNewBandGenre(""); setNewBandMembers(""); setAddBandOpen(false);
      toast({ title: "Band added" });
    },
  });

  const { mutate: deleteBand } = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/bands/${id}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/bands"] }),
  });

  // ── Lineup mutations ──────────────────────────────────────────────────────────
  const [addSlotOpen, setAddSlotOpen] = useState(false);
  const [newSlot, setNewSlot] = useState({
    type: "act", bandId: "", label: "", startTime: "", duration: "", buffer: "15", isOverlapping: false,
  });

  const { mutate: addSlot, isPending: addingSlot } = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch(`/api/events/${eventId}/lineup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      return r.json();
    },
    onSuccess: (newSlotData) => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/lineup`] });
      setLocalSlots([]);
      setAddSlotOpen(false);
      setNewSlot({ type: "act", bandId: "", label: "", startTime: "", duration: "", buffer: "15", isOverlapping: false });
      toast({ title: "Slot added" });
    },
  });

  const { mutate: updateSlot } = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await fetch(`/api/events/${eventId}/lineup/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/lineup`] });
      setLocalSlots([]);
    },
    onError: () => toast({ title: "Failed to update slot", variant: "destructive" }),
  });

  const { mutate: deleteSlot } = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/events/${eventId}/lineup/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/lineup`] });
      setLocalSlots([]);
    },
  });

  const { mutate: reorderSlots } = useMutation({
    mutationFn: async (items: { id: number; position: number }[]) => {
      await fetch(`/api/events/${eventId}/lineup/reorder`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(items) });
    },
  });

  // ── Drag and drop ─────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = slots.findIndex(s => s.id === active.id);
    const newIdx = slots.findIndex(s => s.id === over.id);
    const reordered = arrayMove(slots, oldIdx, newIdx).map((s, i) => ({ ...s, position: i }));
    setLocalSlots(reordered);
    reorderSlots(reordered.map(s => ({ id: s.id, position: s.position })));
  }

  const calcTimes = computeTimes(slots);

  const handleUpdate = useCallback((id: number, data: Partial<LineupSlot>) => {
    updateSlot({ id, data });
  }, [updateSlot]);

  const handleDelete = useCallback((id: number) => {
    deleteSlot(id);
  }, [deleteSlot]);

  function submitAddSlot() {
    addSlot({
      type: newSlot.type,
      bandId: newSlot.bandId && newSlot.bandId !== "_custom" ? Number(newSlot.bandId) : null,
      label: newSlot.label || null,
      startTime: newSlot.startTime || null,
      durationMinutes: newSlot.duration ? Number(newSlot.duration) : null,
      bufferMinutes: Number(newSlot.buffer) || 15,
      isOverlapping: newSlot.isOverlapping,
      position: slots.length,
    });
  }

  return (
    <Sheet open={open} onOpenChange={o => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:w-full sm:max-w-5xl p-0 flex flex-col overflow-hidden">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/30 shrink-0">
          <SheetTitle className="font-display text-xl">
            Band Lineup — <span className="text-muted-foreground font-normal">{event?.title}</span>
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* ── Left: Bands panel ─────────────────────────────────────────────── */}
          <div className="w-72 shrink-0 border-r border-border/30 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/20">
              <span className="text-sm font-semibold">Band Roster</span>
              <Button size="sm" variant="outline" className="h-7 text-xs rounded-lg gap-1" onClick={() => setAddBandOpen(true)}>
                <Plus className="h-3 w-3" /> Add Band
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {rawBands.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">No bands yet. Add one to get started.</p>
              )}
              {rawBands.map(band => (
                <div key={band.id} className="flex items-start gap-2 rounded-xl bg-muted/30 border border-border/30 px-3 py-2.5 group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{band.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {band.genre && <span className="text-[10px] text-muted-foreground truncate">{band.genre}</span>}
                      {band.members && (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0">
                          <Users className="h-2.5 w-2.5" />{band.members}
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => deleteBand(band.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-0.5">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right: Lineup panel ───────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-semibold">Show Order</p>
                <p className="text-xs text-muted-foreground">Drag to reorder · Times auto-calculate from duration + buffer</p>
              </div>
              <Button size="sm" className="rounded-xl gap-1.5 shadow-sm shadow-primary/20" onClick={() => setAddSlotOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Add Slot
              </Button>
            </div>

            {slots.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-border/50 text-center">
                <Music className="h-10 w-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No acts added yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Click "Add Slot" to start building the lineup</p>
              </div>
            )}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={slots.map(s => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {slots.map((slot, i) => (
                    <SlotRow
                      key={slot.id}
                      slot={slot}
                      calcTime={calcTimes[i]}
                      bands={rawBands}
                      eventId={eventId!}
                      onUpdate={handleUpdate}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {/* End of show total time */}
            {slots.length > 0 && (() => {
              const lastTime = calcTimes[calcTimes.length - 1];
              const last = slots[slots.length - 1];
              if (!lastTime || !last.durationMinutes) return null;
              const endTime = addMinutes(lastTime, last.durationMinutes);
              return (
                <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
                  <div className="h-px flex-1 bg-border/40" />
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Show ends ~{fmt12(endTime)}</span>
                  <div className="h-px flex-1 bg-border/40" />
                </div>
              );
            })()}
          </div>
        </div>
      </SheetContent>

      {/* Add Band Dialog */}
      <Dialog open={addBandOpen} onOpenChange={setAddBandOpen}>
        <DialogContent className="sm:max-w-[360px] rounded-2xl">
          <DialogHeader><DialogTitle className="font-display text-xl">Add Band / Act</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><label className="text-xs font-medium">Name *</label>
              <Input className="rounded-xl" value={newBandName} onChange={e => setNewBandName(e.target.value)} placeholder="The Midnight Groove" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><label className="text-xs font-medium">Genre</label>
                <Input className="rounded-xl" value={newBandGenre} onChange={e => setNewBandGenre(e.target.value)} placeholder="Jazz, Rock…" />
              </div>
              <div className="space-y-1"><label className="text-xs font-medium">Members</label>
                <Input type="number" min="1" className="rounded-xl" value={newBandMembers} onChange={e => setNewBandMembers(e.target.value)} placeholder="4" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setAddBandOpen(false)}>Cancel</Button>
            <Button className="rounded-xl" disabled={!newBandName || creatingBand}
              onClick={() => createBand({ name: newBandName, genre: newBandGenre || null, members: newBandMembers ? Number(newBandMembers) : null })}>
              Add Band
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Slot Dialog */}
      <Dialog open={addSlotOpen} onOpenChange={setAddSlotOpen}>
        <DialogContent className="sm:max-w-[440px] rounded-2xl">
          <DialogHeader><DialogTitle className="font-display text-xl">Add Lineup Slot</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Slot Type</label>
              <div className="flex gap-2">
                {(["act", "announcement", "break"] as const).map(t => (
                  <button key={t} onClick={() => setNewSlot(s => ({ ...s, type: t }))}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium border transition-all ${newSlot.type === t ? "bg-primary text-primary-foreground border-primary" : "border-border/50 text-muted-foreground hover:border-primary/50"}`}>
                    {SLOT_TYPE_META[t].icon}{SLOT_TYPE_META[t].label}
                  </button>
                ))}
              </div>
            </div>

            {newSlot.type === "act" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2">
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Band / Act</label>
                  <Select value={newSlot.bandId} onValueChange={v => setNewSlot(s => ({ ...s, bandId: v }))}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Pick from roster or custom…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_custom">Custom name…</SelectItem>
                      {rawBands.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {(newSlot.bandId === "_custom" || !newSlot.bandId) && (
                  <div className="space-y-1 col-span-2">
                    <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Custom Label</label>
                    <Input className="rounded-xl" value={newSlot.label} onChange={e => setNewSlot(s => ({ ...s, label: e.target.value }))} placeholder="Act name…" />
                  </div>
                )}
              </div>
            )}
            {newSlot.type !== "act" && (
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Label</label>
                <Input className="rounded-xl" value={newSlot.label} onChange={e => setNewSlot(s => ({ ...s, label: e.target.value }))} placeholder={newSlot.type === "announcement" ? "MC introduces headliner…" : "Intermission…"} />
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Set time</label>
                <Input type="time" className="rounded-xl" value={newSlot.startTime} onChange={e => setNewSlot(s => ({ ...s, startTime: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Duration (min)</label>
                <Input type="number" min="0" className="rounded-xl" value={newSlot.duration} onChange={e => setNewSlot(s => ({ ...s, duration: e.target.value }))} placeholder="30" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Buffer after (min)</label>
                <Input type="number" min="0" className="rounded-xl" value={newSlot.buffer} onChange={e => setNewSlot(s => ({ ...s, buffer: e.target.value }))} placeholder="15" />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/40 px-4 py-3">
              <div>
                <p className="text-sm font-medium flex items-center gap-1.5"><Layers className="h-3.5 w-3.5 text-[#00b199]" /> Overlaps with previous act</p>
                <p className="text-xs text-muted-foreground mt-0.5">Runs at the same time — e.g. dance group while band sets up</p>
              </div>
              <Switch checked={newSlot.isOverlapping} onCheckedChange={v => setNewSlot(s => ({ ...s, isOverlapping: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setAddSlotOpen(false)}>Cancel</Button>
            <Button className="rounded-xl" disabled={addingSlot} onClick={submitAddSlot}>
              {addingSlot ? "Adding…" : "Add to Lineup"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
