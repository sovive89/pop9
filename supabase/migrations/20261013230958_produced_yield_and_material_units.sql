-- Separate produced output units from the units of ingredients and menu use.
-- Repair only unused placeholder 'un' whose active purchase lots prove the
-- base measure. Preserve all quantities, costs, lots and movement history.
create or replace function ops_private.repair_purchase_measure(p_unit uuid,p_raw uuid,p_display text)
returns text language plpgsql security definer set search_path='' as $$
declare r public.raw_materials%rowtype;l record;v_candidate text;v_unit text;v_count integer:=0;v_balance numeric;
begin
  select * into r from public.raw_materials where id=p_raw and business_unit_id=p_unit for update;
  if not found then raise exception 'Insumo de outra unidade ou inexistente';end if;
  if r.unit<>'un' or r.is_produced or lower(trim(p_display)) not in('g','kg','ml','l')
    or r.min_stock<>0
    or exists(select 1 from public.recipe_items where raw_material_id=r.id)
    or exists(select 1 from public.production_recipe_inputs where raw_material_id=r.id)
    or exists(select 1 from public.production_batch_inputs where raw_material_id=r.id)
    or exists(select 1 from public.stock_movements where raw_material_id=r.id
      and reason<>'compra' and reference_type is distinct from 'lote_correcao') then return r.unit;end if;
  for l in select * from public.lotes where raw_material_id=r.id and business_unit_id=p_unit and cancelado_em is null for update loop
    if l.origem<>'compra' or l.quantidade_compra is null or l.fator_conversao is null
      or abs(l.quantidade_entrada-l.quantidade_compra*l.fator_conversao)>0.000001 then return r.unit;end if;
    v_candidate:=case
      when lower(l.unidade_compra)='kg' and l.fator_conversao=1000 then 'g'
      when lower(l.unidade_compra)='kg' and l.fator_conversao=1 then 'kg'
      when lower(l.unidade_compra)='g' and l.fator_conversao=1 then 'g'
      when lower(l.unidade_compra)='g' and l.fator_conversao=0.001 then 'kg'
      when lower(l.unidade_compra)='l' and l.fator_conversao=1000 then 'ml'
      when lower(l.unidade_compra)='l' and l.fator_conversao=1 then 'L'
      when lower(l.unidade_compra)='ml' and l.fator_conversao=1 then 'ml'
      when lower(l.unidade_compra)='ml' and l.fator_conversao=0.001 then 'L' end;
    if v_candidate is null or (v_unit is not null and v_unit<>v_candidate) then return r.unit;end if;
    v_unit:=v_candidate;v_count:=v_count+1;
  end loop;
  if v_count=0 then return r.unit;end if;
  if (lower(v_unit) in('g','kg'))<>(lower(trim(p_display)) in('g','kg')) then return r.unit;end if;
  select coalesce(sum(quantidade_restante),0) into v_balance from public.stock_lot_balances where raw_material_id=r.id and cancelado_em is null;
  if abs(v_balance-r.current_stock)>0.000001 then return r.unit;end if;
  update public.raw_materials set unit=v_unit,updated_at=now() where id=r.id;
  return v_unit;
end $$;
revoke all on function ops_private.repair_purchase_measure(uuid,uuid,text) from public,anon,authenticated;

create or replace function public.repair_material_purchase_unit(p_raw uuid,p_display_unit text)
returns text language plpgsql security definer set search_path='' as $$
declare v_unit uuid;
begin
  select business_unit_id into v_unit from public.raw_materials where id=p_raw;
  if not ops_private.staff(v_unit,array['admin']) then raise exception 'Sem permissão para definir medida-base';end if;
  return ops_private.repair_purchase_measure(v_unit,p_raw,p_display_unit);
end $$;
revoke all on function public.repair_material_purchase_unit(uuid,text) from public,anon;
grant execute on function public.repair_material_purchase_unit(uuid,text) to authenticated;

create or replace function ops_private.resolve_recipe_material(p_unit uuid,p_input jsonb,p_type public.item_tipo)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.raw_materials%rowtype; v_name text:=trim(p_input->>'newName'); v_unit text:=trim(p_input->>'newUnit');v_id uuid;
  v_initial text:=nullif(trim(p_input->>'stockUnit'),'');v_base text;
begin
  if v_initial is not null and v_initial not in('g','kg','ml','L','un','caixa','pacote','saco','cx','dz','pct') then
    raise exception 'Unidade-base inicial inválida';end if;
  v_base:=coalesce(v_initial,nullif(v_unit,''));
  v_id:=nullif(p_input->>'rawMaterialId','')::uuid;
  if v_id is not null then
    select * into r from public.raw_materials where id=v_id and business_unit_id=p_unit and active for update;
    if not found then raise exception 'Insumo de outra unidade, inativo ou inexistente';end if;
  else
    if coalesce(v_name,'')='' or coalesce(v_base,'')='' then raise exception 'Nome e unidade do insumo obrigatórios';end if;
    select * into r from public.raw_materials where business_unit_id=p_unit and lower(trim(name))=lower(v_name) limit 1 for update;
    if not found then
      insert into public.raw_materials(business_unit_id,name,unit,tipo,min_stock,current_stock,is_theoretical)
        values(p_unit,v_name,v_base,p_type,0,0,true) returning * into r;
    elsif not r.active then raise exception 'Insumo inativo: %',v_name;end if;
  end if;
  -- Names inferred from a menu start with an undefined theoretical 'un'.
  -- Define their first actual base unit only before any recipe or stock use.
  if (v_initial is not null and v_initial<>r.unit)
    or (v_initial is null and r.is_theoretical and r.unit='un' and coalesce(v_unit,'') not in('','un')) then
    if r.is_theoretical and r.current_stock=0 and r.min_stock=0
      and not exists(select 1 from public.stock_movements where raw_material_id=r.id)
      and not exists(select 1 from public.lotes where raw_material_id=r.id)
      and not exists(select 1 from public.recipe_items where raw_material_id=r.id)
      and not exists(select 1 from public.production_recipe_inputs where raw_material_id=r.id)
      and not exists(select 1 from public.production_recipes where output_raw_material_id=r.id) then
      update public.raw_materials set unit=v_base,updated_at=now() where id=r.id;
    elsif v_initial is not null then
      raise exception 'A unidade-base inicial só pode ser alterada antes do uso em fichas, lotes ou movimentações';
    end if;
  end if;
  perform ops_private.repair_purchase_measure(p_unit,r.id,v_unit);
  if p_type='semiacabado' and not r.is_produced then update public.raw_materials set tipo='semiacabado' where id=r.id;end if;
  return r.id;
end $$;
revoke all on function ops_private.resolve_recipe_material(uuid,jsonb,public.item_tipo) from public,anon,authenticated;

create or replace function ops_private.save_preparation(p_unit uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_output uuid;v_base uuid;b jsonb;v_inputs jsonb:='[]'::jsonb;v_qty numeric;v_recipe uuid;
  v_signature jsonb;v_type text:=case when p_data->>'transformation'='porcionamento' then 'porcionamento' else 'producao' end;
  v_output_unit text:=coalesce(nullif(p_data->'preparation'->>'outputUnit',''),p_data->>'newUnit');
begin
  v_output:=ops_private.resolve_recipe_material(p_unit,p_data||jsonb_build_object('newUnit',v_output_unit),'semiacabado');
  v_recipe:=nullif(p_data->'preparation'->>'requestId','')::uuid;
  for b in select value from jsonb_array_elements(p_data->'preparation'->'inputs') loop
    v_base:=ops_private.resolve_recipe_material(p_unit,b,'insumo');
    v_qty:=ops_private.to_stock_quantity((b->>'quantity')::numeric,b->>'newUnit',(select unit from public.raw_materials where id=v_base));
    v_inputs:=v_inputs||jsonb_build_array(jsonb_build_object('rawMaterialId',v_base,'quantity',v_qty));
  end loop;
  v_qty:=ops_private.to_stock_quantity((p_data->'preparation'->>'outputQuantity')::numeric,v_output_unit,(select unit from public.raw_materials where id=v_output));
  select jsonb_agg(value order by value->>'rawMaterialId',(value->>'quantity')::numeric) into v_signature from jsonb_array_elements(v_inputs);
  if v_recipe is not null and exists(select 1 from public.production_recipes where id=v_recipe) then
    if not exists(select 1 from public.production_recipes pr where pr.id=v_recipe and pr.business_unit_id=p_unit
      and pr.output_raw_material_id=v_output and pr.output_quantity=v_qty and pr.tipo=v_type and pr.active
      and (select jsonb_agg(jsonb_build_object('rawMaterialId',pi.raw_material_id,'quantity',pi.quantity)
        order by pi.raw_material_id,pi.quantity) from public.production_recipe_inputs pi where pi.recipe_id=pr.id)=v_signature) then
      raise exception 'Solicitação de receita já usada com outro rendimento ou composição';end if;
    return v_output;
  end if;
  if v_recipe is null then
    -- Legacy payloads have no request ID. Reuse the same normalized recipe.
    select pr.id into v_recipe from public.production_recipes pr where pr.business_unit_id=p_unit
      and pr.output_raw_material_id=v_output and pr.output_quantity=v_qty and pr.tipo=v_type and pr.active
      and (select jsonb_agg(jsonb_build_object('rawMaterialId',pi.raw_material_id,'quantity',pi.quantity)
        order by pi.raw_material_id,pi.quantity) from public.production_recipe_inputs pi where pi.recipe_id=pr.id)=v_signature limit 1;
    if found then return v_output;end if;
    v_recipe:=gen_random_uuid();
  end if;
  perform ops_private.insert_production_recipe(p_unit,v_recipe,jsonb_build_object('name','Receita — '||(select name from public.raw_materials where id=v_output),
    'outputRawMaterialId',v_output,'outputQuantity',v_qty,'tipo',v_type,'inputs',v_inputs));
  return v_output;
end $$;
revoke all on function ops_private.save_preparation(uuid,jsonb) from public,anon,authenticated;

create or replace function public.save_menu_item_with_recipe(p_unit uuid,p_item_id text,p_data jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare v_price numeric:=(p_data->>'price')::numeric;v_status text:=p_data->>'status';i jsonb;v_raw uuid;v_qty numeric;v_pos integer:=0;v_lines jsonb:='[]'::jsonb;
begin
  if not ops_private.staff(p_unit,array['admin']) then raise exception 'Sem permissão para alterar cardápio';end if;
  -- Serialize name-based material reuse and menu saves within this unit.
  perform pg_advisory_xact_lock(hashtextextended('menu-stock:'||p_unit::text,0));
  if coalesce(trim(p_data->>'name'),'')='' or v_price is null or v_price<0 or v_price>='Infinity'::numeric
    or v_status is null or v_status not in ('draft','published') or (v_status='published' and v_price<=0) then raise exception 'Nome, preço ou status inválido';end if;
  if not exists(select 1 from public.menu_categories where business_unit_id=p_unit and key=p_data->>'category') then raise exception 'Categoria da unidade não encontrada';end if;
  if jsonb_typeof(p_data->'recipe') is distinct from 'array'
    or jsonb_typeof(p_data->'ingredients') is distinct from 'array'
    or jsonb_typeof(p_data->'variants') is distinct from 'array' then raise exception 'Ficha e opções inválidas';end if;
  perform 1 from public.menu_items where id=p_item_id for update;
  if found then
    if not exists(select 1 from public.menu_items where id=p_item_id and business_unit_id=p_unit) then raise exception 'Item de outra unidade';end if;
    update public.menu_items set name=trim(p_data->>'name'),price=v_price,category=p_data->>'category',description=nullif(trim(p_data->>'description'),''),
      image_url=nullif(trim(p_data->>'image_url'),''),active=coalesce((p_data->>'active')::boolean,true),status=v_status,
      sort_order=coalesce((p_data->>'sort_order')::integer,sort_order),updated_at=now() where id=p_item_id;
  else
    insert into public.menu_items(id,business_unit_id,name,price,category,description,image_url,active,status)
      values(p_item_id,p_unit,trim(p_data->>'name'),v_price,p_data->>'category',nullif(trim(p_data->>'description'),''),
        nullif(trim(p_data->>'image_url'),''),coalesce((p_data->>'active')::boolean,true),v_status);
  end if;
  delete from public.menu_item_ingredients where menu_item_id=p_item_id;
  for i in select value from jsonb_array_elements(p_data->'ingredients') loop
    if coalesce(trim(i->>'name'),'')='' or coalesce((i->>'extra_price')::numeric,0)<0 or coalesce((i->>'extra_price')::numeric,0)>='Infinity'::numeric then raise exception 'Opção de ingrediente inválida';end if;
    insert into public.menu_item_ingredients(menu_item_id,name,removable,extra_price,sort_order)
      values(p_item_id,trim(i->>'name'),coalesce((i->>'removable')::boolean,false),(i->>'extra_price')::numeric,v_pos);v_pos:=v_pos+1;
  end loop;
  delete from public.menu_item_variants where menu_item_id=p_item_id;v_pos:=0;
  for i in select value from jsonb_array_elements(p_data->'variants') loop
    if coalesce(trim(i->>'name'),'')='' then raise exception 'Nome da variante obrigatório';end if;
    insert into public.menu_item_variants(menu_item_id,name,sort_order) values(p_item_id,trim(i->>'name'),v_pos);v_pos:=v_pos+1;
  end loop;
  for i in select value from jsonb_array_elements(p_data->'recipe') loop
    v_qty:=(i->>'quantity')::numeric;
    if v_qty is null or v_qty<=0 or v_qty>='Infinity'::numeric then raise exception 'Quantidade da ficha inválida';end if;
    if i->'preparation' is not null and i->'preparation'<>'null'::jsonb then
      v_raw:=ops_private.save_preparation(p_unit,i);
    else
      v_raw:=ops_private.resolve_recipe_material(p_unit,i,'insumo');
    end if;
    v_qty:=ops_private.to_stock_quantity(v_qty,i->>'newUnit',(select unit from public.raw_materials where id=v_raw));
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object('raw',v_raw,'quantity',v_qty,'display_quantity',(i->>'quantity')::numeric,
      'display_unit',coalesce(nullif(i->>'newUnit',''),(select unit from public.raw_materials where id=v_raw)),'transformacao',coalesce(i->>'transformation','desconto_direto')));
  end loop;
  -- Keep the previous recipe visible while validating initial-unit changes.
  delete from public.recipe_items where menu_item_id=p_item_id;
  for i in select value from jsonb_array_elements(v_lines) loop
    insert into public.recipe_items(menu_item_id,raw_material_id,quantity,display_quantity,display_unit,transformacao)
      values(p_item_id,(i->>'raw')::uuid,(i->>'quantity')::numeric,(i->>'display_quantity')::numeric,i->>'display_unit',i->>'transformacao');
  end loop;
  -- Preserve menu-first theoretical ingredients even before quantities exist.
  insert into public.raw_materials(business_unit_id,name,unit,tipo,min_stock,current_stock,is_theoretical,categoria)
    select p_unit,trim(ing.name),'un','insumo',0,0,true,'Cardápio' from public.menu_item_ingredients ing
    where ing.menu_item_id=p_item_id and not exists(select 1 from public.raw_materials rm where rm.business_unit_id=p_unit and lower(trim(rm.name))=lower(trim(ing.name)))
    group by trim(ing.name);
  perform ops_private.write_recipe_document(p_unit,'menu_item',p_item_id,jsonb_build_object('schema_version',1,'document_type','ficha_tecnica',
    'output',jsonb_build_object('id',p_item_id,'type','menu_item','name',trim(p_data->>'name'),'unit','un','quantity',1),
    'ingredients',coalesce((select jsonb_agg(jsonb_build_object('raw_material_id',ri.raw_material_id,'name',rm.name,'quantity',ri.display_quantity,
      'unit',ri.display_unit,'process',ri.transformacao)) from public.recipe_items ri join public.raw_materials rm on rm.id=ri.raw_material_id where ri.menu_item_id=p_item_id),'[]'::jsonb)),
    case when v_status='published' then 'active' else 'draft' end);
  return p_item_id;
end $$;
revoke all on function public.save_menu_item_with_recipe(uuid,text,jsonb) from public,anon;
grant execute on function public.save_menu_item_with_recipe(uuid,text,jsonb) to authenticated;

