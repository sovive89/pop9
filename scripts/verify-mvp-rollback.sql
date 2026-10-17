-- Verificação de operações reais do banco. Todas as alterações sofrem ROLLBACK.
-- Executar como conexão de manutenção autorizada, nunca como migration.
begin;
do $verify$
declare
 v_unit uuid; v_actor uuid; v_request uuid := gen_random_uuid();
 v_session uuid := gen_random_uuid(); v_client uuid := gen_random_uuid();
 v_order uuid := gen_random_uuid(); v_item text; v_material uuid;
 v_payload jsonb; v_result jsonb; v_stock numeric;
 v_category text := 'mvp-qa-' || substr(replace(gen_random_uuid()::text,'-',''),1,12);
begin
 select ur.business_unit_id,ur.user_id into v_unit,v_actor
 from public.user_roles ur join public.business_units bu on bu.id=ur.business_unit_id
 where ur.role='admin' and bu.active order by ur.id limit 1;
 if v_actor is null then raise exception 'Verificação exige um administrador de unidade existente'; end if;
 perform set_config('request.jwt.claim.sub',v_actor::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 perform public.set_unit_operation(v_unit,true);
 v_payload := jsonb_build_object('categories',jsonb_build_array(jsonb_build_object('key',v_category,'label','QA temporário','destination','kitchen')),
 'items',jsonb_build_array(jsonb_build_object('name','QA rollback '||v_category,'description','Fixture temporária','category',v_category,'price',10,
 'recipe',jsonb_build_array(
   jsonb_build_object('material','Blend '||v_category,'unit','g','quantity',200,'preparation',jsonb_build_object('outputQuantity',2000,'inputs',jsonb_build_array(jsonb_build_object('material','Carne '||v_category,'unit','g','quantity',2000)))),
   jsonb_build_object('material','Molho '||v_category,'unit','g','quantity',30,'preparation',jsonb_build_object('outputQuantity',1000,'inputs',jsonb_build_array(jsonb_build_object('material','Base '||v_category,'unit','g','quantity',1000))))))));
 v_result := public.apply_menu_import(v_unit,v_request,v_payload,false);
 if (v_result->>'itemsCreated')::int<>1 or (v_result->>'recipesCreated')::int<>2 or (v_result->>'recipeLines')::int<>2 then raise exception 'Importação não confirmou ficha e pré-preparos: %',v_result; end if;
 if not (public.apply_menu_import(v_unit,v_request,v_payload,false)->>'repeated')::boolean then raise exception 'Reenvio não foi idempotente'; end if;
 select id into v_item from public.menu_items where business_unit_id=v_unit and category=v_category;
 if exists(select 1 from public.raw_materials where business_unit_id=v_unit and name like '%'||v_category and current_stock<>0) then raise exception 'Importação criou estoque real'; end if;
 if (select count(*) from public.raw_materials where business_unit_id=v_unit and name like '%'||v_category and tipo='semiacabado' and is_produced)<>2 then raise exception 'Produzidos não foram reconhecidos'; end if;
 update public.raw_materials set current_stock=1000 where business_unit_id=v_unit and name like '%'||v_category;
 insert into public.sessions(id,business_unit_id,table_number,zone,created_by) values(v_session,v_unit,1,'interno',v_actor);
 insert into public.session_clients(id,session_id,business_unit_id,name) values(v_client,v_session,v_unit,'QA temporário');
 insert into public.orders(id,session_id,client_id,business_unit_id) values(v_order,v_session,v_client,v_unit);
 insert into public.order_items(order_id,menu_item_id,name,price,quantity) values(v_order,v_item,'QA',10,2);
 select raw_material_id into v_material from public.recipe_items where menu_item_id=v_item and quantity=200;
 select current_stock into v_stock from public.raw_materials where id=v_material;
 if v_stock<>600 then raise exception 'Baixa de estoque não correspondeu à venda: %',v_stock; end if;
 update public.recipe_items set quantity=999 where menu_item_id=v_item;
 update public.orders set status='cancelled' where id=v_order;
 if (select current_stock from public.raw_materials where id=v_material)<>1000 then raise exception 'Estorno não devolveu a baixa original'; end if;
 update public.orders set status='cancelled' where id=v_order;
 if (select count(*) from public.stock_movements where reference_type='order_item_cancel' and business_unit_id=v_unit)<>2 then raise exception 'Estorno duplicado'; end if;
 update public.recipe_items set quantity=case when raw_material_id=v_material then 200 else 30 end where menu_item_id=v_item;
 v_order:=gen_random_uuid();
 insert into public.orders(id,session_id,client_id,business_unit_id) values(v_order,v_session,v_client,v_unit);
 insert into public.order_items(order_id,menu_item_id,name,price,quantity) values(v_order,v_item,'QA',10,1);
 update public.orders set status='preparing' where id=v_order;
 update public.orders set status='ready' where id=v_order;
 update public.orders set status='delivered' where id=v_order;
 insert into public.payments(session_id,client_id,business_unit_id,amount,service_charge,method,created_by,status)
 values(v_session,v_client,v_unit,10,0,'pix',v_actor,'confirmed');
 perform public.request_session_closure(v_session,false);
 execute 'set local role service_role';
 v_result:=public.approve_session_closure(v_session,v_actor,null);
 if not (v_result->>'closed')::boolean or (v_result->>'unpaidTotal')::numeric<>0 then raise exception 'Encerramento pago não confirmado: %',v_result; end if;
 if (select status from public.sessions where id=v_session)<>'closed' then raise exception 'Mesa não foi liberada'; end if;
 execute 'set local role authenticated';
 perform public.set_unit_operation(v_unit,false);
 if exists(select 1 from public.operation_periods where business_unit_id=v_unit and closed_at is null) then raise exception 'Operação não foi fechada após finalizar a comanda';end if;
 perform public.set_unit_operation(v_unit,true);
end;
$verify$;
rollback;
