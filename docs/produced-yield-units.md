# Rendimento produzido e medidas dos insumos

## Evidências antes de alterar (relato e screenshot de 13/10/2026)

- O blend existente está cadastrado em `un`, com receita que rende 1 unidade usando 80 g de costela e 120 g de patinho. Produzir 10 unidades consumiu 800 g e 1.200 g, respectivamente. Não é necessário converter os ingredientes em unidades.
- A tela reutiliza a unidade de consumo no cardápio para o rendimento da receita. Isso impede representar claramente uma saída em unidades com entradas em peso.
- Queijo mussarela e molho especial foram criados pelo cardápio em `un`. Suas compras não definiram corretamente a medida-base: o lote ativo do queijo usa 2 kg × 1.000 = 2.000, e o molho usa 2 L × 1 = 2. O erro `g → un` identifica essa medida-base incorreta, e não o rendimento do blend.

## Correção

Separar a unidade do rendimento da produção da quantidade utilizada no item vendido. Um hambúrguer produzido pode render 1 `un` e consumir 200 `g` de bases. A ficha de venda usa 1 `un` desse produzido; queijo e molho seguem em suas medidas próprias.

Corrigir o antigo `un` teórico de insumos somente quando todos os lotes ativos de compra identificam inequivocamente uma unidade física pela unidade da compra e pelo fator de conversão. Não reinterpretar itens produzidos ou unidades contadas, não presumir densidade ou peso por peça, não alterar quantidades/custos dos movimentos e não mudar insumos já usados em fichas com unidade definida. Manter autorização da unidade e transação única.

O cadastro produzido existente deve carregar sua receita quando selecionado, evitando solicitar uma nova ficha idêntica. Estoque e lotes continuam nas tabelas canônicas existentes.

## Simplificação da ficha (17/10/2026)

O usuário identificou a seleção permanente da unidade-base como informação repetida no fluxo da ficha. A definição continua necessária, mas a tela passa a mostrar apenas “Estoque controlado em…”; novos insumos usam inicialmente a medida da receita. A alteração da unidade inicial fica no diálogo de cadastro do insumo, acessível por “Alterar”. Cadastros com uso continuam protegidos pelas validações existentes. Não há alteração de banco, contratos de gravação ou saldos.

A unidade-base inicial fica editável na ficha para novos insumos e cadastros teóricos sem uso. É independente da medida de consumo: estoque em `kg` pode ter ficha em `g`. A validação no banco impede redefinição após fichas, lotes, movimentações ou estoque mínimo configurado; os vínculos anteriores são verificados antes de substituir a ficha. Reenvios de produção reutilizam a mesma receita e rejeitam alteração da composição com o mesmo identificador de solicitação.

## Validação e aplicação

Durante a publicação, `main` recebeu o PR94 (OCR). A revalidação encontrou `TS2304: Cannot find name 'Deno'` em `ai-text.ts`, também com Validate falhando no commit de main. `openai-document.ts` importa o tipo de anexo desse módulo e leva código dependente do servidor para a compilação dos testes; há dependência circular entre os dois arquivos. Extrair somente o tipo compartilhado para um módulo sem runtime permite conservar o OCR e sua API sem declarar globais Deno no frontend.

- 318 testes em 64 arquivos passaram após sincronizar o OCR; 43 testes dos módulos afetados passaram após separar o tipo de anexo. TypeScript e build passaram. Lint: nenhum erro e 11 avisos já existentes.
- Migration `20261013230958_produced_yield_and_material_units.sql` aplicada ao Supabase.
- `scripts/verify-produced-yield-units-rollback.sql` executado como administrador autenticado da unidade: ficha sem estoque, 10 unidades produzidas a partir de 2.000 g, venda de 2 unidades sem dupla baixa das bases, estorno dos lotes originais, edição inicial em kg com consumo em g e bloqueio de redefinição após uso. A transação foi revertida e nenhum registro de teste permaneceu.
- Queijo e molho tiveram somente a unidade e o timestamp corrigidos, com backup privado. Mantidos 2.000 g de queijo a R$ 0,03/g e 2 L de molho a R$ 10/L; lotes e movimentos não foram alterados. Blend e pão continuam em `un`.
- Verificação por testes de componentes e SQL no banco real; fluxo visual autenticado no navegador não foi executado nesta sessão.
