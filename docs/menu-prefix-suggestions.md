# Sugestões por início da palavra no Cardápio

As sugestões complementam o rascunho guiado do Agente PØP9 e o editor real do Cardápio. Não executam o futuro executor da PR #50, não salvam automaticamente e não fazem uma nova chamada paga à IA a cada tecla.

Fontes: nomes/descrições de produtos ativos, categorias e insumos ativos da unidade selecionada. Nenhum dado de cliente, caixa ou outra unidade participa. Busca por prefixo a partir de duas letras, ignorando maiúsculas/acentos apenas na comparação; a grafia original é preservada na seleção. Resultados limitados a oito opções. O texto antes/depois do cursor permanece na edição.

O catálogo de apoio é carregado sob demanda, com filtro explícito de unidade e no máximo 500 registros por fonte. A interface informa falhas e quando esse recorte é limitado. Trocar unidade/usuário ou perder acesso invalida o catálogo visível e descarta respostas anteriores, inclusive na troca de ida e volta. Nada é persistido no navegador.

No rascunho guiado, selecionar um insumo insere nome/unidade como texto para revisão. No editor da ficha, a seleção utiliza o UUID existente e mostra sua unidade, sem criar outro insumo nem converter a quantidade. Homônimos continuam separados por opção/ID. Preço, quantidade e saldo não são inferidos.

Achado documentado antes das alterações: `useAdminData.loadMenu/loadCategories` listava pais e filhos sem filtro explícito de unidade. Para fornecer sugestões coerentes com o editor, as consultas do Cardápio passam a filtrar os pais pela unidade e os filhos pelos IDs carregados; respostas antigas são descartadas. O editor é remontado na troca de unidade, descartando a edição local anterior. As regras de gravação atuais permanecem nas funções existentes.

Validação em 10/10/2026: 184 testes em 37 arquivos passaram, incluindo prefixo/cursor, teclado, referências existentes, falha/limite do catálogo e troca de contexto. TypeScript e build passaram; lint sem erros, com 11 avisos preexistentes. Verificação no Chromium em viewport móvel de 390 × 844 com toque e APIs simuladas: seleção de categoria e insumo, conclusão por teclado, lista dentro da tela, UUID/unidade reaproveitados, quantidade vazia, zero gravações REST e nenhuma chamada extra à IA ao digitar. A integração autenticada com provedores reais e a implantação pública não foram verificadas nesta etapa. A disponibilidade pública do frontend depende da incorporação/implantação da PR.
