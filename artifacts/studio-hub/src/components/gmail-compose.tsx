import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { useGmailSend, useEmailTemplates } from "@/hooks/use-google";
import { useGoogleStatus } from "@/hooks/use-google";
import { useToast } from "@/hooks/use-toast";

type Contact = {
  id: number;
  name: string;
  email?: string | null;
  organization?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact | null;
  threadId?: string;
  replyToMessageId?: string;
  replySubject?: string;
  eventId?: number;
};

// Apply merge fields: {name}, {organization}, {event_date} etc.
function applyMergeFields(text: string, contact: Contact | null): string {
  if (!contact) return text;
  return text
    .replace(/\{name\}/gi, contact.name)
    .replace(/\{first_name\}/gi, contact.name.split(" ")[0])
    .replace(/\{organization\}/gi, contact.organization ?? "");
}

export function GmailComposeModal({ open, onOpenChange, contact, threadId, replyToMessageId, replySubject, eventId }: Props) {
  const { data: googleStatus } = useGoogleStatus();
  const { data: templates = [] } = useEmailTemplates();
  const { mutate: sendEmail, isPending } = useGmailSend();
  const { toast } = useToast();

  const [to, setTo] = useState(contact?.email ?? "");
  const [subject, setSubject] = useState(replySubject ? `Re: ${replySubject}` : "");
  const [body, setBody] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    if (open) {
      setTo(contact?.email ?? "");
      setSubject(replySubject ? `Re: ${replySubject}` : "");
      setBody("");
    }
  }, [open, contact, replySubject]);

  const applyTemplate = (template: { subject: string; body: string }) => {
    setSubject(applyMergeFields(template.subject, contact));
    setBody(applyMergeFields(template.body, contact));
    setShowTemplates(false);
  };

  const handleSend = () => {
    if (!to || !subject || !body) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }
    sendEmail(
      {
        contactId: contact?.id,
        to,
        subject,
        body,
        threadId,
        replyToMessageId,
        eventId,
      },
      {
        onSuccess: () => {
          toast({ title: "Email sent successfully" });
          onOpenChange(false);
        },
        onError: (err: any) => {
          toast({ title: err.message ?? "Failed to send email", variant: "destructive" });
        },
      }
    );
  };

  if (!googleStatus?.connected) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[420px] rounded-2xl">
          <DialogHeader>
            <DialogTitle>Gmail Not Connected</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Connect your Gmail account to send emails from the app.</p>
          <Button onClick={() => window.location.href = "/api/auth/google"} className="w-full rounded-xl mt-2">
            Connect Gmail
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[580px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {threadId ? `Reply to ${contact?.name}` : `Email ${contact?.name ?? "Contact"}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* From indicator */}
          <div className="text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-lg">
            From: <span className="text-foreground font-medium">{googleStatus.googleEmail}</span>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">To</Label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              className="rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Subject</Label>
              {templates.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowTemplates(!showTemplates)}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  <FileText className="h-3 w-3" />
                  Templates
                  {showTemplates ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
              )}
            </div>

            {showTemplates && templates.length > 0 && (
              <div className="bg-muted/30 border border-border/50 rounded-xl p-2 space-y-1">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-primary/10 transition-colors text-sm"
                  >
                    <div className="font-medium text-foreground">{t.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{t.subject}</div>
                  </button>
                ))}
              </div>
            )}

            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line..."
              className="rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Message</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={`Write your message to ${contact?.name ?? "this contact"}...`}
              className="rounded-xl resize-none h-44"
            />
            {contact && (
              <p className="text-[10px] text-muted-foreground">
                Merge fields: <code className="bg-muted px-1 rounded">{"{name}"}</code> <code className="bg-muted px-1 rounded">{"{organization}"}</code>
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl" disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={isPending || !to || !subject || !body} className="rounded-xl px-6">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
