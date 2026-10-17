# Revisão de cardápio, fichas, estoque e lotes — 13/10/2026

## Evidências antes de modificar

Inspeção do código e do schema publicado em `dtpuvegtcgddjkifsocx`:

- `ItemForm.handleSave` publica o item antes de `RecipeBuilder.commit`. Este faz upsert e exclusão em requisições separadas: uma falha pode publicar ficha incompleta ou misturar linhas antigas e novas.
- `createRecipe` grava receita e ingredientes separadamente. `produceBatch` credita a saída pelo trigger de `production_batches` antes de gravar consumos e lote: falhas posteriores deixam produção parcial.
- `order_item_deducts_stock` não informa `lote_id`. `production_batch_input_deducts_stock` também omite o lote escolhido. O frontend compensa a produção contando `production_batch_inputs`, enquanto ignora entradas de estorno no saldo do lote. Essa combinação pode contar consumos duas vezes após vincular o movimento.
- `apply_stock_movement` lê saldo/custo sem bloquear o insumo e não valida unidade/lote. Concorrência pode alterar custo médio a partir de saldo desatualizado.
- `manage_purchase_lot` está versionada e tipada, mas não existe no banco publicado. Sua versão no repositório soma saídas e consumos de produção separadamente e ignora estornos.
- Apenas a consulta principal de insumos filtra a unidade; lotes, fornecedores, receitas e etiquetas podem combinar unidades acessíveis. Respostas atrasadas também precisam ser descartadas.
- Os testes anteriores de venda/estorno não validavam produção real ou alocação por lote.

## Decisões

Reutilizar `raw_materials`, `recipe_items`, `production_recipes`, `production_batch_inputs`, `lotes` e `stock_movements`. Nenhuma tabela paralela de estoque. Cadastro de cardápio/fichas não movimenta estoque.

Salvar item, opções e ficha em uma única transação, inclusive novos insumos e receitas. Criar compras e produções atomicamente; o banco decide FEFO sob bloqueio, sem depender da prévia do navegador. A produção consome bases; a venda consome apenas o insumo produzido referenciado pela ficha. Estorno devolve movimentos originais e seus lotes.

O histórico antigo de produção sem vínculo no movimento será associado ao movimento já existente, sem inserir saídas adicionais. Saldo do lote usa somente o histórico de movimentos após essa associação. Correções de quantidade ficam fora do consumo, pois alteram a quantidade inicial do lote.

Preservar a compatibilidade de estoque sem lote: excesso não rastreável continua como movimento sem lote e pode gerar saldo negativo, como no fluxo existente. Lotes vencidos continuam sinalizados e são ordenados por validade como já acontece na aplicação; bloqueio sanitário de venda/produção não fazia parte do fluxo e não é introduzido nesta revisão.

Todas as RPCs verificam função do usuário e unidade; componentes descartam dados de unidade anterior. Testes cobrirão rollback, permissões, FEFO, ausência de dupla baixa e devolução após mudança da ficha.

## Reconciliação da versão principal

`main` avançou até `5cfe061e` durante a revisão. A árvore `6fce83fa` foi reconstruída por arquivos e hashes do GitHub e integrada, preservando importação de fichas, orientação, salvamento de receita produzida, categorias, combos e impressão. Não houve substituição da versão principal por uma cópia antiga.

As colunas de quantidade/unidade apresentada, transformação, insumo teórico e a tabela `technical_documents` ainda não existiam no banco consultado. São estabelecidas pela migration da revisão. A identidade de documento é texto, como `menu_items.id`. Documentos e receita relacional são gravados na mesma transação. A primeira ficha pode definir a unidade-base de um insumo teórico criado em `un`, somente antes de qualquer uso ou movimentação.

A migration de produção `20261013180000` tem data futura relativa à migration criada pelo CLI. Ela recebe uma condição para preservar a implementação transacional quando o histórico é executado em ordem de nome, sem reintroduzir triggers que omitem lote.

## Limpeza solicitada

Após a correção explícita de escopo do usuário, somente cardápio, fichas, lotes e estoque foram apagados. Backup privado: `789c92b3-9463-44ba-b421-72426ee7449a`. Foram removidos 2 itens, 16 insumos, 10 lotes, 12 movimentos e 1 receita de produção, incluindo suas dependências. Os 5 pedidos, 6 itens de pedido, 2 comandas e 5 trabalhos de impressão foram preservados. Categorias, fotos do acervo, usuários e configurações também foram preservados.

Novos registros foram criados após a limpeza (item “Nada”, seis insumos e seis lotes). Foram preservados por serem posteriores à limpeza confirmada; não são registros gerados pelo teste de aceitação desta revisão.

## Validação

- 296 testes em 63 arquivos passaram; TypeScript e build passaram. Lint sem erros; avisos preexistentes foram mantidos.
- `scripts/verify-menu-stock-lots-rollback.sql` executado no Supabase como administrador autenticado da unidade: cadastro sem estoque, duas compras, produção FEFO, custo real do produzido, repetição idempotente, venda sem dupla baixa, mudança da ficha, estorno dos lotes originais e falha atômica no salvamento.
- A primeira tentativa de aceitação encontrou a mesa 1 ocupada e foi revertida. O script passou a escolher uma mesa livre existente; a execução completa passou com `ROLLBACK`. Consultas posteriores confirmaram zero itens, insumos e lotes de QA e preservaram os novos registros do usuário, pedidos e comandas.
- Advisor de segurança: zero erros e nenhum achado nas novas tabelas/views. Avisos existentes de funções anteriores/configuração permanecem fora desta mudança; referência de remediação: [Supabase Database Linter](https://supabase.com/docs/guides/database/database-linter).
- Não foi possível fazer login real de operador no navegador desta sessão; validação de interface feita por testes de componentes/hooks e validação do banco pelo ciclo autenticado acima.
