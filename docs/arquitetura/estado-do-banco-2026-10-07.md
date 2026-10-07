# Estado do banco de produção — 07/10/2026

Projeto Supabase `pop9` (`dtpuvegtcgddjkifsocx`, us-west-2). Levantamento **somente leitura**, feito em 07/10/2026 ~11:30 (America/Sao_Paulo), comparando o banco real com as migrations do repositório.

## Resumo

| Item | Estado no banco | Esperado pelo `main` |
|---|---|---|
| `dining_tables` (11 linhas) e `table_areas` (1 linha) | existem | ok |
| `dining_tables.seats` e `dining_tables.group_id` | **não existem** | migration `20261007040000` |
| Funções `join_tables(uuid[])` e `split_table_group` | **não existem** | migration `20261007040000` |
| Gatilhos `trg_dining_tables_guard` e `trg_sessions_block_archived_table` | **não existem** | migration `20261006220000`, seção 2b |
| `sessions.merged_into` e função `merge_sessions` | **ainda existem** (resto da versão "juntar contas") | removidos pela `20261007040000` |
| `sessions.joined_tables` | não existe | (migration `20261007090000` está neutralizada) |
| Tabela `integrations` | **não existe** | migration `20260902120000` (a tela Conexões funciona sem ela) |
| `customers`, `orders.source` (migrations canônicas 1–5) | existem | ok |
| Schema `fastbar` (8 tabelas, `fastbar_products` com 12 linhas) | existe | resíduo do app Fastbar, preservado |

## Consequência para o app em produção

O `main` já usa `seats`/`group_id` e as funções de unir/separar. Sem as colunas, `useTables` cai no **modo legado** (`editable=false`): o mapa aparece, mas sem editar áreas/lugares nem unir mesas.

## Histórico de migrations

A tabela de histórico do Supabase existe e lista migrations até `20260927025801 menu_items_system_fields`. **Estão fora do histórico** (aplicadas à mão ou ainda não aplicadas): `20260902120000_integrations`, `20261006220000_table_areas_and_dining_tables`, `20261007040000_table_seats_and_groups`. Portanto o histórico não reflete o estado real do banco; vale a tabela acima.

## Como atualizar o banco

Script único e idempotente, já validado como SQL: [`sql/2026-10-07-catchup-mesas.sql`](./sql/2026-10-07-catchup-mesas.sql). Ele cria os gatilhos que faltam e aplica a `20261007040000` completa (lugares, grupos, funções, tempo real e remoção do resto da versão "juntar contas").

Rodar no **SQL Editor** do projeto `pop9`. Antes de rodar, saiba que `sessions.merged_into` será apagada: na data deste levantamento ela só tinha um vínculo de comanda de teste, e as comandas foram zeradas depois a pedido do dono do projeto.

Tentativas de aplicar pelo conector do Supabase (migrations e SQL direto) foram **canceladas pelo conector** em 07/10/2026; por isso o script é manual.

## Dados (contagens aproximadas na data)

`sessions` 2, `session_clients` 2, `orders` 0, `payments` 0, `menu_items` 1, `raw_materials` 3, `customers` 4, `business_units` 1.
