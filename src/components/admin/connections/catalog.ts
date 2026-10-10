import type { IntegrationCapabilities, IntegrationConfigField, IntegrationDefinition } from "./types";

/** Conjuntos de campo reaproveitados entre integrações do mesmo tipo de
 * autenticação — evita repetir a mesma descrição de campo 30 vezes. */
const API_KEY_FIELD: IntegrationConfigField[] = [
  { key: "apiKey", label: "Chave de API", type: "password", required: true, secret: true },
];

const OAUTH_FIELDS: IntegrationConfigField[] = [];

/** Monta o registro completo de capacidades a partir só do que é suportado —
 * o resto cai em "NO". Deixa cada entrada do catálogo legível sem ter que
 * repetir as 5 chaves toda vez. */
const caps = (partial: Partial<IntegrationCapabilities>): IntegrationCapabilities => ({
  READ: "NO",
  WRITE: "NO",
  WEBHOOK: "NO",
  SYNC: "NO",
  IMPORT: "NO",
  ...partial,
});

/**
 * Perfis de capacidade por família. A maioria das integrações de um mesmo
 * grupo tem exatamente o mesmo perfil — quando não tem, a entrada declara o
 * seu próprio.
 *
 * `API_DEPENDENT` ("depende da API") é usado sempre que a capacidade existe
 * no papel mas depende do nível de acesso liberado pelo parceiro. É
 * deliberadamente diferente de `YES`: prometer escrita que a API não libera
 * quebraria o Outbound Engine em produção, não no cadastro.
 */
const CAPS_DELIVERY_FULL = caps({ READ: "YES", WRITE: "YES", WEBHOOK: "YES", SYNC: "YES", IMPORT: "YES" });
const CAPS_PAYMENT_FULL = caps({ READ: "YES", WRITE: "YES", WEBHOOK: "YES", SYNC: "YES" });
const CAPS_PAYMENT_PARTIAL = caps({ READ: "YES", WRITE: "API_DEPENDENT", WEBHOOK: "YES", SYNC: "YES" });
/**
 * Catálogo de integrações da central de Conexões.
 *
 * Os provedores de IA são configurados exclusivamente no painel de
 * credenciais cifradas, não nesta galeria de conectores.
 *
 * Cada entrada declara `type` (papel na arquitetura) e `capabilities` (o que
 * sabe fazer). A UI e, no futuro, o Outbound Engine leem essas duas coisas
 * em vez de ter uma lista de exceções por nome de integração.
 *
 * WhatsApp, bot e PWA próprio são configurados no painel dedicado.
 * Os demais conectores permanecem `implemented: false` até existir
 * integração real com a API oficial; pré-configuração não ativa conexão.
 */
export const INTEGRATIONS_CATALOG: IntegrationDefinition[] = [
  {
    id: "ifood",
    slug: "ifood",
    domain: "ifood.com.br",
    name: "iFood",
    category: "DELIVERY",
    type: "OPERATIONAL",
    capabilities: CAPS_DELIVERY_FULL,
    description: "Recebe pedidos do iFood direto no painel de cozinha.",
    whatItEnables:
      "Sincroniza pedidos feitos no iFood com o Pipeline, atualiza o cardápio e o status de disponibilidade automaticamente.",
    configType: "oauth",
    simpleIconSlug: "ifood",
    fields: OAUTH_FIELDS,
    implemented: false,
    docsUrl: "https://developer.ifood.com.br/",
  },
  {
    id: "99food",
    slug: "99food",
    domain: "99app.com",
    name: "99Food",
    category: "DELIVERY",
    type: "OPERATIONAL",
    capabilities: CAPS_DELIVERY_FULL,
    description: "Integra pedidos do 99Food ao fluxo de cozinha do Pipeline.",
    whatItEnables: "Sincroniza pedidos e status de disponibilidade da loja no 99Food.",
    configType: "oauth",
    fallbackColor: "F9CB43",
    fields: OAUTH_FIELDS,
    implemented: false,
  },
  {
    id: "whatsapp",
    slug: "whatsapp",
    domain: "whatsapp.com",
    name: "WhatsApp",
    category: "COMMUNICATION",
    type: "OPERATIONAL",
    capabilities: caps({ READ: "YES", WRITE: "YES", WEBHOOK: "YES" }),
    description: "Atendimento e notificações automáticas via WhatsApp Business.",
    whatItEnables:
      "Recebe mensagens de clientes, envia confirmações de pedido e roteia conversas para o bot de atendimento configurado.",
    configType: "manual",
    simpleIconSlug: "whatsapp",
    fields: [
      { key: "phoneNumberId", label: "Phone Number ID (Meta)", type: "text", required: true },
      { key: "welcomeMessage", label: "Mensagem de boas-vindas", type: "textarea" },
      { key: "botWebhookUrl", label: "Webhook do bot de atendimento (opcional)", type: "url" },
    ],
    implemented: true,
    docsUrl: "https://developers.facebook.com/docs/whatsapp",
  },
  {
    id: "mercadopago",
    slug: "mercadopago",
    domain: "mercadopago.com.br",
    name: "Mercado Pago",
    category: "PAYMENTS",
    type: "OPERATIONAL",
    capabilities: CAPS_PAYMENT_FULL,
    description: "Recebe pagamentos via Mercado Pago (Pix, cartão, link).",
    whatItEnables: "Processa cobranças e concilia pagamentos feitos via Mercado Pago.",
    configType: "api_key",
    simpleIconSlug: "mercadopago",
    fields: API_KEY_FIELD,
    implemented: false,
    docsUrl: "https://www.mercadopago.com.br/developers",
  },
  {
    id: "stone",
    slug: "stone",
    domain: "stone.com.br",
    name: "Stone",
    category: "PAYMENTS",
    type: "OPERATIONAL",
    capabilities: CAPS_PAYMENT_PARTIAL,
    description: "Integra a maquininha e o gateway Stone.",
    whatItEnables: "Concilia vendas processadas na maquininha Stone com o caixa do Pipeline.",
    configType: "api_key",
    fallbackColor: "00A868",
    fields: API_KEY_FIELD,
    implemented: false,
  },
  {
    id: "cielo",
    slug: "cielo",
    domain: "cielo.com.br",
    name: "Cielo",
    category: "PAYMENTS",
    type: "OPERATIONAL",
    capabilities: CAPS_PAYMENT_PARTIAL,
    description: "Integra a maquininha e o gateway Cielo.",
    whatItEnables: "Concilia vendas processadas na maquininha Cielo com o caixa do Pipeline.",
    configType: "api_key",
    fallbackColor: "0033A0",
    fields: API_KEY_FIELD,
    implemented: false,
  },
  {
    id: "rede",
    slug: "rede",
    domain: "userede.com.br",
    name: "Rede",
    category: "PAYMENTS",
    type: "OPERATIONAL",
    capabilities: CAPS_PAYMENT_PARTIAL,
    description: "Integra a maquininha e o gateway Rede.",
    whatItEnables: "Concilia vendas processadas na maquininha Rede com o caixa do Pipeline.",
    configType: "api_key",
    fallbackColor: "EC7000",
    fields: API_KEY_FIELD,
    implemented: false,
  },
  {
    id: "pagbank",
    slug: "pagbank",
    domain: "pagbank.com.br",
    name: "PagBank",
    category: "PAYMENTS",
    type: "OPERATIONAL",
    capabilities: CAPS_PAYMENT_FULL,
    description: "Recebe pagamentos via PagBank (ex-PagSeguro).",
    whatItEnables: "Processa cobranças e concilia pagamentos feitos via PagBank.",
    configType: "api_key",
    simpleIconSlug: "pagseguro",
    fields: API_KEY_FIELD,
    implemented: false,
  },
  {
    id: "asaas",
    slug: "asaas",
    domain: "asaas.com",
    name: "Asaas",
    category: "PAYMENTS",
    type: "OPERATIONAL",
    capabilities: CAPS_PAYMENT_FULL,
    description: "Cobranças, boletos e Pix via Asaas.",
    whatItEnables: "Gera cobranças e acompanha o status de pagamento via Asaas.",
    configType: "api_key",
    fallbackColor: "00C4B4",
    fields: API_KEY_FIELD,
    implemented: false,
  },
  {
    id: "pix",
    slug: "pix",
    name: "Pix",
    category: "PAYMENTS",
    type: "OPERATIONAL",
    capabilities: CAPS_PAYMENT_FULL,
    description: "Recebe pagamentos instantâneos via Pix (chave própria ou PSP).",
    whatItEnables: "Gera cobranças Pix e confirma recebimento automaticamente.",
    configType: "manual",
    simpleIconSlug: "pix",
    fields: [{ key: "pixKey", label: "Chave Pix", type: "text", required: true }],
    implemented: false,
  },
  {
    id: "focusnfe",
    slug: "focusnfe",
    domain: "focusnfe.com.br",
    name: "Focus NFe",
    category: "FISCAL",
    type: "OPERATIONAL",
    capabilities: caps({ READ: "YES", WRITE: "YES", WEBHOOK: "YES" }),
    description: "API fiscal para NFC-e, NF-e e NFS-e; emissão, consulta e documentos fiscais.",
    whatItEnables: "Futuramente emitir NFC-e de vendas ao consumidor, NF-e de produtos e NFS-e de serviços, conforme habilitação fiscal e cobertura local.",
    configType: "api_key",
    fields: API_KEY_FIELD,
    implemented: false,
    docsUrl: "https://doc.focusnfe.com.br/reference/introducao",
  },
  {
    id: "nuvemfiscal",
    slug: "nuvemfiscal",
    domain: "nuvemfiscal.com.br",
    name: "Nuvem Fiscal",
    category: "FISCAL",
    type: "OPERATIONAL",
    capabilities: caps({ READ: "YES", WRITE: "YES", WEBHOOK: "YES" }),
    description: "API fiscal para NFC-e, NF-e e NFS-e; autorização, consulta, XML e cancelamento.",
    whatItEnables: "Futuramente emitir e consultar documentos fiscais pelo Pop9, com cadastro da empresa, certificado digital e credenciais.",
    configType: "oauth",
    fields: OAUTH_FIELDS,
    implemented: false,
    docsUrl: "https://dev.nuvemfiscal.com.br/docs/",
  },
];

export function getIntegrationDefinition(slug: string): IntegrationDefinition | undefined {
  return INTEGRATIONS_CATALOG.find((i) => i.slug === slug);
}
