# Como os pedidos de iFood e 99Food chegam (pesquisa 13/10/2026)

Objetivo: preparar a fila de impressão e o modelo de pedidos para receber pedidos dessas plataformas.
Nada aqui está implementado como conector ainda; ambos exigem cadastro de desenvolvedor e credenciais da loja.

## iFood — Merchant API
Fonte principal: documentação oficial em developer.ifood.com.br (não acessível desta sessão; itens a confirmar marcados).
- **Autenticação:** OAuth2 (client credentials para app centralizado; código de autorização para app distribuído).
- **Recebimento:** *polling* de eventos (`GET /order/v1.0/events:polling`, a cada ~30 s) com **acknowledgment** obrigatório
  (`POST /order/v1.0/events/acknowledgment`); evento sem ack volta no próximo polling. Há também opção de webhook (confirmar).
- **Eventos principais:** `PLC` (PLACED, novo pedido), `CFM` (confirmado), `RTP` (pronto para retirada), `DSP` (despachado),
  `CON` (concluído), `CAN` (cancelado), além de solicitações de cancelamento.
- **Detalhe do pedido:** `GET /order/v1.0/orders/{id}` → `id`, `displayId`, `orderType` (DELIVERY/TAKEOUT/DINE_IN),
  `orderTiming` (IMMEDIATE/SCHEDULED), `customer` (nome, telefone mascarado), `items[]` (nome, `externalCode`, quantidade,
  preço, `observations`, `options[]`), `total`, `payments`, `delivery`.
- **Ações:** `confirm`, `startPreparation`, `readyToPickup`, `dispatch`, `requestCancellation`. O pedido precisa ser
  confirmado dentro do prazo da plataforma, senão é cancelado (confirmar prazo na doc oficial).

## 99Food
- **Recebimento:** **webhook** com protocolo próprio da 99 (o padrão Open Delivery da 99 é só polling).
- **Eventos:** `orderNew`, `orderCancel`, `orderFinish`; resposta esperada `{"errno":0}`.
- **Assinatura:** cabeçalho `didi-header-sign` = MD5(corpo bruto + `app_secret`). Rejeitar sem assinatura válida.
- **Atenção:** IDs de 64 bits devem ser lidos como texto (o `JSON.parse` comum arredonda).
- `orderFinish` pode chegar antes de `orderNew`: guardar e aplicar quando o pedido chegar.
- Aprovação do app pela 99 pode levar alguns dias úteis.

## Como isso entra no Pop9 (ordem do CLAUDE.md: connector → normalizador → núcleo)
1. **Connector** (edge function por plataforma): autentica, recebe/consulta eventos, faz ack/valida assinatura, deduplica pelo id do evento.
2. **Normalizador:** converte para o modelo Pop9 — `orders.source = 'ifood' | '99food'`, `orders.external_id = id do pedido na plataforma`
   (nunca usado como FK), itens em `order_items` com `destination` vindo do item do cardápio casado por `externalCode`/SKU;
   opções viram `ingredient_mods` (adicionais) e observações vão para `observation`.
3. **Núcleo:** ao gravar os itens, o gatilho `enqueue_print_job` cria a comanda na fila (já pronto neste PR) e a Estação imprime
   com o rótulo do canal (ex.: “iFood #A1B2C3”).

## Pendências antes do conector
- **Pedido sem mesa:** hoje `orders` está ligado a `sessions`/`session_clients` (trigger `lock_open_checkout_session`).
  Pedido de delivery não tem mesa: decidir no passo 3 (banco canônico) se `session_id` fica opcional para `source` externo.
- Guardar o `displayId` da plataforma (o número que o entregador e o cliente veem) para imprimir na comanda.
- Casamento de itens: `menu_items.sku`/`external_id` com o `externalCode` cadastrado na plataforma.
- Credenciais: app iFood (homologação) e app 99Food (`app_id`/`app_secret`) da loja.
