/**
 * Tipos centrais da central de Conexões (galeria de integrações).
 *
 * Duas coisas diferentes convivem aqui, de propósito:
 * - `IntegrationDefinition`: o CATÁLOGO estático (estilo "App Store") — nome,
 *   categoria, logo, que campos pedir. Isso é só metadado, vive no código.
 * - `IntegrationRecord`: o REGISTRO no banco (tabela `integrations`) — o que
 *   está de fato conectado para este negócio, com status e datas.
 *
 * `IntegrationView` é a junção das duas (catálogo + registro, se existir)
 * que a UI efetivamente consome.
 */

/** Estados possíveis de uma conexão. Nomes em inglês de propósito — é o
 * vocabulário que vai para o banco (`integrations.status`). */
export type IntegrationStatus = "NOT_CONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR" | "DISCONNECTED";

export type IntegrationCategory =
  | "DELIVERY"
  | "COMMUNICATION"
  | "POS"
  | "MENU"
  | "PAYMENTS"
  | "MANAGEMENT"
  | "ECOMMERCE"
  | "AUTOMATION"
  | "AI";

export const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  DELIVERY: "Delivery",
  COMMUNICATION: "Comunicação",
  POS: "PDV / Sistemas de restaurante",
  MENU: "Cardápio digital",
  PAYMENTS: "Pagamentos",
  MANAGEMENT: "Gestão / ERP",
  ECOMMERCE: "E-commerce",
  AUTOMATION: "Automação / API",
  AI: "IA",
};

/**
 * Papel da integração na arquitetura. Essa é a distinção mais importante do
 * catálogo — é ela que impede o Pipeline de tratar um iFood (que opera junto
 * com o sistema todo dia) igual a um Saipos (de onde só se puxa dado uma vez,
 * na migração).
 *
 * - OPERATIONAL: faz parte da operação diária, tende a ser bidirecional.
 * - IMPORT: existe para trazer dado legado/histórico para dentro. O Pipeline
 *   nunca escreve de volta nem depende dele para operar depois da migração.
 * - SUPPORT: ferramenta que o Core chama (IA) ou superfície que o próprio
 *   Pipeline expõe (webhook/REST/GraphQL). Não traz Cliente/Pedido/Produto,
 *   então não passa pelo normalizador.
 */
export type IntegrationType = "OPERATIONAL" | "IMPORT" | "SUPPORT";

export const TYPE_LABELS: Record<IntegrationType, string> = {
  OPERATIONAL: "Operacional",
  IMPORT: "Importação",
  SUPPORT: "Apoio",
};

/** O que uma integração sabe fazer. Nomes em inglês porque é vocabulário de
 * arquitetura, igual ao status. */
export type IntegrationCapability = "READ" | "WRITE" | "WEBHOOK" | "SYNC" | "IMPORT";

export const CAPABILITY_ORDER: IntegrationCapability[] = ["READ", "WRITE", "WEBHOOK", "SYNC", "IMPORT"];

export const CAPABILITY_LABELS: Record<IntegrationCapability, string> = {
  READ: "Ler dados",
  WRITE: "Enviar dados",
  WEBHOOK: "Receber eventos",
  SYNC: "Sincronizar",
  IMPORT: "Importar histórico",
};

/**
 * `API_DEPENDENT` existe de propósito: em boa parte dos parceiros a
 * capacidade só é liberada conforme o contrato/nível de acesso da API
 * oficial. Marcar como `YES` sem confirmação seria prometer algo que o
 * conector pode não conseguir entregar.
 */
export type CapabilitySupport = "YES" | "NO" | "API_DEPENDENT";

export type IntegrationCapabilities = Record<IntegrationCapability, CapabilitySupport>;

/** Como a conexão é autenticada — define quais campos o modal de
 * configuração deve renderizar. */
export type ConfigType = "api_key" | "oauth" | "webhook" | "manual";

/** Um campo do formulário de configuração de uma integração. Puramente
 * declarativo: a UI genérica (`IntegrationConfigModal`) sabe renderizar
 * qualquer combinação disso sem precisar conhecer a integração em si. */
export interface IntegrationConfigField {
  key: string;
  label: string;
  placeholder?: string;
  type: "text" | "password" | "url" | "textarea";
  required?: boolean;
  helperText?: string;
  /** Nunca deve ir para `integrations.config` (que é jsonb não-secreto e
   * fica visível). Campos secretos são só exibidos como "defina isso no
   * backend" — nunca persistidos pelo frontend. */
  secret?: boolean;
}

/** Uma entrada do catálogo — 100% estático, vive no código-fonte. Adicionar
 * uma integração nova é só acrescentar um objeto aqui; a grade, os filtros
 * e o modal genérico se adaptam sozinhos. */
export interface IntegrationDefinition {
  id: string;
  /** Igual a `id` hoje; existe separado porque é o valor gravado em
   * `integrations.provider` — mantê-lo estável é o que importa, não o `id`. */
  slug: string;
  name: string;
  category: IntegrationCategory;
  /** Papel na arquitetura — ver IntegrationType. */
  type: IntegrationType;
  /** O que este conector declara saber fazer. `null` para integrações de
   * apoio: READ/WRITE/WEBHOOK/SYNC/IMPORT não descrevem nada numa chamada de
   * IA nem na API que o próprio Pipeline expõe. */
  capabilities: IntegrationCapabilities | null;
  description: string;
  configType: ConfigType;
  /** Slug do ícone em `simple-icons`, quando existe um logo oficial
   * confiável disponível na lib já instalada no projeto. Ausente = usa o
   * monograma de fallback (nunca um logo desenhado à mão). */
  simpleIconSlug?: string;
  /** Cor de fallback (hex, sem #) para o monograma quando não há
   * `simpleIconSlug`. Opcional — cai numa paleta neutra se ausente. */
  fallbackColor?: string;
  fields: IntegrationConfigField[];
  /** Se `false`, não existe Provider real por trás ainda — o modal mostra
   * "Configuração necessária" / "Em desenvolvimento" e NUNCA permite marcar
   * como conectado (ver providers/registry.ts). */
  implemented: boolean;
  /** Texto curto explicando o que a integração destrava, mostrado no topo
   * do modal de configuração. */
  whatItEnables: string;
  /** Link de documentação oficial da integração (opcional, mostrado no
   * modal para quem for configurar de verdade). */
  docsUrl?: string;
}

/** Uma linha da tabela `integrations` (banco), já em camelCase. */
export interface IntegrationRecord {
  id: string;
  businessUnitId: string | null;
  provider: string;
  status: IntegrationStatus;
  config: Record<string, unknown>;
  connectedAt: string | null;
  lastSyncAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

/** O que a UI realmente usa: catálogo + estado atual (se houver linha no
 * banco) já combinados. */
export interface IntegrationView {
  definition: IntegrationDefinition;
  record: IntegrationRecord | null;
  status: IntegrationStatus;
}
