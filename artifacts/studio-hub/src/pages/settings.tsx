import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription 
} from "@/components/ui/dialog";
import { 
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage 
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Mail, Plus, Trash2, Loader2, CheckCircle2, ExternalLink, Settings as SettingsIcon, FileText, X, Users, Shield
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@workspace/replit-auth-web";
import {
  useGoogleStatus,
  useGoogleDisconnect,
  useEmailTemplates,
  useCreateEmailTemplate,
  useDeleteEmailTemplate,
  type EmailTemplate,
} from "@/hooks/use-google";
import { useTeamMembers, useUpdateUserRole, type TeamMember } from "@/hooks/use-team";

const templateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
});

function TemplateCard({ template, onDelete }: { template: EmailTemplate; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const { mutate: deleteTemplate, isPending } = useDeleteEmailTemplate();
  const { toast } = useToast();

  return (
    <div className="border border-border/50 rounded-xl bg-card overflow-hidden">
      <div className="flex items-start justify-between p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-4 w-4 text-primary shrink-0" />
            <h3 className="font-semibold text-foreground truncate">{template.name}</h3>
          </div>
          <p className="text-sm text-muted-foreground truncate">{template.subject}</p>
        </div>
        <div className="flex items-center gap-2 ml-3 shrink-0">
          <Button variant="ghost" size="sm" className="h-8 text-xs rounded-lg" onClick={() => setExpanded(!expanded)}>
            {expanded ? "Hide" : "Preview"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            disabled={isPending}
            onClick={() => {
              deleteTemplate(template.id, {
                onSuccess: () => toast({ title: "Template deleted" }),
                onError: () => toast({ title: "Failed to delete template", variant: "destructive" }),
              });
              onDelete();
            }}
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t border-border/30 pt-3">
          <div className="bg-muted/30 rounded-lg p-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
            {template.body}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Merge fields: <code className="bg-muted px-1 rounded">{"{name}"}</code> <code className="bg-muted px-1 rounded">{"{first_name}"}</code> <code className="bg-muted px-1 rounded">{"{organization}"}</code>
          </p>
        </div>
      )}
    </div>
  );
}

function TeamMemberRow({ member }: { member: TeamMember }) {
  const { mutate: updateRole, isPending } = useUpdateUserRole();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const isSelf = member.id === currentUser?.id;

  const displayName = member.firstName
    ? `${member.firstName}${member.lastName ? ` ${member.lastName}` : ""}`.trim()
    : member.username || member.email || "Unknown";

  return (
    <div className="flex items-center justify-between p-4 border border-border/50 rounded-xl bg-card">
      <div className="flex items-center gap-3">
        <Avatar className="h-9 w-9 border border-border/20">
          <AvatarImage src={member.profileImageUrl || undefined} />
          <AvatarFallback className="bg-primary/20 text-primary text-xs font-medium">
            {displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{displayName}</p>
            {isSelf && <Badge variant="outline" className="text-[10px] px-1.5 py-0">You</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">{member.email || member.username}</p>
          {member.googleEmail && (
            <p className="text-[10px] text-primary/70 mt-0.5">Gmail: {member.googleEmail}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Select
          value={member.role}
          disabled={isPending || isSelf}
          onValueChange={(role) => {
            updateRole({ id: member.id, role }, {
              onSuccess: () => toast({ title: `${displayName} is now ${role === "admin" ? "an Admin" : "an Employee"}` }),
              onError: () => toast({ title: "Failed to update role", variant: "destructive" }),
            });
          }}
        >
          <SelectTrigger className="w-32 rounded-xl h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="employee">Employee</SelectItem>
          </SelectContent>
        </Select>
        {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
    </div>
  );
}

export default function Settings() {
  const { data: googleStatus, isLoading: isLoadingStatus } = useGoogleStatus();
  const { mutate: disconnect, isPending: isDisconnecting } = useGoogleDisconnect();
  const { data: templates = [], isLoading: isLoadingTemplates } = useEmailTemplates();
  const { mutate: createTemplate, isPending: isCreating } = useCreateEmailTemplate();
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = (user as any)?.role === "admin";

  const { data: teamMembers = [], isLoading: isLoadingTeam } = useTeamMembers();

  const [createOpen, setCreateOpen] = useState(false);

  const form = useForm<z.infer<typeof templateSchema>>({
    resolver: zodResolver(templateSchema),
    defaultValues: { name: "", subject: "", body: "" },
  });

  const handleCreate = (data: z.infer<typeof templateSchema>) => {
    createTemplate(data, {
      onSuccess: () => {
        toast({ title: "Template created" });
        setCreateOpen(false);
        form.reset();
      },
      onError: () => toast({ title: "Failed to create template", variant: "destructive" }),
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight flex items-center gap-3">
            <SettingsIcon className="h-8 w-8 text-primary" /> Settings
          </h1>
          <p className="text-muted-foreground mt-1">Manage Gmail, email templates, and team access.</p>
        </div>

        <Tabs defaultValue="gmail">
          <TabsList className="rounded-xl bg-muted/40 mb-6">
            <TabsTrigger value="gmail" className="rounded-lg">
              <Mail className="h-4 w-4 mr-2" /> Gmail
            </TabsTrigger>
            <TabsTrigger value="templates" className="rounded-lg">
              <FileText className="h-4 w-4 mr-2" /> Templates
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="team" className="rounded-lg">
                <Users className="h-4 w-4 mr-2" /> Team
              </TabsTrigger>
            )}
          </TabsList>

          {/* Gmail Tab */}
          <TabsContent value="gmail" className="space-y-4 mt-0">
            <div className="flex items-center gap-2 mb-2">
              <Mail className="h-5 w-5 text-primary" />
              <h2 className="font-display text-xl font-semibold">Gmail Integration</h2>
            </div>

            {isLoadingStatus ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : googleStatus?.connected ? (
              <div className="border border-emerald-500/20 bg-emerald-500/5 rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-foreground">Gmail Connected</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Sending as <span className="text-foreground font-medium">{googleStatus.googleEmail}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        You can send emails from contacts and track threads. Email threads linked to contacts appear in the contact history.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => disconnect({}, {
                      onSuccess: () => toast({ title: "Gmail disconnected" }),
                    })}
                    disabled={isDisconnecting}
                  >
                    {isDisconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <X className="h-3.5 w-3.5 mr-2" />}
                    Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              <div className="border border-border/50 bg-card rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-foreground">Connect Your Gmail</p>
                    <p className="text-sm text-muted-foreground mt-1 mb-4">
                      Link your Gmail account to send emails directly from contacts and track conversation threads without leaving the app.
                    </p>
                    <Button className="rounded-xl" onClick={() => window.location.href = "/api/auth/google"}>
                      <ExternalLink className="h-4 w-4 mr-2" /> Connect Gmail Account
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Email Templates Tab */}
          <TabsContent value="templates" className="space-y-4 mt-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <h2 className="font-display text-xl font-semibold">Email Templates</h2>
              </div>
              <Button size="sm" className="rounded-xl" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> New Template
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              Templates auto-fill when composing emails to contacts. Use merge fields like{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{"{name}"}</code> to personalize messages.
            </p>

            {isLoadingTemplates ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : templates.length === 0 ? (
              <div className="text-center py-12 bg-muted/20 rounded-xl border border-border/50 border-dashed">
                <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-muted-foreground">No templates yet.</p>
                <p className="text-sm text-muted-foreground/60 mt-1 mb-4">Create reusable email templates for outreach.</p>
                <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Create First Template
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {templates.map((t) => (
                  <TemplateCard key={t.id} template={t} onDelete={() => {}} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Team Tab — Admin only */}
          {isAdmin && (
            <TabsContent value="team" className="space-y-4 mt-0">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <h2 className="font-display text-xl font-semibold">Team & Roles</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Set each user's role. <strong>Admins</strong> see all contacts, can assign contacts, and manage everything. <strong>Employees</strong> only see contacts assigned to them.
              </p>

              {isLoadingTeam ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : teamMembers.length === 0 ? (
                <div className="text-center py-12 bg-muted/20 rounded-xl border border-border/50 border-dashed">
                  <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-muted-foreground">No team members yet.</p>
                  <p className="text-sm text-muted-foreground/60 mt-1">Users appear here after they sign in for the first time.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {teamMembers.map((m) => (
                    <TeamMemberRow key={m.id} member={m} />
                  ))}
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Create Template Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[520px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">New Email Template</DialogTitle>
            <DialogDescription>Create a reusable template for outreach emails.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4 py-2">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Template Name</FormLabel>
                  <FormControl><Input placeholder="Initial Outreach" className="rounded-xl" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}/>
              <FormField control={form.control} name="subject" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Subject</FormLabel>
                  <FormControl><Input placeholder="Partnership opportunity with The Music Space" className="rounded-xl" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}/>
              <FormField control={form.control} name="body" render={({ field }) => (
                <FormItem>
                  <FormLabel>Body</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={`Hi {first_name},\n\nI'm reaching out from The Music Space...`}
                      className="rounded-xl resize-none h-48 font-mono text-sm"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                  <p className="text-[10px] text-muted-foreground">
                    Available: <code className="bg-muted px-1 rounded">{"{name}"}</code> <code className="bg-muted px-1 rounded">{"{first_name}"}</code> <code className="bg-muted px-1 rounded">{"{organization}"}</code>
                  </p>
                </FormItem>
              )}/>
              <DialogFooter>
                <Button variant="ghost" type="button" onClick={() => setCreateOpen(false)} className="rounded-xl" disabled={isCreating}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreating} className="rounded-xl px-6">
                  {isCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  Create Template
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
