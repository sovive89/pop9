# Execução do plano de RLS em staging

Data: 2026-10-17 UTC (noite de 16/10 no Brasil).

Resultado: reprovado no gate de leitura. A rodada foi interrompida na primeira falha de isolamento. Não houve aprovação integral de nenhum dos 17 casos do plano.

## Ambiente e preparação

Foi criada a branch isolada `rls-qa-20261017`, ref `dkuinacpyjdzqlczzoiy`, sem copiar dados de produção. A branch inicialmente terminou com MIGRATIONS_FAILED. Após a restauração das dependências ausentes e o rebase das migrations, chegou a FUNCTIONS_DEPLOYED com preview_project_status ACTIVE_HEALTHY.

Lacunas encontradas no replay:

- A migration 20260305213946 concedia papéis a um usuário com ID fixo ausente no banco novo. O ajuste local condiciona a concessão à existência do usuário, preservando o resultado para bancos onde ele existe.
- As tabelas threads, messages e thread_summaries existiam no principal sem CREATE recuperável no histórico. Sua estrutura vazia foi reconstruída somente no staging a partir dos metadados de produção, sem linhas de produção.
- A criação de table_areas/dining_tables estava no repositório, mas faltava no replay remoto anterior às policies que dependiam dessas tabelas. O SQL existente no repositório foi aplicado somente no staging.
- O primeiro login das contas sintéticas exigiu preencher os timestamps de auth.identities da preparação. Não houve envio de email, SMS ou pagamento real.
- Os GRANTs das tabelas operacionais não estavam presentes no staging. Foram alinhados aos privilégios efetivos do principal antes da rodada válida. A tentativa anterior com HTTP 403 está preservada como erro de preparação, não como falha de RLS do produto.

Comparação das policies de sessions, orders, order_items, session_clients, payments, user_roles, business_units e dining_tables: 53 policies em ambos os ambientes. A única diferença textual foi WITH CHECK implícito em uma policy UPDATE de order_items, cujo comportamento usa USING quando o CHECK não foi declarado. Não houve mudança nas policies para fazer um teste passar.

## Rodada válida

Foram criadas seis contas sintéticas: admin-A, caixa-A, atendente-A, admin-B, atendente-B e sem-papel, com papéis explicitamente vinculados às respectivas unidades. As chamadas usaram JWT emitido pelo Auth e chave publicável normal. O preparador privilegiado foi utilizado apenas para montar e remover fixtures, não para comprovar RLS.

Oito verificações passaram: SELECT da sessão da própria unidade para admin/caixa/atendente, SELECT negado da sessão de B para os mesmos perfis de A e SELECT negado de sessão privada para sem-papel e anon.

A nona verificação falhou no RLS-12: admin-A conseguiu ler o ID de business_units da unidade B, com HTTP 200. O vínculo do admin-A foi conferido: somente A. Admin-B confirmou o mesmo registro como controle autorizado. Evidência completa em rls-read-gate-20261017.json, sem tokens ou senhas.

Essa falha não autoriza concluir que sessões ou todas as tabelas vazam: o achado comprovado é leitura cruzada em business_units. A rodada parou antes de testar escritas, dining_tables, fechamento e revogação.

## Achado adicional durante a preparação

A criação simultânea de sessões com mesa número 1 em A e B encontrou `sessions_active_table_unique` com chave apenas `(table_number)`. A transação foi revertida e os fixtures passaram a usar números diferentes. O índice global pode impedir o uso do mesmo número de mesa em unidades distintas; requer correção/teste em tarefa separada. Não foi alterado durante o QA.

## Continuidade

A issue #97 permanece pendente. Corrigir o isolamento em fluxo separado, revisar o histórico de schema e repetir a rodada desde o início. Impressão física, IA, PWA e operação ponta a ponta permanecem fora desta execução.

A falha de isolamento foi registrada na issue #103. Ao finalizar, os fixtures e as seis contas sintéticas foram removidos do staging; as evidências sanitizadas foram preservadas. A correção de acesso de Ricardo às duas unidades é uma tarefa operacional separada, registrada no PR #102 e aplicada no principal com verificação dos dois vínculos.
