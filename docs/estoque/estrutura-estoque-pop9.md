# Módulo de Estoque — pop9

Documento de referência para estruturar o banco de dados.
Legenda: **[existe]** já está no banco · **[novo]** falta criar · **[ajustar]** existe mas muda.

---

## Conceito central (a regra que não se quebra)

**Nenhum módulo altera o saldo diretamente. Toda operação gera uma MOVIMENTAÇÃO. O saldo é apenas a soma das movimentações.**

Consequências desse princípio, que valem para o modelo inteiro:

- **Saldo** nunca é um campo digitado → é calculado (soma das movimentações, por item e por lote).
- **Custo da ficha** nunca é congelado na ficha → é calculado ao vivo (Σ quantidade × custo médio atual do insumo).
- **Rendimento** não é fixo na ficha → é digitado na hora da produção (o real, não o previsto).
- **Quantidade que entrou num lote** é congelada (fato histórico) → o que resta no lote é calculado.

---

## Modelo de dados

### FORNECEDOR (`suppliers`) — [existe, completo]

| Campo | Tipo | Obs |
|---|---|---|
| id | uuid | |
| name | text | obrigatório |
| document | text | CNPJ/CPF |
| phone | text | |
| email | text | |
| active | boolean | desativa sem apagar histórico |

Backend pronto. Falta só a tela de cadastro (CRUD) e popular (hoje: 0 registros).

---

### ITEM (`raw_materials`) — [ajustar]

| Campo | Tipo | Status |
|---|---|---|
| id | uuid | [existe] |
| nome | text | [existe] |
| **tipo** | enum: `insumo` \| `semiacabado` \| `produto_acabado` \| `revenda` | **[ajustar]** substitui o booleano `is_produced` |
| unidade_base | enum: `kg` \| `L` \| `un` \| `g` \| `ml` | [ajustar] hoje é texto livre |
| **categoria** | text ou FK | **[novo]** |
| estoque_minimo | numeric | [existe] (`min_stock`) |
| average_cost | numeric | [existe] alimenta CMV |
| active | boolean | [existe] |

**Sem `estoque_atual`** — vem das movimentações.

Motivo do enum: o booleano `is_produced` não representa 4 tipos. Insumo e Revenda colidem em `false`; Semiacabado e Produto Acabado colidem em `true`.

---

### LOTE (`lotes`) — [novo, unifica compra + produção]

Hoje existe pela metade (parte no `batch_info` jsonb, parte na `production_batches`). Vira tabela única.

| Campo | Tipo | Obs |
|---|---|---|
| id | uuid | |
| item_id | uuid → ITEM | |
| numero_lote | text | |
| quantidade_entrada | numeric | **congelado** — o que entrou, nunca muda |
| data_entrada | timestamptz | |
| validade | date | |
| fornecedor_id | uuid → FORNECEDOR | nulável (só compra) |
| preco_unitario | numeric | nulável (só compra) — base do custo médio |
| receita_id | uuid → FICHA | nulável (só produção) |

**Saldo do lote = quantidade_entrada − Σ movimentações daquele lote.** Nunca reescrever.

---

### MOVIMENTAÇÃO (`stock_movements`) — [ajustar]

| Campo | Tipo | Status |
|---|---|---|
| id | uuid | [existe] |
| raw_material_id | uuid → ITEM | [existe] |
| **lote_id** | uuid → LOTE | **[novo]** dá FIFO e controle de validade |
| type | enum: `entrada` \| `saida` | [existe] |
| reason (motivo) | ver lista abaixo | [ajustar] falta `transferencia` |
| quantity | numeric | [existe] (> 0) |
| unit_cost | numeric | [existe] |
| supplier_id | uuid | [existe] |
| created_by / created_at | | [existe] |

**Vocabulário de motivos** (check constraint):
`compra` · `producao_consumo` · `producao_output` · `venda` · `ajuste` · `perda` · `estorno_cancelamento` [todos existem] · **`transferencia`** [novo]

---

### FICHA TÉCNICA (`production_recipes`) — [ajustar]

O molde da produção: define o que é criado e o que desconta. Não desconta nada sozinha.

| Campo | Tipo | Status |
|---|---|---|
| id | uuid | [existe] |
| nome | text | [existe] |
| item_gerado_id | uuid → ITEM | [existe] (`output_raw_material_id`) |
| **tipo** | enum: `producao` \| `mise_en_place` \| `porcionamento` | **[novo]** faz a ficha servir os 3 módulos |
| **perda_esperada** | numeric (%) | **[novo]** meta de planejamento |
| **tempo_producao** | integer (min) | **[novo]** |
| validade_dias | integer | [existe] (`shelf_life_days`) |
| active | boolean | [existe] |

Custo **não** é coluna → calculado ao vivo.

---

### INGREDIENTES DA FICHA (`production_recipe_inputs`) — [existe, completo]

| Campo | Tipo | Obs |
|---|---|---|
| id | uuid | |
| ficha_id | uuid → FICHA | |
| item_id | uuid → ITEM | produzido OU comprado, tanto faz |
| quantidade | numeric | **por 1 unidade produzida** (o sistema multiplica na hora) |

A unidade herda do item (resolve "ovo em `un`", "carne em `kg`"). Todos os ingredientes descontam igual, independente do tipo.

---

## Entrada de Compras (3 portas, 1 destino)

A compra pode ser lançada de três formas. **Todas convergem para o mesmo resultado:** um lote + uma movimentação de `entrada` (motivo `compra`) por item. As três só mudam *como os dados chegam* na tela de conferência.

```
  Manual  ┐
  XML     ┼──►  Tela de conferência  ──►  confirma  ──►  lote + movimentação (entrada/compra)
  Foto/OCR┘        (você revisa)
```

**Regra:** nenhuma porta grava direto no estoque. Todas *propõem* movimentações; você confirma. Isso respeita o conceito central.

### Porta 1 — Lançamento manual — [base do módulo]
Você digita: fornecedor, item, quantidade, unidade, preço, lote, validade. É o caminho sempre disponível e o alicerce — as outras duas só *preenchem esta mesma tela* automaticamente.

### Porta 2 — XML da NF-e — [em aberto, caminho confiável]
Parsing do XML estruturado da nota (obtido via e-mail do fornecedor ou portal SEFAZ pela chave de 44 dígitos). Cada item vem limpo: descrição, quantidade, unidade, valor unitário, às vezes lote. Determinístico.

### Porta 3 — Foto / PDF + OCR — [em aberto, rascunho]
Fotografar a nota e extrair com OCR/IA. Cômodo, porém o menos confiável (erra vírgula, quantidade, descrição). Serve como **rascunho para conferência**, nunca entrada automática cega.

### Peça que as portas 2 e 3 exigem: vínculo fornecedor ↔ item — [novo]
A nota diz "TOMATE ITALIANO CX 20KG"; seu cadastro tem "Tomate". Não casa sozinho. Tabela nova para memorizar o de-para (casa uma vez na 1ª nota, automático depois):

**`fornecedor_item`** — `id` · `fornecedor_id → FORNECEDOR` · `codigo_ou_descricao_nota` (text) · `item_id → ITEM` · `fator_conversao` (numeric, ex.: caixa de 20kg → 20)

> Status: **deixado em aberto para os dois caminhos** (XML e OCR). O lançamento manual é o suficiente para começar; XML/OCR entram depois que a tela de compra e o vínculo estiverem prontos.

---

## Como a produção desconta (o mecanismo)

1. Você escolhe a ficha e digita **quanto produzir** (ex.: 50).
2. Para cada linha de ingrediente → gera uma **movimentação de saída** (`producao_consumo`), quantidade × 50.
3. Para o item gerado → gera uma **movimentação de entrada** (`producao_output`) + cria o **lote** (com validade).
4. Os saldos (item e lote) se resolvem sozinhos pela soma.

**Cascata:** a saída de uma ficha é ingrediente de outra. O "molho base" é item gerado na ficha do molho e insumo na ficha do hambúrguer. Isso é o que define um semiacabado.

---

## Ordem de construção (migrations versionadas)

1. **Enum de tipo de item** — substitui `is_produced`; reclassifica dados; destrava todos os dropdowns.
2. **Tabela `lotes`** (unificada) + coluna `lote_id` na movimentação.
3. **Categoria** no item.
4. **3 colunas na ficha** — `tipo`, `perda_esperada`, `tempo_producao`.
5. **Motivo `transferencia`** no check constraint.
6. Telas (frontend): filtro dos dropdowns por tipo, CRUD de fornecedores, cadastro de item, **entrada de compra manual** (a base), inventário.
7. **Importação de NF-e** (em aberto): tabela `fornecedor_item` (vínculo) → importação por **XML** → depois **foto/OCR**. Todas caem na mesma tela de conferência da compra manual.
8. **Transferências** (maior lift — exige conceito de local/depósito; só se houver mais de um ponto de estoque). Deixar por último.

### Trilha paralela — Print Server (independente do estoque)
- P1. Tabelas `print_servers`, `printers`, `print_jobs`.
- P2. Aba de **Configurações** no front (servidores, impressoras, gatilhos) — já prototipada.
- P3. Triggers: `orders.status → confirmado` (KOT) e `sessions.status → fechada` (conta) inserindo em `print_jobs`.
- P4. Consumidor no local (A, B ou C — conforme o hardware). **Decisão de hardware pendente.**

---

## Print Server (impressão da cozinha e da conta)

### A pegadinha central
Supabase/Vercel estão na **nuvem**; as impressoras estão na **rede local** do bar. A nuvem não alcança a impressora (sem IP público, firewall bloqueia). Logo: **não se imprime "direto do trigger".** Um consumidor no local recebe o job e envia pra impressora.

### O princípio (mesmo do estoque): não imprima — enfileire
O trigger não imprime; ele **cria um job numa fila** (`print_jobs`). Um consumidor no local imprime e marca como feito. Isso dá retentativa, reimpressão e log — e evita que um pedido suma calado quando a impressora está sem papel. É o livro-razão aplicado à impressão.

### Separação de conceitos (o que a tela de Configurações pressupõe)
- **Servidor** = *como* o job chega na impressora (o método de entrega).
- **Impressora** = o *destino físico* (cozinha / bar / caixa), que usa um servidor.
- **Job** = uma intenção de impressão na fila.

### `print_servers` — [novo]
| Campo | Tipo | Obs |
|---|---|---|
| id | uuid | |
| nome | text | |
| tipo | enum: `agente` \| `cloudprnt` \| `navegador` \| `custom` | **aberto a novos tipos** |
| config | jsonb | credenciais/URL/etc. conforme o tipo |
| ativo | boolean | |

### `printers` — [novo]
| Campo | Tipo | Obs |
|---|---|---|
| id | uuid | |
| nome | text | |
| destino | enum: `cozinha` \| `bar` \| `caixa` | casa com `order_items.destination` |
| server_id | uuid → print_servers | |
| ativo | boolean | |

### `print_jobs` — [novo] (a fila)
| Campo | Tipo | Obs |
|---|---|---|
| id | uuid | |
| tipo | enum: `kot` \| `conta` | ficha de preparo ou comanda |
| destino | enum: `cozinha` \| `bar` \| `caixa` | qual impressora puxa |
| payload | jsonb | **dados estruturados**, não texto pronto (o consumidor renderiza ESC/POS; muda layout sem tocar no banco) |
| status | enum: `pendente` \| `impresso` \| `erro` | |
| tentativas | integer | |
| created_at / printed_at | timestamptz | |

### Os dois gatilhos (mapeados no banco atual)
1. **KOT — cozinha.** `orders.status → confirmado` insere `print_jobs(tipo='kot', destino = order_items.destination)` com itens, quantidade, `observation`, `ingredient_mods` e a mesa. Realtime **já está ligado** em `orders`/`order_items`.
2. **Conta — caixa.** `sessions.status → fechada` (ou `ended_at`) insere `print_jobs(tipo='conta', destino='caixa')`. A view **`session_balances` já calcula** `total_consumido`, `total_servico`, `total_pago`, `saldo_restante` — o payload é isso + itens da sessão + `payments`.

### Consumidor (escolha de hardware — define o resto)
- **A. Agente local** num aparelho sempre ligado; escuta o Realtime de `print_jobs` e envia pras impressoras da LAN.
- **B. CloudPRNT / Server-Direct**: a impressora consulta um Edge Function e puxa os jobs. Sem PC.
- **C. Tablet/navegador** do setor imprime direto (modo quiosque).

> Impressora térmica fala **ESC/POS** (bytes), não HTML — por isso o `payload` guarda dados, e o consumidor renderiza.

---

## Nota de dívida técnica

Alterações de schema foram sempre aplicadas à mão no SQL Editor, sem versionamento (por isso os bugs de "coluna sumida em produção"). A partir daqui, **toda migration com nome versionado em snake_case**, para matar o schema drift.
