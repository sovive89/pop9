# Setores e modelos predefinidos de impressão

Inspeção: printer_configs já guarda tipo, gatilhos, destino cozinha/bar, papel, cópias, corte e rede. O print server já distribui comandas pelos destinos; os demais comprovantes usam o diálogo do navegador. Não duplicar filas, gatilhos ou templates existentes.

Pendências: não há identificação do setor físico nem opção de aplicar configurações predefinidas. O hook lê todas as impressoras e não filtra a unidade ao atualizar/remover; políticas antigas usam papéis globais. Corrigir o escopo e preservar configurações existentes. A tabela está vazia no banco real; não inventar IPs, impressoras ou configuração física.

Adicionar setor (cozinha, bar, caixa, expedição, produção, geral) e presets de Cozinha, Bar, Caixa e Expedição. Aplicar um preset preenche tipo, gatilhos, destinos, papel, cópias e corte, sem trocar endereço/conexão de um equipamento existente. Os modelos de impressão continuam os builders reais já usados nos pedidos/contas/avisos. Prévia e teste usam dados de exemplo claramente identificados, sem gravar pedidos ou movimentar estoque.

A impressão direta pelo servidor permanece para comandas cozinha/bar; contas e avisos continuam no navegador. QZ Tray/WebUSB não têm driver implementado. Configurar IP correto e instalar o servidor local são necessários para impressão automática em equipamento real.

## Validação

261 testes passaram em 57 arquivos. TypeScript e build passaram; lint sem erros e 11 avisos preexistentes. Testes cobrem separar cozinha/bar, totais com adicionais, largura/cópias, escape de nomes, preset na interface, descarte de dados da unidade anterior e políticas de escrita por unidade.

Migração aplicada e teste real de cadastro/alteração/remoção do equipamento executado com ROLLBACK. O banco continua sem impressoras fictícias. Advisors não apontaram ERROR. A exposição GraphQL anterior continua submetida a RLS: https://supabase.com/docs/guides/database/database-linter?lint=0026_pg_graphql_anon_table_exposed e https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed

Impressão física não foi exercitada; exige IP/dispositivo correto, papel e servidor local. A conta do Caixa aplica papel/cópias selecionados ao diálogo do navegador; as comandas automáticas mantêm o roteamento do servidor existente.
