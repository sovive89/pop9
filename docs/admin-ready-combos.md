# Combos prontos e combos com escolhas

## Inspeção antes de alterar

O pedido é permitir ao administrador cadastrar combos prontos, com preço fixo ou
desconto, preservando os combos montados na hora pelo atendente/cliente.

O modelo existente (`menu_combos`, `menu_combo_slots`, `menu_combo_options`) já
representa essas duas composições: uma opção por etapa representa um componente
fixo; várias opções permitem escolha. `pricing_mode` já suporta preço fixo,
desconto percentual e desconto em reais. Não criar outra tabela ou produto de
estoque para o combo. A venda continua gerando linhas normais de `order_items`,
agrupadas por `combo_group_id`, com preço rateado em centavos.

O editor atual não distingue os dois modos explicitamente. A alteração deve
oferecer essa escolha, impedir várias opções em um componente de combo pronto e
preservar todas as opções existentes ao editar combos com escolhas.

## SQLs enviados e estado do banco

Os quatro anexos de 17/10/2026 são idênticos às migrations canônicas:

- `1-setor-por-item.sql`: `20261017140000_menu_item_destination_override.sql`.
- `2-classificacao-e-combos.sql`: `20261017160000_menu_item_class_combo_eligibility.sql`.
- `3-transferencia-de-lote.sql`: `20261017130000_transfer_partial_stock_lot.sql`.
- `4-rls-por-unidade.sql`: `20261017150000_scope_unit_metadata_rls.sql`.

A inspeção real encontrou setor e classificação já instalados. Transferência de
lotes não tem tabela/RPC instalada, e os metadados ainda têm policies globais.
Não repetir as duas migrations instaladas. Antes das pendências, verificar
dependências da view, origens dos lotes, vínculos dos administradores, executar
testes e guardar backup privado das definições substituídas. A view de saldos não
tem dependentes; há apenas origens `compra`/`producao`; os administradores têm
vínculos explícitos por unidade. A aplicação dos SQLs não movimenta estoque.

## Incompatibilidade encontrada na aceitação real

As duas migrations pendentes foram aplicadas com sucesso, mas o teste funcional
revertido encontrou `stock_movements_reason_check` em produção sem
`transferencia`. A migration de transferência não amplia essa constraint, e a
base de testes não a reproduzia. Não houve transferência parcial: a transação
inteira foi revertida, sem fixtures persistidas.

Adicionar uma migration complementar que preserve os sete motivos existentes
(`compra`, `producao_consumo`, `producao_output`, `venda`,
`estorno_cancelamento`, `ajuste`, `perda`) e acrescente `transferencia`.
Reproduzir a constraint antiga no banco de testes para cobrir esse cenário antes
de executar novamente a aceitação real. Não reescrever movimentos existentes.

## Entrega e validação

- Administração → Combos → **Novo combo pronto**: um componente por linha,
  usando itens publicados, ativos e elegíveis. Duas unidades do mesmo item podem
  ocupar duas linhas. **Combo com escolhas** continua permitindo várias opções
  por etapa. A edição não descarta opções ao alternar a composição.
- Cobrança: preço fixo, desconto percentual ou desconto em reais, com prévia de
  preço avulso, preço final e economia. O pedido recebe todos os componentes e
  preserva o fluxo existente de personalização, setor, ficha técnica e estoque.
  Não existe um segundo estoque para o combo. A montagem na hora foi preservada.
- A seleção de venda exige exatamente uma opção cadastrada por etapa; seleções
  incompletas, opções de outra etapa, valores de opção alterados e combos
  inativos não geram linhas de pedido.
- Banco: aplicadas `transfer_partial_stock_lot`, `scope_unit_metadata_rls` e a
  correção complementar `stock_transfer_movement_reason`. As demais migrations
  dos anexos já estavam instaladas. Backup privado:
  `ab226124-7499-4f5c-8bdd-a225c43f0325`, de 17/10/2026 07:00 UTC.
- O script `verify-combos-and-unit-migrations-rollback.sql` passou com papel
  `authenticated` no PostgreSQL: gravação/edição das três cobranças, componentes
  repetidos, edição de combo na unidade errada rejeitada, transferência parcial,
  retry sem duplicidade, rejeição por saldo insuficiente e RLS/RPC sem vínculo.
  A transação foi revertida; nenhum `QA combos`, transferência ou mudança de
  saldo real permaneceu. A view mantém `security_invoker=true`.
- Suíte completa: **465 testes em 82 arquivos**, todos aprovados. Depois da
  correção de motivo, passaram **34 testes** de lotes, transferência e estorno,
  além de **12 testes** de componentes e exportação com a base atualizada.
  TypeScript, lint dos arquivos alterados e build passaram.
- Chromium com componentes reais e persistência simulada: 390×844 e 1280×900,
  sem overflow horizontal ou erro de execução; as três regras gravaram o payload
  esperado e o combo de R$39,90 gerou três linhas somando exatamente 3990 centavos.
  Não foi realizado login de operador no navegador; autenticação e RLS foram
  verificados diretamente no PostgreSQL em transação revertida.

O Advisor identificou que os grants padrão do projeto concederam `SELECT` a
`anon` na nova `stock_transfers`. A RLS já bloqueia linhas anônimas; ainda assim,
remover o grant não utilizado na nova tabela para mantê-la restrita à API
autenticada, sem alterar tabelas legadas. Referência:
[exposição GraphQL anônima](https://supabase.com/docs/guides/database/database-linter?lint=0026_pg_graphql_anon_table_exposed).
A leitura autenticada permanece protegida pela policy de administrador na
origem ou destino; a RPC exige administração em ambas as unidades.
