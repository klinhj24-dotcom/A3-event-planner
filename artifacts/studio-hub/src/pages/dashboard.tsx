import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useGetDashboardStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Calendar, UserSquare2, AlertTriangle, ArrowUpRight, Activity, CreditCard, CheckCircle2, Mail, Copy, Check, ClipboardCheck, ChevronRight, X } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useQuery } from "@tanstack/react-query";

// ── Pending Charges sheet ────────────────────────────────────────────────────

function PendingChargesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: charges = [], isLoading } = useQuery<any[]>({
    queryKey: ["/pending-charges"],
    queryFn: async () => {
      const r = await fetch("/api/pending-charges", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch");
      return r.json();
    },
    enabled: open,
  });

  // Group by event
  const byEvent: Record<string, { eventTitle: string; startDate: string | null; items: any[] }> = {};
  for (const c of charges) {
    const key = String(c.eventId);
    if (!byEvent[key]) byEvent[key] = { eventTitle: c.eventTitle, startDate: c.startDate, items: [] };
    byEvent[key].items.push(c);
  }
  const groups = Object.values(byEvent);

  function ticketLabel(c: any) {
    if (c.isTwoDay) {
      if (c.ticketType === "day1") return `Day 1 only`;
      if (c.ticketType === "day2") return `Day 2 only`;
      return `Both days`;
    }
    return c.ticketCount ? `${c.ticketCount} ticket${c.ticketCount !== 1 ? "s" : ""}` : "—";
  }

  function priceLabel(c: any) {
    if (c.isTwoDay) {
      if (c.ticketType === "day1") return c.day1Price ? `$${c.day1Price}` : null;
      if (c.ticketType === "day2") return c.day2Price ? `$${c.day2Price}` : null;
      const total = (c.day1Price ?? 0) + (c.day2Price ?? 0);
      return total ? `$${total}` : null;
    }
    if (c.ticketPrice && c.ticketCount) return `$${(c.ticketPrice * c.ticketCount).toFixed(2)}`;
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={o => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col overflow-hidden">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/30 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-rose-400" />
              <SheetTitle className="font-display text-xl">Pending Card Charges</SheetTitle>
              {!isLoading && (
                <span className="bg-rose-500/15 text-rose-400 rounded-full px-2.5 py-0.5 text-xs font-bold border border-rose-500/20">
                  {charges.length}
                </span>
              )}
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors rounded-lg p-1.5 hover:bg-white/5">
              <X className="h-4 w-4" />
            </button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
            </div>
          ) : charges.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center">
              <CreditCard className="h-10 w-10 mb-3 opacity-20" />
              <p>No pending charges.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/20">
              {groups.map((group, gi) => (
                <div key={gi}>
                  <div className="px-5 py-2.5 bg-rose-500/5 border-b border-rose-500/10 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{group.eventTitle}</p>
                      {group.startDate && (
                        <p className="text-xs text-muted-foreground">{format(new Date(group.startDate), "EEEE, MMMM d, yyyy")}</p>
                      )}
                    </div>
                    <span className="text-xs font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-full px-2 py-0.5">
                      {group.items.length} uncharged
                    </span>
                  </div>
                  {group.items.map((c: any) => {
                    const contactName = [c.contactFirstName, c.contactLastName].filter(Boolean).join(" ") || c.contactEmail || "—";
                    const studentName = [c.studentFirstName, c.studentLastName].filter(Boolean).join(" ");
                    const price = priceLabel(c);
                    return (
                      <div key={c.id} className="px-5 py-3.5 hover:bg-black/20 transition-colors flex items-center justify-between gap-3">
                        <div className="space-y-0.5 min-w-0">
                          <p className="font-medium text-foreground text-sm truncate">{contactName}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                            {studentName && <span className="truncate">for {studentName}</span>}
                            <span>{ticketLabel(c)}</span>
                            {c.createdAt && <span className="shrink-0">{format(new Date(c.createdAt), "MMM d")}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {price && (
                            <span className="text-sm font-bold text-rose-400">{price}</span>
                          )}
                          <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 border capitalize ${
                            c.status === "approved"
                              ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                              : c.status === "pending"
                              ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
                              : "text-muted-foreground bg-muted/20 border-border/30"
                          }`}>
                            {c.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border/30 shrink-0">
          <Link href="/charges" onClick={onClose} className="flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline">
            Go to full Charges page <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Pending Invites sheet ────────────────────────────────────────────────────

function PendingInvitesSheet({
  open,
  onClose,
  invites,
  total,
  copiedInviteId,
  onCopy,
}: {
  open: boolean;
  onClose: () => void;
  invites: any[];
  total: number;
  copiedInviteId: number | null;
  onCopy: (id: number, token: string) => void;
}) {
  // Group by event
  const byEvent: Record<string, { eventTitle: string; startDate: string | null; eventId: number; items: any[] }> = {};
  for (const inv of invites) {
    const key = String(inv.eventId);
    if (!byEvent[key]) byEvent[key] = { eventTitle: inv.eventTitle, startDate: inv.startDate, eventId: inv.eventId, items: [] };
    byEvent[key].items.push(inv);
  }
  const groups = Object.values(byEvent).sort((a, b) => {
    if (!a.startDate) return 1;
    if (!b.startDate) return -1;
    return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
  });

  return (
    <Sheet open={open} onOpenChange={o => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col overflow-hidden">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/30 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              <SheetTitle className="font-display text-xl">Pending Band Invitations</SheetTitle>
              <span className="bg-primary/15 text-primary rounded-full px-2.5 py-0.5 text-xs font-bold border border-primary/20">
                {total}
              </span>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors rounded-lg p-1.5 hover:bg-white/5">
              <X className="h-4 w-4" />
            </button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {invites.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center">
              <Mail className="h-10 w-10 mb-3 opacity-20" />
              <p>No pending invitations.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/20">
              {groups.map((group, gi) => (
                <div key={gi}>
                  <div className="px-5 py-2.5 bg-primary/5 border-b border-primary/10 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{group.eventTitle}</p>
                      {group.startDate && (
                        <p className="text-xs text-muted-foreground">{format(new Date(group.startDate), "EEEE, MMMM d, yyyy")}</p>
                      )}
                    </div>
                    <Link
                      href={`/events?open=${group.eventId}`}
                      onClick={onClose}
                      className="text-xs text-primary/60 hover:text-primary transition-colors flex items-center gap-0.5"
                    >
                      Open event <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </div>
                  {group.items.map((item: any, idx: number) => {
                    const displayName = item.memberName ?? item.contactName ?? item.bandName ?? "Unknown";
                    const rowKey = item.inviteId != null ? `inv-${item.inviteId}` : `slot-${item.slotId ?? idx}`;
                    const isCopied = item.inviteId != null && copiedInviteId === item.inviteId;
                    return (
                      <div key={rowKey} className="flex items-center justify-between px-5 py-3.5 hover:bg-black/20 transition-colors gap-3">
                        <div className="space-y-0.5 min-w-0">
                          <p className="font-medium text-foreground text-sm truncate">{displayName}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                            {item.memberName && item.contactName && (
                              <span className="text-muted-foreground/70">via {item.contactName}</span>
                            )}
                            {item.bandName && !item.memberName && !item.contactName && (
                              <span className="text-muted-foreground/70">{item.bandName}</span>
                            )}
                            {item.inviteStatus === "responding" && (
                              <span className="text-amber-400 font-medium">Responding</span>
                            )}
                          </div>
                        </div>
                        {item.token ? (
                          <button
                            onClick={() => onCopy(item.inviteId, item.token)}
                            title="Copy confirmation link"
                            className={`shrink-0 flex items-center gap-1.5 text-xs font-medium transition-colors rounded-lg px-2.5 py-1.5 border ${
                              isCopied
                                ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                                : "text-primary/70 bg-primary/5 border-primary/20 hover:text-primary hover:bg-primary/10"
                            }`}
                          >
                            {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            {isCopied ? "Copied!" : "Copy link"}
                          </button>
                        ) : (
                          <span className="shrink-0 text-xs text-muted-foreground/50 italic">Awaiting response</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border/30 shrink-0">
          <Link href="/events" onClick={onClose} className="flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline">
            Go to Events <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Dashboard page ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: stats, isLoading } = useGetDashboardStats();
  const [copiedInviteId, setCopiedInviteId] = useState<number | null>(null);
  const [chargesSheetOpen, setChargesSheetOpen] = useState(false);
  const [invitesSheetOpen, setInvitesSheetOpen] = useState(false);

  function copyInviteLink(inviteId: number, token: string | null) {
    if (!token) return;
    navigator.clipboard.writeText(`${window.location.origin}/band-confirm/${token}`);
    setCopiedInviteId(inviteId);
    setTimeout(() => setCopiedInviteId(null), 2000);
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div>
            <Skeleton className="h-10 w-48 mb-2" />
            <Skeleton className="h-5 w-64" />
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-96 rounded-2xl" />
            <Skeleton className="h-96 rounded-2xl" />
          </div>
        </div>
      </AppLayout>
    );
  }

  const statCards = [
    { title: "Total Contacts", value: stats?.totalContacts || 0, icon: Users, color: "text-[#7250ef]", bg: "bg-[#7250ef]/10", href: "/contacts" },
    { title: "Upcoming Events", value: stats?.upcomingEvents || 0, icon: Calendar, color: "text-[#00b199]", bg: "bg-[#00b199]/10", href: "/events" },
    { title: "Total Staff", value: stats?.totalEmployees || 0, icon: UserSquare2, color: "text-[#2e3bdb]", bg: "bg-[#2e3bdb]/10", href: "/employees" },
    { title: "Pending Card Charges", value: stats?.pendingCharges || 0, icon: CreditCard, color: "text-rose-400", bg: "bg-rose-500/10", href: "/charges" },
  ];

  const pendingInvitesList = (stats?.pendingInvitesList as any[]) ?? [];

  return (
    <AppLayout>
      <div className="space-y-8 pb-8">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Overview</h1>
          <p className="text-muted-foreground mt-1 text-lg">Here's what's happening at the studio today.</p>
        </div>

        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {statCards.map((stat, i) => {
            const card = (
              <Card key={i} className={`border-border/10 bg-card shadow-md shadow-black/10 hover:shadow-lg transition-all duration-300 rounded-2xl overflow-hidden group${stat.href ? " cursor-pointer" : ""}`}>
                <CardContent className="p-6 relative">
                  <div className="flex justify-between items-start">
                    <div className="space-y-2 z-10">
                      <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                      <p className="font-display text-4xl font-bold text-foreground tracking-tight">{stat.value}</p>
                      {i === 0 && (stats?.overdueContacts ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive bg-destructive/10 border border-destructive/20 rounded-full px-2 py-0.5">
                          <AlertTriangle className="h-3 w-3" />
                          {stats!.overdueContacts} overdue
                        </span>
                      )}
                    </div>
                    <div className={`p-3 rounded-xl ${stat.bg} ${stat.color} transition-transform group-hover:scale-110 duration-300`}>
                      <stat.icon className="h-6 w-6" />
                    </div>
                  </div>
                  <div className={`absolute -bottom-6 -right-6 w-24 h-24 rounded-full ${stat.bg} blur-2xl opacity-50 transition-opacity group-hover:opacity-100`} />
                </CardContent>
              </Card>
            );
            return stat.href
              ? <Link key={i} href={stat.href}>{card}</Link>
              : card;
          })}
        </div>

        {/* Pending Debriefs */}
        {(stats?.pendingDebriefs ?? 0) > 0 && (
          <Card className="rounded-2xl shadow-md border-[#00b199]/20 overflow-hidden flex flex-col bg-card">
            <CardHeader className="flex flex-row items-center justify-between bg-[#00b199]/5 border-b border-[#00b199]/15 pb-4">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-[#00b199]" />
                <CardTitle className="font-display text-xl">Pending Debrief{(stats?.pendingDebriefs ?? 0) > 1 ? "s" : ""}</CardTitle>
                <span className="bg-[#00b199]/15 text-[#00b199] rounded-full px-2.5 py-0.5 text-xs font-bold border border-[#00b199]/20">{stats?.pendingDebriefs}</span>
              </div>
              <Link href="/events" className="text-sm font-medium text-[#00b199] hover:underline inline-flex items-center">
                View events <ArrowUpRight className="h-4 w-4 ml-1" />
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {stats?.pendingDebriefsList && (stats.pendingDebriefsList as any[]).length > 0 ? (
                <div className="divide-y divide-border/20">
                  {(stats.pendingDebriefsList as any[]).map((item: any) => (
                    <Link key={item.eventId} href={`/events?open=${item.eventId}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-black/20 transition-colors group cursor-pointer">
                      <div className="space-y-0.5">
                        <p className="font-medium text-foreground text-sm group-hover:text-[#00b199] transition-colors">{item.eventTitle}</p>
                        {item.endDate && (
                          <p className="text-xs text-muted-foreground">Ends {format(new Date(item.endDate), "MMM d 'at' h:mm a")}</p>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-[#00b199] bg-[#00b199]/10 border border-[#00b199]/20 rounded-full px-2.5 py-0.5">
                        Debrief due
                      </span>
                    </Link>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {/* Recent Debriefs */}
        {(stats?.recentDebriefsList as any[])?.length > 0 && (
          <Card className="rounded-2xl shadow-md border-violet-500/20 overflow-hidden flex flex-col bg-card">
            <CardHeader className="flex flex-row items-center justify-between bg-violet-500/5 border-b border-violet-500/15 pb-4">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-violet-400" />
                <CardTitle className="font-display text-xl">Recent Debriefs</CardTitle>
                <span className="bg-violet-500/15 text-violet-400 rounded-full px-2.5 py-0.5 text-xs font-bold border border-violet-500/20">{(stats?.recentDebriefsList as any[]).length}</span>
              </div>
              <Link href="/events" className="text-sm font-medium text-violet-400 hover:underline inline-flex items-center">
                All events <ArrowUpRight className="h-4 w-4 ml-1" />
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/20">
                {(stats!.recentDebriefsList as any[]).map((item: any) => (
                  <Link key={item.eventId} href={`/events?open=${item.eventId}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-black/20 transition-colors group cursor-pointer">
                    <div className="space-y-0.5">
                      <p className="font-medium text-foreground text-sm group-hover:text-violet-400 transition-colors">{item.eventTitle}</p>
                      {item.ownerName && <p className="text-xs text-muted-foreground">Submitted by {item.ownerName}</p>}
                    </div>
                    {item.submittedAt && (
                      <span className="text-xs text-muted-foreground shrink-0 ml-4">{format(new Date(item.submittedAt), "MMM d")}</span>
                    )}
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pending Card Charges panel */}
        {(stats?.pendingCharges ?? 0) > 0 && (
          <Card className="rounded-2xl shadow-md border-rose-500/20 overflow-hidden flex flex-col bg-card">
            <CardHeader className="flex flex-row items-center justify-between bg-rose-500/5 border-b border-rose-500/15 pb-4">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-rose-400" />
                <CardTitle className="font-display text-xl">Pending Card Charges</CardTitle>
                <span className="bg-rose-500/15 text-rose-400 rounded-full px-2.5 py-0.5 text-xs font-bold border border-rose-500/20">{stats?.pendingCharges}</span>
              </div>
              <button
                onClick={() => setChargesSheetOpen(true)}
                className="text-sm font-medium text-rose-400 hover:underline inline-flex items-center gap-0.5 transition-colors"
              >
                View all <ArrowUpRight className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="p-0">
              {stats?.pendingChargesList && stats.pendingChargesList.length > 0 ? (
                <div className="divide-y divide-border/20">
                  {(stats.pendingChargesList as any[]).slice(0, 5).map((item: any) => (
                    <button
                      key={item.eventId}
                      onClick={() => setChargesSheetOpen(true)}
                      className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-black/20 transition-colors group cursor-pointer text-left"
                    >
                      <div className="space-y-0.5">
                        <p className="font-medium text-foreground text-sm group-hover:text-rose-400 transition-colors">{item.eventTitle}</p>
                        {item.startDate && (
                          <p className="text-xs text-muted-foreground">{format(new Date(item.startDate), "MMM d, yyyy")}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-full px-2.5 py-0.5">
                          {item.pendingCount} uncharged
                        </span>
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground/30 group-hover:text-rose-400 transition-colors" />
                      </div>
                    </button>
                  ))}
                  {(stats.pendingChargesList as any[]).length > 5 && (
                    <button
                      onClick={() => setChargesSheetOpen(true)}
                      className="w-full px-5 py-3 text-xs text-muted-foreground hover:text-rose-400 transition-colors text-center"
                    >
                      + {(stats.pendingChargesList as any[]).length - 5} more events
                    </button>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {/* Pending Band Invitations panel */}
        {(stats?.pendingInvites ?? 0) > 0 && (
          <Card className="rounded-2xl shadow-md border-primary/20 overflow-hidden flex flex-col bg-card">
            <CardHeader className="flex flex-row items-center justify-between bg-primary/5 border-b border-primary/15 pb-4">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                <CardTitle className="font-display text-xl">Pending Band Invitations</CardTitle>
                <span className="bg-primary/15 text-primary rounded-full px-2.5 py-0.5 text-xs font-bold border border-primary/20">{stats?.pendingInvites}</span>
              </div>
              <button
                onClick={() => setInvitesSheetOpen(true)}
                className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-0.5 transition-colors"
              >
                View all <ArrowUpRight className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="p-0">
              {pendingInvitesList.length > 0 ? (
                <div className="divide-y divide-border/20">
                  {pendingInvitesList.slice(0, 5).map((item: any, idx: number) => {
                    const displayName = item.memberName ?? item.contactName ?? item.bandName ?? "Unknown";
                    const rowKey = item.inviteId != null ? `inv-${item.inviteId}` : `slot-${item.slotId ?? idx}`;
                    const isCopied = item.inviteId != null && copiedInviteId === item.inviteId;
                    return (
                      <div key={rowKey} className="flex items-center justify-between px-5 py-3.5 hover:bg-black/20 transition-colors group">
                        <div className="space-y-0.5 min-w-0">
                          <p className="font-medium text-foreground text-sm group-hover:text-primary transition-colors truncate">{displayName}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                            {item.memberName && item.contactName && (
                              <span className="text-muted-foreground/70">via {item.contactName}</span>
                            )}
                            {item.bandName && !item.memberName && !item.contactName && (
                              <span className="text-muted-foreground/70">{item.bandName}</span>
                            )}
                            <span className="truncate">{item.eventTitle}</span>
                            {item.startDate && (
                              <span className="shrink-0">{format(new Date(item.startDate), "MMM d")}</span>
                            )}
                          </div>
                        </div>
                        {item.token ? (
                          <button
                            onClick={() => copyInviteLink(item.inviteId, item.token)}
                            title="Copy confirmation link"
                            className={`shrink-0 ml-3 flex items-center gap-1.5 text-xs font-medium transition-colors rounded-lg px-2.5 py-1.5 border ${
                              isCopied
                                ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                                : "text-primary/70 bg-primary/5 border-primary/20 hover:text-primary hover:bg-primary/10"
                            }`}
                          >
                            {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            {isCopied ? "Copied!" : "Copy link"}
                          </button>
                        ) : (
                          <span className="shrink-0 ml-3 text-xs text-muted-foreground/50 italic">Awaiting response</span>
                        )}
                      </div>
                    );
                  })}
                  {pendingInvitesList.length > 5 && (
                    <button
                      onClick={() => setInvitesSheetOpen(true)}
                      className="w-full px-5 py-3 text-xs text-muted-foreground hover:text-primary transition-colors text-center"
                    >
                      + {pendingInvitesList.length - 5} more — view all
                    </button>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* Upcoming Events */}
          <Card className="rounded-2xl shadow-md border-border/20 overflow-hidden flex flex-col bg-card">
            <CardHeader className="flex flex-row items-center justify-between bg-black/20 border-b border-border/20 pb-4">
              <div>
                <CardTitle className="font-display text-xl">Upcoming Events</CardTitle>
              </div>
              <Link href="/events" className="text-sm font-medium text-primary hover:underline inline-flex items-center">
                View all <ArrowUpRight className="h-4 w-4 ml-1" />
              </Link>
            </CardHeader>
            <CardContent className="p-0 flex-1">
              {stats?.upcomingEventsList && stats.upcomingEventsList.length > 0 ? (
                <div className="divide-y divide-border/20">
                  {stats.upcomingEventsList.slice(0, 5).map(event => (
                    <Link key={event.id} href={`/events?open=${event.id}`} className="p-5 hover:bg-black/20 transition-colors flex items-center justify-between group cursor-pointer">
                      <div className="space-y-1">
                        <p className="font-semibold text-foreground group-hover:text-primary transition-colors">{event.title}</p>
                        <div className="flex items-center text-sm text-muted-foreground gap-3">
                          <span className="flex items-center"><Calendar className="h-3.5 w-3.5 mr-1.5 opacity-70" /> {event.startDate ? format(new Date(event.startDate), "MMM d, yyyy") : "TBD"}</span>
                          <span className="capitalize">{event.type.replace('_', ' ')}</span>
                        </div>
                      </div>
                      <Badge variant="secondary" className="capitalize bg-secondary/20 text-secondary">{event.status}</Badge>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Calendar className="h-10 w-10 mb-3 opacity-20" />
                  <p>No upcoming events scheduled.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Outreach */}
          <Card className="rounded-2xl shadow-md border-border/20 overflow-hidden flex flex-col bg-card">
            <CardHeader className="flex flex-row items-center justify-between bg-black/20 border-b border-border/20 pb-4">
              <div>
                <CardTitle className="font-display text-xl">Recent Outreach</CardTitle>
              </div>
              <Link href="/contacts" className="text-sm font-medium text-primary hover:underline inline-flex items-center">
                Contacts <ArrowUpRight className="h-4 w-4 ml-1" />
              </Link>
            </CardHeader>
            <CardContent className="p-0 flex-1">
              {stats?.recentOutreach && stats.recentOutreach.length > 0 ? (
                <div className="divide-y divide-border/20">
                  {stats.recentOutreach.slice(0, 5).map(outreach => (
                    <div key={outreach.id} className="p-5 hover:bg-black/20 transition-colors flex gap-4 items-start">
                      <div className="p-2 rounded-full bg-primary/10 text-primary mt-0.5">
                        <Activity className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Contact #{outreach.contactId} via <span className="capitalize text-primary">{outreach.method}</span>
                        </p>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{outreach.notes || "No notes provided."}</p>
                        <p className="text-xs text-muted-foreground/70 mt-2 font-medium">
                          {format(new Date(outreach.outreachAt), "MMM d, h:mm a")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Activity className="h-10 w-10 mb-3 opacity-20" />
                  <p>No recent outreach activity.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Pop-out sheets */}
      <PendingChargesSheet open={chargesSheetOpen} onClose={() => setChargesSheetOpen(false)} />
      <PendingInvitesSheet
        open={invitesSheetOpen}
        onClose={() => setInvitesSheetOpen(false)}
        invites={pendingInvitesList}
        total={stats?.pendingInvites ?? 0}
        copiedInviteId={copiedInviteId}
        onCopy={copyInviteLink}
      />
    </AppLayout>
  );
}
