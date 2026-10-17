-- POP9 -- FASE 0: DESCOBRIR O SCHEMA REAL
-- Rode no Supabase > SQL Editor. Copie o resultado.
-- Nada aqui altera nada. E' so' leitura.

-- QUERY 1: colunas das tabelas de estoque
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'raw_materials','suppliers','production_recipes',
    'production_recipe_inputs','production_labels',
    'stock_movements','production_batches','production_batch_inputs',
    'menu_item_ingredients'
  )
ORDER BY table_name, ordinal_position;

-- QUERY 2: politicas de RLS
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;

-- QUERY 3: o que e' tabela e o que e' view
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_type, table_name;
