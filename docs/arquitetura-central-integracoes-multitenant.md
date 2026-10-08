# Pop9 — Central de Integrações por tenant/unidade (especificação de implementação)

## Decisão
A aba **Admin → Conexões** já existe e será evoluída, não duplicada. Cada estabelecimento seleciona provedores independentes (iFood, 99Food, OpenAI, Gemini, Grok, WhatsApp, pagamentos etc.). Configurações, autorização e cobrança isoladas por unidade, com possibilidade futura de herança do tenant.

## Estado do código em 2026-10-08
- `ConnectionsTab.tsx` passa `businessUnitId=null` a todos os handlers.
- `useIntegrations.ts` encontra registros somente por `provider`, sem escopo de unidade.
- `providers/db.ts` consulta todos os registros e faz upsert com conflito em `provider`.
- `IntegrationConfigModal.tsx` informa que segredos devem ser configurados manualmente nos secrets do backend.
- `generate-menu-image` usa a variável global `AI_GATEWAY_API_KEY` do Supabase.

**Esses comportamentos não são multitenant seguros e não devem ser simplesmente expostos a vários clientes.**

## Experiência de configuração
1. Escolher unidade ativa (obrigatório).
2. Buscar e filtrar provedores por Delivery, IA, Comunicação, Pagamentos, Fiscal e Cardápio.
3. Abrir cartão do provedor → visualizar requisitos, escopos e tipo de autorização.
4. Para API key: inserir chave em campo mascarado de envio único; exibir apenas “credencial configurada” e opção substituir/revogar. Nunca recuperar o segredo para o browser.
5. Para OAuth: iniciar autorização no servidor, verificar state/PKCE quando aplicável e armazenar tokens e expiração no cofre.
6. Testar conexão com chamada real autorizada, mostrando estado: Não configurada, Conectada, Erro, Desativada.
7. Mostrar última sincronização, ações de desconectar e logs sem segredos.
8. Permitir nenhuma integração; recursos dependentes exibem instrução de ativação sem bloquear operação principal.

## Modelo de dados sugerido
- `integration_providers`: catálogo estático ou tabela de referência; slug, categoria, auth_type, capabilities.
- `integrations`: id, tenant_id, business_unit_id NOT NULL, provider, status, config JSONB **sem segredos**, credential_ref, connected_at, last_sync_at, error_code, created_at, updated_at. UNIQUE(business_unit_id, provider).
- `integration_credentials`: tabela privada inacessível via cliente, ou cofre gerenciado; id, business_unit_id, provider, ciphertext ou secret_ref, key_version, rotated_at. Não colocar credenciais em `integrations.config`.
- `integration_events`: unidade, provedor, operação, resultado, timestamp, duração, consumo/custo quando conhecido; sem payload sensível.
- Para integrações herdadas por tenant: registro separado de escopo `tenant` e regra explícita de precedência, nunca usar NULL como unidade global implícita.

## Segurança
- Determinar `business_unit_id` no servidor a partir do usuário autenticado e do vínculo autorizado; não confiar no ID enviado pelo cliente.
- Aplicar RLS por associação efetiva à unidade e permissão de administrador; operações sobre credenciais somente em função server-side autorizada.
- Criptografar segredos com chave mestra fora do banco, rotação, auditoria e controle de acesso mínimo.
- Evitar retornar tokens, segredos ou mensagens de erro de provedores contendo credenciais.
- OAuth: tokens renovados no servidor, callback e state vinculados à unidade e usuário iniciador.
- Rate limits, quotas, timeouts, idempotência e isolamento de webhooks por provedor/unidade.
- Conexão “ativa” somente após verificação; salvar configuração não implica conexão bem-sucedida.

## Migração em etapas
1. Auditar tabela atual `integrations`, RLS, providers, permissões e unidades existentes. Criar migração compatível, com backfill explícito de registros antigos; nunca atribuir automaticamente registros globais a um tenant.
2. Trocar o hook e o provider DB para consultas filtradas pela unidade ativa, inclusive get/upsert/disconnect; testar isolamento cruzado.
3. Criar serviço server-side para cadastrar/substituir/revogar credenciais e testar conexões; UI nunca recebe chave armazenada.
4. Adaptar geração de imagens para resolver o provedor e a credencial da unidade; oferecer opção Pop9-managed e BYOK separadas.
5. Adaptar iFood/99Food conforme credenciamento e APIs oficiais; não prometer ativação apenas com API key.
6. Adicionar testes de autorização multiunidade, webhook, renovação de token, falha de integração, custos e deploy de preview antes de produção.

## Critérios de aceite
- Bar A não visualiza, altera ou usa credenciais/conexões do Bar B, mesmo manipulando requests.
- Duas unidades podem usar o mesmo provedor com chaves diferentes.
- Trocar ou desativar um provedor não afeta os demais.
- Nenhuma credencial aparece no HTML, logs, resposta de API ou tabelas consultáveis pelo cliente.
- O painel diferencia “configuração salva”, “conexão testada” e “integração em desenvolvimento”.
- Operação principal do ERP funciona sem integrações externas.

**Escopo deste documento:** projeto técnico. Nenhuma migração, alteração de segredo ou ativação de conector é autorizada por esta especificação.
