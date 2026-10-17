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
import { comboListPrice, comboPrice, defaultChoice, isReadyCombo, type Combo, type ComboMenuItem, type ComboPricingMode } from "@/lib/combos";
import { formatCurrency } from "@/utils/orders";

const emptyCombo = (choices = false): Combo => ({
  id: "", name: "", description: null, pricingMode: "fixed", price: 0, discount: 0, active: true,
  slots: [{ id: crypto.randomUUID(), label: choices ? "Lanche" : "Item 1", options: [] }, { id: crypto.randomUUID(), label: choices ? "Bebida" : "Item 2", options: [] }],
});
const MODES: { value: ComboPricingMode; label: string }[] = [
  { value: "fixed", label: "Preço fixo (R$)" },
  { value: "percent", label: "Desconto em % sobre os itens" },
  { value: "amount", label: "Desconto em R$ sobre os itens" },
];
type ComboCategory = { key: string; label: string };

export function ComboEditor({ initial, menu, categories, onSaved, onCancel, unit, sortOrder, initialChoices = false }: {
  initial: Combo; menu: (ComboMenuItem & { active: boolean; status: string; category: string })[]; categories: ComboCategory[]; onSaved: () => void; onCancel: () => void; unit: string; sortOrder: number; initialChoices?: boolean;
}) {
  const [combo, setCombo] = useState<Combo>(initial);
  const [withChoices, setWithChoices] = useState(initialChoices || initial.slots.some((slot) => slot.options.length > 1));
  const [busy, setBusy] = useState(false);
  const [categoryBySlot, setCategoryBySlot] = useState<Record<string, string>>({});
  const [searchBySlot, setSearchBySlot] = useState<Record<string, string>>({});
  const items = useMemo(() => new Map(menu.map((m) => [m.id, m])), [menu]);
  const chosen = defaultChoice(combo, items);
  const hasMultipleOptions = combo.slots.some((slot) => slot.options.length > 1);
  const validPrice = combo.pricingMode === "fixed"
    ? combo.price !== null && Number.isFinite(combo.price) && combo.price >= 0
    : Number.isFinite(combo.discount) && combo.discount >= 0 && (combo.pricingMode !== "percent" || combo.discount <= 100);
  const complete = combo.name.trim() && validPrice && combo.slots.length > 0 && combo.slots.every((s) => s.label.trim() && s.options.length > 0
    && (withChoices || s.options.length === 1) && s.options.every((option) => {
      const item = items.get(option.menuItemId);
      return item?.active && item.status === "published" && item.comboEligible !== false;
    }));
  const setSlot = (i: number, patch: Partial<Combo["slots"][number]>) =>
    setCombo((c) => ({ ...c, slots: c.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));

  const save = async () => {
    if (!complete || busy) return;
    setBusy(true);
    try { await saveCombo(unit, combo, sortOrder); toast.success("Combo salvo"); onSaved(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível salvar o combo"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 rounded-xl border border-primary/40 bg-card p-4">
      <label className="block space-y-1 text-sm">Tipo de combo
        <select aria-label="Tipo de combo" value={withChoices ? "choices" : "ready"} onChange={(e) => setWithChoices(e.target.value === "choices")}
          className="w-full rounded-md border border-border bg-background p-2 text-sm">
          <option value="ready" disabled={hasMultipleOptions}>Combo pronto — itens definidos pela casa</option>
          <option value="choices">Combo com escolhas — cliente escolhe as opções</option>
        </select>
      </label>
      {hasMultipleOptions && <p className="text-xs text-muted-foreground">Para transformar em combo pronto, deixe apenas uma opção em cada etapa.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">Nome<Input value={combo.name} maxLength={80} placeholder="Combo Casa" onChange={(e) => setCombo({ ...combo, name: e.target.value })} /></label>
        <label className="space-y-1 text-sm">Descrição (opcional)<Input value={combo.description ?? ""} maxLength={300} placeholder="Burger + fritas + bebida" onChange={(e) => setCombo({ ...combo, description: e.target.value })} /></label>
        <label className="space-y-1 text-sm">Como cobrar
          <select aria-label="Como cobrar" value={combo.pricingMode} onChange={(e) => setCombo({ ...combo, pricingMode: e.target.value as ComboPricingMode, price: e.target.value === "fixed" ? combo.price ?? 0 : null })} className="w-full rounded-md border border-border bg-background p-2 text-sm">
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
        <p className="text-sm font-medium">{withChoices ? "Etapas e opções do cliente" : "Itens do combo pronto"}</p>
        <p className="text-xs text-muted-foreground">{withChoices
          ? "O cliente escolhe uma opção por etapa. Defina as opções permitidas e os acréscimos."
          : "Escolha um item do cardápio por linha. Para incluir duas unidades do mesmo item, adicione outra linha. O preço pode ser fixo ou ter desconto sobre a soma dos itens."}</p>
        {combo.slots.map((slot, i) => (
          <div key={slot.id} className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <Input aria-label="Nome da etapa" value={slot.label} maxLength={40} className="max-w-[14rem]" onChange={(e) => setSlot(i, { label: e.target.value })} />
              <Button type="button" variant="ghost" size="sm" aria-label="Remover etapa" onClick={() => setCombo({ ...combo, slots: combo.slots.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
            </div>
            {slot.options.map((o, k) => (
              <div key={o.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-[10rem] flex-1">{items.get(o.menuItemId)?.name ?? "Item removido do cardápio"} <span className="text-xs text-muted-foreground">{items.has(o.menuItemId) ? formatCurrency(items.get(o.menuItemId)!.price) : ""}</span>
                  {(!items.get(o.menuItemId)?.active || items.get(o.menuItemId)?.status !== "published" || items.get(o.menuItemId)?.comboEligible === false) && <span className="block text-xs text-amber-500">Publique e libere este item para combos ou remova-o.</span>}
                </span>
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
            {(withChoices || slot.options.length === 0) && <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-muted-foreground">1. Categoria
                <select aria-label={`Categoria da etapa ${slot.label}`} value={categoryBySlot[slot.id] ?? ""} className="w-full rounded-md border border-border bg-background p-2 text-sm text-foreground"
                  onChange={(e) => { setCategoryBySlot((v) => ({ ...v, [slot.id]: e.target.value })); setSearchBySlot((v) => ({ ...v, [slot.id]: "" })); }}>
                  <option value="">Escolha uma categoria</option>
                  {categories.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">2. Buscar e escolher item
                <Input aria-label={`Buscar item do cardápio para etapa ${slot.label}`} type="search" value={searchBySlot[slot.id] ?? ""}
                  onChange={(e) => setSearchBySlot((v) => ({ ...v, [slot.id]: e.target.value }))}
                  placeholder={categoryBySlot[slot.id] ? "Digite para filtrar os itens…" : "Selecione primeiro uma categoria"}
                  disabled={!categoryBySlot[slot.id]} className="h-9 text-sm" />
              </label>
              <select aria-label={`Escolher item da categoria para etapa ${slot.label}`} value="" disabled={!categoryBySlot[slot.id]}
                className="w-full rounded-md border border-border bg-background p-2 text-sm sm:col-span-2"
                onChange={(e) => {
                  const id = e.target.value;
                  if (id && !slot.options.some((o) => o.menuItemId === id)) {
                    setSlot(i, { options: [...slot.options, { id: crypto.randomUUID(), menuItemId: id, extraPrice: 0, isFree: false }] });
                  }
                  setSearchBySlot((v) => ({ ...v, [slot.id]: "" }));
                }}>
                <option value="">{categoryBySlot[slot.id] ? "+ Escolha um item" : "Escolha primeiro uma categoria"}</option>
                {menu.filter((m) => m.active && m.status === "published" && m.comboEligible !== false && m.category === categoryBySlot[slot.id] && !slot.options.some((o) => o.menuItemId === m.id)
                  && m.name.toLocaleLowerCase().includes((searchBySlot[slot.id] ?? "").trim().toLocaleLowerCase()))
                  .map((m) => <option key={m.id} value={m.id}>{m.name}{m.status === "draft" ? " (rascunho)" : ""} — {formatCurrency(m.price)}</option>)}
              </select>
            </div>}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setCombo({ ...combo, slots: [...combo.slots, { id: crypto.randomUUID(), label: `${withChoices ? "Etapa" : "Item"} ${combo.slots.length + 1}`, options: [] }] })}><Plus className="mr-1 h-4 w-4" /> {withChoices ? "Adicionar etapa" : "Adicionar item"}</Button>
      </div>

      {chosen.length === combo.slots.length && chosen.length > 0 && (
        <div className="rounded-lg bg-muted/60 p-3 text-sm">
          <p>{withChoices ? "Preço avulso das primeiras opções" : "Soma dos itens avulsos"}: <strong>{formatCurrency(comboListPrice(chosen, items))}</strong></p>
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
      {!complete && <p className="text-xs text-amber-500">Informe nome e preço válidos e escolha itens publicados, ativos e liberados para combos em todas as linhas.</p>}
    </div>
  );
}

/** Combos do cardápio: pronto (itens fixos), montar na hora (opções) e cortesias. */
export default function CombosTab() {
  const { combos, loading, error, reload, businessUnitId } = useCombos();
  const { roles, loading: rolesLoading } = useUnitRoles();
  const canEdit = !rolesLoading && roles.includes("admin");
  const [editing, setEditing] = useState<Combo | null>(null);
  const [newWithChoices, setNewWithChoices] = useState(false);
  const [menuItems, setMenuItems] = useState<(ComboMenuItem & { active: boolean; status: string; category: string })[]>([]);
  const [categories, setCategories] = useState<ComboCategory[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState("");
  useEffect(() => {
    let current = true;
    const loadMenu = async () => {
      setMenuLoading(true);
      setMenuError("");
      if (!businessUnitId) {
        setMenuItems([]);
        setCategories([]);
        setMenuLoading(false);
        return;
      }
      const { error: classificationError } = await supabase.from("menu_items")
        .select("item_kind,combo_eligible").eq("business_unit_id", businessUnitId);
      if (!current) return;
      if (classificationError) {
        setMenuItems([]);
        setCategories([]);
        setMenuError("A classificação de itens ainda não está instalada nesta unidade. Aplique e valide as migrations antes de configurar combos.");
        setMenuLoading(false);
        return;
      }
      const [itemsResult, categoriesResult] = await Promise.all([
        supabase.from("menu_items").select("id,name,price,active,status,category,item_kind,combo_eligible").eq("business_unit_id", businessUnitId).order("name"),
        supabase.from("menu_categories").select("key,label").eq("business_unit_id", businessUnitId).order("sort_order"),
      ]);
      if (!current) return;
      if (itemsResult.error) {
        setMenuItems([]);
        setCategories([]);
        setMenuError("Não foi possível carregar os itens desta unidade.");
      } else {
        const items = (itemsResult.data ?? []).map((item) => ({ ...item, price: Number(item.price), comboEligible: item.combo_eligible }));
        setMenuItems(items);
        const categoryLabels = new Map((categoriesResult.data ?? []).map((category) => [category.key, category.label]));
        setCategories([...new Set(items.filter((item) => item.active && item.comboEligible !== false).map((item) => item.category))].map((key) => ({ key, label: categoryLabels.get(key) ?? key })));
      }
      setMenuLoading(false);
    };
    void loadMenu();
    return () => { current = false; };
  }, [businessUnitId]);
  const items = useMemo(() => new Map(menuItems.map((m) => [m.id, m])), [menuItems]);
  const selectableMenuItems = useMemo(() => menuItems.filter((item) => item.active && item.comboEligible !== false), [menuItems]);
  if (!businessUnitId) return <p className="text-sm text-muted-foreground">Selecione uma unidade.</p>;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 tabIndex={0} data-tooltip={PAGE_HELP["combos"]} className="flex items-center gap-2 text-lg font-semibold"><Package className="h-5 w-5 text-primary" aria-hidden /> Combos</h2>
          <p className="text-sm text-muted-foreground">Junte itens do cardápio com preço especial. Cada item do combo vai para o seu setor e dá baixa no estoque normalmente.</p>
        </div>
        {canEdit && !editing && !loading && !error && !menuLoading && !menuError && <div className="flex flex-wrap gap-2">
          <Button onClick={() => { setNewWithChoices(false); setEditing(emptyCombo()); }}><Plus className="mr-1 h-4 w-4" /> Novo combo pronto</Button>
          <Button variant="outline" onClick={() => { setNewWithChoices(true); setEditing(emptyCombo(true)); }}>Combo com escolhas</Button>
        </div>}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {menuError && <p role="alert" className="text-sm text-destructive">{menuError}</p>}
      {canEdit && editing && !loading && !error && !menuLoading && !menuError && <ComboEditor key={`${businessUnitId}:${editing.id || "new"}`} initial={editing} initialChoices={!editing.id && newWithChoices} menu={menuItems} categories={categories} unit={businessUnitId} sortOrder={editing.id ? combos.findIndex((c) => c.id === editing.id) : combos.length}
        onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />}
      {editing && menuLoading && <p className="text-xs text-muted-foreground">Carregando itens do cardápio…</p>}
      {editing && !menuLoading && !menuError && selectableMenuItems.length === 0 && <p className="text-xs text-amber-600">Não há itens ativos e elegíveis para combos nesta unidade. Itens especiais/sazonais precisam ser liberados no cadastro do item.</p>}
      {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : !combos.length && !error ? (
        <p className="text-sm text-muted-foreground">Nenhum combo ainda.</p>
      ) : (
        <div className="space-y-2">
          {combos.map((c) => {
            const first = defaultChoice(c, items);
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.name} {!c.active && <span className="text-xs text-muted-foreground">(inativo)</span>}</p>
                  <p className="text-xs font-medium text-primary">{isReadyCombo(c) ? "Combo pronto" : "Combo com escolhas"} · {c.pricingMode === "fixed" ? "Preço fixo" : c.pricingMode === "percent" ? `${c.discount}% de desconto` : `${formatCurrency(c.discount)} de desconto`}</p>
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
