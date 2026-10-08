import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { INTEGRATIONS_CATALOG } from "@/components/admin/connections/catalog";
import { getProvider, isImplemented } from "@/components/admin/connections/providers/registry";
import { loadAllIntegrationRecords } from "@/components/admin/connections/providers/db";
import type { IntegrationRecord, IntegrationView } from "@/components/admin/connections/types";

/**
 * Hook central da galeria de Conexões. Segue o mesmo formato de
 * `usePrinterConfigs`/`useStockData`: um `loadX` que popula estado local,
 * mutações que chamam o backend e depois recarregam (sem cache/react-query
 * — é o padrão já usado no resto do admin).
 *
 * A diferença é que aqui o "dado" é sempre a junção do catálogo estático
 * (INTEGRATIONS_CATALOG) com os registros reais da tabela `integrations` —
 * por isso `views` é derivado (useMemo), não guardado em state próprio.
 */
export function useIntegrations() {
  const [records, setRecords] = useState<IntegrationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { records: loaded, error } = await loadAllIntegrationRecords();
    if (error) {
      // Defensivo: a migration da tabela `integrations` pode ainda não ter
      // sido aplicada neste ambiente (mesmo tratamento não-bloqueante que
      // useStockData.ts já faz para `lotes`). A galeria continua
      // utilizável — só mostra tudo como "não conectado".
      setTableMissing(true);
      setRecords([]);
      setLoading(false);
      return;
    }
    setTableMissing(false);
    setRecords(loaded);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const views: IntegrationView[] = useMemo(
    () =>
      INTEGRATIONS_CATALOG.map((definition) => {
        const record = records.find((r) => r.provider === definition.slug) ?? null;
        return { definition, record, status: record?.status ?? "NOT_CONNECTED" };
      }),
    [records],
  );

  const saveConfig = useCallback(
    async (slug: string, businessUnitId: string | null, config: Record<string, unknown>) => {
      try {
        await getProvider(slug).saveConfig(businessUnitId, config);
        toast.success("Configuração salva.");
        await load();
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao salvar configuração.");
        return false;
      }
    },
    [load],
  );

  const connect = useCallback(
    async (slug: string, businessUnitId: string | null, config: Record<string, unknown>) => {
      if (!isImplemented(slug)) {
        toast.error("Essa integração ainda não está disponível para conectar.");
        return false;
      }
      try {
        await getProvider(slug).connect(businessUnitId, config);
        toast.success("Integração conectada.");
        await load();
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao conectar.");
        return false;
      }
    },
    [load],
  );

  const disconnect = useCallback(
    async (slug: string, businessUnitId: string | null) => {
      try {
        await getProvider(slug).disconnect(businessUnitId);
        toast.success("Integração desconectada.");
        await load();
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao desconectar.");
        return false;
      }
    },
    [load],
  );

  return { views, loading, tableMissing, saveConfig, connect, disconnect, reload: load };
}
