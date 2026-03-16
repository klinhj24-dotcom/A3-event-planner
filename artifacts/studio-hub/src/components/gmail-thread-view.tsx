import { useState } from "react";
import { useContactThreads, useGmailThread, useImportThread, useSyncContactEmails } from "@/hooks/use-google";
import { useGoogleStatus } from "@/hooks/use-google";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { 
  Mail, Send, Download, ChevronDown, ChevronUp, Loader2, RefreshCw, ArrowLeft, Plus, ExternalLink
} from "lucide-react";
import { format } from "date-fns";
import { GmailComposeModal } from "./gmail-compose";
import { useToast } from "@/hooks/use-toast";

type Contact = { id: number; name: string; email?: string | null; organization?: string | null };

function ThreadMessages({ threadId, contact, onBack }: { threadId: string; contact: Contact; onBack: () => void }) {
  const { data, isLoading, refetch, isRefetching } = useGmailThread(threadId);
  const [replyOpen, setReplyOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const lastMsg = data?.messages?.[data.messages.length - 1];

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h4 className="font-medium text-sm flex-1 truncate">{data?.messages?.[0] ? 
          data.messages[0].subject || "No subject"
          : "Loading..."
        }</h4>
        <button onClick={() => refetch()} disabled={isRefetching} className="text-muted-foreground hover:text-foreground">
          <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {data?.messages?.map((msg, i) => {
            const isOutbound = msg.from?.toLowerCase().includes("@") && 
              msg.labelIds?.includes("SENT");
            const isExpanded = expandedIds.has(msg.id);
            const body = msg.body?.trim() || "No content";
            const isLong = body.length > 300 || body.split("\n").length > 4;

            return (
              <div
                key={msg.id}
                className={`rounded-xl border text-xs transition-colors ${isOutbound ? "bg-primary/8 border-primary/20 ml-4" : "bg-muted/30 border-border/40 mr-4"} ${isLong ? "cursor-pointer hover:border-primary/40" : ""}`}
                onClick={() => isLong && toggleExpand(msg.id)}
              >
                <div className="flex items-center justify-between p-3 pb-2 gap-2">
                  <span className={`font-medium truncate ${isOutbound ? "text-primary" : "text-foreground"}`}>
                    {isOutbound ? "You" : msg.from?.replace(/<.*>/, "").trim() || "Unknown"}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-muted-foreground whitespace-nowrap">
                      {msg.date ? format(new Date(msg.date), "MMM d · h:mm a") : ""}
                    </span>
                    {isLong && (
                      isExpanded
                        ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
                        : <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                </div>
                <div className="px-3 pb-3">
                  <p className={`text-muted-foreground leading-relaxed whitespace-pre-wrap ${isExpanded ? "" : "line-clamp-4"}`}>
                    {body}
                  </p>
                  {isLong && !isExpanded && (
                    <p className={`mt-1 text-[10px] font-medium ${isOutbound ? "text-primary/60" : "text-muted-foreground/60"}`}>
                      Tap to read more
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Button
        size="sm"
        className="w-full rounded-xl h-8 text-xs"
        onClick={() => setReplyOpen(true)}
      >
        <Send className="h-3 w-3 mr-1.5" /> Reply
      </Button>

      <GmailComposeModal
        open={replyOpen}
        onOpenChange={setReplyOpen}
        contact={contact}
        threadId={threadId}
        replyToMessageId={lastMsg?.id}
        replySubject={lastMsg?.subject}
      />
    </div>
  );
}

type ImportDialogProps = { open: boolean; onOpenChange: (v: boolean) => void; contactId: number };

function ImportThreadDialog({ open, onOpenChange, contactId }: ImportDialogProps) {
  const [threadInput, setThreadInput] = useState("");
  const { mutate: importThread, isPending } = useImportThread();
  const { toast } = useToast();

  const handleImport = () => {
    if (!threadInput.trim()) return;
    importThread(
      { contactId, threadId: threadInput.trim() },
      {
        onSuccess: (data) => {
          if (data.imported) {
            toast({ title: `Imported: "${data.subject}"`, description: `${data.messageCount} message(s)` });
          } else {
            toast({ title: data.message ?? "Already linked" });
          }
          setThreadInput("");
          onOpenChange(false);
        },
        onError: (err: any) => {
          toast({ title: err.message ?? "Import failed", variant: "destructive" });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Import Gmail Thread</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Paste a Gmail thread ID or URL to link an existing conversation to this contact.
          </p>
          <div className="space-y-1.5">
            <Input
              value={threadInput}
              onChange={(e) => setThreadInput(e.target.value)}
              placeholder="Thread ID or Gmail URL..."
              className="rounded-xl"
              onKeyDown={(e) => e.key === "Enter" && handleImport()}
            />
            <p className="text-[10px] text-muted-foreground">
              In Gmail, open the email and copy the URL — it contains the thread ID after <code className="bg-muted px-1 rounded">#inbox/</code>
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl" disabled={isPending}>Cancel</Button>
          <Button onClick={handleImport} disabled={isPending || !threadInput.trim()} className="rounded-xl">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type SyncDialogProps = { open: boolean; onOpenChange: (v: boolean) => void; contactId: number };

function SyncEmailsDialog({ open, onOpenChange, contactId }: SyncDialogProps) {
  const [months, setMonths] = useState("3");
  const { mutate: syncEmails, isPending } = useSyncContactEmails();
  const { toast } = useToast();

  const PRESETS = [
    { label: "1 month", value: "1" },
    { label: "3 months", value: "3" },
    { label: "6 months", value: "6" },
    { label: "1 year", value: "12" },
    { label: "2 years", value: "24" },
  ];

  const handleSync = () => {
    const m = Math.max(1, parseInt(months) || 3);
    syncEmails(
      { contactId, months: m },
      {
        onSuccess: (data) => {
          if (data.imported > 0) {
            toast({
              title: `Synced ${data.imported} new thread${data.imported !== 1 ? "s" : ""}`,
              description: data.skipped > 0 ? `${data.skipped} already linked, skipped.` : undefined,
            });
          } else {
            toast({ title: "Already up to date", description: "No new threads found for this period." });
          }
          onOpenChange(false);
        },
        onError: (err: any) => {
          toast({ title: err.message ?? "Sync failed", variant: "destructive" });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Sync Recent Emails</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Search your Gmail inbox for threads with this contact and import any that aren't already linked.
          </p>
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">How far back?</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setMonths(p.value)}
                  className={`px-3 py-1 rounded-lg text-xs border transition-colors ${
                    months === p.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Input
                type="number"
                min={1}
                max={60}
                value={months}
                onChange={(e) => setMonths(e.target.value)}
                className="rounded-xl w-24 text-sm"
              />
              <span className="text-sm text-muted-foreground">months back</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl" disabled={isPending}>Cancel</Button>
          <Button onClick={handleSync} disabled={isPending || !months} className="rounded-xl">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            {isPending ? "Syncing..." : "Sync"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GmailThreadView({ contact }: { contact: Contact }) {
  const { data: googleStatus } = useGoogleStatus();
  const { data: threads = [], isLoading } = useContactThreads(contact.id);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);

  if (!googleStatus?.connected) {
    return (
      <div className="text-center py-6 px-4 bg-muted/20 rounded-xl border border-border/50 border-dashed">
        <Mail className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground mb-3">Connect Gmail to track email threads</p>
        <Button size="sm" variant="outline" className="rounded-lg" onClick={() => window.location.href = "/api/auth/google"}>
          <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Connect Gmail
        </Button>
      </div>
    );
  }

  if (selectedThreadId) {
    return (
      <ThreadMessages
        threadId={selectedThreadId}
        contact={contact}
        onBack={() => setSelectedThreadId(null)}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" /> Email Threads
        </h3>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs rounded-lg" onClick={() => setSyncOpen(true)}>
            <RefreshCw className="h-3 w-3 mr-1" /> Sync
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs rounded-lg" onClick={() => setImportOpen(true)}>
            <Download className="h-3 w-3 mr-1" /> Import
          </Button>
          <Button size="sm" className="h-7 px-2 text-xs rounded-lg" onClick={() => setComposeOpen(true)}>
            <Plus className="h-3 w-3 mr-1" /> Compose
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : threads.length === 0 ? (
        <div className="text-center py-6 px-4 bg-muted/20 rounded-xl border border-border/50 border-dashed">
          <p className="text-sm text-muted-foreground">No email threads yet.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Compose an email or import an existing thread.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {threads.map((thread: any) => (
            <button
              key={thread.id}
              onClick={() => thread.gmailThreadId && setSelectedThreadId(thread.gmailThreadId)}
              className="w-full text-left p-3 rounded-xl border border-border/50 bg-card hover:bg-muted/30 transition-colors group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${thread.direction === "outbound" ? "bg-primary/10 text-primary border-primary/20" : "bg-secondary text-secondary-foreground"}`}>
                      {thread.direction === "outbound" ? "Sent" : "Received"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(thread.outreachAt), "MMM d, yyyy")}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground truncate">{thread.subject || "(No subject)"}</p>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-foreground rotate-[-90deg] mt-1" />
              </div>
            </button>
          ))}
        </div>
      )}

      <GmailComposeModal
        open={composeOpen}
        onOpenChange={setComposeOpen}
        contact={contact}
      />

      <ImportThreadDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        contactId={contact.id}
      />

      <SyncEmailsDialog
        open={syncOpen}
        onOpenChange={setSyncOpen}
        contactId={contact.id}
      />
    </div>
  );
}
