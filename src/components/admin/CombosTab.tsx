import { useEffect, useMemo, useState } from "react";
import { Gift, Package, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PAGE_HELP } from "@/lib/page-help";
import { useUnitRoles } from "@/hooks/useUnitRoles";
import { deleteCombo, saveCombo, useCombos } from "@/hooks/useCombos";
import { comboListPrice, comboPrice, defaultChoice, type Combo, type ComboMenuItem, type ComboPricingMode } from "@/lib/combos";
import { formatCurrency } from "@/utils/orders";

const emptyCombo = (): Combo => ({
  id: "", name: "", description: null, pricingMode: "fixed", price: 0, discount: 0, active: true,
  slots: [{ id: crypto.randomUUID(), label: "Lanche", options: [] }, { id: crypto.randomUUID(), label: "Bebida", options: [] }],
});
const MODES: { value: ComboPricingMode; label: string }[] = [
  { value: "fixed", label: "Preço fixo (R$)" },
  { value: "percent", label: "Desconto em % sobre os itens" },
  { value: "amount", label: "Desconto em R$ sobre os itens" },
];

function ComboEditor({ initial, menu, onSaved, onCancel, unit, sortOrder }: {
  initial: Combo; menu: (ComboMenuItem & { active: boolean; status: string })[]; onSaved: () => void; onCancel: () => void; unit: string; sortOrder: number;
}) {
  const [combo, setCombo] = useState<Combo>(initial);
  const [busy, setBusy] = useState(false);
  const items = useMemo(() => new Map(menu.map((m) => [m.id, m])), [menu]);
  const chosen = defaultChoice(combo).filter((o) => items.has(o.menuItemId));
  const complete = combo.name.trim() && combo.slots.length > 0 && combo.slots.every((s) => s.label.trim() && s.options.length > 0);
  const setSlot = (i: number, patch: Partial<Combo["slots"][number]>) =>
    setCombo((c) => ({ ...c, slots: c.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));

  const save = async () => {
    setBusy(true);
    try { await saveCombo(unit, combo, sortOrder); toast.success("Combo salvo"); onSaved(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível salvar o combo"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 rounded-xl border border-primary/40 bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">Nome<Input value={combo.name} maxLength={80} placeholder="Combo Casa" onChange={(e) => setCombo({ ...combo, name: e.target.value })} /></label>
        <label className="space-y-1 text-sm">Descrição (opcional)<Input value={combo.description ?? ""} maxLength={300} placeholder="Burger + fritas + bebida" onChange={(e) => setCombo({ ...combo, description: e.target.value })} /></label>
        <label className="space-y-1 text-sm">Como cobrar
          <select value={combo.pricingMode} onChange={(e) => setCombo({ ...combo, pricingMode: e.target.value as ComboPricingMode, price: e.target.value === "fixed" ? combo.price ?? 0 : null })} className="w-full rounded-md border border-border bg-background p-2 text-sm">
            {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">{combo.pricingMode === "fixed" ? "Preço do combo (R$)" : combo.pricingMode === "percent" ? "Desconto (%)" : "Desconto (R$)"}
          <Input type="number" min={0} max={combo.pricingMode === "percent" ? 100 : undefined} step="0.01"
            value={combo.pricingMode === "fixed" ? combo.price ?? 0 : combo.discount}
            onChange={(e) => { const v = Math.max(0, Number(e.target.value) || 0); setCombo(combo.pricingMode === "fixed" ? { ...combo, price: v } : { ...combo, discount: combo.pricingMode === "percent" ? Math.min(100, v) : v }); }} />
        </label>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">Etapas do combo</p>
        <p className="text-xs text-muted-foreground">Uma opção = item fixo. Várias opções = o cliente escolhe na hora. Marque "Grátis" para itens de cortesia (ex.: Coca grátis) e use "Acréscimo" para opções que custam a mais.</p>
        {combo.slots.map((slot, i) => (
          <div key={slot.id} className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <Input aria-label="Nome da etapa" value={slot.label} maxLength={40} className="max-w-[14rem]" onChange={(e) => setSlot(i, { label: e.target.value })} />
              <Button type="button" variant="ghost" size="sm" aria-label="Remover etapa" onClick={() => setCombo({ ...combo, slots: combo.slots.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
            </div>
            {slot.options.map((o, k) => (
              <div key={o.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-[10rem] flex-1">{items.get(o.menuItemId)?.name ?? "Item removido do cardápio"} <span className="text-xs text-muted-foreground">{items.has(o.menuItemId) ? formatCurrency(items.get(o.menuItemId)!.price) : ""}</span></span>
                <label className="flex items-center gap-1 text-xs">Acréscimo R$
                  <Input type="number" min={0} step="0.01" className="h-8 w-20" value={o.extraPrice}
                    onChange={(e) => setSlot(i, { options: slot.options.map((x, j) => (j === k ? { ...x, extraPrice: Math.max(0, Number(e.target.value) || 0) } : x)) })} />
                </label>
                <label className="flex items-center gap-1 text-xs"><Gift className="h-3.5 w-3.5" /> Grátis
                  <Switch checked={o.isFree} onCheckedChange={(v) => setSlot(i, { options: slot.options.map((x, j) => (j === k ? { ...x, isFree: v } : x)) })} />
                </label>
                <Button type="button" variant="ghost" size="sm" aria-label="Remover opção" onClick={() => setSlot(i, { options: slot.options.filter((_, j) => j !== k) })}><X className="h-4 w-4" /></Button>
              </div>
            ))}
            <select aria-label="Adicionar item do cardápio" value="" className="w-full rounded-md border border-border bg-background p-2 text-sm"
              onChange={(e) => { const id = e.target.value; if (id && !slot.options.some((o) => o.menuItemId === id)) setSlot(i, { options: [...slot.options, { id: crypto.randomUUID(), menuItemId: id, extraPrice: 0, isFree: false }] }); }}>
              <option value="">+ Adicionar item do cardápio a esta etapa</option>
              {menu.filter((m) => m.active && !slot.options.some((o) => o.menuItemId === m.id)).map((m) => <option key={m.id} value={m.id}>{m.name}{m.status === "draft" ? " (rascunho)" : ""} — {formatCurrency(m.price)}</option>)}
            </select>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setCombo({ ...combo, slots: [...combo.slots, { id: crypto.randomUUID(), label: `Etapa ${combo.slots.length + 1}`, options: [] }] })}><Plus className="mr-1 h-4 w-4" /> Adicionar etapa</Button>
      </div>

      {chosen.length === combo.slots.length && chosen.length > 0 && (
        <div className="rounded-lg bg-muted/60 p-3 text-sm">
          <p>Preço avulso das primeiras opções: <strong>{formatCurrency(comboListPrice(chosen, items))}</strong></p>
          <p>Preço calculado do combo: <strong className="text-primary">{formatCurrency(comboPrice(combo, chosen, items))}</strong></p>
          <p className="text-xs text-muted-foreground">
            {combo.pricingMode === "fixed" ? "Preço fixo informado acima; acréscimos das opções são somados." : "Preço calculado aplicando o desconto ao valor avulso das opções."}
            {comboListPrice(chosen, items) > comboPrice(combo, chosen, items)
              ? ` Economia: ${formatCurrency(comboListPrice(chosen, items) - comboPrice(combo, chosen, items))}.`
              : ""}
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm"><Switch checked={combo.active} onCheckedChange={(v) => setCombo({ ...combo, active: v })} /> Ativo no cardápio</label>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={busy || !complete}>{busy ? "Salvando..." : "Salvar combo"}</Button>
        </div>
      </div>
      {!complete && <p className="text-xs text-amber-500">Dê um nome ao combo e coloque pelo menos um item em cada etapa.</p>}
    </div>
  );
}

/** Combos do cardápio: pronto (itens fixos), montar na hora (opções) e cortesias. */
export default function CombosTab() {
  const { combos, loading, error, reload, businessUnitId } = useCombos();
  const { roles, loading: rolesLoading } = useUnitRoles();
  const canEdit = !rolesLoading && roles.includes("admin");
  const [editing, setEditing] = useState<Combo | null>(null);
  const [menuItems, setMenuItems] = useState<(ComboMenuItem & { active: boolean; status: string })[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState("");
  useEffect(() => {
    let current = true;
    const loadMenu = async () => {
      setMenuLoading(true);
      setMenuError("");
      if (!businessUnitId) {
        setMenuItems([]);
        setMenuLoading(false);
        return;
      }
      const { data, error: loadError } = await supabase
        .from("menu_items")
        .select("id,name,price,active,status")
        .eq("business_unit_id", businessUnitId)
        .order("name");
      if (!current) return;
      if (loadError) {
        setMenuItems([]);
        setMenuError("Não foi possível carregar os itens desta unidade.");
      } else {
        setMenuItems((data ?? []).map((item) => ({ ...item, price: Number(item.price) })));
      }
      setMenuLoading(false);
    };
    void loadMenu();
    return () => { current = false; };
  }, [businessUnitId]);
  const items = useMemo(() => new Map(menuItems.map((m) => [m.id, m])), [menuItems]);
  const selectableMenuItems = useMemo(() => menuItems.filter((item) => item.active), [menuItems]);
  if (!businessUnitId) return <p className="text-sm text-muted-foreground">Selecione uma unidade.</p>;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 tabIndex={0} data-tooltip={PAGE_HELP["combos"]} className="flex items-center gap-2 text-lg font-semibold"><Package className="h-5 w-5 text-primary" aria-hidden /> Combos</h2>
          <p className="text-sm text-muted-foreground">Junte itens do cardápio com preço especial. Cada item do combo vai para o seu setor e dá baixa no estoque normalmente.</p>
        </div>
        {canEdit && !editing && <Button onClick={() => setEditing(emptyCombo())}><Plus className="mr-1 h-4 w-4" /> Novo combo</Button>}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {menuError && <p role="alert" className="text-sm text-destructive">{menuError}</p>}
      {editing && <ComboEditor key={editing.id || "new"} initial={editing} menu={menuItems} unit={businessUnitId} sortOrder={editing.id ? combos.findIndex((c) => c.id === editing.id) : combos.length}
        onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />}
      {editing && menuLoading && <p className="text-xs text-muted-foreground">Carregando itens do cardápio…</p>}
      {editing && !menuLoading && !menuError && selectableMenuItems.length === 0 && <p className="text-xs text-amber-600">Não há itens ativos nesta unidade. Ative os itens no cadastro do cardápio para adicioná-los ao combo. Rascunhos ativos também aparecem aqui.</p>}
      {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : !combos.length && !error ? (
        <p className="text-sm text-muted-foreground">Nenhum combo ainda.</p>
      ) : (
        <div className="space-y-2">
          {combos.map((c) => {
            const first = defaultChoice(c).filter((o) => items.has(o.menuItemId));
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.name} {!c.active && <span className="text-xs text-muted-foreground">(inativo)</span>}</p>
                  <p className="text-xs text-muted-foreground">{c.slots.map((s) => `${s.label}: ${s.options.map((o) => items.get(o.menuItemId)?.name ?? "?").join(" / ")}`).join(" · ")}</p>
                </div>
                {first.length === c.slots.length && <span className="text-sm font-semibold text-primary">{formatCurrency(comboPrice(c, first, items))}</span>}
                {canEdit && <>
                  <Button size="sm" variant="outline" aria-label={`Editar ${c.name}`} onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="outline" aria-label={`Excluir ${c.name}`} onClick={async () => {
                    if (!confirm(`Excluir o combo "${c.name}"? Pedidos antigos não mudam.`)) return;
                    try { await deleteCombo(c.id); toast.success("Combo excluído"); void reload(); } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível excluir"); }
                  }}><Trash2 className="h-4 w-4" /></Button>
                </>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
