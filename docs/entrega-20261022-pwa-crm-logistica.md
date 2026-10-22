# Entrega de 22/10/2026 — PWA, módulos públicos, CRM e logística

## Resumo executivo

Hoje foi consolidada a evolução do fluxo de pedidos próprios do Pop9. O PWA público recebeu uma interface visual inspirada na referência da Confit Burguer, passou a exibir variantes e adicionais vindos do cardápio, e o servidor passou a validar essas opções e recalcular os preços antes de criar o pedido. Também foi implementado o acompanhamento de status do pedido pelo cliente usando o hash do link pessoal, mantendo a separação entre `autoatendimento_qr` e `pwa_publica`.

Em paralelo, foi estruturada a próxima frente de logística: delivery separado de retirada, endereços, entregadores, despacho, rotas, eventos, atualização pública e notificações WhatsApp. A estratégia de CRM do PWA também foi definida, incluindo preço próprio do canal, coleta progressiva de dados e consentimentos separados para atendimento, histórico e marketing.

O trabalho desta entrega permanece local até a conclusão dos gates e do fluxo de Pull Request. Nenhum pedido real, pagamento, SMS, migration remota ou deployment de produção foi executado.

## Escopo trabalhado

### PWA público

O PWA agora mantém uma experiência de cardápio com:

- hero de marca e navegação por seções;
- cards responsivos em duas colunas no desktop;
- imagens, nome, preço, descrição e ação de adicionar;
- combos prontos com economia exibida;
- sacola fixa no fluxo da página;
- dados institucionais da unidade e redes sociais quando configurados;
- mensagem explícita de retirada e pagamento no estabelecimento;
- restauração local da confirmação após atualizar a página.

A referência visual foi usada como inspiração de hierarquia, cards, categorias e fluxo, sem copiar conteúdo ou imagens do site externo.

### Contrato server-side

A migration `20261022140000_pwa_public_options_contract.sql` introduz o contrato que faltava para escolhas do cardápio:

- `variant_id` e `variant_name` no snapshot de `order_items`;
- resolução de linhas por `ops_private.resolve_pwa_order_lines`;
- validação de unidade, item publicado, quantidade e duplicidade;
- validação de variante pertencente ao item;
- validação de adicional pertencente ao item;
- validação de ingrediente removível;
- recálculo do preço no banco;
- persistência de observação e `ingredient_mods`;
- rejeição de preço adulterado enviado pelo navegador;
- isolamento de combos prontos e rejeição de combos com escolha livre no contrato atual.

A função é restrita a `service_role`. O cliente não recebe autorização para executar o resolver diretamente.

### Sincronização de status

A migration `20261022120000_pwa_order_status_sync.sql` adiciona `get_pwa_order_status`. A consulta exige unidade e hash do token pessoal associado ao pedido. O PWA faz polling de dez segundos enquanto o pedido não estiver entregue ou cancelado e salva a confirmação em `sessionStorage` para suportar recarregamento da página.

Os dados públicos retornados são limitados ao pedido, status, total, número de retirada, horários operacionais e itens necessários para o acompanhamento. Não são expostos dados administrativos ou credenciais.

### Isolamento dos módulos

A matriz de isolamento cobre que:

- o módulo `autoatendimento_qr` atende mesas e sessões de mesa;
- o módulo `pwa_publica` atende o fluxo público de retirada;
- módulo desativado bloqueia a operação correspondente;
- o acesso de uma unidade não alcança itens, pedidos ou integrações de outra unidade;
- o PWA não deve ser tratado como rota de QR Code de mesa.

## Correção de testes

O teste `src/test/pwaReadyCombos.test.ts` passou a carregar as migrations de módulos, status e contrato público. O fixture agora cria:

- ingredientes com adicional;
- ingrediente não removível;
- ingrediente removível separado;
- variante do item;
- período operacional;
- configuração da unidade para PWA.

O caso positivo usa Cebola como ingrediente removível e mantém Alface como caso negativo. Isso evita que o mesmo ingrediente seja usado simultaneamente para validar remoção permitida e remoção proibida.

O teste `src/test/cashierClosure.test.ts` também carrega o contrato canônico de status de pagamentos, preservando os cenários de fechamento, saldo, pagamentos confirmados, pendentes e estornados.

## CRM e campanhas automatizadas

O PWA deve coletar dados de forma progressiva e proporcional.

Dados necessários para o pedido:

- nome;
- telefone/WhatsApp;
- tipo de atendimento;
- endereço, quando delivery;
- dados mínimos do pagamento, quando aplicável.

Dados opcionais para CRM:

- e-mail;
- bairro e cidade;
- preferências de produtos;
- horário preferido;
- aniversário, se informado voluntariamente;
- origem e campanha;
- histórico de pedidos e frequência calculados pelo sistema.

O preço próprio do PWA deve ser tratado como campanha comercial explícita e recalculado no servidor. Ele não deve depender da aceitação de marketing. Os consentimentos devem ser separados para atendimento, salvar perfil e ofertas por WhatsApp/e-mail.

A arquitetura recomendada para campanhas é:

```text
pedido PWA → atualização CRM → avaliação de segmento → validação de consentimento
→ limite de frequência → outbox idempotente → WhatsApp → evento de conversão
```

Segmentos iniciais:

- primeiro pedido;
- clientes recorrentes;
- segunda compra pendente;
- inativos há 30 dias;
- clientes por bairro;
- compradores por categoria;
- usuários do canal próprio;
- clientes que aceitaram marketing.

Mensagens de pedido e mensagens de marketing devem permanecer separadas. A indisponibilidade do WhatsApp não pode bloquear a criação, preparo ou entrega do pedido.

## Logística e delivery — desenho aprovado para a próxima fase

O fluxo atual do PWA é somente retirada. Delivery deve ser introduzido com `fulfillment_type`, sem reutilizar `table_number < 0` como identificador de entrega.

O fluxo operacional esperado é:

```text
PWA → cozinha → pronto → despacho → rota → saiu para entrega → entregue
```

Entidades recomendadas:

- `delivery_addresses`, com endereço normalizado e snapshot no pedido;
- `couriers`, com disponibilidade, veículo e capacidade;
- `delivery_routes`, com ciclo de vida e entregador;
- `delivery_stops`, com sequência, promessa e resultado;
- eventos de transição de entrega;
- `notification_outbox`, com deduplicação e retry.

A interface deve ter fila de despacho, rotas, entregadores, histórico e CRM. A primeira versão deve criar rotas manualmente por bairro e horário, com modo lista mesmo sem mapa.

Estados principais:

```text
pending → preparing → ready → assigned → out_for_delivery → delivered
```

Falha de entrega exige motivo. Pedido não pronto não deve entrar em rota iniciada. Um pedido não pode estar em duas rotas abertas. Toda transição deve ser validada no servidor e gerar evento auditável.

A especificação completa está em [`docs/logistica-entregas.md`](./logistica-entregas.md).

## Modificações essenciais pendentes

### P0 — validar a migration final em banco limpo

Criar um fixture que aplique todas as migrations do PWA em ordem real, incluindo a migration de módulos, status e contrato de opções. O teste deve criar pedido simples, pedido com combo, pedido com variante/adicional e rejeitar carrinho adulterado.

Critério de aceite: nenhum RPC chamado pela migration final pode estar ausente ou incompatível após o banco ser criado do zero.

### P0 — revisar e aplicar o contrato de pagamento PWA

O fluxo atual ainda registra pagamento no estabelecimento como regra de interface, mas não possui a tabela específica proposta para pagamentos vinculados ao pedido público. Antes de PIX ou pagamento online, implementar o contrato de `order_payments`, estados `pending/confirmed/failed/refunded`, método `pay_at_store` e idempotência por pedido.

Não integrar provedor financeiro nem enviar cobrança sem decisão de produto, credenciais e testes de webhook.

### P1 — habilitar variantes e adicionais na interface

O servidor já valida e persiste variantes/adicionais, mas a tela pública atual ainda envia principalmente item e quantidade. Implementar expansão do card para escolha de variante, adicional, remoção permitida e observação, mantendo o preço exibido como cotação e o preço final como autoridade do servidor.

### P1 — corrigir classificação de erros da Edge Function

Diferenciar payload inválido, conflito de operação, indisponibilidade da unidade e falha inesperada de banco. Adicionar correlation id sem dados pessoais aos logs seguros e evitar converter indiscriminadamente toda falha em HTTP 400.

### P1 — separar desligamento de novos pedidos do acompanhamento

Quando a loja parar de aceitar novos pedidos, decidir e testar se tokens já vinculados continuam consultando o status. A recomendação operacional é bloquear `menu/submit` para novos pedidos e manter `status` para pedidos existentes até retirada, entrega ou cancelamento.

### P2 — iniciar o módulo logístico

Implementar primeiro o contrato de dados, a máquina de estados e a fila manual. Depois adicionar cadastro de entregadores, rotas, notificações e endereço delivery no PWA.

## Gates de validação

Executar no branch antes do merge:

```bash
npx tsc --noEmit -p tsconfig.app.json
npm run lint
npm run test
npm run build
```

O lint deve ser acompanhado de warnings existentes e novos warnings devem ser justificados. O teste crítico deve incluir PWA, isolamento, status, CRM/WhatsApp e fechamento de caixa.

### Resultado desta execução

- TypeScript: aprovado com `npx tsc --noEmit -p tsconfig.app.json`.
- Lint: aprovado sem erros e com 14 warnings já existentes, incluindo warnings de Fast Refresh e dependências de hooks.
- Build: aprovado com `npm run build`; o Vite registrou apenas avisos de chunks grandes, imports dinâmicos e base de Browserslist desatualizada.
- Testes direcionados PWA/caixa: aprovados, 20 testes.
- Suíte completa: 531 testes aprovados e 4 falhos em 2 arquivos fora do escopo desta entrega: `PrintersTab.test.tsx` falha porque o mock não fornece `supabase.auth.onAuthStateChange`; `printerLayoutMigration.test.ts` excede o timeout de 5 segundos. Essas falhas devem ser corrigidas em uma PR própria ou antes de habilitar um gate obrigatório de CI.

O commit desta entrega não deve ocultar ou marcar a suíte completa como aprovada. A PR precisa exibir o resultado de 531/535 testes e apontar explicitamente as quatro falhas preexistentes.

## Critérios de aceite da entrega

- O PWA carrega itens, combos e marca da unidade correta.
- A interface não mistura módulos de mesa e PWA público.
- O preço enviado pelo navegador não é autoridade.
- Variante, adicional, remoção e observação são validados no servidor.
- Ingrediente não removível é rejeitado.
- O pedido pode ser consultado pelo token hash após a criação.
- O status é atualizado sem expor dados internos.
- Retry do mesmo token não cria pedido duplicado.
- O fixture de banco cobre a migration final.
- A retirada atual continua funcionando.
- Nenhum pagamento real ou mensagem real é executado nos testes.
- O escopo de delivery permanece documentado e separado até a implementação.

## Registro de publicação

Esta documentação é parte da entrega de 22/10/2026 e deve acompanhar o Pull Request. O merge só deve ocorrer após os gates locais passarem e o diff final ser revisado. Deploy de migrations e Edge Functions em ambiente remoto deve ser tratado como passo separado, com backup, staging e smoke test controlado.
