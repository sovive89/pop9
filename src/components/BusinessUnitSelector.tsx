import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { toast } from "sonner";

/** Switching context never changes the operation's open/closed state. */
export default function BusinessUnitSelector() {
  const { businessUnitId, units, loading, selectBusinessUnit } = useCurrentBusinessUnit();
  return <label className="flex flex-wrap items-center gap-2 text-sm font-medium">
    Unidade ativa
    <select aria-label="Unidade ativa" value={businessUnitId ?? ""} disabled={loading || !units.length}
      className="max-w-full rounded-md border border-primary/40 bg-background px-3 py-2 text-foreground"
      onChange={event => {
        const next = event.target.value;
        if (next === businessUnitId) return;
        if (businessUnitId && !window.confirm("Trocar de unidade? Alterações não salvas serão descartadas. A operação de cada unidade permanece como está.")) return;
        if (selectBusinessUnit(next)) toast.success(`Agora você está na unidade ${units.find(unit => unit.id === next)?.name}`);
      }}>
      <option value="" disabled>Selecione a unidade</option>
      {units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
    </select>
  </label>;
}
