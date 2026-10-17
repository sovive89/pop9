import { useMemo, useState } from "react";
import { ArrowLeft, Gift, Package, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, type OrderItem } from "@/utils/orders";
import { comboAvailable, comboListPrice, comboPrice, comboToOrderItems, defaultChoice, type Combo, type ComboMenuItem, type ComboOption } from "@/lib/combos";

type Props = {
  combos: Combo[];
  menuItems: ComboMenuItem[];
  onAdd: (lines: OrderItem[]) => void;
  onBack: () => void;
};

const newGroupId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/**
 * Lista de combos e montagem: uma opção por etapa. Cada item escolhido entra no carrinho
 * como item normal (com o preço do combo repartido); depois, no carrinho, o garçom
 * personaliza cada item (retirar, extra, variante, observação) como um item avulso.
 */
export default function ComboBuilder({ combos, menuItems, onAdd, onBack }: Props) {
  const items = useMemo(() => new Map(menuItems.map((m) => [m.id, m])), [menuItems]);
  const available = combos.filter((c) => comboAvailable(c, items));
  const [selected, setSelected] = useState<Combo | null>(null);
  const [choice, setChoice] = useState<ComboOption[]>([]);

  if (!selected) {
    return (
      <div className="p-4 space-y-3">
        <h3 className="text-2xl text-foreground" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>COMBOS</h3>
        {!available.length && <p className="text-sm text-muted-foreground">Nenhum combo ativo. Cadastre em Admin → Combos.</p>}
        {available.map((c) => {
          const def = defaultChoice(c).filter((o) => items.has(o.menuItemId));
          const price = comboPrice(c, def, items);
          const list = comboListPrice(def, items);
          return (
            <button key={c.id} onClick={() => { setSelected(c); setChoice(c.slots.map((s) => s.options.find((o) => items.has(o.menuItemId))!)); }}
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

  const price = comboPrice(selected, choice, items);
  const list = comboListPrice(choice, items);
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
            {slot.options.filter((o) => items.has(o.menuItemId)).map((o) => {
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
          <Button className="gap-2" onClick={() => { onAdd(comboToOrderItems(selected, choice, items, newGroupId())); setSelected(null); }}>
            <Plus className="h-4 w-4" /> Adicionar combo
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Retirar ingrediente, extras, variante e observação: edite cada item no carrinho. Extras somam ao preço do combo.</p>
      </div>
    </div>
  );
}
