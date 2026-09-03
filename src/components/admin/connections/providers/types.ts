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

  /**
   * Só existe em conectores do tipo IMPORT (Saipos, Colibri, Everest,
   * Consumer, Linx, Sischef). Puxa cadastro e histórico do sistema de origem,
   * normaliza e grava no modelo do Pipeline — uma operação pontual de
   * migração, não uma sincronização contínua.
   *
   * Nenhum provider implementa isso ainda, e é de propósito: nenhum desses
   * PDVs teve API/exportação oficial confirmada até agora. O contrato existe
   * para que, quando as credenciais de um deles chegarem, o trabalho seja
   * escrever um provider — sem mexer em tela nenhuma.
   *
   * Quem implementar deve devolver a contagem do que entrou por entidade
   * (ex.: `{ customers: 812, products: 143 }`) para a tela conseguir dizer o
   * que foi importado em vez de só "sucesso".
   */
  importData?(businessUnitId: string | null): Promise<{ imported: Record<string, number> }>;
}
