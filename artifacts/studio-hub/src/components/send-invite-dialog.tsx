import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Send, Eye, Mail, ChevronDown, User, Users2 } from "lucide-react";

interface EventInfo {
  id: number;
  title: string;
  startDate?: string | null;
  location?: string | null;
  signupToken?: string | null;
}

interface EmailTemplate {
  id: number;
  name: string;
  category: string | null;
  subject: string;
  body: string;
}

interface Employee {
  id: number;
  name: string;
  email?: string | null;
  role?: string | null;
}

interface LineupBand {
  bandId: number | null;
  bandName: string | null;
  contactName: string | null;
  contactEmail: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  "show-request": "Show Request",
  "event-invite-staff": "Invite — Staff",
  "event-invite-intern": "Invite — Intern",
  "event-invite-band": "Invite — Band Leader",
  "reminder-week": "Reminder — 1 Week",
  "reminder-day": "Reminder — 1 Day",
};

const CATEGORY_COLORS: Record<string, string> = {
  "show-request": "bg-violet-500/15 text-violet-400",
  "event-invite-staff": "bg-sky-500/15 text-sky-400",
  "event-invite-intern": "bg-orange-500/15 text-orange-400",
  "event-invite-band": "bg-teal-500/15 text-teal-400",
  "reminder-week": "bg-amber-500/15 text-amber-400",
  "reminder-day": "bg-red-500/15 text-red-400",
};

function substitute(text: string, vars: Record<string, string>): string {
  return text
    .replace(/\{\{recipient_name\}\}/g, vars.recipientName || "there")
    .replace(/\{\{event_title\}\}/g, vars.eventTitle || "")
    .replace(/\{\{event_date\}\}/g, vars.eventDate || "TBD")
    .replace(/\{\{event_location\}\}/g, vars.eventLocation || "TBD")
    .replace(/\{\{signup_link\}\}/g, vars.signupLink || "[signup link]");
}

interface Props {
  event: EventInfo;
  open: boolean;
  onClose: () => void;
}

export function SendInviteDialog({ event, open, onClose }: Props) {
  const { toast } = useToast();
  const [templateId, setTemplateId] = useState<string>("");
  const [recipientMode, setRecipientMode] = useState<"preset" | "manual">("preset");
  const [presetKey, setPresetKey] = useState<string>("");
  const [manualName, setManualName] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const { data: templates = [] } = useQuery<EmailTemplate[]>({
    queryKey: ["email-templates"],
    queryFn: async () => {
      const r = await fetch("/api/gmail/email-templates", { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: open,
  });

  const { data: lineup = [] } = useQuery<LineupBand[]>({
    queryKey: ["lineup-contacts", event.id],
    queryFn: async () => {
      const r = await fetch(`/api/events/${event.id}/lineup`, { credentials: "include" });
      if (!r.ok) return [];
      const slots = await r.json();
      const seen = new Set<string>();
      const contacts: LineupBand[] = [];
      for (const slot of slots) {
        if (slot.bandId && slot.bandName) {
          const key = String(slot.bandId);
          if (!seen.has(key)) {
            seen.add(key);
            contacts.push({ bandId: slot.bandId, bandName: slot.bandName, contactName: slot.contactName, contactEmail: slot.contactEmail });
          }
        }
      }
      return contacts;
    },
    enabled: open,
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: async () => {
      const r = await fetch("/api/employees", { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: open,
  });

  const presetOptions = useMemo(() => {
    const opts: { key: string; label: string; name: string; email: string; group: string }[] = [];
    for (const b of lineup) {
      if (b.contactEmail) {
        opts.push({ key: `band-${b.bandId}`, label: `${b.bandName}${b.contactName ? ` — ${b.contactName}` : ""}`, name: b.contactName || b.bandName || "", email: b.contactEmail, group: "Band Contacts" });
      }
    }
    for (const e of employees) {
      if (e.email) {
        opts.push({ key: `emp-${e.id}`, label: `${e.name} (${e.role || "staff"})`, name: e.name, email: e.email, group: "Employees" });
      }
    }
    return opts;
  }, [lineup, employees]);

  const selectedPreset = presetOptions.find(o => o.key === presetKey);
  const recipientName = recipientMode === "preset" ? (selectedPreset?.name || "") : manualName;
  const recipientEmail = recipientMode === "preset" ? (selectedPreset?.email || "") : manualEmail;

  const domain = window.location.hostname;
  const signupLink = event.signupToken
    ? `https://${domain}/signup/${event.signupToken}`
    : "[signup link]";

  const eventDate = event.startDate
    ? format(new Date(event.startDate), "EEEE, MMMM d, yyyy")
    : "TBD";

  const vars = {
    recipientName,
    eventTitle: event.title,
    eventDate,
    eventLocation: event.location || "TBD",
    signupLink,
  };

  const selectedTemplate = templates.find(t => t.id === parseInt(templateId));
  const previewSubject = selectedTemplate ? substitute(selectedTemplate.subject, vars) : "";
  const previewBody = selectedTemplate ? substitute(selectedTemplate.body, vars) : "";

  const sendMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/events/${event.id}/send-invite`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: parseInt(templateId), recipientEmail, recipientName }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Failed to send");
      }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Email sent!", description: `Sent to ${recipientEmail}` });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    },
  });

  const canSend = !!templateId && !!recipientEmail;

  function handleClose() {
    setTemplateId("");
    setPresetKey("");
    setManualName("");
    setManualEmail("");
    setShowPreview(false);
    onClose();
  }

  const groupedByCategory = useMemo(() => {
    const groups: Record<string, EmailTemplate[]> = {};
    for (const t of templates) {
      const cat = t.category || "other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(t);
    }
    return groups;
  }, [templates]);

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="sm:w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-[#1a1a1a] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Mail className="h-5 w-5 text-primary" />
            Send Email
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Send a templated invite or reminder for <span className="text-white font-medium">{event.title}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Template picker */}
          <div className="space-y-1.5">
            <Label className="text-sm text-zinc-300">Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white h-10 rounded-xl">
                <SelectValue placeholder="Choose a template…" />
              </SelectTrigger>
              <SelectContent className="bg-[#222] border-white/10 text-white">
                {Object.entries(groupedByCategory).map(([cat, tpls]) => (
                  <div key={cat}>
                    <div className="px-2 pt-2 pb-1">
                      <span className={`text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full ${CATEGORY_COLORS[cat] || "bg-zinc-700/50 text-zinc-400"}`}>
                        {CATEGORY_LABELS[cat] || cat}
                      </span>
                    </div>
                    {tpls.map(t => (
                      <SelectItem key={t.id} value={String(t.id)} className="text-white focus:bg-white/10">
                        {t.name}
                      </SelectItem>
                    ))}
                  </div>
                ))}
                {templates.length === 0 && (
                  <div className="px-4 py-3 text-sm text-zinc-500">No templates yet — add them in Settings</div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Recipient */}
          <div className="space-y-2">
            <Label className="text-sm text-zinc-300">Recipient</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={recipientMode === "preset" ? "default" : "outline"}
                className="rounded-lg text-xs h-8"
                onClick={() => setRecipientMode("preset")}
              >
                <Users2 className="h-3.5 w-3.5 mr-1.5" /> From event
              </Button>
              <Button
                type="button"
                size="sm"
                variant={recipientMode === "manual" ? "default" : "outline"}
                className="rounded-lg text-xs h-8"
                onClick={() => setRecipientMode("manual")}
              >
                <User className="h-3.5 w-3.5 mr-1.5" /> Manual
              </Button>
            </div>

            {recipientMode === "preset" ? (
              <Select value={presetKey} onValueChange={setPresetKey}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white h-10 rounded-xl">
                  <SelectValue placeholder="Select a person…" />
                </SelectTrigger>
                <SelectContent className="bg-[#222] border-white/10 text-white max-h-60">
                  {["Band Contacts", "Employees"].map(group => {
                    const opts = presetOptions.filter(o => o.group === group);
                    if (!opts.length) return null;
                    return (
                      <div key={group}>
                        <div className="px-2 pt-2 pb-1">
                          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{group}</span>
                        </div>
                        {opts.map(o => (
                          <SelectItem key={o.key} value={o.key} className="text-white focus:bg-white/10">
                            <span>{o.label}</span>
                            <span className="ml-1.5 text-zinc-500 text-xs">{o.email}</span>
                          </SelectItem>
                        ))}
                      </div>
                    );
                  })}
                  {presetOptions.length === 0 && (
                    <div className="px-4 py-3 text-sm text-zinc-500">No contacts with emails found for this event</div>
                  )}
                </SelectContent>
              </Select>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-zinc-400">Name</Label>
                  <Input
                    value={manualName}
                    onChange={e => setManualName(e.target.value)}
                    placeholder="Recipient name"
                    className="bg-white/5 border-white/10 text-white h-9 rounded-xl text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-zinc-400">Email *</Label>
                  <Input
                    type="email"
                    value={manualEmail}
                    onChange={e => setManualEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="bg-white/5 border-white/10 text-white h-9 rounded-xl text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Preview toggle */}
          {selectedTemplate && (
            <>
              <Separator className="bg-white/10" />
              <div className="space-y-2">
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
                  onClick={() => setShowPreview(v => !v)}
                >
                  <Eye className="h-4 w-4" />
                  {showPreview ? "Hide preview" : "Preview email"}
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showPreview ? "rotate-180" : ""}`} />
                </button>

                {showPreview && (
                  <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-3">
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">To</p>
                      <p className="text-sm text-zinc-200">{recipientEmail || <span className="text-zinc-500 italic">no recipient selected</span>}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Subject</p>
                      <p className="text-sm font-medium text-white">{previewSubject}</p>
                    </div>
                    <Separator className="bg-white/10" />
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Body</p>
                      <pre className="text-sm text-zinc-200 whitespace-pre-wrap font-sans leading-relaxed">{previewBody}</pre>
                    </div>
                    {selectedTemplate.category && ["show-request","event-invite-staff","event-invite-intern","event-invite-band"].includes(selectedTemplate.category) && (
                      <div className="pt-1">
                        <div className="inline-block bg-[#7250ef] text-white text-sm font-semibold px-6 py-3 rounded-lg">
                          {selectedTemplate.category === "show-request" ? "Register Interest" : "Confirm My Spot"} →
                        </div>
                        <p className="text-xs text-zinc-500 mt-2">Signup button links to: {signupLink}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1 rounded-xl border-white/10 text-zinc-300" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!canSend || sendMutation.isPending}
              className="flex-1 rounded-xl"
              onClick={() => sendMutation.mutate()}
            >
              <Send className="h-4 w-4 mr-2" />
              {sendMutation.isPending ? "Sending…" : "Send Email"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
