import WhatsAppTab from "@/components/admin/WhatsAppTab";
import {useCurrentBusinessUnit} from "@/hooks/useCurrentBusinessUnit";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AIConnectionsPanel } from "@/components/admin/connections/AIConnectionsPanel";
import { IntegrationGrid } from "@/components/admin/connections/IntegrationGrid";
import { IntegrationConfigModal } from "@/components/admin/connections/IntegrationConfigModal";
import { CATEGORY_LABELS, TYPE_LABELS } from "@/components/admin/connections/types";
import type { IntegrationCategory, IntegrationType, IntegrationView } from "@/components/admin/connections/types";
import { useIntegrations } from "@/hooks/useIntegrations";

type StatusFilter = "all" | "connected" | "not_connected";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "connected", label: "Conectados" },
  { value: "not_connected", label: "Não conectados" },
];

/** Filtro por papel na arquitetura. É a distinção que mais importa na hora
 * de procurar algo aqui: "quero ligar um canal de venda" e "quero puxar os
 * dados do meu PDV antigo" são tarefas diferentes. */
const VISIBLE_CATEGORIES: IntegrationCategory[] = [
  "DELIVERY", "COMMUNICATION", "MENU", "PAYMENTS", "FISCAL", "AI", "MANAGEMENT", "ECOMMERCE", "AUTOMATION",
];
const VISIBLE_AI = new Set(["openai", "anthropic", "google-gemini", "xai-grok"]);

const TYPE_OPTIONS: { value: IntegrationType | "all"; label: string }[] = [
  { value: "all", label: "Todos os tipos" },
  { value: "OPERATIONAL", label: TYPE_LABELS.OPERATIONAL },
  { value: "SUPPORT", label: TYPE_LABELS.SUPPORT },
  { value: "IMPORT", label: TYPE_LABELS.IMPORT },
];

const CATEGORY_OPTIONS: { value: IntegrationCategory | "all"; label: string }[] = [
  { value: "all", label: "Todas as categorias" },
  ...VISIBLE_CATEGORIES.map((value) => ({
    label: CATEGORY_LABELS[value],
    value,
  })),
];

export function ConnectionsTab() {
  const {businessUnitId}=useCurrentBusinessUnit();
  const { views, loading, tableMissing, saveConfig, connect, disconnect } = useIntegrations();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<IntegrationCategory | "all">("all");
  const [type, setType] = useState<IntegrationType | "all">("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [activeView, setActiveView] = useState<IntegrationView | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return views.filter((view) => {
      // Catálogo completo permanece intacto para reutilização futura no Pop9 Hub.
      // O ERP exibe apenas conexões utilizadas diretamente na operação.
      if(view.definition.slug==="whatsapp")return false;
      if (!VISIBLE_CATEGORIES.includes(view.definition.category)) return false;
      if (view.definition.type === "IMPORT") return false;
      if (view.definition.category === "AI" && !VISIBLE_AI.has(view.definition.slug)) return false;
      if (category !== "all" && view.definition.category !== category) return false;
      if (type !== "all" && view.definition.type !== type) return false;
      if (status === "connected" && view.status !== "CONNECTED") return false;
      if (status === "not_connected" && view.status === "CONNECTED") return false;
      if (query) {
        const haystack = `${view.definition.name} ${view.definition.description}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [views, search, category, type, status]);

  const handleOpen = (view: IntegrationView) => {
    setActiveView(view);
    setModalOpen(true);
  };

  useEffect(()=>{setActiveView(null);setModalOpen(false);},[businessUnitId]);

  const handleDisconnectFromCard = (view: IntegrationView) => disconnect(view.definition.slug, businessUnitId);
  const handleSaveConfig = (slug: string, config: Record<string, unknown>) => saveConfig(slug, businessUnitId, config);
  const handleConnect = (slug: string, config: Record<string, unknown>) => connect(slug, businessUnitId, config);
  const handleDisconnectFromModal = (slug: string) => disconnect(slug, businessUnitId);

  return (
    <div className="space-y-6">
      <WhatsAppTab />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Conexões</h2>
        <p className="text-sm text-muted-foreground">
          Conecte o Pipeline aos serviços que sua operação utiliza.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar integração..."
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={(v) => setCategory(v as IntegrationCategory | "all")}>
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => setType(v as IntegrationType | "all")}>
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <AIConnectionsPanel />

      {tableMissing && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
          A tabela <code className="font-mono">integrations</code> ainda não existe neste ambiente — aplique a
          migration para habilitar o histórico de conexões. A galeria continua navegável, mas nada aparece como
          conectado até lá.
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Carregando integrações...</div>
      ) : (
        <IntegrationGrid views={filtered} onOpen={handleOpen} onDisconnect={handleDisconnectFromCard} />
      )}

      <IntegrationConfigModal
        view={activeView}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSaveConfig={handleSaveConfig}
        onConnect={handleConnect}
        onDisconnect={handleDisconnectFromModal}
      />
    </div>
  );
}
