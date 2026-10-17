# Revisão da versão atual para operação do MVP

Base: main 259648e, já publicado na Vercel em estado READY. PRs #53 e #57 já incorporadas; preservar as entregas de KDS, fila/servidor de impressão, marca, pedidos online e fichas. O rascunho adicional de biblioteca de documentos não foi aplicado ao banco nem publicado.

## Achados antes das correções

- Relatórios consulta papéis sem unidade e lê pedidos/pagamentos sem filtro business_unit_id. Um usuário autorizado em várias unidades vê valores agregados, apesar da unidade selecionada. Falhas de leitura mantêm dados anteriores; pagamentos sem filtro de status incluem pendentes/estornados. Corrigir com os papéis existentes da unidade e leitura explícita limitada à unidade/período, apenas pagamentos confirmados, descarte de respostas tardias e erro com nova tentativa.
- Exportação das fichas atuais introduzida pela PR #57 não confere o escopo após a leitura/ZIP. Trocar a unidade durante a exportação permite baixar o arquivo anterior sob o contexto seguinte. Preservar os formatos já entregues e conferir o escopo antes do download.
- Lista de IA ainda expõe xAI/Grok; backend aceita xAI, FLUX e Ideogram. O backend remoto também aceita Stability, diferença documentada aqui antes de sua retirada. O usuário agora quer apenas Anthropic, Gemini e OpenAI; manter suas credenciais e não apagar chaves legadas.

## Escopo de hoje

Operação no restaurante/retirada, cardápio e fichas, estoque, atendimento, cozinha opcional, entrega, pagamento registrado, encerramento pelo Caixa/Administrador, documentos/exportações e relatórios. Pagamento externo, fiscal automático e sincronização iFood/99Food continuam dependentes de implementação/homologação. A pré-configuração não equivale a integração operacional.

## Aceite

Testar isolamento dos relatórios por unidade/período, permissões, falhas e leituras tardias; exportação após troca de unidade; seleção e validação cifrada dos três provedores; fluxo já existente de pedidos/caixa. TypeScript, lint, testes, build e navegador móvel. Publicar commit/PR e registrar limites de validação; não declarar chamadas autenticadas/credenciais reais que não foram exercitadas.

## Resultado da validação

240 testes passaram em 50 arquivos. TypeScript, lint e build sem erros; lint mantém 11 avisos preexistentes. Banco real: uma unidade ativa, nenhum item publicado/ficha/pedido ativo, conforme limpeza autorizada; print_jobs e migrações de KDS, fila, marca e servidor de impressão estão implantados. WhatsApp está NOT_CONNECTED e PWA desativado. A função manage-ai-credentials v8 está ACTIVE com validação JWT preservada e aceita apenas os três provedores.

Testes de regressão cobrem relatórios, troca de unidade, download tardio de fichas e contrato de credenciais. Validação real com senha de operador/Meta/PSP, leitura paga de IA e impressão física não foram feitas. PDFs/ZIP e contrato do fluxo de caixa são cobertos pelos testes existentes. Para abrir: cadastrar cardápio/preços e compras reais; conferir usuários e impressora física. Para pedidos online: configurar/validar WhatsApp Meta e ativar PWA. Não chamar essas dependências de prontas.
