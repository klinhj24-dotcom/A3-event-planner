import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Loader2, Search, CalendarDays, Radio, Mail, Instagram, Printer, Globe,
  Plus, Pencil, Trash2, EyeOff, Eye, Receipt
} from "lucide-react";
import {
  useCommRules, useCreateCommRule, useUpdateCommRule, useDeleteCommRule,
  type CommRule
} from "@/hooks/use-team";
import { useAuth } from "@workspace/replit-auth-web";
import { useToast } from "@/hooks/use-toast";

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  "Email": <Mail className="h-3.5 w-3.5" />,
  "Email to Past Clients": <Mail className="h-3.5 w-3.5" />,
  "Email to Enrolled Students": <Mail className="h-3.5 w-3.5" />,
  "Email to Enrolled Clients": <Mail className="h-3.5 w-3.5" />,
  "Instagram Post": <Instagram className="h-3.5 w-3.5" />,
  "Instagram Story": <Instagram className="h-3.5 w-3.5" />,
  "Print": <Printer className="h-3.5 w-3.5" />,
  "Website": <Globe className="h-3.5 w-3.5" />,
  "Invoice": <Receipt className="h-3.5 w-3.5" />,
};

const COMM_TYPE_COLORS: Record<string, string> = {
  "Email": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "Social Media": "bg-pink-500/10 text-pink-400 border-pink-500/20",
  "In-Studio": "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "Print": "bg-green-500/10 text-green-400 border-green-500/20",
  "Website": "bg-purple-500/10 text-purple-400 border-purple-500/20",
};


const COMM_TYPE_OPTIONS = ["Email", "Social Media", "In-Studio", "Print", "Website"];

const CHANNEL_OPTIONS = [
  "Email",
  "Email to Past Clients",
  "Email to Enrolled Students",
  "Email to Enrolled Clients",
  "Instagram Post",
  "Instagram Story",
  "Print",
  "Website",
  "Invoice",
];

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

interface RuleFormState {
  eventType: string;
  commType: string;
  messageName: string;
  timingDays: number;
  channel: string;
  notes: string;
  isActive: boolean;
}

const EMPTY_FORM: RuleFormState = {
  eventType: "Recital",
  commType: "Email",
  messageName: "",
  timingDays: -14,
  channel: "",
  notes: "",
  isActive: true,
};

function ruleToForm(rule: CommRule): RuleFormState {
  return {
    eventType: rule.eventType,
    commType: rule.commType,
    messageName: rule.messageName ?? "",
    timingDays: rule.timingDays,
    channel: rule.channel ?? "",
    notes: rule.notes ?? "",
    isActive: rule.isActive,
  };
}

function RuleDialog({
  open,
  onClose,
  editRule,
  defaultEventType,
}: {
  open: boolean;
  onClose: () => void;
  editRule?: CommRule;
  defaultEventType?: string;
}) {
  const { toast } = useToast();
  const isEdit = !!editRule;
  const { mutate: create, isPending: creating } = useCreateCommRule();
  const { mutate: update, isPending: updating } = useUpdateCommRule();
  const [form, setForm] = useState<RuleFormState>(() =>
    editRule ? ruleToForm(editRule) : { ...EMPTY_FORM, eventType: defaultEventType ?? EMPTY_FORM.eventType }
  );

  const isPending = creating || updating;

  useEffect(() => {
    setForm(editRule ? ruleToForm(editRule) : { ...EMPTY_FORM, eventType: defaultEventType ?? EMPTY_FORM.eventType });
  }, [editRule, defaultEventType]);

  function set<K extends keyof RuleFormState>(key: K, val: RuleFormState[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function handleSubmit() {
    if (!form.commType) {
      toast({ title: "Comm type is required", variant: "destructive" });
      return;
    }
    const payload = {
      eventType: form.eventType,
      eventTagGroup: isEdit ? (editRule!.eventTagGroup ?? null) : null,
      eventTag: isEdit ? (editRule!.eventTag ?? null) : null,
      commType: form.commType,
      messageName: form.messageName || null,
      timingDays: form.timingDays,
      channel: form.channel || null,
      notes: form.notes || null,
      isActive: form.isActive,
    };

    if (isEdit) {
      update({ id: editRule!.id, ...payload }, {
        onSuccess: () => { toast({ title: "Rule updated" }); onClose(); },
        onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
      });
    } else {
      create(payload as any, {
        onSuccess: () => { toast({ title: "Rule created" }); onClose(); setForm(EMPTY_FORM); },
        onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[560px] rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {isEdit ? "Edit Rule" : "Add Comm Rule"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the communication rule details."
              : "Add a new rule to the communications schedule."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Comm Type *</Label>
              <Select value={form.commType} onValueChange={v => set("commType", v)}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMM_TYPE_OPTIONS.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Channel</Label>
              <Select value={form.channel || "__none__"} onValueChange={v => set("channel", v === "__none__" ? "" : v)}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {CHANNEL_OPTIONS.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Message / Purpose</Label>
            <Input
              placeholder="e.g. Save the date announcement"
              className="rounded-xl"
              value={form.messageName}
              onChange={e => set("messageName", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Timing</Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                className="rounded-xl w-28"
                value={form.timingDays}
                onChange={e => set("timingDays", parseInt(e.target.value) || 0)}
              />
              <span className="text-sm text-muted-foreground">
                {form.timingDays < 0
                  ? `${Math.abs(form.timingDays)} days before event`
                  : form.timingDays === 0
                    ? "Day of event"
                    : `${form.timingDays} days after event`}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Negative = before event, 0 = day of, positive = after</p>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              placeholder="Any additional context or instructions..."
              className="rounded-xl resize-none"
              rows={3}
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
            />
          </div>

          {isEdit && (
            <div className="flex items-center justify-between rounded-xl border border-border/50 p-3 bg-muted/20">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Inactive rules are skipped when generating comm tasks</p>
              </div>
              <Switch checked={form.isActive} onCheckedChange={v => set("isActive", v)} />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button className="rounded-xl" onClick={handleSubmit} disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isEdit ? "Save Changes" : "Add Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CommSchedule() {
  const { data: rules = [], isLoading } = useCommRules();
  const { mutate: updateRule } = useUpdateCommRule();
  const { mutate: deleteRule, isPending: deleting } = useDeleteCommRule();
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState("All");
  const [showInactive, setShowInactive] = useState(false);
  const { user } = useAuth();
  const isAdmin = (user as any)?.role === "admin";
  const { toast } = useToast();

  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CommRule | undefined>(undefined);
  const [newRuleEventType, setNewRuleEventType] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<CommRule | null>(null);

  function openCreate(eventType?: string) {
    setEditingRule(undefined);
    setNewRuleEventType(eventType);
    setRuleDialogOpen(true);
  }

  function openEdit(rule: CommRule) {
    setEditingRule(rule);
    setRuleDialogOpen(true);
  }

  function closeDialog() {
    setRuleDialogOpen(false);
    setEditingRule(undefined);
    setNewRuleEventType(undefined);
  }

  function toggleActive(rule: CommRule) {
    updateRule(
      { ...rule, id: rule.id, isActive: !rule.isActive },
      {
        onSuccess: () => toast({ title: rule.isActive ? "Rule deactivated" : "Rule activated" }),
        onError: () => toast({ title: "Failed to update rule", variant: "destructive" }),
      }
    );
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteRule(deleteTarget.id, {
      onSuccess: () => { toast({ title: "Rule deleted" }); setDeleteTarget(null); },
      onError: () => toast({ title: "Failed to delete rule", variant: "destructive" }),
    });
  }

  const filtered = rules.filter(r => {
    const matchType = selectedType === "All" || r.eventType === selectedType;
    const matchActive = showInactive ? true : r.isActive;
    const matchSearch = !search ||
      r.eventType.toLowerCase().includes(search.toLowerCase()) ||
      (r.messageName?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (r.channel?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (r.commType?.toLowerCase().includes(search.toLowerCase()) ?? false);
    return matchType && matchActive && matchSearch;
  });

  const grouped = filtered.reduce<Record<string, CommRule[]>>((acc, rule) => {
    if (!acc[rule.eventType]) acc[rule.eventType] = [];
    acc[rule.eventType].push(rule);
    return acc;
  }, {});

  const activeCount = rules.filter(r => r.isActive).length;
  const inactiveCount = rules.length - activeCount;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight flex items-center gap-3">
              <Radio className="h-8 w-8 text-primary" /> Communications Schedule
            </h1>
            <p className="text-muted-foreground mt-1">
              {activeCount} active rules across {new Set(rules.filter(r => r.isActive).map(r => r.eventType)).size} event types.
              {inactiveCount > 0 && <span className="text-muted-foreground/60"> ({inactiveCount} inactive)</span>}
            </p>
          </div>
          {isAdmin && (
            <Button
              onClick={openCreate}
              className="rounded-xl shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all"
            >
              <Plus className="h-4 w-4 mr-2" /> Add Rule
            </Button>
          )}
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
            {["All", "Email", "Social Media", "Open Mic", "Recital"].map(f => (
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
          {isAdmin && inactiveCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className={`rounded-xl h-9 text-xs gap-1.5 ${showInactive ? "text-foreground" : "text-muted-foreground"}`}
              onClick={() => setShowInactive(v => !v)}
            >
              {showInactive ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {showInactive ? "Hide inactive" : `Show ${inactiveCount} inactive`}
            </Button>
          )}
        </div>

        {/* Rules grouped by event type */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center py-16 bg-muted/20 rounded-2xl border border-border/50 border-dashed">
            <Radio className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground">No rules match your search.</p>
            {isAdmin && (
              <Button variant="outline" className="mt-4 rounded-xl" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" /> Add a Rule
              </Button>
            )}
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
                      {typeRules.filter(r => r.isActive).length} active
                    </Badge>
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 rounded-lg text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => openCreate(eventType)}
                        title={`Add rule for ${eventType}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    )}
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
                        {isAdmin && <TableHead className="text-xs font-semibold text-right w-24">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {typeRules
                        .sort((a, b) => a.timingDays - b.timingDays)
                        .map((rule) => (
                          <TableRow
                            key={rule.id}
                            className={`text-sm transition-colors ${!rule.isActive ? "opacity-40" : "hover:bg-muted/20"}`}
                          >
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
                            {isAdmin && (
                              <TableCell className="py-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    title={rule.isActive ? "Deactivate" : "Activate"}
                                    className={`h-7 w-7 p-0 rounded-lg ${rule.isActive ? "text-muted-foreground hover:text-amber-400" : "text-amber-400 hover:text-amber-300"}`}
                                    onClick={() => toggleActive(rule)}
                                  >
                                    {rule.isActive ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    title="Edit rule"
                                    className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                                    onClick={() => openEdit(rule)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    title="Delete rule"
                                    className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-destructive"
                                    onClick={() => setDeleteTarget(rule)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            )}
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

      {/* Create / Edit dialog */}
      <RuleDialog
        open={ruleDialogOpen}
        onClose={closeDialog}
        editRule={editingRule}
        defaultEventType={newRuleEventType}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.messageName || deleteTarget?.commType}</strong> for{" "}
              <strong>{deleteTarget?.eventType}</strong> will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive hover:bg-destructive/90"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
