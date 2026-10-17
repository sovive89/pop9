import type { IntegrationStatus } from "../types";

/**
 * Contrato que cada integração real precisa implementar. A UI (galeria,
 * card, modal) NUNCA conhece os detalhes de um provider específico — só
 * chama esses métodos através do registry. Isso é o que permite plugar uma
 * integração nova sem tocar em nenhum componente de tela.
 *
 * Nenhum método aqui deve manipular segredos diretamente no frontend —
 * `connect`/`testConnection` chamam uma Edge Function quando a integração
 * de fato precisar de um segredo (token, client secret); campos marcados
 * `secret: true` no catálogo nunca são persistidos em `integrations.config`.
 */
export interface IntegrationProvider {
  slug: string;

  /** Lê o estado atual da integração (pode ler de `integrations` e/ou de
   * uma tabela própria, como o WhatsApp faz com `app_config`). */
  getStatus(businessUnitId: string | null): Promise<{ status: IntegrationStatus; config: Record<string, unknown> }>;

  /** Salva a configuração não-secreta informada no modal. Não deve, por si
   * só, marcar como CONNECTED — só grava o rascunho de config. */
  saveConfig(businessUnitId: string | null, config: Record<string, unknown>): Promise<void>;

  /** Só existe quando há de fato uma forma de verificar a conexão (uma
   * Edge Function que bate na API do provedor). Se ausente, a UI não
   * mostra o botão "Testar conexão" — nunca finge um teste. */
  testConnection?(businessUnitId: string | null): Promise<{ ok: boolean; message: string }>;

  connect(businessUnitId: string | null, config: Record<string, unknown>): Promise<void>;

  disconnect(businessUnitId: string | null): Promise<void>;

  /** Optional import support for future providers with a verified data contract. */
  importData?(businessUnitId: string | null): Promise<{ imported: Record<string, number> }>;
}
