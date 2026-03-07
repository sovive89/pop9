

# Correção de Segurança: RLS, Edge Function e Proteção de Senhas

## Resumo

O sistema tem 3 vulnerabilidades críticas que serão corrigidas:
1. **9 policies RLS permissivas** que permitem acesso sem autenticação
2. **Edge function de reset-password sem verificação** — qualquer pessoa pode trocar a senha de qualquer usuário sabendo apenas o CPF
3. **Sem proteção contra senhas vazadas** (leaked password protection)

---

## 1. Corrigir as 9 Policies RLS Permissivas

As seguintes tabelas têm policies com `USING (true)` ou `WITH CHECK (true)`, permitindo acesso até para requisições sem autenticação:

| Tabela | Policies afetadas |
|--------|------------------|
| `order_items` | SELECT, INSERT, UPDATE (3) |
| `orders` | SELECT, INSERT, UPDATE (3) |
| `session_clients` | SELECT, INSERT, UPDATE, DELETE (4 — mas DELETE já exige auth implicitamente) |

**Correção:** Substituir todas por policies que exigem autenticação e verificam se o usuário tem uma role válida no sistema (admin, attendant ou kitchen).

Novas policies usarão a função `has_role()` já existente:

```sql
-- Exemplo para order_items SELECT:
DROP POLICY "Staff can read order_items" ON order_items;
CREATE POLICY "Staff can read order_items" ON order_items
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin') OR
    has_role(auth.uid(), 'attendant') OR
    has_role(auth.uid(), 'kitchen')
  );
```

O mesmo padrão será aplicado para INSERT e UPDATE em `order_items`, `orders` e `session_clients`. A policy de DELETE em `session_clients` também será corrigida.

Para `sessions`, a policy de INSERT já usa `auth.uid() = created_by`, mas SELECT e UPDATE usam `true` e também serão corrigidas (total: 11 policies reescritas).

---

## 2. Proteger a Edge Function `reset-password`

**Problema atual:** Qualquer pessoa pode chamar a função com um CPF válido e trocar a senha sem nenhuma verificação de identidade. Isso é uma vulnerabilidade crítica.

**Correção:** A recuperação de senha passará a ser **restrita a administradores**. Apenas um admin autenticado poderá redefinir a senha de outro usuário.

Alterações:
- **Edge function:** Exigir token JWT válido no header `Authorization`, validar com `getClaims()`, e verificar se o usuário tem role `admin` no banco
- **Frontend (Login.tsx):** Remover o fluxo de "Esqueceu a senha?" da tela de login pública — esse recurso ficará disponível apenas no painel administrativo (futuro)

Alternativa mais simples: se preferir manter o reset público, seria necessário implementar um segundo fator de verificação (ex: código por SMS/WhatsApp). Como o sistema não usa e-mail real, a abordagem de admin é a mais segura e simples.

---

## 3. Habilitar Leaked Password Protection

Usar a ferramenta de configuração de autenticação para ativar a verificação contra senhas vazadas (HaveIBeenPwned), impedindo que usuários usem senhas comprometidas.

---

## Detalhes Técnicos

### Migration SQL (1 migration)

Reescrever todas as policies:

```sql
-- order_items: DROP 3 + CREATE 3
-- orders: DROP 3 + CREATE 3  
-- session_clients: DROP 4 + CREATE 4
-- sessions: DROP 2 (SELECT, UPDATE) + CREATE 2
-- Total: 12 DROP + 12 CREATE
```

Todas as novas policies seguem o padrão:
- `TO authenticated` (exige login)
- `USING/WITH CHECK` com `has_role()` para as 3 roles

### Edge Function `reset-password/index.ts`

```typescript
// Adicionar verificação de JWT + role admin
const authHeader = req.headers.get('Authorization');
// Validar com getClaims()
// Verificar role admin no banco
// Só então permitir o reset
```

### Frontend `Login.tsx`

- Remover view `"recover"` e o botão "Esqueceu a senha?"
- Simplificar o tipo `View` para `"login" | "signup"`

### `supabase/config.toml`

Não precisa ser editado manualmente — a proteção de senhas vazadas será configurada via ferramenta de autenticação.

### Arquivos modificados

1. `supabase/migrations/XXXX_fix_rls_policies.sql` (nova migration)
2. `supabase/functions/reset-password/index.ts` (reescrever com auth)
3. `src/pages/Login.tsx` (remover recuperação pública)

