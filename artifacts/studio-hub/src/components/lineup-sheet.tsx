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
  DndContext, DragOverlay, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  useDraggable, useDroppable,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical, Plus, Trash2, Music, Megaphone, Coffee, ChevronDown, ChevronUp,
  Clock, Timer, Save, Pencil, X, Users, Layers, CheckCircle2, Circle, Printer,
  Send, Mail, Users2, UserCheck, AlertCircle, RefreshCw, Info, Phone, Globe, Loader2,
  Copy, Check, TriangleAlert, ShieldCheck,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Band {
  id: number; name: string; genre?: string | null; members?: number | null;
  contactName?: string | null; contactEmail?: string | null; contactPhone?: string | null;
  notes?: string | null; website?: string | null; instagram?: string | null;
  leaderName?: string | null;
}

interface BandMember {
  id: number; bandId: number; name: string; role?: string | null;
  email?: string | null; phone?: string | null; notes?: string | null;
  contacts: BandContact[];
}

interface BandContact {
  id: number; memberId: number; bandId: number; name: string;
  email?: string | null; phone?: string | null; relationship?: string | null; isPrimary: boolean;
}

interface BandInvite {
  id: number; memberId?: number | null; memberName?: string | null;
  contactName: string | null; contactEmail: string;
  status: string; conflictNote: string | null; sentAt: string | null; respondedAt: string | null;
  token?: string | null;
}

interface InviteGroup {
  key: string;
  label: string;
  contactLine: string;
  status: "confirmed" | "declined" | "pending";
  conflictNote: string | null;
  token: string | null;
}

function groupInvitesByMember(invites: BandInvite[]): InviteGroup[] {
  const map = new Map<string, BandInvite[]>();
  for (const inv of invites) {
    const key = inv.memberId ? `m:${inv.memberId}` : `c:${inv.id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(inv);
  }
  return Array.from(map.values()).map(group => {
    const anyConfirmed = group.some(i => i.status === "confirmed");
    const allDeclined = group.every(i => i.status === "declined");
    const aggStatus: "confirmed" | "declined" | "pending" = anyConfirmed ? "confirmed" : allDeclined ? "declined" : "pending";
    const label = group[0].memberName ?? group[0].contactName ?? group[0].contactEmail;
    const contactLine = group.map(i => i.contactName ?? i.contactEmail).filter(Boolean).join(", ");
    // Use the first pending invite's token; fall back to first token in the group
    const pendingWithToken = group.find(i => i.status === "pending" && i.token);
    const anyWithToken = group.find(i => i.token);
    const token = (pendingWithToken ?? anyWithToken)?.token ?? null;
    const conflictNote = group.find(i => i.conflictNote)?.conflictNote ?? null;
    return { key: group[0].memberId ? `m:${group[0].memberId}` : `c:${group[0].id}`, label, contactLine, status: aggStatus, conflictNote, token };
  });
}

interface LineupSlot {
  id: number; eventId: number; bandId?: number | null; bandName?: string | null;
  contactName?: string | null; contactEmail?: string | null;
  position: number; label?: string | null; startTime?: string | null;
  durationMinutes?: number | null; bufferMinutes?: number | null;
  isOverlapping: boolean; confirmed: boolean; type: string;
  groupName?: string | null; notes?: string | null;
  eventDay: number;
  staffNote?: string | null; inviteStatus: string;
  confirmationSent: boolean; reminderSent: boolean;
  // Band leader attendance
  leaderAttending?: boolean; leaderStaffSlotId?: number | null;
  bandLeaderName?: string | null;
  // Schedule conflict detection
  scheduleConflict?: boolean; conflictReason?: string | null;
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

function computeTimes(slots: LineupSlot[], baseTime: string | null = null): (string | null)[] {
  const out: (string | null)[] = [];
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];

    if (s.type === "group-header") {
      const isFirstGroup = !slots.slice(0, i).some(p => p.type === "group-header");
      if (isFirstGroup) {
        // Group 1: performers cascade from baseTime; the header itself gets no time
        out.push(null);
        continue;
      }
      // Group 2+: end of previous group's last slot + inter-group break (bufferMinutes on this header)
      let prevActualIdx = i - 1;
      while (prevActualIdx >= 0 && slots[prevActualIdx].type === "group-header") prevActualIdx--;
      if (prevActualIdx < 0) { out.push(baseTime); continue; }
      const prevActual = slots[prevActualIdx];
      const prevActualT = out[prevActualIdx];
      if (!prevActualT || !prevActual.durationMinutes) { out.push(null); continue; }
      const prevGroupEnd = addMinutes(prevActualT, prevActual.durationMinutes + (prevActual.bufferMinutes ?? 0));
      const gap = s.bufferMinutes ?? 0;
      out.push(gap > 0 ? addMinutes(prevGroupEnd, gap) : prevGroupEnd);
      continue;
    }

    // Manual override on a regular slot
    if (s.startTime) { out.push(s.startTime); continue; }
    // No predecessor at all → use baseTime
    if (i === 0) { out.push(baseTime); continue; }
    if (s.isOverlapping) { out.push(out[i - 1]); continue; }

    const prev = slots[i - 1];
    const prevT = out[i - 1];

    if (prev.type === "group-header") {
      // First slot in this group: start at the group header's computed time (null for Group 1 → baseTime)
      out.push(prevT ?? baseTime);
      continue;
    }

    // Normal slot-to-slot chain
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

const INVITE_STATUS_META: Record<string, { label: string; cls: string }> = {
  not_sent:  { label: "Not Invited", cls: "bg-muted/40 text-muted-foreground" },
  sent:      { label: "Invite Sent", cls: "bg-sky-500/15 text-sky-400 border-sky-500/20" },
  confirmed: { label: "Confirmed",   cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  declined:  { label: "Declined",    cls: "bg-red-500/15 text-red-400 border-red-500/20" },
};

// ── Invite status row (one per student/member group) ───────────────────────────
function InviteRow({ group }: { group: InviteGroup }) {
  const [copied, setCopied] = useState(false);
  const confirmUrl = group.token ? `${window.location.origin}/band-confirm/${group.token}` : null;

  function copyLink() {
    if (!confirmUrl) return;
    navigator.clipboard.writeText(confirmUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const statusCls = group.status === "confirmed"
    ? "text-emerald-400"
    : group.status === "declined"
    ? "text-red-400"
    : "text-muted-foreground";
  const statusIcon = group.status === "confirmed" ? "✅" : group.status === "declined" ? "❌" : "⏳";
  const statusLabel = group.status.charAt(0).toUpperCase() + group.status.slice(1);

  return (
    <div className="flex flex-col gap-0.5 py-1.5 border-b border-border/20 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">{group.label}</span>
        <span className={`text-[11px] font-medium flex items-center gap-1 ${statusCls}`}>
          {statusIcon} {statusLabel}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground truncate">{group.contactLine}</span>
        {confirmUrl && group.status !== "confirmed" && (
          <button
            onClick={copyLink}
            title="Copy confirmation link to text families"
            className={`shrink-0 flex items-center gap-0.5 text-[10px] transition-colors rounded px-1 py-0.5 ${copied ? "text-emerald-400 bg-emerald-500/10" : "text-primary/60 hover:text-primary hover:bg-primary/10"}`}
          >
            {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
            {copied ? "Copied!" : "Copy link"}
          </button>
        )}
      </div>
      {group.conflictNote && (
        <div className="mt-1 rounded-lg bg-amber-500/10 border border-amber-500/20 px-2 py-1.5">
          <p className="text-[11px] text-amber-400 font-medium mb-0.5">Day-of note:</p>
          <p className="text-[11px] text-amber-300/80">{group.conflictNote}</p>
        </div>
      )}
    </div>
  );
}

// ── Sortable slot row ──────────────────────────────────────────────────────────
function SlotRow({
  slot, calcTime, bands, eventId, isRecital, isTwoDay, isFirstGroupHeader,
  onUpdate, onDelete, onSendInvite, onSendConfirmation, onSendTimeUpdate, onClearConflict,
  ticketRequests,
}: {
  slot: LineupSlot; calcTime: string | null; bands: Band[]; eventId: number; isRecital?: boolean; isTwoDay?: boolean; isFirstGroupHeader?: boolean;
  onUpdate: (id: number, data: Partial<LineupSlot>) => Promise<void>;
  onDelete: (id: number) => void;
  onSendInvite: (slotId: number, staffNote: string) => void;
  onSendConfirmation: (slotId: number) => void;
  onSendTimeUpdate: (slotId: number) => void;
  onClearConflict: (id: number) => void;
  ticketRequests?: any[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: slot.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const [expanded, setExpanded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [draft, setDraft] = useState({
    label: slot.label ?? "",
    startTime: slot.startTime ?? "",
    duration: slot.durationMinutes ? String(slot.durationMinutes) : "",
    buffer: slot.bufferMinutes !== null && slot.bufferMinutes !== undefined ? String(slot.bufferMinutes) : "15",
    isOverlapping: slot.isOverlapping,
    notes: slot.notes ?? "",
    bandId: slot.bandId ? String(slot.bandId) : "",
    groupName: slot.groupName ?? "",
    staffNote: slot.staffNote ?? "",
    eventDay: slot.eventDay ?? 1,
  });

  // Sync draft when slot data changes from server (after save+refetch)
  useEffect(() => {
    setDraft({
      label: slot.label ?? "",
      startTime: slot.startTime ?? "",
      duration: slot.durationMinutes ? String(slot.durationMinutes) : "",
      buffer: slot.bufferMinutes !== null && slot.bufferMinutes !== undefined ? String(slot.bufferMinutes) : "15",
      isOverlapping: slot.isOverlapping,
      notes: slot.notes ?? "",
      bandId: slot.bandId ? String(slot.bandId) : "",
      groupName: slot.groupName ?? "",
      staffNote: slot.staffNote ?? "",
      eventDay: slot.eventDay ?? 1,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.id, slot.startTime, slot.durationMinutes, slot.bufferMinutes, slot.bandId, slot.label, slot.notes, slot.staffNote, slot.eventDay]);

  // For recital slots: find matching ticket request by student name
  const matchedRequest = isRecital && ticketRequests?.length
    ? ticketRequests.find((tr: any) => {
        const full = `${tr.studentFirstName ?? ""} ${tr.studentLastName ?? ""}`.trim().toLowerCase();
        const label = (slot.label ?? "").trim().toLowerCase();
        return full && label && (full === label || full.includes(label) || label.includes(full));
      }) ?? null
    : null;

  // Load invites when expanded and slot has a band
  const { data: invites = [], refetch: refetchInvites } = useQuery<BandInvite[]>({
    queryKey: [`/api/events/${eventId}/lineup/${slot.id}/invites`],
    queryFn: async () => {
      const r = await fetch(`/api/events/${eventId}/lineup/${slot.id}/invites`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: expanded && !!slot.bandId,
  });

  const [sendingInvite, setSendingInvite] = useState(false);
  const [sendingConfirm, setSendingConfirm] = useState(false);
  const [sendingTimeUpdate, setSendingTimeUpdate] = useState(false);

  const displayName = slot.bandName || slot.label || (SLOT_TYPE_META[slot.type]?.label ?? slot.type);
  const meta = SLOT_TYPE_META[slot.type] ?? SLOT_TYPE_META.act;
  const inviteStatusMeta = INVITE_STATUS_META[slot.inviteStatus] ?? INVITE_STATUS_META.not_sent;

  const inviteGroups = groupInvitesByMember(invites);
  const confirmedCount = inviteGroups.filter(g => g.status === "confirmed").length;
  const declinedCount = inviteGroups.filter(g => g.status === "declined").length;
  const pendingCount = inviteGroups.filter(g => g.status === "pending").length;

  async function save() {
    setSaveState("saving");
    try {
      await onUpdate(slot.id, {
        label: draft.label || null,
        startTime: draft.startTime || null,
        durationMinutes: draft.duration ? Number(draft.duration) : null,
        bufferMinutes: Number(draft.buffer) || 15,
        isOverlapping: draft.isOverlapping,
        notes: draft.notes || null,
        bandId: draft.bandId ? Number(draft.bandId) : null,
        groupName: draft.groupName || null,
        staffNote: draft.staffNote || null,
        eventDay: draft.eventDay,
      });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("idle");
    }
  }

  async function handleSendInvite() {
    setSendingInvite(true);
    try {
      await onSendInvite(slot.id, draft.staffNote);
      refetchInvites();
    } finally {
      setSendingInvite(false);
    }
  }

  async function handleSendConfirmation() {
    setSendingConfirm(true);
    try {
      await onSendConfirmation(slot.id);
    } finally {
      setSendingConfirm(false);
    }
  }

  async function handleSendTimeUpdate() {
    setSendingTimeUpdate(true);
    try {
      await onSendTimeUpdate(slot.id);
    } finally {
      setSendingTimeUpdate(false);
    }
  }

  // ── Group header rendering ────────────────────────────────────────────────
  if (slot.type === "group-header") {
    return (
      <div ref={setNodeRef} style={style} className={`flex items-center gap-2 py-1 ${isDragging ? "opacity-50" : ""}`}>
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground p-0.5 touch-none">
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 flex items-center gap-2">
          {/* Break duration before Group 2+ */}
          {!isFirstGroupHeader && (
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Break</span>
              <input
                type="number"
                min={0}
                value={draft.buffer}
                onChange={e => setDraft(d => ({ ...d, buffer: e.target.value }))}
                onBlur={() => {
                  const n = parseInt(draft.buffer, 10);
                  const val = isNaN(n) ? 0 : Math.max(0, n);
                  if (val !== (slot.bufferMinutes ?? 0)) onUpdate(slot.id, { bufferMinutes: val });
                }}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className="bg-transparent text-[11px] font-mono text-primary/70 border-0 outline-none focus:ring-0 w-8 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none hover:text-primary transition-colors"
                title="Break duration before this group (minutes)"
              />
              <span className="text-[10px] text-muted-foreground/50">min</span>
            </div>
          )}
          <div className="h-px flex-1 bg-primary/20" />
          <input
            className="bg-transparent text-xs font-bold uppercase tracking-widest text-primary/70 text-center min-w-0 w-28 border-0 outline-none focus:ring-0 hover:text-primary transition-colors"
            value={draft.label}
            onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
            onBlur={() => { if (draft.label !== (slot.label ?? "")) onUpdate(slot.id, { label: draft.label || null }); }}
            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            title="Click to rename group"
          />
          <div className="h-px flex-1 bg-primary/20" />
          {/* Calculated start time for this group */}
          {calcTime && (
            <span className="text-[11px] font-mono text-primary/50 shrink-0">{fmt12(calcTime)}</span>
          )}
        </div>
        <button onClick={() => onDelete(slot.id)} className="text-muted-foreground/30 hover:text-destructive transition-colors p-0.5">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  const hasConflict = slot.type === "act" && slot.scheduleConflict;

  return (
    <div ref={setNodeRef} style={style} className={`rounded-xl border transition-all ${hasConflict ? "border-red-500/50 bg-red-950/20" : slot.isOverlapping ? "border-[#00b199]/30 bg-[#00b199]/5 ml-6" : "border-border/50 bg-card"} ${isDragging ? "shadow-lg" : "shadow-sm"}`}>
      {/* Conflict banner */}
      {hasConflict && (
        <div className="flex items-start gap-2 px-4 pt-2.5 pb-1">
          <TriangleAlert className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
          <span className="text-[11px] text-red-400 flex-1 leading-snug">{slot.conflictReason || "Schedule conflict detected"}</span>
          <button
            onClick={() => onClearConflict(slot.id)}
            className="text-red-400/60 hover:text-red-300 transition-colors shrink-0"
            title="Clear conflict flag"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground p-0.5 touch-none">
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="w-20 shrink-0 text-sm font-mono font-medium text-muted-foreground">
          {calcTime ? <span className="text-foreground/80">{fmt12(calcTime)}</span> : <span className="text-muted-foreground/40 text-xs">set time</span>}
        </div>

        <span className={`shrink-0 ${meta.color}`}>{meta.icon}</span>

        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm truncate block">{displayName}</span>
          {slot.groupName && <span className="text-[10px] text-muted-foreground truncate block">{slot.groupName}</span>}
          {slot.isOverlapping && <span className="text-[10px] text-[#00b199] font-medium">↪ overlaps with previous</span>}
        </div>

        {/* Day badge for two-day events */}
        {isTwoDay && (
          <Badge variant="outline" className={`text-[10px] shrink-0 rounded-full px-2 font-semibold ${slot.eventDay === 2 ? "bg-orange-500/15 text-orange-400 border-orange-500/20" : "bg-sky-500/15 text-sky-400 border-sky-500/20"}`}>
            Day {slot.eventDay ?? 1}
          </Badge>
        )}

        {/* Invite status badge (acts with bands only) */}
        {slot.type === "act" && slot.bandId && (
          <Badge variant="outline" className={`text-[10px] shrink-0 rounded-full px-2 ${inviteStatusMeta.cls}`}>
            {inviteStatusMeta.label}
          </Badge>
        )}

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

        {slot.type === "act" && (
          <button
            title={slot.confirmed ? "Confirmed — click to unmark" : "Mark as confirmed"}
            onClick={() => onUpdate(slot.id, { confirmed: !slot.confirmed })}
            className={`shrink-0 transition-colors p-0.5 ${slot.confirmed ? "text-emerald-500 hover:text-emerald-400" : "text-muted-foreground/40 hover:text-emerald-500"}`}
          >
            {slot.confirmed ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
          </button>
        )}

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
          {/* Band / act selection */}
          {slot.type === "act" && !isRecital && (
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
          {slot.type === "act" && isRecital && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Student / Performer</label>
                  <Input className="h-8 rounded-lg text-xs" value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} placeholder="e.g. Alex Johnson" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Group / Class</label>
                  <Input className="h-8 rounded-lg text-xs" value={draft.groupName} onChange={e => setDraft(d => ({ ...d, groupName: e.target.value }))} placeholder="e.g. Beginner Guitar" />
                </div>
              </div>
              {/* Registration info pulled from ticket request */}
              {matchedRequest ? (
                <div className="rounded-xl border border-border/30 bg-muted/20 p-3 space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Registration Info</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Instrument</p>
                      <p className="text-xs font-medium">{matchedRequest.instrument || <span className="text-muted-foreground/50 italic">not entered</span>}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Recital Song</p>
                      <p className="text-xs font-medium">{matchedRequest.recitalSong || <span className="text-muted-foreground/50 italic">not entered</span>}</p>
                    </div>
                  </div>
                  {matchedRequest.specialConsiderations ? (
                    <div className={`rounded-lg px-2.5 py-2 ${slot.scheduleConflict ? "bg-red-500/10 border border-red-500/30" : "bg-amber-500/10 border border-amber-500/20"}`}>
                      <p className={`text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${slot.scheduleConflict ? "text-red-400" : "text-amber-400"}`}>
                        {slot.scheduleConflict ? "⚠ Scheduling Conflict" : "Scheduling / Special Note"}
                      </p>
                      <p className={`text-[11px] leading-snug ${slot.scheduleConflict ? "text-red-300/90" : "text-amber-300/80"}`}>
                        {matchedRequest.specialConsiderations}
                      </p>
                      {slot.scheduleConflict && slot.conflictReason && (
                        <p className="text-[10px] text-red-400/70 mt-1 italic">{slot.conflictReason}</p>
                      )}
                      {slot.scheduleConflict && (
                        <button
                          onClick={() => onClearConflict(slot.id)}
                          className="mt-1.5 text-[10px] text-red-400/60 hover:text-red-300 underline-offset-2 hover:underline transition-colors flex items-center gap-1"
                        >
                          <ShieldCheck className="h-3 w-3" /> Mark as resolved
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Scheduling Note</p>
                      <p className="text-xs text-muted-foreground/50 italic">none</p>
                    </div>
                  )}
                </div>
              ) : slot.type === "act" && slot.label && (
                <p className="text-[10px] text-muted-foreground/50 italic">No matching registration found for "{slot.label}"</p>
              )}
            </>
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
              <p className="text-[10px] text-muted-foreground">Runs simultaneously — e.g. dance group while next band sets up</p>
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

          {/* Day selector for two-day events */}
          {isTwoDay && (
            <div className="flex items-center gap-3 rounded-lg border border-border/40 px-3 py-2">
              <p className="text-xs font-medium flex-1">Which day does this slot occur?</p>
              <div className="flex gap-1.5">
                {[1, 2].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDraft(dr => ({ ...dr, eventDay: d }))}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${draft.eventDay === d ? d === 1 ? "bg-sky-500/20 text-sky-400 border-sky-500/30" : "bg-orange-500/20 text-orange-400 border-orange-500/30" : "bg-transparent text-muted-foreground border-border/40 hover:border-border"}`}
                  >
                    Day {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Button
            size="sm"
            className={`w-full rounded-lg h-8 text-xs transition-colors ${saveState === "saved" ? "bg-emerald-600 hover:bg-emerald-600 text-white" : ""}`}
            onClick={save}
            disabled={saveState === "saving"}
          >
            {saveState === "saving" && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
            {saveState === "saved" && <CheckCircle2 className="h-3 w-3 mr-1.5" />}
            {saveState === "idle" && <Save className="h-3 w-3 mr-1.5" />}
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved!" : "Save Changes"}
          </Button>

          {/* ── Band Leader Attendance (act slots where band has a leader) ─── */}
          {slot.type === "act" && slot.bandId && slot.bandLeaderName && (
            <div className="pt-2 border-t border-border/30">
              <div
                className={`flex items-center justify-between rounded-xl px-3 py-2.5 border transition-colors cursor-pointer ${slot.leaderAttending ? "bg-primary/10 border-primary/30" : "bg-transparent border-border/30 hover:border-border/50"}`}
                onClick={() => onUpdate(slot.id, { leaderAttending: !slot.leaderAttending })}
              >
                <div>
                  <p className="text-xs font-semibold">{slot.bandLeaderName ?? "Band Leader"} attending?</p>
                  <p className="text-[11px] text-muted-foreground">
                    {slot.leaderAttending
                      ? "Scheduled as staff — shift uses event times"
                      : "Toggle on to auto-schedule as event staff"}
                  </p>
                </div>
                <Switch
                  checked={!!slot.leaderAttending}
                  onCheckedChange={v => onUpdate(slot.id, { leaderAttending: v })}
                  onClick={e => e.stopPropagation()}
                />
              </div>
            </div>
          )}

          {/* ── Invite section (act slots with bands only) ──────────────────── */}
          {slot.type === "act" && slot.bandId && (
            <div className="pt-2 border-t border-border/30 space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Mail className="h-3 w-3" /> Band Invite
              </p>

              {/* Staff note for invite */}
              <div className="space-y-1">
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Estimated Slot Note <span className="text-muted-foreground/60 normal-case">(included in invite email)</span>
                </label>
                <textarea
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs min-h-[56px] resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={draft.staffNote}
                  onChange={e => setDraft(d => ({ ...d, staffNote: e.target.value }))}
                  placeholder="e.g. You'll likely go on around 7:00–7:45 PM. Final time confirmed closer to the event."
                />
              </div>

              {/* Invite action buttons */}
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg h-7 text-xs gap-1.5 flex-1"
                  disabled={sendingInvite}
                  onClick={handleSendInvite}
                  title={slot.inviteStatus === "not_sent"
                    ? "Send a personal confirmation link to every family contact for this band. Each contact gets their own link."
                    : "Send invites to any contacts added since the original invite went out. Already-invited contacts are skipped."}
                >
                  <Send className="h-3 w-3" />
                  {sendingInvite ? "Sending…" : slot.inviteStatus === "not_sent" ? "Send Invite" : "Re-invite New Contacts"}
                </Button>
                {(slot.confirmed || slot.inviteStatus === "confirmed") && !slot.confirmationSent && (
                  <Button
                    size="sm"
                    className="rounded-lg h-7 text-xs gap-1.5 flex-1 bg-emerald-600 hover:bg-emerald-500"
                    disabled={sendingConfirm}
                    onClick={handleSendConfirmation}
                    title="Send the official booking confirmation to all families (BCC) and the band leader (CC). Goes to info@ as the To address. Only shows once the band is confirmed."
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    {sendingConfirm ? "Sending…" : "Send Lock-In Email"}
                  </Button>
                )}
                {slot.confirmationSent && (
                  <>
                    <Badge variant="outline" className="text-[10px] px-2 bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shrink-0">
                      ✓ Lock-in sent
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg h-7 text-xs gap-1.5 flex-1 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                      disabled={sendingTimeUpdate}
                      onClick={handleSendTimeUpdate}
                      title="Use this if the set time changed after the lock-in email was already sent. Emails all non-declined families (BCC) with the updated time. Can be sent multiple times."
                    >
                      <Clock className="h-3 w-3" />
                      {sendingTimeUpdate ? "Sending…" : "Send Time Update"}
                    </Button>
                  </>
                )}
              </div>

              {/* Per-student invite status */}
              {inviteGroups.length > 0 && (
                <div className="rounded-xl border border-border/30 bg-muted/20 p-3 space-y-1">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Contact Responses</p>
                    <div className="flex items-center gap-2 text-[10px]">
                      {confirmedCount > 0 && <span className="text-emerald-400">✅ {confirmedCount} confirmed</span>}
                      {pendingCount > 0 && <span className="text-muted-foreground">⏳ {pendingCount} pending</span>}
                      {declinedCount > 0 && <span className="text-red-400">❌ {declinedCount} declined</span>}
                    </div>
                  </div>
                  {inviteGroups.map(group => <InviteRow key={group.key} group={group} />)}
                </div>
              )}
              {invites.length === 0 && slot.inviteStatus !== "not_sent" && (
                <p className="text-[11px] text-muted-foreground text-center py-1">Loading invite responses…</p>
              )}
              {slot.inviteStatus === "not_sent" && (
                <p className="text-[11px] text-muted-foreground">
                  No invites sent yet. Add a staff note above, then click Send Invite.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Print recital order ────────────────────────────────────────────────────────
function printRecitalOrder(title: string, slots: LineupSlot[], calcTimes: (string | null)[]) {
  let actNum = 0;
  const rows = slots
    .map((slot, i) => {
      if (slot.type === "group-header") {
        const groupTime = calcTimes[i] ? ` — ${fmt12(calcTimes[i])}` : "";
        return `<tr><td colspan="5" style="padding:10px 12px 6px;background:#f3f4f6;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#4b5563;border-top:2px solid #d1d5db;border-bottom:1px solid #e5e7eb;">${slot.label ?? "Group"}${groupTime}</td></tr>`;
      }
      if (slot.type !== "act") return "";
      actNum++;
      const time = calcTimes[i] ? fmt12(calcTimes[i]) : "";
      const name = slot.label || slot.bandName || "—";
      const group = slot.groupName || "";
      const dur = slot.durationMinutes ? `${slot.durationMinutes} min` : "";
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#888;font-size:13px;">${actNum}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600;">${name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">${group}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;font-family:monospace;">${time}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">${dur}</td>
      </tr>`;
    }).join("");

  const html = `<!DOCTYPE html><html><head><title>Recital Order — ${title}</title>
  <style>body{font-family:'Helvetica Neue',Arial,sans-serif;padding:40px;max-width:800px;margin:0 auto;color:#111;}
  h1{font-size:22px;margin-bottom:4px;}h2{font-size:13px;color:#666;font-weight:normal;margin-bottom:28px;}
  table{width:100%;border-collapse:collapse;}
  th{text-align:left;padding:8px 12px;background:#f3f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;border-bottom:2px solid #e5e7eb;}
  @media print{body{padding:20px;}}</style></head>
  <body><h1>${title}</h1><h2>Recital Order</h2>
  <table><thead><tr>
    <th>#</th><th>Performer</th><th>Group / Class</th><th>Time</th><th>Duration</th>
  </tr></thead><tbody>${rows}</tbody></table></body></html>`;

  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); w.print(); }
}

// ── Band Members Dialog ────────────────────────────────────────────────────────
function BandMembersDialog({ band, open, onClose }: { band: Band | null; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addingMember, setAddingMember] = useState(false);
  const [memberForm, setMemberForm] = useState({ name: "", role: "", email: "", phone: "" });
  const [addingContact, setAddingContact] = useState<number | null>(null);
  const [contactForm, setContactForm] = useState({ name: "", email: "", phone: "", relationship: "" });
  const [editingMember, setEditingMember] = useState<BandMember | null>(null);

  const { data: members = [], refetch } = useQuery<BandMember[]>({
    queryKey: [`/api/bands/${band?.id}/members`],
    queryFn: async () => {
      const r = await fetch(`/api/bands/${band!.id}/members`, { credentials: "include" });
      return r.json();
    },
    enabled: open && !!band,
  });

  const { mutate: createMember, isPending: creatingMember } = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch(`/api/bands/${band!.id}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(data) });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => { refetch(); setMemberForm({ name: "", role: "", email: "", phone: "" }); setAddingMember(false); toast({ title: "Member added" }); },
    onError: () => toast({ title: "Failed to add member", variant: "destructive" }),
  });

  const { mutate: deleteMember } = useMutation({
    mutationFn: async (id: number) => { await fetch(`/api/bands/members/${id}`, { method: "DELETE", credentials: "include" }); },
    onSuccess: () => { refetch(); toast({ title: "Member removed" }); },
  });

  const { mutate: createContact, isPending: creatingContact } = useMutation({
    mutationFn: async ({ memberId, data }: { memberId: number; data: any }) => {
      const r = await fetch(`/api/bands/members/${memberId}/contacts`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(data) });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => { refetch(); setContactForm({ name: "", email: "", phone: "", relationship: "" }); setAddingContact(null); toast({ title: "Contact added" }); },
    onError: () => toast({ title: "Failed to add contact", variant: "destructive" }),
  });

  const { mutate: deleteContact } = useMutation({
    mutationFn: async (id: number) => { await fetch(`/api/bands/contacts/${id}`, { method: "DELETE", credentials: "include" }); },
    onSuccess: () => { refetch(); },
  });

  if (!band) return null;

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:w-full sm:max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {band.name} — Members & Contacts
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Members list */}
          {members.map(member => (
            <div key={member.id} className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
              {/* Member header */}
              <div className="flex items-center gap-3 px-4 py-3 bg-muted/30">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{member.name}</p>
                  {member.role && <p className="text-xs text-muted-foreground">{member.role}</p>}
                </div>
                {member.email && <a href={`mailto:${member.email}`} className="text-[11px] text-primary hover:underline">{member.email}</a>}
                <button onClick={() => deleteMember(member.id)} className="text-muted-foreground hover:text-destructive transition-colors p-0.5 shrink-0">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Contacts */}
              <div className="px-4 py-2 space-y-2">
                {member.contacts.length === 0 && addingContact !== member.id && (
                  <p className="text-[11px] text-muted-foreground italic">No contacts yet</p>
                )}
                {member.contacts.map(contact => (
                  <div key={contact.id} className="flex items-center gap-2 rounded-lg border border-border/30 bg-card px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium">{contact.name}</span>
                        {contact.relationship && <span className="text-[10px] text-muted-foreground">({contact.relationship})</span>}
                        {contact.isPrimary && <Badge className="text-[9px] px-1 py-0 h-4 bg-primary/20 text-primary border-0">Primary</Badge>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {contact.email && <span className="text-[10px] text-muted-foreground">{contact.email}</span>}
                        {contact.phone && <span className="text-[10px] text-muted-foreground">{contact.phone}</span>}
                      </div>
                    </div>
                    <button onClick={() => deleteContact(contact.id)} className="text-muted-foreground hover:text-destructive p-0.5 shrink-0">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}

                {/* Add contact inline */}
                {addingContact === member.id ? (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-3 space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Add Contact</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input className="h-7 text-xs rounded-lg" placeholder="Name *" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} />
                      <Input className="h-7 text-xs rounded-lg" placeholder="Relationship (Parent, Self…)" value={contactForm.relationship} onChange={e => setContactForm(f => ({ ...f, relationship: e.target.value }))} />
                      <Input type="email" className="h-7 text-xs rounded-lg" placeholder="Email" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} />
                      <Input type="tel" className="h-7 text-xs rounded-lg" placeholder="Phone" value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs rounded-lg flex-1" disabled={!contactForm.name || creatingContact}
                        onClick={() => createContact({ memberId: member.id, data: { name: contactForm.name, email: contactForm.email || null, phone: contactForm.phone || null, relationship: contactForm.relationship || null } })}>
                        Add Contact
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs rounded-lg" onClick={() => { setAddingContact(null); setContactForm({ name: "", email: "", phone: "", relationship: "" }); }}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAddingContact(member.id); setContactForm({ name: "", email: "", phone: "", relationship: "" }); }}
                    className="text-[11px] text-primary hover:text-primary/80 transition-colors flex items-center gap-1 py-1"
                  >
                    <Plus className="h-3 w-3" /> Add contact
                  </button>
                )}
              </div>
            </div>
          ))}

          {members.length === 0 && !addingMember && (
            <p className="text-sm text-muted-foreground text-center py-4">No members yet. Add your first member below.</p>
          )}

          {/* Add member form */}
          {addingMember ? (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Add Member</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Name *</label>
                  <Input className="h-8 text-xs rounded-lg" placeholder="Alex Johnson" value={memberForm.name} onChange={e => setMemberForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Role / Instrument</label>
                  <Input className="h-8 text-xs rounded-lg" placeholder="Lead Vocals, Guitar…" value={memberForm.role} onChange={e => setMemberForm(f => ({ ...f, role: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Member Email</label>
                  <Input type="email" className="h-8 text-xs rounded-lg" placeholder="alex@email.com" value={memberForm.email} onChange={e => setMemberForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Phone</label>
                  <Input type="tel" className="h-8 text-xs rounded-lg" placeholder="(555) 000-0000" value={memberForm.phone} onChange={e => setMemberForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="flex-1 rounded-lg h-8 text-xs" disabled={!memberForm.name || creatingMember}
                  onClick={() => createMember({ name: memberForm.name, role: memberForm.role || null, email: memberForm.email || null, phone: memberForm.phone || null })}>
                  Add Member
                </Button>
                <Button size="sm" variant="ghost" className="rounded-lg h-8 text-xs" onClick={() => { setAddingMember(false); setMemberForm({ name: "", role: "", email: "", phone: "" }); }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="w-full rounded-xl h-9 text-xs gap-1.5" onClick={() => setAddingMember(true)}>
              <Plus className="h-3.5 w-3.5" /> Add Member
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Draggable band card (roster → show order) ───────────────────────────────
function DraggableBandCard({ band, children }: { band: Band; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `band-${band.id}` });
  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className="touch-none"
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

// ── Droppable show order area ────────────────────────────────────────────────
function DroppableShowOrder({ children, isEmpty }: { children: React.ReactNode; isEmpty: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: "show-order" });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 overflow-y-auto p-6 space-y-4 transition-colors ${isOver && isEmpty ? "bg-primary/5" : ""}`}
    >
      {children}
    </div>
  );
}

// ── Droppable per-day zone (two-day events) ───────────────────────────────────
function DroppableDayZone({ day, children, isDragging }: { day: number; children: React.ReactNode; isDragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-zone-${day}` });
  const isDay1 = day === 1;
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border-2 transition-all duration-150 ${
        isOver
          ? isDay1
            ? "border-sky-400 bg-sky-500/8 shadow-[0_0_0_3px_rgba(56,189,248,0.15)]"
            : "border-orange-400 bg-orange-500/8 shadow-[0_0_0_3px_rgba(251,146,60,0.15)]"
          : isDragging
            ? isDay1
              ? "border-sky-500/40 border-dashed"
              : "border-orange-500/40 border-dashed"
            : "border-transparent"
      }`}
    >
      {children}
    </div>
  );
}

// ── Main sheet ─────────────────────────────────────────────────────────────────
export function LineupSheet({ event, open, onClose }: {
  event: { id: number; title: string; type?: string; isTwoDay?: boolean; startDate?: string | null; lineupPreBufferMinutes?: number | null } | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const eventId = event?.id;

  // ── Pre-show buffer ─────────────────────────────────────────────────────────
  const [preBuffer, setPreBuffer] = useState<number>(0);
  // Sync from event prop when sheet opens or event changes
  useEffect(() => {
    setPreBuffer(event?.lineupPreBufferMinutes ?? 0);
  }, [event?.id, open]);

  // Extract HH:mm from event.startDate (ignore if time is midnight / no time set)
  const eventStartHHmm: string | null = (() => {
    if (!event?.startDate) return null;
    const d = new Date(event.startDate);
    const h = d.getHours(), m = d.getMinutes();
    if (h === 0 && m === 0) return null; // treat midnight as "no time set"
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  })();

  const showStartHHmm: string | null = eventStartHHmm
    ? (preBuffer !== 0 ? addMinutes(eventStartHHmm, preBuffer) : eventStartHHmm)
    : null;

  // Debounce-save buffer to event
  useEffect(() => {
    if (!eventId) return;
    const t = setTimeout(async () => {
      await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ lineupPreBufferMinutes: preBuffer }),
      });
    }, 600);
    return () => clearTimeout(t);
  }, [preBuffer, eventId]);

  const { data: rawBands = [] } = useQuery<Band[]>({
    queryKey: ["/api/bands"],
    queryFn: async () => { const r = await fetch("/api/bands", { credentials: "include" }); return r.json(); },
    enabled: open,
  });
  const { data: rawSlots = [] } = useQuery<LineupSlot[]>({
    queryKey: [`/api/events/${eventId}/lineup`],
    queryFn: async () => { const r = await fetch(`/api/events/${eventId}/lineup`, { credentials: "include" }); return r.json(); },
    enabled: open && !!eventId,
  });

  const isRecitalSheet = event?.type === "Recital";
  const { data: ticketRequests = [] } = useQuery<any[]>({
    queryKey: [`/api/events/${eventId}/ticket-requests`],
    queryFn: async () => { const r = await fetch(`/api/events/${eventId}/ticket-requests`, { credentials: "include" }); return r.json(); },
    enabled: open && !!eventId && isRecitalSheet,
  });

  const [localSlots, setLocalSlots] = useState<LineupSlot[] | null>(null);
  const slots = localSlots ?? rawSlots;
  useEffect(() => { setLocalSlots(null); }, [rawSlots, eventId]);

  const [activeDragBand, setActiveDragBand] = useState<Band | null>(null);

  // ── Band mutations ─────────────────────────────────────────────────────────
  const [newBandName, setNewBandName] = useState("");
  const [newBandGenre, setNewBandGenre] = useState("");
  const [newBandMembers, setNewBandMembers] = useState("");
  const [addBandOpen, setAddBandOpen] = useState(false);
  const [editingBand, setEditingBand] = useState<Band | null>(null);
  const [editBandForm, setEditBandForm] = useState({ name: "", genre: "", members: "", notes: "", website: "", instagram: "" });
  const [managingMembersBand, setManagingMembersBand] = useState<Band | null>(null);

  const { mutate: createBand, isPending: creatingBand } = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch("/api/bands", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(data) });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bands"] });
      setNewBandName(""); setNewBandGenre(""); setNewBandMembers("");
      setAddBandOpen(false);
      toast({ title: "Band added" });
    },
  });

  const { mutate: updateBand, isPending: updatingBand } = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await fetch(`/api/bands/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(data) });
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/bands"] }); setEditingBand(null); toast({ title: "Band updated" }); },
    onError: () => toast({ title: "Failed to update band", variant: "destructive" }),
  });

  const { mutate: deleteBand } = useMutation({
    mutationFn: async (id: number) => { await fetch(`/api/bands/${id}`, { method: "DELETE", credentials: "include" }); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/bands"] }),
  });

  // ── Sync registrations to lineup (recital only) ────────────────────────────
  const [syncing, setSyncing] = useState(false);
  async function syncRegistrationsToLineup() {
    if (!eventId || !ticketRequests.length) return;
    setSyncing(true);
    try {
      const existingLabels = new Set(rawSlots.map(s => s.label?.toLowerCase().trim()));
      const missing = ticketRequests.filter((r: any) =>
        r.studentFirstName && r.status !== "cancelled" &&
        !existingLabels.has(`${r.studentFirstName} ${r.studentLastName ?? ""}`.toLowerCase().trim())
      );
      let added = 0;
      for (const r of missing) {
        const notesParts = [r.instrument, r.recitalSong].filter(Boolean);
        await fetch(`/api/events/${eventId}/lineup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            type: "act",
            label: `${r.studentFirstName} ${r.studentLastName ?? ""}`.trim(),
            groupName: r.teacher ?? null,
            notes: notesParts.length ? notesParts.join(" · ") : null,
            durationMinutes: 5,
            bufferMinutes: 2,
            position: rawSlots.length + added + 1,
          }),
        });
        added++;
      }
      await queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/lineup`] });
      setLocalSlots([]);
      if (added > 0) toast({ title: `${added} performer${added !== 1 ? "s" : ""} added to the order` });
      else toast({ title: "All registrants are already in the order" });
    } catch {
      toast({ title: "Sync failed", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }

  // ── Lineup mutations ───────────────────────────────────────────────────────
  const [addSlotOpen, setAddSlotOpen] = useState(false);
  const [newSlot, setNewSlot] = useState({
    type: "act", bandId: "", label: "", groupName: "", startTime: "", duration: "", buffer: "15", isOverlapping: false, eventDay: 1,
  });

  const { mutate: addSlot, isPending: addingSlot } = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch(`/api/events/${eventId}/lineup`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(data) });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/lineup`] });
      setLocalSlots([]);
      setAddSlotOpen(false);
      const recital = event?.type === "Recital";
      setNewSlot({ type: "act", bandId: "", label: "", groupName: "", startTime: "", duration: recital ? "5" : "", buffer: recital ? "2" : "15", isOverlapping: false });
      toast({ title: "Slot added" });
    },
  });

  const { mutateAsync: updateSlot } = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await fetch(`/api/events/${eventId}/lineup/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(data) });
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/lineup`] }); setLocalSlots(null); },
    onError: () => toast({ title: "Failed to update slot", variant: "destructive" }),
  });

  const { mutate: deleteSlot } = useMutation({
    mutationFn: async (id: number) => { await fetch(`/api/events/${eventId}/lineup/${id}`, { method: "DELETE", credentials: "include" }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/lineup`] }); setLocalSlots(null); },
  });

  const { mutate: reorderSlots } = useMutation({
    mutationFn: async (items: { id: number; position: number }[]) => {
      await fetch(`/api/events/${eventId}/lineup/reorder`, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(items) });
    },
  });

  // ── Conflict detection ─────────────────────────────────────────────────────
  const [checkingConflicts, setCheckingConflicts] = useState(false);

  async function handleCheckConflicts() {
    if (!eventId) return;
    setCheckingConflicts(true);
    try {
      const r = await fetch(`/api/events/${eventId}/lineup/check-conflicts`, {
        method: "POST",
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ title: "Conflict check failed", description: data.error, variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/lineup`] });
      if (data.conflicts === 0) {
        toast({ title: data.checked === 0 ? "No slots with times to check" : "No conflicts found", description: data.checked > 0 ? `Checked ${data.checked} slot${data.checked !== 1 ? "s" : ""} — all clear` : undefined });
      } else {
        toast({ title: `${data.conflicts} conflict${data.conflicts !== 1 ? "s" : ""} detected`, description: `Checked ${data.checked} slot${data.checked !== 1 ? "s" : ""} — look for red cards`, variant: "destructive" });
      }
    } catch {
      toast({ title: "Conflict check failed", variant: "destructive" });
    } finally {
      setCheckingConflicts(false);
    }
  }

  async function handleClearConflict(slotId: number) {
    if (!eventId) return;
    await fetch(`/api/events/${eventId}/lineup/${slotId}/conflict`, {
      method: "DELETE",
      credentials: "include",
    });
    queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/lineup`] });
  }

  // ── Invite mutations ───────────────────────────────────────────────────────
  const [bulkInviting, setBulkInviting] = useState(false);
  const [bulkLockingIn, setBulkLockingIn] = useState(false);

  async function handleSendInvite(slotId: number, staffNote: string): Promise<void> {
    const r = await fetch(`/api/events/${eventId}/lineup/${slotId}/send-invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ staffNote }),
    });
    const data = await r.json();
    if (!r.ok) {
      toast({ title: "Failed to send invite", description: data.error, variant: "destructive" });
      throw new Error(data.error);
    }
    toast({ title: `Invite sent to ${data.sent} contact${data.sent !== 1 ? "s" : ""}` });
    queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/lineup`] });
  }

  async function handleSendConfirmation(slotId: number): Promise<void> {
    const r = await fetch(`/api/events/${eventId}/lineup/${slotId}/send-confirmation`, {
      method: "POST",
      credentials: "include",
    });
    const data = await r.json();
    if (!r.ok) {
      toast({ title: "Failed to send confirmation", description: data.error, variant: "destructive" });
      throw new Error(data.error);
    }
    toast({ title: "Lock-in confirmation sent!", description: `To: ${data.to}${data.bcc > 0 ? ` + ${data.bcc} BCC'd` : ""}` });
    queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/lineup`] });
  }

  async function handleSendTimeUpdate(slotId: number): Promise<void> {
    const r = await fetch(`/api/events/${eventId}/lineup/${slotId}/send-time-update`, {
      method: "POST",
      credentials: "include",
    });
    const data = await r.json();
    if (!r.ok) {
      toast({ title: "Failed to send time update", description: data.error, variant: "destructive" });
      throw new Error(data.error);
    }
    toast({ title: "Time update sent!", description: `Families notified${data.bcc > 0 ? ` (${data.bcc} BCC'd)` : ""}.` });
  }

  async function handleBulkInvite() {
    setBulkInviting(true);
    try {
      const r = await fetch(`/api/events/${eventId}/lineup/send-invites-bulk`, { method: "POST", credentials: "include" });
      const data = await r.json();
      if (!r.ok) { toast({ title: "Bulk invite failed", description: data.error, variant: "destructive" }); return; }
      if (data.sent === 0) {
        toast({ title: data.message ?? "All bands already invited", description: `${data.skipped} band(s) already had invites sent.` });
      } else {
        toast({ title: `Invites sent!`, description: `${data.sent} emails sent to ${data.slotsSent} band slot(s). ${data.skipped > 0 ? `${data.skipped} already invited (skipped).` : ""}` });
      }
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/lineup`] });
    } finally {
      setBulkInviting(false);
    }
  }

  async function handleBulkLockIn() {
    setBulkLockingIn(true);
    try {
      const r = await fetch(`/api/events/${eventId}/lineup/send-confirmation-bulk`, { method: "POST", credentials: "include" });
      const data = await r.json();
      if (!r.ok) { toast({ title: "Bulk lock-in failed", description: data.error, variant: "destructive" }); return; }
      const unconfirmedList: string[] = data.unconfirmed ?? [];
      const pendingNote = unconfirmedList.length > 0
        ? ` Still waiting on: ${unconfirmedList.join(", ")}.`
        : "";
      if (data.sent === 0) {
        toast({
          title: unconfirmedList.length > 0 ? "No confirmed bands to lock in" : "Nothing to lock in",
          description: (data.message ?? "All confirmed bands already have lock-in emails sent.") + pendingNote,
          variant: unconfirmedList.length > 0 ? "destructive" : "default",
        });
      } else {
        toast({
          title: "Lock-in emails sent!",
          description: `${data.sent} band${data.sent !== 1 ? "s" : ""} locked in.${data.skipped > 0 ? ` ${data.skipped} already done (skipped).` : ""}${pendingNote}`,
        });
      }
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/lineup`] });
    } finally {
      setBulkLockingIn(false);
    }
  }

  // ── DnD ─────────────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart(event: DragStartEvent) {
    const activeId = String(event.active.id);
    if (activeId.startsWith("band-")) {
      const bandId = Number(activeId.replace("band-", ""));
      setActiveDragBand(rawBands.find(b => b.id === bandId) ?? null);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDragBand(null);
    if (!over) return;

    // Band card dropped onto show order or a day zone → create act slot
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId.startsWith("band-")) {
      const bandId = Number(activeId.replace("band-", ""));
      const band = rawBands.find(b => b.id === bandId);
      if (band) {
        // Determine which day zone / slot was dropped on
        let eventDay = newSlot.eventDay;
        let insertPosition = slots.length;
        if (overId === "day-zone-1") {
          eventDay = 1;
        } else if (overId === "day-zone-2") {
          eventDay = 2;
        } else {
          // Dropped directly on an existing slot — inherit that slot's day and insert before it
          const targetSlot = slots.find(s => String(s.id) === overId);
          if (targetSlot) {
            eventDay = targetSlot.eventDay;
            insertPosition = targetSlot.position;
          }
        }
        addSlot({
          type: "act",
          bandId,
          label: null,
          groupName: null,
          startTime: null,
          durationMinutes: null,
          bufferMinutes: 15,
          isOverlapping: false,
          eventDay,
          position: insertPosition,
        });
      }
      return;
    }

    // Slot reordering
    if (active.id === over.id) return;
    const oldIdx = slots.findIndex(s => s.id === active.id);
    const newIdx = slots.findIndex(s => s.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(slots, oldIdx, newIdx).map((s, i) => ({ ...s, position: i }));
    setLocalSlots(reordered);
    reorderSlots(reordered.map(s => ({ id: s.id, position: s.position })));
  }

  const isRecital = event?.type === "Recital";
  const calcTimes = computeTimes(slots, showStartHHmm);

  const handleUpdate = useCallback(async (id: number, data: Partial<LineupSlot>) => { await updateSlot({ id, data }); }, [updateSlot]);
  const handleDelete = useCallback((id: number) => { deleteSlot(id); }, [deleteSlot]);

  // Invite stats for header
  const actSlots = slots.filter(s => s.type === "act" && s.bandId);
  const invitedCount = actSlots.filter(s => s.inviteStatus !== "not_sent").length;
  const confirmedCount = actSlots.filter(s => s.inviteStatus === "confirmed").length;
  const uninvitedCount = actSlots.filter(s => s.inviteStatus === "not_sent").length;
  const unlockedConfirmedCount = actSlots.filter(s => (s.confirmed || s.inviteStatus === "confirmed") && !s.confirmationSent).length;

  function submitAddSlot() {
    addSlot({
      type: newSlot.type,
      bandId: newSlot.bandId && newSlot.bandId !== "_custom" ? Number(newSlot.bandId) : null,
      label: newSlot.label || null,
      groupName: newSlot.groupName || null,
      startTime: newSlot.startTime || null,
      durationMinutes: newSlot.duration ? Number(newSlot.duration) : null,
      bufferMinutes: Number(newSlot.buffer) || 15,
      isOverlapping: newSlot.isOverlapping,
      eventDay: newSlot.eventDay,
      position: slots.length,
    });
  }

  return (
    <Sheet open={open} onOpenChange={o => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:w-full sm:max-w-5xl p-0 flex flex-col overflow-hidden">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/30 shrink-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <SheetTitle className="font-display text-xl">
              {isRecital ? "Recital Order" : "Band Lineup"} — <span className="text-muted-foreground font-normal">{event?.title}</span>
            </SheetTitle>
            <div className="flex items-center gap-2 flex-wrap">

              {slots.filter(s => s.type === "act" && s.startTime).length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs rounded-lg gap-1.5"
                  disabled={checkingConflicts}
                  onClick={handleCheckConflicts}
                  title="Use AI to check each performer's schedule conflict notes against their assigned time"
                >
                  {checkingConflicts ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TriangleAlert className="h-3.5 w-3.5" />}
                  {checkingConflicts ? "Checking…" : "Check Conflicts"}
                </Button>
              )}
              {isRecital && slots.length > 0 && (
                <Button size="sm" variant="outline" className="h-8 text-xs rounded-lg gap-1.5" onClick={() => printRecitalOrder(event?.title ?? "Recital", slots, calcTimes)}>
                  <Printer className="h-3.5 w-3.5" /> Print Order
                </Button>
              )}
              {!isRecital && actSlots.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs rounded-lg gap-1.5"
                  disabled={bulkInviting || uninvitedCount === 0}
                  onClick={handleBulkInvite}
                  title={uninvitedCount === 0 ? "All bands in this lineup have already been invited" : `Send personal confirmation links to all family contacts for ${uninvitedCount} band(s) that haven't been invited yet. Already-invited bands are skipped.`}
                >
                  <Send className="h-3.5 w-3.5" />
                  {bulkInviting ? "Sending…" : `Invite All Bands${uninvitedCount > 0 ? ` (${uninvitedCount})` : ""}`}
                </Button>
              )}
              {!isRecital && unlockedConfirmedCount > 0 && (
                <Button
                  size="sm"
                  className="h-8 text-xs rounded-lg gap-1.5 bg-emerald-600 hover:bg-emerald-500"
                  disabled={bulkLockingIn}
                  onClick={handleBulkLockIn}
                  title={`Send the official booking confirmation email to ${unlockedConfirmedCount} confirmed band(s) that haven't been locked in yet. Each email goes To: info@, CC: band leader, BCC: all non-declined family contacts. Bands that already have a lock-in email sent are skipped.`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {bulkLockingIn ? "Sending…" : `Lock In All (${unlockedConfirmedCount})`}
                </Button>
              )}
              {!isRecital && actSlots.length > 0 && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="text-emerald-400">✅ {confirmedCount}</span>
                  <span>·</span>
                  <span>{invitedCount}/{actSlots.length} invited</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Timing bar ──────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {eventStartHHmm ? (
              <>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>Doors <span className="text-foreground font-medium">{fmt12(eventStartHHmm)}</span></span>
                </div>
                <span className="text-muted-foreground/40">→</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Buffer</span>
                  <div className="flex items-center gap-0 rounded-lg border border-border/50 overflow-hidden h-6">
                    <button
                      className="px-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-sm leading-none h-full"
                      onClick={() => setPreBuffer(b => Math.max(0, b - 5))}
                    >−</button>
                    <input
                      type="number"
                      min={0}
                      step={5}
                      value={preBuffer}
                      onChange={e => setPreBuffer(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-10 text-center text-xs bg-transparent border-0 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none h-full"
                    />
                    <span className="text-[10px] text-muted-foreground pr-1.5">min</span>
                    <button
                      className="px-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-sm leading-none h-full border-l border-border/50"
                      onClick={() => setPreBuffer(b => b + 5)}
                    >+</button>
                  </div>
                </div>
                <span className="text-muted-foreground/40">→</span>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Show starts</span>
                  <span className="font-semibold text-foreground">{fmt12(showStartHHmm)}</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground/50 flex items-center gap-1.5">
                <Clock className="h-3 w-3" /> Set a start time on the event to enable automatic slot timing.
              </p>
            )}
          </div>
        </SheetHeader>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 overflow-hidden">
          {/* ── Left: Bands panel ─────────────────────────────────────────────── */}
          {!isRecital && <div className="w-72 shrink-0 border-r border-border/30 flex flex-col overflow-hidden">
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
                <DraggableBandCard key={band.id} band={band}>
                  <div className="rounded-xl bg-muted/30 border border-border/30 px-3 py-2.5 group cursor-grab active:cursor-grabbing">
                    <div className="flex items-start gap-2">
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{band.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {band.genre && <span className="text-[10px] text-muted-foreground truncate">{band.genre}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onPointerDown={e => e.stopPropagation()}>
                        <button
                          title="Manage members & contacts"
                          onClick={() => setManagingMembersBand(band)}
                          className="text-muted-foreground hover:text-primary p-0.5"
                        >
                          <Users className="h-3 w-3" />
                        </button>
                        <button onClick={() => { setEditingBand(band); setEditBandForm({ name: band.name, genre: band.genre ?? "", members: band.members ? String(band.members) : "", notes: band.notes ?? "", website: band.website ?? "", instagram: band.instagram ?? "" }); }} className="text-muted-foreground hover:text-foreground p-0.5">
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button onClick={() => deleteBand(band.id)} className="text-muted-foreground hover:text-destructive p-0.5">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={() => setManagingMembersBand(band)}
                      className="mt-1.5 text-[10px] text-primary hover:text-primary/80 transition-colors flex items-center gap-0.5"
                    >
                      <Users className="h-2.5 w-2.5" /> Members & Contacts
                    </button>
                  </div>
                </DraggableBandCard>
              ))}
            </div>
          </div>}

          {/* ── Right: Lineup panel ───────────────────────────────────────────── */}
          <DroppableShowOrder isEmpty={slots.length === 0}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-semibold">{isRecital ? "Performance Order" : "Show Order"}</p>
                <p className="text-xs text-muted-foreground">
                  {isRecital ? "Drag to reorder · Times auto-calculate from duration + buffer" : "Drag bands here or use Add Slot · Drag to reorder"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isRecital && ticketRequests.length > 0 && (
                  <Button size="sm" variant="outline" className="rounded-xl gap-1.5 text-xs" onClick={syncRegistrationsToLineup} disabled={syncing}>
                    {syncing ? <><RefreshCw className="h-3 w-3 animate-spin" /> Syncing…</> : <><RefreshCw className="h-3 w-3" /> Sync</>}
                  </Button>
                )}
                {isRecital && (
                  <Button size="sm" variant="outline" className="rounded-xl gap-1.5 text-xs" onClick={() => {
                    const existing = rawSlots.filter(s => s.type === "group-header").length;
                    addSlot({ type: "group-header", label: `Group ${existing + 1}`, position: rawSlots.length + 1, bufferMinutes: 0 });
                  }}>
                    <Layers className="h-3 w-3" /> Add Group
                  </Button>
                )}
                <Button size="sm" className="rounded-xl gap-1.5 shadow-sm shadow-primary/20" onClick={() => {
                  setNewSlot(s => ({ ...s, duration: isRecital ? "5" : s.duration, buffer: isRecital ? "2" : s.buffer }));
                  setAddSlotOpen(true);
                }}>
                  <Plus className="h-3.5 w-3.5" /> {isRecital ? "Add Performer" : "Add Slot"}
                </Button>
              </div>
            </div>

            {slots.length === 0 && !event?.isTwoDay && (
              <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-border/50 text-center">
                <Music className="h-10 w-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">{isRecital ? "No performers added yet" : "No acts added yet"}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  {isRecital ? `Click "Add Performer" to start building the recital order` : "Drag a band from the roster or click \"Add Slot\""}
                </p>
              </div>
            )}

            <SortableContext items={slots.map(s => s.id)} strategy={verticalListSortingStrategy}>
              {event?.isTwoDay ? (
                // Day 1 / Day 2 sections — each is its own drop zone
                [1, 2].map(day => {
                  const daySlots = slots.filter(s => (s.eventDay ?? 1) === day);
                  const dayIndices = daySlots.map(ds => slots.indexOf(ds));
                  return (
                    <div key={day} className={day === 2 ? "mt-4" : ""}>
                      <div className={`flex items-center gap-3 mb-2`}>
                        <div className={`h-px flex-1 ${day === 1 ? "bg-sky-500/20" : "bg-orange-500/20"}`} />
                        <span className={`text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full ${day === 1 ? "text-sky-400 bg-sky-500/10" : "text-orange-400 bg-orange-500/10"}`}>
                          Day {day}
                        </span>
                        <div className={`h-px flex-1 ${day === 1 ? "bg-sky-500/20" : "bg-orange-500/20"}`} />
                      </div>
                      <DroppableDayZone day={day} isDragging={!!activeDragBand}>
                        {daySlots.length === 0 ? (
                          <p className={`text-xs text-center py-4 italic transition-colors ${activeDragBand ? (day === 1 ? "text-sky-400/60" : "text-orange-400/60") : "text-muted-foreground/40"}`}>
                            {activeDragBand ? `Drop here to add to Day ${day}` : `No slots for Day ${day} yet — drag a band here or use Add Slot`}
                          </p>
                        ) : (
                          <div className="space-y-2 py-1">
                            {daySlots.map((slot, di) => (
                              <SlotRow
                                key={slot.id}
                                slot={slot}
                                calcTime={calcTimes[dayIndices[di]]}
                                bands={rawBands}
                                eventId={eventId!}
                                isRecital={isRecital}
                                isTwoDay={true}
                                isFirstGroupHeader={slot.type === "group-header" && !daySlots.slice(0, di).some(s => s.type === "group-header")}
                                onUpdate={handleUpdate}
                                onDelete={handleDelete}
                                onSendInvite={handleSendInvite}
                                onSendConfirmation={handleSendConfirmation}
                                onSendTimeUpdate={handleSendTimeUpdate}
                                onClearConflict={handleClearConflict}
                                ticketRequests={ticketRequests}
                              />
                            ))}
                          </div>
                        )}
                      </DroppableDayZone>
                    </div>
                  );
                })
              ) : (
                <div className="space-y-2">
                  {slots.map((slot, i) => (
                    <SlotRow
                      key={slot.id}
                      slot={slot}
                      calcTime={calcTimes[i]}
                      bands={rawBands}
                      eventId={eventId!}
                      isRecital={isRecital}
                      isTwoDay={false}
                      isFirstGroupHeader={slot.type === "group-header" && !slots.slice(0, i).some(s => s.type === "group-header")}
                      onUpdate={handleUpdate}
                      onDelete={handleDelete}
                      onSendInvite={handleSendInvite}
                      onSendConfirmation={handleSendConfirmation}
                      onSendTimeUpdate={handleSendTimeUpdate}
                      onClearConflict={handleClearConflict}
                      ticketRequests={ticketRequests}
                    />
                  ))}
                </div>
              )}
            </SortableContext>

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
          </DroppableShowOrder>
        </div>

        {/* Floating drag overlay — band card travels with cursor */}
        <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
          {activeDragBand && (
            <div className="rounded-xl bg-background border border-primary/40 shadow-2xl shadow-black/40 px-3 py-2.5 w-60 rotate-1 scale-105 pointer-events-none">
              <div className="flex items-center gap-2">
                <Music className="h-3.5 w-3.5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{activeDragBand.name}</p>
                  {activeDragBand.genre && <p className="text-[10px] text-muted-foreground truncate">{activeDragBand.genre}</p>}
                </div>
              </div>
            </div>
          )}
        </DragOverlay>
        </DndContext>
      </SheetContent>

      {/* Add Band Dialog */}
      <Dialog open={addBandOpen} onOpenChange={setAddBandOpen}>
        <DialogContent className="sm:max-w-[420px] rounded-2xl">
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
            <p className="text-[11px] text-muted-foreground">After adding, use <strong>Members & Contacts</strong> to add individual members and their contacts for email invites.</p>
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

      {/* Edit Band Dialog */}
      <Dialog open={!!editingBand} onOpenChange={o => !o && setEditingBand(null)}>
        <DialogContent className="sm:max-w-[420px] rounded-2xl">
          <DialogHeader><DialogTitle className="font-display text-xl">Edit Band</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><label className="text-xs font-medium">Name *</label>
              <Input className="rounded-xl" value={editBandForm.name} onChange={e => setEditBandForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><label className="text-xs font-medium">Genre</label>
                <Input className="rounded-xl" value={editBandForm.genre} onChange={e => setEditBandForm(f => ({ ...f, genre: e.target.value }))} />
              </div>
              <div className="space-y-1"><label className="text-xs font-medium">Members</label>
                <Input type="number" min="1" className="rounded-xl" value={editBandForm.members} onChange={e => setEditBandForm(f => ({ ...f, members: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><label className="text-xs font-medium">Website</label>
                <Input className="rounded-xl" value={editBandForm.website} onChange={e => setEditBandForm(f => ({ ...f, website: e.target.value }))} placeholder="https://…" />
              </div>
              <div className="space-y-1"><label className="text-xs font-medium">Instagram</label>
                <Input className="rounded-xl" value={editBandForm.instagram} onChange={e => setEditBandForm(f => ({ ...f, instagram: e.target.value }))} placeholder="@handle" />
              </div>
            </div>
            <div className="space-y-1"><label className="text-xs font-medium">Notes</label>
              <Input className="rounded-xl" value={editBandForm.notes} onChange={e => setEditBandForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setEditingBand(null)}>Cancel</Button>
            <Button className="rounded-xl" disabled={!editBandForm.name || updatingBand}
              onClick={() => updateBand({ id: editingBand!.id, data: { name: editBandForm.name, genre: editBandForm.genre || null, members: editBandForm.members ? Number(editBandForm.members) : null, notes: editBandForm.notes || null, website: editBandForm.website || null, instagram: editBandForm.instagram || null } })}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Slot Dialog */}
      <Dialog open={addSlotOpen} onOpenChange={setAddSlotOpen}>
        <DialogContent className="sm:max-w-[420px] rounded-2xl">
          <DialogHeader><DialogTitle className="font-display text-xl">{isRecital ? "Add Performer" : "Add Slot"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {!isRecital && (
              <div className="space-y-1">
                <label className="text-xs font-medium">Slot Type</label>
                <Select value={newSlot.type} onValueChange={v => setNewSlot(s => ({ ...s, type: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="act">🎵 Act / Band</SelectItem>
                    <SelectItem value="announcement">📣 Announcement</SelectItem>
                    <SelectItem value="break">☕ Break</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {newSlot.type === "act" && !isRecital && (
              <div className="space-y-1">
                <label className="text-xs font-medium">Band</label>
                <Select value={newSlot.bandId} onValueChange={v => setNewSlot(s => ({ ...s, bandId: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select a band or custom…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_custom">Custom name…</SelectItem>
                    {rawBands.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {(newSlot.type !== "act" || newSlot.bandId === "_custom" || !newSlot.bandId || isRecital) && (
              <div className="space-y-1">
                <label className="text-xs font-medium">{isRecital ? "Performer Name *" : "Label"}</label>
                <Input className="rounded-xl" value={newSlot.label} onChange={e => setNewSlot(s => ({ ...s, label: e.target.value }))} placeholder={isRecital ? "Alex Johnson" : "Custom name…"} />
              </div>
            )}
            {isRecital && (
              <div className="space-y-1">
                <label className="text-xs font-medium">Group / Class</label>
                <Input className="rounded-xl" value={newSlot.groupName} onChange={e => setNewSlot(s => ({ ...s, groupName: e.target.value }))} placeholder="e.g. Beginner Guitar" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><label className="text-xs font-medium">Duration (min)</label>
                <Input type="number" min="0" className="rounded-xl" value={newSlot.duration} onChange={e => setNewSlot(s => ({ ...s, duration: e.target.value }))} placeholder="30" />
              </div>
              <div className="space-y-1"><label className="text-xs font-medium">Buffer after (min)</label>
                <Input type="number" min="0" className="rounded-xl" value={newSlot.buffer} onChange={e => setNewSlot(s => ({ ...s, buffer: e.target.value }))} placeholder="15" />
              </div>
            </div>
          </div>
          {event?.isTwoDay && (
            <div className="flex items-center gap-3 rounded-xl border border-border/40 px-4 py-2.5 mx-0">
              <p className="text-sm font-medium flex-1">Which day?</p>
              <div className="flex gap-2">
                {[1, 2].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setNewSlot(s => ({ ...s, eventDay: d }))}
                    className={`px-4 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${newSlot.eventDay === d ? d === 1 ? "bg-sky-500/20 text-sky-400 border-sky-500/30" : "bg-orange-500/20 text-orange-400 border-orange-500/30" : "bg-transparent text-muted-foreground border-border/40 hover:border-border"}`}
                  >
                    Day {d}
                  </button>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setAddSlotOpen(false)}>Cancel</Button>
            <Button className="rounded-xl" disabled={addingSlot} onClick={submitAddSlot}>Add Slot</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Band Members Dialog */}
      <BandMembersDialog
        band={managingMembersBand}
        open={!!managingMembersBand}
        onClose={() => setManagingMembersBand(null)}
      />
    </Sheet>
  );
}
