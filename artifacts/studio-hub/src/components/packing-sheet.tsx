import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Package, Wand2, RotateCcw, ChevronDown, ChevronUp, Pencil, Check, AlertTriangle, Layers
} from "lucide-react";

// ── Preset types ──────────────────────────────────────────────────────────────
interface PackingPreset {
  name: string;
  itemCount: number;
  items: Array<{ name: string; category: string }>;
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface PackingTemplate {
  id: number; name: string; category: string;
  appliesToEventType?: string | null; isActive: boolean;
}
interface PackingItem {
  id: number; eventId: number; templateId?: number | null;
  name: string; category: string; isPacked: boolean; notes?: string | null;
}

// ── Category metadata ──────────────────────────────────────────────────────────
const CATEGORIES = [
  "Booth & Display",
  "Marketing Materials",
  "Admin & Payments",
  "Sound & AV",
  "General",
];

const CATEGORY_COLORS: Record<string, string> = {
  "Booth & Display":    "bg-violet-500/10 text-violet-400 border-violet-500/20",
  "Marketing Materials":"bg-blue-500/10 text-blue-400 border-blue-500/20",
  "Admin & Payments":  "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "Sound & AV":         "bg-[#00b199]/10 text-[#00b199] border-[#00b199]/20",
  "General":            "bg-muted/60 text-muted-foreground border-border/40",
};

const EVENT_TYPES = [
  "performance", "enrichment_club", "workshop", "private_event",
  "community_event", "fundraiser", "camp", "other",
];
const EVENT_TYPE_LABELS: Record<string, string> = {
  performance: "Performance", enrichment_club: "Enrichment Club",
  workshop: "Workshop", private_event: "Private Event",
  community_event: "Community Event", fundraiser: "Fundraiser",
  camp: "Camp", other: "Other",
};

function catColor(cat: string) {
  return CATEGORY_COLORS[cat] ?? CATEGORY_COLORS["General"];
}

// ── Main sheet ─────────────────────────────────────────────────────────────────
export function PackingSheet({ event, open, onClose }: {
  event: { id: number; title: string; type?: string } | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const eventId = event?.id;

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: presets = [] } = useQuery<PackingPreset[]>({
    queryKey: ["/api/packing-presets"],
    queryFn: async () => { const r = await fetch("/api/packing-presets", { credentials: "include" }); return r.json(); },
    enabled: open,
  });

  const { data: templates = [] } = useQuery<PackingTemplate[]>({
    queryKey: ["/api/packing-templates"],
    queryFn: async () => { const r = await fetch("/api/packing-templates"); return r.json(); },
    enabled: open,
  });

  const { data: items = [], isLoading: loadingItems } = useQuery<PackingItem[]>({
    queryKey: [`/api/events/${eventId}/packing`],
    queryFn: async () => { const r = await fetch(`/api/events/${eventId}/packing`); return r.json(); },
    enabled: open && !!eventId,
  });

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const packed = items.filter(i => i.isPacked).length;
  const total = items.length;
  const pct = total > 0 ? Math.round((packed / total) * 100) : 0;

  // ── Item mutations ────────────────────────────────────────────────────────────
  const { mutate: toggleItem } = useMutation({
    mutationFn: async ({ id, isPacked }: { id: number; isPacked: boolean }) => {
      await fetch(`/api/events/${eventId}/packing/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPacked }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/events/${eventId}/packing`] }),
  });

  const { mutate: deleteItem } = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/events/${eventId}/packing/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/events/${eventId}/packing`] }),
  });

  const { mutate: addItem, isPending: addingItem } = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch(`/api/events/${eventId}/packing`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/events/${eventId}/packing`] });
      setNewItemName("");
    },
  });

  const { mutate: generateFromTemplates, isPending: generating } = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/events/${eventId}/packing/from-templates`, { method: "POST" });
      return r.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [`/api/events/${eventId}/packing`] });
      toast({ title: data.added > 0 ? `Added ${data.added} items from templates` : "All templates already applied" });
    },
  });

  const { mutate: resetAll, isPending: resetting } = useMutation({
    mutationFn: async () => {
      await fetch(`/api/events/${eventId}/packing/reset`, { method: "POST" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/events/${eventId}/packing`] });
      toast({ title: "Packing list reset" });
    },
  });

  const { mutate: clearAll, isPending: clearing } = useMutation({
    mutationFn: async () => {
      await fetch(`/api/events/${eventId}/packing`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/events/${eventId}/packing`] });
      setClearConfirmOpen(false);
      toast({ title: "Packing list cleared" });
    },
  });

  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const [addingPreset, setAddingPreset] = useState<string | null>(null);
  const { mutate: addFromPreset } = useMutation({
    mutationFn: async (presetName: string) => {
      const r = await fetch(`/api/events/${eventId}/packing/from-preset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ presetName }),
      });
      return r.json();
    },
    onSuccess: (data, presetName) => {
      qc.invalidateQueries({ queryKey: [`/api/events/${eventId}/packing`] });
      setAddingPreset(null);
      toast({ title: data.added > 0 ? `Added ${data.added} items from "${presetName}"` : `All "${presetName}" items already in list` });
    },
    onError: () => { setAddingPreset(null); toast({ title: "Failed to add preset", variant: "destructive" }); },
  });

  const [presetsOpen, setPresetsOpen] = useState(true);
  const [expandedPreset, setExpandedPreset] = useState<string | null>(null);

  // ── Add custom item ───────────────────────────────────────────────────────────
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("General");

  // ── Template mutations ────────────────────────────────────────────────────────
  const [addTemplateOpen, setAddTemplateOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: "", category: "General", appliesToEventType: "" });
  const [editTemplateId, setEditTemplateId] = useState<number | null>(null);

  const { mutate: saveTemplate, isPending: savingTemplate } = useMutation({
    mutationFn: async (data: any) => {
      const isEdit = !!editTemplateId;
      const url = isEdit ? `/api/packing-templates/${editTemplateId}` : "/api/packing-templates";
      const r = await fetch(url, { method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/packing-templates"] });
      setAddTemplateOpen(false);
      setEditTemplateId(null);
      setTemplateForm({ name: "", category: "General", appliesToEventType: "" });
      toast({ title: editTemplateId ? "Template updated" : "Template added" });
    },
  });

  const { mutate: deleteTemplate } = useMutation({
    mutationFn: async (id: number) => { await fetch(`/api/packing-templates/${id}`, { method: "DELETE" }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/packing-templates"] }),
  });

  function openEditTemplate(t: PackingTemplate) {
    setEditTemplateId(t.id);
    setTemplateForm({ name: t.name, category: t.category, appliesToEventType: t.appliesToEventType ?? "" });
    setAddTemplateOpen(true);
  }

  // ── Group items by category ───────────────────────────────────────────────────
  const grouped = CATEGORIES.reduce<Record<string, PackingItem[]>>((acc, cat) => {
    acc[cat] = items.filter(i => i.category === cat);
    return acc;
  }, {});
  // Catch any items with unknown categories
  const unknownCats = [...new Set(items.filter(i => !CATEGORIES.includes(i.category)).map(i => i.category))];
  unknownCats.forEach(cat => { grouped[cat] = items.filter(i => i.category === cat); });
  const allCats = [...CATEGORIES, ...unknownCats].filter(cat => grouped[cat]?.length > 0);

  // ── Group templates by category for left panel ────────────────────────────────
  const [templatesOpen, setTemplatesOpen] = useState(true);
  const templatesByCat = templates.reduce<Record<string, PackingTemplate[]>>((acc, t) => {
    (acc[t.category] ??= []).push(t);
    return acc;
  }, {});

  return (
    <Sheet open={open} onOpenChange={o => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:w-full sm:max-w-5xl p-0 flex flex-col overflow-hidden">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/30 shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle className="font-display text-xl flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                Packing List — <span className="text-muted-foreground font-normal">{event?.title}</span>
              </SheetTitle>
              {total > 0 && (
                <div className="flex items-center gap-3 mt-2">
                  <Progress value={pct} className="w-40 h-2" />
                  <span className="text-xs text-muted-foreground">
                    {packed}/{total} packed{pct === 100 ? " ✓ All set!" : ""}
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="rounded-xl gap-1.5 text-xs h-8"
                onClick={() => generateFromTemplates()} disabled={generating}>
                <Wand2 className="h-3.5 w-3.5" />
                {generating ? "Loading…" : "Load from templates"}
              </Button>
              {packed > 0 && (
                <Button size="sm" variant="ghost" className="rounded-xl gap-1.5 text-xs h-8 text-muted-foreground"
                  onClick={() => resetAll()} disabled={resetting}>
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </Button>
              )}
              {total > 0 && (
                <Button size="sm" variant="ghost" className="rounded-xl gap-1.5 text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setClearConfirmOpen(true)} disabled={clearing}>
                  <Trash2 className="h-3 w-3" />
                  Clear list
                </Button>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* ── Left: Preset Groups + Template manager ──────────────────────── */}
          <div className="w-72 shrink-0 border-r border-border/30 flex flex-col overflow-hidden">

            {/* Preset Groups */}
            <button
              onClick={() => setPresetsOpen(o => !o)}
              className="flex items-center justify-between px-4 py-3 border-b border-border/20 hover:bg-muted/20 transition-colors shrink-0"
            >
              <span className="text-sm font-semibold flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-primary" /> Preset Groups
              </span>
              {presetsOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>

            {presetsOpen && (
              <div className="border-b border-border/20 p-2 space-y-1 shrink-0">
                {presets.map(preset => {
                  const isExpanded = expandedPreset === preset.name;
                  const isAdding = addingPreset === preset.name;
                  return (
                    <div key={preset.name} className="rounded-lg border border-border/20 bg-muted/10 overflow-hidden">
                      <div className="flex items-center gap-2 px-2.5 py-2">
                        <button
                          className="flex-1 flex items-center gap-1.5 text-left min-w-0"
                          onClick={() => setExpandedPreset(isExpanded ? null : preset.name)}
                        >
                          <span className="text-xs font-medium text-foreground truncate">{preset.name}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{preset.itemCount}</span>
                          {isExpanded
                            ? <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
                            : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />}
                        </button>
                        <button
                          onClick={() => { setAddingPreset(preset.name); addFromPreset(preset.name); }}
                          disabled={isAdding}
                          className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                        >
                          {isAdding ? "Adding…" : "+ Add"}
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="px-2.5 pb-2 space-y-0.5">
                          {preset.items.map((item, idx) => (
                            <p key={idx} className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                              <span className="h-1 w-1 rounded-full bg-muted-foreground/40 shrink-0" />
                              {item.name}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Custom Templates */}
            <button
              onClick={() => setTemplatesOpen(o => !o)}
              className="flex items-center justify-between px-4 py-3 border-b border-border/20 hover:bg-muted/20 transition-colors shrink-0"
            >
              <span className="text-sm font-semibold">Custom Templates</span>
              {templatesOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>

            {templatesOpen && (
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                <Button size="sm" variant="outline" className="w-full rounded-xl gap-1.5 text-xs h-8"
                  onClick={() => { setEditTemplateId(null); setTemplateForm({ name: "", category: "General", appliesToEventType: "" }); setAddTemplateOpen(true); }}>
                  <Plus className="h-3 w-3" /> Add Template Item
                </Button>

                {templates.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No templates yet. Add items you'll need for events.
                  </p>
                )}

                {Object.entries(templatesByCat).map(([cat, catTemplates]) => (
                  <div key={cat}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-1.5">{cat}</p>
                    <div className="space-y-1">
                      {catTemplates.map(t => (
                        <div key={t.id} className="flex items-center gap-2 rounded-lg bg-muted/20 border border-border/20 px-2.5 py-2 group">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{t.name}</p>
                            {t.appliesToEventType && (
                              <Badge variant="outline" className="text-[9px] mt-0.5 h-4 px-1 border-border/30 text-muted-foreground">
                                {EVENT_TYPE_LABELS[t.appliesToEventType] ?? t.appliesToEventType}
                              </Badge>
                            )}
                          </div>
                          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEditTemplate(t)} className="p-0.5 text-muted-foreground hover:text-foreground">
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button onClick={() => deleteTemplate(t.id)} className="p-0.5 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Right: Event packing list ──────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {loadingItems && <p className="text-sm text-muted-foreground">Loading…</p>}

            {!loadingItems && total === 0 && (
              <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-border/50 text-center">
                <Package className="h-10 w-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No items yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Click "Load from templates" or add custom items below</p>
              </div>
            )}

            {/* Grouped items */}
            {allCats.map(cat => (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className={`text-xs rounded-lg ${catColor(cat)}`}>{cat}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {grouped[cat].filter(i => i.isPacked).length}/{grouped[cat].length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {grouped[cat].map(item => (
                    <div key={item.id} className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 transition-all ${item.isPacked ? "bg-muted/20 border-border/20" : "bg-card border-border/40"}`}>
                      <Checkbox
                        checked={item.isPacked}
                        onCheckedChange={v => toggleItem({ id: item.id, isPacked: !!v })}
                        className="shrink-0"
                      />
                      <span className={`flex-1 text-sm ${item.isPacked ? "line-through text-muted-foreground/50" : "text-foreground"}`}>
                        {item.name}
                      </span>
                      {item.isPacked && <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                      <button onClick={() => deleteItem(item.id)} className="shrink-0 p-0.5 text-muted-foreground/30 hover:text-destructive transition-colors">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Add custom item */}
            <div className="rounded-2xl border border-dashed border-border/40 p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Add Custom Item</p>
              <div className="flex gap-2">
                <Input
                  className="flex-1 rounded-xl h-9 text-sm"
                  placeholder="Item name…"
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && newItemName.trim()) {
                      addItem({ name: newItemName.trim(), category: newItemCategory });
                    }
                  }}
                />
                <Select value={newItemCategory} onValueChange={setNewItemCategory}>
                  <SelectTrigger className="w-44 rounded-xl h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" className="rounded-xl h-9 px-3" disabled={!newItemName.trim() || addingItem}
                  onClick={() => addItem({ name: newItemName.trim(), category: newItemCategory })}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>

      {/* Clear List Confirmation */}
      <Dialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <DialogContent className="sm:max-w-[360px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Clear Packing List?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will permanently delete all {total} items from this event's packing list. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setClearConfirmOpen(false)} disabled={clearing}>
              Cancel
            </Button>
            <Button variant="destructive" className="rounded-xl" onClick={() => clearAll()} disabled={clearing}>
              {clearing ? "Clearing…" : "Yes, clear all"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Template Dialog */}
      <Dialog open={addTemplateOpen} onOpenChange={v => { setAddTemplateOpen(v); if (!v) setEditTemplateId(null); }}>
        <DialogContent className="sm:max-w-[380px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">{editTemplateId ? "Edit Template Item" : "Add Template Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">Item Name *</label>
              <Input className="rounded-xl" value={templateForm.name}
                onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Booth Banner, XLR Cables, Lesson Coupons…" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Category</label>
              <Select value={templateForm.category} onValueChange={v => setTemplateForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Applies to event type</label>
              <Select value={templateForm.appliesToEventType || "__all__"} onValueChange={v => setTemplateForm(f => ({ ...f, appliesToEventType: v === "__all__" ? "" : v }))}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All event types</SelectItem>
                  {EVENT_TYPES.map(t => <SelectItem key={t} value={t}>{EVENT_TYPE_LABELS[t] ?? t}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">Leave as "All" for items needed at every event (e.g. business cards). Set a type for event-specific items (e.g. sound cables for Performances).</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => { setAddTemplateOpen(false); setEditTemplateId(null); }}>Cancel</Button>
            <Button className="rounded-xl" disabled={!templateForm.name || savingTemplate}
              onClick={() => saveTemplate({ name: templateForm.name, category: templateForm.category, appliesToEventType: templateForm.appliesToEventType || null })}>
              {editTemplateId ? "Save Changes" : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
