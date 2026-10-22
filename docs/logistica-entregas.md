# Logística de entregas — estrutura proposta

## 1. Diagnóstico do estado atual

O sistema já possui pedidos públicos pelo PWA, cadastro básico de cliente/WhatsApp, acompanhamento de status e fila operacional. Entretanto, o fluxo público atual está explicitamente configurado como **retirada** (`pickupOnly`), usa sessões com número negativo e zona `retirada`, e a tela interna trata pedidos PWA como pedidos prontos para retirada.

Não foram encontrados, no modelo atual, registros próprios para:

- endereço completo de entrega;
- entregador;
- despacho;
- rota e sequência de paradas;
- comprovante de entrega ou tentativa sem sucesso;
- fila de notificações de WhatsApp/PWA específica para logística.

A entrega deve ser adicionada como um fluxo novo, sem transformar pedidos de retirada em pedidos de entrega por inferência.

## 2. Princípio de separação

Adicionar ao pedido um campo explícito de atendimento:

- `pickup`: cliente retira na loja;
- `delivery`: loja entrega no endereço;
- futuramente `dine_in`: consumo na mesa, se necessário no modelo canônico.

A origem (`pwa`, `mesa`, `ifood`, `whatsapp`) continua sendo outra dimensão. Assim, um pedido pode ser `source = own-pwa` e `fulfillment_type = delivery` ou `pickup`.

Não usar `table_number < 0` como identificação de entrega. A regra de número negativo e zona `retirada` permanece reservada ao fluxo atual de retirada até a migração completa.

## 3. Interface operacional

### 3.1 Nova área: `Logística`

A navegação deve ter uma entrada única para a operação de entregas, com quatro visões:

1. **Fila de despacho**
   - pedidos prontos para sair;
   - pedidos aguardando montagem;
   - pedidos atrasados;
   - filtro por bairro, horário prometido, forma de pagamento e status.

2. **Mapa/Rota**
   - rotas abertas do dia;
   - pedidos sem rota;
   - sequência de paradas;
   - tempo estimado e distância, quando houver provedor de mapas configurado;
   - modo lista obrigatório como fallback, sem depender do mapa.

3. **Entregadores**
   - cadastro, disponibilidade e capacidade;
   - entregas em andamento;
   - histórico do dia;
   - ação rápida “assumir rota” e “liberar rota”.

4. **Histórico**
   - entregas concluídas, canceladas e sem sucesso;
   - tempo de preparo, espera, rota e total;
   - motivo de falha;
   - reenvio de notificação, sem recriar pedido.

### 3.2 Cartão de pedido

Cada cartão deve mostrar, sem abrir modal:

- número curto do pedido;
- cliente e telefone mascarado na lista;
- bairro/endereço resumido;
- itens e total;
- pagamento: `no estabelecimento`, `PIX pendente`, `pago` ou `falhou`;
- horário do pedido e promessa de entrega;
- status atual;
- entregador/rota, se atribuído;
- alerta visual para atraso;
- botão contextual da próxima transição.

Ações destrutivas ou de impacto operacional exigem confirmação: cancelar pedido, retirar pedido da rota, marcar como não entregue e reabrir entrega.

## 4. Cadastro de entregadores

O cadastro mínimo deve conter:

- nome completo;
- telefone;
- tipo: próprio, parceiro ou terceiro;
- veículo: bicicleta, moto, carro ou outro;
- placa opcional, sem exibir publicamente;
- capacidade máxima de pedidos/volume;
- regiões/bairros atendidos;
- ativo/inativo;
- observações operacionais.

Estados do entregador:

- `offline`: não disponível;
- `available`: disponível para receber rota;
- `assigned`: possui rota aberta;
- `delivering`: saiu para entrega;
- `paused`: temporariamente indisponível.

No MVP, o cadastro pertence à unidade. Não criar autenticação própria do entregador ainda; a equipe operacional pode atribuir e atualizar o despacho. Um app/portal do entregador pode ser uma fase posterior.

## 5. Estados do pedido e da entrega

### Pedido

Manter os estados existentes de cozinha e acrescentar o fluxo logístico somente quando `fulfillment_type = delivery`:

`pending → preparing → ready → assigned → out_for_delivery → delivered`

Transições alternativas:

- qualquer estado antes de `delivered` → `cancelled`, com motivo;
- `out_for_delivery` → `delivery_failed`, com motivo obrigatório;
- `delivery_failed` → `assigned` somente por ação explícita de replanejamento;
- `delivered` é terminal, salvo correção auditada.

`ready` significa pronto na cozinha. `assigned` significa atribuído a uma rota/entregador. Não usar `ready` como sinônimo de “saiu para entrega”.

### Evento de entrega

Registrar cada mudança em uma tabela de eventos, com:

- pedido;
- status anterior e novo;
- data/hora;
- responsável ou origem (`system`, `operator`, `courier`);
- observação/motivo;
- latitude/longitude somente se houver consentimento e necessidade operacional.

Isso evita depender apenas do valor atual do pedido para auditoria.

## 6. Criação e gestão de rota

### Criação manual no MVP

1. Operador abre “Nova rota”.
2. Seleciona unidade, janela de saída e entregador.
3. Seleciona pedidos `ready` ou `assigned` ainda sem rota.
4. O sistema valida compatibilidade de bairro, capacidade e status.
5. O sistema ordena inicialmente por bairro e horário prometido.
6. Operador pode arrastar para ajustar a sequência.
7. Operador confirma a rota.
8. Pedidos passam para `assigned` e recebem `route_id` e `stop_sequence`.
9. Ao iniciar, a rota passa para `in_progress` e os pedidos para `out_for_delivery`.

### Regras de consistência

- um pedido não pode estar em duas rotas abertas;
- uma rota não pode ser iniciada sem entregador;
- pedido cancelado não pode entrar na rota;
- pedido não pronto deve ficar em “pendência de cozinha”, não ser silenciosamente incluído;
- alterar a sequência após saída registra evento;
- reatribuir pedido exige motivo e histórico;
- fechamento da rota exige todos os pedidos concluídos ou motivos de falha.

### Automação futura

A otimização automática pode usar geocodificação e matriz de distância, mas não deve ser dependência da primeira versão. A primeira entrega deve funcionar com endereço textual, bairros e ordenação manual.

## 7. Modelo de dados sugerido

### `delivery_addresses`

Endereço normalizado do cliente por unidade: `id`, `business_unit_id`, `customer_id`/`session_client_id`, `label`, `recipient_name`, `phone`, `cep`, `street`, `number`, `complement`, `neighborhood`, `city`, `reference`, `latitude`, `longitude`, `validated_at`, `created_at`, `updated_at`.

O pedido deve guardar um snapshot do endereço usado na compra. Não depender apenas do cadastro atual do cliente, pois o endereço pode mudar depois.

### `couriers`

`id`, `business_unit_id`, `name`, `phone`, `vehicle_type`, `plate`, `capacity`, `status`, `service_areas`, `active`, `notes`, `created_at`, `updated_at`.

### `delivery_routes`

`id`, `business_unit_id`, `route_number`, `status`, `courier_id`, `planned_start_at`, `started_at`, `finished_at`, `notes`, `created_by`.

Estados: `draft`, `planned`, `in_progress`, `finished`, `cancelled`.

### `delivery_stops`

`id`, `route_id`, `order_id`, `sequence`, `status`, `promised_at`, `arrived_at`, `delivered_at`, `failure_reason`, `proof_type`, `proof_reference`, `notes`.

Índices e restrições importantes:

- unicidade de `order_id` em rotas não canceladas;
- unicidade de `(route_id, sequence)`;
- todas as tabelas com `business_unit_id` ou derivação segura pela rota/pedido;
- RLS por unidade;
- alterações de status via RPC/Edge Function, não por update aberto do cliente.

### `notification_outbox`

Fila idempotente para WhatsApp e PWA: `id`, `business_unit_id`, `order_id`, `channel`, `event_type`, `recipient`, `payload`, `status`, `attempts`, `next_attempt_at`, `sent_at`, `last_error`, `dedupe_key`.

A chave única `dedupe_key` impede que uma repetição de webhook ou realtime envie a mesma mensagem várias vezes.

## 8. Atualização para o cliente

### PWA

O status público deve mostrar uma linha do tempo segura:

1. Pedido recebido;
2. Em preparo;
3. Pronto;
4. Saiu para entrega;
5. Entregue.

O token atual do pedido continua sendo usado. O cliente nunca recebe dados do entregador além do mínimo necessário, por exemplo “saiu para entrega”. Endereço, telefone e dados internos não devem aparecer no payload público.

Para retirada, manter o texto e o fluxo atuais: “pronto para retirada” e número de retirada.

### WhatsApp

Mensagens transacionais sugeridas:

- confirmação do pedido;
- pedido em preparo;
- pedido pronto;
- pedido saiu para entrega;
- tentativa sem sucesso, com orientação de contato;
- pedido entregue.

Cada mensagem deve ser gerada por evento de domínio e passar pela outbox. Se o WhatsApp estiver indisponível, o pedido continua operando e a notificação fica pendente/repetível.

Não enviar localização contínua do entregador no MVP. Se for necessário no futuro, usar link temporário e consentimento explícito.

## 9. Endereço no PWA

O checkout deve perguntar o tipo de atendimento antes de confirmar:

- Retirar na loja;
- Entregar no endereço.

Se escolher entrega, exigir nome do destinatário, telefone, CEP, rua, número, bairro e cidade. Complemento e referência são opcionais. O servidor deve validar:

- campos obrigatórios e limites de tamanho;
- unidade do pedido;
- disponibilidade de entrega da unidade;
- área atendida e taxa;
- valor mínimo, se aplicável;
- preço e taxa recalculados no servidor;
- método de pagamento permitido para delivery.

O pedido deve ser criado com `fulfillment_type = delivery` somente após a validação server-side.

## 10. Roadmap de implementação

### Fase 1 — contrato e segurança

- adicionar `fulfillment_type` e snapshot de endereço ao pedido;
- criar RPC server-side para transições de entrega;
- adicionar eventos de status;
- preservar retirada como comportamento atual;
- testes de isolamento por unidade, duplicidade e transições inválidas.

### Fase 2 — operação interna

- tela `Logística` com fila de despacho;
- cadastro de entregadores;
- criação manual de rota;
- atribuição e sequência de paradas;
- filtros e histórico;
- testes de interface para estados vazio, carregando e erro.

### Fase 3 — experiência do cliente

- seleção delivery/pickup no PWA;
- cadastro e snapshot de endereço;
- status público de entrega;
- outbox e mensagens WhatsApp;
- retry e observabilidade de falhas.

### Fase 4 — otimização

- integração de mapas/geocodificação;
- sugestão automática de sequência;
- área do entregador;
- comprovante de entrega;
- indicadores de SLA e custo por rota.

## 11. Critérios de aceite do MVP

- Um pedido de retirada continua funcionando sem tabelas ou rotas de entrega.
- Um pedido delivery não pode ser criado sem endereço válido.
- Um pedido não aparece como disponível para rota antes de estar pronto.
- Um pedido não pode ser atribuído a duas rotas abertas.
- O operador consegue criar, reordenar, iniciar e finalizar uma rota manualmente.
- O cliente vê no PWA somente o status permitido para seu pedido.
- Cada transição gera um evento auditável.
- O WhatsApp não duplica notificações após retry.
- Falha de WhatsApp não bloqueia cozinha, despacho ou entrega.
- Dados de uma unidade não aparecem na logística de outra unidade.
- Rotas funcionam em lista mesmo sem provedor de mapas.

## 12. Decisão recomendada agora

Implementar primeiro o contrato de dados e a fila operacional manual. Não iniciar ainda otimização de rotas, rastreamento em tempo real ou aplicativo separado para entregadores. A prioridade é fazer o caminho **PWA → cozinha → fila de despacho → rota → entrega → status do cliente → WhatsApp** funcionar com auditoria, idempotência e fallback manual.
