# Caixa, inadimplência e Central de Documentos

## Comportamento

O atendente registra pagamentos confirmados e solicita o encerramento. A sessão
continua ativa e o mapa indica "Aguardando caixa". O painel /caixa lista as
solicitações da unidade, o consumo, serviço, pagamentos, saldo por cliente e
pedidos que ainda precisam ser entregues ou cancelados.

Caixa e Administrador da mesma unidade podem aprovar, usando a senha da própria
conta. A Edge Function valida o JWT, a permissão na unidade e a senha em um cliente
separado. O navegador não pode mais alterar o status da sessão diretamente nem
chamar a função SQL de aprovação. A aprovação recalcula o saldo e só então grava
o registro de auditoria e libera a mesa na mesma transação.

Saldo pendente exige justificativa de pelo menos 10 caracteres. O saldo e os
clientes são registrados no relatório de inadimplência (/inadimplencia e
Relatórios), com data, telefone, justificativa e quem autorizou. O relatório
exibe o saldo no encerramento; não implementa baixa posterior ou cobrança. Pedidos
não entregues/cancelados continuam impedindo o encerramento. Pagamentos não
confirmados ou estornados não quitam a conta, adicionais entram no consumo, e um
pagamento a maior de um cliente não apaga a dívida de outro.

A Central de Documentos exporta apenas itens ativos e publicados da unidade
selecionada, diretamente do banco. Cada pacote iFood/99Food contém cardapio.pdf,
cardapio.csv (apoio, não modelo oficial de importação), imagens.csv, imagens
originais disponíveis e LEIA-ME.txt com instruções. Imagens ausentes, acima de
5 MB, com formato não suportado ou bloqueadas por CORS são indicadas na interface
e no pacote. Há um limite local de 100 MB para as imagens incluídas. Os grupos de
documentos já presentes foram preservados; upload de arquivos administrativos
continua em preparação.

## Instalação

1. Publicar a migration 20261009113004_cashier_role.sql e confirmar a transação.
   O novo valor do enum precisa existir antes da migration seguinte.
2. Aplicar 20261009113035_session_cashier_closure.sql.
3. Publicar as Edge Functions close-session e manage-user. close-session exige
   Authorization Bearer e faz sua própria autenticação. O config.toml desativa
   a validação JWT legada do gateway para esta função; a validação interna por
   getUser e a verificação de permissão/senha permanecem obrigatórias.
4. Publicar este frontend em seguida. Fazer as etapas 2–4 numa janela coordenada:
   a migration revoga o fechamento direto usado pelo frontend antigo.
5. No cadastro de usuários, atribuir Caixa na unidade correta. Administrador
   mantém autorização de caixa sem precisar receber outro papel.
6. Testar comanda quitada, parcial e sem consumo, senha incorreta, justificativa,
   pedidos não entregues, mapa liberado e relatório. Conferir exports na Central.

## Formatos verificados

- iFood: o relatório oficial descreve digitalização a partir de imagem ou PDF.
  A disponibilidade na conta deve ser conferida no Portal do Parceiro. Nenhum
  arquivo é enviado/publicado automaticamente e o CSV não simula um importador.
  https://blog-parceiros.ifood.com.br/files/relatorio_ifood_para_restaurantes.pdf
- 99Food: o guia oficial "Como construir o seu cardápio" aceita foto, PDF ou QR
  code do cardápio do estabelecimento. Usar preços do próprio estabelecimento.
  https://99app.com/99food/restaurantes/guias/como-construir-o-seu-cardapio/

## Verificação

Executar npm ci, npm run test e npm run build. Os testes executam as migrations
em PostgreSQL via PGlite, com verificações de permissões, atomicidade, extras,
estorno, saldo por cliente, pedidos abertos e fechamento com dívida. O trigger
existente que registra a saída dos clientes também é reproduzido no teste.

Há testes da Edge Function (JWT, papel, senha, identidade e erros de aprovação),
interfaces de pagamento/caixa, isolamento de exportação por unidade e artefatos
PDF/ZIP/CSV reais. Nenhuma conta real foi encerrada nos testes.
