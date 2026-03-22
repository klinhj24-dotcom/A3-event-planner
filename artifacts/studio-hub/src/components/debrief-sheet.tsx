import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, X, ImageIcon, CheckCircle2, TrendingUp, Lock } from "lucide-react";
import { useUpload } from "@workspace/object-storage-web";
import { useEventDebrief, useUpsertDebrief, useUpdateEventImage, useTeamMembers } from "@/hooks/use-team";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

function toLocalDT(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

interface DebriefSheetProps {
  event: { id: number; title: string; type: string; imageUrl?: string | null; isLeadGenerating?: boolean; primaryStaffId?: string | null; startDate?: string | null; endDate?: string | null; isTwoDay?: boolean } | null;
  onClose: () => void;
}

function ReadOnlyField({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

export function DebriefSheet({ event, onClose }: DebriefSheetProps) {
  const { toast } = useToast();
  const { data: debrief, isLoading } = useEventDebrief(event?.id ?? null);
  const { data: currentUser } = useQuery<{ id: string; role: string; firstName?: string | null; lastName?: string | null; email?: string | null }>({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      const res = await fetch("/api/auth/user", { credentials: "include" });
      if (!res.ok) throw new Error("Not authenticated");
      const data = await res.json();
      return data.user;
    },
  });
  const { data: teamMembers = [] } = useTeamMembers();
  const { data: staffSlots = [] } = useQuery<any[]>({
    queryKey: [`/api/events/${event?.id}/staff-slots`],
    queryFn: async () => {
      if (!event?.id) return [];
      const r = await fetch(`/api/events/${event.id}/staff-slots`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!event?.id,
  });

  const primaryStaffId = event?.primaryStaffId ?? null;
  const canEdit = !primaryStaffId || currentUser?.id === primaryStaffId;
  const ownerMember = primaryStaffId ? teamMembers.find(m => m.id === primaryStaffId) : null;
  const ownerName = ownerMember
    ? (ownerMember.firstName && ownerMember.lastName ? `${ownerMember.firstName} ${ownerMember.lastName}` : ownerMember.email ?? "Assigned Staff")
    : null;

  const { mutate: upsert, isPending: saving } = useUpsertDebrief(event?.id ?? 0);
  const { mutate: updateImage } = useUpdateEventImage(event?.id ?? 0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    timeIn: "",
    timeOut: "",
    day2TimeIn: "",
    day2TimeOut: "",
    crowdSize: "",
    boothPlacement: "",
    soundSetupNotes: "",
    whatWorked: "",
    whatDidntWork: "",
    leadQuality: "",
    wouldRepeat: false,
    improvements: "",
    leadsCollected: "",
    trialSignups: "",
    eventVibe: "",
    staffNotes: "",
  });

  const [currentImage, setCurrentImage] = useState<string | null>(null);

  useEffect(() => {
    if (event?.imageUrl !== undefined) {
      setCurrentImage(event.imageUrl ?? null);
    }
  }, [event?.imageUrl]);

  // Seed default timeIn/timeOut from staff slots + event times when no debrief saved yet
  useEffect(() => {
    if (isLoading || debrief) return;
    const eventStart = event?.startDate ? new Date(event.startDate) : null;
    const eventEnd = event?.endDate ? new Date(event.endDate) : null;
    // Day 1: slots on same day as event start
    const day1SlotStarts = staffSlots
      .map((s: any) => s.startTime ? new Date(s.startTime) : null)
      .filter((d): d is Date => !!d && !!eventStart && sameDay(d, eventStart));
    const day1SlotEnds = staffSlots
      .map((s: any) => s.endTime ? new Date(s.endTime) : null)
      .filter((d): d is Date => !!d && !!eventStart && sameDay(d, eventStart));
    const earliest1 = day1SlotStarts.length > 0 ? new Date(Math.min(...day1SlotStarts.map(d => d.getTime()))) : null;
    const latest1 = day1SlotEnds.length > 0 ? new Date(Math.max(...day1SlotEnds.map(d => d.getTime()))) : null;
    const defaultIn = earliest1 && eventStart ? (earliest1 < eventStart ? earliest1 : eventStart) : earliest1 ?? eventStart;
    const defaultOut = latest1 && eventStart ? (latest1 > eventStart ? latest1 : null) : latest1 ?? null;

    const updates: Partial<typeof form> = {};
    if (defaultIn) updates.timeIn = toLocalDT(defaultIn);
    if (defaultOut) updates.timeOut = toLocalDT(defaultOut);

    if (event?.isTwoDay && eventEnd) {
      // Day 2: slots on same day as event end
      const day2SlotStarts = staffSlots
        .map((s: any) => s.startTime ? new Date(s.startTime) : null)
        .filter((d): d is Date => !!d && sameDay(d, eventEnd));
      const day2SlotEnds = staffSlots
        .map((s: any) => s.endTime ? new Date(s.endTime) : null)
        .filter((d): d is Date => !!d && sameDay(d, eventEnd));
      const earliest2 = day2SlotStarts.length > 0 ? new Date(Math.min(...day2SlotStarts.map(d => d.getTime()))) : null;
      const latest2 = day2SlotEnds.length > 0 ? new Date(Math.max(...day2SlotEnds.map(d => d.getTime()))) : null;
      const default2In = earliest2 && eventEnd ? (earliest2 < eventEnd ? earliest2 : eventEnd) : earliest2 ?? null;
      const default2Out = latest2 && eventEnd ? (latest2 > eventEnd ? latest2 : eventEnd) : latest2 ?? eventEnd;
      if (default2In) updates.day2TimeIn = toLocalDT(default2In);
      if (default2Out) updates.day2TimeOut = toLocalDT(default2Out);
    }

    if (Object.keys(updates).length > 0) setForm(f => ({ ...f, ...updates }));
  }, [isLoading, debrief, staffSlots, event?.startDate, event?.endDate, event?.isTwoDay]);

  useEffect(() => {
    if (debrief) {
      setForm({
        timeIn: debrief.timeIn ? toLocalDT(new Date(debrief.timeIn)) : "",
        timeOut: debrief.timeOut ? toLocalDT(new Date(debrief.timeOut)) : "",
        day2TimeIn: (debrief as any).day2TimeIn ? toLocalDT(new Date((debrief as any).day2TimeIn)) : "",
        day2TimeOut: (debrief as any).day2TimeOut ? toLocalDT(new Date((debrief as any).day2TimeOut)) : "",
        crowdSize: debrief.crowdSize != null ? String(debrief.crowdSize) : "",
        boothPlacement: debrief.boothPlacement ?? "",
        soundSetupNotes: debrief.soundSetupNotes ?? "",
        whatWorked: debrief.whatWorked ?? "",
        whatDidntWork: debrief.whatDidntWork ?? "",
        leadQuality: debrief.leadQuality ?? "",
        wouldRepeat: debrief.wouldRepeat ?? false,
        improvements: debrief.improvements ?? "",
        leadsCollected: (debrief as any).leadsCollected != null ? String((debrief as any).leadsCollected) : "",
        trialSignups: (debrief as any).trialSignups != null ? String((debrief as any).trialSignups) : "",
        eventVibe: (debrief as any).eventVibe ?? "",
        staffNotes: (debrief as any).staffNotes ?? "",
      });
    }
  }, [debrief]);

  const { uploadFile, isUploading } = useUpload({
    onSuccess: (response) => {
      const imageUrl = `/api/storage${response.objectPath}`;
      setCurrentImage(imageUrl);
      updateImage(imageUrl, {
        onSuccess: () => toast({ title: "Photo uploaded" }),
        onError: () => toast({ title: "Photo uploaded but failed to save", variant: "destructive" }),
      });
    },
    onError: (err) => toast({ title: `Upload failed: ${err.message}`, variant: "destructive" }),
  });

  function handleSave() {
    upsert({
      timeIn: form.timeIn || null,
      timeOut: form.timeOut || null,
      day2TimeIn: form.day2TimeIn || null,
      day2TimeOut: form.day2TimeOut || null,
      crowdSize: form.crowdSize ? parseInt(form.crowdSize) : null,
      boothPlacement: form.boothPlacement || null,
      soundSetupNotes: form.soundSetupNotes || null,
      whatWorked: form.whatWorked || null,
      whatDidntWork: form.whatDidntWork || null,
      leadQuality: form.leadQuality || null,
      wouldRepeat: form.wouldRepeat,
      improvements: form.improvements || null,
      leadsCollected: form.leadsCollected ? parseInt(form.leadsCollected) : null,
      trialSignups: form.trialSignups ? parseInt(form.trialSignups) : null,
      eventVibe: form.eventVibe || null,
      staffNotes: form.staffNotes || null,
    }, {
      onSuccess: () => toast({ title: "Debrief saved" }),
      onError: () => toast({ title: "Failed to save debrief", variant: "destructive" }),
    });
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  if (!event) return null;

  const vibeLabels: Record<string, string> = {
    dead: "Dead — nobody around",
    slow: "Slow — some foot traffic",
    moderate: "Moderate — steady flow",
    busy: "Busy — lots of engagement",
    electric: "Electric — packed & excited",
  };

  return (
    <Sheet open={!!event} onOpenChange={open => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-[520px] flex flex-col gap-0 p-0 overflow-y-auto">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/40 shrink-0">
          <SheetTitle className="font-display text-lg leading-tight">{event.title}</SheetTitle>
          <SheetDescription className="text-xs">Post-event debrief & metrics</SheetDescription>
          {ownerName && (
            <div className={`flex items-center gap-2 mt-1 text-xs rounded-lg px-3 py-1.5 w-fit ${canEdit ? "bg-secondary/10 text-secondary" : "bg-muted/60 text-muted-foreground"}`}>
              {canEdit ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <Lock className="h-3 w-3 shrink-0" />}
              {canEdit ? `You are the debrief owner` : `Debrief owner: ${ownerName}`}
            </div>
          )}
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !canEdit ? (
          /* ── Read-only view for non-owners ── */
          <div className="flex-1 px-6 py-5 space-y-5">
            {currentImage && (
              <div className="rounded-xl overflow-hidden border border-border/40 aspect-video bg-muted/20">
                <img src={currentImage} alt="Event" className="w-full h-full object-cover" />
              </div>
            )}
            {!debrief ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground space-y-2">
                <Lock className="h-8 w-8 opacity-20" />
                <p className="text-sm font-medium">Debrief not yet submitted</p>
                <p className="text-xs">{ownerName} hasn't filled this out yet.</p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Logistics */}
                <div className="rounded-xl border border-border/30 bg-muted/20 p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Logistics</p>
                  <div className="grid grid-cols-2 gap-4">
                    {event.isTwoDay ? (
                      <>
                        <ReadOnlyField label="Day 1 Time In" value={debrief.timeIn ? format(new Date(debrief.timeIn), "MMM d, h:mm a") : null} />
                        <ReadOnlyField label="Day 1 Time Out" value={debrief.timeOut ? format(new Date(debrief.timeOut), "MMM d, h:mm a") : null} />
                        <ReadOnlyField label="Day 2 Time In" value={(debrief as any).day2TimeIn ? format(new Date((debrief as any).day2TimeIn), "MMM d, h:mm a") : null} />
                        <ReadOnlyField label="Day 2 Time Out" value={(debrief as any).day2TimeOut ? format(new Date((debrief as any).day2TimeOut), "MMM d, h:mm a") : null} />
                      </>
                    ) : (
                      <>
                        <ReadOnlyField label="Time In" value={debrief.timeIn ? format(new Date(debrief.timeIn), "MMM d, h:mm a") : null} />
                        <ReadOnlyField label="Time Out" value={debrief.timeOut ? format(new Date(debrief.timeOut), "MMM d, h:mm a") : null} />
                      </>
                    )}
                    <ReadOnlyField label="Crowd Size" value={debrief.crowdSize} />
                    <ReadOnlyField label="Booth Placement" value={debrief.boothPlacement} />
                  </div>
                </div>
                {/* Sound */}
                {debrief.soundSetupNotes && (
                  <div className="rounded-xl border border-border/30 bg-muted/20 p-4 space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sound Setup Notes</p>
                    <p className="text-sm">{debrief.soundSetupNotes}</p>
                  </div>
                )}
                {/* What worked / didn't */}
                {(debrief.whatWorked || debrief.whatDidntWork) && (
                  <div className="grid grid-cols-2 gap-3">
                    {debrief.whatWorked && (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500">What Worked</p>
                        <p className="text-sm">{debrief.whatWorked}</p>
                      </div>
                    )}
                    {debrief.whatDidntWork && (
                      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-destructive">What Didn't</p>
                        <p className="text-sm">{debrief.whatDidntWork}</p>
                      </div>
                    )}
                  </div>
                )}
                {/* Would Repeat */}
                <div className="flex items-center justify-between rounded-xl border border-border/30 bg-muted/20 px-4 py-2.5">
                  <p className="text-sm text-muted-foreground">Would Repeat?</p>
                  <Badge variant={debrief.wouldRepeat ? "default" : "secondary"} className="text-xs">
                    {debrief.wouldRepeat ? "Yes" : "No"}
                  </Badge>
                </div>
                {/* Lead Results */}
                {event.isLeadGenerating && ((debrief as any).leadsCollected != null || (debrief as any).trialSignups != null || debrief.leadQuality) && (
                  <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-violet-400 flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5" /> Lead Results
                    </p>
                    <div className="grid grid-cols-3 gap-4">
                      <ReadOnlyField label="Lead Quality" value={debrief.leadQuality ? debrief.leadQuality.charAt(0).toUpperCase() + debrief.leadQuality.slice(1) : null} />
                      <ReadOnlyField label="Leads" value={(debrief as any).leadsCollected} />
                      <ReadOnlyField label="Trial Signups" value={(debrief as any).trialSignups} />
                    </div>
                  </div>
                )}
                {/* Event Vibe */}
                {(debrief as any).eventVibe && (
                  <div className="rounded-xl border border-border/30 bg-muted/20 px-4 py-2.5 flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Event Vibe</p>
                    <p className="text-sm font-medium">{vibeLabels[(debrief as any).eventVibe] ?? (debrief as any).eventVibe}</p>
                  </div>
                )}
                {/* Improvements */}
                {debrief.improvements && (
                  <div className="rounded-xl border border-border/30 bg-muted/20 p-4 space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Improvements</p>
                    <p className="text-sm">{debrief.improvements}</p>
                  </div>
                )}
                {/* Staff Notes */}
                {(debrief as any).staffNotes && (
                  <div className="rounded-xl border border-border/30 bg-muted/20 p-4 space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Staff Notes</p>
                    <p className="text-sm">{(debrief as any).staffNotes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* ── Editable form for owner ── */
          <div className="flex-1 px-6 py-5 space-y-6">

            {/* ── Photo ── */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Event Photo</Label>
              {currentImage ? (
                <div className="relative group rounded-xl overflow-hidden border border-border/40 aspect-video bg-muted/20">
                  <img src={currentImage} alt="Event" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <Button size="sm" variant="secondary" className="rounded-lg text-xs" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                      {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                      Replace
                    </Button>
                    <Button size="sm" variant="destructive" className="rounded-lg text-xs" onClick={() => { setCurrentImage(null); updateImage(null); }}>
                      <X className="h-3.5 w-3.5 mr-1.5" /> Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  className="w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-all py-8 text-muted-foreground"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImageIcon className="h-6 w-6" />}
                  <span className="text-sm">{isUploading ? "Uploading…" : "Click to upload event photo"}</span>
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }} />
            </div>

            {/* ── Time & Logistics ── */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Logistics</Label>
              {event.isTwoDay ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Day 1</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Time In</Label>
                      <Input type="datetime-local" className="rounded-xl text-xs" value={form.timeIn} onChange={set("timeIn")} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Time Out</Label>
                      <Input type="datetime-local" className="rounded-xl text-xs" value={form.timeOut} onChange={set("timeOut")} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground font-medium pt-1">Day 2</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Time In</Label>
                      <Input type="datetime-local" className="rounded-xl text-xs" value={form.day2TimeIn} onChange={set("day2TimeIn")} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Time Out</Label>
                      <Input type="datetime-local" className="rounded-xl text-xs" value={form.day2TimeOut} onChange={set("day2TimeOut")} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Time In</Label>
                    <Input type="datetime-local" className="rounded-xl text-xs" value={form.timeIn} onChange={set("timeIn")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Time Out</Label>
                    <Input type="datetime-local" className="rounded-xl text-xs" value={form.timeOut} onChange={set("timeOut")} />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Crowd Size</Label>
                  <Input type="number" placeholder="e.g. 150" className="rounded-xl text-sm" value={form.crowdSize} onChange={set("crowdSize")} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Booth Placement</Label>
                  <Input placeholder="e.g. Front left, near stage" className="rounded-xl text-sm" value={form.boothPlacement} onChange={set("boothPlacement")} />
                </div>
              </div>
            </div>

            {/* ── Sound ── */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sound Setup Notes</Label>
              <Textarea placeholder="Mic issues, monitor setup, PA notes…" className="rounded-xl text-sm min-h-[70px] resize-none" value={form.soundSetupNotes} onChange={set("soundSetupNotes")} />
            </div>

            {/* ── What worked / didn't ── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-emerald-500">What Worked</Label>
                <Textarea placeholder="What went well…" className="rounded-xl text-sm min-h-[80px] resize-none border-emerald-500/20 focus-visible:ring-emerald-500/30" value={form.whatWorked} onChange={set("whatWorked")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-destructive">What Didn't</Label>
                <Textarea placeholder="What fell short…" className="rounded-xl text-sm min-h-[80px] resize-none border-destructive/20 focus-visible:ring-destructive/30" value={form.whatDidntWork} onChange={set("whatDidntWork")} />
              </div>
            </div>

            {/* ── Would Repeat ── */}
            <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card px-4 py-3">
              <Label className="text-sm">Would Repeat?</Label>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{form.wouldRepeat ? "Yes" : "No"}</span>
                <Switch checked={form.wouldRepeat} onCheckedChange={v => setForm(f => ({ ...f, wouldRepeat: v }))} />
              </div>
            </div>

            {/* ── Lead Results (only when isLeadGenerating) ── */}
            {event.isLeadGenerating && (
              <div className="space-y-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                <Label className="text-xs font-semibold uppercase tracking-wider text-violet-400 flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" /> Lead Results
                </Label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Lead Quality</Label>
                    <Select value={form.leadQuality} onValueChange={v => setForm(f => ({ ...f, leadQuality: v }))}>
                      <SelectTrigger className="rounded-xl text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent position="popper">
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="poor">Poor</SelectItem>
                        <SelectItem value="fair">Fair</SelectItem>
                        <SelectItem value="good">Good</SelectItem>
                        <SelectItem value="excellent">Excellent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Leads Collected</Label>
                    <Input type="number" min={0} placeholder="0" className="rounded-xl text-sm" value={form.leadsCollected} onChange={set("leadsCollected")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Trial Signups</Label>
                    <Input type="number" min={0} placeholder="0" className="rounded-xl text-sm" value={form.trialSignups} onChange={set("trialSignups")} />
                  </div>
                </div>
              </div>
            )}

            {/* ── Event Vibe ── */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Event Vibe</Label>
              <Select value={form.eventVibe} onValueChange={v => setForm(f => ({ ...f, eventVibe: v }))}>
                <SelectTrigger className="rounded-xl text-sm"><SelectValue placeholder="How was the energy?" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dead">Dead — nobody around</SelectItem>
                  <SelectItem value="slow">Slow — some foot traffic</SelectItem>
                  <SelectItem value="moderate">Moderate — steady flow</SelectItem>
                  <SelectItem value="busy">Busy — lots of engagement</SelectItem>
                  <SelectItem value="electric">Electric — packed & excited</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* ── Improvements ── */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Improvements for Next Time</Label>
              <Textarea placeholder="Suggestions, changes, ideas…" className="rounded-xl text-sm min-h-[70px] resize-none" value={form.improvements} onChange={set("improvements")} />
            </div>

            {/* ── Staff Notes ── */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Staff Notes</Label>
              <Textarea placeholder="Internal notes about staff performance, logistics…" className="rounded-xl text-sm min-h-[70px] resize-none" value={form.staffNotes} onChange={set("staffNotes")} />
            </div>

            {/* ── Save ── */}
            <Button className="w-full rounded-xl" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Save Debrief
            </Button>

          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
