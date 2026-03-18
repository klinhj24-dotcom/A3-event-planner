import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Loader2, Music, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import tmsLogoWhite from "@assets/TMS_Logo_Stacked_Large_White@4x_1773281994585.png";
import { PublicFooter } from "@/components/public-footer";

const TMS_CC = "info@themusicspace.com";

function fmt12(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export default function BandConfirmPage() {
  const params = useParams();
  const token = (params as any).token || "";
  const [conflictNote, setConflictNote] = useState("");
  const [result, setResult] = useState<{ confirmed: boolean; contactName: string; bandName: string; eventTitle: string } | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [`/api/band-confirm/${token}`],
    queryFn: async () => {
      const res = await fetch(`/api/band-confirm/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Not found");
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const { mutate: respond, isPending } = useMutation({
    mutationFn: async (action: "confirm" | "decline") => {
      const res = await fetch(`/api/band-confirm/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, conflictNote }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setResult({ confirmed: data.confirmed, contactName: data.contactName, bandName: data.bandName, eventTitle: data.eventTitle });
    },
  });

  const invite = data?.invite;
  const event = data?.event;
  const slot = data?.slot;
  const alreadyConfirmedBy = data?.alreadyConfirmedBy;
  const alreadyDeclinedBy = data?.alreadyDeclinedBy;
  const eventWindow = data?.eventWindow;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center py-8 px-4">
      <div className="mb-6">
        <img src={tmsLogoWhite} alt="The Music Space" className="h-16 w-auto object-contain" />
      </div>

      <div className="w-full max-w-lg">
        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {isError && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="rounded-2xl border border-border/60 bg-card p-8 text-center space-y-3">
              <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                <AlertCircle className="h-7 w-7 text-destructive" />
              </div>
              <h1 className="text-xl font-bold">Oops</h1>
              <p className="text-muted-foreground text-sm">{(error as Error)?.message || "This link is invalid or has expired."}</p>
            </div>
          </motion.div>
        )}

        {/* Success state after responding */}
        {result && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="rounded-2xl border border-border/60 bg-card p-8 text-center space-y-4">
              <div className={`h-14 w-14 rounded-full flex items-center justify-center mx-auto ${result.confirmed ? "bg-emerald-500/10" : "bg-muted"}`}>
                {result.confirmed
                  ? <CheckCircle2 className="h-7 w-7 text-emerald-500" />
                  : <XCircle className="h-7 w-7 text-muted-foreground" />}
              </div>
              <div>
                <h1 className="text-xl font-bold">{result.confirmed ? "Booking Confirmed!" : "Declined"}</h1>
                <p className="text-muted-foreground text-sm mt-2">
                  {result.confirmed
                    ? `Thanks, ${result.contactName}! We've recorded your confirmation for ${result.bandName} at ${result.eventTitle}. We'll be in touch with more details soon.`
                    : `Thanks for letting us know. We've noted that ${result.bandName} won't be able to make it. If this was a mistake, please contact us directly.`}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Invite view */}
        {!result && invite && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              <div className="p-6 space-y-4">
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Music className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h1 className="font-display text-xl font-bold leading-tight">Performance Invite</h1>
                    <p className="text-sm text-muted-foreground">Hi <strong>{invite.contactName ?? "there"}</strong>,</p>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">
                  The Music Space is inviting <strong className="text-foreground">{slot?.bandName ?? "your band"}</strong> to perform.
                </p>

                {/* Status banners */}
                {alreadyConfirmedBy && (
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5 text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Already confirmed by {alreadyConfirmedBy}
                  </div>
                )}
                {!alreadyConfirmedBy && alreadyDeclinedBy && (
                  <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-2.5 text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Previously declined by {alreadyDeclinedBy} — you may still respond below
                  </div>
                )}
                {invite.status === "confirmed" && !alreadyConfirmedBy && (
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5 text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    You already confirmed this booking
                  </div>
                )}
                {invite.status === "declined" && (
                  <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-2.5 text-sm text-destructive flex items-center gap-2">
                    <XCircle className="h-4 w-4 shrink-0" />
                    You already declined — update below if needed
                  </div>
                )}

                {/* Event details */}
                <div className="rounded-xl bg-muted/40 border border-border/40 p-4 space-y-1.5 text-sm">
                  <div className="flex gap-2"><span className="font-medium w-20 shrink-0">Event:</span><span className="text-muted-foreground">{event?.title ?? "TBD"}</span></div>
                  <div className="flex gap-2"><span className="font-medium w-20 shrink-0">Date:</span><span className="text-muted-foreground">{eventWindow ?? "TBD"}</span></div>
                  <div className="flex gap-2"><span className="font-medium w-20 shrink-0">Location:</span><span className="text-muted-foreground">{event?.location ?? "TBD"}</span></div>
                  {slot?.startTime && (
                    <div className="flex gap-2">
                      <span className="font-medium w-20 shrink-0">Set Time:</span>
                      <span className="text-muted-foreground">{fmt12(slot.startTime)}{slot.durationMinutes ? ` (${slot.durationMinutes} min)` : ""}</span>
                    </div>
                  )}
                  {!slot?.startTime && invite.staffNote && (
                    <div className="flex gap-2"><span className="font-medium w-20 shrink-0">Notes:</span><span className="text-muted-foreground">{invite.staffNote}</span></div>
                  )}
                </div>

                {/* Conflict note textarea */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Day-of scheduling notes or conflicts <span className="text-muted-foreground font-normal text-xs">(optional)</span></label>
                  <Textarea
                    className="rounded-xl min-h-[80px] resize-none"
                    placeholder="e.g. We need a 30 min soundcheck window, or one member can't arrive until 5pm…"
                    value={conflictNote}
                    onChange={e => setConflictNote(e.target.value)}
                  />
                </div>

                {/* Action buttons */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <Button
                    onClick={() => respond("confirm")}
                    disabled={isPending}
                    className="rounded-xl"
                  >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                    Confirm Booking
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => respond("decline")}
                    disabled={isPending}
                    className="rounded-xl"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Decline
                  </Button>
                </div>
              </div>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Questions? Email us at{" "}
              <a href={`mailto:${TMS_CC}`} className="text-primary hover:underline">{TMS_CC}</a>
            </p>
          </motion.div>
        )}
        <PublicFooter />
      </div>
    </div>
  );
}
