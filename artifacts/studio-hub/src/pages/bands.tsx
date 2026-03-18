import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Music2, Plus, Search, ChevronDown, ChevronUp, Mail, Phone, Globe, Instagram,
  Users, Send, Trash2, Pencil, UserPlus, MailCheck, Megaphone, X, Info, Loader2, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { format, parseISO } from "date-fns";
import { toast } from "@/hooks/use-toast";

// ── Types ───────────────────────────────────────────────────────────────────────

interface BandContact {
  id: number; memberId: number; bandId: number;
  name: string; email: string | null; phone: string | null;
  relationship: string | null; isPrimary: boolean;
}
interface BandMember {
  id: number; bandId: number; name: string; role: string | null;
  email: string | null; phone: string | null; notes: string | null;
  contacts: BandContact[];
}
interface Band {
  id: number; name: string; genre: string | null; members: number | null;
  contactName: string | null; contactEmail: string | null; contactPhone: string | null;
  notes: string | null; website: string | null; instagram: string | null;
  // From list endpoint (summary counts)
  contactEmailCount?: number; contactTotalCount?: number; memberCount?: number;
  // From detail endpoint (full data)
  membersWithContacts?: BandMember[];
}
interface EventItem {
  id: number; title: string; startDate: string | null; status: string; type: string;
}
interface LineupSlot {
  id: number; eventId: number; bandId: number | null; bandName: string | null;
  label: string | null; startTime: string | null; inviteStatus: string | null;
  confirmed: boolean; position: number; type: string;
}
interface BandInvite {
  id: number; lineupSlotId: number; contactId: number; contactName: string;
  contactEmail: string; status: string; conflictNote: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

const api = async (url: string, opts?: RequestInit) => {
  const res = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(text || `${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
};

function inviteStatusBadge(status: string | null) {
  if (!status || status === "none") return <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/40">Not Invited</Badge>;
  if (status === "invited") return <Badge variant="outline" className="text-[10px] border-blue-500/30 bg-blue-500/10 text-blue-400">Invited</Badge>;
  if (status === "confirmed") return <Badge variant="outline" className="text-[10px] border-emerald-500/30 bg-emerald-500/10 text-emerald-400">Confirmed ✓</Badge>;
  if (status === "declined") return <Badge variant="outline" className="text-[10px] border-red-500/30 bg-red-500/10 text-red-400">Declined</Badge>;
  return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
}

function contactCount(band: Band): { total: number; withEmail: number } {
  // Use pre-computed counts from list endpoint if available
  if (band.contactEmailCount !== undefined) {
    return { total: band.contactTotalCount ?? 0, withEmail: band.contactEmailCount };
  }
  // Fall back to counting from full detail data
  if (!band.membersWithContacts) return { total: 0, withEmail: 0 };
  const all = band.membersWithContacts.flatMap(m => m.contacts);
  return { total: all.length, withEmail: all.filter(c => c.email).length };
}

function fmt(dt: string | null) {
  if (!dt) return "TBD";
  try { return format(parseISO(dt), "MMM d, yyyy"); } catch { return "TBD"; }
}

// ── Dialogs ───────────────────────────────────────────────────────────────────────

// Add/Edit Band
function BandFormDialog({
  open, band, onClose, onSaved,
}: { open: boolean; band: Band | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: "", genre: "", website: "", instagram: "", notes: "",
  });

  React.useEffect(() => {
    if (open) {
      setForm({
        name: band?.name ?? "",
        genre: band?.genre ?? "",
        website: band?.website ?? "",
        instagram: band?.instagram ?? "",
        notes: band?.notes ?? "",
      });
    }
  }, [open, band]);

  const mut = useMutation({
    mutationFn: (data: typeof form) =>
      api(band ? `/api/bands/${band.id}` : "/api/bands", {
        method: band ? "PUT" : "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => { onSaved(); onClose(); toast({ title: band ? "Band updated" : "Band added" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{band ? "Edit Band" : "Add Band"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <Label className="text-xs mb-1.5 block">Band Name *</Label>
            <Input value={form.name} onChange={f("name")} placeholder="The Midnight" />
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Genre</Label>
            <Input value={form.genre} onChange={f("genre")} placeholder="Indie, Jazz, Pop…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block">Website</Label>
              <Input value={form.website} onChange={f("website")} placeholder="https://…" />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Instagram</Label>
              <Input value={form.instagram} onChange={f("instagram")} placeholder="@handle" />
            </div>
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Notes</Label>
            <Textarea value={form.notes} onChange={f("notes")} rows={3} placeholder="Internal notes…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!form.name.trim() || mut.isPending} onClick={() => mut.mutate(form)}>
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (band ? "Save" : "Add Band")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Add/Edit Member — student-focused with inline Primary + Secondary contacts
function MemberFormDialog({
  open, bandId, member, onClose, onSaved,
}: { open: boolean; bandId: number; member: BandMember | null; onClose: () => void; onSaved: () => void }) {
  const emptyContact = { name: "", relationship: "", email: "", phone: "" };
  const [memberForm, setMemberForm] = useState({ name: "", role: "", notes: "" });
  const [primary, setPrimary] = useState(emptyContact);
  const [secondary, setSecondary] = useState(emptyContact);
  const [showSecondary, setShowSecondary] = useState(false);
  const [saving, setSaving] = useState(false);

  // Existing contact IDs when editing
  const existingPrimaryId = member?.contacts.find(c => c.isPrimary)?.id;
  const existingSecondaryId = member?.contacts.find(c => !c.isPrimary)?.id;

  React.useEffect(() => {
    if (!open) return;
    setMemberForm({ name: member?.name ?? "", role: member?.role ?? "", notes: member?.notes ?? "" });
    const pc = member?.contacts.find(c => c.isPrimary);
    const sc = member?.contacts.find(c => !c.isPrimary);
    setPrimary(pc ? { name: pc.name, relationship: pc.relationship ?? "", email: pc.email ?? "", phone: pc.phone ?? "" } : emptyContact);
    setSecondary(sc ? { name: sc.name, relationship: sc.relationship ?? "", email: sc.email ?? "", phone: sc.phone ?? "" } : emptyContact);
    setShowSecondary(!!sc);
  }, [open, member]);

  const mf = (k: keyof typeof memberForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setMemberForm(p => ({ ...p, [k]: e.target.value }));

  const cf = (setter: React.Dispatch<React.SetStateAction<typeof emptyContact>>, k: keyof typeof emptyContact) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setter(p => ({ ...p, [k]: e.target.value }));

  const handleSave = async () => {
    if (!memberForm.name.trim()) return;
    setSaving(true);
    try {
      // 1. Save member
      const savedMember: BandMember = await api(
        member ? `/api/bands/members/${member.id}` : `/api/bands/${bandId}/members`,
        { method: member ? "PUT" : "POST", body: JSON.stringify(memberForm) }
      );
      const memberId = savedMember.id;

      // 2. Save primary contact (if name filled)
      if (primary.name.trim()) {
        if (existingPrimaryId) {
          await api(`/api/bands/contacts/${existingPrimaryId}`, {
            method: "PUT", body: JSON.stringify({ ...primary, isPrimary: true }),
          });
        } else {
          await api(`/api/bands/members/${memberId}/contacts`, {
            method: "POST", body: JSON.stringify({ ...primary, isPrimary: true }),
          });
        }
      }

      // 3. Save secondary contact (if shown and name filled)
      if (showSecondary && secondary.name.trim()) {
        if (existingSecondaryId) {
          await api(`/api/bands/contacts/${existingSecondaryId}`, {
            method: "PUT", body: JSON.stringify({ ...secondary, isPrimary: false }),
          });
        } else {
          await api(`/api/bands/members/${memberId}/contacts`, {
            method: "POST", body: JSON.stringify({ ...secondary, isPrimary: false }),
          });
        }
      }

      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: "Error saving member", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{member ? "Edit Member" : "Add Band Member"}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Enter the student's info, then add their parent or guardian contacts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Student info */}
          <div className="rounded-xl border border-border/30 bg-muted/10 p-3 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Student</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs mb-1.5 block">Full Name *</Label>
                <Input value={memberForm.name} onChange={mf("name")} placeholder="e.g. Elliot Riefler" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs mb-1.5 block">Instrument / Role</Label>
                <Input value={memberForm.role} onChange={mf("role")} placeholder="e.g. Lead Guitar, Drums, Vocals…" />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Notes</Label>
              <Textarea value={memberForm.notes} onChange={mf("notes")} rows={2} placeholder="Any notes about this student…" />
            </div>
          </div>

          {/* Primary Contact */}
          <div className="rounded-xl border border-border/30 bg-muted/10 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-primary">1</span>
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Primary Contact</p>
              <span className="text-[10px] text-muted-foreground ml-auto">(receives invites & updates)</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs mb-1.5 block">Contact Name</Label>
                <Input value={primary.name} onChange={cf(setPrimary, "name")} placeholder="e.g. Sarah Riefler" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs mb-1.5 block">Relationship</Label>
                <Input value={primary.relationship} onChange={cf(setPrimary, "relationship")} placeholder="e.g. Mother, Father, Guardian…" />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Email</Label>
                <Input value={primary.email} onChange={cf(setPrimary, "email")} type="email" placeholder="parent@email.com" />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Phone</Label>
                <Input value={primary.phone} onChange={cf(setPrimary, "phone")} placeholder="(555) 000-0000" />
              </div>
            </div>
          </div>

          {/* Secondary Contact */}
          {showSecondary ? (
            <div className="rounded-xl border border-border/30 bg-muted/10 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-muted-foreground">2</span>
                  </div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Secondary Contact</p>
                </div>
                <button
                  className="text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => { setShowSecondary(false); setSecondary(emptyContact); }}
                >
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs mb-1.5 block">Contact Name</Label>
                  <Input value={secondary.name} onChange={cf(setSecondary, "name")} placeholder="e.g. David Riefler" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs mb-1.5 block">Relationship</Label>
                  <Input value={secondary.relationship} onChange={cf(setSecondary, "relationship")} placeholder="e.g. Father, Stepparent…" />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Email</Label>
                  <Input value={secondary.email} onChange={cf(setSecondary, "email")} type="email" placeholder="parent2@email.com" />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Phone</Label>
                  <Input value={secondary.phone} onChange={cf(setSecondary, "phone")} placeholder="(555) 000-0000" />
                </div>
              </div>
            </div>
          ) : (
            <button
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground w-full rounded-xl border border-dashed border-border/40 px-3 py-2.5 hover:border-border/70 transition-colors"
              onClick={() => setShowSecondary(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add secondary contact (second parent or guardian)
            </button>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!memberForm.name.trim() || saving} onClick={handleSave}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (member ? "Save Changes" : "Add Member")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Add/Edit Contact
function ContactFormDialog({
  open, member, contact, onClose, onSaved,
}: { open: boolean; member: BandMember; contact: BandContact | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", relationship: "", isPrimary: false });

  React.useEffect(() => {
    if (open) setForm({ name: contact?.name ?? "", email: contact?.email ?? "", phone: contact?.phone ?? "", relationship: contact?.relationship ?? "", isPrimary: contact?.isPrimary ?? false });
  }, [open, contact]);

  const mut = useMutation({
    mutationFn: (data: typeof form) =>
      api(contact ? `/api/bands/contacts/${contact.id}` : `/api/bands/members/${member.id}/contacts`, {
        method: contact ? "PUT" : "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const f = (k: keyof Omit<typeof form, "isPrimary">) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{contact ? "Edit Contact" : "Add Contact"}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">Contact for <span className="font-medium">{member.name}</span></DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div><Label className="text-xs mb-1.5 block">Name *</Label><Input value={form.name} onChange={f("name")} placeholder="Manager, Parent, Agent…" /></div>
          <div><Label className="text-xs mb-1.5 block">Relationship</Label><Input value={form.relationship} onChange={f("relationship")} placeholder="Manager, Parent, Agent…" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs mb-1.5 block">Email</Label><Input value={form.email} onChange={f("email")} type="email" /></div>
            <div><Label className="text-xs mb-1.5 block">Phone</Label><Input value={form.phone} onChange={f("phone")} /></div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="primary" checked={form.isPrimary} onCheckedChange={v => setForm(p => ({ ...p, isPrimary: v }))} />
            <Label htmlFor="primary" className="text-xs cursor-pointer">Primary contact (receives invites first)</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!form.name.trim() || mut.isPending} onClick={() => mut.mutate(form)}>
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (contact ? "Save" : "Add Contact")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Invite to Event Dialog
function InviteToEventDialog({
  open, band, onClose,
}: { open: boolean; band: Band | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [eventId, setEventId] = useState<string>("");
  const [sendingSlot, setSendingSlot] = useState<number | null>(null);

  React.useEffect(() => { if (!open) setEventId(""); }, [open]);

  const eventsQ = useQuery<EventItem[]>({
    queryKey: ["events"],
    queryFn: () => api("/api/events"),
    enabled: open,
  });

  const lineupQ = useQuery<LineupSlot[]>({
    queryKey: ["lineup", eventId],
    queryFn: () => api(`/api/events/${eventId}/lineup`),
    enabled: !!eventId,
  });

  const bandSlots = useMemo(() =>
    lineupQ.data?.filter(s => s.bandId === band?.id) ?? [],
    [lineupQ.data, band?.id]
  );

  const sendInvite = async (slotId: number) => {
    setSendingSlot(slotId);
    try {
      await api(`/api/events/${eventId}/lineup/${slotId}/send-invite`, { method: "POST", body: JSON.stringify({}) });
      toast({ title: "Invite sent!" });
      qc.invalidateQueries({ queryKey: ["lineup", eventId] });
    } catch (e: any) {
      toast({ title: "Failed to send invite", description: e.message, variant: "destructive" });
    } finally {
      setSendingSlot(null);
    }
  };

  const upcoming = useMemo(() =>
    (eventsQ.data ?? [])
      .filter(e => e.status !== "cancelled")
      .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? "")),
    [eventsQ.data]
  );

  if (!band) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite {band.name} to Event</DialogTitle>
          <DialogDescription className="text-xs">Select an event to see this band's lineup slots and send invites.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div>
            <Label className="text-xs mb-1.5 block">Event</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger>
                <SelectValue placeholder={eventsQ.isLoading ? "Loading…" : "Select an event…"} />
              </SelectTrigger>
              <SelectContent>
                {upcoming.map(e => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    <span className="font-medium">{e.title}</span>
                    <span className="ml-2 text-muted-foreground text-xs">{fmt(e.startDate)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {eventId && (
            <>
              {lineupQ.isLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : bandSlots.length === 0 ? (
                <div className="rounded-xl border border-border/30 bg-muted/20 p-4 text-center">
                  <Info className="h-5 w-5 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground font-medium">{band.name} is not on the lineup for this event yet.</p>
                  <p className="text-xs text-muted-foreground mt-1">Go to the event's Lineup Sheet to add them to a slot first, then return here to send an invite.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Lineup Slots</p>
                  {bandSlots.map(slot => (
                    <div key={slot.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/20 bg-muted/10 px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{slot.label || `Slot #${slot.position + 1}`}</p>
                        {slot.startTime && <p className="text-xs text-muted-foreground">{slot.startTime}</p>}
                        <div className="mt-1">{inviteStatusBadge(slot.inviteStatus)}</div>
                      </div>
                      <Button
                        size="sm"
                        variant={slot.inviteStatus === "confirmed" ? "outline" : "default"}
                        disabled={sendingSlot === slot.id}
                        onClick={() => sendInvite(slot.id)}
                        className="shrink-0"
                      >
                        {sendingSlot === slot.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : slot.inviteStatus === "none" || !slot.inviteStatus ? (
                          <><Send className="h-3.5 w-3.5 mr-1.5" />Send Invite</>
                        ) : (
                          <><Send className="h-3.5 w-3.5 mr-1.5" />Re-Invite</>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Broadcast Compose Dialog
function BroadcastDialog({
  open, bands, onClose,
}: { open: boolean; bands: Band[]; onClose: () => void }) {
  const [allBands, setAllBands] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number } | null>(null);

  React.useEffect(() => {
    if (!open) { setResult(null); setSubject(""); setBody(""); setAllBands(true); setSelectedIds(new Set()); }
  }, [open]);

  const toggleBand = (id: number) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const targetBands = allBands ? bands : bands.filter(b => selectedIds.has(b.id));
  const totalContacts = targetBands.reduce((sum, b) => sum + contactCount(b).withEmail, 0);

  const send = async () => {
    if (!subject.trim() || !body.trim()) {
      toast({ title: "Subject and body required", variant: "destructive" }); return;
    }
    setSending(true);
    try {
      const bandIds = allBands ? undefined : [...selectedIds];
      const res = await api("/api/bands/broadcast", {
        method: "POST",
        body: JSON.stringify({ subject, body, bandIds }),
      });
      setResult({ sent: res.sent });
      toast({ title: `Email sent to ${res.sent} contacts` });
    } catch (e: any) {
      toast({ title: "Broadcast failed", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" /> Email Bands
          </DialogTitle>
          <DialogDescription className="text-xs">
            Compose a message to all band contacts. Recipients are BCC'd — no one sees each other's address.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="py-8 text-center space-y-3">
            <MailCheck className="h-12 w-12 mx-auto text-emerald-400" />
            <p className="text-lg font-semibold">Sent!</p>
            <p className="text-sm text-muted-foreground">Your message was delivered to <strong>{result.sent}</strong> band contacts.</p>
            <Button onClick={onClose} className="mt-2">Done</Button>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            {/* Recipient selector */}
            <div className="rounded-xl border border-border/30 bg-muted/10 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recipients</p>
                <div className="flex items-center gap-2">
                  <Label className="text-xs cursor-pointer" htmlFor="all-bands-sw">All bands</Label>
                  <Switch id="all-bands-sw" checked={allBands} onCheckedChange={setAllBands} />
                </div>
              </div>
              {!allBands && (
                <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto">
                  {bands.map(b => {
                    const cnt = contactCount(b).withEmail;
                    return (
                      <label key={b.id} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-muted/30 cursor-pointer">
                        <Checkbox
                          checked={selectedIds.has(b.id)}
                          onCheckedChange={() => toggleBand(b.id)}
                          className="shrink-0"
                        />
                        <span className="text-sm truncate flex-1">{b.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{cnt} email{cnt !== 1 ? "s" : ""}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                <span>
                  {allBands
                    ? `All ${bands.length} bands · ${totalContacts} contacts with email`
                    : `${targetBands.length} bands selected · ${totalContacts} contacts with email`}
                </span>
              </div>
            </div>

            {/* Compose */}
            <div>
              <Label className="text-xs mb-1.5 block">Subject *</Label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Upcoming Event at The Music Space" />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Message *</Label>
              <Textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={7}
                placeholder="Hi there,&#10;&#10;We wanted to reach out about an upcoming opportunity…"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              CC: info@themusicspace.com · BCC: {totalContacts} contact{totalContacts !== 1 ? "s" : ""} · Sent via your connected Gmail account
            </p>
          </div>
        )}

        {!result && (
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button disabled={sending || totalContacts === 0 || !subject.trim() || !body.trim()} onClick={send}>
              {sending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Sending…</> : <><Send className="h-4 w-4 mr-2" />Send to {totalContacts} contact{totalContacts !== 1 ? "s" : ""}</>}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Expanded Band Row ─────────────────────────────────────────────────────────────

function ExpandedBand({
  band, onMembersChanged,
}: { band: Band; onMembersChanged: () => void }) {
  const qc = useQueryClient();
  const [memberDlg, setMemberDlg] = useState<{ member: BandMember | null } | null>(null);
  const [contactDlg, setContactDlg] = useState<{ member: BandMember; contact: BandContact | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: "member" | "contact"; id: number; name: string } | null>(null);

  const deleteMut = useMutation({
    mutationFn: ({ type, id }: { type: "member" | "contact"; id: number }) =>
      api(type === "member" ? `/api/bands/members/${id}` : `/api/bands/contacts/${id}`, { method: "DELETE" }),
    onSuccess: () => { setConfirmDelete(null); onMembersChanged(); },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const members = band.membersWithContacts ?? [];

  return (
    <div className="border-t border-border/20 bg-muted/5 px-4 pt-3 pb-4 space-y-3">
      {/* Members */}
      {members.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No members yet. Add one below.</p>
      ) : (
        <div className="space-y-3">
          {members.map(member => (
            <div key={member.id} className="rounded-xl border border-border/20 bg-background/60 overflow-hidden">
              {/* Member header */}
              <div className="flex items-start justify-between gap-2 px-3 py-2.5 bg-muted/10">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight">{member.name}</p>
                    {member.role && <p className="text-[11px] text-muted-foreground">{member.role}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {member.email && (
                    <TooltipProvider><Tooltip>
                      <TooltipTrigger asChild>
                        <a href={`mailto:${member.email}`} className="rounded-lg p-1 hover:bg-muted text-muted-foreground hover:text-foreground">
                          <Mail className="h-3.5 w-3.5" />
                        </a>
                      </TooltipTrigger>
                      <TooltipContent><p className="text-xs">{member.email}</p></TooltipContent>
                    </Tooltip></TooltipProvider>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => setMemberDlg({ member })}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete({ type: "member", id: member.id, name: member.name })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Contacts */}
              <div className="divide-y divide-border/10">
                {member.contacts.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground italic">No contacts added yet.</div>
                ) : (
                  member.contacts
                    .slice()
                    .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0))
                    .map((c) => (
                      <div key={c.id} className="flex items-start gap-2 px-3 py-2 text-xs">
                        {/* Primary / Secondary badge */}
                        <div className={`mt-0.5 shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${c.isPrimary ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                          {c.isPrimary ? "1" : "2"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium">{c.name}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${c.isPrimary ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                              {c.isPrimary ? "Primary" : "Secondary"}
                            </span>
                            {c.relationship && <span className="text-muted-foreground">· {c.relationship}</span>}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-muted-foreground flex-wrap">
                            {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-foreground"><Mail className="h-3 w-3" />{c.email}</a>}
                            {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground" onClick={() => setContactDlg({ member, contact: c })}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete({ type: "contact", id: c.id, name: c.name })}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                )}
                <div className="px-3 py-1.5">
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1.5" onClick={() => setContactDlg({ member, contact: null })}>
                    <Plus className="h-3 w-3" /> Add Contact
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" onClick={() => setMemberDlg({ member: null })}>
        <UserPlus className="h-3.5 w-3.5" /> Add Member
      </Button>

      {/* Dialogs */}
      {memberDlg && (
        <MemberFormDialog
          open={true}
          bandId={band.id}
          member={memberDlg.member}
          onClose={() => setMemberDlg(null)}
          onSaved={onMembersChanged}
        />
      )}
      {contactDlg && (
        <ContactFormDialog
          open={true}
          member={contactDlg.member}
          contact={contactDlg.contact}
          onClose={() => setContactDlg(null)}
          onSaved={onMembersChanged}
        />
      )}
      <Dialog open={!!confirmDelete} onOpenChange={v => !v && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete {confirmDelete?.type === "member" ? "Member" : "Contact"}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Remove <strong>{confirmDelete?.name}</strong>? This cannot be undone.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMut.isPending} onClick={() => confirmDelete && deleteMut.mutate({ type: confirmDelete.type, id: confirmDelete.id })}>
              {deleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────────

export default function Bands() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [bandDlg, setBandDlg] = useState<Band | null | "new">(null);
  const [inviteDlg, setInviteDlg] = useState<Band | null>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [confirmDeleteBand, setConfirmDeleteBand] = useState<Band | null>(null);

  const bandsQ = useQuery<Band[]>({
    queryKey: ["bands"],
    queryFn: () => api("/api/bands"),
  });

  // Fetch full band detail (with members) when expanded
  const detailQ = useQuery<Band>({
    queryKey: ["band-detail", expanded],
    queryFn: () => api(`/api/bands/${expanded}`),
    enabled: expanded !== null,
  });

  const deleteBandMut = useMutation({
    mutationFn: (id: number) => api(`/api/bands/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setConfirmDeleteBand(null);
      setExpanded(null);
      qc.invalidateQueries({ queryKey: ["bands"] });
      toast({ title: "Band removed" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const bands = bandsQ.data ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return bands;
    const s = search.toLowerCase();
    return bands.filter(b =>
      b.name.toLowerCase().includes(s) ||
      (b.genre ?? "").toLowerCase().includes(s) ||
      (b.contactName ?? "").toLowerCase().includes(s)
    );
  }, [bands, search]);

  const refreshBandDetail = () => {
    qc.invalidateQueries({ queryKey: ["bands"] });
    qc.invalidateQueries({ queryKey: ["band-detail", expanded] });
  };

  const expandedBand = expanded !== null ? detailQ.data ?? null : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border/20 px-6 py-5 bg-background/80">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Music2 className="h-5 w-5 text-primary" /> Bands
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Roster, contacts, and event invite management</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
              onClick={() => setBroadcastOpen(true)}
            >
              <Megaphone className="h-4 w-4" /> Email All Bands
            </Button>
            <Button size="sm" className="gap-2" onClick={() => setBandDlg("new")}>
              <Plus className="h-4 w-4" /> Add Band
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="mt-4 relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search bands or genres…"
            className="pl-9 h-9 bg-muted/20"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Band List */}
      <div className="flex-1 overflow-y-auto">
        {bandsQ.isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center space-y-2">
            <Music2 className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">{search ? "No bands match your search" : "No bands added yet"}</p>
            {!search && <Button size="sm" variant="outline" onClick={() => setBandDlg("new")} className="gap-1.5"><Plus className="h-3.5 w-3.5" />Add Your First Band</Button>}
          </div>
        ) : (
          <div className="divide-y divide-border/15">
            {filtered.map(band => {
              const isOpen = expanded === band.id;
              const cnt = contactCount(band);
              const hasMembers = (band.membersWithContacts?.length ?? 0) > 0 || true; // always expandable
              return (
                <div key={band.id} className={`transition-colors ${isOpen ? "bg-muted/10" : "hover:bg-muted/5"}`}>
                  {/* Band row */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* Expand toggle */}
                    <button
                      className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                      onClick={() => setExpanded(isOpen ? null : band.id)}
                    >
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>

                    {/* Band icon */}
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Music2 className="h-5 w-5 text-primary" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{band.name}</span>
                        {band.genre && (
                          <Badge variant="outline" className="text-[10px] border-border/40 text-muted-foreground">{band.genre}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {(band.memberCount ?? band.members ?? 0) > 0
                            ? `${band.memberCount ?? band.members} member${(band.memberCount ?? band.members ?? 0) !== 1 ? "s" : ""}`
                            : "No members yet"}
                        </span>
                        {cnt.total > 0 && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {cnt.withEmail}/{cnt.total} contacts with email
                          </span>
                        )}
                        {band.website && (
                          <a href={band.website.startsWith("http") ? band.website : `https://${band.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground" onClick={e => e.stopPropagation()}>
                            <Globe className="h-3 w-3" /> Website
                          </a>
                        )}
                        {band.instagram && (
                          <a href={`https://instagram.com/${band.instagram.replace("@", "")}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground" onClick={e => e.stopPropagation()}>
                            <Instagram className="h-3 w-3" /> {band.instagram.startsWith("@") ? band.instagram : `@${band.instagram}`}
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10" onClick={() => setInviteDlg(band)}>
                              <Send className="h-3.5 w-3.5" /> Invite to Event
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent><p className="text-xs">Send a lineup invite to this band</p></TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground" onClick={() => setBandDlg(band)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => setConfirmDeleteBand(band)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded members/contacts */}
                  {isOpen && (
                    detailQ.isLoading ? (
                      <div className="px-4 py-3 border-t border-border/20 bg-muted/5">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : expandedBand ? (
                      <ExpandedBand band={expandedBand} onMembersChanged={refreshBandDetail} />
                    ) : null
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Summary footer */}
        {!bandsQ.isLoading && bands.length > 0 && (
          <div className="px-6 py-3 border-t border-border/10 text-xs text-muted-foreground">
            {bands.length} band{bands.length !== 1 ? "s" : ""} total
            {" · "}
            {bands.reduce((s, b) => s + contactCount(b).withEmail, 0)} contacts with email
          </div>
        )}
      </div>

      {/* Dialogs */}
      <BandFormDialog
        open={!!bandDlg}
        band={bandDlg === "new" ? null : bandDlg}
        onClose={() => setBandDlg(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["bands"] })}
      />

      <InviteToEventDialog
        open={!!inviteDlg}
        band={inviteDlg}
        onClose={() => setInviteDlg(null)}
      />

      <BroadcastDialog
        open={broadcastOpen}
        bands={bands}
        onClose={() => setBroadcastOpen(false)}
      />

      {/* Delete band confirm */}
      <Dialog open={!!confirmDeleteBand} onOpenChange={v => !v && setConfirmDeleteBand(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Remove Band?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Permanently remove <strong>{confirmDeleteBand?.name}</strong> and all their members and contacts? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDeleteBand(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteBandMut.isPending} onClick={() => confirmDeleteBand && deleteBandMut.mutate(confirmDeleteBand.id)}>
              {deleteBandMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remove Band"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
