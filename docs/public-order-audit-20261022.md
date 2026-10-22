# Pop9 — auditoria da Edge Function `public-order`

**Data:** 2026-10-22  
**Deployment:** não alterado nesta auditoria  
**Repositório:** `sovive89/pop9`  
**Branch/commit auditado:** `fix/pwa-order-status-sync` / `38a3d85` (`origin/main`)

## Resumo executivo

A Edge Function `public-order` possui boas barreiras iniciais: valida UUID da unidade, usa service role somente no servidor, verifica integração `own-pwa`, respeita o módulo `pwa_publica`, exige token pessoal para envio/status e limita os dados públicos ao cardápio. A suíte existente e a nova matriz de isolamento passaram: 38 testes. Entretanto, foi confirmado um bloqueador de produção na integração com o banco: a migration mais recente `20261022010000_unit_modules_qr_pwa.sql` substitui `submit_pwa_order` e chama `ops_private.resolve_pwa_order_lines`, mas nenhuma migration do repositório define essa função. Após aplicar a migration mais recente, o envio de um pedido tende a falhar em runtime. Os testes atuais não detectam o problema porque carregam a implementação anterior de `submit_pwa_order` e não aplicam a migration final de módulos.

## Escopo e método

Foram revisados:

- `supabase/functions/public-order/index.ts`;
- migrations de `submit_pwa_order`, `list_pwa_ready_combos`, `get_pwa_order_status` e `order_access`;
- tabelas/gatilhos de `orders`, `order_items`, impressão e baixa de estoque;
- consumidores em `src/pages/PublicOrder.tsx`;
- testes `operationalFunctions`, `operationalDatabase`, `pwaSmsDatabase`, `pwaReadyCombos` e `publicModuleIsolation`.

Não foram enviados SMS, criados pedidos reais, executados pagamentos, alterados saldos, aplicadas migrations remotas ou publicados deployments.

Comandos principais executados:

```text
npx tsc --noEmit -p tsconfig.app.json
npm run lint
npm run build
npx vitest run src/test/pwaSmsDatabase.test.ts src/test/operationalDatabase.test.ts src/test/pwaReadyCombos.test.ts src/test/operationalFunctions.test.ts src/test/publicModuleIsolation.test.ts
```

## Resultados

| Área | Resultado | Evidência | Impacto |
|---|---|---|---|
| Gate HTTP e unidade | Parcialmente aprovado | UUID, unidade ativa, integração `own-pwa` e módulo `pwa_publica` são verificados em `public-order/index.ts:10-17` | Falhas de configuração são bloqueadas; falta testar a migration final no banco |
| Cardápio público | Aprovado com escopo limitado | `menu` retorna somente itens ativos/publicados da unidade em `index.ts:23-39` | Não há variantes/adicionais no payload público atual |
| Token do cliente | Aprovado | `submit`/`status` exigem token de 72 caracteres e usam SHA-256 antes do RPC | Reduz exposição do token no banco e impede envio anônimo |
| RPC de envio | Bloqueador | `20261022010000_unit_modules_qr_pwa.sql:57` chama função não definida no repositório | Pedido pode chegar ao botão de confirmação e falhar no banco |
| Idempotência | Aprovado na versão anterior | `order_access.order_id` é travado e o retry retorna `order_summary` | Evita duplicação no retry, desde que a RPC vigente seja funcional |
| Multiunidade | Aprovado nos testes disponíveis | `p_unit` é usado na consulta de token, unidade, itens, integração e sessão | Deve ser coberto também após aplicar a migration final |
| Status do pedido | Parcialmente aprovado | `get_pwa_order_status` consulta o hash e o mesmo `orders.id` | O status fica bloqueado pela própria Edge Function se `pwa_publica` for desligada; decisão de produto necessária |
| Estoque/ficha técnica | Parcialmente aprovado | `order_items` possui gatilho de baixa em `20261013145327...`; gravação depende da RPC vigente | Não foi possível confirmar o caminho final com adicionais/variantes |
| TypeScript/build | Aprovado | Typecheck e build passaram | Sem bloqueio de compilação |
| Lint | Aprovado com warnings | ESLint: 0 erros, 14 warnings, incluindo dependência de `confirmation` em `PublicOrder.tsx:99` | Risco baixo de efeito de polling/estado desatualizado |

## Achados priorizados

### PO-001 — RPC final chama função inexistente — crítico

**Evidência:** `supabase/migrations/20261022010000_unit_modules_qr_pwa.sql:57` contém `v_lines:=ops_private.resolve_pwa_order_lines(p_unit,p_items)`. A busca em todas as migrations encontrou somente essa referência; não encontrou `create function` ou `create or replace function` para `ops_private.resolve_pwa_order_lines`.

A versão anterior de `submit_pwa_order`, em `20261017170000_pwa_ready_combos.sql`, valida os itens diretamente. A migration de módulos substitui essa implementação por uma nova versão que depende do resolver ausente. Os testes atuais carregam as migrations anteriores e, portanto, não exercitam o contrato final.

**Impacto:** depois de aplicar a migration de módulos, a confirmação do pedido pode falhar em runtime com erro de função inexistente. O cliente receberá a mensagem genérica da Edge Function e nenhum pedido será criado.

**Recomendação:** criar a função `ops_private.resolve_pwa_order_lines` antes da substituição, ou incorporar sua lógica diretamente na RPC final. A implementação deve validar unidade, item ativo/publicado, quantidade, duplicidade, combos, preço no servidor e formato dos adicionais/variantes. A migration precisa ser testada em um banco limpo na mesma ordem usada em produção.

**Critério de aceite:** uma suíte que carregue todas as migrations até `20261022010000` deve criar um pedido simples e um combo com sucesso; um item de outra unidade, item oculto, preço adulterado, quantidade inválida e carrinho duplicado devem ser rejeitados sem criar sessão, pedido ou itens parciais.

**Fase:** estabilidade e segurança.

### PO-002 — Testes de banco não aplicam a migration final do PWA — alto

**Evidência:** `src/test/pwaSmsDatabase.test.ts` carrega até `20261017180000_pwa_sms_verification.sql`; `src/test/operationalDatabase.test.ts` carrega as migrations antigas; `src/test/pwaReadyCombos.test.ts` cobre `20261017170000_pwa_ready_combos.sql`, mas não `20261022010000_unit_modules_qr_pwa.sql`.

**Impacto:** os 38 testes passam, mas não garantem que a função que será usada após a última migration exista e funcione. Há uma falsa sensação de cobertura do caminho crítico.

**Recomendação:** adicionar um fixture de banco “latest PWA” que carregue, em ordem, as migrations necessárias até `20261022010000` e `20261022120000`. Usar esse fixture nos testes de envio/status e manter um teste de upgrade para detectar incompatibilidades de assinatura.

**Critério de aceite:** CI falha se qualquer RPC referenciada por uma migration final não puder ser chamada no fixture atualizado.

**Fase:** estabilidade e segurança.

### PO-003 — Adicionais e variantes ainda não fazem parte do contrato público — alto

**Evidência:** o `menu` seleciona somente `id,name,description,price,image_url,category` em `public-order/index.ts:26`. A tela envia apenas `{id, quantity}` ou `{combo_id, quantity}` em `src/pages/PublicOrder.tsx:107`. As tabelas `menu_item_ingredients` e `menu_item_variants` existem, mas não são incluídas no catálogo nem no payload do pedido.

**Impacto:** a UI não consegue oferecer de forma confiável variantes, adicionais, remoções ou preço adicional. Implementar isso apenas no navegador criaria risco de manipulação de preço e divergência com estoque/ficha técnica.

**Recomendação:** definir primeiro o contrato server-side: `variant_id`, `additions`, `removals`, `observation`. O resolver deve recalcular o preço e persistir o snapshot em `order_items.ingredient_mods` e campos próprios de variante, se adotados.

**Critério de aceite:** duas configurações diferentes do mesmo item geram linhas distintas; preço adulterado no navegador é ignorado; adicional inválido ou pertencente a outro item é rejeitado; a ficha/baixa usa o item e as modificações validadas.

**Fase:** operação completa.

### PO-004 — Erros inesperados da função são convertidos em 400 — médio

**Evidência:** `public-order/index.ts:52` usa `catch { return json({error:"Não foi possível processar a solicitação"},400); }`.

**Impacto:** falhas de banco, timeout ou bug interno aparecem como erro de requisição do cliente. Isso dificulta monitoramento, pode induzir retry indevido e não diferencia erro transitório de payload inválido.

**Recomendação:** registrar um correlation/request id sem dados pessoais; retornar `503` para falha de dependência/infraestrutura e `500` para erro inesperado. Manter mensagens públicas genéricas, mas registrar código e contexto no log seguro.

**Critério de aceite:** JSON inválido continua em `400`; erro de RPC/banco não classificado retorna `500` ou `503`; nenhum detalhe SQL ou segredo é exposto.

**Fase:** estabilidade e observabilidade.

### PO-005 — Status do pedido depende do módulo permanecer ativo — médio

**Evidência:** o gate geral da função em `public-order/index.ts:17` ocorre antes do ramo `status`. Se `pwa_publica` for desligado depois da criação do pedido, a consulta de status também retorna indisponível.

**Impacto:** a loja pode desligar novos pedidos e, simultaneamente, impedir o cliente de acompanhar uma retirada já aceita.

**Recomendação:** separar “aceitar novos pedidos” de “acompanhar pedidos existentes”. Manter o módulo necessário para acesso e permitir `status` apenas para o token vinculado a um pedido existente, mesmo com novos envios bloqueados; ou documentar e testar explicitamente a decisão contrária.

**Critério de aceite:** desabilitar novos pedidos impede `menu`/`submit` conforme decisão, mas o comportamento de `status` de pedido já criado é previsível e coberto por teste.

**Fase:** operação completa.

## Correções aplicadas

Nenhuma correção de produção foi aplicada nesta auditoria. Foram apenas executados testes e inspeções locais. O deployment não foi alterado.

O workspace já continha alterações locais anteriores, incluindo a interface do PWA, uma migration de sincronização de status e os testes de isolamento; elas não foram publicadas como parte desta revisão.

## Roadmap

1. **Estabilidade e segurança:** corrigir PO-001; criar fixture de banco latest; cobrir envio simples, item inválido, outra unidade, duplicidade e idempotência após todas as migrations.
2. **Operação completa:** definir e implementar contrato de variantes/adicionais no resolver; persistir snapshot no pedido; testar impacto em ficha técnica, baixa de estoque, cozinha e impressão.
3. **Observabilidade e crescimento:** classificar erros HTTP, adicionar request id, métricas de RPC/latência/erros e revisar a política de acompanhamento após desligamento do PWA.

## Limitações e próximos passos

- Não foi executado pedido real em produção, nem SMS, pagamento ou mutação no banco remoto.
- O bloqueador PO-001 foi confirmado por inspeção das migrations, mas a falha em banco remoto não foi provocada por segurança operacional.
- O próximo passo técnico deve ser corrigir ou restaurar `resolve_pwa_order_lines`, adicionar o fixture latest e rodar a suíte antes de qualquer deploy.
