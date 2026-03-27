import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useGetDashboardStats } from "@workspace/api-client-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Calendar, UserSquare2, ClipboardList, ArrowUpRight, Activity, AlertTriangle, CreditCard, CheckCircle2, Mail, Copy, Check, ClipboardCheck, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const { data: stats, isLoading } = useGetDashboardStats();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [copiedInviteId, setCopiedInviteId] = useState<number | null>(null);
  const [chargingId, setChargingId] = useState<number | null>(null);

  const { mutate: markCharged } = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/ticket-requests/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ charged: true }),
      });
      if (!res.ok) throw new Error("Failed to mark as charged");
      return res.json();
    },
    onMutate: (id) => setChargingId(id),
    onSuccess: () => {
      setChargingId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Marked as charged" });
    },
    onError: () => {
      setChargingId(null);
      toast({ title: "Failed to mark as charged", variant: "destructive" });
    },
  });

  function copyInviteLink(inviteId: number, token: string | null) {
    if (!token) return;
    navigator.clipboard.writeText(`${window.location.origin}/band-confirm/${token}`);
    setCopiedInviteId(inviteId);
    setTimeout(() => setCopiedInviteId(null), 2000);
  }

  function firstWord(name: string | null | undefined): string {
    if (!name) return "Link";
    return name.trim().split(/\s+/)[0];
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

  // Use brand colors for stat cards
  const statCards = [
    { title: "Total Contacts", value: stats?.totalContacts || 0, icon: Users, color: "text-[#7250ef]", bg: "bg-[#7250ef]/10", href: "/contacts" },
    { title: "Upcoming Events", value: stats?.upcomingEvents || 0, icon: Calendar, color: "text-[#00b199]", bg: "bg-[#00b199]/10", href: "/events" },
    { title: "Total Staff", value: stats?.totalEmployees || 0, icon: UserSquare2, color: "text-[#2e3bdb]", bg: "bg-[#2e3bdb]/10", href: "/employees" },
    { title: "Pending Card Charges", value: stats?.pendingCharges || 0, icon: CreditCard, color: "text-rose-400", bg: "bg-rose-500/10", href: "/charges" },
  ];

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

        {/* Pending Debriefs — only shown to the debrief owner when their event is ending */}
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

        {/* Recent Debriefs — shows across all staff */}
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
                {(stats.recentDebriefsList as any[]).map((item: any) => (
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

        {/* Pending Card Charges panel — only show when there are pending charges */}
        {(stats?.pendingCharges ?? 0) > 0 && (
          <Card className="rounded-2xl shadow-md border-rose-500/20 overflow-hidden flex flex-col bg-card">
            <CardHeader className="flex flex-row items-center justify-between bg-rose-500/5 border-b border-rose-500/15 pb-4">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-rose-400" />
                <CardTitle className="font-display text-xl">Pending Card Charges</CardTitle>
                <span className="bg-rose-500/15 text-rose-400 rounded-full px-2.5 py-0.5 text-xs font-bold border border-rose-500/20">{stats?.pendingCharges}</span>
              </div>
              <Link href="/charges" className="text-sm font-medium text-primary hover:underline inline-flex items-center">
                View all <ArrowUpRight className="h-4 w-4 ml-1" />
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {stats?.pendingChargesList && stats.pendingChargesList.length > 0 ? (
                <div className="divide-y divide-border/20">
                  {stats.pendingChargesList.map((item: any) => {
                    const isRecital = item.formType === "recital" && item.studentFirstName;
                    const personName = isRecital
                      ? `${item.studentFirstName ?? ""} ${item.studentLastName ?? ""}`.trim()
                      : `${item.contactFirstName ?? ""} ${item.contactLastName ?? ""}`.trim();
                    const isLoading = chargingId === item.id;
                    return (
                      <div key={item.id} className="flex items-center justify-between px-5 py-3 hover:bg-black/20 transition-colors group">
                        <Link href="/charges" className="flex-1 min-w-0 space-y-0.5 cursor-pointer">
                          <p className="font-medium text-foreground text-sm group-hover:text-primary transition-colors truncate">{personName}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.eventTitle}{item.startDate ? ` · ${format(new Date(item.startDate), "MMM d")}` : ""}</p>
                        </Link>
                        <button
                          onClick={() => markCharged(item.id)}
                          disabled={isLoading}
                          title="Mark as charged"
                          className="shrink-0 ml-3 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/50 disabled:opacity-50 transition-colors"
                        >
                          {isLoading
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Charged
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {/* Pending Band Invitations panel — only show when there are unconfirmed slots */}
        {(stats?.pendingInvites ?? 0) > 0 && (
          <Card className="rounded-2xl shadow-md border-primary/20 overflow-hidden flex flex-col bg-card">
            <CardHeader className="flex flex-row items-center justify-between bg-primary/5 border-b border-primary/15 pb-4">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                <CardTitle className="font-display text-xl">Pending Band Invitations</CardTitle>
                <span className="bg-primary/15 text-primary rounded-full px-2.5 py-0.5 text-xs font-bold border border-primary/20">{stats?.pendingInvites}</span>
              </div>
              <Link href="/events" className="text-sm font-medium text-primary hover:underline inline-flex items-center">
                View events <ArrowUpRight className="h-4 w-4 ml-1" />
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {stats?.pendingInvitesList && stats.pendingInvitesList.length > 0 ? (
                <div className="divide-y divide-border/20">
                  {(stats.pendingInvitesList as any[]).map((item: any, idx: number) => {
                    const displayName = item.memberName ?? item.contactName ?? item.bandName ?? "Unknown";
                    const rowKey = item.inviteId != null ? `inv-${item.inviteId}` : `slot-${item.slotId ?? idx}`;
                    const isCopied = item.inviteId != null && copiedInviteId === item.inviteId;
                    return (
                      <div key={rowKey} className="flex items-center justify-between px-5 py-3.5 hover:bg-black/20 transition-colors group">
                        <div className="space-y-0.5 min-w-0">
                          <p className="font-medium text-foreground text-sm group-hover:text-primary transition-colors truncate">{displayName}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                            {item.memberName && (item.links?.length > 0 || item.contactName) && (
                              <span className="text-muted-foreground/70">
                                via {item.links && item.links.length > 1
                                  ? (item.links as any[]).map((l: any) => firstWord(l.contactName)).filter(Boolean).join(" & ")
                                  : item.contactName}
                              </span>
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
                        {item.links && item.links.length > 0 ? (
                          <div className="shrink-0 ml-3 flex items-center gap-1.5">
                            {(item.links as any[]).filter((l: any) => l.token).map((link: any) => {
                              const isLinkCopied = copiedInviteId === link.inviteId;
                              const showName = item.links.length > 1;
                              return (
                                <button
                                  key={link.inviteId}
                                  onClick={() => copyInviteLink(link.inviteId, link.token)}
                                  title={`Copy confirmation link${showName && link.contactName ? ` for ${link.contactName}` : ""}`}
                                  className={`flex items-center gap-1.5 text-xs font-medium transition-colors rounded-lg px-2.5 py-1.5 border ${
                                    isLinkCopied
                                      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                                      : "text-primary/70 bg-primary/5 border-primary/20 hover:text-primary hover:bg-primary/10"
                                  }`}
                                >
                                  {isLinkCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                  {isLinkCopied ? "Copied!" : showName ? firstWord(link.contactName) : "Copy link"}
                                </button>
                              );
                            })}
                          </div>
                        ) : item.token ? (
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
    </AppLayout>
  );
}
