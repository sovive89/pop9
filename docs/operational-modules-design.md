# Módulos adicionais e insumos operacionais

Auditoria antes das alterações (09/10/2026): o banco real contém `raw_materials`, `recipe_items`, `production_recipes`, `production_recipe_inputs`, `stock_movements`, `orders`, `order_items` e `sessions`. A venda já gera saída por linha de ficha. Produção também gera movimentos. Não há tabela de despesas ou pessoal. `app_config` é global, e o QR atual escolhe a primeira unidade; os novos parâmetros devem ser por unidade. `customers` é legado global, enquanto os contatos WhatsApp já são por unidade; não associar pessoas entre unidades automaticamente.

Há duas inconsistências relevantes: o cancelamento calcula a devolução pela ficha atual, que pode ter mudado após a venda; e o cálculo de custo médio não bloqueia a linha antes de ler o saldo. A nova implementação devolve movimentos efetivamente registrados e bloqueia a linha no cálculo do saldo/custo. Não cria estoque separado para insumos operacionais: a configuração referencia o mesmo `raw_materials.id` usado nas fichas.

A baixa operacional automática é uma quantidade por pedido. Havendo consumo desse mesmo insumo nas fichas do pedido, esse consumo satisfaz a regra; somente a diferença positiva é baixada. Por exemplo, regra de 2 embalagens e ficha com 1 embalagem: baixa total de 2. Se outra linha da ficha consumir mais 1, a diferença operacional anterior é estornada; continua total de 2. O histórico registra a reconciliação. Quantidades usam sempre a unidade do cadastro, sem conversão implícita.

Baixa manual é adicional deliberada (ex.: limpeza fora de um pedido). Estimativa periódica usa intervalo não sobreposto; reposição por contagem registra a diferença de saldo e não recria uma compra já registrada. Reposição de compras continua no fluxo existente de lotes. Custos de consumo vêm dos movimentos e do custo unitário capturado; não somar despesas duplicadas ao custo de venda.

KDS e timers começam habilitados para preservar a operação existente. Entrega própria começa desabilitada. QR herda o estado do check-in existente ao migrar, passando a ser controlado por unidade. Desabilitar um módulo não exclui seus dados históricos.
