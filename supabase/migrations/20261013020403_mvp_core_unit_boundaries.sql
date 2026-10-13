-- Políticas antigas autorizavam o papel global sem limitar a unidade da linha.
-- Camada restritiva: preserva as políticas existentes, mas exige papel na unidade.
do $boundaries$
declare
  spec record;
  command text;
  roles text[];
  predicate text;
begin
  for spec in select * from (values
    ('sessions', 'business_unit_id', array['admin','attendant','kitchen','cashier'], array['admin','attendant'], array['admin','attendant']),
    ('orders', 'business_unit_id', array['admin','attendant','kitchen','cashier'], array['admin','attendant'], array['admin','attendant','kitchen']),
    ('payments', 'business_unit_id', array['admin','attendant','cashier'], array['admin','attendant','cashier'], array['admin']),
    ('menu_items', 'business_unit_id', array['admin','attendant','kitchen','cashier'], array['admin'], array['admin']),
    ('menu_categories', 'business_unit_id', array['admin','attendant','kitchen','cashier'], array['admin'], array['admin']),
    ('raw_materials', 'business_unit_id', array['admin','attendant','kitchen'], array['admin','kitchen'], array['admin','kitchen']),
    ('lotes', 'business_unit_id', array['admin','attendant','kitchen'], array['admin','kitchen'], array['admin','kitchen']),
    ('stock_movements', 'business_unit_id', array['admin','attendant','kitchen'], array['admin','kitchen'], array['admin','kitchen']),
    ('production_recipes', 'business_unit_id', array['admin','attendant','kitchen'], array['admin'], array['admin']),
    ('production_batches', 'business_unit_id', array['admin','attendant','kitchen'], array['admin','kitchen'], array['admin','kitchen']),
    ('session_clients', 'business_unit_id', array['admin','attendant','cashier'], array['admin','attendant'], array['admin','attendant']),
    ('menu_item_ingredients', 'menu_items', array['admin','attendant','kitchen'], array['admin'], array['admin']),
    ('menu_item_variants', 'menu_items', array['admin','attendant','kitchen'], array['admin'], array['admin']),
    ('recipe_items', 'menu_items', array['admin','attendant','kitchen'], array['admin'], array['admin']),
    ('order_items', 'orders', array['admin','attendant','kitchen','cashier'], array['admin','attendant'], array['admin','attendant','kitchen']),
    ('production_recipe_inputs', 'production_recipes', array['admin','attendant','kitchen'], array['admin'], array['admin']),
    ('production_batch_inputs', 'production_batches', array['admin','attendant','kitchen'], array['admin','kitchen'], array['admin','kitchen'])
  ) as t(table_name, unit_source, readers, creators, editors) loop
    foreach command in array array['select','insert','update','delete'] loop
      roles := case command when 'select' then spec.readers when 'insert' then spec.creators else spec.editors end;
      if spec.unit_source = 'business_unit_id' then
        predicate := format('app_private.has_unit_role(business_unit_id, %L::text[])', roles);
      else
        predicate := format('exists (select 1 from public.%I parent where parent.id = %I.%I and app_private.has_unit_role(parent.business_unit_id, %L::text[]))',
          spec.unit_source, spec.table_name,
          case spec.unit_source when 'menu_items' then 'menu_item_id' when 'orders' then 'order_id' when 'production_recipes' then 'recipe_id' else 'batch_id' end, roles);
      end if;
      execute format('create policy %I on public.%I as restrictive for %s to authenticated %s',
        'mvp_unit_' || command, spec.table_name, command,
        case command when 'insert' then 'with check (' || predicate || ')'
                     when 'update' then 'using (' || predicate || ') with check (' || predicate || ')'
                     else 'using (' || predicate || ')' end);
    end loop;
  end loop;
end;
$boundaries$;

-- Customer canônico ainda não possui identificador de tenant e não é usado
-- pelo CRM atual (que lê session_clients). Não expor dados sem escopo.
create policy mvp_customers_unassigned on public.customers as restrictive
  for all to authenticated using (false) with check (false);
