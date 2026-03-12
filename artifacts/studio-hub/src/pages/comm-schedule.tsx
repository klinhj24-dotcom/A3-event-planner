import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Loader2, Search, CalendarDays, Radio, Mail, Instagram, Printer, Globe } from "lucide-react";
import { useCommRules, type CommRule } from "@/hooks/use-team";
import { useAuth } from "@workspace/replit-auth-web";

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  "Email": <Mail className="h-3.5 w-3.5" />,
  "Email to Past Clients": <Mail className="h-3.5 w-3.5" />,
  "Email to Enrolled Students": <Mail className="h-3.5 w-3.5" />,
  "Email to Enrolled Clients": <Mail className="h-3.5 w-3.5" />,
  "Instagram Post": <Instagram className="h-3.5 w-3.5" />,
  "Instagram Story": <Instagram className="h-3.5 w-3.5" />,
  "Print": <Printer className="h-3.5 w-3.5" />,
  "Website": <Globe className="h-3.5 w-3.5" />,
};

const COMM_TYPE_COLORS: Record<string, string> = {
  "Email": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "Social Media": "bg-pink-500/10 text-pink-400 border-pink-500/20",
  "In-Studio": "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "Print": "bg-green-500/10 text-green-400 border-green-500/20",
  "Website": "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

function timingLabel(days: number) {
  if (days === 0) return "Day of event";
  if (days < 0) return `${Math.abs(days)} days before`;
  return `${days} days after`;
}

function TimingBadge({ days }: { days: number }) {
  const label = timingLabel(days);
  const cls = days < 0
    ? "bg-primary/10 text-primary border-primary/20"
    : days === 0
      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
      : "bg-muted/60 text-muted-foreground border-border/50";
  return (
    <Badge variant="outline" className={`text-xs font-medium rounded-lg ${cls}`}>
      {label}
    </Badge>
  );
}

const EVENT_TYPES = [
  "All",
  "Festival / Community Event",
  "Open Mic",
  "Recital",
  "Songwriter Showcase / Studio Show",
  "Student Band Show",
  "Studio Jam Night",
  "Studio Open House",
  "Studio Party",
  "Rockin' Toddlers",
  "Chamber Ensemble",
  "Enrichment Club",
  "Workshop",
  "Instrument Demo (Waldorf)",
  "Instrument Demo (library)",
  "Little Rockers (library)",
  "Holiday Closure",
  "Holiday",
];

export default function CommSchedule() {
  const { data: rules = [], isLoading } = useCommRules();
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState("All");
  const { user } = useAuth();
  const isAdmin = (user as any)?.role === "admin";

  const filtered = rules.filter(r => {
    const matchType = selectedType === "All" || r.eventType === selectedType;
    const matchSearch = !search || 
      r.eventType.toLowerCase().includes(search.toLowerCase()) ||
      (r.messageName?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (r.channel?.toLowerCase().includes(search.toLowerCase()) ?? false);
    return matchType && matchSearch;
  });

  // Group by event type
  const grouped = filtered.reduce<Record<string, CommRule[]>>((acc, rule) => {
    if (!acc[rule.eventType]) acc[rule.eventType] = [];
    acc[rule.eventType].push(rule);
    return acc;
  }, {});

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight flex items-center gap-3">
              <Radio className="h-8 w-8 text-primary" /> Communications Schedule
            </h1>
            <p className="text-muted-foreground mt-1">
              {rules.length} communication rules across {new Set(rules.map(r => r.eventType)).size} event types.
            </p>
          </div>
          <Badge variant="outline" className="text-xs rounded-lg border-primary/30 text-primary bg-primary/5 px-3 py-1.5">
            <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
            Comms calendar-ready
          </Badge>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search rules..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl border-border/60 bg-background h-9 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {["All", "Email", "Social Media", "Recital", "Open Mic"].map(f => (
              <Button
                key={f}
                variant={selectedType === f ? "default" : "outline"}
                size="sm"
                className="rounded-xl h-9 text-xs"
                onClick={() => setSelectedType(f === selectedType && f !== "All" ? "All" : f)}
              >
                {f}
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center py-16 bg-muted/20 rounded-2xl border border-border/50 border-dashed">
            <Radio className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground">No rules match your search.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([eventType, typeRules]) => (
              <div key={eventType} className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
                <div className="flex items-center justify-between p-4 border-b border-border/50 bg-muted/10">
                  <div className="flex items-center gap-3">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    <h2 className="font-semibold text-foreground">{eventType}</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    {typeRules[0]?.eventTagGroup && (
                      <Badge variant="outline" className="text-xs rounded-lg text-muted-foreground">
                        [{typeRules[0].eventTagGroup}]
                      </Badge>
                    )}
                    {typeRules[0]?.eventTag && (
                      <Badge variant="outline" className="text-xs rounded-lg text-muted-foreground">
                        [{typeRules[0].eventTag}]
                      </Badge>
                    )}
                    <Badge className="text-xs rounded-lg bg-primary/10 text-primary border-0">
                      {typeRules.length} {typeRules.length === 1 ? "task" : "tasks"}
                    </Badge>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/20">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs font-semibold">Timing</TableHead>
                        <TableHead className="text-xs font-semibold">Type</TableHead>
                        <TableHead className="text-xs font-semibold">Message / Purpose</TableHead>
                        <TableHead className="text-xs font-semibold">Channel</TableHead>
                        <TableHead className="text-xs font-semibold">Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {typeRules
                        .sort((a, b) => a.timingDays - b.timingDays)
                        .map((rule) => (
                          <TableRow key={rule.id} className="text-sm">
                            <TableCell className="py-3">
                              <TimingBadge days={rule.timingDays} />
                            </TableCell>
                            <TableCell className="py-3">
                              <Badge
                                variant="outline"
                                className={`text-xs rounded-lg ${COMM_TYPE_COLORS[rule.commType] || "bg-muted/40 text-muted-foreground border-border/50"}`}
                              >
                                {rule.commType}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-3 font-medium text-foreground/90">
                              {rule.messageName || <span className="text-muted-foreground italic">—</span>}
                            </TableCell>
                            <TableCell className="py-3">
                              {rule.channel ? (
                                <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                                  {CHANNEL_ICONS[rule.channel]}
                                  <span>{rule.channel}</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground/40 text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell className="py-3 text-xs text-muted-foreground max-w-xs">
                              {rule.notes || <span className="opacity-40">—</span>}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
