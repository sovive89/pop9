# Operação por unidade e revisão de interface

- A unidade permanece visível nas telas internas e pode ser alternada sem abrir ou fechar operações. A troca avisa sobre alterações não salvas e remonta a página para descartar formulários da unidade anterior.
- Iniciar operação abre uma confirmação com escolha de unidade. A RPC continua autorizando a abertura no servidor; após sucesso, a unidade aberta vira o contexto ativo.
- O cabeçalho mostra o nome cadastrado e o perfil da unidade. Administrador tem prioridade sobre outros perfis.
- A Central de Documentos consulta as fichas atuais de cardápio e produção, com ingredientes, quantidades e rendimento. Mudanças de unidade e respostas antigas são isoladas. Modo de preparo não existe no cadastro relacional atual; a interface informa a ausência em vez de inventar conteúdo.
- O financeiro deixou de usar produtos, custos e projeções fictícios. Mostra pagamentos confirmados e serviço separadamente, pedidos e perdas reais por unidade.
- O catálogo de categorias inclui um desenho de hambúrguer, doses/destilados e bebidas sem álcool, mantendo os ícones anteriores.
- Setores personalizados aparecem no campo Setor da impressora após criação e ficam selecionados. O banco valida que pertencem à unidade da impressora. A migração foi aplicada no projeto Pop9 em 2026-10-17 UTC.
- Pagamento já tinha formulário funcional; os testes de registro parcial e taxa restante passam. A ação do resumo passou a se chamar Registrar pagamento. A falha específica relatada pelo usuário ainda precisa de reprodução em sessão autenticada; não se presume resolvida só pela alteração do texto.
- Limpeza autorizada: estoque, fichas, receitas, produção, lotes e movimentações zerados em todas as unidades. Comandas, pedidos e pagamentos já estavam zerados. Um usuário e duas unidades foram preservados. Nenhum dado de fornecedor, usuário, unidade ou configuração foi apagado nesta rodada.

## Verificação e pendências

Build, TypeScript, lint dos componentes novos/reescritos e testes automatizados executados. A suíte-base passou com 414 testes; os testes adicionais cobrem o setor personalizado no banco e o cadastro pela interface.

O isolamento operacional é coberto pelos testes das políticas restritivas existentes. A coexistência com políticas globais permissivas não remove essas restrições. Cadastros globais (como unidades/empresas) e a aplicação inteira ainda precisam de auditoria de autorização; não há aprovação de isolamento completo nem de prontidão comercial.

O aviso branco com Dismiss/Details e a indicação INP não foram reproduzidos. Não foram escondidos ou declarados corrigidos. A análise estática e os testes não substituem validação autenticada no navegador nem impressão física.
