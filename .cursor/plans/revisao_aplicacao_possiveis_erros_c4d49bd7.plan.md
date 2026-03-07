---
name: Revisao aplicacao possiveis erros
overview: Plano de revisao da aplicacao identificando possiveis erros de runtime, configuracao, seguranca e codigo morto, com acoes recomendadas.
todos: []
isProject: false
---

# Revisao da aplicacao e possiveis erros

## Resumo da revisao

Foram verificados: linter, uso de Lucide/Icon, fluxos de autenticacao, rotas, Supabase client, env vars, Kitchen (incl. codigo morto), Admin/Reports, recuperacao de senha e CSS. Nao ha erros de linter no `src`. Abaixo estao os pontos que podem causar falhas ou comportamentos indesejados.

---

## 1. Variaveis de ambiente (Supabase)

**Arquivo:** [src/integrations/supabase/client.ts](src/integrations/supabase/client.ts)

**Problema:** O cliente Supabase e criado com `import.meta.env.VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` sem validacao. Se `.env` nao existir ou as chaves estiverem vazias, `createClient(undefined, undefined, ...)` pode gerar erros em tempo de execucao (auth, chamadas à API).

**Acao recomendada:** Validar as duas variaveis antes de chamar `createClient` (ex.: checar `typeof x === "string" && x.length > 0`) e, em dev, exibir um aviso claro no console ou em tela se estiverem faltando; em build de producao, falhar cedo ou exibir mensagem amigavel.

---

## 2. Codigo morto e login por CPF na Cozinha

**Arquivo:** [src/pages/Kitchen.tsx](src/pages/Kitchen.tsx)

**Problemas:**

- O componente **KitchenLogin** (linhas ~162-255) implementa login por **CPF** (`email = digits@burgerhouse.sys`) e **nao e usado**: a rota `/cozinha` e servida por `KitchenPage`, que usa `useAuth()` e redireciona para `/login` se nao houver usuario. Ou seja, o formulario de CPF na cozinha e codigo morto e pode confundir manutencao (e o restante do app ja e por email).
- Na funcao **handleActionConfirm** (por volta da linha 549) a senha de acao (cancelar/pausar/etc.) e comparada com a constante **"123456"** em texto puro. Isso e um risco de seguranca se a tela for acessivel em producao.

**Acoes recomendadas:**

- Remover o componente `KitchenLogin` e as funcoes/constantes usadas apenas por ele (`formatCpf`, `handleLogin` e estado interno), ou documentar que e legado e nao utilizado; o fluxo oficial deve ser: nao logado -> redirecionar para `/login` (com `state.from = "/cozinha"`).
- Substituir a senha fixa "123456" por verificacao contra a senha do usuario logado (por exemplo `supabase.auth.signInWithPassword({ email: user.email, password: actionPassword })`) ou por outro mecanismo seguro definido pelo produto.

---

## 3. Admin: redefinicao de senha por CPF

**Arquivos:** [src/components/admin/ResetPasswordTab.tsx](src/components/admin/ResetPasswordTab.tsx), [src/hooks/useAdminData.ts](src/hooks/useAdminData.ts)

**Problema:** O Admin chama `resetPassword(selectedUser.cpf, newPassword)`. A Edge Function `reset-password` espera CPF e monta `email = cpf@burgerhouse.sys`. Se no futuro os usuarios forem criados apenas por **email** (sem CPF em `profiles`), esse fluxo deixa de funcionar para esses usuarios.

**Acao recomendada:** Alinhar com o plano de backend: fazer a Edge Function aceitar `user_id` (ou email) alem de CPF, e no front enviar `user_id` (ou email) do usuario selecionado em vez de depender apenas de CPF.

---

## 4. Tratamento de erros em chamadas assincronas

**Arquivos:** [src/pages/Kitchen.tsx](src/pages/Kitchen.tsx) (e eventualmente outros)

**Problema:** Existem chamadas como `supabase.functions.invoke("push-notify", { ... }).catch(console.error)`. O erro so vai para o console; o usuario nao e informado. Se a Edge Function falhar (rede, config), a acao pode parecer “sucesso” na UI.

**Acao recomendada:** Em pontos criticos (ex.: notificacao de “pedido pronto”), alem de `.catch(console.error)`, exibir um toast de aviso (ex.: “Notificacao nao enviada”) ou tratar o retorno da funcao e informar o usuario quando fizer sentido.

---

## 5. Fluxo de recuperacao de senha (email)

**Arquivos:** [src/pages/Login.tsx](src/pages/Login.tsx), [src/pages/AuthCallback.tsx](src/pages/AuthCallback.tsx), [src/pages/RecuperarSenha.tsx](src/pages/RecuperarSenha.tsx), [src/App.tsx](src/App.tsx)

**Estado atual:** O fluxo esta coerente: “Esqueci a senha” envia email com link; o link leva a `/auth/callback` (hash com `type=recovery`); o AuthCallback redireciona para `/recuperar-senha`; RecuperarSenha usa a sessao e `updateUser({ password })`. Nao foi encontrado erro logico nesse fluxo.

**Recomendacao:** Em ambiente de producao, testar com email real (incl. link de recuperacao) para garantir que o redirect e a troca de senha funcionam em todos os navegadores usados.

---

## 6. Rotas e autenticacao

**Arquivos:** [src/App.tsx](src/App.tsx), Index, Kitchen, Admin, Reports

**Estado atual:**

- Rotas protegidas (Index, Kitchen, Admin, Reports) usam `useAuth()` e redirecionam para `/login` quando nao ha usuario.
- `/esqueci-senha` renderiza o mesmo componente `Login` com view “forgot”; `/recuperar-senha` e a pagina de definir nova senha apos o link.
- Nao ha conflito de rotas nem protecao faltando nas paginas principais.

Nenhuma correcao obrigatoria identificada; apenas garantir que, apos login, o redirect use `location.state?.from` quando existir (ex.: voltar para `/cozinha`).

---

## 7. Lucide-react e pagina Cozinha

**Estado atual:** Em [src/pages/Kitchen.tsx](src/pages/Kitchen.tsx) nao ha import de `lucide-react` nem uso de componente `Icon` que possa gerar o erro “is not a constructor”. Outros arquivos usam `lucide-react` de forma direta (componentes nomeados). Nao ha indicacao de outro ponto com o mesmo padrao que quebrou no passado.

**Recomendacao:** Manter a Cozinha sem esse padrao; ao adicionar novos icones, usar os componentes nomeados do `lucide-react` (ex.: `Flame`, `ChefHat`) e nao um wrapper generico que receba string e chame `createElement` com resultado de forwardRef.

---

## 8. CSS e ordem de @import

**Arquivo:** [src/index.css](src/index.css)

**Estado atual:** A ordem e `@import url(...)` primeiro, depois `@tailwind base/components/utilities`. Isso e a ordem correta para evitar o aviso “@import must precede all other statements”.

**Recomendacao:** Se o aviso do Vite continuar a aparecer, verificar se ha outro CSS (por exemplo de biblioteca ou de um componente) que importa algo apos `@tailwind` ou `@layer`, e mover esse import para o topo ou para um arquivo que seja importado antes do Tailwind.

---

## 9. Resumo de prioridade


| Prioridade | Item                                            | Risco                                         |
| ---------- | ----------------------------------------------- | --------------------------------------------- |
| Alta       | Env Supabase (URL/Key) sem validacao            | App quebra ou auth falha em deploy sem .env   |
| Alta       | Senha fixa "123456" em acoes da Cozinha         | Seguranca                                     |
| Media      | Remover ou documentar KitchenLogin (CPF)        | Confusao e desalinhamento com login por email |
| Media      | Admin reset por user_id/email (backend + front) | Reset de senha quebra para usuarios sem CPF   |
| Baixa      | Tratamento de erro em push-notify e similares   | Usuario nao sabe quando notificacao falha     |
| Baixa      | Testar recuperacao de senha em producao         | Garantir que o fluxo funciona com email real  |


Nenhum erro de linter foi encontrado no `src`. Os itens acima sao melhorias e prevencoes de falhas em runtime ou em producao.