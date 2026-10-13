-- Maintenance acceptance: authenticated unit admin, no persistent test data.
begin;
do $verify$
declare
  v_unit uuid;v_actor uuid;v_menu text:=gen_random_uuid()::text;v_recipe uuid:=gen_random_uuid();
  v_batch uuid:=gen_random_uuid();v_far uuid:=gen_random_uuid();v_near uuid:=gen_random_uuid();
  v_output uuid;v_base uuid;v_lot uuid;v_session uuid:=gen_random_uuid();v_client uuid:=gen_random_uuid();v_order uuid:=gen_random_uuid();
  v_category text;v_table_number integer;v_payload jsonb;v_bad jsonb;v_failed boolean:=false;
begin
  select ur.business_unit_id,ur.user_id into v_unit,v_actor from public.user_roles ur join public.business_units bu on bu.id=ur.business_unit_id
    where ur.role='admin' and bu.active order by ur.id limit 1;
  if v_actor is null then raise exception 'Exige administrador de unidade existente';end if;
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  perform public.set_unit_operation(v_unit,true);
  select key into v_category from public.menu_categories where business_unit_id=v_unit limit 1;
  if v_category is null then raise exception 'Exige categoria existente';end if;
  select dt.number into v_table_number from public.dining_tables dt where dt.business_unit_id=v_unit and dt.archived_at is null
    and not exists(select 1 from public.sessions s where s.business_unit_id=v_unit and s.table_number=dt.number and s.status='active')
    order by dt.number limit 1;
  if v_table_number is null then raise exception 'Exige uma mesa livre para o teste com rollback';end if;
  v_payload:=jsonb_build_object('name','QA rollback '||v_menu,'price',29,'category',v_category,'status','published','active',true,
    'ingredients','[]'::jsonb,'variants','[]'::jsonb,'recipe',jsonb_build_array(jsonb_build_object(
      'rawMaterialId','','newName','QA blend '||v_menu,'newUnit','g','quantity',200,'transformation','producao',
      'preparation',jsonb_build_object('requestId',v_recipe,'outputQuantity',1000,'inputs',jsonb_build_array(jsonb_build_object(
        'rawMaterialId','','newName','QA carne '||v_menu,'newUnit','g','quantity',600))))));
  perform public.save_menu_item_with_recipe(v_unit,v_menu,v_payload);
  select raw_material_id into v_output from public.recipe_items where menu_item_id=v_menu;
  select raw_material_id into v_base from public.production_recipe_inputs where recipe_id=v_recipe;
  if (select current_stock from public.raw_materials where id=v_output)<>0
    or exists(select 1 from public.lotes where raw_material_id in(v_output,v_base)) then raise exception 'Ficha criou estoque real';end if;
  perform public.register_stock_purchase(v_unit,v_far,jsonb_build_object('rawMaterialId',v_base,'quantity',1000,
    'purchaseQuantity',1000,'conversionFactor',1,'purchaseUnit','g','totalCost',200,'validade',current_date+5));
  perform public.register_stock_purchase(v_unit,v_near,jsonb_build_object('rawMaterialId',v_base,'quantity',200,
    'purchaseQuantity',200,'conversionFactor',1,'purchaseUnit','g','totalCost',20,'validade',current_date+2));
  perform public.produce_stock_batch(v_unit,v_batch,jsonb_build_object('recipeId',v_recipe,'quantityProduced',1000,
    'inputsUsed',jsonb_build_array(jsonb_build_object('rawMaterialId',v_base,'quantityUsed',600))));
  perform public.produce_stock_batch(v_unit,v_batch,jsonb_build_object('recipeId',v_recipe,'quantityProduced',1000,
    'inputsUsed',jsonb_build_array(jsonb_build_object('rawMaterialId',v_base,'quantityUsed',600))));
  if (select quantidade_restante from public.stock_lot_balances where id=v_near)<>0
    or (select quantidade_restante from public.stock_lot_balances where id=v_far)<>600
    or (select current_stock from public.raw_materials where id=v_base)<>600
    or (select current_stock from public.raw_materials where id=v_output)<>1000 then raise exception 'Produção/FEFO duplicou ou perdeu consumo';end if;
  select id into v_lot from public.lotes where batch_id=v_batch;
  if (select preco_unitario from public.lotes where id=v_lot)<>0.1 then raise exception 'Custo produzido incorreto';end if;
  insert into public.sessions(id,business_unit_id,table_number,zone,created_by) values(v_session,v_unit,v_table_number,'interno',v_actor);
  insert into public.session_clients(id,session_id,business_unit_id,name) values(v_client,v_session,v_unit,'QA temporário');
  insert into public.orders(id,session_id,client_id,business_unit_id) values(v_order,v_session,v_client,v_unit);
  insert into public.order_items(order_id,menu_item_id,name,price,quantity) values(v_order,v_menu,'QA',29,2);
  if (select current_stock from public.raw_materials where id=v_output)<>600
    or (select quantidade_restante from public.stock_lot_balances where id=v_lot)<>600
    or (select current_stock from public.raw_materials where id=v_base)<>600 then raise exception 'Venda não consumiu somente o produzido';end if;
  v_payload:=jsonb_set(v_payload,'{recipe}',jsonb_build_array(jsonb_build_object('rawMaterialId',v_output,'newUnit','g','quantity',999,'preparation',null,'transformation','producao')));
  perform public.save_menu_item_with_recipe(v_unit,v_menu,v_payload);
  update public.orders set status='cancelled' where id=v_order;
  update public.orders set status='cancelled' where id=v_order;
  if (select current_stock from public.raw_materials where id=v_output)<>1000
    or (select quantidade_restante from public.stock_lot_balances where id=v_lot)<>1000
    or (select sum(quantity) from public.stock_movements where raw_material_id=v_output and reason='estorno_cancelamento')<>400 then raise exception 'Estorno não devolveu os lotes originais';end if;
  v_bad:=jsonb_set(v_payload,'{recipe}',jsonb_build_array(jsonb_build_object('rawMaterialId',v_output,'quantity',100),
    jsonb_build_object('rawMaterialId','','newName','Inválido '||v_menu,'newUnit','g','quantity',-1)));
  begin perform public.save_menu_item_with_recipe(v_unit,v_menu,v_bad);
  exception when others then v_failed:=true;end;
  if not v_failed or (select quantity from public.recipe_items where menu_item_id=v_menu)<>999 then raise exception 'Falha apagou a ficha anterior';end if;
  if (select count(*) from public.technical_documents where business_unit_id=v_unit and entity_type='menu_item' and entity_id=v_menu)=0 then raise exception 'Documento não foi gravado com a ficha';end if;
end;
$verify$;
rollback;
