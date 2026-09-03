# Pop9 — contexto para o Claude Code

Este arquivo existe para dar continuidade ao trabalho que vinha sendo feito no Cowork (sessão na nuvem), agora que o usuário quer seguir direto pelo Claude Code local — principalmente porque o Cowork não tem credencial de push para `sovive89/pop9` e o Claude Code, rodando aqui, tem acesso direto ao git e ao disco.

## O que é o Pop9

Plataforma de inteligência operacional para redes de food service no Brasil. A tese: não competir como "mais um PDV", e sim ser a camada acima dos PDVs/apps de delivery — um modelo universal de dados de restaurante que traduz o que cada sistema externo entrega (iFood, Saipos, WhatsApp, planilha) para uma linguagem única (o "Pipeline"/núcleo Pop9), e só depois aplica inteligência em cima disso.

Resumo completo (contexto de produto, concorrência, módulo de estoque) está no Project do Claude.ai associado a esta conta ("Pop9" → doc `claude/resumo-pop9.md`). Se o Claude Code tiver acesso a esse Project, vale ler; se não tiver, este arquivo cobre o essencial para continuar o trabalho técnico atual.

Há também `docs/pop9-documentacao-estrategica.md` — consolidação de uma sessão de planejamento estratégico (03/09/2026) com uma visão mais ampla de produto/arquitetura (Event Engine, Routing Engine, Timer & SLA Engine, modelo canônico expandido, roadmap em Fases 1-8, estratégia comercial). **É complementar, não substitui** a diretiva de execução abaixo (Passo 1-7) — use como contexto de visão de longo prazo, não como a ordem de trabalho atual.

## Diretiva arquitetural em vigor (a mais recente, e a que manda)

O usuário interrompeu um trabalho de "Data Hub" que estava sendo implementado antes da hora e definiu esta ordem obrigatória:

```
1. Pipeline Core
2. Modelo de Dados Canônico do Pop9   ← feito (ver abaixo)
3. Banco de Dados (alinhar o schema real ao modelo canônico)   ← PRÓXIMO PASSO, não iniciado
4. Data Hub
5. Normalizador
6. Connectors (integrações reais)
7. IA para exceções
```

Regras explícitas do usuário que continuam valendo para qualquer trabalho futuro nesta base:
- **Não crie tabelas ou módulos antes de entender o que já existe.** Sempre inspecionar o schema real / código real antes de propor mudança.
- **Não apague funcionalidades existentes.**
- **Se encontrar estruturas conflitantes ou duplicadas, documente antes de modificar** (não corrija silenciosamente).
- **Banco de dados usa tabelas únicas** (`orders`, não `ifood_orders`/`saipos_orders`), com colunas `source` + `external_id` para saber de onde veio um registro — nunca usar `external_id` como chave estrangeira interna.
- Princípio geral: **CONNECTOR conhece o sistema externo. NORMALIZER conhece o formato externo e o modelo Pop9. DATA HUB controla entrada e processamento. PIPELINE CORE conhece só o modelo Pop9. IA só ajuda em exceções.** Nenhuma regra de negócio deve morar dentro de um connector.
- Não implementar dezenas de integrações de uma vez — primeiro o Pop9 definir sua própria linguagem de dados (o modelo canônico), depois cada integração aprende a falar essa linguagem.

## O que já foi entregue (passos 1 e 2)

- **Diagrama de arquitetura do Pipeline** (10 camadas: fontes externas, connector layer, normalization engine, validation/dedup, canonical data model, event bus, pipeline core, cardápio, outbound/sync engine, capability matrix), publicado como artifact: `https://claude.ai/code/artifact/2892b269-ce91-4ca1-aefe-71fc43de44b5`.
- **POP9 Canonical Data Model** — documento com auditoria do schema real (8 achados, cada um com evidência de código), a regra de identidade (`id` interno / `source` / `external_id`), e o dicionário de dados completo das entidades `Customer` (nova), `Order`/`Payment`/`Product` (estendendo tabelas existentes). Publicado: `https://claude.ai/code/artifact/34cbefca-ccf5-4014-940c-97b1a1eff72f`. Versão condensada também salva no Project do Claude.ai em `claude/pop9-canonical-data-model.md`.

**Plano de execução do passo 3 (banco de dados), já desenhado mas não aplicado ainda** — migrations aditivas, uma por passo, nesta ordem:
1. Criar tabela `customers` e migrar dados de `session_clients` para ela (deduplicado por telefone).
2. Adicionar campos de dinheiro em `orders`: `subtotal`, `discount`, `delivery_fee`, `total`, `payment_status`.
3. Adicionar `source` + `external_id` nas quatro entidades: `customers`, `orders`, `payments`, `menu_items` (produtos).
4. Adicionar `payments.order_id` (nullable) + `payments.status`.
5. Adicionar FK real de `menu_items.category` para `menu_categories`.

Tudo aditivo — nenhuma coluna em uso deve ser removida. **Antes de mexer em `payments`**, verificar no banco real (não só no `types.ts`, que pode estar desatualizado) se as colunas `cash_received`/`change_given` batem com o que o código espera — isso ficou marcado como um achado de "possível drift" ainda não confirmado contra produção.

## Módulo "Conexões" (já em produção neste repo, passo separado/paralelo)

Galeria de integrações do admin (`src/pages/Admin.tsx` → aba "Conexões" → `ConnectionsTab.tsx`), com:
- Catálogo declarativo em `src/components/admin/connections/catalog.ts`, cada integração com `type` (OPERATIONAL/IMPORT/SUPPORT) e `capabilities` (READ/WRITE/WEBHOOK/SYNC/IMPORT, cada um YES/NO/API_DEPENDENT).
- Logo real de cada marca em `IntegrationLogo.tsx` (vetor via `simple-icons` → favicon do domínio oficial → monograma como último recurso).
- Tabela `integrations` (migration `supabase/migrations/20260902120000_integrations.sql`, ainda não aplicada em produção — o código funciona sem ela, mostrando tudo como "não conectado").

Isso está pronto e funcionando; não é o foco do próximo passo, mas qualquer migration nova do passo 3 deve conviver com essa tabela sem conflito.

## Trabalho descartado / precisa revisão (não usar como está)

Existe código de Data Hub escrito **antes** do modelo canônico ser definido, portanto desalinhado com ele — está commitado isoladamente (commit `fb399d4`, mensagem explica isso) mas não deve ser reaproveitado sem revisão:
- `supabase/migrations/20260902160000_data_hub.sql`
- `src/lib/datahub/canonical.ts`, `mappings.ts`, `normalize.ts`, `transforms.ts`

`transforms.ts` é o mais provável de sobreviver como está (é independente de modelo — só normaliza telefone/data/número). Os outros usam nomes de campo (`Order`, `Customer` etc.) que não batem mais com o dicionário de dados publicado no Canonical Data Model — precisam ser reescritos contra ele antes de qualquer Data Hub real ser construído.

## Estado do git

Branch atual: `feat/admin-sidebar-topbar`, com commits locais no clone do Cowork que **não estavam** neste repositório local até a entrega via bridge — confirme com `git log --oneline -10` e `git status` ao começar, e reconcilie se este working copy já tiver avançado por conta própria.
