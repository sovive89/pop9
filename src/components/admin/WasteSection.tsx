import { useState } from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { useStockData } from "@/hooks/useStockData";
import { registerWaste, useWaste, WASTE_REASONS } from "@/hooks/useWaste";
import { formatCurrency } from "@/utils/orders";

/** Perdas REAIS da unidade: registra uma perda (sai do estoque) e mostra o prejuízo por insumo. */
export default function WasteSection() {
  const { businessUnitId } = useCurrentBusinessUnit();
  const waste = useWaste(30);
  const { rawMaterials } = useStockData();
  const [open, setOpen] = useState(false);
  const [material, setMaterial] = useState("");
  const [qty, setQty] = useState("");
  const [motivo, setMotivo] = useState<string>(WASTE_REASONS[0]);
  const [busy, setBusy] = useState(false);
  const options = rawMaterials.filter((m) => m.active && !m.isTheoretical);
  const chosen = options.find((m) => m.id === material);
  const total = waste.summary.reduce((s, x) => s + x.cost, 0);

  async function submit() {
    if (!businessUnitId || !chosen) return;
    setBusy(true);
    try {
      await registerWaste({ unitId: businessUnitId, rawMaterialId: chosen.id, quantity: Number(qty.replace(",", ".")), motivo });
      toast.success(`Perda de ${chosen.name} registrada e abatida do estoque.`);
      setQty(""); setOpen(false); await waste.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar a perda.");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Trash2 className="h-4 w-4" aria-hidden /> Perdas registradas (30 dias){waste.summary.length ? ` · ${formatCurrency(total)}` : ""}</h3>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>Registrar perda</Button>
      </div>
      {open && (
        <form className="grid gap-2 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <select aria-label="Insumo perdido" className="h-9 rounded-md border border-input bg-background px-2 text-sm sm:col-span-2" value={material} onChange={(e) => setMaterial(e.target.value)} required>
            <option value="">Escolha o insumo</option>
            {options.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
          </select>
          <Input aria-label={`Quantidade perdida${chosen ? ` em ${chosen.unit}` : ""}`} placeholder={chosen ? `Quantidade (${chosen.unit})` : "Quantidade"} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} required />
          <select aria-label="Motivo da perda" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            {WASTE_REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
          <p className="text-xs text-muted-foreground sm:col-span-3">A perda sai do saldo do insumo e entra no custo real.</p>
          <Button type="submit" size="sm" disabled={busy || !chosen}>{busy ? "Salvando..." : "Confirmar"}</Button>
        </form>
      )}
      {waste.error && <p role="alert" className="text-sm text-destructive">Não foi possível carregar as perdas. Tente novamente.</p>}
      {!waste.error && waste.loaded && !waste.summary.length && <p className="text-sm text-muted-foreground">Nenhuma perda registrada nos últimos 30 dias. Registre vencimentos, quedas e sobras para ver o prejuízo aqui.</p>}
      {!!waste.summary.length && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {waste.summary.map((s) => (
            <article key={s.rawMaterialId} aria-label={s.name} className="rounded-lg border border-border p-3 text-sm">
              <div className="flex items-start justify-between gap-2"><h4 className="font-semibold">{s.name}</h4><span className="font-medium text-destructive">{formatCurrency(s.cost)}</span></div>
              <p className="text-xs text-muted-foreground">{s.quantity} {s.unit} perdidos em {s.events} {s.events === 1 ? "registro" : "registros"}</p>
              {s.topMotivo && <p className="mt-1 text-xs">Motivo mais comum: <strong>{s.topMotivo}</strong></p>}
              <Link className="mt-2 inline-block text-xs text-primary hover:underline" to="/admin?sec=stock">Ver insumo e fichas que o usam</Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
