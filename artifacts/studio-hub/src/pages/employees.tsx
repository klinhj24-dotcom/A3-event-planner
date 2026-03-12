import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListEmployees, useCreateEmployee } from "@workspace/api-client-react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, UserPlus, Mail, Phone, Loader2, Link2, LinkIcon, Unlink } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@workspace/replit-auth-web";

const employeeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  role: z.string().min(1, "Role is required"),
  hourlyRate: z.string().optional(),
});

export default function Employees() {
  const [search, setSearch] = useState("");
  const { data: employees, isLoading } = useListEmployees();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [linkTarget, setLinkTarget] = useState<any | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const { user } = useAuth();
  const isAdmin = (user as any)?.role === "admin";

  const { data: portalUsers } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAdmin,
  });

  const { mutate: linkUser, isPending: isLinking } = useMutation({
    mutationFn: async ({ employeeId, userId }: { employeeId: number; userId: string | null }) => {
      const res = await fetch(`/api/employees/${employeeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error("Failed to link account");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setLinkTarget(null);
      setSelectedUserId("");
      toast({ title: "Account linked successfully" });
    },
    onError: () => toast({ title: "Failed to link account", variant: "destructive" }),
  });

  const { mutate: createEmployee, isPending } = useCreateEmployee({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
        setCreateOpen(false);
        form.reset();
        toast({ title: "Team member added successfully" });
      },
      onError: () => toast({ title: "Failed to add team member", variant: "destructive" })
    }
  });

  const form = useForm<z.infer<typeof employeeSchema>>({
    resolver: zodResolver(employeeSchema),
    defaultValues: { name: "", role: "intern", email: "", phone: "", hourlyRate: "" }
  });

  const filteredEmployees = employees?.filter(e => 
    e.name.toLowerCase().includes(search.toLowerCase()) || 
    e.role.toLowerCase().includes(search.toLowerCase())
  );

  function getUserName(userId: string | null | undefined) {
    if (!userId || !portalUsers) return null;
    const u = portalUsers.find((p: any) => p.id === userId);
    if (!u) return "Unknown user";
    return u.firstName ? `${u.firstName} ${u.lastName || ""}`.trim() : u.username || u.email || "User";
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Team Roster</h1>
            <p className="text-muted-foreground mt-1">Manage staff and intern records.</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all">
                <UserPlus className="h-4 w-4 mr-2" /> Add Member
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] rounded-2xl">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">Add Team Member</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((data) => createEmployee({ data: { ...data, isActive: true } }))} className="space-y-4 mt-2">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name *</FormLabel>
                      <FormControl><Input placeholder="Alex Smith" className="rounded-xl" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}/>
                  <FormField control={form.control} name="role" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="staff">Staff</SelectItem>
                          <SelectItem value="intern">Intern</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}/>
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input placeholder="alex@studio.com" type="email" className="rounded-xl" {...field} /></FormControl>
                    </FormItem>
                  )}/>
                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl><Input placeholder="(555) 123-4567" className="rounded-xl" {...field} /></FormControl>
                    </FormItem>
                  )}/>
                  <FormField control={form.control} name="hourlyRate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hourly Rate ($) <span className="text-muted-foreground font-normal">optional</span></FormLabel>
                      <FormControl><Input placeholder="e.g. 18.00" type="number" step="0.01" min="0" className="rounded-xl" {...field} /></FormControl>
                    </FormItem>
                  )}/>
                  <DialogFooter className="pt-4">
                    <Button type="submit" disabled={isPending} className="w-full rounded-xl">
                      {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Add Member
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search team..." className="pl-9 rounded-xl" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            Array(3).fill(0).map((_, i) => <div key={i} className="h-40 bg-muted/50 animate-pulse rounded-2xl border border-border/50" />)
          ) : filteredEmployees?.length === 0 ? (
            <div className="col-span-full p-12 text-center text-muted-foreground bg-card border border-border/50 rounded-2xl">
              No team members found.
            </div>
          ) : (
            filteredEmployees?.map((employee) => (
              <div key={employee.id} className="bg-card rounded-2xl p-6 border border-border/50 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl opacity-10 rounded-bl-full -z-10 transition-opacity group-hover:opacity-20 ${employee.role === 'staff' ? 'from-primary to-transparent' : 'from-orange-500 to-transparent'}`} />
                <div className="flex justify-between items-start mb-4">
                  <div className="flex gap-4 items-center">
                    <Avatar className="h-12 w-12 border-2 border-background shadow-sm">
                      <AvatarFallback className={`font-display text-lg ${employee.role === 'staff' ? 'bg-primary/20 text-primary' : 'bg-orange-500/20 text-orange-600'}`}>
                        {employee.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-semibold text-lg text-foreground leading-none mb-1.5">{employee.name}</h3>
                      <Badge variant="secondary" className={`text-[10px] uppercase tracking-wider ${employee.role === 'staff' ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-orange-500/10 text-orange-600 hover:bg-orange-500/20'}`}>
                        {employee.role}
                      </Badge>
                    </div>
                  </div>
                  <Badge variant="outline" className={employee.isActive ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-muted text-muted-foreground"}>
                    {employee.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                
                <div className="space-y-2 mt-5 pt-5 border-t border-border/50">
                  {employee.email && (
                    <div className="flex items-center text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                      <Mail className="h-4 w-4 mr-3 opacity-50" />
                      <a href={`mailto:${employee.email}`} className="hover:underline">{employee.email}</a>
                    </div>
                  )}
                  {employee.phone && (
                    <div className="flex items-center text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                      <Phone className="h-4 w-4 mr-3 opacity-50" />
                      <a href={`tel:${employee.phone}`} className="hover:underline">{employee.phone}</a>
                    </div>
                  )}

                  {isAdmin && (
                    <div className="pt-2 flex items-center gap-2 flex-wrap">
                      {(employee as any).userId ? (
                        <>
                          <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-500/10 px-2.5 py-1 rounded-lg flex-1 min-w-0">
                            <Link2 className="h-3 w-3 shrink-0" />
                            <span className="truncate">{getUserName((employee as any).userId) || "Linked"}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive rounded-lg"
                            onClick={() => linkUser({ employeeId: employee.id, userId: null })}
                          >
                            <Unlink className="h-3 w-3" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs rounded-lg border-dashed gap-1.5 w-full"
                          onClick={() => { setLinkTarget(employee); setSelectedUserId(""); }}
                        >
                          <LinkIcon className="h-3 w-3" /> Link Portal Account
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Link Account Dialog */}
      <Dialog open={!!linkTarget} onOpenChange={(open) => !open && setLinkTarget(null)}>
        <DialogContent className="sm:max-w-[400px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Link Portal Account</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Select the portal account to link to <span className="font-medium text-foreground">{linkTarget?.name}</span>. They'll be able to log in and see their assigned events.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Portal Account</label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Select a user..." />
                </SelectTrigger>
                <SelectContent>
                  {portalUsers?.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.firstName ? `${u.firstName} ${u.lastName || ""}`.trim() : u.username || u.email}
                      <span className="ml-2 text-muted-foreground text-xs capitalize">({u.role})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setLinkTarget(null)}>Cancel</Button>
            <Button
              className="rounded-xl"
              disabled={!selectedUserId || isLinking}
              onClick={() => linkUser({ employeeId: linkTarget.id, userId: selectedUserId })}
            >
              {isLinking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Link Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
