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
  Mail, Plus, Trash2, Loader2, CheckCircle2, ExternalLink, Settings as SettingsIcon, FileText, X, Users, Shield, Tag, Pencil, Check, KeyRound, Eye, EyeOff
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
import { useEventTypes, useCreateEventType, useUpdateEventType, useDeleteEventType, type EventType } from "@/hooks/use-event-types";
import { useStaffRoleTypes, useCreateStaffRoleType, useUpdateStaffRoleType, useDeleteStaffRoleType, type StaffRoleType } from "@/hooks/use-staff-roles";

const EVENT_TYPE_FEATURES: { key: "defaultHasBandLineup" | "defaultHasStaffSchedule" | "defaultHasCallSheet" | "defaultHasPackingList"; label: string; onClass: string; offClass: string }[] = [
  { key: "defaultHasBandLineup", label: "Band Lineup", onClass: "text-primary bg-primary/10 border-primary/20", offClass: "text-muted-foreground/40 border-border/30 hover:text-muted-foreground hover:border-border/60" },
  { key: "defaultHasStaffSchedule", label: "Staff Schedule", onClass: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", offClass: "text-muted-foreground/40 border-border/30 hover:text-muted-foreground hover:border-border/60" },
  { key: "defaultHasCallSheet", label: "Call Sheet", onClass: "text-sky-500 bg-sky-500/10 border-sky-500/20", offClass: "text-muted-foreground/40 border-border/30 hover:text-muted-foreground hover:border-border/60" },
  { key: "defaultHasPackingList", label: "Packing List", onClass: "text-amber-500 bg-amber-500/10 border-amber-500/20", offClass: "text-muted-foreground/40 border-border/30 hover:text-muted-foreground hover:border-border/60" },
];

function EventTypeRow({ et }: { et: EventType }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(et.name);
  const { mutate: update, isPending: saving } = useUpdateEventType();
  const { mutate: del, isPending: deleting } = useDeleteEventType();
  const { toast } = useToast();

  const save = () => {
    if (!draft.trim() || draft.trim() === et.name) { setEditing(false); setDraft(et.name); return; }
    update({ id: et.id, name: draft.trim() }, {
      onSuccess: () => { toast({ title: "Renamed — all existing events and rules updated" }); setEditing(false); },
      onError: (e: any) => toast({ title: e.message ?? "Rename failed", variant: "destructive" }),
    });
  };

  const toggleFeature = (key: typeof EVENT_TYPE_FEATURES[number]["key"]) => {
    update({ id: et.id, [key]: !et[key] }, {
      onError: (e: any) => toast({ title: e.message ?? "Update failed", variant: "destructive" }),
    });
  };

  return (
    <div className="border-b border-border/40 last:border-0 group">
      {/* Name row */}
      <div className="flex items-center gap-2 px-4 py-2.5">
        <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        {editing ? (
          <>
            <input
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") { setEditing(false); setDraft(et.name); } }}
              className="flex-1 bg-transparent text-sm border-b border-primary outline-none py-0.5"
            />
            <button onClick={save} disabled={saving} className="text-primary hover:text-primary/80">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </button>
            <button onClick={() => { setEditing(false); setDraft(et.name); }} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <span className="flex-1 text-sm font-medium text-foreground">{et.name}</span>
            <button onClick={() => setEditing(true)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => del(et.id, { onError: (e: any) => toast({ title: e.message ?? "Delete failed", variant: "destructive" }) })} disabled={deleting} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          </>
        )}
      </div>
      {/* Feature defaults row */}
      <div className="flex items-center gap-1 px-4 pb-2.5 flex-wrap">
        {EVENT_TYPE_FEATURES.map(({ key, label, onClass, offClass }) => {
          const enabled = et[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleFeature(key)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all ${enabled ? onClass : offClass}`}
              title={enabled ? `${label}: on by default — click to turn off` : `${label}: off by default — click to turn on`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${enabled ? "bg-current" : "bg-muted-foreground/30"}`} />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StaffRoleRow({ role }: { role: StaffRoleType }) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(role.name);
  const [draftColor, setDraftColor] = useState(role.color ?? "#7250ef");
  const { mutate: update, isPending: saving } = useUpdateStaffRoleType();
  const { mutate: del, isPending: deleting } = useDeleteStaffRoleType();
  const { toast } = useToast();

  const save = () => {
    update({ id: role.id, name: draftName.trim() || role.name, color: draftColor }, {
      onSuccess: () => { toast({ title: "Role updated" }); setEditing(false); },
      onError: (e: any) => toast({ title: e.message ?? "Update failed", variant: "destructive" }),
    });
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/40 last:border-0 group">
      <span className="w-3 h-3 rounded-full shrink-0 border border-white/10" style={{ backgroundColor: role.color ?? "#7250ef" }} />
      {editing ? (
        <>
          <input type="color" value={draftColor} onChange={e => setDraftColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0" />
          <input
            autoFocus
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") { setEditing(false); setDraftName(role.name); setDraftColor(role.color ?? "#7250ef"); } }}
            className="flex-1 bg-transparent text-sm border-b border-primary outline-none py-0.5"
          />
          <button onClick={save} disabled={saving} className="text-primary hover:text-primary/80">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button onClick={() => { setEditing(false); setDraftName(role.name); setDraftColor(role.color ?? "#7250ef"); }} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <>
          <span className="flex-1 text-sm text-foreground">{role.name}</span>
          <button onClick={() => setEditing(true)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => del(role.id, { onError: (e: any) => toast({ title: e.message ?? "Delete failed", variant: "destructive" }) })} disabled={deleting} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        </>
      )}
    </div>
  );
}

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
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <FileText className="h-4 w-4 text-primary shrink-0" />
            <h3 className="font-semibold text-foreground truncate">{template.name}</h3>
            {template.category && (
              <Badge variant="secondary" className="text-[10px] font-medium py-0 px-1.5 rounded-full shrink-0">
                {template.category.replace(/-/g, " ")}
              </Badge>
            )}
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
            Variables: <code className="bg-muted px-1 rounded">{`{{recipient_name}}`}</code> <code className="bg-muted px-1 rounded">{`{{event_title}}`}</code> <code className="bg-muted px-1 rounded">{`{{event_date}}`}</code> <code className="bg-muted px-1 rounded">{`{{event_location}}`}</code> <code className="bg-muted px-1 rounded">{`{{signup_link}}`}</code>
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
  const { data: eventTypes = [], isLoading: isLoadingTypes } = useEventTypes();
  const { mutate: createEventType, isPending: isCreatingType } = useCreateEventType();
  const [newTypeName, setNewTypeName] = useState("");
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleColor, setNewRoleColor] = useState("#7250ef");
  const { data: staffRoles = [], isLoading: isLoadingRoles } = useStaffRoleTypes();
  const { mutate: createRole, isPending: isCreatingRole } = useCreateStaffRoleType();

  const handleAddEventType = () => {
    if (!newTypeName.trim()) return;
    createEventType(newTypeName.trim(), {
      onSuccess: () => { toast({ title: "Event type added" }); setNewTypeName(""); },
      onError: (e: any) => toast({ title: e.message ?? "Failed to add", variant: "destructive" }),
    });
  };

  const [createOpen, setCreateOpen] = useState(false);

  // Change password state
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [isChangingPw, setIsChangingPw] = useState(false);

  const handleChangePassword = async () => {
    if (!currentPw || !newPw || !confirmPw) return;
    if (newPw !== confirmPw) { toast({ title: "Passwords don't match", variant: "destructive" }); return; }
    if (newPw.length < 8) { toast({ title: "New password must be at least 8 characters", variant: "destructive" }); return; }
    setIsChangingPw(true);
    try {
      const res = await fetch("/api/users/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update password");
      }
      toast({ title: "Password updated successfully" });
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setIsChangingPw(false);
    }
  };

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

        {/* Change Password */}
        <div className="rounded-2xl border border-border/20 bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-base">Change Password</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Current Password</label>
              <div className="relative">
                <Input type={showCurrentPw ? "text" : "password"} value={currentPw} onChange={e => setCurrentPw(e.target.value)} className="rounded-xl pr-10" placeholder="••••••••" />
                <button type="button" onClick={() => setShowCurrentPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                  {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">New Password</label>
              <div className="relative">
                <Input type={showNewPw ? "text" : "password"} value={newPw} onChange={e => setNewPw(e.target.value)} className="rounded-xl pr-10" placeholder="Min. 8 characters" />
                <button type="button" onClick={() => setShowNewPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                  {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Confirm New Password</label>
              <Input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className="rounded-xl" placeholder="••••••••" />
            </div>
          </div>
          <Button onClick={handleChangePassword} disabled={isChangingPw || !currentPw || !newPw || !confirmPw} className="rounded-xl" size="sm">
            {isChangingPw ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <KeyRound className="h-4 w-4 mr-2" />}
            Update Password
          </Button>
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
            {isAdmin && (
              <TabsTrigger value="event-types" className="rounded-lg">
                <Tag className="h-4 w-4 mr-2" /> Event Types
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="staff-roles" className="rounded-lg">
                <Users className="h-4 w-4 mr-2" /> Staff Roles
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
            <TabsContent value="event-types" className="space-y-4 mt-0">
              <div className="flex items-center gap-2 mb-2">
                <Tag className="h-5 w-5 text-primary" />
                <h2 className="font-display text-xl font-semibold">Event Types</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Manage the event types used across Events, Comm Schedule, and Packing Lists. Renaming a type automatically updates all existing events and comm rules.
              </p>
              <div className="border border-border/50 rounded-xl bg-card overflow-hidden">
                {isLoadingTypes ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : eventTypes.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">No event types yet.</div>
                ) : (
                  <div>
                    {eventTypes.map(et => <EventTypeRow key={et.id} et={et} />)}
                  </div>
                )}
                <div className="flex items-center gap-2 p-3 border-t border-border/40 bg-muted/20">
                  <input
                    value={newTypeName}
                    onChange={e => setNewTypeName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAddEventType()}
                    placeholder="New event type name..."
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
                  />
                  <Button size="sm" variant="ghost" className="h-7 px-3 rounded-lg text-xs" onClick={handleAddEventType} disabled={isCreatingType || !newTypeName.trim()}>
                    {isCreatingType ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                    Add
                  </Button>
                </div>
              </div>
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="staff-roles" className="space-y-4 mt-0">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-5 w-5 text-primary" />
                <h2 className="font-display text-xl font-semibold">Staff Roles</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Define the roles available when scheduling staff for events — e.g. Sound Engineer, Booth Staff, Intern. Each role gets a color used in the staff schedule.
              </p>
              <div className="border border-border/50 rounded-xl bg-card overflow-hidden">
                {isLoadingRoles ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : staffRoles.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">No staff roles yet.</div>
                ) : (
                  <div>{staffRoles.map(r => <StaffRoleRow key={r.id} role={r} />)}</div>
                )}
                <div className="flex items-center gap-2 p-3 border-t border-border/40 bg-muted/20">
                  <input
                    type="color"
                    value={newRoleColor}
                    onChange={e => setNewRoleColor(e.target.value)}
                    className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0 shrink-0"
                  />
                  <input
                    value={newRoleName}
                    onChange={e => setNewRoleName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && newRoleName.trim()) {
                        createRole({ name: newRoleName.trim(), color: newRoleColor }, { onSuccess: () => setNewRoleName("") });
                      }
                    }}
                    placeholder="New role name…"
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
                  />
                  <Button size="sm" variant="ghost" className="h-7 px-3 rounded-lg text-xs" onClick={() => { if (newRoleName.trim()) createRole({ name: newRoleName.trim(), color: newRoleColor }, { onSuccess: () => setNewRoleName("") }); }} disabled={isCreatingRole || !newRoleName.trim()}>
                    {isCreatingRole ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                    Add
                  </Button>
                </div>
              </div>
            </TabsContent>
          )}

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
