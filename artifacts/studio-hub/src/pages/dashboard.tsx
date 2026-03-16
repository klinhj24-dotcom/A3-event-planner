import { AppLayout } from "@/components/layout";
import { useGetDashboardStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Calendar, UserSquare2, ClipboardList, ArrowUpRight, Activity, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { data: stats, isLoading } = useGetDashboardStats();

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
    { title: "Pending Signups", value: stats?.pendingSignups || 0, icon: ClipboardList, color: "text-[#f7b617]", bg: "bg-[#f7b617]/10" },
  ];

  return (
    <AppLayout>
      <div className="space-y-8 pb-8">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Overview</h1>
          <p className="text-muted-foreground mt-1 text-lg">Here's what's happening at the studio today.</p>
        </div>

        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
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
