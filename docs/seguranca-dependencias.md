# Segurança de dependências: situação e decisões

Medido em 22/10/2026 com `npm audit` (46 alertas: 2 críticos, 34 altos, 8 moderados, 2 baixos).

## Decisão de hoje
- O CI roda `npm audit --omit=dev --audit-level=high` **sem bloquear** (`continue-on-error`). O objetivo é deixar o número visível em todo PR. Ele passa a bloquear quando a dívida abaixo for paga.
- Não rodar `npm audit fix --force` às cegas: sobe versões maiores (por exemplo `react-router`) e pode quebrar o app.
- O Dependabot (`.github/dependabot.yml`) abre PRs semanais agrupados de patch/minor.

## Críticos (2), só em ferramenta de teste
`vitest` e `tinypool` (dependências de desenvolvimento). O risco descrito exige o servidor de interface do Vitest exposto. Não entram no que vai para o usuário. Correção: atualizar o Vitest.

## Altos em dependências de produção (23, nenhum crítico)
Ferramentas de build e utilitários (`babel`, `braces`, `chokidar`, `glob`, `postcss`, `tailwindcss`, `serialize-javascript`, entre outros) e dois que rodam no navegador e merecem atenção primeiro: **`react-router` / `react-router-dom` / `@remix-run/router`**, e `nanoid`/`lodash`.

## Próximo passo sugerido
1. Atualizar `react-router-dom` num PR próprio, com o passeio nas rotas.
2. Atualizar o Vitest.
3. Reavaliar: se sobrar só ferramenta de build, tornar o passo do CI bloqueante para `critical` e manter `high` informativo.

Cada alerta alto ou crítico que ficar aceito precisa de uma linha aqui com o motivo e a data.
