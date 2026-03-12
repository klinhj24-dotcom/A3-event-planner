import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListEmployees, useCreateEmployee } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, UserPlus, Mail, Phone, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const employeeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  role: z.string().min(1, "Role is required"),
});

export default function Employees() {
  const [search, setSearch] = useState("");
  const { data: employees, isLoading } = useListEmployees();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);

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
    defaultValues: { name: "", role: "intern", email: "", phone: "" }
  });

  const filteredEmployees = employees?.filter(e => 
    e.name.toLowerCase().includes(search.toLowerCase()) || 
    e.role.toLowerCase().includes(search.toLowerCase())
  );

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
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}
