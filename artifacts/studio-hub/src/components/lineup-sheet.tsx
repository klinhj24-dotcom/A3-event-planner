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
  Clock, Timer, Save, Pencil, X, Users, Layers, CheckCircle2, Circle, Printer,
  Send, Mail, Users2, UserCheck, AlertCircle, RefreshCw, Info, Phone, Globe,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Band {
  id: number; name: string; genre?: string | null; members?: number | null;
  contactName?: string | null; contactEmail?: string | null; contactPhone?: string | null;
  notes?: string | null; website?: string | null; instagram?: string | null;
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
  id: number; contactName: string | null; contactEmail: string;
  status: string; conflictNote: string | null; sentAt: string | null; respondedAt: string | null;
}

interface LineupSlot {
  id: number; eventId: number; bandId?: number | null; bandName?: string | null;
  contactName?: string | null; contactEmail?: string | null;
  position: number; label?: string | null; startTime?: string | null;
  durationMinutes?: number | null; bufferMinutes?: number | null;
  isOverlapping: boolean; confirmed: boolean; type: string;
  groupName?: string | null; notes?: string | null;
  staffNote?: string | null; inviteStatus: string;
  confirmationSent: boolean; reminderSent: boolean;
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
    // Group headers don't consume time — carry forward previous time
    if (s.type === "group-header") { out.push(out[i - 1] ?? null); continue; }
    if (s.startTime) { out.push(s.startTime); continue; }
    if (i === 0) { out.push(null); continue; }
    if (s.isOverlapping) { out.push(out[i - 1]); continue; }
    // Find the last non-group-header slot before this one for time chaining
    let prevIdx = i - 1;
    while (prevIdx >= 0 && slots[prevIdx].type === "group-header") prevIdx--;
    if (prevIdx < 0) { out.push(null); continue; }
    const prev = slots[prevIdx];
    const prevT = out[prevIdx];
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

// ── Invite status row ──────────────────────────────────────────────────────────
function InviteRow({ invite }: { invite: BandInvite }) {
  const statusCls = invite.status === "confirmed"
    ? "text-emerald-400"
    : invite.status === "declined"
    ? "text-red-400"
    : "text-muted-foreground";
  const statusIcon = invite.status === "confirmed" ? "✅" : invite.status === "declined" ? "❌" : "⏳";
  return (
    <div className="flex flex-col gap-0.5 py-1.5 border-b border-border/20 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">{invite.contactName ?? invite.contactEmail}</span>
        <span className={`text-[11px] font-medium flex items-center gap-1 ${statusCls}`}>
          {statusIcon} {invite.status.charAt(0).toUpperCase() + invite.status.slice(1)}
        </span>
      </div>
      <span className="text-[10px] text-muted-foreground">{invite.contactEmail}</span>
      {invite.conflictNote && (
        <div className="mt-1 rounded-lg bg-amber-500/10 border border-amber-500/20 px-2 py-1.5">
          <p className="text-[11px] text-amber-400 font-medium mb-0.5">Day-of note:</p>
          <p className="text-[11px] text-amber-300/80">{invite.conflictNote}</p>
        </div>
      )}
    </div>
  );
}

// ── Sortable slot row ──────────────────────────────────────────────────────────
function SlotRow({
  slot, calcTime, bands, eventId, isRecital,
  onUpdate, onDelete, onSendInvite, onSendConfirmation,
}: {
  slot: LineupSlot; calcTime: string | null; bands: Band[]; eventId: number; isRecital?: boolean;
  onUpdate: (id: number, data: Partial<LineupSlot>) => void;
  onDelete: (id: number) => void;
  onSendInvite: (slotId: number, staffNote: string) => void;
  onSendConfirmation: (slotId: number) => void;
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
    groupName: slot.groupName ?? "",
    staffNote: slot.staffNote ?? "",
  });

  // Sync draft staffNote when slot changes
  useEffect(() => { setDraft(d => ({ ...d, staffNote: slot.staffNote ?? "" })); }, [slot.staffNote]);

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

  const displayName = slot.bandName || slot.label || (SLOT_TYPE_META[slot.type]?.label ?? slot.type);
  const meta = SLOT_TYPE_META[slot.type] ?? SLOT_TYPE_META.act;
  const inviteStatusMeta = INVITE_STATUS_META[slot.inviteStatus] ?? INVITE_STATUS_META.not_sent;

  const confirmedCount = invites.filter(i => i.status === "confirmed").length;
  const declinedCount = invites.filter(i => i.status === "declined").length;
  const pendingCount = invites.filter(i => i.status === "pending").length;

  function save() {
    onUpdate(slot.id, {
      label: draft.label || null,
      startTime: draft.startTime || null,
      durationMinutes: draft.duration ? Number(draft.duration) : null,
      bufferMinutes: Number(draft.buffer) || 15,
      isOverlapping: draft.isOverlapping,
      notes: draft.notes || null,
      bandId: draft.bandId ? Number(draft.bandId) : null,
      groupName: draft.groupName || null,
      staffNote: draft.staffNote || null,
    });
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

  // ── Group header rendering ────────────────────────────────────────────────
  if (slot.type === "group-header") {
    return (
      <div ref={setNodeRef} style={style} className={`flex items-center gap-2 py-1 ${isDragging ? "opacity-50" : ""}`}>
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground p-0.5 touch-none">
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 flex items-center gap-2">
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
        </div>
        <button onClick={() => onDelete(slot.id)} className="text-muted-foreground/30 hover:text-destructive transition-colors p-0.5">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className={`rounded-xl border transition-all ${slot.isOverlapping ? "border-[#00b199]/30 bg-[#00b199]/5 ml-6" : "border-border/50 bg-card"} ${isDragging ? "shadow-lg" : "shadow-sm"}`}>
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

          <Button size="sm" className="w-full rounded-lg h-8 text-xs" onClick={save}>
            <Save className="h-3 w-3 mr-1.5" /> Save Changes
          </Button>

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
                >
                  <Send className="h-3 w-3" />
                  {sendingInvite ? "Sending…" : slot.inviteStatus === "not_sent" ? "Send Invite" : "Re-invite New Contacts"}
                </Button>
                {slot.confirmed && !slot.confirmationSent && (
                  <Button
                    size="sm"
                    className="rounded-lg h-7 text-xs gap-1.5 flex-1 bg-emerald-600 hover:bg-emerald-500"
                    disabled={sendingConfirm}
                    onClick={handleSendConfirmation}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    {sendingConfirm ? "Sending…" : "Send Lock-In Email"}
                  </Button>
                )}
                {slot.confirmationSent && (
                  <Badge variant="outline" className="text-[10px] px-2 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                    ✓ Lock-in sent
                  </Badge>
                )}
              </div>

              {/* Per-contact invite status */}
              {invites.length > 0 && (
                <div className="rounded-xl border border-border/30 bg-muted/20 p-3 space-y-1">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Contact Responses</p>
                    <div className="flex items-center gap-2 text-[10px]">
                      {confirmedCount > 0 && <span className="text-emerald-400">✅ {confirmedCount} confirmed</span>}
                      {pendingCount > 0 && <span className="text-muted-foreground">⏳ {pendingCount} pending</span>}
                      {declinedCount > 0 && <span className="text-red-400">❌ {declinedCount} declined</span>}
                    </div>
                  </div>
                  {invites.map(invite => <InviteRow key={invite.id} invite={invite} />)}
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
  const rows = slots
    .map((slot, i) => {
      if (slot.type !== "act") return "";
      const time = calcTimes[i] ? fmt12(calcTimes[i]) : "";
      const num = i + 1;
      const name = slot.label || slot.bandName || "—";
      const group = slot.groupName || "";
      const dur = slot.durationMinutes ? `${slot.durationMinutes} min` : "";
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#888;font-size:13px;">${num}</td>
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

// ── Main sheet ─────────────────────────────────────────────────────────────────
export function LineupSheet({ event, open, onClose }: {
  event: { id: number; title: string; type?: string } | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const eventId = event?.id;

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
    type: "act", bandId: "", label: "", groupName: "", startTime: "", duration: "", buffer: "15", isOverlapping: false,
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
      setNewSlot({ type: "act", bandId: "", label: "", groupName: "", startTime: "", duration: "", buffer: "15", isOverlapping: false });
      toast({ title: "Slot added" });
    },
  });

  const { mutate: updateSlot } = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await fetch(`/api/events/${eventId}/lineup/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(data) });
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/lineup`] }); setLocalSlots([]); },
    onError: () => toast({ title: "Failed to update slot", variant: "destructive" }),
  });

  const { mutate: deleteSlot } = useMutation({
    mutationFn: async (id: number) => { await fetch(`/api/events/${eventId}/lineup/${id}`, { method: "DELETE", credentials: "include" }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/lineup`] }); setLocalSlots([]); },
  });

  const { mutate: reorderSlots } = useMutation({
    mutationFn: async (items: { id: number; position: number }[]) => {
      await fetch(`/api/events/${eventId}/lineup/reorder`, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(items) });
    },
  });

  // ── Invite mutations ───────────────────────────────────────────────────────
  const [bulkInviting, setBulkInviting] = useState(false);

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

  // ── DnD ─────────────────────────────────────────────────────────────────────
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

  const isRecital = event?.type === "Recital";
  const calcTimes = computeTimes(slots);

  const handleUpdate = useCallback((id: number, data: Partial<LineupSlot>) => { updateSlot({ id, data }); }, [updateSlot]);
  const handleDelete = useCallback((id: number) => { deleteSlot(id); }, [deleteSlot]);

  // Invite stats for header
  const actSlots = slots.filter(s => s.type === "act" && s.bandId);
  const invitedCount = actSlots.filter(s => s.inviteStatus !== "not_sent").length;
  const confirmedCount = actSlots.filter(s => s.inviteStatus === "confirmed").length;
  const uninvitedCount = actSlots.filter(s => s.inviteStatus === "not_sent").length;

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
                  title={uninvitedCount === 0 ? "All bands already invited" : `Send invites to ${uninvitedCount} uninvited band(s)`}
                >
                  <Send className="h-3.5 w-3.5" />
                  {bulkInviting ? "Sending…" : `Invite All Bands${uninvitedCount > 0 ? ` (${uninvitedCount})` : ""}`}
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
        </SheetHeader>

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
                <div key={band.id} className="rounded-xl bg-muted/30 border border-border/30 px-3 py-2.5 group">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{band.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {band.genre && <span className="text-[10px] text-muted-foreground truncate">{band.genre}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
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
                    onClick={() => setManagingMembersBand(band)}
                    className="mt-1.5 text-[10px] text-primary hover:text-primary/80 transition-colors flex items-center gap-0.5"
                  >
                    <Users className="h-2.5 w-2.5" /> Members & Contacts
                  </button>
                </div>
              ))}
            </div>
          </div>}

          {/* ── Right: Lineup panel ───────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-semibold">{isRecital ? "Performance Order" : "Show Order"}</p>
                <p className="text-xs text-muted-foreground">Drag to reorder · Times auto-calculate from duration + buffer</p>
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
                    addSlot({ type: "group-header", label: `Group ${existing + 1}`, position: rawSlots.length + 1 });
                  }}>
                    <Layers className="h-3 w-3" /> Add Group
                  </Button>
                )}
                <Button size="sm" className="rounded-xl gap-1.5 shadow-sm shadow-primary/20" onClick={() => setAddSlotOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> {isRecital ? "Add Performer" : "Add Slot"}
                </Button>
              </div>
            </div>

            {slots.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-border/50 text-center">
                <Music className="h-10 w-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">{isRecital ? "No performers added yet" : "No acts added yet"}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Click "{isRecital ? "Add Performer" : "Add Slot"}" to start building the {isRecital ? "recital order" : "lineup"}</p>
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
                      isRecital={isRecital}
                      onUpdate={handleUpdate}
                      onDelete={handleDelete}
                      onSendInvite={handleSendInvite}
                      onSendConfirmation={handleSendConfirmation}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

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
