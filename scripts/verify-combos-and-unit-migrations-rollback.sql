-- Aceitação no banco real. Não mantém compras, saldos, lotes ou combos de teste.
begin;
do $verify$
declare
  v_actor uuid; v_unit uuid; v_target uuid; v_category text;
  v_prefix text := 'QA combos ' || gen_random_uuid()::text;
  v_item text := gen_random_uuid()::text; v_raw uuid := gen_random_uuid();
  v_target_raw uuid := gen_random_uuid(); v_lot uuid := gen_random_uuid();
  v_transfer uuid := gen_random_uuid(); v_target_lot uuid; v_combo uuid;
  v_data jsonb; v_mode text; v_rejected boolean; v_bad_id uuid := gen_random_uuid();
begin
  select user_id into v_actor from public.user_roles where role='admin' and business_unit_id is not null
    group by user_id having count(distinct business_unit_id)>=2 limit 1;
  if v_actor is null then raise exception 'Exige admin com duas unidades'; end if;
  select bu.id into v_unit from public.business_units bu join public.user_roles ur on ur.business_unit_id=bu.id
    where ur.user_id=v_actor and ur.role='admin' and bu.active
      and exists(select 1 from public.menu_categories c where c.business_unit_id=bu.id) order by bu.id limit 1;
  select bu.id into v_target from public.business_units bu join public.user_roles ur on ur.business_unit_id=bu.id
    where ur.user_id=v_actor and ur.role='admin' and bu.active and bu.id<>v_unit order by bu.id limit 1;
  if v_unit is null or v_target is null then raise exception 'Exige duas unidades ativas e uma categoria'; end if;
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  select key into v_category from public.menu_categories where business_unit_id=v_unit limit 1;
  perform public.save_menu_item_with_recipe_and_class(v_unit,v_item,jsonb_build_object(
    'name',v_prefix,'price',30,'category',v_category,'active',true,'status','published','item_kind','regular',
    'ingredients','[]'::jsonb,'variants','[]'::jsonb,'recipe','[]'::jsonb));

  foreach v_mode in array array['fixed','percent','amount'] loop
    v_data := jsonb_build_object('name',v_prefix||' '||v_mode,'pricing_mode',v_mode,
      'price',case when v_mode='fixed' then 49.9 else null end,
      'discount',case when v_mode='percent' then 10 when v_mode='amount' then 5 else 0 end,
      'slots',jsonb_build_array(
        jsonb_build_object('label','Primeiro','options',jsonb_build_array(jsonb_build_object('menu_item_id',v_item))),
        jsonb_build_object('label','Segundo','options',jsonb_build_array(jsonb_build_object('menu_item_id',v_item)))));
    v_combo := public.save_menu_combo(v_unit,null,v_data,0);
    if not exists(select 1 from public.menu_combos where id=v_combo and pricing_mode=v_mode
      and price is not distinct from case when v_mode='fixed' then 49.9 else null end
      and discount=case when v_mode='percent' then 10 when v_mode='amount' then 5 else 0 end)
      then raise exception 'Regra de cobrança não preservada: %',v_mode; end if;
    perform public.save_menu_combo(v_unit,v_combo,jsonb_set(v_data,'{active}','false'::jsonb),0);
    if (select count(*) from public.menu_combo_slots where combo_id=v_combo)<>2
      or (select count(*) from public.menu_combo_options o join public.menu_combo_slots s on s.id=o.slot_id where s.combo_id=v_combo)<>2
      then raise exception 'Edição duplicou ou perdeu componentes'; end if;
    v_rejected:=false;
    begin perform public.save_menu_combo(v_target,v_combo,v_data,0);
    exception when others then v_rejected:=true; end;
    if not v_rejected then raise exception 'Edição aceitou combo de outra unidade'; end if;
  end loop;

  insert into public.raw_materials(id,business_unit_id,name,unit,tipo,current_stock)
    values(v_raw,v_unit,v_prefix,'g','insumo',0),(v_target_raw,v_target,v_prefix,'g','insumo',0);
  perform public.register_stock_purchase(v_unit,v_lot,jsonb_build_object('rawMaterialId',v_raw,
    'quantity',100,'purchaseQuantity',100,'conversionFactor',1,'purchaseUnit','g','totalCost',25,
    'validade',(current_date+30)::text));
  v_target_lot:=public.transfer_stock_lot(v_transfer,v_lot,v_target,v_target_raw,30);
  if public.transfer_stock_lot(v_transfer,v_lot,v_target,v_target_raw,30)<>v_target_lot
    then raise exception 'Retry de transferência duplicou lote'; end if;
  if (select current_stock from public.raw_materials where id=v_raw)<>70
    or (select current_stock from public.raw_materials where id=v_target_raw)<>30
    or (select quantidade_restante from public.stock_lot_balances where id=v_lot)<>70
    or (select quantidade_restante from public.stock_lot_balances where id=v_target_lot)<>30
    or (select count(*) from public.stock_movements where reference_type='stock_transfer' and reference_id=v_transfer)<>2
    then raise exception 'Transferência ou saldo inconsistente'; end if;
  v_rejected:=false;
  begin perform public.transfer_stock_lot(v_bad_id,v_lot,v_target,v_target_raw,1000);
  exception when others then v_rejected:=true; end;
  if not v_rejected or exists(select 1 from public.stock_transfers where id=v_bad_id)
    then raise exception 'Transferência inválida não foi atômica'; end if;

  -- Identidade sem vínculos não lê metadados/combos/transferências nem grava combo.
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated')::text,true);
  if exists(select 1 from public.business_units) or exists(select 1 from public.businesses)
    or exists(select 1 from public.dining_tables) or exists(select 1 from public.table_areas)
    or exists(select 1 from public.menu_combos) or exists(select 1 from public.stock_transfers)
    then raise exception 'RLS expôs dados sem vínculo'; end if;
  v_rejected:=false;
  begin perform public.save_menu_combo(v_unit,null,v_data,0);
  exception when insufficient_privilege then v_rejected:=true; end;
  if not v_rejected then raise exception 'RPC aceitou usuário sem vínculo'; end if;
  v_rejected:=false;
  begin perform public.transfer_stock_lot(v_transfer,v_lot,v_target,v_target_raw,30);
  exception when insufficient_privilege then v_rejected:=true; end;
  if not v_rejected then raise exception 'Retry de transferência ignorou autorização'; end if;
end;
$verify$;
rollback;
