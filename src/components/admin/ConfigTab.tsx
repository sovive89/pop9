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
  createdAt: string;
}

const normalizeForId = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

const buildBaseId = (unitName: string) => {
  const normalized = normalizeForId(unitName);
  return `db_${normalized || "unidade"}`;
};

const buildUniqueId = (unitName: string, current: EstablishmentConfig[]) => {
  const usedIds = new Set(current.map((item) => item.id.toLowerCase()));
  const base = buildBaseId(unitName);
  let candidate = base;
  let counter = 2;
  while (usedIds.has(candidate.toLowerCase())) {
    candidate = `${base}_${counter}`;
    counter += 1;
  }
  return candidate;
};

const ConfigTab = () => {
  const [unitName, setUnitName] = useState("");
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
          const parsed = JSON.parse(registryRaw) as unknown;
          if (Array.isArray(parsed)) {
            parsedRegistry = parsed
              .map((item): EstablishmentConfig | null => {
                if (!item || typeof item !== "object") return null;
                const row = item as Record<string, unknown>;
                const unit =
                  typeof row.unitName === "string"
                    ? row.unitName.trim()
                    : "";
                if (!unit) return null;

                const idFromRow =
                  typeof row.id === "string" && row.id.trim()
                    ? row.id.trim()
                    : typeof row.databaseName === "string" && row.databaseName.trim()
                      ? row.databaseName.trim()
                      : buildBaseId(unit);

                return {
                  id: idFromRow,
                  unitName: unit,
                  createdAt:
                    typeof row.createdAt === "string" && row.createdAt.trim()
                      ? row.createdAt
                      : new Date().toISOString(),
                };
              })
              .filter((item): item is EstablishmentConfig => item !== null);
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
        const legacyUnit = (values[CONFIG_KEYS.unitName] ?? "").trim();
        const legacyId = (values[CONFIG_KEYS.databaseName] ?? "").trim();
        const resolvedUnit = legacyUnit || legacyId || "Unidade legada";
        parsedRegistry = [
          {
            id: legacyId || buildBaseId(resolvedUnit),
            unitName: resolvedUnit,
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

    const normalizedUnit = unitName.trim();
    const generatedId = buildUniqueId(normalizedUnit, establishments);

    const duplicate = establishments.some(
      (item) =>
        item.unitName.toLowerCase() === normalizedUnit.toLowerCase(),
    );

    if (duplicate) {
      toast.error("Este estabelecimento já foi adicionado.");
      return;
    }

    const newEntry: EstablishmentConfig = {
      id: generatedId,
      unitName: normalizedUnit,
      createdAt: new Date().toISOString(),
    };

    setEstablishments((prev) => [newEntry, ...prev]);
    setUnitName("");
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
      { key: CONFIG_KEYS.databaseName, value: main.id, updated_at: now },
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

  const previewId = buildBaseId(unitName.trim());

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-foreground">
            Cadastro de estabelecimentos
          </h3>
          <p className="text-xs text-muted-foreground">
            Cada novo estabelecimento repete a estrutura do banco; informe a unidade e o ID do banco será definido automaticamente por regra.
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
          <Label htmlFor="database-id-preview" className="text-muted-foreground">
            ID do banco (gerado automaticamente)
          </Label>
          <div className="relative">
            <Database className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="database-id-preview"
              value={previewId}
              readOnly
              className="bg-muted pl-9 font-mono text-sm"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Regra: <span className="font-mono">db_</span> + nome da unidade em minúsculas, sem acentos e com <span className="font-mono">_</span>.
          </p>
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
                      ID do banco: <span className="font-mono">{item.id}</span>
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
