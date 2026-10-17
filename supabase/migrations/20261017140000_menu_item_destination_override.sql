-- Setor opcional por item. NULL mantém o comportamento existente: herdar da categoria.
-- A migration é aditiva; nenhum item nem pedido já registrado é reescrito.
alter table public.menu_items add column if not exists destination text;
comment on column public.menu_items.destination is
  'Override opcional do setor de preparo/impressão; NULL herda menu_categories.destination.';

create or replace function app_private.set_order_item_destination()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_dest text;
begin
  if new.menu_item_id is not null then
    select coalesce(nullif(mi.destination, ''), nullif(mc.destination, '')) into v_dest
      from public.orders o
      join public.menu_items mi on mi.id = new.menu_item_id and mi.business_unit_id = o.business_unit_id
      left join public.menu_categories mc on mc.key = mi.category and mc.business_unit_id = o.business_unit_id
     where o.id = new.order_id;
    if nullif(v_dest, '') is not null then new.destination := v_dest; end if;
  end if;
  new.destination := coalesce(nullif(new.destination, ''), 'kitchen');
  return new;
end;
$$;
revoke all on function app_private.set_order_item_destination() from public;

-- Persist the optional destination in the same transaction as the item and its recipe.
-- Omission by an older client preserves the current override; explicit JSON null clears it.
create or replace function public.save_menu_item_with_recipe(p_unit uuid,p_item_id text,p_data jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare
  v_price numeric:=(p_data->>'price')::numeric;
  v_status text:=p_data->>'status';
  v_destination text;
  i jsonb;
  v_raw uuid;
  v_qty numeric;
  v_pos integer:=0;
  v_lines jsonb:='[]'::jsonb;
begin
  if not ops_private.staff(p_unit,array['admin']) then raise exception 'Sem permissão para alterar cardápio';end if;
  -- Serialize name-based material reuse and menu saves within this unit.
  perform pg_advisory_xact_lock(hashtextextended('menu-stock:'||p_unit::text,0));
  if coalesce(trim(p_data->>'name'),'')='' or v_price is null or v_price<0 or v_price>='Infinity'::numeric
    or v_status is null or v_status not in ('draft','published') or (v_status='published' and v_price<=0) then raise exception 'Nome, preço ou status inválido';end if;
  if not exists(select 1 from public.menu_categories where business_unit_id=p_unit and key=p_data->>'category') then raise exception 'Categoria da unidade não encontrada';end if;
  if p_data ? 'destination' then
    v_destination:=nullif(trim(p_data->>'destination'),'');
    if v_destination is not null and not exists(
      select 1 from public.print_sectors where business_unit_id=p_unit and slug=v_destination
    ) then raise exception 'Setor não encontrado nesta unidade';end if;
  end if;
  if jsonb_typeof(p_data->'recipe') is distinct from 'array'
    or jsonb_typeof(p_data->'ingredients') is distinct from 'array'
    or jsonb_typeof(p_data->'variants') is distinct from 'array' then raise exception 'Ficha e opções inválidas';end if;
  perform 1 from public.menu_items where id=p_item_id for update;
  if found then
    if not exists(select 1 from public.menu_items where id=p_item_id and business_unit_id=p_unit) then raise exception 'Item de outra unidade';end if;
    update public.menu_items set name=trim(p_data->>'name'),price=v_price,category=p_data->>'category',description=nullif(trim(p_data->>'description'),''),
      image_url=nullif(trim(p_data->>'image_url'),''),active=coalesce((p_data->>'active')::boolean,true),status=v_status,
      sort_order=coalesce((p_data->>'sort_order')::integer,sort_order),
      destination=case when p_data ? 'destination' then v_destination else destination end,
      updated_at=now() where id=p_item_id;
  else
    insert into public.menu_items(id,business_unit_id,name,price,category,description,image_url,active,status,destination)
      values(p_item_id,p_unit,trim(p_data->>'name'),v_price,p_data->>'category',nullif(trim(p_data->>'description'),''),
        nullif(trim(p_data->>'image_url'),''),coalesce((p_data->>'active')::boolean,true),v_status,v_destination);
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

-- The copy RPC carries the same override when the destination unit has that sector;
-- otherwise it leaves NULL so the copied item safely inherits its copied category.
create or replace function public.export_menu_item_to_units(p_source_unit uuid, p_item_id text, p_target_units uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  it public.menu_items%rowtype;
  c public.menu_categories%rowtype;
  v_target uuid;
  v_new_id text;
  v_data jsonb;
  v_target_data jsonb;
  v_recipe jsonb;
  v_results jsonb:='[]'::jsonb;
  v_units text[]:=array['g','kg','ml','L','un','caixa','pacote','saco','cx','dz','pct'];
begin
  if not ops_private.staff(p_source_unit,array['admin']) then raise exception 'Sem permissão na unidade de origem';end if;
  select * into it from public.menu_items where id=p_item_id and business_unit_id=p_source_unit;
  if not found then raise exception 'Item não encontrado na unidade de origem';end if;
  select * into c from public.menu_categories where business_unit_id=p_source_unit and key=it.category;

  select coalesce(jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'newName',rm.name,
        'newUnit',coalesce(nullif(ri.display_unit,''),rm.unit),
        'stockUnit',case when rm.unit=any(v_units) then rm.unit end,
        'quantity',coalesce(ri.display_quantity,ri.quantity),
        'transformation',ri.transformacao,
        'preparation',(select jsonb_build_object('outputUnit',rm.unit,'outputQuantity',pr.output_quantity,
            'inputs',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('newName',b.name,'newUnit',b.unit,
                'stockUnit',case when b.unit=any(v_units) then b.unit end,'quantity',pi.quantity)))
              from public.production_recipe_inputs pi join public.raw_materials b on b.id=pi.raw_material_id
              where pi.recipe_id=pr.id),'[]'::jsonb))
          from public.production_recipes pr where pr.output_raw_material_id=rm.id and pr.active
            and pr.business_unit_id=p_source_unit order by pr.id limit 1)
      ))),'[]'::jsonb) into v_recipe
    from public.recipe_items ri join public.raw_materials rm on rm.id=ri.raw_material_id
    where ri.menu_item_id=p_item_id;

  v_data:=jsonb_build_object('name',it.name,'price',it.price,'category',it.category,'description',it.description,
    'image_url',it.image_url,'active',it.active,'status',it.status,'sort_order',it.sort_order,'destination',it.destination,'recipe',v_recipe,
    'ingredients',coalesce((select jsonb_agg(jsonb_build_object('name',g.name,'removable',g.removable,'extra_price',g.extra_price)
        order by g.sort_order) from public.menu_item_ingredients g where g.menu_item_id=p_item_id),'[]'::jsonb),
    'variants',coalesce((select jsonb_agg(jsonb_build_object('name',v.name) order by v.sort_order)
        from public.menu_item_variants v where v.menu_item_id=p_item_id),'[]'::jsonb));

  for v_target in select distinct u from unnest(p_target_units) u where u<>p_source_unit loop
    begin
      if not ops_private.staff(v_target,array['admin']) then raise exception 'Sem permissão na unidade de destino';end if;
      if not exists(select 1 from public.business_units where id=v_target) then raise exception 'Unidade de destino inexistente';end if;
      if not exists(select 1 from public.menu_categories where business_unit_id=v_target and key=it.category) then
        insert into public.menu_categories(business_unit_id,key,label,destination,sort_order,icon_name,icon_color)
          values(v_target,it.category,coalesce(c.label,it.category),coalesce(c.destination,'kitchen'),
            coalesce(c.sort_order,0),c.icon_name,c.icon_color);
      end if;
      select id into v_new_id from public.menu_items
        where business_unit_id=v_target and category=it.category and lower(trim(name))=lower(trim(it.name)) limit 1;
      v_new_id:=coalesce(v_new_id,gen_random_uuid()::text);
      v_target_data:=jsonb_set(v_data,'{destination}',
        case when it.destination is null then 'null'::jsonb
             when exists(select 1 from public.print_sectors where business_unit_id=v_target and slug=it.destination) then to_jsonb(it.destination)
             else 'null'::jsonb end,true);
      perform public.save_menu_item_with_recipe(v_target,v_new_id,v_target_data);
      v_results:=v_results||jsonb_build_array(jsonb_build_object('unit_id',v_target,'ok',true,'item_id',v_new_id));
    exception when others then
      v_results:=v_results||jsonb_build_array(jsonb_build_object('unit_id',v_target,'ok',false,'error',sqlerrm));
    end;
  end loop;
  return v_results;
end $$;
revoke all on function public.export_menu_item_to_units(uuid,text,uuid[]) from public,anon;
grant execute on function public.export_menu_item_to_units(uuid,text,uuid[]) to authenticated;
