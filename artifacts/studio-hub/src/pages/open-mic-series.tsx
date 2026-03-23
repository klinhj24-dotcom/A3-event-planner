import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Plus, Mic, MapPin, Clock, Users, Mail, CheckCircle2, Send,
  FlaskConical, RefreshCw, Pencil, Save, X, ToggleLeft, ToggleRight, ExternalLink, Repeat,
} from "lucide-react";

const ORDINAL_OPTIONS = [
  { value: "first",  label: "1st" },
  { value: "second", label: "2nd" },
  { value: "third",  label: "3rd" },
  { value: "fourth", label: "4th" },
];

const WEEKDAY_OPTIONS = [
  { value: "sunday",    label: "Sunday" },
  { value: "monday",    label: "Monday" },
  { value: "tuesday",   label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday",  label: "Thursday" },
  { value: "friday",    label: "Friday" },
  { value: "saturday",  label: "Saturday" },
];

const ORDINAL_LABELS: Record<string, string> = { first: "1st", second: "2nd", third: "3rd", fourth: "4th" };

function parseRecurrenceType(val: string): { ordinal: string; day: string } {
  const parts = val.split("_");
  return { ordinal: parts[0] ?? "first", day: parts.slice(1).join("_") || "friday" };
}

function buildRecurrenceType(ordinal: string, day: string) { return `${ordinal}_${day}`; }

function recurrenceLabel(val: string) {
  const { ordinal, day } = parseRecurrenceType(val);
  const ord = ORDINAL_LABELS[ordinal] ?? ordinal;
  const dow = day.charAt(0).toUpperCase() + day.slice(1);
  return `${ord} ${dow} of the month`;
}

const BASE = "";

type Series = {
  id: number; name: string; location: string; address?: string; eventTime: string;
  slug: string; active: boolean; recurrenceType: string;
  saveTheDateTemplate?: string; performerReminderTemplate?: string; createdAt: string;
};
type EventRow = {
  id: number; title: string; startDate?: string; openMicMonth?: string;
  openMicSaveTheDateSent: boolean; openMicPerformerListSent: boolean;
  performerCount: number; performers: { id: number; name: string }[];
};
type Signup = {
  id: number; name: string; email: string; instrument: string;
  artistWebsite?: string; musicLink?: string; eventMonth?: string; createdAt: string;
};

const DEFAULT_SAVE_THE_DATE = `Hi everyone,

The Music Space Open Mic at {location} is coming up on {date} at {time}!

Whether you're performing or just coming to enjoy great live music — all are welcome.

Sign up to perform: {signup_url}

See you there!
The Music Space Team`;

const DEFAULT_PERFORMER_REMINDER = `Hi everyone,

The Music Space Open Mic is this Friday at {location}! Here's who's signed up to perform:

{performer_list}

Performance order is based on arrival time — show up early for a better spot. Doors at {time}.

See you Friday!
The Music Space Team`;

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function OpenMicSeriesPage() {
  const { toast } = useToast();
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [selected, setSelected] = useState<Series | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [sendingState, setSendingState] = useState<Record<string, boolean>>({});

  // New series form
  const [newName, setNewName] = useState("");
  const [newLocation, setNewLocation] = useState("CVP Towson");
  const [newTime, setNewTime] = useState("6:00 PM");
  const [newSlug, setNewSlug] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newRecurrenceOrdinal, setNewRecurrenceOrdinal] = useState("first");
  const [newRecurrenceDay, setNewRecurrenceDay] = useState("friday");

  // Edit form state (mirrors selected series)
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editRecurrenceOrdinal, setEditRecurrenceOrdinal] = useState("first");
  const [editRecurrenceDay, setEditRecurrenceDay] = useState("friday");
  const [editSaveTheDateTpl, setEditSaveTheDateTpl] = useState("");
  const [editPerformerTpl, setEditPerformerTpl] = useState("");

  async function apiFetch(path: string, opts?: RequestInit) {
    const r = await fetch(`${BASE}/api${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error ?? "Request failed"); }
    return r.json();
  }

  const loadSeries = useCallback(async () => {
    try {
      const data = await apiFetch("/open-mic/series");
      setSeriesList(data);
    } catch { toast({ title: "Failed to load series", variant: "destructive" }); }
  }, []);

  const loadSeriesDetail = useCallback(async (s: Series) => {
    setLoading(true);
    try {
      const [evData, sgData] = await Promise.all([
        apiFetch(`/open-mic/series/${s.id}/events`),
        apiFetch(`/open-mic/series/${s.id}/signups`),
      ]);
      setEvents(evData);
      setSignups(sgData);
    } catch { toast({ title: "Failed to load series details", variant: "destructive" }); }
    setLoading(false);
  }, []);

  useEffect(() => { loadSeries(); }, [loadSeries]);

  function selectSeries(s: Series) {
    setSelected(s);
    setEditMode(false);
    setEditName(s.name); setEditLocation(s.location); setEditTime(s.eventTime);
    const parsed = parseRecurrenceType(s.recurrenceType ?? "first_friday");
    setEditRecurrenceOrdinal(parsed.ordinal); setEditRecurrenceDay(parsed.day);
    setEditAddress(s.address ?? ""); setEditSaveTheDateTpl(s.saveTheDateTemplate ?? "");
    setEditPerformerTpl(s.performerReminderTemplate ?? "");
    loadSeriesDetail(s);
  }

  async function handleCreate() {
    if (!newName.trim() || !newSlug.trim()) { toast({ title: "Name and slug are required", variant: "destructive" }); return; }
    try {
      const data = await apiFetch("/open-mic/series", {
        method: "POST",
        body: JSON.stringify({ name: newName, location: newLocation, eventTime: newTime, slug: newSlug, address: newAddress, recurrenceType: buildRecurrenceType(newRecurrenceOrdinal, newRecurrenceDay) }),
      });
      toast({ title: `Series created — ${data.eventsCreated} event(s) auto-created` });
      setCreating(false); setNewName(""); setNewLocation("CVP Towson"); setNewTime("6:00 PM"); setNewSlug(""); setNewAddress(""); setNewRecurrenceOrdinal("first"); setNewRecurrenceDay("friday");
      await loadSeries();
      selectSeries(data.series);
    } catch (err: any) { toast({ title: err.message ?? "Failed to create series", variant: "destructive" }); }
  }

  async function handleSaveEdit() {
    if (!selected) return;
    try {
      const updated = await apiFetch(`/open-mic/series/${selected.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: editName, location: editLocation, eventTime: editTime,
          recurrenceType: buildRecurrenceType(editRecurrenceOrdinal, editRecurrenceDay),
          address: editAddress, saveTheDateTemplate: editSaveTheDateTpl || null,
          performerReminderTemplate: editPerformerTpl || null,
        }),
      });
      toast({ title: "Series updated" });
      setEditMode(false);
      await loadSeries();
      selectSeries(updated);
    } catch (err: any) { toast({ title: err.message ?? "Failed to update", variant: "destructive" }); }
  }

  async function handleToggleActive() {
    if (!selected) return;
    try {
      const updated = await apiFetch(`/open-mic/series/${selected.id}`, {
        method: "PUT", body: JSON.stringify({ active: !selected.active }),
      });
      toast({ title: updated.active ? "Series activated" : "Series paused" });
      await loadSeries();
      selectSeries(updated);
    } catch { toast({ title: "Failed to update", variant: "destructive" }); }
  }

  async function handleRegenerateEvents() {
    if (!selected) return;
    try {
      const data = await apiFetch(`/open-mic/series/${selected.id}/create-upcoming`, { method: "POST" });
      toast({ title: data.created > 0 ? `${data.created} new event(s) created` : "All upcoming events already exist" });
      await loadSeriesDetail(selected);
    } catch { toast({ title: "Failed to create events", variant: "destructive" }); }
  }

  async function sendEmail(eventId: number, type: "save-the-date" | "performer-list", isTest: boolean) {
    const key = `${eventId}-${type}-${isTest ? "test" : "send"}`;
    setSendingState(s => ({ ...s, [key]: true }));
    try {
      const data = await apiFetch(`/open-mic/events/${eventId}/send-${type}`, {
        method: "POST", body: JSON.stringify({ test: isTest }),
      });
      if (isTest) {
        toast({ title: `Test email sent to you (${data.sent} recipient)` });
      } else {
        toast({ title: `Email sent to ${data.sent} recipient(s)` });
        if (selected) await loadSeriesDetail(selected);
      }
    } catch (err: any) { toast({ title: err.message ?? "Send failed", variant: "destructive" }); }
    setSendingState(s => ({ ...s, [key]: false }));
  }

  function formatEventDate(ev: EventRow) {
    if (ev.startDate) {
      try { return format(new Date(ev.startDate), "EEE, MMM d, yyyy"); } catch {}
    }
    if (ev.openMicMonth) {
      const [y, m] = ev.openMicMonth.split("-");
      return `First Friday of ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m)-1]} ${y}`;
    }
    return ev.title;
  }

  function isPast(ev: EventRow) {
    if (!ev.startDate) return false;
    return new Date(ev.startDate) < new Date();
  }

  return (
    <AppLayout noPadding>
      <div className="flex flex-1 gap-0 overflow-hidden">

        {/* ── LEFT: Series list ─────────────────────────────────── */}
        <div className="w-72 shrink-0 border-r border-white/10 flex flex-col bg-[#111]">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mic className="h-4 w-4 text-[#7250ef]" />
              <span className="font-semibold text-sm">Open Mic Series</span>
            </div>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setCreating(true); setSelected(null); }}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {seriesList.map(s => (
              <button key={s.id} onClick={() => selectSeries(s)}
                className={`w-full text-left rounded-lg px-3 py-2.5 transition-colors ${selected?.id === s.id ? "bg-[#7250ef]/20 border border-[#7250ef]/30" : "hover:bg-white/5 border border-transparent"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{s.name}</span>
                  {!s.active && <Badge variant="outline" className="text-[10px] shrink-0 text-amber-400 border-amber-400/30">Paused</Badge>}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3 w-3 text-[#555]" />
                  <span className="text-xs text-[#888] truncate">{s.location}</span>
                </div>
              </button>
            ))}
            {seriesList.length === 0 && !creating && (
              <div className="text-center py-8 text-[#555] text-xs">No series yet.<br />Click + to create one.</div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Detail / Create ────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* NEW SERIES FORM */}
          {creating && (
            <div className="p-6 max-w-xl">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold">New Open Mic Series</h2>
                <Button variant="ghost" size="sm" onClick={() => setCreating(false)}><X className="h-4 w-4" /></Button>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[#888]">Series Name *</label>
                  <Input value={newName} onChange={e => { setNewName(e.target.value); setNewSlug(slugify(e.target.value)); }}
                    placeholder="CVP Towson Open Mic" className="bg-[#1a1a1a] border-white/10" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-[#888]">Location *</label>
                    <Input value={newLocation} onChange={e => setNewLocation(e.target.value)} placeholder="CVP Towson" className="bg-[#1a1a1a] border-white/10" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-[#888]">Time *</label>
                    <Input value={newTime} onChange={e => setNewTime(e.target.value)} placeholder="6:00 PM" className="bg-[#1a1a1a] border-white/10" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[#888]">Recurrence *</label>
                  <div className="flex gap-2">
                    <select value={newRecurrenceOrdinal} onChange={e => setNewRecurrenceOrdinal(e.target.value)}
                      className="w-24 rounded-md bg-[#1a1a1a] border border-white/10 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-[#7250ef]/50">
                      {ORDINAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <select value={newRecurrenceDay} onChange={e => setNewRecurrenceDay(e.target.value)}
                      className="flex-1 rounded-md bg-[#1a1a1a] border border-white/10 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-[#7250ef]/50">
                      {WEEKDAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <span className="flex items-center text-xs text-[#555] whitespace-nowrap">of the month</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[#888]">Address (optional)</label>
                  <Input value={newAddress} onChange={e => setNewAddress(e.target.value)} placeholder="123 Main St, Towson, MD" className="bg-[#1a1a1a] border-white/10" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[#888]">Public URL Slug *</label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#555] shrink-0">/open-mic/</span>
                    <Input value={newSlug} onChange={e => setNewSlug(slugify(e.target.value))} placeholder="cvp-towson" className="bg-[#1a1a1a] border-white/10" />
                  </div>
                  <p className="text-[11px] text-[#555]">Used for the public signup page URL</p>
                </div>
                <Button onClick={handleCreate} className="w-full bg-[#7250ef] hover:bg-[#5f3dd4]">
                  Create Series &amp; Auto-generate Events
                </Button>
              </div>
            </div>
          )}

          {/* SERIES DETAIL */}
          {selected && !creating && (
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  {editMode ? (
                    <Input value={editName} onChange={e => setEditName(e.target.value)}
                      className="text-2xl font-bold bg-transparent border-b border-white/20 rounded-none px-0 h-auto text-2xl mb-1" />
                  ) : (
                    <h1 className="text-2xl font-bold">{selected.name}</h1>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-sm text-[#888]">
                    <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />
                      {editMode ? <Input value={editLocation} onChange={e => setEditLocation(e.target.value)} className="h-6 text-sm bg-[#1a1a1a] border-white/10 w-40 px-2" /> : selected.location}
                    </span>
                    <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />
                      {editMode ? <Input value={editTime} onChange={e => setEditTime(e.target.value)} className="h-6 text-sm bg-[#1a1a1a] border-white/10 w-24 px-2" /> : selected.eventTime}
                    </span>
                    <span className="flex items-center gap-1"><Repeat className="h-3.5 w-3.5" />
                      {editMode ? (
                        <span className="flex items-center gap-1">
                          <select value={editRecurrenceOrdinal} onChange={e => setEditRecurrenceOrdinal(e.target.value)}
                            className="h-6 text-xs rounded bg-[#1a1a1a] border border-white/10 px-1 text-white outline-none">
                            {ORDINAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <select value={editRecurrenceDay} onChange={e => setEditRecurrenceDay(e.target.value)}
                            className="h-6 text-xs rounded bg-[#1a1a1a] border border-white/10 px-1 text-white outline-none">
                            {WEEKDAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </span>
                      ) : recurrenceLabel(selected.recurrenceType ?? "first_friday")}
                    </span>
                    <span className="text-[#555] text-xs">/open-mic/{selected.slug}
                      <a href={`/open-mic/${selected.slug}`} target="_blank" rel="noreferrer" className="ml-1 inline-block align-middle">
                        <ExternalLink className="h-3 w-3 text-[#7250ef]" />
                      </a>
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={handleToggleActive} className="flex items-center gap-1.5 text-xs text-[#888] hover:text-white transition-colors">
                    {selected.active
                      ? <><ToggleRight className="h-5 w-5 text-green-400" /><span className="text-green-400">Active</span></>
                      : <><ToggleLeft className="h-5 w-5 text-amber-400" /><span className="text-amber-400">Paused</span></>}
                  </button>
                  {editMode ? (
                    <>
                      <Button size="sm" onClick={handleSaveEdit} className="bg-[#7250ef] hover:bg-[#5f3dd4] h-8">
                        <Save className="h-3.5 w-3.5 mr-1.5" />Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditMode(false)} className="h-8">Cancel</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setEditMode(true)} className="h-8 border-white/10">
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit
                    </Button>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <Tabs defaultValue="events">
                <TabsList className="bg-[#1a1a1a] border border-white/10">
                  <TabsTrigger value="events">Events</TabsTrigger>
                  <TabsTrigger value="mailing-list">Mailing List ({signups.length})</TabsTrigger>
                  <TabsTrigger value="templates">Email Templates</TabsTrigger>
                </TabsList>

                {/* ── EVENTS TAB ── */}
                <TabsContent value="events" className="mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-[#888]">
                      Events auto-create 3 months ahead. Each has a 21-day save-the-date and 3-day performer reminder.
                    </p>
                    <Button size="sm" variant="outline" onClick={handleRegenerateEvents} className="shrink-0 border-white/10 h-8">
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Regenerate
                    </Button>
                  </div>
                  {loading ? (
                    <div className="text-center py-8 text-[#555] text-sm animate-pulse">Loading events…</div>
                  ) : (
                    <div className="rounded-xl border border-white/10 overflow-hidden">
                      <Table>
                        <TableHeader className="bg-[#1a1a1a]">
                          <TableRow className="hover:bg-transparent border-white/10">
                            <TableHead className="text-[#888] font-semibold text-xs">Date</TableHead>
                            <TableHead className="text-[#888] font-semibold text-xs">Performers</TableHead>
                            <TableHead className="text-[#888] font-semibold text-xs">21-Day Email</TableHead>
                            <TableHead className="text-[#888] font-semibold text-xs">3-Day Email</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {events.length === 0 && (
                            <TableRow><TableCell colSpan={4} className="text-center text-[#555] text-sm py-6">No events yet — click Regenerate.</TableCell></TableRow>
                          )}
                          {events.map(ev => {
                            const past = isPast(ev);
                            const saveDateSending = sendingState[`${ev.id}-save-the-date-send`];
                            const saveTestSending = sendingState[`${ev.id}-save-the-date-test`];
                            const perfSending = sendingState[`${ev.id}-performer-list-send`];
                            const perfTestSending = sendingState[`${ev.id}-performer-list-test`];
                            return (
                              <TableRow key={ev.id} className={`border-white/5 ${past ? "opacity-50" : ""}`}>
                                <TableCell className="font-medium text-sm">
                                  <Link href={`/events?open=${ev.id}`} className="hover:text-[#7250ef] transition-colors">
                                    {formatEventDate(ev)}
                                  </Link>
                                  {past && <span className="ml-2 text-[10px] text-[#555]">past</span>}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1.5">
                                    <Users className="h-3.5 w-3.5 text-[#555]" />
                                    <span className="text-sm">{ev.performerCount}</span>
                                    {ev.performers.length > 0 && (
                                      <span className="text-xs text-[#555] truncate max-w-[160px]">
                                        {ev.performers.map(p => p.name).join(", ")}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {ev.openMicSaveTheDateSent ? (
                                    <div className="flex items-center gap-1 text-green-400 text-xs">
                                      <CheckCircle2 className="h-3.5 w-3.5" />Sent
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1">
                                      <Button size="sm" variant="ghost"
                                        className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-400/10"
                                        disabled={saveTestSending}
                                        onClick={() => sendEmail(ev.id, "save-the-date", true)}
                                        title="Send test to yourself">
                                        <FlaskConical className="h-3 w-3 mr-1" />{saveTestSending ? "…" : "Test"}
                                      </Button>
                                      <Button size="sm" variant="ghost"
                                        className="h-7 px-2 text-xs text-[#7250ef] hover:text-[#7250ef] hover:bg-[#7250ef]/10"
                                        disabled={saveDateSending || past}
                                        onClick={() => sendEmail(ev.id, "save-the-date", false)}
                                        title="Send to full mailing list">
                                        <Send className="h-3 w-3 mr-1" />{saveDateSending ? "…" : "Send"}
                                      </Button>
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {ev.openMicPerformerListSent ? (
                                    <div className="flex items-center gap-1 text-green-400 text-xs">
                                      <CheckCircle2 className="h-3.5 w-3.5" />Sent
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1">
                                      <Button size="sm" variant="ghost"
                                        className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-400/10"
                                        disabled={perfTestSending}
                                        onClick={() => sendEmail(ev.id, "performer-list", true)}
                                        title="Send test to yourself">
                                        <FlaskConical className="h-3 w-3 mr-1" />{perfTestSending ? "…" : "Test"}
                                      </Button>
                                      <Button size="sm" variant="ghost"
                                        className="h-7 px-2 text-xs text-[#7250ef] hover:text-[#7250ef] hover:bg-[#7250ef]/10"
                                        disabled={perfSending || past}
                                        onClick={() => sendEmail(ev.id, "performer-list", false)}
                                        title="Send to full mailing list">
                                        <Send className="h-3 w-3 mr-1" />{perfSending ? "…" : "Send"}
                                      </Button>
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                {/* ── MAILING LIST TAB ── */}
                <TabsContent value="mailing-list" className="mt-4">
                  <p className="text-sm text-[#888] mb-3">
                    Everyone who has signed up for any event in this series. Both the 21-day save-the-date and the 3-day performer list go to this full list.
                  </p>
                  {loading ? (
                    <div className="text-center py-8 text-[#555] text-sm animate-pulse">Loading…</div>
                  ) : (
                    <div className="rounded-xl border border-white/10 overflow-hidden">
                      <Table>
                        <TableHeader className="bg-[#1a1a1a]">
                          <TableRow className="hover:bg-transparent border-white/10">
                            <TableHead className="text-[#888] font-semibold text-xs">Name</TableHead>
                            <TableHead className="text-[#888] font-semibold text-xs">Email</TableHead>
                            <TableHead className="text-[#888] font-semibold text-xs">Instrument</TableHead>
                            <TableHead className="text-[#888] font-semibold text-xs">Month</TableHead>
                            <TableHead className="text-[#888] font-semibold text-xs">Signed Up</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {signups.length === 0 && (
                            <TableRow><TableCell colSpan={5} className="text-center text-[#555] text-sm py-6">No signups yet.</TableCell></TableRow>
                          )}
                          {signups.map(s => (
                            <TableRow key={s.id} className="border-white/5">
                              <TableCell className="font-medium text-sm">{s.name}</TableCell>
                              <TableCell className="text-sm text-[#aaa]">{s.email}</TableCell>
                              <TableCell className="text-sm text-[#aaa]">{s.instrument}</TableCell>
                              <TableCell className="text-xs text-[#666]">{s.eventMonth ?? "—"}</TableCell>
                              <TableCell className="text-xs text-[#666]">
                                {s.createdAt ? format(new Date(s.createdAt), "MMM d, yyyy") : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                {/* ── EMAIL TEMPLATES TAB ── */}
                <TabsContent value="templates" className="mt-4 space-y-6 max-w-2xl">
                  <p className="text-sm text-[#888]">
                    Customize the email body for each type. Use <code className="text-[#7250ef] text-xs bg-[#7250ef]/10 px-1 rounded">{"{location}"}</code>{" "}
                    <code className="text-[#7250ef] text-xs bg-[#7250ef]/10 px-1 rounded">{"{date}"}</code>{" "}
                    <code className="text-[#7250ef] text-xs bg-[#7250ef]/10 px-1 rounded">{"{time}"}</code>{" "}
                    <code className="text-[#7250ef] text-xs bg-[#7250ef]/10 px-1 rounded">{"{signup_url}"}</code>{" "}
                    <code className="text-[#7250ef] text-xs bg-[#7250ef]/10 px-1 rounded">{"{performer_list}"}</code> as placeholders.
                  </p>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold">21-Day Save the Date</label>
                    <p className="text-xs text-[#555]">Sent to the full mailing list ~3 weeks before the event.</p>
                    <Textarea
                      value={editSaveTheDateTpl || DEFAULT_SAVE_THE_DATE}
                      onChange={e => setEditSaveTheDateTpl(e.target.value)}
                      rows={10} className="bg-[#1a1a1a] border-white/10 font-mono text-xs resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold">3-Day Performer Reminder</label>
                    <p className="text-xs text-[#555]">Sent to the full mailing list ~3 days before with the performer list.</p>
                    <Textarea
                      value={editPerformerTpl || DEFAULT_PERFORMER_REMINDER}
                      onChange={e => setEditPerformerTpl(e.target.value)}
                      rows={10} className="bg-[#1a1a1a] border-white/10 font-mono text-xs resize-none"
                    />
                  </div>

                  <Button onClick={handleSaveEdit} className="bg-[#7250ef] hover:bg-[#5f3dd4]">
                    <Save className="h-4 w-4 mr-2" />Save Templates
                  </Button>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {/* EMPTY STATE */}
          {!selected && !creating && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-20">
              <div className="h-14 w-14 rounded-full bg-[#7250ef]/10 flex items-center justify-center">
                <Mic className="h-7 w-7 text-[#7250ef]" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Open Mic Series</h2>
                <p className="text-sm text-[#888] mt-1 max-w-sm">
                  Create a series for each recurring open mic. Each series gets its own mailing list, auto-created events, and email reminders.
                </p>
              </div>
              <Button onClick={() => setCreating(true)} className="bg-[#7250ef] hover:bg-[#5f3dd4]">
                <Plus className="h-4 w-4 mr-2" />Create First Series
              </Button>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
