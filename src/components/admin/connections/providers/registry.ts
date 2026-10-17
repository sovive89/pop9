import { whatsappProvider } from "./whatsappProvider";
import { createGenericProvider } from "./genericProvider";
import type { IntegrationProvider } from "./types";

/**
 * Registro de providers implementados de verdade. Adicionar uma integração
 * real nova = criar `providers/xProvider.ts` implementando
 * `IntegrationProvider` e registrar uma linha aqui — a UI não precisa
 * mudar em nada.
 *
 * Qualquer slug que não estiver aqui cai automaticamente no provider
 * genérico (`getProvider` abaixo), que só sabe ler/gravar rascunho de
 * config na tabela `integrations` e nunca finge conectar.
 */
const REAL_PROVIDERS: Record<string, IntegrationProvider> = {
  whatsapp: whatsappProvider,
};

const genericCache = new Map<string, IntegrationProvider>();

export function getProvider(slug: string): IntegrationProvider {
  if (REAL_PROVIDERS[slug]) return REAL_PROVIDERS[slug];
  if (!genericCache.has(slug)) genericCache.set(slug, createGenericProvider(slug));
  return genericCache.get(slug)!;
}

export function isImplemented(slug: string): boolean {
  return Boolean(REAL_PROVIDERS[slug]);
}
