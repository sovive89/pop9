import { useState, useEffect, useCallback } from "react";
import { Flame, Plus, Trash2, Pencil, Save, X, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TableZone {
  id: string;
  key: string;
  label: string;
  icon: string;
  cols: number;
  table_start: number;
  table_end: number;
  sort_order: number;
}

const ICON_OPTIONS = [
  { value: "UtensilsCrossed", label: "🍽️ Talheres" },
  { value: "Coffee", label: "☕ Café" },
  { value: "Users", label: "👥 Pessoas" },
  { value: "Star", label: "⭐ Estrela" },
  { value: "Palmtree", label: "🌴 Palmeira" },
];

const TablesTab = () => {
  const [zones, setZones] = useState<TableZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingZone, setEditingZone] = useState<TableZone | null>(null);
  const [creating, setCreating] = useState(false);

  const loadZones = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("table_zones")
      .select("*")
      .order("sort_order");
    if (error) {
      toast.error("Erro ao carregar zonas");
    } else {
      setZones(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadZones(); }, [loadZones]);

  const totalTables = zones.reduce((sum, z) => sum + (z.table_end - z.table_start + 1), 0);

  const handleSave = async (zone: Omit<TableZone, "id">, isNew: boolean, existingId?: string) => {
    // Validate no overlap
    const others = zones.filter((z) => z.id !== existingId);
    const overlap = others.some(
      (z) => zone.table_start <= z.table_end && zone.table_end >= z.table_start
    );
    if (overlap) {
      toast.error("Faixa de mesas se sobrepõe com outra zona");
      return false;
    }
    if (zone.table_start > zone.table_end) {
      toast.error("Mesa inicial deve ser menor ou igual à final");
      return false;
    }

    if (isNew) {
      const { error } = await supabase.from("table_zones").insert(zone);
      if (error) { toast.error("Erro ao criar zona: " + error.message); return false; }
    } else {
      const { error } = await supabase.from("table_zones").update(zone).eq("id", existingId!);
      if (error) { toast.error("Erro ao atualizar zona: " + error.message); return false; }
    }

    toast.success(isNew ? "Zona criada" : "Zona atualizada");
    await loadZones();
    setEditingZone(null);
    setCreating(false);
    return true;
  };

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`Excluir zona "${label}"?`)) return;
    const { error } = await supabase.from("table_zones").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir zona"); return; }
    toast.success("Zona excluída");
    await loadZones();
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Flame className="h-6 w-6 animate-pulse text-primary" /></div>;
  }

  if (creating || editingZone) {
    return (
      <ZoneEditor
        zone={editingZone ?? undefined}
        nextSortOrder={zones.length}
        onSave={handleSave}
        onCancel={() => { setEditingZone(null); setCreating(false); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button onClick={() => setCreating(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Nova Zona
          </Button>
          <span className="text-sm text-muted-foreground">
            {zones.length} zonas · {totalTables} mesas
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {zones.map((zone) => {
          const tableCount = zone.table_end - zone.table_start + 1;
          const iconOption = ICON_OPTIONS.find((o) => o.value === zone.icon);
          return (
            <div key={zone.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{iconOption?.label.split(" ")[0] ?? "🍽️"}</span>
                    <span className="font-semibold text-foreground">{zone.label}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                      {zone.key}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>Mesas {zone.table_start}–{zone.table_end} ({tableCount})</span>
                    <span>{zone.cols} colunas</span>
                    <span>Ordem: {zone.sort_order}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditingZone(zone)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(zone.id, zone.label)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {zones.length === 0 && (
          <p className="text-center text-muted-foreground py-8">Nenhuma zona configurada</p>
        )}
      </div>
    </div>
  );
};

// ── Zone Editor ──
interface ZoneEditorProps {
  zone?: TableZone;
  nextSortOrder: number;
  onSave: (zone: Omit<TableZone, "id">, isNew: boolean, existingId?: string) => Promise<boolean>;
  onCancel: () => void;
}

const ZoneEditor = ({ zone, nextSortOrder, onSave, onCancel }: ZoneEditorProps) => {
  const isNew = !zone;
  const [key, setKey] = useState(zone?.key ?? "");
  const [label, setLabel] = useState(zone?.label ?? "");
  const [icon, setIcon] = useState(zone?.icon ?? "UtensilsCrossed");
  const [cols, setCols] = useState(zone?.cols?.toString() ?? "4");
  const [tableStart, setTableStart] = useState(zone?.table_start?.toString() ?? "");
  const [tableEnd, setTableEnd] = useState(zone?.table_end?.toString() ?? "");
  const [sortOrder, setSortOrder] = useState(zone?.sort_order?.toString() ?? nextSortOrder.toString());
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!key.trim() || !label.trim() || !tableStart || !tableEnd) {
      toast.error("Todos os campos são obrigatórios");
      return;
    }
    setSaving(true);
    await onSave(
      {
        key: key.trim().toLowerCase(),
        label: label.trim(),
        icon,
        cols: parseInt(cols) || 4,
        table_start: parseInt(tableStart),
        table_end: parseInt(tableEnd),
        sort_order: parseInt(sortOrder) || 0,
      },
      isNew,
      zone?.id
    );
    setSaving(false);
  };

  const tableCount = tableStart && tableEnd ? Math.max(0, parseInt(tableEnd) - parseInt(tableStart) + 1) : 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">{isNew ? "Nova Zona" : "Editar Zona"}</h3>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Chave (slug)</label>
          <Input value={key} onChange={(e) => setKey(e.target.value)} disabled={!isNew} placeholder="ex: terraço" className="h-9" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Nome</label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex: Terraço" className="h-9" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Ícone</label>
          <select value={icon} onChange={(e) => setIcon(e.target.value)} className="w-full h-9 rounded-md border border-border bg-muted px-3 text-sm text-foreground">
            {ICON_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Colunas no grid</label>
          <Input type="number" min="2" max="6" value={cols} onChange={(e) => setCols(e.target.value)} className="h-9" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Mesa inicial</label>
          <Input type="number" min="1" value={tableStart} onChange={(e) => setTableStart(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Mesa final</label>
          <Input type="number" min="1" value={tableEnd} onChange={(e) => setTableEnd(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Ordem</label>
          <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="h-9" />
        </div>
      </div>

      {tableCount > 0 && (
        <p className="text-xs text-muted-foreground">
          Essa zona terá <span className="text-foreground font-medium">{tableCount}</span> mesas
        </p>
      )}

      <div className="flex gap-2 pt-2">
        <Button onClick={handleSubmit} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Salvando..." : "Salvar"}
        </Button>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
};

export default TablesTab;
