# Tooltips e fluxo de ficha técnica

## Fluxo existente e problema observado

O editor já distinguia `menu_item_ingredients` (ingredientes de exibição e personalização do cliente), `recipe_items` (ficha do item do cardápio) e `production_recipes`/`production_recipe_inputs` (receita de um insumo produzido).

Antes desta alteração, os insumos-base de uma nova preparação só podiam ser selecionados do estoque existente. O editor aninhado usava uma linha de largura fixa e não permitia cadastrar nome e unidade de um insumo-base novo. O salvamento encontrava o insumo recém-criado novamente por nome e apagava a ficha existente antes de gravar a nova, sem conferir todos os erros.

Esses são conflitos com o fluxo solicitado: começar pelo cardápio, criar insumos e receitas teóricos e lançar compras e produção depois. Os nomes semelhantes de ingredientes de exibição e insumos da ficha também causavam confusão.

## Alterações

- Nome, unidade e quantidade ficam em campos rotulados e em uma grade adaptada a telas pequenas.
- Ativar a receita de um insumo produzido já abre a primeira linha de insumo-base. É possível criar novos insumos-base ou reutilizar os existentes e adicionar/remover linhas.
- A quantidade de referência informa quanto a receita representa; as quantidades de seus insumos-base correspondem a essa referência. O saldo real depende de lançamentos posteriores.
- A criação retorna o ID gravado diretamente, sem uma segunda pesquisa por nome. Os insumos oferecidos são da unidade selecionada.
- Dados incompletos e quantidades não positivas impedem o salvamento. Uma falha ao carregar a ficha é visível e permite tentar novamente.
- A ficha é gravada antes de retirar linhas obsoletas, usando IDs estáveis. Falhar nessa gravação preserva a ficha anterior. Novos insumos já criados são reutilizados na tentativa seguinte dentro do mesmo editor.
- Tooltips delegados cobrem botões, links, controles de formulário, menus e elementos marcados em todas as rotas e modais. Há descrições específicas para ações e ajuda nas páginas.
- O tooltip abre por mouse ou foco de teclado, fecha com Escape e permite passar o ponteiro sobre o texto. Preserva descrições acessíveis já existentes e não usa valores de campos como texto de ajuda.

## Limites

Não foram aplicadas migrations ou alterações no banco de produção. O cadastro completo ainda passa por várias chamadas do fluxo existente; não é uma transação única entre cardápio, insumos e receitas. O assistente proposto deve resolver essa atomicidade antes de salvar conjuntos extensos gerados por IA. Receitas já cadastradas continuam sendo administradas pelos fluxos existentes do estoque; esta correção permite montar uma nova receita diretamente no item do cardápio.

## Verificação

Os testes de interação cobrem mouse, teclado, modais, controles dinâmicos, títulos nativos, campos de senha e falhas de gravação. Os testes de ficha cobrem novos insumos-base, unidades de insumos existentes, validação, erro de carregamento e repetição após falha.

`npm test`: 36 testes passaram. `npm run build`: build da PWA concluído. ESLint dos componentes e testes novos: aprovado. A checagem completa de TypeScript continua encontrando o problema preexistente em `src/hooks/useTableZones.ts`, que referencia `table_zones`, ausente dos tipos do Supabase; esse hook não foi alterado.
