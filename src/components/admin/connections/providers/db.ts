import { supabase } from "@/integrations/supabase/client";
import type { IntegrationRecord, IntegrationStatus } from "../types";

/**
 * A tabela `integrations` (migration
 * `supabase/migrations/20260902120000_integrations.sql`) ainda não existe
 * nos tipos gerados do Supabase (`src/integrations/supabase/types.ts`) —
 * só é atualizada rodando `supabase gen types` contra o projeto real, o
 * que esta sessão não tem como fazer. O mesmo já acontece hoje com
 * `app_config` (usada em WhatsAppTab.tsx) e `table_zones`
 * (useTableZones.ts): o projeto tolera esse descompasso de tipos — o
 * `vite build` não roda checagem de tipo, só o `tsc --noEmit` avulso
 * acusa. Por isso o cast: é o mesmo padrão já usado no resto do código,
 * não algo novo criado aqui.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const integrationsTable = () => (supabase as any).from("integrations");

function mapRow(row: Record<string, unknown>): IntegrationRecord {
  return {
    id: row.id as string,
    businessUnitId: (row.business_unit_id as string | null) ?? null,
    provider: row.provider as string,
    status: row.status as IntegrationStatus,
    config: (row.config as Record<string, unknown>) ?? {},
    connectedAt: (row.connected_at as string | null) ?? null,
    lastSyncAt: (row.last_sync_at as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/** Carrega todas as linhas de `integrations` (uma consulta só — a galeria
 * inteira usa isso, cada provider individual não precisa buscar sozinho). */
export async function loadAllIntegrationRecords(): Promise<{ records: IntegrationRecord[]; error: string | null }> {
  const { data, error } = await integrationsTable().select("*");
  if (error) {
    // Tabela pode ainda não existir neste ambiente (migration não aplicada)
    // — mesmo tratamento defensivo que useStockData.ts já faz para lotes.
    return { records: [], error: error.message };
  }
  return { records: ((data ?? []) as Record<string, unknown>[]).map(mapRow), error: null };
}

export async function getIntegrationRecord(provider: string): Promise<IntegrationRecord | null> {
  const { data, error } = await integrationsTable().select("*").eq("provider", provider).maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function upsertIntegrationRecord(
  provider: string,
  businessUnitId: string | null,
  patch: Partial<{
    status: IntegrationStatus;
    config: Record<string, unknown>;
    connectedAt: string | null;
    lastSyncAt: string | null;
    errorMessage: string | null;
  }>,
): Promise<void> {
  const row: Record<string, unknown> = { provider, business_unit_id: businessUnitId, updated_at: new Date().toISOString() };
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.config !== undefined) row.config = patch.config;
  if (patch.connectedAt !== undefined) row.connected_at = patch.connectedAt;
  if (patch.lastSyncAt !== undefined) row.last_sync_at = patch.lastSyncAt;
  if (patch.errorMessage !== undefined) row.error_message = patch.errorMessage;

  // Chave natural é só `provider` por enquanto (não `business_unit_id` +
  // `provider`): igual ao resto do projeto (ver printer_configs), o
  // isolamento por unidade ainda não é aplicado em lugar nenhum — e um
  // UNIQUE composto com uma coluna nullable não deduplicaria linhas com
  // business_unit_id null mesmo assim (NULL nunca conflita com NULL no
  // Postgres). Revisitar quando o multi-unidade for implementado de fato.
  const { error } = await integrationsTable().upsert(row, { onConflict: "provider" });
  if (error) throw new Error(error.message);
}
