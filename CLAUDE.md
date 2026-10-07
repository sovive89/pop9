# Pop9 — contexto para o Claude Code

> **Atualizado em 07/10/2026 (etapa 1 da separação ERP/Hub).** Este repositório é o **Pop9 ERP**. A diretriz mais recente e vinculante é o [ADR-0001](docs/arquitetura/ADR-0001-separacao-erp-hub.md); o diagnóstico está em [docs/arquitetura/](docs/arquitetura/). Onde este arquivo divergir do ADR, vale o ADR.

Este arquivo existe para dar continuidade ao trabalho que vinha sendo feito no Cowork (sessão na nuvem), agora que o usuário quer seguir direto pelo Claude Code local — principalmente porque o Cowork não tem credencial de push para `sovive89/pop9` e o Claude Code, rodando aqui, tem acesso direto ao git e ao disco.

## O que é o Pop9

Plataforma de inteligência operacional para redes de food service no Brasil. A tese: não competir como "mais um PDV", e sim ser a camada acima dos PDVs/apps de delivery — um modelo universal de dados de restaurante que traduz o que cada sistema externo entrega (iFood, Saipos, WhatsApp, planilha) para uma linguagem única (o "Pipeline"/núcleo Pop9), e só depois aplica inteligência em cima disso.

Resumo completo (contexto de produto, concorrência, módulo de estoque) está no Project do Claude.ai associado a esta conta ("Pop9" → doc `claude/resumo-pop9.md`). Se o Claude Code tiver acesso a esse Project, vale ler; se não tiver, este arquivo cobre o essencial para continuar o trabalho técnico atual.

Há também `docs/pop9-documentacao-estrategica.md` — consolidação de uma sessão de planejamento estratégico (03/09/2026) com uma visão mais ampla de produto/arquitetura (Event Engine, Routing Engine, Timer & SLA Engine, modelo canônico expandido, roadmap em Fases 1-8, estratégia comercial). **É complementar, não substitui** a diretiva abaixo — use como contexto de visão de longo prazo, não como a ordem de trabalho atual.

## Diretiva arquitetural em vigor

Dois produtos independentes (detalhes e critérios no [ADR-0001](docs/arquitetura/ADR-0001-separacao-erp-hub.md)):

- **Pop9 ERP** — este repositório. Opera o restaurante e funciona sem o Hub.
- **Pop9 Hub** — repositório, Supabase, deploy e segredos próprios (ainda não criado). Trata o ERP como mais uma fonte; **nunca** acessa o banco do ERP.

Regras que valem para qualquer trabalho aqui:
- **Não crie tabelas ou módulos antes de entender o que já existe.** Inspecione o schema real / código real antes de propor mudança.
- **Não apague funcionalidades existentes**, nem altere regras de negócio ou faça redesign de UI sem pedido explícito.
- **Se encontrar estruturas conflitantes ou duplicadas, documente antes de modificar.**
- **Não implemente modelo canônico, MDM, Event Bus, analytics, insights, predictions** nem outras camadas futuras. Serão definidas depois, num projeto arquitetural próprio. Onde precisar de um contrato temporário, marque `TODO: POP9_CANONICAL_MODEL`.
- **`customers`, `source` e `external_id` ficam no ERP por enquanto e NÃO são o modelo canônico definitivo** do Pop9. Não remova nem migre sem decisão nova.
- Classifique integrações **por capacidade/finalidade**, não por fornecedor: o que executa função operacional do restaurante fica no ERP; fonte de ingestão/consolidação (ex.: POS do tipo `IMPORT`) pertence ao Hub.
- Tabelas únicas (`orders`, não `ifood_orders`); `source` + `external_id` dizem de onde veio um registro, e `external_id` nunca é chave estrangeira interna.
- Não mova segredos nem variáveis de ambiente entre produtos.
- Etapas da separação avançam **uma por vez, com autorização**: etapas 0 e 1 concluídas (baseline e documentação); as seguintes aguardam aprovação.

Histórico (substituído): a ordem antiga "Pipeline Core → Modelo Canônico → Banco → Data Hub → Normalizador → Connectors → IA" foi interrompida pela decisão acima. O documento `docs/pop9-documentacao-estrategica.md` continua como visão de longo prazo, não como ordem de trabalho.

## Modelo canônico (rascunho, não definitivo)

Foram feitas migrations aditivas no banco do ERP (`customers`, campos de dinheiro em `orders`, `source`/`external_id`, `payments.order_id`/`status`, FK de `menu_items.category`). São resíduo da fase anterior e **não** representam o modelo canônico definitivo. O doc condensado `claude/pop9-canonical-data-model.md` (Project do Claude.ai) é material de apoio, não especificação.

## Módulo "Conexões" (já em produção neste repo, passo separado/paralelo)

Galeria de integrações do admin (`src/pages/Admin.tsx` → aba "Conexões" → `ConnectionsTab.tsx`), com:
- Catálogo declarativo em `src/components/admin/connections/catalog.ts`, cada integração com `type` (OPERATIONAL/IMPORT/SUPPORT) e `capabilities` (READ/WRITE/WEBHOOK/SYNC/IMPORT, cada um YES/NO/API_DEPENDENT).
- Logo real de cada marca em `IntegrationLogo.tsx` (vetor via `simple-icons` → favicon do domínio oficial → monograma como último recurso).
- Tabela `integrations` (migration `supabase/migrations/20260902120000_integrations.sql`; em 07/10/2026 ainda **não existe** no banco de produção — o código funciona sem ela, mostrando tudo como "não conectado").
- Pela decisão da separação, a galeria será dividida por capacidade/finalidade (etapa 4, ainda não feita).

Isso está pronto e funcionando; qualquer migration nova deve conviver com essa tabela sem conflito.

## Estado do código e do banco

- O código de "Data Hub" antigo (`src/lib/datahub/*`, migration `20260902160000_data_hub.sql`) **não existe mais no `main`**. Se aparecer em outro branch, trate como descartado.
- A migration `20261007090000_joined_tables.sql` está **neutralizada** (só um comentário): a união de mesas é só visual, via `dining_tables.group_id` (migration `20261007040000`).
- Estado real do banco de produção e como atualizá-lo: [docs/arquitetura/estado-do-banco-2026-10-07.md](docs/arquitetura/estado-do-banco-2026-10-07.md).
- Qualidade hoje: build OK; `npm test` passa; `tsc` tem erros antigos (arquivos `useSessionStore`, `useTableZones`, `CRMTab`, `ActiveOrdersPanel`); lint com 37 erros (não bloqueante no CI).
