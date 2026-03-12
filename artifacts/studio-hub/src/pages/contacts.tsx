import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListContacts, useCreateContact, useLogOutreach, useGetContactOutreach } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription 
} from "@/components/ui/dialog";
import { 
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription 
} from "@/components/ui/sheet";
import { 
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage 
} from "@/components/ui/form";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Phone, Mail, Building2, Calendar as CalendarIcon, MessageSquare, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

const contactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  organization: z.string().optional(),
  type: z.string().min(1, "Type is required"),
  notes: z.string().optional(),
});

const outreachSchema = z.object({
  method: z.string().min(1, "Method is required"),
  notes: z.string().optional(),
});

export default function Contacts() {
  const [search, setSearch] = useState("");
  const { data: contacts, isLoading } = useListContacts();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [createOpen, setCreateOpen] = useState(false);
  const [outreachOpen, setOutreachOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { mutate: createContact, isPending: isCreating } = useCreateContact({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
        setCreateOpen(false);
        form.reset();
        toast({ title: "Contact created successfully" });
      },
      onError: () => toast({ title: "Failed to create contact", variant: "destructive" })
    }
  });

  const { mutate: logOutreach, isPending: isLogging } = useLogOutreach({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
        if (selectedContactId) {
          queryClient.invalidateQueries({ queryKey: [`/api/contacts/${selectedContactId}/outreach`] });
        }
        setOutreachOpen(false);
        outreachForm.reset();
        toast({ title: "Outreach logged successfully" });
      }
    }
  });

  const { data: outreachHistory, isLoading: isLoadingHistory } = useGetContactOutreach(
    selectedContactId || 0,
    { query: { enabled: !!selectedContactId && sheetOpen } }
  );

  const form = useForm<z.infer<typeof contactSchema>>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: "", type: "event_coordinator", email: "", phone: "", organization: "", notes: "" }
  });

  const outreachForm = useForm<z.infer<typeof outreachSchema>>({
    resolver: zodResolver(outreachSchema),
    defaultValues: { method: "email", notes: "" }
  });

  const filteredContacts = contacts?.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.organization?.toLowerCase().includes(search.toLowerCase())
  );

  const activeContact = contacts?.find(c => c.id === selectedContactId);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Contacts</h1>
            <p className="text-muted-foreground mt-1">Manage network and track outreach.</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all">
                <Plus className="h-4 w-4 mr-2" /> Add Contact
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] rounded-2xl">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">New Contact</DialogTitle>
                <DialogDescription>Add a new contact to the studio database.</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((data) => createContact({ data }))} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Full Name *</FormLabel>
                        <FormControl><Input placeholder="Jane Doe" className="rounded-xl" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}/>
                    <FormField control={form.control} name="type" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Type *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select type" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="band_director">Band Director</SelectItem>
                            <SelectItem value="event_coordinator">Event Coordinator</SelectItem>
                            <SelectItem value="venue">Venue</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}/>
                    <FormField control={form.control} name="organization" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organization</FormLabel>
                        <FormControl><Input placeholder="High School Band" className="rounded-xl" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}/>
                    <FormField control={form.control} name="email" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl><Input placeholder="jane@example.com" type="email" className="rounded-xl" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}/>
                    <FormField control={form.control} name="phone" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl><Input placeholder="(555) 123-4567" className="rounded-xl" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}/>
                    <FormField control={form.control} name="notes" render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Notes</FormLabel>
                        <FormControl><Textarea placeholder="Met at summer showcase..." className="rounded-xl resize-none h-20" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}/>
                  </div>
                  <DialogFooter className="pt-4">
                    <Button type="submit" disabled={isCreating} className="w-full rounded-xl">
                      {isCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Save Contact
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border/50 flex items-center gap-4 bg-muted/10">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search contacts..." 
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
                  <TableHead className="font-semibold">Name</TableHead>
                  <TableHead className="font-semibold">Organization</TableHead>
                  <TableHead className="font-semibold">Contact Info</TableHead>
                  <TableHead className="font-semibold">Last Outreach</TableHead>
                  <TableHead className="text-right font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Loading contacts...</TableCell></TableRow>
                ) : filteredContacts?.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">No contacts found.</TableCell></TableRow>
                ) : (
                  filteredContacts?.map((contact) => (
                    <TableRow key={contact.id} className="group transition-colors">
                      <TableCell>
                        <div className="font-medium text-foreground">{contact.name}</div>
                        <Badge variant="outline" className="mt-1 capitalize text-xs bg-background">
                          {contact.type.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center text-sm text-muted-foreground">
                          <Building2 className="h-3.5 w-3.5 mr-2 opacity-70" />
                          {contact.organization || "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          {contact.email && <div className="flex items-center"><Mail className="h-3.5 w-3.5 mr-2 opacity-70" />{contact.email}</div>}
                          {contact.phone && <div className="flex items-center"><Phone className="h-3.5 w-3.5 mr-2 opacity-70" />{contact.phone}</div>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {contact.lastOutreachAt ? (
                          <div className="flex items-center text-sm">
                            <CalendarIcon className="h-3.5 w-3.5 mr-2 text-primary/70" />
                            {format(new Date(contact.lastOutreachAt), "MMM d, yyyy")}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/60 italic">Never contacted</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            className="rounded-lg h-8"
                            onClick={() => { setSelectedContactId(contact.id); setSheetOpen(true); }}
                          >
                            History
                          </Button>
                          <Button 
                            size="sm" 
                            className="rounded-lg h-8"
                            onClick={() => { setSelectedContactId(contact.id); setOutreachOpen(true); }}
                          >
                            Log Contact
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Log Outreach Dialog */}
        <Dialog open={outreachOpen} onOpenChange={setOutreachOpen}>
          <DialogContent className="sm:max-w-[400px] rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-display">Log Outreach</DialogTitle>
              <DialogDescription>Record communication with {contacts?.find(c => c.id === selectedContactId)?.name}.</DialogDescription>
            </DialogHeader>
            <Form {...outreachForm}>
              <form onSubmit={outreachForm.handleSubmit((data) => {
                if (selectedContactId) logOutreach({ id: selectedContactId, data: { ...data, outreachAt: new Date().toISOString() } });
              })} className="space-y-4">
                <FormField control={outreachForm.control} name="method" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Method</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="phone">Phone Call</SelectItem>
                        <SelectItem value="text">Text Message</SelectItem>
                        <SelectItem value="in-person">In Person</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}/>
                <FormField control={outreachForm.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl><Textarea placeholder="Discussed upcoming fall showcase..." className="rounded-xl h-24 resize-none" {...field} /></FormControl>
                  </FormItem>
                )}/>
                <DialogFooter>
                  <Button type="submit" disabled={isLogging} className="w-full rounded-xl">
                    {isLogging ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Save Record
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Contact History Sheet */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent className="sm:max-w-md w-full overflow-y-auto border-l-border/50">
            <SheetHeader className="pb-6 border-b border-border/50">
              <SheetTitle className="font-display text-2xl">{activeContact?.name}</SheetTitle>
              <SheetDescription className="flex flex-col gap-2 pt-2">
                <span className="flex items-center text-foreground"><Building2 className="h-4 w-4 mr-2" /> {activeContact?.organization || "No organization"}</span>
                {activeContact?.email && <span className="flex items-center"><Mail className="h-4 w-4 mr-2" /> {activeContact.email}</span>}
                {activeContact?.phone && <span className="flex items-center"><Phone className="h-4 w-4 mr-2" /> {activeContact.phone}</span>}
              </SheetDescription>
            </SheetHeader>
            <div className="py-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg flex items-center">
                  <MessageSquare className="h-5 w-5 mr-2 text-primary" /> Outreach History
                </h3>
                <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => { setSheetOpen(false); setOutreachOpen(true); }}>
                  <Plus className="h-3 w-3 mr-1" /> Log
                </Button>
              </div>
              
              {isLoadingHistory ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : outreachHistory?.length === 0 ? (
                <div className="text-center py-10 bg-muted/20 rounded-xl border border-border/50 border-dashed">
                  <p className="text-muted-foreground text-sm">No outreach history yet.</p>
                </div>
              ) : (
                <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                  {outreachHistory?.map((outreach, i) => (
                    <div key={outreach.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-primary/20 text-primary shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                        <MessageSquare className="h-4 w-4" />
                      </div>
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-border/50 bg-card shadow-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-sm capitalize text-foreground">{outreach.method}</span>
                          <time className="text-xs font-medium text-muted-foreground">{format(new Date(outreach.outreachAt), "MMM d, yyyy")}</time>
                        </div>
                        <div className="text-sm text-muted-foreground leading-relaxed">
                          {outreach.notes || <span className="italic opacity-50">No notes</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </AppLayout>
  );
}
