# ADR-0001 — Separar Pop9 ERP e Pop9 Hub

- **Status:** aprovado (07/10/2026)
- **Contexto de leitura:** [diagnóstico](./diagnostico-separacao-erp-hub.md) · [estado do banco](./estado-do-banco-2026-10-07.md)

## Contexto

Este repositório é um único app (Vite + React + TypeScript, PWA na Vercel) sobre um único projeto Supabase. Ele concentra a operação do restaurante (ERP) e carrega conceitos do futuro Pop9 Hub (plataforma de integração e consolidação de dados para grupos de food service), embora **não exista código de Hub no `main`**.

## Decisão

Passam a existir dois produtos independentes:

| | **Pop9 ERP** | **Pop9 Hub** |
|---|---|---|
| Propósito | Operação diária do restaurante/bar | Integração, consolidação e inteligência entre sistemas e unidades |
| Repositório | **Este repositório** (`sovive89/pop9`, futuramente renomeado `pop9-erp`) | Repositório novo e independente (`pop9-hub`) |
| Supabase | Projeto atual (`pop9`) | **Projeto próprio** |
| Deploy, variáveis, secrets, migrations | Próprios | Próprios |

**Regras fundamentais**
1. O ERP funciona completamente sem o Hub. O Hub funciona sem depender do ERP.
2. Quando um cliente usa os dois, o ERP é **mais um sistema/fonte conectável** do Hub, via contratos de integração explícitos.
3. O Hub **nunca** acessa o banco do ERP, nem importa tipos, tabelas ou código do ERP. Não há monorepo.
4. Nenhum segredo é compartilhado entre os dois produtos.
5. Código compartilhado só poderá existir depois, como pacote versionado; nenhum produto depende da execução do outro.

## Critérios aprovados

1. **Integrações classificadas por capacidade/finalidade, não por fornecedor.** POS do tipo `IMPORT` (Saipos, Consumer, Linx, Colibri, Everest, Sischef etc.) pertencem ao **Hub** quando usados como fonte de ingestão/consolidação. Se uma integração específica for necessária para executar uma função operacional do ERP, essa capacidade pode permanecer no ERP.
2. **Repositório atual = `pop9-erp`; `pop9-hub` nasce independente.** Sem monorepo.
3. **Supabase do Hub é próprio e independente**, com deploy, variáveis, secrets e migrations próprios. Sem acesso direto ao banco do ERP.
4. **`customers`, `source` e `external_id` ficam no ERP por enquanto.** Não são removidos nem migrados. **Eles NÃO representam o modelo canônico definitivo do Pop9.** Marcador de código/documentação: `TODO: POP9_CANONICAL_MODEL`.
5. **`.env` sai do versionamento**, entra no `.gitignore`, e fica só o `.env.example` sem valores reais. *(Executado na etapa 7 do plano, não agora.)*
6. **Nada de camadas futuras agora:** não estruturar canonical, MDM, analytics, insights, predictions, Event Bus, Data Lake, RAG etc. O Hub nasce **mínimo e limpo**; essas camadas serão definidas depois, num projeto arquitetural próprio.

## O que o ERP mantém

Tudo o que já existe (ver tabela de módulos no diagnóstico), incluindo integrações operacionais (delivery, pagamentos, fiscal, comunicação, hardware, contabilidade), AI Studio do ERP (geração/edição de imagem e texto ligados ao cardápio) e dashboards/relatórios operacionais de uma unidade.

## O que fica de fora desta decisão

- Escolha de API, eventos, webhooks ou CDC para a comunicação ERP→Hub. **Não decidido.** Apenas evitar dependência direta entre bancos.
- Modelo canônico, MDM, Event Bus e demais camadas (item 6).
- Renomear o repositório/deploy (só ao final).

## Plano (resumo)

Etapas 0–8 estão no diagnóstico (seção H). **Etapas 0 e 1** (baseline + documentação) estão concluídas neste PR. As demais só avançam com autorização explícita.

## Consequências

- Positivas: fronteiras claras, deploys independentes, Hub sem herdar o schema do ERP.
- Custos: dois repositórios e dois bancos para operar; contratos ERP→Hub precisarão ser desenhados depois.
- Riscos conhecidos: ver diagnóstico, seção E (testes fracos, estado do banco, arquivos grandes de tela).
