# PØP9 — auditoria do MVP em 13/10/2026

Objetivo: operação no restaurante, pedidos próprios, estoque/fichas técnicas, cozinha, pagamento, encerramento com senha e documentos. O usuário também solicita integrações externas. Não declarar um conector operacional apenas por existir um card ou pré-configuração.

## Achados confirmados antes das alterações

- Produção Vercel e main estão no commit 802aef5 (10/10), sem as PRs #51 (autocomplete) e #52 (catálogo enxuto).
- Projeto Supabase dtpuvegtcgddjkifsocx confirmado pelo frontend, com uma unidade ativa. Há um item publicado, nenhum insumo ativo, nenhuma ficha técnica ou receita de produção cadastrada. Não inventar compras, saldos ou preços.
- Edge Function close-session chamada pelo Caixa não está publicada, embora as RPCs de encerramento existam.
- Edge Function menu-import, RPC apply_menu_import, tabela menu_import_requests e bucket de importação não estão implantados. Upload/extrair/salvar não podem completar nesse estado.
- admin-assistant remoto está na API antiga de chat e não reconhece agent-plan; o frontend atual exige agent-plan.
- IA tem Google e Anthropic com status conectado. Estado histórico de credencial não comprova uma chamada real atual.
- WhatsApp e own-pwa constam NOT_CONNECTED; PWA desabilitado. Outros provedores possuem apenas metadados/providers genéricos, sem implementação real de cobrança, emissão fiscal ou integração iFood/99Food.
- Nenhum perfil Caixa cadastrado; Administrador já é autorizado a encerrar mediante senha.

## Limites de validação

Não usar credenciais de teste como prova de integração real. Fora do reset de testes expressamente autorizado, não apagar dados existentes nem cadastrar compras fictícias. Testes de banco devem ser isolados ou sofrer rollback. Aceite operacional requer validar a cadeia frontend → API → banco → resposta; a publicação deve ter identificação do commit.

## Bloqueios adicionais confirmados

- O trigger de estorno de cancelamento escreve stock_movements sem business_unit_id, coluna obrigatória e sem default. Ele também recalcula pelo cadastro atual, em vez de devolver a baixa original; alterar uma receita após a venda altera indevidamente o estorno.
- low_stock_alerts é uma view com privilégios do proprietário. Deve respeitar as políticas do usuário que a consulta.
- O Admin consulta papéis sem unidade, ao contrário dos demais painéis. O menu principal também destaca Pop9 Hub, uma tela sem operação implementada.

- A política antiga de user_roles permite que um administrador conceda papéis em outra unidade; profiles também expõe funcionários sem restringir a unidade administrada.

## Escopo enxuto

Operação diária: Cardápio/Ficha técnica, Estoque, Clientes, Documentos, Atendimento, Cozinha, Caixa e Relatórios. Configurações (usuários, senhas, impressoras, QR, unidades e conexões) ficam agrupadas à parte. O Hub futuro não deve ocupar a navegação principal. iFood/99Food, gateway de pagamento e emissão fiscal não contam como conectados enquanto não houver conector real e credenciais do parceiro; exportações de cardápio permanecem disponíveis.

- Customer canônico (`customers`) não possui coluna de tenant e está vazio. O CRM atual usa `session_clients`. A migração restritiva bloqueia o acesso direto à tabela canônica sem inventar vínculos; as tabelas de operação recebem limites por unidade e papel.

## Entregas realizadas

- Backend publicado: close-session v1, menu-import v1, admin-assistant v2, com autenticação própria e validação de unidade.
- Reserva de IA atualizada e importação implantada (RPC, recibo idempotente e bucket privado).
- Estorno usa baixas efetivas da venda, com unidade e proteção contra duplicidade; low_stock_alerts respeita RLS do usuário.
- Limites restritivos no banco para 17 tabelas operacionais e seus filhos; acesso direto ao Customer sem tenant bloqueado. Papéis de outra unidade não concedem permissão de escrita nesta unidade.
- Escrita de papéis e leitura de perfis limitadas à unidade administrada, preservando a leitura das próprias permissões para seleção de unidade.
- Admin utiliza os papéis da unidade atual. Operação e configurações ficam separadas; Hub não aparece no menu principal. Conectores futuros ficam recolhidos, identificados como em desenvolvimento, sem botão que simule ativação.
- Cabeçalho do Atendimento ajustado ao celular (390 px) e barra de seções acompanha sua altura.
- Reset autorizado: produtos, categorias, clientes, sessões, pedidos, pagamentos, fichas, receitas, históricos e registros de testes zerados. Backup em schema privado; seis imagens de teste copiadas para bucket privado, com SHA-256 conferido, e removidas do acervo público. Rotina temporária de arquivo desativada após uso. Usuários, permissões, unidades, mesas, credenciais e configurações preservados.

## Evidências e limites

196 testes passaram em 39 arquivos; TypeScript e lint sem erros (11 avisos preexistentes). Build gerado. Chromium móvel, com APIs simuladas: navegação, configurações, busca/requisitos de integrações, estados vazios de Caixa/Estoque/Documentos, sem erros de página ou gravações de dados. Chamadas RPC has_role são apenas leituras.

Banco real, em transação com ROLLBACK: importar ficha com dois semiacabados, repetir a importação sem duplicar, reconhecer produzidos sem criar estoque real, baixar estoque de venda, mudar a ficha e cancelar restituindo a baixa original, repetir cancelamento sem duplicar estorno, preparar/pronto/entregar, registrar pagamento, solicitar e aprovar encerramento quitado. Contagens permaneceram zero após a verificação.

HTTP real: funções close-session, admin-assistant e menu-import respondem 401 sem autenticação, em vez de inexistência/404. A prova da senha no fluxo HTTP autenticado e uma chamada paga aos modelos reais não foram exercitadas nesta sessão; os contratos e recusas de senha são cobertos pelos testes existentes. Não apresentar essa verificação como teste completo com uma conta de operador no navegador.

## O que falta para a primeira operação

1. Cadastrar e publicar o cardápio real com preço de venda; revisar as fichas e os pré-preparos. Cadastrar compras e produção reais, sem saldos fictícios.
2. Conferir os usuários do atendimento/cozinha; o Administrador pode encerrar, ou cadastrar um usuário Caixa com senha própria.
3. Usar pagamento registrado no estabelecimento até existir gateway/PSP contratado e integrado.
4. WhatsApp está NOT_CONNECTED; PWA está desabilitado. Meta precisa de aplicativo, número e tokens/assinatura de webhook válidos. Pedidos próprios usam o token enviado por WhatsApp; não são um checkout público irrestrito.
5. iFood/99Food e emissão fiscal: exportações de cardápio disponíveis, porém não há conectores operacionais implementados. Contas, credenciais/homologação e desenvolvimento dos conectores são necessários. Não declarar essas integrações prontas.

## Fora do núcleo desta liberação

RH/folha/férias, área fiscal avançada, logística de entrega própria/otimização de rotas, executor transacional de IA e normalização geral de documentos. São próximas entregas; não devem travar a operação básica nem aparecer como recursos já implementados.
