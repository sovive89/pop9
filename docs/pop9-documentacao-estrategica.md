# POP9 — Documentação Estratégica e Arquitetural
*Consolidação das decisões e ideias discutidas em 03/09/2026*

## 1. Visão do Produto
### 1.1 Tese central
O Pop9 deve ser construído como uma infraestrutura operacional para restaurantes, e não apenas como mais um ERP/POS. A proposta é conectar canais e sistemas externos, receber seus dados, normalizá-los para um modelo canônico interno e orquestrar a operação por meio de eventos.

### 1.2 Posicionamento
Posicionamento recomendado: "Pop9 — a infraestrutura operacional do restaurante." O diferencial não está em possuir isoladamente KDS, estoque, ficha técnica, CRM ou integrações — funcionalidades desse tipo já existem no mercado. O diferencial pretendido é a camada unificada de dados, eventos e execução que fica por baixo dessas funcionalidades.

### 1.3 Princípio de produto
O restaurante pode trocar, adicionar ou remover canais de venda e sistemas externos sem precisar reconstruir o núcleo operacional. Independentemente de o pedido nascer no cardápio próprio, iFood, 99Food, Rappi, WhatsApp, Instagram, PDV, garçom ou API, o objetivo é convertê-lo para o mesmo modelo de Pedido Pop9.

## 2. Arquitetura Conceitual
### 2.1 Fluxo principal
EXTERNO → CONNECTOR → DATA HUB → RAW DATA → NORMALIZAÇÃO → VALIDAÇÃO → DEDUPLICAÇÃO → MODELO CANÔNICO POP9 → EVENTOS → CORE OPERACIONAL.

Para saídas: CORE → EVENTO → OUTBOUND ENGINE → CONNECTOR → SISTEMA EXTERNO.

### 2.2 Responsabilidades
Connector: conhece a API, autenticação, payload e particularidades do sistema externo.
Data Hub: recebe, registra, audita, exibe, processa, permite reprocessamento e acompanha erros.
Normalizer: transforma dados externos no modelo canônico Pop9.
Core: executa regras de negócio.
Event Engine: distribui eventos operacionais de forma desacoplada.
Routing Engine: decide para quais estações/dispositivos cada parte do pedido deve ir.
AI: auxilia exceções, mapeamentos e revisão; não deve alterar silenciosamente dados críticos.

### 2.3 Modelo canônico
Entidades centrais sugeridas: Unit, Restaurant/Tenant, User/Employee, Menu, Category, Product, Modifier, Customer, Order, OrderItem, Payment, StockItem, Recipe/Ficha Técnica, Production, Table, Delivery, Cash Register, Transaction, Device, Station, Integration, IntegrationCredential, Event e DataHubRecord.

Evitar tabelas acopladas ao fornecedor, como ifood_orders, saipos_orders ou colibri_orders. Usar entidades comuns e registrar source/provider + externalId.

## 3. Integrações
### 3.1 Classes
A) Operacionais/bidirecionais: iFood, 99Food, Rappi, WhatsApp, Instagram e provedores de pagamento.
B) Importação/migração: Saipos, Colibri, Everest, Consumer, Linx/Degust, Sischef e outros sistemas legados/concorrentes.
C) Técnicas: REST API, Webhooks, GraphQL e mecanismos auxiliares.

### 3.2 Capacidades por integração
Cada connector deve declarar capabilities, por exemplo: READ, WRITE, WEBHOOK, IMPORT, SYNC. Isso evita assumir que toda integração tem as mesmas capacidades.

### 3.3 Credenciais por cliente
Credenciais específicas do restaurante não devem ser colocadas no código nem exigir redeploy. O cliente entra em Pop9 → Conexões → escolhe a integração → conecta. OAuth deve armazenar tokens de forma segura; credenciais manuais devem ser criptografadas no backend/banco ou secret store apropriado. A interface nunca deve expor segredos completos depois de salvos.

## 4. Data Hub e Normalização
### 4.1 Objetivo
O Data Hub será um módulo separado do Core. Ele funciona como camada de ingestão, observabilidade, auditoria e reprocessamento. Deve preservar o payload bruto recebido para diagnóstico e reprocessamento.

### 4.2 Pipeline de processamento
RECEIVED → PROCESSING → NORMALIZED → PROCESSED, com estados auxiliares WARNING, ERROR e PENDING_REVIEW.

### 4.3 Interface
Dashboard por integração com logo, nome, status, último sync, contagens de recebidos/normalizados/erros/pendentes e eventos recentes. Ao abrir um evento: JSON bruto → transformação/mapeamento → objeto normalizado → validação → resultado → possibilidade de reprocessar.

### 4.4 Determinismo e IA
A normalização deve ser determinística primeiro: schema, mapping, validação, transformação e deduplicação. IA deve atuar como assistente para exceções, sugerindo mapeamentos, correções e possíveis duplicidades. Alterações críticas devem exigir regra explícita ou revisão.

### 4.5 Deduplicação
Para eventos: usar combinação de provider/source + externalId e mecanismos de idempotência. Para clientes: usar resolução de identidade e candidatos a possível duplicidade. Casos ambíguos devem ser revisáveis, não simplesmente apagados.

## 5. Cardápio
### 5.1 Estrutura
Menu → Categories → Products. O Montador de Cardápio define o que o restaurante vende e como aparece ao cliente. A Ficha Técnica define como o item é produzido; Estoque registra disponibilidade e consumo.

### 5.2 Produto
Campos conceituais: nome, descrição, imagem, preço, categoria, SKU, disponibilidade, status, informações de venda e configuração de composição/modificadores.

### 5.3 Modificadores
Suportar operações ADD, REMOVE, REPLACE, OPTION e quantidade. Exemplos: adicionar bacon, extra queijo, retirar cebola, escolher opção de carne. Modificadores alteram a composição do pedido sem transformar a receita-base em outra coisa.

### 5.4 Tema visual
Brand Theme deve pertencer ao restaurante/unidade, não ser duplicado em cada produto. Configurações: logo, cores, tipografia, estilo dos cards, botões, categorias, banners e fundo. O fundo pode ser cor sólida, gradiente, imagem, textura/padrão e, opcionalmente, vídeo curto. Deve existir preview em tempo real.

## 6. Ficha Técnica e Estoque
### 6.1 Conceito
Ficha Técnica é a ligação entre venda, produção e consumo. Não se limita ao prato final: qualquer item produzido/preparado pode ter receita própria, permitindo receitas compostas e aninhadas.

### 6.2 Tipos conceituais
INSUMO: matéria-prima comprada.
COMPRADO_PRONTO: item adquirido pronto para venda/uso.
PRODUZIDO: item preparado internamente e normalmente associado a uma receita.
PRODUTO_DE_VENDA: item comercializado no cardápio.

### 6.3 Exemplo
X-Burger → 1 Hambúrguer + 1 Pão + 2 Queijos + 30 g de Molho.
Hambúrguer → 180 g de carne + 3 g de sal + temperos.
Molho Especial → maionese + mostarda + ketchup + temperos.

### 6.4 Rendimento e explosão
Toda receita produzida deve informar rendimento, por exemplo 1 unidade, 1 kg, 5 L ou 20 porções. Na venda, o sistema deve expandir recursivamente receitas compostas até chegar aos insumos e calcular o consumo real.

### 6.5 Remoções e quantidade
Se o pedido tiver 3 unidades de um produto, o consumo da ficha e dos modificadores normalmente é multiplicado por 3. Se um ingrediente opcional for removido, o consumo final deve refletir a remoção, sem criar um lançamento artificial de "devolução" de estoque.

## 7. Pedidos, KDS, Impressão e Eventos
### 7.1 Regra de ouro
Nenhuma integração externa deve disparar diretamente KDS ou impressora. Tudo deve passar pelo Order Core e pelo Event Engine.

### 7.2 Fluxo
Fonte → Data Hub (quando externa) → Order Core → Event Engine → Order Routing Engine → KDS/Impressoras/Estoque/Caixa.

### 7.3 Eventos
Exemplos: OrderCreated, OrderConfirmed, OrderPaid, OrderInPreparation, OrderReady, OrderDispatched, OrderDelivered, OrderCancelled, OrderItemAdded, OrderItemRemoved, OrderItemModified, PaymentConfirmed e KitchenTicketCreated.

### 7.4 Routing
Um único pedido pode ser dividido por estação: hambúrguer para cozinha, bebida para bar, pagamento para caixa. KDS e impressoras são dispositivos diferentes, mas ambos consomem eventos operacionais.

### 7.5 Idempotência
Eventos duplicados não podem gerar impressão duplicada, baixa dupla de estoque ou processamento repetido. O sistema precisa de chaves de idempotência e controle de processamento.

## 8. Timers e SLA
### 8.1 Arquitetura
Criar um Timer & SLA Engine separado do KDS, conectado ao Event Engine. O timer deve ser baseado em transições de estado e timestamps do servidor, não em um contador puramente client-side.

### 8.2 Dados
Order: createdAt, acceptedAt, preparationStartedAt, readyAt, completedAt.
OrderTimer: type, startedAt, pausedAt, stoppedAt, targetSeconds, status.

### 8.3 Estados
normal, attention e delayed. O limite pode ser configurado por produto, pedido, estação ou unidade. Exemplo: warning em 70% do SLA e atraso em 100%.

### 8.4 Uso analítico
Os timers também devem alimentar relatórios para identificar gargalos de cozinha, bar, expedição e entrega.

## 9. Loja Virtual de Simulação
### 9.1 Objetivo
Criar um restaurante fictício totalmente operacional antes do primeiro cliente real. O objetivo não é uma demo fake, mas um ambiente de homologação que use a mesma arquitetura destinada aos clientes reais.

### 9.2 Restaurante demonstrativo
Exemplo: Pop9 Burger. Cardápio inicial: X-Burger, X-Bacon, X-Salada, Batata e Coca-Cola, com adicionais e remoções.

### 9.3 Fluxo demonstrável
Cliente → cardápio → produto → adicionais/remoções → carrinho → nome/telefone → checkout → Order Core → Event Engine → KDS → timer → ficha técnica → estoque → CRM → Data Hub.

### 9.4 Conectores Mock
Criar conectores simulados para iFood, 99Food, Rappi, WhatsApp, Instagram e importações. Eles devem gerar eventos com formato semelhante ao real e atravessar o mesmo pipeline. Depois, o connector mock pode ser substituído pelo connector real sem alterar o Core.

### 9.5 Simulações úteis
Pedido novo, cancelamento, alteração, cliente duplicado, erro de integração, webhook, atraso, reprocessamento, pagamento aprovado/recusado e estoque insuficiente.

### 9.6 Custos de APIs
A simulação não exige pagar as APIs externas. Custos e requisitos entram quando integrações reais forem conectadas em produção. O projeto deve ser desenvolvido primeiro com mocks/sandbox quando possível.

## 10. Primeiro Cliente Real
### 10.1 Perfil ideal
Restaurante independente ou pequeno grupo de 1–3 unidades, com volume suficiente para gerar problemas reais, delivery + salão, operação de cozinha com múltiplas estações, canais digitais e dono/gestor acessível.

### 10.2 Vertical inicial
Hamburgueria ou pizzaria híbrida é um laboratório especialmente bom porque combina salão/delivery, adicionais, remoções, ficha técnica, produção, estoque, KDS e integração de canais.

### 10.3 Abordagem
Não começar vendendo. O primeiro objetivo é conseguir acesso ao responsável pela operação e realizar um diagnóstico de 10–30 minutos.

### 10.4 Perguntas
Qual sistema usam hoje? Trabalham com iFood? O pedido entra automaticamente ou alguém digita? Como chega na cozinha? Como controlam estoque e ficha técnica? Qual parte do sistema mais causa dor de cabeça?

### 10.5 Proposta de piloto
Oferecer um piloto de 60–90 dias, com acompanhamento direto, preço simbólico ou gratuito e foco em medir resultados. O primeiro cliente deve funcionar como parceiro de desenvolvimento e fonte de um case real, mediante autorização.

### 10.6 Métricas
Buscar medir antes/depois: erros de pedido, tempo entre pedido e produção, desperdício, controle de estoque, margem/CMV, velocidade da cozinha e outros indicadores relevantes.

## 11. Estratégia Comercial
### 11.1 Posicionamento
Evitar vender inicialmente "um ERP com muitas funções". Vender a resolução da fragmentação operacional: pedidos chegam certos, a cozinha recebe o que precisa, o estoque acompanha a venda e a gestão enxerga a operação.

### 11.2 Data Hub como porta de entrada
A migração/importação pode ser posicionada comercialmente como "Migração Inteligente". Isso permite abordar restaurantes que usam concorrentes sem exigir troca completa imediata.

### 11.3 Pricing discutido
Referência anteriormente considerada para planos:
Start: aproximadamente R$ 99–149/mês.
Pro: aproximadamente R$ 199–299/mês.
Hub/Redes: valores progressivos conforme número de unidades.
Referência para Hub Max com 5 unidades: R$ 1.490/mês, equivalente a R$ 298 por unidade/mês. Faixa indicativa discutida: R$ 1.290–1.790/mês.

## 12. Roadmap Imediato
### Fase 1 — Laboratório
Cardápio + identidade visual + carrinho + checkout + Order Core.

### Fase 2 — Operação
KDS + timers + routing + impressão simulada.

### Fase 3 — Produção
Ficha técnica + receitas compostas + explosão de consumo + estoque.

### Fase 4 — Dados
Data Hub + raw payload + normalização + validação + deduplicação + reprocessamento.

### Fase 5 — Conectores
Mocks de iFood/99Food/Rappi/WhatsApp/Instagram/importações.

### Fase 6 — Demonstração
Ambiente Pop9 Burger funcional, pronto para ser demonstrado em celular/computador.

### Fase 7 — Primeiro piloto
Selecionar restaurante real, diagnosticar operação, implantar piloto e medir resultados.

### Fase 8 — Produção
Substituir gradualmente mocks por integrações reais e transformar o laboratório em base de homologação do produto.

## 13. Princípios Técnicos que Não Devem Ser Violados
### 13.1 Desacoplamento
Integrações externas não devem conhecer detalhes internos do KDS, estoque ou caixa.

### 13.2 Canonical Model
O Core deve operar sobre entidades Pop9, não sobre formatos de fornecedores.

### 13.3 Auditabilidade
Dados externos relevantes devem conservar payload bruto, timestamps, origem, externalId, resultado de processamento e histórico de reprocessamento.

### 13.4 Idempotência
A repetição de um evento não pode duplicar efeitos operacionais.

### 13.5 Segurança
Credenciais por tenant são segregadas e protegidas; segredos não ficam no frontend nem no repositório.

### 13.6 Determinismo
Dados críticos devem seguir regras explícitas. IA é auxiliar, não autoridade silenciosa.

### 13.7 Reutilização
O restaurante fictício deve usar a mesma base arquitetural do restaurante real, para que o trabalho de laboratório seja reaproveitado.

## 14. Resultado Esperado
### 14.1 Produto
Ao final do primeiro ciclo, o Pop9 deve conseguir demonstrar uma operação ponta a ponta: receber um pedido, normalizá-lo quando necessário, transformá-lo em Order Pop9, distribuir para estações, controlar tempo, calcular consumo de ficha técnica, atualizar estoque e registrar eventos.

### 14.2 Comercial
O objetivo é chegar ao primeiro restaurante com uma demonstração funcional e um piloto mensurável, em vez de apenas uma apresentação conceitual.

### 14.3 Tese estratégica
O ativo principal do Pop9 não será uma lista de funcionalidades. Será a camada que conecta canais, transforma dados em um modelo operacional único e orquestra a execução do restaurante.
