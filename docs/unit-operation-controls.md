# Iniciar e fechar operação

Inspeção: não existe turno/abertura operacional no schema atual. `daily_production_closing` é uma view de produção, não um registro de abertura do restaurante. Reutilizar unidade, papéis, sessões, pedidos e Caixa; um histórico `operation_periods` guarda início/fim e os responsáveis. Não inventar fechamento financeiro ou substituir o encerramento de comandas.

Administradores e Caixas da unidade podem iniciar/fechar. Encerramento bloqueado enquanto houver sessões ativas; pagamento e liberação de cada mesa continuam no fluxo com senha já existente. Operação fechada impede novas sessões, pedidos e itens no banco, inclusive pelo PWA, mas mantém consulta e alterações de status existentes. Uma trava na linha da unidade evita corrida entre fechar e receber pedido. A abertura é idempotente, sem dois períodos simultâneos.

Durante a migração, unidades ativas recebem um período aberto para preservar o recebimento de pedidos durante a publicação coordenada. Unidades novas começam fechadas e usam Iniciar operação; após fechar, o mesmo botão permite reabrir. O fluxo de validação SQL deve abrir a operação dentro da transação e desfazer tudo com ROLLBACK.

Controles aparecem em Atendimento, Caixa e Administração. Dados e respostas tardias são limitados à unidade/usuário; o banco valida os papéis a cada mudança. Não há senha adicional de abertura diária; a confirmação com senha da comanda permanece obrigatória no Caixa.

## Validação concluída

249 testes passaram em 52 arquivos, incluindo abertura idempotente, autorização por unidade/papel, bloqueio com comandas ativas, bloqueio de novos registros mesmo via acesso privilegiado do PWA, confirmação na interface e reabertura. TypeScript e build passaram; lint sem erros, com os 11 avisos preexistentes. Migração aplicada; advisors sem ERROR. A exposição GraphQL autenticada da tabela é intencional e protegida por RLS: https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed

Aceite no banco real: importar, vender, estornar corretamente, preparar, entregar, pagar, encerrar comanda, fechar operação e reabrir; tudo sofreu ROLLBACK. A função pública preserva a consulta do cardápio fechado e informa a indisponibilidade para novos pedidos, cuja recusa final permanece no banco.
