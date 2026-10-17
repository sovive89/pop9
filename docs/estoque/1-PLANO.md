# POP9 — PLANO SÓLIDO

Baseado em inspeção do repo real (`sovive89/pop9`), não em suposição.

---

## O CONCEITO PRIMEIRO

O Pop9 tem hoje **dois mundos que não se falam**:

```
MUNDO A — VENDA (maduro, em produção)
sessions → session_clients → orders → order_items → payments
                                 ↓
                          Kitchen.tsx (/cozinha)

MUNDO B — ESTOQUE (existe, mas fora das migrations)
raw_materials → production_recipes → production_batches → stock_movements
                                 ↓
                          StockTab.tsx (/admin)
```

O que falta não é um KDS novo. É **a ponte**: quando um `order_item` é
vendido, nada desconta do estoque. Vender um hambúrguer não tira carne
do `raw_materials`.

Essa ponte é o projeto. Todo o resto é consequência.

---

## PROBLEMA ZERO: SCHEMA DRIFT

As tabelas de estoque não estão em `supabase/migrations/`. Elas existem
só no Supabase de produção — criadas pelo painel ou por migration
perdida.

Tabelas que o código consulta e a pasta de migrations não conhece:

- `raw_materials`
- `suppliers`
- `production_recipes`
- `production_recipe_inputs`
- `production_labels`
- `low_stock_alerts`
- `stock_movements`
- `production_batches`
- `production_batch_inputs`

**Por que isso te machuca:** é o mesmo mecanismo que causou o bug do
`orders.origin`. Ambiente novo, reset de banco ou branch de preview =
tudo quebra. E ninguém consegue revisar o schema lendo o repo.

**Isso é a Fase 0. Nada de novo entra antes disso.**

---

## FASE 0 — CONGELAR A REALIDADE (faça primeiro)

Objetivo: fazer o repo dizer a verdade sobre o banco. Zero mudança
de comportamento.

1. No Supabase → SQL Editor, extraia o DDL real:

```sql
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'raw_materials','suppliers','production_recipes',
    'production_recipe_inputs','production_labels',
    'stock_movements','production_batches','production_batch_inputs'
  )
ORDER BY table_name, ordinal_position;
```

2. Confira também as políticas de RLS:

```sql
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;
```

3. Escreva uma migration única e **idempotente** com o que voltou:
   `supabase/migrations/20260801000000_baseline_estoque.sql`
   Use `CREATE TABLE IF NOT EXISTS` em tudo. Ela não deve alterar
   nada em produção — só registrar o que já está lá.

4. Rode `supabase db push`. Se não der erro e nada mudar, deu certo.

**Critério de pronto:** clonar o repo num banco vazio e rodar as
migrations produz um Pop9 funcional.

---

## FASE 1 — O FIX DO DROPDOWN (10 minutos)

Independente de tudo. Pode ir hoje.

`src/components/admin/StockTab.tsx`, linha ~604, no bloco logo abaixo
do label **"Item produzido (saída)"**:

```tsx
{rawMaterials
  .filter((m) => m.isProduced)
  .map((m) => (
    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
  ))}
```

⚠️ Existe um bloco quase idêntico por volta da linha 629, dentro de
"Insumos consumidos por lote". **Esse continua sem filtro** — ali você
quer ver todos os insumos mesmo.

---

## FASE 2 — A PONTE VENDA → ESTOQUE

O coração do sistema. Aqui o dinheiro passa a bater com a despensa.

### 2.1 Ligar item de cardápio a insumo

Já existe `menu_item_ingredients`. Confira o que tem lá dentro; se
estiver vazia ou incompleta, ela é o ponto de ligação:

```
menu_items ──< menu_item_ingredients >── raw_materials
                    (quantidade por unidade vendida)
```

### 2.2 Descontar na hora certa

Decisão de projeto — escolha **uma**:

| Momento | Prós | Contras |
|---|---|---|
| Ao confirmar pedido | estoque reflete demanda real | cancelamento precisa estornar |
| Ao marcar `ready` | só desconta o que saiu | vende item sem insumo |
| Ao fechar conta | bate com faturamento | cozinha já gastou faz tempo |

Recomendo **ao marcar `ready`** — é onde o `Kitchen.tsx` já escreve, e
o consumo físico já aconteceu de fato.

### 2.3 Implementar como trigger, não no frontend

Trigger no banco, não no React. Motivo: o desconto tem que acontecer
mesmo se o app cair, se vier de outro cliente, ou se alguém alterar
pela API.

```
orders.status → 'ready'
   ↓ trigger
para cada order_item:
   busca menu_item_ingredients
   insere stock_movements (type='saida', reason='venda')
   ↓ trigger existente
   atualiza raw_materials.current_stock
```

⚠️ `order_items.menu_item_id` é **TEXT**, não UUID. Qualquer join ou FK
precisa respeitar isso.

### 2.4 Estorno

Cancelar pedido depois de `ready` precisa gerar movimento inverso.
Decida isso agora, não depois — é o tipo de coisa que vira
inconsistência silenciosa de estoque.

---

## FASE 3 — MELHORAR A COZINHA (não recriar)

`Kitchen.tsx` já tem: realtime, pending/preparing/ready, estimativa de
tempo de preparo, e trava pra dois cozinheiros não pegarem o mesmo item.

**Não construa um KDS paralelo.** Adicione o que falta:

- [ ] `preparation_location` (kitchen / bar / counter) em `menu_items`
- [ ] filtro por local: `/cozinha?local=bar`
- [ ] cor por tempo decorrido (verde → amarelo → vermelho)
- [ ] som ao entrar pedido novo
- [ ] modo tela cheia pra tablet fixo

Um `menu_items.preparation_location` resolve o roteamento inteiro sem
tabela nova.

---

## FASE 4 — OPCIONAIS

Só depois que 0–3 estiverem estáveis.

- Impressora térmica (o `printKitchenTicket()` do pack é stub vazio)
- Notificação ao garçom via WhatsApp — `app_config` já tem infra
- Relatório de produção vs venda (margem real por prato)

---

## O QUE DESCARTAR DO PACK ANTERIOR

Aquele `IMPLEMENTACAO-COMPLETA.md` foi escrito sem olhar o schema real.
Não rode as migrations dele.

| Item | Status | Motivo |
|---|---|---|
| tabela `items` unificada | ❌ descartar | app usa `raw_materials` |
| `recipes`/`recipe_ingredients` | ❌ descartar | já existe `production_recipes` |
| `stock_movements` (versão nova) | ❌ descartar | colide com a real |
| `production_batches` (versão nova) | ❌ descartar | colide com a real |
| `app_config` | ❌ descartar | já existe |
| `orders_kds` | ❌ descartar | duplica `orders` + `order_items` |
| `KDSDisplay.tsx` | ❌ descartar | `Kitchen.tsx` já faz isso |
| RPC `produce_batch` | ⚠️ tem bugs | ver abaixo |
| `useKDSNotifications` (som/vibração) | ✅ aproveitar | ideia boa, colar no Kitchen.tsx |
| fix do `.filter(isProduced)` | ✅ aproveitar | correto e independente |

Bugs do `produce_batch`, caso queira reaproveitar a ideia:
- `v_expires_at` é `DATE` mas recebe `shelf_life_days` (INTEGER)
- `DATE_PART('YYYYMMDD', NOW())` é inválido — o certo é
  `TO_CHAR(NOW(), 'YYYYMMDD')`
- nenhuma tabela nova tinha política de RLS, e o Pop9 usa RLS em tudo

---

## ORDEM DE EXECUÇÃO

```
FASE 1  fix do dropdown          ← hoje, 10 min, isolado
FASE 0  baseline do schema       ← antes de qualquer coisa nova
FASE 2  ponte venda → estoque    ← o projeto de verdade
FASE 3  melhorar Kitchen.tsx     ← incremental
FASE 4  opcionais
```

A Fase 1 fura a fila por ser pequena e não tocar em schema.

---

## PRÓXIMA CONVERSA

Traga o resultado das duas queries da Fase 0. Com o schema real na
mão, dá pra escrever a migration de baseline e a trigger da ponte
com precisão, sem chute.
