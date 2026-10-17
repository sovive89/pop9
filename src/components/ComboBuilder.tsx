import { useMemo, useState } from "react";
import { ArrowLeft, Gift, Package, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, type OrderItem } from "@/utils/orders";
import { comboAvailable, comboListPrice, comboPrice, comboToOrderItems, defaultChoice, onTheFlyComboListPrice, onTheFlyComboPrice, onTheFlyComboToOrderItems, type Combo, type ComboMenuItem, type ComboOption } from "@/lib/combos";

type Props = {
  combos: Combo[];
  menuItems: (ComboMenuItem & { category?: string })[];
  categoryLabels?: Record<string, string>;
  onAdd: (lines: OrderItem[]) => void;
  onBack: () => void;
};

const newGroupId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/**
 * Lista de combos e montagem: uma opção por etapa. Cada item escolhido entra no carrinho
 * como item normal (com o preço do combo repartido); depois, no carrinho, o garçom
 * personaliza cada item (retirar, extra, variante, observação) como um item avulso.
 */
export default function ComboBuilder({ combos, menuItems, categoryLabels = {}, onAdd, onBack }: Props) {
  const items = useMemo(() => new Map(menuItems.map((m) => [m.id, m])), [menuItems]);
  const available = combos.filter((c) => comboAvailable(c, items));
  const eligibleMenuItems = menuItems.filter((item) => item.comboEligible !== false);
  const [selected, setSelected] = useState<Combo | null>(null);
  const [choice, setChoice] = useState<ComboOption[]>([]);
  const [buildNow, setBuildNow] = useState(false);
  const [customItemIds, setCustomItemIds] = useState<string[]>([]);
  const [customCategory, setCustomCategory] = useState("");
  const [customQuery, setCustomQuery] = useState("");
  const [discountMode, setDiscountMode] = useState<"percent" | "amount">("percent");
  const [discountValue, setDiscountValue] = useState(0);
  const itemCategories = [...new Set(eligibleMenuItems.map((item) => item.category).filter((category): category is string => Boolean(category)))];
  const customListPrice = onTheFlyComboListPrice(customItemIds, items);
  const customPrice = onTheFlyComboPrice(customItemIds, items, { mode: discountMode, value: discountValue });
  const filteredCustomItems = eligibleMenuItems.filter((item) => item.category === customCategory
    && !customItemIds.includes(item.id)
    && item.name.toLocaleLowerCase().includes(customQuery.trim().toLocaleLowerCase()));

  if (!selected && !buildNow) {
    return (
      <div className="p-4 space-y-3">
        <h3 className="text-2xl text-foreground" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>COMBOS</h3>
        <button type="button" onClick={() => { setBuildNow(true); setCustomItemIds([]); setDiscountValue(0); }}
          className="w-full rounded-xl border border-primary/50 bg-primary/5 p-3 text-left hover:border-primary transition-colors">
          <div className="flex items-center gap-3"><Plus className="h-5 w-5 text-primary" aria-hidden /><div><p className="text-sm font-semibold text-foreground">Montar combo na hora</p><p className="text-[11px] text-muted-foreground">Escolha os itens do pedido e aplique um desconto. Não precisa cadastrar antes.</p></div></div>
        </button>
        {!available.length && <p className="text-sm text-muted-foreground">Não há combos fixos ativos. Você ainda pode montar um combo na hora.</p>}
        {available.map((c) => {
          const def = c.slots.map((slot) => slot.options.find((o) => items.has(o.menuItemId) && items.get(o.menuItemId)?.comboEligible !== false)).filter((o): o is ComboOption => Boolean(o));
          const price = comboPrice(c, def, items);
          const list = comboListPrice(def, items);
          return (
            <button key={c.id} onClick={() => { setSelected(c); setChoice(c.slots.map((s) => s.options.find((o) => items.has(o.menuItemId) && items.get(o.menuItemId)?.comboEligible !== false)!)); }}
              className="w-full rounded-xl border border-border bg-card p-3 text-left hover:border-primary/60 transition-colors">
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-primary shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{c.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{c.description || c.slots.map((s) => s.label).join(" + ")}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-primary">{c.slots.some((s) => s.options.length > 1) ? "a partir de " : ""}{formatCurrency(price)}</p>
                  {list > price && <p className="text-[10px] text-muted-foreground line-through">{formatCurrency(list)}</p>}
                </div>
              </div>
            </button>
          );
        })}
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5"><ArrowLeft className="h-3.5 w-3.5" /> Voltar ao cardápio</Button>
      </div>
    );
  }

  if (buildNow && !selected) {
    const chosenItems = customItemIds.map((id) => items.get(id)).filter((item): item is ComboMenuItem => Boolean(item));
    const customItemsValid = chosenItems.length === customItemIds.length && chosenItems.every((item) => item.comboEligible !== false);
    const appliedDiscount = Math.max(0, customListPrice - customPrice);
    return (
      <div className="p-4 space-y-4">
        <button type="button" onClick={() => setBuildNow(false)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Voltar aos combos</button>
        <div className="rounded-2xl border border-primary/40 bg-card p-4 space-y-4">
          <div><h3 className="text-xl font-semibold">Montar combo na hora</h3><p className="text-xs text-muted-foreground">Escolha pelo menos dois itens. O desconto será distribuído entre eles e o pedido continuará registrando cada item separadamente.</p></div>
          <label className="block space-y-1 text-xs text-muted-foreground">Categoria
            <select aria-label="Categoria dos itens do combo montado na hora" value={customCategory} onChange={(e) => { setCustomCategory(e.target.value); setCustomQuery(""); }}
              className="w-full rounded-md border border-border bg-background p-2 text-sm text-foreground">
              <option value="">Escolha uma categoria</option>
              {itemCategories.map((key) => <option key={key} value={key}>{categoryLabels[key] ?? key}</option>)}
            </select>
          </label>
          <label className="block space-y-1 text-xs text-muted-foreground">Buscar item
            <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input aria-label="Buscar item para o combo montado na hora" value={customQuery} onChange={(e) => setCustomQuery(e.target.value)} disabled={!customCategory}
                placeholder={customCategory ? "Digite o nome para filtrar…" : "Selecione primeiro uma categoria"} className="pl-8" />
            </div>
          </label>
          <select aria-label="Adicionar item ao combo montado na hora" value="" disabled={!customCategory}
            className="w-full rounded-md border border-border bg-background p-2 text-sm"
            onChange={(e) => { const id = e.target.value; if (id) setCustomItemIds((ids) => [...ids, id]); setCustomQuery(""); }}>
            <option value="">{customCategory ? "+ Escolha um item" : "Escolha primeiro uma categoria"}</option>
            {filteredCustomItems.map((item) => <option key={item.id} value={item.id}>{item.name} — {formatCurrency(item.price)}</option>)}
          </select>
          {chosenItems.length > 0 && <ul className="space-y-2">{chosenItems.map((item) => <li key={item.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
            <span className="flex-1">{item.name}</span><span>{formatCurrency(item.price)}</span><Button type="button" variant="ghost" size="sm" aria-label={`Remover ${item.name} do combo`} onClick={() => setCustomItemIds((ids) => ids.filter((id) => id !== item.id))}><X className="h-4 w-4" /></Button>
          </li>)}</ul>}
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-muted-foreground">Tipo de desconto
              <select value={discountMode} onChange={(e) => setDiscountMode(e.target.value as "percent" | "amount")} className="w-full rounded-md border border-border bg-background p-2 text-sm text-foreground">
                <option value="percent">Percentual (%)</option><option value="amount">Valor (R$)</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">Desconto
              <Input type="number" min={0} max={discountMode === "percent" ? 100 : customListPrice} step="0.01" value={discountValue}
                onChange={(e) => { const value = Math.max(0, Number(e.target.value) || 0); setDiscountValue(discountMode === "percent" ? Math.min(100, value) : Math.min(customListPrice, value)); }} />
            </label>
          </div>
          <div className="rounded-lg bg-muted/60 p-3 text-sm">
            <p>Itens avulsos: <strong>{formatCurrency(customListPrice)}</strong></p>
            <p>Desconto aplicado: <strong>{formatCurrency(appliedDiscount)}</strong></p>
            <p>Total do combo: <strong className="text-primary">{formatCurrency(customPrice)}</strong></p>
          </div>
          <Button className="w-full gap-2" disabled={!customItemsValid || chosenItems.length < 2 || appliedDiscount <= 0}
            onClick={() => { const lines = onTheFlyComboToOrderItems("Combo montado na hora", customItemIds, items, { mode: discountMode, value: discountValue }, newGroupId()); if (!lines.length) return; onAdd(lines); setBuildNow(false); setCustomItemIds([]); }}>
            <Plus className="h-4 w-4" /> Adicionar combo ao pedido
          </Button>
        </div>
      </div>
    );
  }

  const price = comboPrice(selected, choice, items);
  const list = comboListPrice(choice, items);
  const choiceValid = choice.length === selected.slots.length && choice.every((option) => items.get(option.menuItemId)?.comboEligible !== false && items.has(option.menuItemId));
  return (
    <div className="p-4 space-y-4">
      <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar aos combos
      </button>
      <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
        <div>
          <h3 className="text-2xl text-foreground" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>{selected.name}</h3>
          {selected.description && <p className="text-sm text-muted-foreground">{selected.description}</p>}
        </div>
        {selected.slots.map((slot, i) => (
          <fieldset key={slot.id} className="space-y-1.5">
            <legend className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{slot.label}</legend>
            {slot.options.filter((o) => items.has(o.menuItemId) && items.get(o.menuItemId)?.comboEligible !== false).map((o) => {
              const active = choice[i]?.id === o.id;
              return (
                <label key={o.id} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer border ${active ? "border-primary bg-primary/10" : "border-border"}`}>
                  <input type="radio" name={`slot-${slot.id}`} checked={active} onChange={() => setChoice((prev) => prev.map((p, j) => (j === i ? o : p)))} className="accent-[hsl(var(--primary))]" />
                  <span className="flex-1">{items.get(o.menuItemId)?.name}</span>
                  {o.isFree && <span className="inline-flex items-center gap-1 text-xs text-emerald-500"><Gift className="h-3 w-3" /> Grátis</span>}
                  {o.extraPrice > 0 && <span className="text-xs text-muted-foreground">+{formatCurrency(o.extraPrice)}</span>}
                </label>
              );
            })}
          </fieldset>
        ))}
        <div className="flex items-end justify-between border-t border-border pt-3">
          <div>
            <p className="text-xs text-muted-foreground">Preço do combo</p>
            <p className="text-xl font-bold text-primary">{formatCurrency(price)}</p>
            {list > price && <p className="text-[11px] text-emerald-500">Economia de {formatCurrency(list - price)}</p>}
          </div>
          <Button className="gap-2" disabled={!choiceValid} onClick={() => { const lines = comboToOrderItems(selected, choice, items, newGroupId()); if (!lines.length) return; onAdd(lines); setSelected(null); }}>
            <Plus className="h-4 w-4" /> Adicionar combo
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Retirar ingrediente, extras, variante e observação: edite cada item no carrinho. Extras somam ao preço do combo.</p>
      </div>
    </div>
  );
}
