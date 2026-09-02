import { getIntegrationRecord, upsertIntegrationRecord } from "./db";
import type { IntegrationProvider } from "./types";

/**
 * Provider usado por toda integração cujo catálogo diz `implemented:
 * false`. Só sabe ler/gravar a tabela `integrations` — não tem `connect`
 * de verdade porque não há API nenhuma por trás ainda. A UI (ver
 * `IntegrationConfigModal`) nunca chama `connect`/`testConnection` para um
 * catálogo não-implementado; estas implementações existem só para
 * satisfazer o contrato e falhar alto se algo tentar chamá-las por engano.
 */
export function createGenericProvider(slug: string): IntegrationProvider {
  return {
    slug,

    async getStatus() {
      const record = await getIntegrationRecord(slug);
      return { status: record?.status ?? "NOT_CONNECTED", config: record?.config ?? {} };
    },

    async saveConfig(businessUnitId, config) {
      // Só guarda o rascunho de configuração (campos não-secretos) — nunca
      // marca como conectado sozinho.
      await upsertIntegrationRecord(slug, businessUnitId, { config, status: "NOT_CONNECTED" });
    },

    async connect() {
      throw new Error(
        `A integração "${slug}" ainda não tem um provider real implementado — não há como conectar de verdade ainda.`,
      );
    },

    async disconnect(businessUnitId) {
      await upsertIntegrationRecord(slug, businessUnitId, {
        status: "DISCONNECTED",
        connectedAt: null,
      });
    },
  };
}
