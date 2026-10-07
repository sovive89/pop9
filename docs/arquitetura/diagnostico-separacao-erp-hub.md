# Pop9 — Diagnóstico para separar ERP e Hub (07/10/2026)

> **Status:** aprovado em 07/10/2026 **com critérios**. As decisões finais estão em
> [ADR-0001](./ADR-0001-separacao-erp-hub.md); onde este diagnóstico "recomenda" ou
> "pergunta", vale o ADR. Duas correções feitas depois da escrita: (1) o banco **tem**
> histórico de migrations (tabela do Supabase), mas ele está incompleto — ver
> [estado do banco](./estado-do-banco-2026-10-07.md); (2) o lint tem 37 erros hoje (o CI cita 34).


**Escopo:** só diagnóstico. Nenhum código foi alterado.
**Base analisada:** `sovive89/pop9`, branch `main` (inclui o merge do PR #17), clone raso de leitura.
**Não verificado:** não rodei o app nem os testes; não li linha a linha `Kitchen.tsx`, `CloseAccountPanel.tsx`, `StockTab.tsx`, `useStockData.ts` nem `docs/DADOS_COLETADOS_APLICACAO.md` (só cabeçalhos e consultas ao banco). Onde afirmo "não existe", é resultado de busca por palavra-chave no código.

---

## Resumo em 8 linhas

1. Hoje o repositório é **um único app** (Vite + React + TS, PWA na Vercel) sobre **um único projeto Supabase**. ~17,5 mil linhas em `src` (49 arquivos são componentes shadcn) e 7 Edge Functions.
2. **Não existe código de Hub no repositório.** O código de "Data Hub" antigo (`src/lib/datahub/*`, migration `20260902160000_data_hub.sql`) não está mais no `main`. O `CLAUDE.md` ainda cita esses arquivos, então está desatualizado.
3. O que existe de "Hub" são **resíduos conceituais**: o catálogo de Conexões com POS do tipo `IMPORT` (Saipos, Consumer, Linx, Colibri, Everest, Sischef), as colunas `source`/`external_id` e a tabela `customers` (migrations "canonical step 1–5") e o documento estratégico.
4. **Não há nenhum dashboard cross-sistema hoje.** Relatórios e KDS são todos de uma unidade. Também não encontrei insights nem predições.
5. O acoplamento mais perigoso para a separação é **dado**: componentes consultam o Supabase direto (`supabase.from(...)` em ~30 tabelas), sem camada de acesso. Não há "contrato" ERP→Hub.
6. O banco compartilha infraestrutura com resíduo de outro app (Fastbar, movido para o schema `fastbar`) e parte das migrations é aplicada à mão, fora do histórico do Supabase.
7. A rede de segurança de testes é fraca: 2 arquivos de teste, lint com 34 erros conhecidos (não bloqueante no CI).
8. O trabalho real da separação é **criar fronteiras no ERP** (AI Studio, integrações, contratos de exportação) e **criar o `pop9-hub` vazio**, não mover código existente.

---

## A. Mapa da arquitetura atual

```
Navegador (PWA, Vercel: pop9-lv5p.vercel.app)
 └─ React SPA (rotas: / , /login , /cozinha , /admin , /relatorios , /m , /m/t/:token , /auth/callback , /recuperar-senha)
      └─ @supabase/supabase-js (chave pública VITE_SUPABASE_*)
           └─ Projeto Supabase "pop9" (us-west-2)
                ├─ Postgres: schema public (~41 tabelas tipadas) + schema fastbar (resíduo)
                ├─ Auth + RLS (has_role admin/attendant/kitchen)
                ├─ RPCs: has_role, join_tables, split_table_group (+ funções de estoque/produção)
                └─ Edge Functions (7): customer-checkin, generate-menu-image, generate-vapid-keys,
                   manage-user, push-notify, reset-password, whatsapp-webhook
Externos: Vercel AI Gateway (imagens), Meta WhatsApp Cloud API, Web Push (VAPID)
```

Observações:
- **Uma única unidade ativa:** `useCurrentBusinessUnit` pega a primeira `business_units` ativa. O banco já é multi-unidade (`business_unit_id` NOT NULL), mas o app ainda não tem seletor.
- **Sem camada de dados:** hooks e componentes chamam o Supabase diretamente.
- **Edge Functions sem `verify_jwt` declarado** em `config.toml` (não verifiquei a configuração efetiva no painel).

---

## B. Inventário dos módulos

| Módulo | Onde está | Tamanho / observação |
|---|---|---|
| Autenticação e papéis | `Login`, `AuthCallback`, `RecuperarSenha`, `useAuth`, funções `manage-user`, `reset-password`, tabelas `profiles`, `user_roles` | |
| Mesas, áreas, união visual, QR | `TableMap` (776), `useTables` (345), `QrCodesTab`, tabelas `dining_tables`, `table_areas`, `table_qr_codes` | `useTableCount`/`useTableZones` são legado/fallback |
| Sessões, participantes, comandas | `useSessionStore` (487), `sessionQueries`, `TableSessionPanel` (658), `ClientOrderPanel` (802), tabelas `sessions`, `session_clients` | `services/sessionCloseRule.ts` e `pages/ResetPassword.tsx` estão **vazios (0 linhas)** |
| Pedidos, itens, pagamentos, fechamento | `ActiveOrdersPanel`, `CloseAccountPanel` (997), `ServiceChargeToggle`, `ReceiptPreviewModal`, `utils/orders` | |
| Cardápio, categorias, variantes, adicionais | `MenuTab` (642), `useAdminData`, `useMenuItems`, `data/menu.ts` | `data/menu.ts` (209) parece cardápio estático: confirmar uso |
| Ficha técnica e estoque | `RecipeBuilder`, `StockTab` (875), `useStockData` (615), tabelas `raw_materials`, `lotes`, `stock_movements`, `suppliers`, `recipe_items`, `low_stock_alerts` | |
| Produção e etiquetas | tabelas `production_recipes`, `production_batches`, `production_labels` etc., `utils/thermal-print` | |
| KDS / cozinha | `pages/Kitchen` (1050), `push-notify`, `usePushNotifications` | |
| Impressoras | `PrintersTab`, `usePrinterConfigs`, `thermal-print` | |
| Relatórios | `pages/Reports` (675) | só `orders` e `payments`, por período |
| CRM / check-in do cliente | `CRMTab`, `pages/CustomerCheckin`, função `customer-checkin`, tabelas `customers`, `checkin_verifications` | |
| Conexões (galeria de integrações) | `components/admin/connections/*`, `useIntegrations`, tabela `integrations`, `whatsapp-webhook` | catálogo com ~38 integrações; **só WhatsApp é real**, o resto cai no provider genérico (rascunho de configuração) |
| IA | `MenuTab` → função `generate-menu-image` (Vercel AI Gateway) | lista de modelos fixa dentro da função |
| Unidades | `BusinessUnitsTab`, `useAdminData`, tabelas `businesses`, `business_units` | |
| Infra | `.github/workflows/ci.yml`, `vite.config.ts` (PWA), `vercel.json`, `supabase/config.toml` | PWA ainda se chama "TableMate" |

---

## C. Classificação ERP / HUB / SHARED

### Módulos
- **ERP:** todos os módulos da tabela B, incluindo CRM/check-in, Conexões do tipo `OPERATIONAL`, WhatsApp, impressoras e geração de imagem.
- **HUB:** **nenhum código atual.** Candidatos conceituais: POS do tipo `IMPORT` do catálogo (ver decisão 1), documentação estratégica (seções de Data Hub/Normalização/Eventos).
- **SHARED (técnico/visual, sem regra de negócio):** `components/ui/*` (shadcn), `lib/utils`, `hooks/use-toast`, `use-mobile`, tema Tailwind, cliente Supabase.

### Dashboards, relatórios, insights, predições

| Item | Classificação | Motivo |
|---|---|---|
| Relatórios: KPIs, mapa de calor por hora, pagamentos por método, detalhamento por item | **ERP_OPERATIONAL** | uma unidade, dados do próprio ERP |
| KDS e fila da cozinha | **ERP_OPERATIONAL** | operação em tempo real |
| Alertas de estoque baixo (`low_stock_alerts`) | **ERP_OPERATIONAL** | |
| Gráficos (Recharts) usados em Reports | **SHARED** (hoje inline na página) | só viram compartilhados se um dia o Hub precisar |
| Comparação entre unidades/marcas/canais, consolidação, divergências, benchmarking, previsão, anomalias | **HUB_CROSS_SYSTEM** | **não existem hoje**; nada a migrar |
| Insights / predições | — | **não encontrei nenhum** no código |

---

## D. Dependências entre eles

Dependências ERP→Hub no código: **nenhuma** (não há imports de datahub; busca por `datahub`/`canonical` em `src` e `supabase` retorna só o documento estratégico).

Dependências conceituais a tratar:
- Colunas `source`/`external_id` em `customers`, `orders`, `payments`, `menu_items` e a tabela `customers` (migrations canônicas 1–5) estão **dentro do banco do ERP**. São aditivas e inofensivas, mas dão a impressão de que "o schema do ERP é o modelo canônico", o que você pediu para não assumir.
- O catálogo de Conexões mistura integrações do ERP (delivery, pagamento, WhatsApp) com fontes de dados que alimentariam o Hub (POS `IMPORT`) numa mesma galeria e numa mesma tabela `integrations`.
- Documentação (`CLAUDE.md`, `docs/pop9-documentacao-estrategica.md`) descreve o produto como "camada acima dos PDVs", ou seja, a visão do Hub, dentro do repositório do ERP.

Dependências internas do ERP que importam para as fronteiras:
- Componentes → Supabase direto (sem repositório/serviço).
- `MenuTab` → Edge Function `generate-menu-image` (acoplada a um gateway; modelos fixos).
- Conexões → `integrations` + `whatsapp-webhook`.

---

## E. Riscos da separação

| # | Risco | Impacto | Mitigação |
|---|---|---|---|
| 1 | **Produção está atrás do `main` no banco:** as migrations de mesas (`20261007040000`) ainda não foram aplicadas no Supabase; o app cai no modo legado ao não achar `seats`/`group_id` | Mapa sem edição/união até aplicar | Aplicar antes de qualquer refatoração; é a etapa 0 do plano |
| 2 | Parte das migrations é aplicada à mão e fica fora do histórico do Supabase | O histórico não reflete o estado real do banco | Etapa 0: registrar o estado real (feito) e passar a versionar |
| 3 | Pouca cobertura de teste (2 arquivos) + lint com 34 erros | "Testar a cada etapa" fica fraco | Adicionar testes de caracterização/smoke antes de mover código |
| 4 | Arquivos grandes (Kitchen 1050, CloseAccountPanel 997, StockTab 875) com acesso direto ao banco | Mover/isolar quebra fácil | Não mexer neles nesta fase; só criar fronteiras em volta |
| 5 | Mesmo projeto Supabase hospedou o Fastbar | Risco de misturar dados do ERP com o Hub/Fastbar | Hub nasce em **projeto Supabase próprio**; schema `fastbar` fica fora do escopo |
| 6 | `.env` versionado no git (só `VITE_SUPABASE_URL` e a chave pública anon) | Baixo, mas é mau hábito e confunde a separação de variáveis | Remover do git e manter só `.env.example` (decisão sua) |
| 7 | Segredos das Edge Functions (service role, WhatsApp, VAPID, AI Gateway) | Vazar entre produtos ao copiar config | Segredos por projeto Supabase; nada copiado para o Hub |
| 8 | Renomear repo/deploy | Quebra URL, integrações e CI | Não renomear até o fim; criar o Hub como projeto novo |
| 9 | Tipos gerados (`types.ts`, 1931 linhas) misturam tudo | Hub não pode importar isso | Hub nunca importa tipos do ERP |
| 10 | Divergência de tipos já tolerada (`app_config`, `table_zones` fora de `types.ts`) | Surpresas ao tipar contratos | Documentar antes de qualquer contrato |

---

## F. O que será movido (ou criado)

Hoje **não há código a mover para o Hub**. A separação é feita por criação e reorganização interna:

**Criar no ERP (fronteiras, sem mudar comportamento):**
- `src/ai-studio/` com `AIProvider`, `TextGenerationProvider`, `ImageGenerationProvider`, `ImageEditingProvider`. A Edge Function `generate-menu-image` passa a usar o provider (mesmo contrato HTTP; mesma lista de modelos).
- `src/erp-integrations/` (ou nome equivalente): mover `components/admin/connections/{providers,catalog,types}` e `useIntegrations` para uma camada de integrations/providers/adapters, com a UI (`ConnectionsTab`, cards, modal) continuando em `components/admin`.
- `src/erp-contracts/` com **tipos temporários** de exportação (pedido, pagamento, produto etc.) marcados `TODO: POP9_CANONICAL_MODEL`. Sem API, sem eventos.

**Criar `pop9-hub` (repositório novo e vazio):** pastas `connectors`, `ingestion`, `raw`, `jobs`, `webhooks`, `polling`, `connector-config`, `credentials`, `observability`, `audit`, `retries`, `dlq`, mais marcadores `canonical/`, `mdm/`, `analytics/`, `insights/`, `predictions/` apenas com README. Projeto Supabase e projeto Vercel próprios, `.env.example` próprio.

**Copiar para o Hub (com decisão sua):** `docs/pop9-documentacao-estrategica.md` e a parte do `CLAUDE.md` sobre Pipeline/Data Hub.

---

## G. O que permanece no ERP

Tudo que está na tabela B, mais: banco `public` inteiro (incluindo `source`/`external_id`/`customers`, mantidos e marcados `TODO: POP9_CANONICAL_MODEL`), Edge Functions atuais, PWA, CI, componentes `ui/*`. Nada é removido.

Itens a decidir separadamente (não removo sem você pedir): pasta `referencia-antiga-NAO-RODAR`, arquivos vazios `sessionCloseRule.ts` e `ResetPassword.tsx`, `data/menu.ts` se não for usado, `.cursor/plans`, `.lovable/plan.md`.

---

## H. Plano incremental (cada etapa = PR pequeno, reversível, com build + testes)

| Etapa | O que | Verificação |
|---|---|---|
| 0 | **Baseline:** aplicar as migrations de mesas pendentes no Supabase; registrar o estado real do banco; adicionar testes de fumaça (build, `tsc`, os 2 testes atuais + testes de caracterização das regras de sessão/pagamento) | CI verde; mapa com edição/união funcionando em produção |
| 1 | **Documentar:** este diagnóstico, ADR da separação, correção do `CLAUDE.md` desatualizado | revisão sua |
| 2 | **Fronteiras por lint (sem mover arquivos):** regras `no-restricted-imports` para impedir `ai-studio`/`erp-integrations` dependerem de páginas e impedir qualquer import de código Hub | lint |
| 3 | **AI Studio:** extrair provider de imagem na Edge Function, mantendo modelos e resposta; depois texto (descrição de produto) só se já existir | gerar uma foto de teste igual a antes |
| 4 | **Camada de integrações:** reorganizar `connections/*` mantendo a UI idêntica; separar o catálogo conforme a decisão 1 | tela Conexões idêntica; WhatsApp continua verificando webhook |
| 5 | **Contratos ERP→Hub (só tipos):** `erp-contracts` marcado `TODO: POP9_CANONICAL_MODEL`; ERP não expõe nada ainda | `tsc` |
| 6 | **Criar `pop9-hub`:** repo, README com a regra "não depende do ERP", pastas, `.env.example`, projeto Supabase/Vercel próprios | deploy vazio no ar |
| 7 | **Higiene:** remover `.env` do git, limpar docs de Hub do repo do ERP (após copiar), decidir os itens "a decidir" da seção G | CI |
| 8 | **(Depois, só se necessário)** `packages/` compartilhados e renomear `pop9` → `pop9-erp` | deploy de pré-visualização |

Regra nas etapas 2–5: **nenhum arquivo grande de tela (Kitchen, CloseAccountPanel, StockTab) é tocado.**

---

## I. Estratégia para preservar o deploy atual

- `pop9-lv5p.vercel.app` continua apontando para este repositório e para o `main`, sem renomear nada até a etapa 8.
- Cada etapa entra por PR com **deploy de pré-visualização** da Vercel; só faz merge depois de abrir o preview e testar o fluxo de mesa → pedido → pagamento.
- Migrations: nada destrutivo. Cada uma aditiva e aplicada primeiro num ambiente de teste (branch do Supabase ou projeto de teste), depois em produção, registrando o que foi aplicado.
- O Hub nasce em **repositório, projeto Vercel e projeto Supabase novos**, sem compartilhar segredos nem banco com o ERP.
- Rollback: cada etapa é um commit/PR reversível (`git revert`); nenhuma etapa muda dados.

---

## Decisões que preciso de você antes da etapa 1 (não vou assumir)

1. **POS do tipo `IMPORT` (Saipos, Consumer, Linx, Colibri, Everest, Sischef) na galeria de Conexões:** continuam no ERP (como importação opcional) ou saem da galeria do ERP e passam a ser conectores do Hub? Minha recomendação: o ERP só mostra integrações que executam função operacional dele; os POS entram no Hub.
2. **Formato da separação:** (a) este repositório vira `pop9-erp` e o `pop9-hub` nasce novo (recomendado, é o menos arriscado), ou (b) monorepo temporário com `apps/erp` e `apps/hub`.
3. **Banco do Hub:** projeto Supabase novo e independente (recomendado) ou outro serviço?
4. **`customers` e `source`/`external_id` no banco do ERP:** manter como estão e só marcar `TODO: POP9_CANONICAL_MODEL` (recomendado), ou retirar quando o modelo canônico for definido?
5. **`.env` versionado:** posso removê-lo do git na etapa 7 (a chave é pública, mas o arquivo não deveria estar no repositório)?
