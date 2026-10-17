import { useState } from "react";
import { Banknote, ChefHat, Contact, FolderOpen, Gift, Printer } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { PAGE_HELP } from "@/lib/page-help";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { useUnitRoles } from "@/hooks/useUnitRoles";
import { useUnitKds, setUnitKds } from "@/hooks/useUnitKds";
import { useUnitPrintMode, setUnitPrintMode } from "@/hooks/useUnitPrintMode";
import { useUnitModules, setUnitModule, type OptionalModule } from "@/hooks/useUnitModules";

const OPTIONAL: { key: OptionalModule; icon: typeof ChefHat; title: string; on: string; off: string }[] = [
  { key: "financeiro", icon: Banknote, title: "Financeiro", on: "Painel com CMV, margem, preço sugerido, custos fixos, previsão e insights.", off: "A seção Financeiro some do menu. Nenhum dado é apagado." },
  { key: "combos", icon: Gift, title: "Combos", on: "Combos aparecem no menu do admin e no pedido do cliente.", off: "A seção Combos some do menu do admin. Os combos já criados continuam salvos." },
  { key: "crm", icon: Contact, title: "CRM", on: "Consulta e organização dos clientes.", off: "A seção CRM some do menu. Os cadastros continuam salvos." },
  { key: "documents", icon: FolderOpen, title: "Central de Documentos", on: "Exportação do cardápio, fichas e documentos.", off: "A seção Documentos some do menu. Os arquivos continuam salvos." },
];

type ModuleProps = {
  icon: typeof ChefHat; title: string; on: string; off: string; checked: boolean; disabled: boolean;
  onChange: (value: boolean) => Promise<void>;
};

function ModuleRow({ icon: Icon, title, on, off, checked, disabled, onChange }: ModuleProps) {
  const [saving, setSaving] = useState(false);
  // Mantém o valor escolhido (e a chave travada) até a leitura nova confirmar a mudança.
  const [pending, setPending] = useState<boolean | null>(null);
  const shown = pending ?? checked;
  if (pending !== null && pending === checked) setPending(null);
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4">
      <div className="flex gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div className="space-y-1">
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{shown ? on : off}</p>
        </div>
      </div>
      <Switch aria-label={title} checked={shown} disabled={disabled || saving || pending !== null}
        onCheckedChange={async (value) => {
          setSaving(true);
          setPending(value);
          try { await onChange(value); toast.success(`${title}: ${value ? "ativado" : "desativado"}`); }
          catch (error) { setPending(null); toast.error(error instanceof Error ? error.message : "Não foi possível salvar"); }
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
  const modules = useUnitModules();
  const { roles, loading: rolesLoading, error: rolesError } = useUnitRoles();
  const canEdit = !rolesLoading && !rolesError && roles.includes("admin");
  const unitName = units.find((u) => u.id === businessUnitId)?.name;
  if (!businessUnitId) return <p className="text-sm text-muted-foreground">Selecione uma unidade para configurar.</p>;
  return (
    <section className="space-y-6">
      <div>
        <h2 tabIndex={0} data-tooltip={PAGE_HELP["settings"]} className="text-lg font-semibold">Configurações</h2>
        <p className="text-sm text-muted-foreground">{unitName} · as mudanças valem só para esta unidade.</p>
        {!rolesLoading && rolesError && <p role="alert" className="text-sm text-destructive">Não foi possível verificar suas permissões. Recarregue a página para alterar os módulos.</p>}
        {!rolesLoading && !rolesError && !canEdit && <p role="status" className="text-sm text-amber-500">Só um administrador desta unidade pode alterar os módulos.</p>}
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Módulos</h3>
        <ModuleRow icon={ChefHat} title="KDS da cozinha" checked={kds.enabled} disabled={!kds.loaded || !canEdit}
          on="Os pedidos aparecem na tela da cozinha (/cozinha), que marca preparo e pronto."
          off="A cozinha trabalha só com a comanda impressa e o atendimento confirma a entrega direto, sem esperar “pronto”."
          onChange={(value) => setUnitKds(businessUnitId, value)} />
        <ModuleRow icon={Printer} title="Estação de impressão" checked={printMode.mode === "station"} disabled={!printMode.loaded || !canEdit}
          on="Todo pedido (mesa, online e integrações como iFood e 99Food) entra numa fila e sai na Estação de impressão (/impressao) aberta no aparelho da impressora."
          off="A comanda imprime no navegador de quem envia o pedido. Pedidos online e de integrações não imprimem."
          onChange={(value) => setUnitPrintMode(businessUnitId, value ? "station" : "device")} />
        {OPTIONAL.map((m) => (
          <ModuleRow key={m.key} icon={m.icon} title={m.title} checked={modules.isEnabled(m.key)} disabled={!modules.loaded || !canEdit}
            on={m.on} off={m.off} onChange={(value) => setUnitModule(businessUnitId, m.key, value)} />
        ))}
      </div>
    </section>
  );
}
