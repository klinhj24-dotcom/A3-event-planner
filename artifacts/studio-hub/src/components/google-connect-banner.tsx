import { useGoogleStatus, useGoogleDisconnect } from "@/hooks/use-google";
import { Button } from "@/components/ui/button";
import { Mail, CheckCircle2, ExternalLink, Loader2, X } from "lucide-react";
import { useState } from "react";

export function GoogleConnectBanner() {
  const { data: status, isLoading } = useGoogleStatus();
  const { mutate: disconnect, isPending: isDisconnecting } = useGoogleDisconnect();
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || dismissed) return null;

  if (status?.connected) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 truncate">Gmail connected as <strong>{status.googleEmail}</strong></span>
        <button
          onClick={() => disconnect()}
          disabled={isDisconnecting}
          className="text-emerald-400/60 hover:text-emerald-400 transition-colors ml-1"
          title="Disconnect Gmail"
        >
          {isDisconnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 px-3 py-3 rounded-xl bg-primary/8 border border-primary/20 text-xs">
      <Mail className="h-4 w-4 text-primary shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-foreground font-medium mb-1">Connect Gmail to send emails</p>
        <p className="text-muted-foreground leading-relaxed mb-2">Track outreach and send emails directly from contacts.</p>
        <Button
          size="sm"
          className="h-7 px-3 text-xs rounded-lg"
          onClick={() => window.location.href = "/api/auth/google"}
        >
          <ExternalLink className="h-3 w-3 mr-1.5" /> Connect Gmail
        </Button>
      </div>
      <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground mt-0.5">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
