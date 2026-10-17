# Assistente do administrador — implantação

A caixa de conversa fica disponível nas telas internas da PWA somente para Administradores da unidade selecionada. O backend valida o usuário pelo Supabase Auth e consulta o papel na unidade em cada solicitação. Nas rotas públicas de clientes, o botão não aparece. Trocar de unidade ou usuário limpa a conversa e descarta respostas anteriores em andamento.

A aba Tutoriais contém 12 guias locais, com progresso, navegação por passos e atalho para a área correspondente. Não depende de uma credencial de IA. A conversa identifica página e unidade e oferece consultas explícitas: ajuda, até 100 itens do cardápio, até 100 insumos ou agregação dos últimos 1.000 pedidos em 24 horas. O servidor informa limites e truncamento. Não envia nomes de clientes, telefones, pagamentos ou dados de RH automaticamente.

Os modelos homologados são Gemini 2.5 Flash, GPT-4.1 mini e Claude Sonnet 4.5. A lista verifica a disponibilidade na API do provedor com a credencial cifrada da unidade. Serviços apenas de imagem não são modelos de conversa. Usa `AI_CREDENTIALS_ENCRYPTION_KEY` existente; nenhuma credencial entra no navegador, resposta ou contexto do modelo. Endpoints e modelos não são escolhidos por URLs arbitrárias do cliente. Falhas do provedor não expõem seus corpos de resposta.

O assistente orienta, analisa e propõe rascunhos em texto. Não executa gravações de negócio, SQL livre ou ações operacionais. Para salvar, publicar, registrar estoque/pagamento ou encerrar sessão, o administrador usa o fluxo existente. Nenhum lançamento é executado posteriormente a partir de uma pergunta pendente.

A conversa fica em memória na sessão do navegador e pode ser limpa. Não é arquivada no banco. A auditoria armazena unidade, usuário, ação, modelo, horários, status e tokens quando fornecidos. Limites compartilhados por unidade: 30 solicitações em 15 minutos e 200 em 24 horas; falhas também contam para proteger o consumo. O provedor aplica seus próprios limites e cobrança. Não há preço monetário estimado inventado.

Backend implantado em 09/10/2026: migrations `admin_assistant_usage` e `harden_assistant_table_grants`, função `admin-assistant` com autenticação interna e JWT gateway desabilitado para aceitar os clientes atuais. Teste HTTP anônimo real: 401. A tabela de auditoria não concede acesso a `anon` e não concede escrita ao navegador.

Validação: testes de autorização, unidade, mensagens, modelo, orçamento e interação; navegador móvel com APIs simuladas para conversa, progresso dos tutoriais e navegação. A conversa paga com a credencial Google real depende de uma sessão autorizada do administrador; não foi simulada como uma validação real do provedor. Publicação do frontend depende da implantação da branch/PR.

Fontes oficiais consultadas: [Gemini generateContent](https://ai.google.dev/api/generate-content), [Gemini models](https://ai.google.dev/api/models), [OpenAI Chat API](https://developers.openai.com/api/reference/resources/chat), [Claude Messages API](https://platform.claude.com/docs/en/api/messages/create).
