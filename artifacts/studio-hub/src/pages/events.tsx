import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListEvents, useCreateEvent } from "@workspace/api-client-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, MapPin, DollarSign, CalendarCheck, Tag, Loader2, List, CalendarDays, Radio } from "lucide-react";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { EventsCalendar } from "@/components/events-calendar";

function CalendarPushButton({ eventId }: { eventId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { mutate: push, isPending } = useMutation({
    mutationFn: () => fetch(`/api/calendar/push/${eventId}`, { method: "POST", credentials: "include" }).then(r => r.json()),
    onSuccess: (data) => {
      if (data.error) { toast({ title: data.error, variant: "destructive" }); return; }
      toast({ title: "Pushed to Events Calendar" });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    },
    onError: () => toast({ title: "Failed to push to calendar", variant: "destructive" }),
  });
  return (
    <Button size="sm" variant="ghost" title="Push to Events Calendar" className="h-7 px-2 text-xs rounded-lg text-primary hover:bg-primary/10" onClick={() => push()} disabled={isPending}>
      {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CalendarCheck className="h-3 w-3" />}
    </Button>
  );
}

function CommsPushButton({ eventId, eventTitle }: { eventId: number; eventTitle: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { mutate: pushComms, isPending } = useMutation({
    mutationFn: () =>
      fetch(`/api/calendar/push-comms/${eventId}`, { method: "POST", credentials: "include" }).then(r => r.json()),
    onSuccess: (data) => {
      if (data.error) { toast({ title: data.error, variant: "destructive" }); return; }
      if (data.pushed === 0 && data.message) {
        toast({ title: `No rules matched`, description: data.message, variant: "destructive" });
        return;
      }
      toast({ title: `${data.pushed} comm tasks pushed to calendar`, description: `For: ${eventTitle}` });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    },
    onError: () => toast({ title: "Failed to push comms to calendar", variant: "destructive" }),
  });
  return (
    <Button
      size="sm"
      variant="ghost"
      title="Generate & push comm schedule to Comms Calendar"
      className="h-7 px-2 text-xs rounded-lg text-[#00b199] hover:bg-[#00b199]/10"
      onClick={() => pushComms()}
      disabled={isPending}
    >
      {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Radio className="h-3 w-3" />}
    </Button>
  );
}

const eventSchema = z.object({
  title: z.string().min(1, "Title is required"),
  type: z.string().min(1, "Type is required"),
  status: z.string().min(1, "Status is required"),
  location: z.string().optional(),
  startDate: z.string().optional(),
  calendarTag: z.string().optional(),
  isPaid: z.boolean().default(false),
  revenue: z.coerce.number().optional(),
  cost: z.coerce.number().optional(),
});

export default function Events() {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "calendar">("list");
  const { data: events, isLoading } = useListEvents();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);

  const { mutate: createEvent, isPending } = useCreateEvent({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/events"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
        setCreateOpen(false);
        form.reset();
        toast({ title: "Event created successfully" });
      },
      onError: () => toast({ title: "Failed to create event", variant: "destructive" })
    }
  });

  const form = useForm<z.infer<typeof eventSchema>>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: "", type: "Recital", status: "planning", isPaid: false
    }
  });

  const filteredEvents = events?.filter(e => 
    e.title.toLowerCase().includes(search.toLowerCase()) || 
    e.location?.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'confirmed': return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
      case 'completed': return "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20";
      case 'cancelled': return "bg-destructive/15 text-destructive border-destructive/20";
      default: return "bg-secondary text-secondary-foreground";
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Events</h1>
            <p className="text-muted-foreground mt-1">Manage studio events, shows, and gigs.</p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center rounded-xl border border-border/60 bg-muted/30 p-1 gap-1">
              <button
                onClick={() => setView("list")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${view === "list" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <List className="h-3.5 w-3.5" /> List
              </button>
              <button
                onClick={() => setView("calendar")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${view === "calendar" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <CalendarDays className="h-3.5 w-3.5" /> Calendar
              </button>
            </div>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all">
                <Plus className="h-4 w-4 mr-2" /> Create Event
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] rounded-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">Create Event</DialogTitle>
                <DialogDescription>Schedule a new event and configure sync tags.</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((data) => createEvent({ data }))} className="space-y-5 py-4">
                  <FormField control={form.control} name="title" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event Title *</FormLabel>
                      <FormControl><Input placeholder="Summer Recital 2026" className="rounded-xl" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}/>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="type" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent className="max-h-72 overflow-y-auto">
                            <SelectItem value="Recital">Recital</SelectItem>
                            <SelectItem value="Student Band Show">Student Band Show</SelectItem>
                            <SelectItem value="Songwriter Showcase / Studio Show">Songwriter Showcase / Studio Show</SelectItem>
                            <SelectItem value="Open Mic">Open Mic</SelectItem>
                            <SelectItem value="Festival / Community Event">Festival / Community Event</SelectItem>
                            <SelectItem value="Workshop">Workshop</SelectItem>
                            <SelectItem value="Studio Party">Studio Party</SelectItem>
                            <SelectItem value="Studio Jam Night">Studio Jam Night</SelectItem>
                            <SelectItem value="Studio Open House">Studio Open House</SelectItem>
                            <SelectItem value="Rockin' Toddlers">Rockin' Toddlers</SelectItem>
                            <SelectItem value="Chamber Ensemble">Chamber Ensemble</SelectItem>
                            <SelectItem value="Enrichment Club">Enrichment Club</SelectItem>
                            <SelectItem value="Instrument Demo (Waldorf)">Instrument Demo (Waldorf)</SelectItem>
                            <SelectItem value="Instrument Demo (library)">Instrument Demo (library)</SelectItem>
                            <SelectItem value="Little Rockers (library)">Little Rockers (library)</SelectItem>
                            <SelectItem value="Holiday Closure">Holiday Closure</SelectItem>
                            <SelectItem value="Holiday">Holiday</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}/>
                    <FormField control={form.control} name="status" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="planning">Planning</SelectItem>
                            <SelectItem value="confirmed">Confirmed</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}/>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="startDate" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date & Time</FormLabel>
                        <FormControl><Input type="datetime-local" className="rounded-xl" {...field} /></FormControl>
                      </FormItem>
                    )}/>
                    <FormField control={form.control} name="location" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location</FormLabel>
                        <FormControl><Input placeholder="Main Stage" className="rounded-xl" {...field} /></FormControl>
                      </FormItem>
                    )}/>
                  </div>
                  <div className="p-4 bg-muted/40 rounded-xl border border-border/50 space-y-4">
                    <h4 className="font-semibold text-sm flex items-center"><DollarSign className="h-4 w-4 mr-1 text-primary" /> Financials</h4>
                    <FormField control={form.control} name="isPaid" render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border/50 p-3 shadow-sm bg-card">
                        <div className="space-y-0.5">
                          <FormLabel className="text-sm font-medium">Paid Event?</FormLabel>
                          <p className="text-[10px] text-muted-foreground">Are we receiving payment for sound/services?</p>
                        </div>
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      </FormItem>
                    )}/>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="revenue" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Revenue ($)</FormLabel>
                          <FormControl><Input type="number" placeholder="0.00" className="rounded-xl h-9" {...field} value={field.value || ''} /></FormControl>
                        </FormItem>
                      )}/>
                      <FormField control={form.control} name="cost" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Cost ($)</FormLabel>
                          <FormControl><Input type="number" placeholder="0.00" className="rounded-xl h-9" {...field} value={field.value || ''} /></FormControl>
                        </FormItem>
                      )}/>
                    </div>
                  </div>
                  <FormField control={form.control} name="calendarTag" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center"><Tag className="h-3 w-3 mr-1" /> Website Calendar Tag</FormLabel>
                      <FormControl><Input placeholder="e.g. show-summer" className="rounded-xl" {...field} /></FormControl>
                      <p className="text-[10px] text-muted-foreground mt-1">Tag used by website script to pull this event.</p>
                    </FormItem>
                  )}/>
                  <DialogFooter className="pt-4">
                    <Button type="submit" disabled={isPending} className="w-full rounded-xl h-11">
                      {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Create Event
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {view === "calendar" ? (
          isLoading ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading events...
            </div>
          ) : (
            <EventsCalendar events={events ?? []} />
          )
        ) : (
          <div className="bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border/50 bg-muted/10">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search events by title or location..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 rounded-xl border-border/60 bg-background focus-visible:ring-primary/20"
                />
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-semibold">Event</TableHead>
                    <TableHead className="font-semibold">Date & Location</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Financials</TableHead>
                    <TableHead className="text-right font-semibold">Sync</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Loading events...</TableCell></TableRow>
                  ) : filteredEvents?.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">No events found.</TableCell></TableRow>
                  ) : (
                    filteredEvents?.map((event) => (
                      <TableRow key={event.id} className="hover:bg-muted/20 transition-colors">
                        <TableCell>
                          <div className="font-medium text-foreground text-base">{event.title}</div>
                          <span className="text-xs text-muted-foreground capitalize mt-0.5 block">
                            {event.type.replace('_', ' ')}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-sm">
                            <div className="flex items-center text-foreground">
                              <CalendarCheck className="h-3.5 w-3.5 mr-2 text-primary/70" />
                              {event.startDate ? format(new Date(event.startDate), "MMM d, yyyy h:mm a") : "TBD"}
                            </div>
                            {event.location && (
                              <div className="flex items-center text-muted-foreground">
                                <MapPin className="h-3.5 w-3.5 mr-2 opacity-70" />
                                {event.location}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`capitalize ${getStatusColor(event.status)}`}>
                            {event.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center text-sm">
                            {event.isPaid ? (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-semibold tracking-wide">PAID</Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground bg-muted/50 border-border/50">UNPAID</Badge>
                            )}
                            {(event.revenue || event.cost) && (
                              <span className="ml-3 text-xs text-muted-foreground font-mono">
                                {event.revenue ? `+$${event.revenue}` : ''} {event.cost ? `-$${event.cost}` : ''}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {event.calendarTag ? (
                              <Badge variant="secondary" className="font-mono text-[10px] bg-secondary border border-border/50">
                                #{event.calendarTag}
                              </Badge>
                            ) : null}
                            <CalendarPushButton eventId={event.id} />
                            <CommsPushButton eventId={event.id} eventTitle={event.title} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
