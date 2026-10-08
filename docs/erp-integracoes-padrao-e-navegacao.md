# Pop9 ERP — Integrações operacionais e navegação

## Regra de produto
O ERP mantém somente conexões usadas diretamente em cardápio, pedidos, cozinha, caixa, documentos fiscais e notificações operacionais. O Pop9 Hub concentra marketing, campanhas, CRM omnichannel, e-commerce, automações genéricas, APIs públicas e importação/migração de sistemas legados.

A aba existente **Admin → Conexões** é a única central no ERP; não criar segunda galeria.

## Catálogo ERP — decisão de escopo
| Categoria | Provedores | Ação após conexão | Destino de uso |
| --- | --- | --- | --- |
| Delivery | iFood, 99Food, Rappi, Aiqfome | Mostrar conectada, status de sincronização e botão Ir para pedidos | Atendimento/Pedidos; pedidos aceitos seguem à Cozinha |
| Pagamentos | Mercado Pago, Stone, Cielo, Rede, PagBank, Asaas | Mostrar meios habilitados, teste e botão Ir para caixa | Fechamento de comanda e conciliação/relatórios |
| Fiscal | Focus NFe, Nuvem Fiscal | Mostrar empresa/ambiente fiscal configurado, botão Ir para fiscal | Emissão/consulta de documentos fiscais, quando implementada |
| IA operacional | OpenAI, Google Gemini, xAI/Grok, Anthropic/Claude | Mostrar credencial validada, modelos/capacidades disponíveis e botão Ir para cardápio | Gerador de imagens no cadastro de item; demais funções somente se implementadas |
| Comunicação operacional | WhatsApp Business | Mostrar número conectado, webhooks/eventos habilitados e botão Ir para notificações | Configurações de mensagens transacionais; não criar caixa de entrada social no ERP |
| Cardápio externo | Goomer | Mostrar origem/destino de sincronização, botão Ir para cardápio | Importar/sincronizar produtos conforme API efetivamente disponível |

Pix é **meio de pagamento**, não um provedor de API universal: configurar chave Pix estática separadamente; cobrança dinâmica/confirmada depende de PSP conectado.

## Fora do ERP / Pop9 Hub
Instagram DMs, Telegram, Shopify, WooCommerce, Mercado Livre, Shopee, webhooks genéricos, REST/GraphQL/HTTP, ElevenLabs e outros serviços de conteúdo/automação. Integrações de migração de PDV legado (Saipos, Consumer, Linx/Degust, Colibri, Everest, Sischef) pertencem ao fluxo de onboarding/migração, não à operação diária. Omie/Bling/Conta Azul podem ser reconsiderados quando houver caso operacional validado; não entram no conjunto inicial enxuto.

## Jornada de cada cartão
1. **Conexões** → filtrar categoria → selecionar provedor.
2. Modal explica finalidade, pré-requisitos, capacidades efetivamente implementadas, escopo da unidade e tipo de autenticação.
3. API key: campo de envio único ao backend, sem ecoar chave armazenada. OAuth: iniciar fluxo externo e retornar à mesma central. Manual: formulário próprio. Integrações dependentes de aprovação do parceiro exibem etapa pendente.
4. Botões **Salvar configuração**, **Testar conexão**, **Ativar** (apenas quando teste/autorização permitir), **Desativar**. Não confundir salvar com conectar.
5. Ao concluir, **permanecer na Central de Conexões**; cartão mostra status, unidade, última verificação e botão **Ir para a funcionalidade**.
6. Se a tela de destino ainda não existir, não criar rota quebrada: botão indisponível com texto “Módulo em desenvolvimento”. Não afirmar que conector está funcional sem provider real.

## Regras específicas
- Delivery: pedidos externos devem preservar id externo, idempotência, origem, status e unidade; não encaminhar pedidos à cozinha sem regra explícita de aceite.
- Pagamentos: evitar duplicidade de baixa e registrar identificador de transação; integração com maquininha não equivale automaticamente a TEF homologado.
- Fiscal: credenciais, certificado, ambiente homologação/produção e regras tributárias por empresa/unidade.
- IA: permitir selecionar provedor e modelo por capacidade; uma chave OpenAI não serve automaticamente para Gateway de terceiros.
- WhatsApp: limitar ERP a eventos transacionais; fluxos de campanha e atendimento omnichannel são do Hub.
- Cardápio: decidir sentido da sincronização, mapeamento de categorias/itens e resolução de conflitos antes de ativar.

## Segurança e isolamento
Todas as configurações e credenciais pertencem à unidade autorizada; nunca usar apenas `provider` como chave única entre tenants. Segredos criptografados em armazenamento privado, uso somente no servidor. Cada provider tem teste de conexão específico; conectores não implementados continuam indisponíveis.

## Estado real em 2026-10-08
A interface atual já mostra parte desses provedores, mas **somente WhatsApp possui provider registrado como implementado**, e mesmo assim a configuração usa secrets globais. A UI ainda passa `businessUnitId=null` e a persistência usa `provider` como chave única. Esta especificação **não significa que os conectores estão ativos**. A refatoração segura por unidade e a implementação das rotas de destino devem anteceder a habilitação de novos provedores.
