# Editor de modelos de impressão

No cadastro da impressora, o administrador usa o lápis ao lado de **Aplicar modelo**. O modelo editado é o gatilho selecionado na seção de prévia. Cada impressora pode guardar ajustes diferentes para cada gatilho existente.

O editor oferece cabeçalho adicional, logo monocromática, rodapé, tamanho do nome dos itens e exibição de cliente, referência, horário e modificações/observações. Valores e totais das contas não são editáveis pelo layout. O texto é tratado como texto, sem aceitar HTML/CSS arbitrários. A logo é convertida no navegador para bitmap limitado a 256 × 96 pixels; não há download externo da logo pelo agente.

**Aplicar alterações** mantém o rascunho no formulário da impressora. É preciso **Salvar** o cadastro para persistir. **Cancelar** descarta o rascunho. **Restaurar padrão** limpa a personalização no rascunho; aplicar e salvar confirma a restauração. O modelo predefinido continua apenas preenchendo as configurações do equipamento, sem sobrescrever os layouts personalizados.

## Publicação

1. Aplicar `20261018213936_printer_layout_models.sql` pelo fluxo normal de migrations. Adiciona apenas `printer_configs.print_layouts`, sem criar tabelas ou alterar permissões. Linhas existentes começam com `{}`.
2. Publicar o frontend.
3. Atualizar o agente uma vez com `layout.mjs` e as mudanças em `routing.mjs`/`escpos.mjs` (ou gerar novo pacote Windows pelo workflow existente). Depois dessa atualização, mudar um modelo não exige reinstalar o agente: ele lê as configurações ao processar cada tarefa.

A migration não foi aplicada à produção durante o desenvolvimento. Um frontend publicado antes dela falha ao salvar o campo novo, em vez de fingir persistência.

## Limites explícitos

- TCP continua atendendo somente `comanda_cozinha`. Levar os demais gatilhos à fila/agente é uma alteração separada, ainda pendente.
- A prévia dos seis gatilhos e as contas que usam `useConfiguredPrint` aplicam os ajustes. Caminhos antigos que chamam diretamente `printReceipt` ou a estação do navegador ainda não consultam o cadastro de modelos.
- A prévia HTML mostra o conteúdo e as opções, mas não garante equivalência visual exata com as fontes e mecanismos de uma térmica física.
- Este PR não corrige a falha de inicialização do executável anterior nem comprova impressão física. O agente Node foi o caminho usado no teste do usuário.
