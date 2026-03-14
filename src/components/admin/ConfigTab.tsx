import { useEffect, useState } from "react";
import { Building2, Database, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const CONFIG_KEYS = {
  registry: "establishments_registry",
  unitName: "unit_name",
  databaseName: "database_name",
} as const;

interface EstablishmentConfig {
  id: string;
  unitName: string;
  databaseName: string;
  createdAt: string;
}

const ConfigTab = () => {
  const [unitName, setUnitName] = useState("");
  const [databaseName, setDatabaseName] = useState("");
  const [establishments, setEstablishments] = useState<EstablishmentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("app_config")
        .select("key, value")
        .in("key", [CONFIG_KEYS.registry, CONFIG_KEYS.unitName, CONFIG_KEYS.databaseName]);

      if (error) {
        console.error(error);
        toast.error("Erro ao carregar cadastro de estabelecimentos.");
        setLoading(false);
        return;
      }

      const values = Object.fromEntries(
        (data ?? []).map((row) => [row.key, row.value ?? ""]),
      );

      const registryRaw = values[CONFIG_KEYS.registry] ?? "";
      let parsedRegistry: EstablishmentConfig[] = [];
      if (registryRaw) {
        try {
          const parsed = JSON.parse(registryRaw) as EstablishmentConfig[];
          if (Array.isArray(parsed)) {
            parsedRegistry = parsed.filter(
              (item) =>
                typeof item?.id === "string" &&
                typeof item?.unitName === "string" &&
                typeof item?.databaseName === "string" &&
                typeof item?.createdAt === "string",
            );
          }
        } catch (parseError) {
          console.error("Falha ao ler estabelecimentos cadastrados:", parseError);
        }
      }

      // Compatibilidade com versão anterior que armazenava apenas uma unidade.
      if (
        parsedRegistry.length === 0 &&
        (values[CONFIG_KEYS.unitName] || values[CONFIG_KEYS.databaseName])
      ) {
        parsedRegistry = [
          {
            id: "legacy-unit",
            unitName: values[CONFIG_KEYS.unitName] ?? "",
            databaseName: values[CONFIG_KEYS.databaseName] ?? "",
            createdAt: new Date().toISOString(),
          },
        ];
      }

      setEstablishments(parsedRegistry);
      setLoading(false);
    };

    load();
  }, []);

  const handleAddEstablishment = () => {
    if (!unitName.trim()) {
      toast.error("Informe o nome da unidade.");
      return;
    }

    if (!databaseName.trim()) {
      toast.error("Informe o nome do banco de dados.");
      return;
    }

    const normalizedUnit = unitName.trim();
    const normalizedDb = databaseName.trim();

    const duplicate = establishments.some(
      (item) =>
        item.unitName.toLowerCase() === normalizedUnit.toLowerCase() &&
        item.databaseName.toLowerCase() === normalizedDb.toLowerCase(),
    );

    if (duplicate) {
      toast.error("Este estabelecimento já foi adicionado.");
      return;
    }

    const newEntry: EstablishmentConfig = {
      id:
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      unitName: normalizedUnit,
      databaseName: normalizedDb,
      createdAt: new Date().toISOString(),
    };

    setEstablishments((prev) => [newEntry, ...prev]);
    setUnitName("");
    setDatabaseName("");
    toast.success("Estabelecimento adicionado à lista.");
  };

  const handleRemoveEstablishment = (id: string) => {
    setEstablishments((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSave = async () => {
    if (establishments.length === 0) {
      toast.error("Adicione pelo menos um estabelecimento antes de salvar.");
      return;
    }

    setSaving(true);
    const now = new Date().toISOString();
    const main = establishments[0];
    const rows = [
      { key: CONFIG_KEYS.registry, value: JSON.stringify(establishments), updated_at: now },
      { key: CONFIG_KEYS.unitName, value: main.unitName, updated_at: now },
      { key: CONFIG_KEYS.databaseName, value: main.databaseName, updated_at: now },
    ];

    const { error } = await supabase
      .from("app_config")
      .upsert(rows, { onConflict: "key" });

    if (error) {
      console.error(error);
      toast.error("Erro ao salvar estabelecimentos.");
      setSaving(false);
      return;
    }

    toast.success("Cadastro de estabelecimentos salvo.");
    setSaving(false);
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-foreground">
            Cadastro de estabelecimentos
          </h3>
          <p className="text-xs text-muted-foreground">
            Cada novo estabelecimento repete a estrutura do banco; cadastre aqui o nome da unidade e o nome do banco de dados.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="unit-name" className="text-muted-foreground">
            Nome da unidade
          </Label>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="unit-name"
              value={unitName}
              onChange={(event) => setUnitName(event.target.value)}
              placeholder="Ex.: Unidade Centro"
              className="bg-muted pl-9"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="database-name" className="text-muted-foreground">
            Nome do banco de dados
          </Label>
          <div className="relative">
            <Database className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="database-name"
              value={databaseName}
              onChange={(event) => setDatabaseName(event.target.value)}
              placeholder="Ex.: pop9_producao"
              className="bg-muted pl-9"
            />
          </div>
        </div>

        <Button type="button" variant="outline" onClick={handleAddEstablishment} className="gap-2">
          <Plus className="h-4 w-4" />
          Adicionar estabelecimento
        </Button>

        <div className="space-y-2">
          <Label className="text-muted-foreground">Estabelecimentos adicionados</Label>
          {establishments.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              Nenhum estabelecimento adicionado.
            </div>
          ) : (
            <div className="space-y-2">
              {establishments.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-md border border-border bg-muted px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{item.unitName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      Banco: {item.databaseName}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveEstablishment(item.id)}
                    title="Remover estabelecimento"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Salvando..." : "Salvar cadastro"}
        </Button>
      </div>
    </div>
  );
};

export default ConfigTab;
