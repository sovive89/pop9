-- Exporta um item do cardápio para outras unidades (cópia exata da ficha técnica).
-- Aditiva: não altera nenhuma função/tabela existente.
-- Reaproveita public.save_menu_item_with_recipe para cada unidade de destino; assim os
-- insumos nascem como estoque TEÓRICO (is_theoretical=true) e SEM lotes, compras,
-- movimentações ou saldos (ver resolve_recipe_material).
-- Itens/receitas de PRODUÇÃO (production_recipes, semiacabados) NÃO são exportados: a ficha
-- leva só o insumo (nome/unidade/quantidade); produção continua própria de cada unidade.
-- Idempotente: se a unidade de destino já tem item com o mesmo nome e categoria, ele é
-- atualizado em vez de duplicado. Falhas são isoladas por unidade (subtransação).
create or replace function public.export_menu_item_to_units(p_source_unit uuid, p_item_id text, p_target_units uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  it public.menu_items%rowtype; c public.menu_categories%rowtype;
  v_target uuid; v_new_id text; v_data jsonb; v_recipe jsonb; v_results jsonb:='[]'::jsonb;
  v_units text[]:=array['g','kg','ml','L','un','caixa','pacote','saco','cx','dz','pct'];
begin
  if not ops_private.staff(p_source_unit,array['admin']) then raise exception 'Sem permissão na unidade de origem';end if;
  select * into it from public.menu_items where id=p_item_id and business_unit_id=p_source_unit;
  if not found then raise exception 'Item não encontrado na unidade de origem';end if;
  select * into c from public.menu_categories where business_unit_id=p_source_unit and key=it.category;

  -- Ficha técnica da origem: quantidade/unidade exibidas + unidade-base do insumo.
  select coalesce(jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'newName',rm.name,
        'newUnit',coalesce(nullif(ri.display_unit,''),rm.unit),
        'stockUnit',case when rm.unit=any(v_units) then rm.unit end,
        'quantity',coalesce(ri.display_quantity,ri.quantity),
        'transformation',ri.transformacao
      ))),'[]'::jsonb) into v_recipe
    from public.recipe_items ri join public.raw_materials rm on rm.id=ri.raw_material_id
    where ri.menu_item_id=p_item_id;

  v_data:=jsonb_build_object('name',it.name,'price',it.price,'category',it.category,'description',it.description,
    'image_url',it.image_url,'active',it.active,'status',it.status,'sort_order',it.sort_order,'recipe',v_recipe,
    'ingredients',coalesce((select jsonb_agg(jsonb_build_object('name',g.name,'removable',g.removable,'extra_price',g.extra_price)
        order by g.sort_order) from public.menu_item_ingredients g where g.menu_item_id=p_item_id),'[]'::jsonb),
    'variants',coalesce((select jsonb_agg(jsonb_build_object('name',v.name) order by v.sort_order)
        from public.menu_item_variants v where v.menu_item_id=p_item_id),'[]'::jsonb));

  for v_target in select distinct u from unnest(p_target_units) u where u<>p_source_unit loop
    begin
      if not ops_private.staff(v_target,array['admin']) then raise exception 'Sem permissão na unidade de destino';end if;
      if not exists(select 1 from public.business_units where id=v_target) then raise exception 'Unidade de destino inexistente';end if;
      -- Categoria: cria a cópia se a unidade de destino ainda não tiver.
      if not exists(select 1 from public.menu_categories where business_unit_id=v_target and key=it.category) then
        insert into public.menu_categories(business_unit_id,key,label,destination,sort_order,icon_name,icon_color)
          values(v_target,it.category,coalesce(c.label,it.category),coalesce(c.destination,'kitchen'),
            coalesce(c.sort_order,0),c.icon_name,c.icon_color);
      end if;
      -- Reexportar atualiza a cópia existente (mesmo nome + categoria) em vez de duplicar.
      select id into v_new_id from public.menu_items
        where business_unit_id=v_target and category=it.category and lower(trim(name))=lower(trim(it.name)) limit 1;
      v_new_id:=coalesce(v_new_id,gen_random_uuid()::text);
      perform public.save_menu_item_with_recipe(v_target,v_new_id,v_data);
      v_results:=v_results||jsonb_build_array(jsonb_build_object('unit_id',v_target,'ok',true,'item_id',v_new_id));
    exception when others then
      v_results:=v_results||jsonb_build_array(jsonb_build_object('unit_id',v_target,'ok',false,'error',sqlerrm));
    end;
  end loop;
  return v_results;
end $$;
revoke all on function public.export_menu_item_to_units(uuid,text,uuid[]) from public,anon;
grant execute on function public.export_menu_item_to_units(uuid,text,uuid[]) to authenticated;
