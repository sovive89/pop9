import { supabase } from "@/integrations/supabase/client";
import { getIntegrationRecord, upsertIntegrationRecord } from "./db";
import type { IntegrationProvider } from "./types";

/**
 * Único provider "de verdade" até agora. Reaproveita exatamente a lógica
 * já existente em `WhatsAppTab.tsx` (tabela `app_config`, mesmas chaves) —
 * não reinventa nada, só espelha o mesmo comportamento por trás do
 * contrato `IntegrationProvider` e adiciona o status na tabela
 * `integrations` (que `WhatsAppTab.tsx` sozinha nunca tinha).
 *
 * Importante: não há verificação real de que o WhatsApp está de fato
 * respondendo (os secrets — token de acesso, verify token — são definidos
 * manualmente no Supabase Dashboard, fora do alcance do frontend, exatamente
 * como já era antes desta função existir). "Conectado" aqui significa
 * "configuração salva", não "handshake confirmado com a Meta" — por isso
 * não há `testConnection`: mostrar um teste que não testa nada de verdade
 * seria simular uma conexão, o que foi pedido explicitamente para evitar.
 */
const CONFIG_KEYS = {
  welcome: "whatsapp_welcome_message",
  phoneId: "whatsapp_phone_number_id",
  botWebhook: "whatsapp_bot_webhook_url",
} as const;

async function loadAppConfig() {
  const { data, error } = await supabase
    .from("app_config")
    .select("key, value")
    .in("key", Object.values(CONFIG_KEYS));
  if (error) return {};
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value ?? ""])) as Record<string, string>;
}

async function saveAppConfig(config: Record<string, unknown>) {
  const rows = [
    { key: CONFIG_KEYS.welcome, value: String(config.welcomeMessage ?? "") },
    { key: CONFIG_KEYS.phoneId, value: String(config.phoneNumberId ?? "") },
    { key: CONFIG_KEYS.botWebhook, value: String(config.botWebhookUrl ?? "") },
  ];
  for (const row of rows) {
    const { error } = await supabase
      .from("app_config")
      .upsert({ key: row.key, value: row.value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error(error.message);
  }
}

export const whatsappProvider: IntegrationProvider = {
  slug: "whatsapp",

  async getStatus() {
    const [record, appConfig] = await Promise.all([getIntegrationRecord("whatsapp"), loadAppConfig()]);
    return {
      status: record?.status ?? "NOT_CONNECTED",
      config: {
        welcomeMessage: appConfig[CONFIG_KEYS.welcome] ?? "",
        phoneNumberId: appConfig[CONFIG_KEYS.phoneId] ?? "",
        botWebhookUrl: appConfig[CONFIG_KEYS.botWebhook] ?? "",
      },
    };
  },

  async saveConfig(businessUnitId, config) {
    await saveAppConfig(config);
    await upsertIntegrationRecord("whatsapp", businessUnitId, { config });
  },

  // Sem testConnection: não existe endpoint para verificar de verdade sem
  // simular. Ver comentário no topo do arquivo.

  async connect(businessUnitId, config) {
    await saveAppConfig(config);
    await upsertIntegrationRecord("whatsapp", businessUnitId, {
      status: "CONNECTED",
      config,
      connectedAt: new Date().toISOString(),
      errorMessage: null,
    });
  },

  async disconnect(businessUnitId) {
    await upsertIntegrationRecord("whatsapp", businessUnitId, {
      status: "DISCONNECTED",
      connectedAt: null,
    });
  },
};
