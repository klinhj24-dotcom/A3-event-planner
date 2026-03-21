import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { CheckCircle2, CreditCard, ExternalLink, Ticket, RefreshCw } from "lucide-react";
import { format } from "date-fns";

interface PendingCharge {
  id: number;
  eventId: number;
  eventTitle: string;
  startDate: string | null;
  isTwoDay: boolean | null;
  ticketPrice: string | null;
  day1Price: string | null;
  day2Price: string | null;
  formType: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  ticketCount: number | null;
  ticketType: string | null;
  studentFirstName: string | null;
  studentLastName: string | null;
  instrument: string | null;
  recitalSong: string | null;
  teacher: string | null;
  status: string;
  charged: boolean;
  chargedAt: string | null;
  createdAt: string;
}

function resolvePrice(r: PendingCharge): number | null {
  const raw = r.isTwoDay && r.ticketType
    ? r.ticketType === "day1" ? r.day1Price
    : r.ticketType === "day2" ? r.day2Price
    : r.ticketPrice
    : r.ticketPrice;
  return raw ? parseFloat(raw) : null;
}

export default function Charges() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: charges = [], isLoading, refetch } = useQuery<PendingCharge[]>({
    queryKey: ["/api/pending-charges"],
    queryFn: () => fetch("/api/pending-charges", { credentials: "include" }).then(r => r.json()),
  });

  // Track optimistically-charged IDs so they fade out before refetch
  const [justCharged, setJustCharged] = useState<Set<number>>(new Set());

  const { mutate: markCharged } = useMutation({
    mutationFn: async ({ requestId, eventId }: { requestId: number; eventId: number }) => {
      const res = await fetch(`/api/events/${eventId}/ticket-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ charged: true }),
      });
      if (!res.ok) throw new Error("Failed to mark as charged");
      return res.json();
    },
    onMutate: ({ requestId }) => {
      setJustCharged(prev => new Set([...prev, requestId]));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pending-charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Card charged — confirmation email sent" });
    },
    onError: (_, { requestId }) => {
      setJustCharged(prev => { const s = new Set(prev); s.delete(requestId); return s; });
      toast({ title: "Failed to mark as charged", variant: "destructive" });
    },
  });

  // Group by event
  const byEvent = charges.reduce<Record<number, { eventId: number; eventTitle: string; startDate: string | null; items: PendingCharge[] }>>((acc, r) => {
    if (!acc[r.eventId]) acc[r.eventId] = { eventId: r.eventId, eventTitle: r.eventTitle, startDate: r.startDate, items: [] };
    acc[r.eventId].items.push(r);
    return acc;
  }, {});
  const groups = Object.values(byEvent);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 pb-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <CreditCard className="h-8 w-8 text-rose-400" />
              Pending Card Charges
            </h1>
            <p className="text-muted-foreground mt-1">
              {charges.length > 0
                ? `${charges.length} registration${charges.length !== 1 ? "s" : ""} across ${groups.length} event${groups.length !== 1 ? "s" : ""} awaiting payment`
                : "All cards are charged — nothing pending."}
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors border border-border/40 rounded-xl px-3 py-2"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>

        {charges.length === 0 ? (
          <div className="rounded-2xl border border-border/20 bg-card p-16 text-center flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-lg">All clear!</p>
              <p className="text-muted-foreground text-sm mt-1">No pending card charges right now.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map(group => {
              const visible = group.items.filter(r => !justCharged.has(r.id));
              if (visible.length === 0) return null;

              const eventTotal = group.items.reduce((sum, r) => {
                const price = resolvePrice(r);
                return sum + (price && r.ticketCount ? price * r.ticketCount : 0);
              }, 0);

              return (
                <div key={group.eventId} className="rounded-2xl border border-border/20 bg-card overflow-hidden shadow-sm">
                  {/* Event header */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-border/20 bg-black/20">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-semibold text-foreground text-base">{group.eventTitle}</h2>
                        <Badge variant="outline" className="text-[10px] text-rose-400 border-rose-500/30 bg-rose-500/8">
                          {visible.length} pending
                        </Badge>
                      </div>
                      {group.startDate && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(group.startDate), "EEEE, MMMM d, yyyy")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {eventTotal > 0 && (
                        <span className="text-sm font-bold text-foreground">${eventTotal.toFixed(2)} total</span>
                      )}
                      <Link
                        href={`/events?open=${group.eventId}`}
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Open event <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>

                  {/* Charge rows */}
                  <div className="divide-y divide-border/10">
                    {/* Table header */}
                    <div className="grid grid-cols-[52px_1fr_auto] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 px-4 py-2 bg-muted/10">
                      <span className="text-center">Charged</span>
                      <span>Registrant / Details</span>
                      <span className="text-right pr-1">Amount</span>
                    </div>

                    {visible.map(r => {
                      const isRecital = r.formType === "recital" && r.studentFirstName;
                      const price = resolvePrice(r);
                      const lineTotal = price && r.ticketCount ? (price * r.ticketCount) : null;

                      return (
                        <div
                          key={r.id}
                          className="grid grid-cols-[52px_1fr_auto] items-center gap-0 px-4 py-3 hover:bg-muted/20 transition-colors"
                        >
                          {/* Big checkbox */}
                          <div className="flex justify-center">
                            <button
                              onClick={() => markCharged({ requestId: r.id, eventId: r.eventId })}
                              title="Mark card as charged — sends confirmation email"
                              className="h-8 w-8 rounded-xl border-2 border-border/50 bg-background hover:border-emerald-500 hover:bg-emerald-500/5 flex items-center justify-center transition-all shadow-sm group"
                            >
                              <CheckCircle2 className="h-4 w-4 text-muted-foreground/20 group-hover:text-emerald-400 transition-colors" />
                            </button>
                          </div>

                          {/* Name + details */}
                          <div className="min-w-0 pr-4">
                            {isRecital ? (
                              <>
                                <div className="font-semibold text-foreground text-sm leading-tight">
                                  {r.studentFirstName} {r.studentLastName}
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {[r.instrument, r.recitalSong].filter(Boolean).join(" · ")}
                                  {r.teacher && <span className="ml-1.5 text-muted-foreground/60">· {r.teacher}</span>}
                                </div>
                                <div className="text-xs text-muted-foreground/60 mt-0.5 truncate">
                                  <Ticket className="h-2.5 w-2.5 inline mr-1" />
                                  {r.contactFirstName} {r.contactLastName} · {r.contactEmail}
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="font-semibold text-foreground text-sm leading-tight">
                                  {r.contactFirstName} {r.contactLastName}
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5 truncate">{r.contactEmail}</div>
                                {r.ticketCount && (
                                  <div className="text-xs text-muted-foreground/70 mt-0.5">
                                    {r.ticketCount} ticket{r.ticketCount !== 1 ? "s" : ""}
                                    {r.ticketType && r.isTwoDay && (
                                      <span className="ml-1">
                                        · {r.ticketType === "day1" ? "Day 1" : r.ticketType === "day2" ? "Day 2" : "Both Days"}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                          </div>

                          {/* Amount */}
                          <div className="text-right pr-1">
                            {lineTotal != null ? (
                              <span className="font-bold text-foreground text-sm">${lineTotal.toFixed(2)}</span>
                            ) : (
                              <span className="text-muted-foreground/40 text-xs">—</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
