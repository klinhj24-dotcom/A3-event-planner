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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Search, Plus, Phone, Mail, Building2, Calendar as CalendarIcon,
  MessageSquare, Loader2, Send, UserPlus, UserMinus, ShieldCheck
} from "lucide-react";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { GmailComposeModal } from "@/components/gmail-compose";
import { GmailThreadView } from "@/components/gmail-thread-view";
import { useAuth } from "@workspace/replit-auth-web";
import {
  useContactAssignments,
  useAssignContact,
  useUnassignContact,
  useTeamMembers,
} from "@/hooks/use-team";

const contactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  organization: z.string().optional(),
  type: z.string().min(1, "Type is required"),
  notes: z.string().optional(),
  outreachWindowMonths: z.string().optional(),
});

const OUTREACH_WINDOWS = [
  { value: "", label: "No window" },
  { value: "1", label: "Every month" },
  { value: "2", label: "Every 2 months" },
  { value: "3", label: "Every 3 months" },
  { value: "6", label: "Every 6 months" },
  { value: "12", label: "Yearly" },
];

function getOutreachStatus(contact: { outreachWindowMonths?: number | null; lastOutreachAt?: Date | string | null }) {
  if (!contact.outreachWindowMonths) return null;
  const now = Date.now();
  const windowMs = contact.outreachWindowMonths * 30.44 * 24 * 60 * 60 * 1000;
  if (!contact.lastOutreachAt) return "overdue";
  const lastMs = new Date(contact.lastOutreachAt).getTime();
  const dueAt = lastMs + windowMs;
  if (dueAt < now) return "overdue";
  if (dueAt - now < 14 * 24 * 60 * 60 * 1000) return "due-soon";
  return "ok";
}

const outreachSchema = z.object({
  method: z.string().min(1, "Method is required"),
  notes: z.string().optional(),
});

const CONTACT_TYPES = [
  { value: "band_director", label: "Band Director" },
  { value: "event_coordinator", label: "Event Coordinator" },
  { value: "venue", label: "Venue" },
  { value: "teacher", label: "Teacher" },
  { value: "band", label: "Band" },
  { value: "other", label: "Other" },
];

function typeLabel(type: string) {
  return CONTACT_TYPES.find(t => t.value === type)?.label ?? type.replace(/_/g, " ");
}

function userDisplayName(u: { firstName?: string | null; lastName?: string | null; username?: string | null; email?: string | null }) {
  if (u.firstName) return `${u.firstName}${u.lastName ? ` ${u.lastName}` : ""}`.trim();
  return u.username || u.email || "Unknown";
}

function AssignmentsPanel({
  contactId,
  isAdmin,
}: {
  contactId: number;
  isAdmin: boolean;
}) {
  const { data: assignments = [], isLoading } = useContactAssignments(contactId);
  const { data: teamMembers = [] } = useTeamMembers();
  const { mutate: assign, isPending: isAssigning } = useAssignContact();
  const { mutate: unassign } = useUnassignContact();
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState("");

  const assignedUserIds = assignments.map(a => a.userId);
  const unassignedMembers = teamMembers.filter(m => !assignedUserIds.includes(m.id));

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" /> Assigned Employees
      </h3>

      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : assignments.length === 0 ? (
        <div className="text-center py-8 bg-muted/20 rounded-xl border border-border/50 border-dashed">
          <p className="text-sm text-muted-foreground">No employees assigned yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {assignments.map((a) => (
            <div key={a.userId} className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-card">
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8 border border-border/20">
                  <AvatarImage src={a.profileImageUrl || undefined} />
                  <AvatarFallback className="bg-primary/20 text-primary text-xs font-medium">
                    {(a.firstName || a.username || "?").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{userDisplayName(a)}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.autoAssigned === "true" ? "Auto-assigned via outreach" : "Manually assigned"} · {format(new Date(a.assignedAt), "MMM d, yyyy")}
                  </p>
                </div>
              </div>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={() => unassign({ contactId, userId: a.userId }, {
                    onSuccess: () => toast({ title: "Employee unassigned" }),
                    onError: () => toast({ title: "Failed to unassign", variant: "destructive" }),
                  })}
                >
                  <UserMinus className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {isAdmin && unassignedMembers.length > 0 && (
        <div className="flex items-center gap-2 pt-2">
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="rounded-xl flex-1 h-9 text-sm">
              <SelectValue placeholder="Add employee..." />
            </SelectTrigger>
            <SelectContent>
              {unassignedMembers.map(m => (
                <SelectItem key={m.id} value={m.id}>{userDisplayName(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="rounded-xl h-9"
            disabled={!selectedUserId || isAssigning}
            onClick={() => {
              if (!selectedUserId) return;
              assign({ contactId, userId: selectedUserId }, {
                onSuccess: () => { toast({ title: "Employee assigned" }); setSelectedUserId(""); },
                onError: () => toast({ title: "Failed to assign", variant: "destructive" }),
              });
            }}
          >
            {isAssigning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function Contacts() {
  const [search, setSearch] = useState("");
  const { data: contacts, isLoading } = useListContacts();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = (user as any)?.role === "admin";
  
  const [createOpen, setCreateOpen] = useState(false);
  const [outreachOpen, setOutreachOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
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
        toast({ title: "Outreach logged — contact auto-assigned to you" });
      }
    }
  });

  const { data: outreachHistory, isLoading: isLoadingHistory } = useGetContactOutreach(
    selectedContactId || 0,
    { query: { enabled: !!selectedContactId && sheetOpen } }
  );

  const form = useForm<z.infer<typeof contactSchema>>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: "", type: "event_coordinator", email: "", phone: "", organization: "", notes: "", outreachWindowMonths: "" }
  });

  const outreachForm = useForm<z.infer<typeof outreachSchema>>({
    resolver: zodResolver(outreachSchema),
    defaultValues: { method: "email", notes: "" }
  });

  const filteredContacts = contacts?.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    (c.organization?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  const activeContact = contacts?.find(c => c.id === selectedContactId);

  const sheetTabs = isAdmin
    ? ["emails", "history", "assigned"]
    : ["emails", "history"];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Contacts</h1>
            <p className="text-muted-foreground mt-1">
              {isAdmin ? "All contacts in the studio database." : "Your assigned contacts."}
            </p>
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
                <form onSubmit={form.handleSubmit((data) => {
                  const { outreachWindowMonths, ...rest } = data;
                  const window = outreachWindowMonths && outreachWindowMonths !== "__none__" ? parseInt(outreachWindowMonths) : null;
                  createContact({ data: { ...rest, outreachWindowMonths: window } as any });
                })} className="space-y-4">
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
                            {CONTACT_TYPES.map(t => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
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
                        <FormControl><Input placeholder="rigby@themusicspace.com" type="email" className="rounded-xl" {...field} /></FormControl>
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
                    <FormField control={form.control} name="outreachWindowMonths" render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Outreach Window</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="rounded-xl"><SelectValue placeholder="No window" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {OUTREACH_WINDOWS.map(w => (
                              <SelectItem key={w.value} value={w.value === "" ? "__none__" : w.value}>{w.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Alert when this contact hasn't been reached out to within the window.</p>
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
            {!isAdmin && (
              <Badge variant="outline" className="rounded-lg text-xs text-primary border-primary/30 bg-primary/5">
                My Contacts
              </Badge>
            )}
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
                          {typeLabel(contact.type)}
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
                        <div className="space-y-1">
                          {getOutreachStatus(contact) === "overdue" && (
                            <Badge className="bg-destructive/10 text-destructive border border-destructive/30 text-[10px] px-1.5 py-0.5 h-auto font-medium">
                              Overdue
                            </Badge>
                          )}
                          {getOutreachStatus(contact) === "due-soon" && (
                            <Badge className="bg-yellow-500/10 text-yellow-600 border border-yellow-500/30 text-[10px] px-1.5 py-0.5 h-auto font-medium">
                              Due Soon
                            </Badge>
                          )}
                          {contact.lastOutreachAt ? (
                            <div className="flex items-center text-sm">
                              <CalendarIcon className="h-3.5 w-3.5 mr-2 text-primary/70" />
                              {format(new Date(contact.lastOutreachAt), "MMM d, yyyy")}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground/60 italic">Never contacted</span>
                          )}
                          {contact.outreachWindowMonths && (
                            <p className="text-[10px] text-muted-foreground/50">
                              Window: {contact.outreachWindowMonths === 12 ? "Yearly" : contact.outreachWindowMonths === 1 ? "Monthly" : `Every ${contact.outreachWindowMonths}mo`}
                            </p>
                          )}
                        </div>
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
                          {contact.email && (
                            <Button 
                              variant="outline"
                              size="sm" 
                              className="rounded-lg h-8 border-primary/30 text-primary hover:bg-primary/10"
                              onClick={() => { setSelectedContactId(contact.id); setComposeOpen(true); }}
                            >
                              <Send className="h-3 w-3 mr-1.5" /> Email
                            </Button>
                          )}
                          <Button 
                            size="sm" 
                            className="rounded-lg h-8"
                            onClick={() => { setSelectedContactId(contact.id); setOutreachOpen(true); }}
                          >
                            Log
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
              <DialogDescription>
                Record communication with {contacts?.find(c => c.id === selectedContactId)?.name}.
                {!isAdmin && " This contact will be auto-assigned to you."}
              </DialogDescription>
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

        {/* Gmail Compose Modal */}
        {activeContact && (
          <GmailComposeModal
            open={composeOpen}
            onOpenChange={setComposeOpen}
            contact={activeContact}
          />
        )}

        {/* Contact Detail Sheet */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent className="sm:max-w-md w-full overflow-y-auto border-l-border/50">
            <SheetHeader className="pb-4 border-b border-border/50">
              <SheetTitle className="font-display text-2xl">{activeContact?.name}</SheetTitle>
              <SheetDescription className="flex flex-col gap-2 pt-2">
                <span className="flex items-center text-foreground">
                  <Building2 className="h-4 w-4 mr-2" /> {activeContact?.organization || "No organization"}
                </span>
                {activeContact?.email && <span className="flex items-center"><Mail className="h-4 w-4 mr-2" /> {activeContact.email}</span>}
                {activeContact?.phone && <span className="flex items-center"><Phone className="h-4 w-4 mr-2" /> {activeContact.phone}</span>}
                {activeContact?.type && (
                  <Badge variant="outline" className="w-fit capitalize text-xs">
                    {typeLabel(activeContact.type)}
                  </Badge>
                )}
              </SheetDescription>
            </SheetHeader>

            <div className="py-4">
              <Tabs defaultValue="emails">
                <TabsList className={`w-full rounded-xl bg-muted/40 mb-4 grid ${isAdmin ? "grid-cols-3" : "grid-cols-2"}`}>
                  <TabsTrigger value="emails" className="rounded-lg">Emails</TabsTrigger>
                  <TabsTrigger value="history" className="rounded-lg">Activity</TabsTrigger>
                  {isAdmin && <TabsTrigger value="assigned" className="rounded-lg">Assigned</TabsTrigger>}
                </TabsList>

                <TabsContent value="emails" className="mt-0">
                  {activeContact && <GmailThreadView contact={activeContact} />}
                </TabsContent>

                <TabsContent value="history" className="mt-0 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-primary" /> Outreach History
                    </h3>
                    <Button size="sm" variant="outline" className="h-7 rounded-lg text-xs" onClick={() => { setSheetOpen(false); setOutreachOpen(true); }}>
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
                    <div className="space-y-3">
                      {(outreachHistory as any[])?.map((outreach) => (
                        <div key={outreach.id} className="p-3 rounded-xl border border-border/50 bg-card">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-semibold text-sm capitalize text-foreground">{outreach.method}</span>
                            <time className="text-xs font-medium text-muted-foreground">{format(new Date(outreach.outreachAt), "MMM d, yyyy")}</time>
                          </div>
                          {(outreach.userFirstName || outreach.userUsername) && (
                            <p className="text-xs text-primary/80 mb-1.5">
                              Logged by {outreach.userFirstName ? `${outreach.userFirstName}${outreach.userLastName ? ` ${outreach.userLastName}` : ""}` : outreach.userUsername}
                            </p>
                          )}
                          <div className="text-sm text-muted-foreground leading-relaxed">
                            {outreach.notes || <span className="italic opacity-50">No notes</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {isAdmin && (
                  <TabsContent value="assigned" className="mt-0">
                    {selectedContactId && (
                      <AssignmentsPanel contactId={selectedContactId} isAdmin={isAdmin} />
                    )}
                  </TabsContent>
                )}
              </Tabs>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </AppLayout>
  );
}
