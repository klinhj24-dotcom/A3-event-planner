import { useMemo } from "react";
import { AppLayout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { BarChart2, TrendingUp, Calendar, DollarSign, Users, Download } from "lucide-react";
import { useListEvents } from "@workspace/api-client-react";

function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const { data: currentUser } = useQuery<any>({
    queryKey: ["/api/auth/user"],
    queryFn: async () => { const r = await fetch("/api/auth/user", { credentials: "include" }); const d = await r.json(); return d.user; },
  });
  const canViewFinances = currentUser?.canViewFinances === true || currentUser?.email === "justin@themusicspace.com";

  const { data: events = [] } = useListEvents();

  const now = new Date();
  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(now, 5 - i);
    return { label: format(d, "MMM yyyy"), start: startOfMonth(d), end: endOfMonth(d) };
  });

  const monthlyStats = useMemo(() => {
    return last6Months.map(({ label, start, end }) => {
      const monthEvents = (events as any[]).filter(e => {
        if (!e.startDate) return false;
        const d = parseISO(e.startDate);
        return d >= start && d <= end;
      });
      const revenue = monthEvents.reduce((sum, e) => sum + ((e as any).internalTicketTotal ?? (e.revenue ? parseFloat(e.revenue) : 0)), 0);
      const cost = monthEvents.reduce((sum, e) => sum + (e.cost ? parseFloat(e.cost) : 0), 0);
      const leads = monthEvents.filter(e => e.isLeadGenerating).length;
      const byType: Record<string, number> = {};
      monthEvents.forEach(e => { byType[e.type] = (byType[e.type] ?? 0) + 1; });
      return { label, count: monthEvents.length, revenue, cost, net: revenue - cost, leads, byType };
    });
  }, [events, last6Months]);

  const totals = useMemo(() => {
    const past = (events as any[]).filter(e => e.startDate && parseISO(e.startDate) <= now);
    const totalRevenue = past.reduce((sum, e) => sum + ((e as any).internalTicketTotal ?? (e.revenue ? parseFloat(e.revenue) : 0)), 0);
    const totalCost = past.reduce((sum, e) => sum + (e.cost ? parseFloat(e.cost) : 0), 0);
    const leadEvents = past.filter(e => e.isLeadGenerating).length;
    const typeBreakdown: Record<string, number> = {};
    past.forEach(e => { typeBreakdown[e.type] = (typeBreakdown[e.type] ?? 0) + 1; });
    return { totalEvents: past.length, totalRevenue, totalCost, net: totalRevenue - totalCost, leadEvents, typeBreakdown };
  }, [events]);

  const maxCount = Math.max(...monthlyStats.map(m => m.count), 1);
  const maxRevenue = Math.max(...monthlyStats.map(m => m.revenue), 1);

  function exportEventsCSV() {
    const headers = ["Title", "Type", "Status", "Start Date", "End Date", "Location", "Is Paid", canViewFinances && "Revenue", canViewFinances && "Cost", canViewFinances && "Net", "Lead Generating", "Has Debrief"].filter(Boolean) as string[];
    const rows = [headers, ...(events as any[]).map(e => [
      e.title,
      e.type,
      e.status,
      e.startDate ? format(parseISO(e.startDate), "yyyy-MM-dd") : "",
      e.endDate ? format(parseISO(e.endDate), "yyyy-MM-dd") : "",
      e.location ?? "",
      e.isPaid ? "Yes" : "No",
      ...(canViewFinances ? [
        ((e as any).internalTicketTotal ?? (e.revenue ? parseFloat(e.revenue) : 0)).toFixed(2),
        e.cost ?? "0",
        (((e as any).internalTicketTotal ?? (e.revenue ? parseFloat(e.revenue) : 0)) - (parseFloat(e.cost ?? "0"))).toFixed(2),
      ] : []),
      e.isLeadGenerating ? "Yes" : "No",
      e.hasDebrief ? "Yes" : "No",
    ])];
    downloadCSV(`events-${format(now, "yyyy-MM-dd")}.csv`, rows);
  }

  const typeColors: Record<string, string> = {
    Recital: "bg-primary/80",
    "Corporate Event": "bg-sky-500/80",
    "Community Event": "bg-emerald-500/80",
    Festival: "bg-amber-500/80",
    Workshop: "bg-violet-500/80",
    "Private Party": "bg-rose-500/80",
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BarChart2 className="h-6 w-6 text-primary" /> Reports
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">Historical event and performance data</p>
          </div>
          <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={exportEventsCSV}>
            <Download className="h-4 w-4" /> Export Events CSV
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="rounded-2xl border-border/50 bg-card shadow-sm">
            <CardContent className="p-5 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Events</p>
              <p className="text-3xl font-bold text-foreground">{totals.totalEvents}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-border/50 bg-card shadow-sm">
            <CardContent className="p-5 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Lead Events</p>
              <p className="text-3xl font-bold text-violet-400">{totals.leadEvents}</p>
            </CardContent>
          </Card>
          {canViewFinances && (
            <>
              <Card className="rounded-2xl border-border/50 bg-card shadow-sm">
                <CardContent className="p-5 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Revenue</p>
                  <p className="text-3xl font-bold text-emerald-500">${totals.totalRevenue.toFixed(0)}</p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-border/50 bg-card shadow-sm">
                <CardContent className="p-5 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Net (rev - cost)</p>
                  <p className={`text-3xl font-bold ${totals.net >= 0 ? "text-emerald-500" : "text-blue-400"}`}>
                    {totals.net >= 0 ? "+" : ""}${totals.net.toFixed(0)}
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Events per month bar chart */}
        <Card className="rounded-2xl border-border/50 bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" /> Events per Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3 h-40">
              {monthlyStats.map((m, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  <span className="text-xs font-semibold text-foreground">{m.count > 0 ? m.count : ""}</span>
                  <div className="w-full flex flex-col justify-end" style={{ height: "112px" }}>
                    <div
                      className="w-full bg-primary/70 rounded-t-lg transition-all"
                      style={{ height: `${Math.round((m.count / maxCount) * 112)}px`, minHeight: m.count > 0 ? "4px" : "0" }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground text-center leading-tight">{m.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Revenue note */}
        {canViewFinances && (
          <div className="flex gap-2 items-start rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-amber-300 text-sm">
            <span className="shrink-0 font-bold mt-0.5">!</span>
            <span>Revenue is calculated automatically from charged ticket requests (quantity × ticket price). Cost is still entered manually on each event — keep that field up to date for accurate net figures.</span>
          </div>
        )}

        {/* Revenue chart — gated */}
        {canViewFinances && (
          <Card className="rounded-2xl border-border/50 bg-card shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-500" /> Revenue per Month
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-3 h-40">
                {monthlyStats.map((m, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-emerald-500">{m.revenue > 0 ? `$${m.revenue.toFixed(0)}` : ""}</span>
                    <div className="w-full flex flex-col justify-end" style={{ height: "112px" }}>
                      <div
                        className="w-full bg-emerald-500/60 rounded-t-lg transition-all"
                        style={{ height: `${Math.round((m.revenue / maxRevenue) * 112)}px`, minHeight: m.revenue > 0 ? "4px" : "0" }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground text-center leading-tight">{m.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Monthly breakdown table */}
        <Card className="rounded-2xl border-border/50 bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-violet-400" /> Monthly Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/30 text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="text-left px-5 py-3">Month</th>
                    <th className="text-right px-5 py-3">Events</th>
                    <th className="text-right px-5 py-3">Leads</th>
                    {canViewFinances && <th className="text-right px-5 py-3">Revenue</th>}
                    {canViewFinances && <th className="text-right px-5 py-3">Cost</th>}
                    {canViewFinances && <th className="text-right px-5 py-3">Net</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {monthlyStats.map((m, i) => (
                    <tr key={i} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3 font-medium">{m.label}</td>
                      <td className="px-5 py-3 text-right">{m.count}</td>
                      <td className="px-5 py-3 text-right text-violet-400">{m.leads || "—"}</td>
                      {canViewFinances && <td className="px-5 py-3 text-right text-emerald-500">{m.revenue > 0 ? `$${m.revenue.toFixed(2)}` : "—"}</td>}
                      {canViewFinances && <td className="px-5 py-3 text-right text-blue-400">{m.cost > 0 ? `$${m.cost.toFixed(2)}` : "—"}</td>}
                      {canViewFinances && (
                        <td className={`px-5 py-3 text-right font-semibold ${m.net >= 0 ? "text-emerald-500" : "text-blue-400"}`}>
                          {m.net !== 0 ? `${m.net >= 0 ? "+" : ""}$${m.net.toFixed(2)}` : "—"}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Event type breakdown */}
        <Card className="rounded-2xl border-border/50 bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-[#00b199]" /> Events by Type (All Time)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 pt-2">
            {Object.entries(totals.typeBreakdown).sort((a, b) => b[1] - a[1]).map(([type, cnt]) => (
              <div key={type} className="flex items-center gap-2 bg-muted/30 rounded-xl px-3 py-2 border border-border/30">
                <div className={`h-2.5 w-2.5 rounded-full ${typeColors[type] ?? "bg-muted-foreground/50"}`} />
                <span className="text-sm font-medium text-foreground">{type}</span>
                <Badge variant="secondary" className="text-xs rounded-full px-2">{cnt}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
