# Correções da revisão de 09/10/2026

Esta alteração corrige o delimitador SQL de manage_purchase_lot, o vínculo
de novos usuários com a unidade, a seleção de sessões por unidade, o saldo
dos lotes após correções e a função de criação de mesas.

## Publicação

1. Aplicar as migrations pendentes, incluindo
   20261009104050_review_unit_and_inventory_fixes.sql. A migration histórica
   20261008181000 também teve o delimitador corrigido, permitindo sua aplicação
   quando ainda estiver pendente. A nova migration reaplica a função corrigida
   nos ambientes em que ela já estava instalada.
2. Publicar a Edge Function manage-user junto com o frontend: o cadastro
   agora envia business_unit_id e o servidor valida a unidade e atribui todas
   as permissões a ela.
3. Confirmar cadastro/login de um funcionário, abertura e fechamento de mesa,
   criação de nova mesa e edição/cancelamento de um lote sem consumo.

O backfill de permissões legadas sem unidade só ocorre quando existe uma única
unidade ativa. Em ambientes com várias unidades, atribuir os vínculos
explicitamente conforme a equipe de cada unidade; a migration não escolhe
automaticamente uma unidade nesses casos.

## Validação

Executar npm ci, npm run test e npm run build.

Os testes incluem troca de unidade com respostas fora de ordem, mesas de mesmo
número em unidades diferentes, cadastro com unidade autorizada, rollback de
cadastro sem permissões e saldo de lote após correção. As migrations são
executadas em PostgreSQL via PGlite sobre um schema mínimo das dependências,
incluindo verificações de autorização e de preservação de números arquivados.
Esse schema mínimo não reproduz os triggers de estoque externos ao repositório.

A numeração de mesas é serializada pela trava da linha de business_units e
atualiza table_count na mesma transação. Nenhuma migration ou função deste PR
foi aplicada no banco de produção durante a implementação.
