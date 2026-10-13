import { useState } from "react";
import { ChefHat, Printer } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { PAGE_HELP } from "@/lib/page-help";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { useUnitKds, setUnitKds } from "@/hooks/useUnitKds";
import { useUnitPrintMode, setUnitPrintMode } from "@/hooks/useUnitPrintMode";

type ModuleProps = {
  icon: typeof ChefHat; title: string; on: string; off: string; checked: boolean; disabled: boolean;
  onChange: (value: boolean) => Promise<void>;
};

function ModuleRow({ icon: Icon, title, on, off, checked, disabled, onChange }: ModuleProps) {
  const [saving, setSaving] = useState(false);
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4">
      <div className="flex gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div className="space-y-1">
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{checked ? on : off}</p>
        </div>
      </div>
      <Switch aria-label={title} checked={checked} disabled={disabled || saving}
        onCheckedChange={async (value) => {
          setSaving(true);
          try { await onChange(value); toast.success(`${title}: ${value ? "ativado" : "desativado"}`); }
          catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar"); }
          finally { setSaving(false); }
        }} />
    </div>
  );
}

/** Configurações da unidade selecionada. Cada módulo pode ser desligado sem apagar dados. */
export default function SettingsTab() {
  const { businessUnitId, units } = useCurrentBusinessUnit();
  const kds = useUnitKds();
  const printMode = useUnitPrintMode();
  const unitName = units.find((u) => u.id === businessUnitId)?.name;
  if (!businessUnitId) return <p className="text-sm text-muted-foreground">Selecione uma unidade para configurar.</p>;
  return (
    <section className="space-y-6">
      <div>
        <h2 tabIndex={0} data-tooltip={PAGE_HELP["settings"]} className="text-lg font-semibold">Configurações</h2>
        <p className="text-sm text-muted-foreground">{unitName} · as mudanças valem só para esta unidade.</p>
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Módulos</h3>
        <ModuleRow icon={ChefHat} title="KDS da cozinha" checked={kds.enabled} disabled={!kds.loaded}
          on="Os pedidos aparecem na tela da cozinha (/cozinha), que marca preparo e pronto."
          off="A cozinha trabalha só com a comanda impressa e o atendimento confirma a entrega direto, sem esperar “pronto”."
          onChange={async (value) => { await setUnitKds(businessUnitId, value); await kds.reload(); }} />
        <ModuleRow icon={Printer} title="Estação de impressão" checked={printMode.mode === "station"} disabled={!printMode.loaded}
          on="Todo pedido (mesa, online e integrações como iFood e 99Food) entra numa fila e sai na Estação de impressão (/impressao) aberta no aparelho da impressora."
          off="A comanda imprime no navegador de quem envia o pedido. Pedidos online e de integrações não imprimem."
          onChange={async (value) => { await setUnitPrintMode(businessUnitId, value ? "station" : "device"); await printMode.reload(); }} />
      </div>
    </section>
  );
}
