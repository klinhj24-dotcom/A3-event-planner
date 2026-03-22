import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  CheckCircle2, CreditCard, ExternalLink, Ticket, RefreshCw,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, isWithinInterval, parseISO } from "date-fns";

interface ChargeRow {
  id: number;
  eventId: number;
  eventTitle: string;
  eventType?: string | null;
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

function resolvePrice(r: ChargeRow): number | null {
  const raw = r.isTwoDay && r.ticketType
    ? r.ticketType === "day1" ? r.day1Price
    : r.ticketType === "day2" ? r.day2Price
    : r.ticketPrice
    : r.ticketPrice;
  return raw ? parseFloat(raw) : null;
}

// Recital registrations are per-performer — ticketCount is null but count is implicitly 1
function resolveCount(r: ChargeRow): number {
  if (r.ticketCount != null) return r.ticketCount;
  return r.formType === "recital" ? 1 : 0;
}

function calcTotal(items: ChargeRow[]): number {
  return items.reduce((sum, r) => {
    const price = resolvePrice(r);
    const count = resolveCount(r);
    return sum + (price && count ? price * count : 0);
  }, 0);
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub: string; accent: "rose" | "emerald" | "violet" }) {
  const colors = {
    rose: "text-rose-400 bg-rose-500/8 border-rose-500/20",
    emerald: "text-emerald-400 bg-emerald-500/8 border-emerald-500/20",
    violet: "text-violet-400 bg-violet-500/8 border-violet-500/20",
  };
  return (
    <div className={`rounded-2xl border p-4 ${colors[accent]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-2xl font-bold mt-1 text-foreground">{value}</p>
      <p className="text-xs opacity-60 mt-0.5">{sub}</p>
    </div>
  );
}

function HistoryRow({ r }: { r: ChargeRow }) {
  const price = resolvePrice(r);
  const lineTotal = price != null && resolveCount(r) > 0 ? price * resolveCount(r) : null;
  const isRecital = r.formType === "recital" && r.studentFirstName;
  const chargedDate = r.chargedAt ? format(new Date(r.chargedAt), "MMM d") : null;

  return (
    <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-2.5 hover:bg-muted/10 transition-colors border-b border-border/10 last:border-0">
      <div className="min-w-0">
        {isRecital ? (
          <>
            <div className="text-sm font-medium text-foreground leading-tight">
              {r.studentFirstName} {r.studentLastName}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {[r.instrument, r.recitalSong].filter(Boolean).join(" · ")}
              {r.teacher && <span className="text-muted-foreground/60"> · {r.teacher}</span>}
            </div>
            <div className="text-xs text-muted-foreground/50 mt-0.5 truncate">
              <Ticket className="h-2.5 w-2.5 inline mr-1" />
              {r.contactFirstName} {r.contactLastName}
              {chargedDate && <span className="ml-2">· {chargedDate}</span>}
            </div>
          </>
        ) : (
          <>
            <div className="text-sm font-medium text-foreground leading-tight">
              {r.contactFirstName} {r.contactLastName}
            </div>
            <div className="text-xs text-muted-foreground truncate">{r.contactEmail}</div>
            <div className="text-xs text-muted-foreground/50 mt-0.5">
              {r.ticketCount ? `${r.ticketCount} ticket${r.ticketCount !== 1 ? "s" : ""}` : ""}
              {r.ticketType && r.isTwoDay && (
                <span className="ml-1">· {r.ticketType === "day1" ? "Day 1" : r.ticketType === "day2" ? "Day 2" : "Both Days"}</span>
              )}
              {chargedDate && <span className="ml-2">· {chargedDate}</span>}
            </div>
          </>
        )}
      </div>
      <div className="text-right shrink-0 self-center">
        {lineTotal != null ? (
          <span className="font-bold text-foreground text-sm">${lineTotal.toFixed(2)}</span>
        ) : (
          <span className="text-muted-foreground/30 text-xs">—</span>
        )}
      </div>
    </div>
  );
}

function HistoryGroup({ title, subtitle, total, items }: {
  title: string; subtitle?: string; total: number; items: ChargeRow[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border/20 bg-card overflow-hidden shadow-sm">
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 bg-black/20 hover:bg-black/30 transition-colors text-left"
        onClick={() => setOpen(v => !v)}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground text-sm">{title}</span>
            <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/40 shrink-0">
              {items.length} charge{items.length !== 1 ? "s" : ""}
            </Badge>
          </div>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-3">
          {total > 0 && <span className="text-sm font-bold text-emerald-400">${total.toFixed(2)}</span>}
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <div>
          {items.map(r => <HistoryRow key={r.id} r={r} />)}
        </div>
      )}
    </div>
  );
}

export default function Charges() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [viewMonth, setViewMonth] = useState<Date | null>(new Date());
  const [groupBy, setGroupBy] = useState<"event" | "type">("event");
  const [justCharged, setJustCharged] = useState<Set<number>>(new Set());

  const { data: pending = [], isLoading: isLoadingPending, refetch } = useQuery<ChargeRow[]>({
    queryKey: ["/api/pending-charges"],
    queryFn: () => fetch("/api/pending-charges", { credentials: "include" }).then(r => r.json()),
  });

  const { data: history = [], isLoading: isLoadingHistory } = useQuery<ChargeRow[]>({
    queryKey: ["/api/charge-history"],
    queryFn: () => fetch("/api/charge-history", { credentials: "include" }).then(r => r.json()),
  });

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
    onMutate: ({ requestId }) => setJustCharged(prev => new Set([...prev, requestId])),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pending-charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/charge-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Card charged — confirmation email sent" });
    },
    onError: (_, { requestId }) => {
      setJustCharged(prev => { const s = new Set(prev); s.delete(requestId); return s; });
      toast({ title: "Failed to mark as charged", variant: "destructive" });
    },
  });

  // Summary stats
  const nowStart = startOfMonth(new Date());
  const nowEnd = endOfMonth(new Date());
  const thisMonthTotal = history.reduce((sum, r) => {
    const d = r.chargedAt ? parseISO(r.chargedAt) : null;
    if (!d || !isWithinInterval(d, { start: nowStart, end: nowEnd })) return sum;
    const price = resolvePrice(r);
    return sum + (price && r.ticketCount ? price * r.ticketCount : 0);
  }, 0);
  const allTimeTotal = calcTotal(history);
  const activePendingCount = pending.filter(r => !justCharged.has(r.id)).length;

  // Filter history by selected month
  const filteredHistory = viewMonth
    ? history.filter(r => {
        const d = r.chargedAt ? parseISO(r.chargedAt) : r.createdAt ? parseISO(r.createdAt) : null;
        if (!d) return false;
        return isWithinInterval(d, { start: startOfMonth(viewMonth), end: endOfMonth(viewMonth) });
      })
    : history;

  const filteredTotal = calcTotal(filteredHistory);

  // Build groups
  const groups = (() => {
    if (groupBy === "event") {
      const map: Record<number, { key: string; title: string; subtitle?: string; items: ChargeRow[] }> = {};
      for (const r of filteredHistory) {
        if (!map[r.eventId]) {
          const dateStr = r.startDate ? format(new Date(r.startDate), "MMMM d, yyyy") : undefined;
          map[r.eventId] = {
            key: String(r.eventId),
            title: r.eventTitle,
            subtitle: [r.eventType, dateStr].filter(Boolean).join(" · "),
            items: [],
          };
        }
        map[r.eventId].items.push(r);
      }
      return Object.values(map).sort((a, b) => calcTotal(b.items) - calcTotal(a.items));
    } else {
      const map: Record<string, { key: string; title: string; items: ChargeRow[] }> = {};
      for (const r of filteredHistory) {
        const t = r.eventType ?? "Other";
        if (!map[t]) map[t] = { key: t, title: t, items: [] };
        map[t].items.push(r);
      }
      return Object.values(map).sort((a, b) => calcTotal(b.items) - calcTotal(a.items));
    }
  })();

  // Pending grouped by event
  const pendingByEvent = pending.reduce<Record<number, { eventId: number; eventTitle: string; startDate: string | null; items: ChargeRow[] }>>((acc, r) => {
    if (!acc[r.eventId]) acc[r.eventId] = { eventId: r.eventId, eventTitle: r.eventTitle, startDate: r.startDate, items: [] };
    acc[r.eventId].items.push(r);
    return acc;
  }, {});
  const pendingGroups = Object.values(pendingByEvent);

  const isLoading = isLoadingPending || isLoadingHistory;

  const handleRefresh = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ["/api/charge-history"] });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
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
              Card Charges
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Track pending collections and review revenue history.
            </p>
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors border border-border/40 rounded-xl px-3 py-2 shrink-0"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Pending"
            value={activePendingCount}
            sub="to collect"
            accent="rose"
          />
          <StatCard
            label={format(new Date(), "MMMM")}
            value={thisMonthTotal > 0 ? `$${thisMonthTotal.toFixed(2)}` : "—"}
            sub="this month"
            accent="emerald"
          />
        </div>

        {/* ── Pending Charges ───────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-base text-foreground">Pending</h2>
            {activePendingCount > 0 && (
              <Badge variant="outline" className="text-[10px] text-rose-400 border-rose-500/30 bg-rose-500/8">
                {activePendingCount} outstanding
              </Badge>
            )}
          </div>

          {activePendingCount === 0 ? (
            <div className="rounded-2xl border border-border/20 bg-card p-10 text-center flex flex-col items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-foreground">All clear!</p>
                <p className="text-muted-foreground text-sm mt-0.5">No pending card charges right now.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingGroups.map(group => {
                const visible = group.items.filter(r => !justCharged.has(r.id));
                if (visible.length === 0) return null;
                const eventTotal = calcTotal(group.items);

                return (
                  <div key={group.eventId} className="rounded-2xl border border-border/20 bg-card overflow-hidden shadow-sm">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border/20 bg-black/20">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground text-sm">{group.eventTitle}</h3>
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
                          <span className="text-sm font-bold text-foreground">${eventTotal.toFixed(2)}</span>
                        )}
                        <Link
                          href={`/events?open=${group.eventId}`}
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          Open event <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>

                    <div className="divide-y divide-border/10">
                      <div className="grid grid-cols-[52px_1fr_auto] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 px-4 py-2 bg-muted/10">
                        <span className="text-center">Charged</span>
                        <span>Registrant / Details</span>
                        <span className="text-right pr-1">Amount</span>
                      </div>

                      {visible.map(r => {
                        const isRecital = r.formType === "recital" && r.studentFirstName;
                        const price = resolvePrice(r);
                        const lineTotal = price != null && resolveCount(r) > 0 ? price * resolveCount(r) : null;

                        return (
                          <div
                            key={r.id}
                            className="grid grid-cols-[52px_1fr_auto] items-center gap-0 px-4 py-3 hover:bg-muted/20 transition-colors"
                          >
                            <div className="flex justify-center">
                              <button
                                onClick={() => markCharged({ requestId: r.id, eventId: r.eventId })}
                                title="Mark card as charged — sends confirmation email"
                                className="h-8 w-8 rounded-xl border-2 border-border/50 bg-background hover:border-emerald-500 hover:bg-emerald-500/5 flex items-center justify-center transition-all shadow-sm group"
                              >
                                <CheckCircle2 className="h-4 w-4 text-muted-foreground/20 group-hover:text-emerald-400 transition-colors" />
                              </button>
                            </div>
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

        {/* ── Revenue History ──────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Section header + controls */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <h2 className="font-semibold text-base text-foreground">Revenue History</h2>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Group-by toggle */}
              <div className="flex items-center rounded-xl border border-border/40 bg-muted/20 p-0.5 text-xs">
                <button
                  onClick={() => setGroupBy("event")}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${groupBy === "event" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  By Event
                </button>
                <button
                  onClick={() => setGroupBy("type")}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${groupBy === "type" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  By Type
                </button>
              </div>

              {/* Month navigator */}
              <div className="flex items-center gap-1 rounded-xl border border-border/40 bg-muted/20 p-0.5">
                <button
                  onClick={() => setViewMonth(m => m ? subMonths(m, 1) : subMonths(new Date(), 1))}
                  className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setViewMonth(null)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors min-w-[90px] text-center ${viewMonth === null ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {viewMonth ? format(viewMonth, "MMM yyyy") : "All Time"}
                </button>
                <button
                  onClick={() => setViewMonth(m => m ? addMonths(m, 1) : new Date())}
                  className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Jump to current month */}
              {viewMonth && format(viewMonth, "yyyy-MM") !== format(new Date(), "yyyy-MM") && (
                <button
                  onClick={() => setViewMonth(new Date())}
                  className="text-xs text-primary hover:underline px-1"
                >
                  This month
                </button>
              )}
            </div>
          </div>

          {/* Period total */}
          {filteredHistory.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
              <span className="text-sm text-muted-foreground">
                {viewMonth ? format(viewMonth, "MMMM yyyy") : "All time"} total
                <span className="text-muted-foreground/50 ml-1.5">· {filteredHistory.length} charge{filteredHistory.length !== 1 ? "s" : ""}</span>
              </span>
              <span className="text-base font-bold text-emerald-400">${filteredTotal.toFixed(2)}</span>
            </div>
          )}

          {/* Groups */}
          {filteredHistory.length === 0 ? (
            <div className="rounded-2xl border border-border/20 bg-card p-10 text-center">
              <p className="text-muted-foreground text-sm">
                {viewMonth ? `No charges collected in ${format(viewMonth, "MMMM yyyy")}.` : "No charge history yet."}
              </p>
              {viewMonth && (
                <button onClick={() => setViewMonth(null)} className="text-xs text-primary hover:underline mt-2">
                  View all time
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map(g => (
                <HistoryGroup
                  key={g.key}
                  title={g.title}
                  subtitle={"subtitle" in g ? (g as any).subtitle : undefined}
                  total={calcTotal(g.items)}
                  items={g.items}
                />
              ))}
            </div>
          )}
        </div>

      </div>
    </AppLayout>
  );
}
