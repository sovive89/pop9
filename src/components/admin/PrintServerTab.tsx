import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Printer, Save, Server, Trash2 } from "lucide-react";

const CONFIG_KEYS = {
  enabled: "print_server_enabled",
  baseUrl: "print_server_base_url",
  apiKey: "print_server_api_key",
  routesJson: "print_server_routes_json",
  kitchenPrinter: "print_server_printer_kitchen",
  barPrinter: "print_server_printer_bar",
  cashierPrinter: "print_server_printer_cashier",
} as const;

const TRIGGER_OPTIONS = [
  { value: "order_sent_kitchen", label: "Pedido enviado (Cozinha)" },
  { value: "order_sent_bar", label: "Pedido enviado (Bar)" },
  { value: "order_ready", label: "Pedido pronto" },
  { value: "table_bill", label: "Imprimir conta da mesa" },
  { value: "client_bill", label: "Imprimir conta individual" },
  { value: "cash_close", label: "Fechamento de caixa" },
] as const;

interface PrintRoute {
  id: string;
  trigger: string;
  printer: string;
  copies: number;
  enabled: boolean;
}

const normalizeRoute = (item: unknown): PrintRoute => {
  const raw = (typeof item === "object" && item !== null) ? item as Record<string, unknown> : {};
  return {
    id: String(raw.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
    trigger: String(raw.trigger ?? TRIGGER_OPTIONS[0].value),
    printer: String(raw.printer ?? ""),
    copies: Number(raw.copies ?? 1) > 0 ? Number(raw.copies ?? 1) : 1,
    enabled: Boolean(raw.enabled ?? true),
  };
};

const createRoute = (trigger = TRIGGER_OPTIONS[0].value, printer = ""): PrintRoute => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  trigger,
  printer,
  copies: 1,
  enabled: true,
});

const PrintServerTab = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [routes, setRoutes] = useState<PrintRoute[]>([]);

  const routesDescription = useMemo(() => {
    const active = routes.filter((route) => route.enabled);
    if (active.length === 0) return "Nenhum gatilho ativo.";
    return `${active.length} gatilho(s) ativo(s)`;
  }, [routes]);

  useEffect(() => {
    const loadConfig = async () => {
      const { data, error } = await supabase
        .from("app_config")
        .select("key, value")
        .in("key", Object.values(CONFIG_KEYS));

      if (error) {
        toast.error("Erro ao carregar configurações de impressão");
        setLoading(false);
        return;
      }

      const map = Object.fromEntries((data ?? []).map((row) => [row.key, row.value ?? ""]));
      setEnabled(map[CONFIG_KEYS.enabled] === "true");
      setBaseUrl(map[CONFIG_KEYS.baseUrl] ?? "");
      setApiKey(map[CONFIG_KEYS.apiKey] ?? "");
      try {
        const parsed = JSON.parse(map[CONFIG_KEYS.routesJson] ?? "[]");
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRoutes(parsed.map(normalizeRoute));
        } else {
          const legacyRoutes: PrintRoute[] = [];
          if (map[CONFIG_KEYS.kitchenPrinter]) {
            legacyRoutes.push(createRoute("order_sent_kitchen", map[CONFIG_KEYS.kitchenPrinter]));
          }
          if (map[CONFIG_KEYS.barPrinter]) {
            legacyRoutes.push(createRoute("order_sent_bar", map[CONFIG_KEYS.barPrinter]));
          }
          if (map[CONFIG_KEYS.cashierPrinter]) {
            legacyRoutes.push(createRoute("table_bill", map[CONFIG_KEYS.cashierPrinter]));
          }
          setRoutes(legacyRoutes.length > 0 ? legacyRoutes : [createRoute()]);
        }
      } catch {
        setRoutes([createRoute()]);
      }
      setLoading(false);
    };

    loadConfig();
  }, []);

  const save = async () => {
    if (enabled && !baseUrl.trim()) {
      toast.error("Informe a URL do Print Server para ativar o módulo.");
      return;
    }
    const invalidActiveRoute = routes.some((route) => route.enabled && (!route.printer.trim() || !route.trigger.trim()));
    if (invalidActiveRoute) {
      toast.error("Preencha impressora e gatilho em todas as regras ativas.");
      return;
    }
    if (routes.length === 0) {
      toast.error("Adicione ao menos uma regra de roteamento.");
      return;
    }

    setSaving(true);
    const kitchenLegacy = routes.find((route) => route.trigger === "order_sent_kitchen")?.printer ?? "";
    const barLegacy = routes.find((route) => route.trigger === "order_sent_bar")?.printer ?? "";
    const cashierLegacy =
      routes.find((route) => route.trigger === "table_bill")?.printer
      ?? routes.find((route) => route.trigger === "cash_close")?.printer
      ?? "";

    const rows = [
      { key: CONFIG_KEYS.enabled, value: String(enabled) },
      { key: CONFIG_KEYS.baseUrl, value: baseUrl.trim() },
      { key: CONFIG_KEYS.apiKey, value: apiKey.trim() },
      { key: CONFIG_KEYS.routesJson, value: JSON.stringify(routes) },
      { key: CONFIG_KEYS.kitchenPrinter, value: kitchenLegacy.trim() },
      { key: CONFIG_KEYS.barPrinter, value: barLegacy.trim() },
      { key: CONFIG_KEYS.cashierPrinter, value: cashierLegacy.trim() },
    ];

    for (const row of rows) {
      const { error } = await supabase
        .from("app_config")
        .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) {
        setSaving(false);
        toast.error("Erro ao salvar configurações do Print Server");
        return;
      }
    }

    setSaving(false);
    toast.success("Configurações de impressão salvas.");
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <section className="rounded-lg border border-border bg-card p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Server className="h-4 w-4" />
          Integração com Print Server
        </div>
        <p className="text-xs text-muted-foreground">
          Configure um servidor local/rede para receber impressões de comandas e contas.
        </p>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-border bg-muted accent-primary"
          />
          <span>Ativar Print Server</span>
        </label>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="space-y-2">
          <Label className="text-muted-foreground">URL base do servidor</Label>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://192.168.0.10:3000"
            className="bg-muted font-mono text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground">API Key (opcional)</Label>
          <Input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="token-do-print-server"
            className="bg-muted font-mono text-sm"
          />
        </div>

        <div className="space-y-3 rounded-md border border-border/70 bg-muted/20 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Roteamento de impressoras por gatilho</p>
              <p className="text-xs text-muted-foreground">{routesDescription}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => setRoutes((prev) => [...prev, createRoute()])}
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar regra
            </Button>
          </div>

          {routes.map((route) => (
            <div key={route.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 rounded-md border border-border bg-card p-2">
              <div className="md:col-span-3 space-y-1">
                <Label className="text-xs text-muted-foreground">Gatilho</Label>
                <select
                  value={route.trigger}
                  onChange={(e) => setRoutes((prev) => prev.map((item) => (
                    item.id === route.id ? { ...item, trigger: e.target.value } : item
                  )))}
                  className="w-full h-9 rounded-md border border-border bg-muted px-2 text-sm text-foreground"
                >
                  {TRIGGER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-4 space-y-1">
                <Label className="text-xs text-muted-foreground">Impressora</Label>
                <Input
                  value={route.printer}
                  onChange={(e) => setRoutes((prev) => prev.map((item) => (
                    item.id === route.id ? { ...item, printer: e.target.value } : item
                  )))}
                  placeholder="KITCHEN_01 / BAR_01 / IP da impressora"
                  className="bg-muted"
                />
              </div>

              <div className="md:col-span-2 space-y-1">
                <Label className="text-xs text-muted-foreground">Cópias</Label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={route.copies}
                  onChange={(e) => setRoutes((prev) => prev.map((item) => (
                    item.id === route.id
                      ? { ...item, copies: Math.max(1, Math.min(10, Number(e.target.value) || 1)) }
                      : item
                  )))}
                  className="bg-muted"
                />
              </div>

              <div className="md:col-span-2 flex items-end">
                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground h-9">
                  <input
                    type="checkbox"
                    checked={route.enabled}
                    onChange={(e) => setRoutes((prev) => prev.map((item) => (
                      item.id === route.id ? { ...item, enabled: e.target.checked } : item
                    )))}
                    className="h-4 w-4 rounded border-border bg-muted accent-primary"
                  />
                  Ativo
                </label>
              </div>

              <div className="md:col-span-1 flex items-end justify-end">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setRoutes((prev) => prev.length > 1 ? prev.filter((item) => item.id !== route.id) : prev)}
                  title="Remover regra"
                  disabled={routes.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <Button onClick={save} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Salvando..." : "Salvar Print Server"}
        </Button>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
          <Printer className="h-4 w-4" />
          Como usar
        </div>
        <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1">
          <li>Ative o módulo e informe a URL do serviço de impressão na rede local.</li>
          <li>Crie regras com gatilho + impressora (ex.: pedido cozinha -&gt; KITCHEN_01).</li>
          <li>Use múltiplas regras para distribuir impressão entre cozinhas, bar e caixa.</li>
        </ul>
      </section>
    </div>
  );
};

export default PrintServerTab;
