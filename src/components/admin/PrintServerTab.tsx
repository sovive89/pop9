import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Printer, Server, Save } from "lucide-react";

const CONFIG_KEYS = {
  enabled: "print_server_enabled",
  baseUrl: "print_server_base_url",
  apiKey: "print_server_api_key",
  kitchenPrinter: "print_server_printer_kitchen",
  barPrinter: "print_server_printer_bar",
  cashierPrinter: "print_server_printer_cashier",
} as const;

const PrintServerTab = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [kitchenPrinter, setKitchenPrinter] = useState("");
  const [barPrinter, setBarPrinter] = useState("");
  const [cashierPrinter, setCashierPrinter] = useState("");

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
      setKitchenPrinter(map[CONFIG_KEYS.kitchenPrinter] ?? "");
      setBarPrinter(map[CONFIG_KEYS.barPrinter] ?? "");
      setCashierPrinter(map[CONFIG_KEYS.cashierPrinter] ?? "");
      setLoading(false);
    };

    loadConfig();
  }, []);

  const save = async () => {
    if (enabled && !baseUrl.trim()) {
      toast.error("Informe a URL do Print Server para ativar o módulo.");
      return;
    }

    setSaving(true);
    const rows = [
      { key: CONFIG_KEYS.enabled, value: String(enabled) },
      { key: CONFIG_KEYS.baseUrl, value: baseUrl.trim() },
      { key: CONFIG_KEYS.apiKey, value: apiKey.trim() },
      { key: CONFIG_KEYS.kitchenPrinter, value: kitchenPrinter.trim() },
      { key: CONFIG_KEYS.barPrinter, value: barPrinter.trim() },
      { key: CONFIG_KEYS.cashierPrinter, value: cashierPrinter.trim() },
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Impressora Cozinha</Label>
            <Input
              value={kitchenPrinter}
              onChange={(e) => setKitchenPrinter(e.target.value)}
              placeholder="KITCHEN_01"
              className="bg-muted"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground">Impressora Bar</Label>
            <Input
              value={barPrinter}
              onChange={(e) => setBarPrinter(e.target.value)}
              placeholder="BAR_01"
              className="bg-muted"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground">Impressora Caixa</Label>
            <Input
              value={cashierPrinter}
              onChange={(e) => setCashierPrinter(e.target.value)}
              placeholder="CAIXA_01"
              className="bg-muted"
            />
          </div>
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
          <li>Cadastre os nomes/IDs das impressoras para cozinha, bar e caixa.</li>
          <li>Salve para deixar a configuração disponível para os demais módulos.</li>
        </ul>
      </section>
    </div>
  );
};

export default PrintServerTab;
