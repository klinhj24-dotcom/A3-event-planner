import { useState, useEffect, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, X, ImageIcon, CheckCircle2, TrendingUp } from "lucide-react";
import { useUpload } from "@workspace/object-storage-web";
import { useEventDebrief, useUpsertDebrief, useUpdateEventImage } from "@/hooks/use-team";
import { useToast } from "@/hooks/use-toast";

interface DebriefSheetProps {
  event: { id: number; title: string; type: string; imageUrl?: string | null; isLeadGenerating?: boolean } | null;
  onClose: () => void;
}

export function DebriefSheet({ event, onClose }: DebriefSheetProps) {
  const { toast } = useToast();
  const { data: debrief, isLoading } = useEventDebrief(event?.id ?? null);
  const { mutate: upsert, isPending: saving } = useUpsertDebrief(event?.id ?? 0);
  const { mutate: updateImage } = useUpdateEventImage(event?.id ?? 0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    timeIn: "",
    timeOut: "",
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

  useEffect(() => {
    if (debrief) {
      setForm({
        timeIn: debrief.timeIn ? new Date(debrief.timeIn).toISOString().slice(0, 16) : "",
        timeOut: debrief.timeOut ? new Date(debrief.timeOut).toISOString().slice(0, 16) : "",
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

  return (
    <Sheet open={!!event} onOpenChange={open => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-[520px] flex flex-col gap-0 p-0 overflow-y-auto">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/40 shrink-0">
          <SheetTitle className="font-display text-lg leading-tight">{event.title}</SheetTitle>
          <SheetDescription className="text-xs">Post-event debrief & metrics</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 px-6 py-5 space-y-6">

            {/* ── Photo ── */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Event Photo</Label>
              {currentImage ? (
                <div className="relative group rounded-xl overflow-hidden border border-border/40 aspect-video bg-muted/20">
                  <img src={currentImage} alt="Event" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="rounded-lg text-xs"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                      Replace
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="rounded-lg text-xs"
                      onClick={() => {
                        setCurrentImage(null);
                        updateImage(null);
                      }}
                    >
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
                  {isUploading
                    ? <Loader2 className="h-6 w-6 animate-spin" />
                    : <ImageIcon className="h-6 w-6" />}
                  <span className="text-sm">{isUploading ? "Uploading…" : "Click to upload event photo"}</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }}
              />
            </div>

            {/* ── Time & Logistics ── */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Logistics</Label>
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
                      <SelectTrigger className="rounded-xl text-sm">
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
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

            {/* ── Event Vibe (always shown) ── */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Event Vibe</Label>
              <Select value={form.eventVibe} onValueChange={v => setForm(f => ({ ...f, eventVibe: v }))}>
                <SelectTrigger className="rounded-xl text-sm">
                  <SelectValue placeholder="How was the energy?" />
                </SelectTrigger>
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

            {/* ── Staff Notes (always shown) ── */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Staff Notes</Label>
              <Textarea placeholder="Internal notes about staff performance, logistics…" className="rounded-xl text-sm min-h-[70px] resize-none" value={form.staffNotes} onChange={set("staffNotes")} />
            </div>

            {/* ── Save ── */}
            <Button
              className="w-full rounded-xl"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Save Debrief
            </Button>

          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
