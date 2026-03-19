import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListEmployees, useCreateEmployee } from "@workspace/api-client-react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Search, UserPlus, Mail, Phone, Loader2, Link2, Unlink, Pencil, Shield, ShieldOff, KeyRound, Eye, EyeOff, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@workspace/replit-auth-web";
import { useUpdateUserRole } from "@/hooks/use-team";

const employeeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  role: z.string().min(1, "Role is required"),
  hourlyRate: z.string().optional(),
  isActive: z.boolean().optional(),
  isBandLeader: z.boolean().optional(),
});

const portalUserSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  email: z.string().email("Valid email required"),
  role: z.enum(["admin", "employee"]),
});

export default function Employees() {
  const [search, setSearch] = useState("");
  const { data: employees, isLoading } = useListEmployees();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [roleTab, setRoleTab] = useState<"all" | "staff" | "teacher" | "intern">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [createPortalFor, setCreatePortalFor] = useState<any | null>(null);
  const [resetPwTarget, setResetPwTarget] = useState<any | null>(null);
  const [newPw, setNewPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const { user } = useAuth();
  const isAdmin = (user as any)?.role === "admin";
  const { mutate: updateRole } = useUpdateUserRole();

  const { data: portalUsers, refetch: refetchPortalUsers } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAdmin,
  });

  // Link employee record to a portal user
  const { mutate: linkUser } = useMutation({
    mutationFn: async ({ employeeId, userId }: { employeeId: number; userId: string | null }) => {
      const res = await fetch(`/api/employees/${employeeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error("Failed to link account");
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({ title: vars.userId ? "Portal account linked" : "Portal access removed" });
    },
    onError: () => toast({ title: "Failed to update portal link", variant: "destructive" }),
  });

  // Create a portal login account
  const portalForm = useForm<z.infer<typeof portalUserSchema>>({
    resolver: zodResolver(portalUserSchema),
    defaultValues: { firstName: "", lastName: "", email: "", role: "employee" },
  });

  const { mutate: createPortalUser, isPending: isCreatingPortal } = useMutation({
    mutationFn: async (data: z.infer<typeof portalUserSchema>) => {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create account");
      }
      return res.json();
    },
    onSuccess: async (newUser) => {
      await refetchPortalUsers();
      if (createPortalFor) {
        linkUser({ employeeId: createPortalFor.id, userId: newUser.id });
      }
      setCreatePortalFor(null);
      portalForm.reset();
      toast({ title: "Portal account created", description: "A welcome email with login instructions has been sent." });
    },
    onError: (err: any) => toast({ title: err.message, variant: "destructive" }),
  });

  // Reset password
  const { mutate: resetPassword, isPending: isResetting } = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      setResetPwTarget(null);
      setNewPw("");
      toast({ title: "Password updated" });
    },
    onError: () => toast({ title: "Failed to update password", variant: "destructive" }),
  });

  // Delete portal user
  const { mutate: deletePortalUser } = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      refetchPortalUsers();
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({ title: "Portal account removed" });
    },
    onError: () => toast({ title: "Failed to delete portal account", variant: "destructive" }),
  });

  const { mutate: updateEmployee, isPending: isUpdating } = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/employees/${data.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setEditTarget(null);
      editForm.reset();
      toast({ title: "Team member updated" });
    },
    onError: () => toast({ title: "Failed to update team member", variant: "destructive" }),
  });

  const { mutate: createEmployee, isPending } = useCreateEmployee({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
        setCreateOpen(false);
        createForm.reset();
        toast({ title: "Team member added" });
      },
      onError: () => toast({ title: "Failed to add team member", variant: "destructive" }),
    },
  });

  const createForm = useForm<z.infer<typeof employeeSchema>>({
    resolver: zodResolver(employeeSchema),
    defaultValues: { name: "", role: "intern", email: "", phone: "", hourlyRate: "", isActive: true, isBandLeader: false },
  });

  const editForm = useForm<z.infer<typeof employeeSchema>>({
    resolver: zodResolver(employeeSchema),
    defaultValues: { name: "", role: "intern", email: "", phone: "", hourlyRate: "", isActive: true, isBandLeader: false },
  });

  function openEdit(employee: any) {
    setEditTarget(employee);
    editForm.reset({
      name: employee.name,
      role: employee.role,
      email: employee.email || "",
      phone: employee.phone || "",
      hourlyRate: employee.hourlyRate ? String(employee.hourlyRate) : "",
      isActive: employee.isActive,
      isBandLeader: employee.isBandLeader ?? false,
    });
  }

  const filteredEmployees = employees?.filter(e => {
    const matchesSearch = e.name.toLowerCase().includes(search.toLowerCase()) || e.role.toLowerCase().includes(search.toLowerCase());
    const matchesTab = roleTab === "all" || e.role === roleTab;
    return matchesSearch && matchesTab;
  });

  function getPortalUser(userId: string | null | undefined) {
    if (!userId || !portalUsers) return null;
    return portalUsers.find((p: any) => p.id === userId) ?? null;
  }

  function getUserDisplayName(u: any) {
    if (!u) return null;
    return u.firstName ? `${u.firstName} ${u.lastName || ""}`.trim() : u.email || "User";
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Team Roster</h1>
            <p className="text-muted-foreground mt-1">Manage staff, teacher, and intern records.</p>
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
              <Form {...createForm}>
                <form onSubmit={createForm.handleSubmit((data) => createEmployee({ data: { ...data, isActive: true, isBandLeader: data.isBandLeader ?? false } }))} className="space-y-4 mt-2">
                  <FormField control={createForm.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name *</FormLabel>
                      <FormControl><Input placeholder="Alex Smith" className="rounded-xl" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={createForm.control} name="role" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="staff">Staff</SelectItem>
                          <SelectItem value="intern">Intern</SelectItem>
                          <SelectItem value="teacher">Teacher</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={createForm.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input placeholder="alex@studio.com" type="email" className="rounded-xl" {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={createForm.control} name="phone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl><Input placeholder="(555) 123-4567" className="rounded-xl" {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={createForm.control} name="hourlyRate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hourly Rate ($) <span className="text-muted-foreground font-normal">optional</span></FormLabel>
                      <FormControl><Input placeholder="e.g. 18.00" type="number" step="0.01" min="0" className="rounded-xl" {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={createForm.control} name="isBandLeader" render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-xl border border-border/50 px-4 py-3">
                      <div>
                        <FormLabel className="cursor-pointer">Band Leader</FormLabel>
                        <p className="text-[11px] text-muted-foreground">This staff member leads bands at events</p>
                      </div>
                      <FormControl>
                        <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )} />
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

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search team..." className="pl-9 rounded-xl" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-border/50 bg-muted/30 p-1">
            {(["all", "staff", "teacher", "intern"] as const).map(tab => {
              const counts = {
                all: employees?.length ?? 0,
                staff: employees?.filter(e => e.role === "staff").length ?? 0,
                teacher: employees?.filter(e => e.role === "teacher").length ?? 0,
                intern: employees?.filter(e => e.role === "intern").length ?? 0,
              };
              const labels = { all: "All", staff: "Staff", teacher: "Teachers", intern: "Interns" };
              return (
                <button
                  key={tab}
                  onClick={() => setRoleTab(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${roleTab === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {labels[tab]}
                  <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${roleTab === tab ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {counts[tab]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            Array(3).fill(0).map((_, i) => <div key={i} className="h-40 bg-muted/50 animate-pulse rounded-2xl border border-border/50" />)
          ) : filteredEmployees?.length === 0 ? (
            <div className="col-span-full p-12 text-center text-muted-foreground bg-card border border-border/50 rounded-2xl">
              No team members found.
            </div>
          ) : (
            filteredEmployees?.map((employee) => {
              const portalUser = getPortalUser((employee as any).userId);
              const portalRole = portalUser?.role;
              return (
                <div key={employee.id} className="bg-card rounded-2xl p-6 border border-border/50 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                  <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl opacity-10 rounded-bl-full -z-10 transition-opacity group-hover:opacity-20 ${employee.role === "staff" ? "from-primary to-transparent" : employee.role === "teacher" ? "from-[#00b199] to-transparent" : "from-orange-500 to-transparent"}`} />

                  <div className="flex justify-between items-start mb-4">
                    <div className="flex gap-4 items-center">
                      <Avatar className="h-12 w-12 border-2 border-background shadow-sm">
                        <AvatarFallback className={`font-display text-lg ${employee.role === "staff" ? "bg-primary/20 text-primary" : employee.role === "teacher" ? "bg-[#00b199]/20 text-[#00b199]" : "bg-orange-500/20 text-orange-600"}`}>
                          {employee.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-semibold text-lg text-foreground leading-none mb-1.5">{employee.name}</h3>
                        <Badge variant="secondary" className={`text-[10px] uppercase tracking-wider ${employee.role === "staff" ? "bg-primary/10 text-primary hover:bg-primary/20" : employee.role === "teacher" ? "bg-[#00b199]/10 text-[#00b199] hover:bg-[#00b199]/20" : "bg-orange-500/10 text-orange-600 hover:bg-orange-500/20"}`}>
                          {employee.role}
                        </Badge>
                        {(employee as any).isBandLeader && (
                          <Badge variant="secondary" className="text-[10px] uppercase tracking-wider bg-[#00b199]/10 text-[#00b199]">
                            Band Leader
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={employee.isActive ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-muted text-muted-foreground"}>
                        {employee.isActive ? "Active" : "Inactive"}
                      </Badge>
                      {isAdmin && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground" onClick={() => openEdit(employee)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 mt-5 pt-5 border-t border-border/50">
                    {employee.email && (
                      <div className="flex items-center text-sm text-muted-foreground">
                        <Mail className="h-4 w-4 mr-3 opacity-50" />
                        <a href={`mailto:${employee.email}`} className="hover:underline">{employee.email}</a>
                      </div>
                    )}
                    {employee.phone && (
                      <div className="flex items-center text-sm text-muted-foreground">
                        <Phone className="h-4 w-4 mr-3 opacity-50" />
                        <a href={`tel:${employee.phone}`} className="hover:underline">{employee.phone}</a>
                      </div>
                    )}

                    {isAdmin && (
                      <div className="pt-2 space-y-2">
                        {portalUser ? (
                          <>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-500/10 px-2.5 py-1 rounded-lg flex-1 min-w-0">
                                <Link2 className="h-3 w-3 shrink-0" />
                                <span className="truncate">{portalUser.email}</span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive rounded-lg"
                                title="Remove portal access"
                                onClick={() => {
                                  if (confirm(`Remove portal access for ${employee.name}? This only unlinks the account, it does not delete it.`)) {
                                    linkUser({ employeeId: employee.id, userId: null });
                                  }
                                }}
                              >
                                <Unlink className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="flex items-center justify-between px-0.5">
                              <span className="text-xs text-muted-foreground">Portal role:</span>
                              <div className="flex items-center gap-1.5">
                                {portalRole === "admin" ? (
                                  <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20 gap-1">
                                    <Shield className="h-2.5 w-2.5" /> Admin
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] text-muted-foreground gap-1">
                                    Employee
                                  </Badge>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[11px] rounded-md"
                                  onClick={() => {
                                    const newRole = portalRole === "admin" ? "employee" : "admin";
                                    updateRole({ id: portalUser.id, role: newRole }, {
                                      onSuccess: () => {
                                        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
                                        toast({ title: `${getUserDisplayName(portalUser)} is now ${newRole === "admin" ? "an Admin" : "an Employee"}` });
                                      },
                                      onError: () => toast({ title: "Failed to update role", variant: "destructive" }),
                                    });
                                  }}
                                >
                                  {portalRole === "admin" ? (
                                    <><ShieldOff className="h-3 w-3 mr-1" />Revoke</>
                                  ) : (
                                    <><Shield className="h-3 w-3 mr-1" />Make Admin</>
                                  )}
                                </Button>
                              </div>
                            </div>
                            <div className="flex gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs rounded-lg gap-1.5 flex-1"
                                onClick={() => { setResetPwTarget(portalUser); setNewPw(""); setShowPw(false); }}
                              >
                                <KeyRound className="h-3 w-3" /> Reset Password
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs rounded-lg gap-1 text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (confirm(`Delete the portal account for ${portalUser.email}? They will no longer be able to log in.`)) {
                                    deletePortalUser(portalUser.id);
                                  }
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs rounded-lg border-dashed gap-1.5 w-full"
                            onClick={() => {
                              setCreatePortalFor(employee);
                              portalForm.reset({
                                firstName: employee.name.split(" ")[0] || "",
                                lastName: employee.name.split(" ").slice(1).join(" ") || "",
                                email: employee.email || "",
                                password: "",
                                role: "employee",
                              });
                            }}
                          >
                            <KeyRound className="h-3 w-3" /> Create Portal Login
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Edit Employee Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Edit Team Member</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit((data) => updateEmployee({ ...data, id: editTarget?.id }))} className="space-y-4 mt-2">
              <FormField control={editForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name *</FormLabel>
                  <FormControl><Input className="rounded-xl" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel>Role *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="intern">Intern</SelectItem>
                      <SelectItem value="teacher">Teacher</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={editForm.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" className="rounded-xl" {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={editForm.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl><Input className="rounded-xl" {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={editForm.control} name="hourlyRate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Hourly Rate ($)</FormLabel>
                  <FormControl><Input type="number" step="0.01" min="0" className="rounded-xl" {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={editForm.control} name="isActive" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-xl border border-border/50 px-4 py-3">
                  <FormLabel className="cursor-pointer">Active</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )} />
              <FormField control={editForm.control} name="isBandLeader" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-xl border border-border/50 px-4 py-3">
                  <div>
                    <FormLabel className="cursor-pointer">Band Leader</FormLabel>
                    <p className="text-[11px] text-muted-foreground">This staff member leads bands at events</p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )} />
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => setEditTarget(null)}>Cancel</Button>
                <Button type="submit" disabled={isUpdating} className="rounded-xl">
                  {isUpdating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Create Portal Login Dialog */}
      <Dialog open={!!createPortalFor} onOpenChange={(open) => !open && setCreatePortalFor(null)}>
        <DialogContent className="sm:max-w-[420px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Create Portal Login</DialogTitle>
            <p className="text-sm text-muted-foreground pt-1">
              Create an account for <span className="font-medium text-foreground">{createPortalFor?.name}</span>.
              A welcome email with their temporary password will be sent automatically.
            </p>
          </DialogHeader>
          <Form {...portalForm}>
            <form onSubmit={portalForm.handleSubmit((data) => createPortalUser(data))} className="space-y-4 mt-1">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={portalForm.control} name="firstName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name *</FormLabel>
                    <FormControl><Input className="rounded-xl" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={portalForm.control} name="lastName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl><Input className="rounded-xl" {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <FormField control={portalForm.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Login Email *</FormLabel>
                  <FormControl><Input type="email" className="rounded-xl" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={portalForm.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel>Portal Role</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="employee">Employee — can view their schedule</SelectItem>
                      <SelectItem value="admin">Admin — full access</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => setCreatePortalFor(null)}>Cancel</Button>
                <Button type="submit" disabled={isCreatingPortal} className="rounded-xl">
                  {isCreatingPortal ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Create Login
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetPwTarget} onOpenChange={(open) => !open && setResetPwTarget(null)}>
        <DialogContent className="sm:max-w-[380px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Reset Password</DialogTitle>
            <p className="text-sm text-muted-foreground pt-1">{resetPwTarget?.email}</p>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>New Password</Label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="Min. 8 characters"
                className="rounded-xl pr-10"
              />
              <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setResetPwTarget(null)}>Cancel</Button>
            <Button
              className="rounded-xl"
              disabled={newPw.length < 8 || isResetting}
              onClick={() => resetPassword({ userId: resetPwTarget.id, password: newPw })}
            >
              {isResetting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Update Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
