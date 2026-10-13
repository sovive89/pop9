-- Findings and compatibility decisions: docs/menu-stock-lot-review.md.
-- Reuse the canonical stock ledger; do not create another balance or debit.
alter table public.raw_materials add column if not exists is_theoretical boolean not null default false;
alter table public.recipe_items add column if not exists display_quantity numeric,
  add column if not exists display_unit text,
  add column if not exists transformacao text not null default 'desconto_direto';
-- menu_items.id is text. The document identity must support the same IDs.
create table if not exists public.technical_documents (
  id uuid primary key default gen_random_uuid(),business_unit_id uuid not null references public.business_units(id),
  document_type text not null check(document_type='ficha_tecnica'),entity_type text not null check(entity_type in('menu_item','raw_material')),
  entity_id text not null,revision integer not null default 1 check(revision>0),status text not null default 'draft' check(status in('draft','active','archived')),
  document jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(business_unit_id,document_type,entity_type,entity_id,revision)
);
alter table public.technical_documents alter column entity_id type text using entity_id::text;
alter table public.technical_documents enable row level security;
create policy stock_review_documents_read on public.technical_documents for select to authenticated
  using(ops_private.staff(business_unit_id,array['admin','kitchen']));
create policy stock_review_documents_write on public.technical_documents for all to authenticated
  using(ops_private.staff(business_unit_id,array['admin'])) with check(ops_private.staff(business_unit_id,array['admin']));
grant select,insert,update,delete on public.technical_documents to authenticated;
create index if not exists stock_movements_lot_history on public.stock_movements(lote_id) where lote_id is not null;
create index if not exists recipe_items_menu_stock on public.recipe_items(menu_item_id, raw_material_id);
create unique index if not exists lotes_one_production_batch on public.lotes(batch_id) where batch_id is not null;

-- Associate unambiguous historical production consumption with its existing
-- movement. UPDATE does not replay the stock INSERT trigger.
with candidates as (
  select pi.id input_id, sm.id movement_id, pi.lote_id,
    count(*) over (partition by pi.id) inputs_matches,
    count(*) over (partition by sm.id) movement_matches
  from public.production_batch_inputs pi
  join public.production_batches pb on pb.id=pi.batch_id
  join public.stock_movements sm on sm.reference_id=pi.batch_id
    and sm.reference_type='production_batch' and sm.reason='producao_consumo'
    and sm.type='saida' and sm.raw_material_id=pi.raw_material_id
    and sm.quantity=pi.quantity_used and sm.business_unit_id=pb.business_unit_id
  where pi.lote_id is not null and sm.lote_id is null
)
update public.stock_movements sm set lote_id=c.lote_id,
  reference_type='production_batch_input', reference_id=c.input_id
from candidates c where sm.id=c.movement_id and c.inputs_matches=1 and c.movement_matches=1;
do $$ begin
  if exists(select 1 from public.production_batch_inputs pi where pi.lote_id is not null
    and not exists(select 1 from public.stock_movements sm where sm.lote_id=pi.lote_id
      and sm.raw_material_id=pi.raw_material_id and sm.quantity=pi.quantity_used
      and sm.reference_type='production_batch_input' and sm.reference_id=pi.id)) then
    raise exception 'Consumo histórico de produção ambíguo: reconcilie os movimentos antes desta migration';
  end if;
end $$;

create or replace function ops_private.lot_remaining(p_lote uuid)
returns numeric language sql stable security definer set search_path='' as $$
  select l.quantidade_entrada - coalesce(sum(case when sm.type='saida' then sm.quantity else -sm.quantity end),0)
  from public.lotes l left join public.stock_movements sm on sm.lote_id=l.id
    and sm.reference_type is distinct from 'lote_correcao'
    and sm.reason not in ('compra','producao_output')
  where l.id=p_lote group by l.id;
$$;
revoke all on function ops_private.lot_remaining(uuid) from public, anon, authenticated;

-- Single source for the lot screen. RLS on both tables still applies.
create or replace view public.stock_lot_balances with (security_invoker=true) as
select l.*, l.quantidade_entrada - coalesce(m.consumed,0) as quantidade_restante
from public.lotes l left join lateral (
  select sum(case when sm.type='saida' then sm.quantity else -sm.quantity end) consumed
  from public.stock_movements sm where sm.lote_id=l.id
    and sm.business_unit_id=l.business_unit_id
    and sm.reference_type is distinct from 'lote_correcao'
    and sm.reason not in ('compra','producao_output')
) m on true;
grant select on public.stock_lot_balances to authenticated;
revoke all on public.stock_lot_balances from anon;
alter view public.production_labels set (security_invoker=true);

create or replace function public.apply_stock_movement()
returns trigger language plpgsql security definer set search_path='' as $$
declare r public.raw_materials%rowtype; l public.lotes%rowtype; v_cost numeric;
begin
  select * into r from public.raw_materials where id=new.raw_material_id for update;
  if not found or r.business_unit_id is distinct from new.business_unit_id then
    raise exception 'Insumo de outra unidade ou inexistente';
  end if;
  if new.quantity is null or new.quantity<=0 or new.quantity>='Infinity'::numeric
    or (new.unit_cost is not null and (new.unit_cost<0 or new.unit_cost>='Infinity'::numeric)) then
    raise exception 'Quantidade ou custo inválido';
  end if;
  if new.lote_id is not null then
    select * into l from public.lotes where id=new.lote_id for update;
    if not found or l.cancelado_em is not null or l.raw_material_id<>r.id
      or l.business_unit_id is distinct from new.business_unit_id then
      raise exception 'Lote incompatível com o insumo ou unidade';
    end if;
    if new.type='saida' and new.reference_type is distinct from 'lote_correcao'
      and ops_private.lot_remaining(l.id)<new.quantity then raise exception 'Saldo do lote insuficiente'; end if;
  end if;
  v_cost := r.average_cost;
  if new.type='entrada' and new.unit_cost is not null then
    -- A negative legacy balance carries no inventory cost into a new purchase.
    v_cost := (greatest(r.current_stock,0)*r.average_cost + new.quantity*new.unit_cost)
      / (greatest(r.current_stock,0)+new.quantity);
  end if;
  update public.raw_materials set current_stock=current_stock+
    case when new.type='entrada' then new.quantity else -new.quantity end,
    average_cost=v_cost, is_theoretical=false, updated_at=now() where id=r.id;
  return new;
end $$;
drop trigger if exists trg_apply_stock_movement on public.stock_movements;
create trigger trg_apply_stock_movement before insert on public.stock_movements
for each row execute function public.apply_stock_movement();

create or replace function ops_private.allocate_stock_lots(p_unit uuid,p_raw uuid,p_quantity numeric)
returns table(lote_id uuid, quantity numeric) language plpgsql security definer set search_path='' as $$
declare l record; v_remaining numeric:=p_quantity; v_available numeric;
begin
  if p_quantity is null or p_quantity<=0 or p_quantity>='Infinity'::numeric then raise exception 'Quantidade inválida'; end if;
  perform 1 from public.raw_materials where id=p_raw and business_unit_id=p_unit for update;
  if not found then raise exception 'Insumo de outra unidade ou inexistente'; end if;
  for l in select id from public.lotes where raw_material_id=p_raw and business_unit_id=p_unit
    and cancelado_em is null order by validade asc nulls last,data_entrada,id for update
  loop
    exit when v_remaining<=0;
    v_available:=greatest(0,ops_private.lot_remaining(l.id));
    if v_available>0 then
      lote_id:=l.id; quantity:=least(v_available,v_remaining); return next;
      v_remaining:=v_remaining-quantity;
    end if;
  end loop;
  if v_remaining>0 then lote_id:=null;quantity:=v_remaining;return next;end if;
end $$;
revoke all on function ops_private.allocate_stock_lots(uuid,uuid,numeric) from public,anon,authenticated;

create or replace function public.order_item_deducts_stock()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_unit uuid; r record; a record;
begin
  select business_unit_id into v_unit from public.orders where id=new.order_id;
  if v_unit is null then raise exception 'Pedido sem unidade'; end if;
  perform 1 from public.menu_items where id=new.menu_item_id and business_unit_id=v_unit for share;
  if not found then raise exception 'Item de cardápio de outra unidade ou inexistente'; end if;
  if new.quantity<=0 then raise exception 'Quantidade do pedido inválida';end if;
  if exists(select 1 from public.recipe_items ri left join public.raw_materials rm on rm.id=ri.raw_material_id
    where ri.menu_item_id=new.menu_item_id and (rm.business_unit_id is distinct from v_unit
      or ri.quantity<=0 or ri.quantity>='Infinity'::numeric)) then raise exception 'Ficha técnica inválida ou de outra unidade';end if;
  -- Deterministic material order avoids deadlocks between concurrent orders.
  for r in select raw_material_id,sum(quantity)*new.quantity needed from public.recipe_items
    where menu_item_id=new.menu_item_id group by raw_material_id order by raw_material_id
  loop
    for a in select * from ops_private.allocate_stock_lots(v_unit,r.raw_material_id,r.needed) loop
      insert into public.stock_movements(business_unit_id,raw_material_id,type,quantity,reason,reference_type,reference_id,lote_id,unit_cost)
      values(v_unit,r.raw_material_id,'saida',a.quantity,'venda','order_item',new.id,a.lote_id,
        coalesce((select preco_unitario from public.lotes where id=a.lote_id),
          (select average_cost from public.raw_materials where id=r.raw_material_id)));
    end loop;
  end loop;
  return new;
end $$;

create or replace function public.production_batch_credits_stock()
returns trigger language plpgsql security definer set search_path='' as $$
declare r public.production_recipes%rowtype; v_lot uuid; v_cost numeric;
begin
  select * into r from public.production_recipes where id=new.recipe_id and business_unit_id=new.business_unit_id;
  if not found or not r.active or new.quantity_produced<=0 or new.quantity_produced>='Infinity'::numeric then
    raise exception 'Receita ou quantidade de produção inválida'; end if;
  if not exists(select 1 from public.raw_materials where id=r.output_raw_material_id and business_unit_id=new.business_unit_id) then
    raise exception 'Saída de produção de outra unidade';end if;
  select sum(pi.quantity*rm.average_cost)/nullif(r.output_quantity,0) into v_cost
    from public.production_recipe_inputs pi join public.raw_materials rm on rm.id=pi.raw_material_id where pi.recipe_id=r.id;
  insert into public.lotes(raw_material_id,business_unit_id,numero_lote,origem,quantidade_entrada,validade,receita_id,batch_id,preco_unitario)
    values(r.output_raw_material_id,new.business_unit_id,coalesce(new.batch_code,'P-'||new.id::text),'producao',
      new.quantity_produced,new.expires_at::date,r.id,new.id,v_cost) returning id into v_lot;
  insert into public.stock_movements(raw_material_id,business_unit_id,type,quantity,reason,reference_type,reference_id,lote_id,unit_cost,created_by)
    values(r.output_raw_material_id,new.business_unit_id,'entrada',new.quantity_produced,'producao_output',
      'production_batch',new.id,v_lot,v_cost,new.produced_by);
  return new;
end $$;

create or replace function public.production_batch_before_insert()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_days integer;
begin
  if new.batch_code is null then new.batch_code:=to_char(new.produced_at,'YYYYMMDD')||'-'||new.id::text;end if;
  if new.expires_at is null then
    select shelf_life_days into v_days from public.production_recipes where id=new.recipe_id and business_unit_id=new.business_unit_id;
    if v_days is not null then new.expires_at:=new.produced_at+make_interval(days=>v_days);end if;
  end if;
  return new;
end $$;

create or replace function public.production_batch_input_deducts_stock()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_unit uuid;
begin
  select business_unit_id into v_unit from public.production_batches where id=new.batch_id;
  if v_unit is null then raise exception 'Produção sem unidade';end if;
  insert into public.stock_movements(raw_material_id,business_unit_id,type,quantity,reason,reference_type,reference_id,lote_id,unit_cost)
    values(new.raw_material_id,v_unit,'saida',new.quantity_used,'producao_consumo','production_batch_input',new.id,new.lote_id,
      coalesce((select preco_unitario from public.lotes where id=new.lote_id),
        (select average_cost from public.raw_materials where id=new.raw_material_id)));
  return new;
end $$;

-- Freeze the verified trigger wiring as well as its implementations.
drop trigger if exists trg_order_item_deducts_stock on public.order_items;
create trigger trg_order_item_deducts_stock after insert on public.order_items for each row execute function public.order_item_deducts_stock();
drop trigger if exists trg_production_batch_before_insert on public.production_batches;
create trigger trg_production_batch_before_insert before insert on public.production_batches for each row execute function public.production_batch_before_insert();
drop trigger if exists trg_production_batch_credits_stock on public.production_batches;
create trigger trg_production_batch_credits_stock after insert on public.production_batches for each row execute function public.production_batch_credits_stock();
drop trigger if exists trg_production_batch_input_deducts_stock on public.production_batch_inputs;
create trigger trg_production_batch_input_deducts_stock after insert on public.production_batch_inputs for each row execute function public.production_batch_input_deducts_stock();

create or replace function ops_private.resolve_recipe_material(p_unit uuid,p_input jsonb,p_type public.item_tipo)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.raw_materials%rowtype; v_name text:=trim(p_input->>'newName'); v_unit text:=trim(p_input->>'newUnit');v_id uuid;
begin
  v_id:=nullif(p_input->>'rawMaterialId','')::uuid;
  if v_id is not null then
    select * into r from public.raw_materials where id=v_id and business_unit_id=p_unit and active;
    if not found then raise exception 'Insumo de outra unidade, inativo ou inexistente';end if;
  else
    if coalesce(v_name,'')='' or coalesce(v_unit,'')='' then raise exception 'Nome e unidade do insumo obrigatórios';end if;
    select * into r from public.raw_materials where business_unit_id=p_unit and lower(trim(name))=lower(v_name) limit 1;
    if not found then
      insert into public.raw_materials(business_unit_id,name,unit,tipo,min_stock,current_stock,is_theoretical)
        values(p_unit,v_name,v_unit,p_type,0,0,true) returning * into r;
    elsif not r.active then raise exception 'Insumo inativo: %',v_name;end if;
  end if;
  -- Names inferred from a menu start with an undefined theoretical 'un'.
  -- Define their first actual base unit only before any recipe or stock use.
  if r.is_theoretical and r.unit='un' and coalesce(v_unit,'')<>'' and v_unit<>'un' and r.current_stock=0
    and not exists(select 1 from public.stock_movements where raw_material_id=r.id)
    and not exists(select 1 from public.recipe_items where raw_material_id=r.id)
    and not exists(select 1 from public.production_recipe_inputs where raw_material_id=r.id) then
    update public.raw_materials set unit=v_unit where id=r.id;
  end if;
  if p_type='semiacabado' and not r.is_produced then update public.raw_materials set tipo='semiacabado' where id=r.id;end if;
  return r.id;
end $$;
revoke all on function ops_private.resolve_recipe_material(uuid,jsonb,public.item_tipo) from public,anon,authenticated;

create or replace function ops_private.to_stock_quantity(p_qty numeric,p_display text,p_stock text)
returns numeric language plpgsql immutable set search_path='' as $$
declare v_from text:=lower(trim(p_display));v_to text:=lower(trim(p_stock));v_factor numeric;
begin
  if coalesce(v_from,'')='' or v_from=v_to then return p_qty;end if;
  v_factor:=case when v_from='kg' and v_to='g' then 1000 when v_from='g' and v_to='kg' then 0.001
    when v_from='l' and v_to='ml' then 1000 when v_from='ml' and v_to='l' then 0.001
    when v_from='dz' and v_to='un' then 12 when v_from='un' and v_to='dz' then 1.0/12 end;
  if v_factor is null then raise exception 'Unidade da ficha incompatível com a unidade-base: % → %',p_display,p_stock;end if;
  return p_qty*v_factor;
end $$;
revoke all on function ops_private.to_stock_quantity(numeric,text,text) from public,anon,authenticated;

create or replace function ops_private.write_recipe_document(p_unit uuid,p_kind text,p_id text,p_body jsonb,p_status text default 'draft')
returns void language plpgsql security definer set search_path='' as $$
declare v_revision integer;v_previous jsonb;v_previous_status text;
begin
  select revision,document,status into v_revision,v_previous,v_previous_status from public.technical_documents where business_unit_id=p_unit and entity_type=p_kind
    and entity_id=p_id and document_type='ficha_tecnica' order by revision desc limit 1;
  if v_previous=p_body and v_previous_status=p_status then return;end if;
  insert into public.technical_documents(business_unit_id,document_type,entity_type,entity_id,revision,status,document)
    values(p_unit,'ficha_tecnica',p_kind,p_id,coalesce(v_revision,0)+1,p_status,p_body);
end $$;
revoke all on function ops_private.write_recipe_document(uuid,text,text,jsonb,text) from public,anon,authenticated;

create or replace function ops_private.insert_production_recipe(p_unit uuid,p_id uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_output uuid:=(p_data->>'outputRawMaterialId')::uuid; v_qty numeric:=(p_data->>'outputQuantity')::numeric; i jsonb;v_raw uuid;v_input_qty numeric;
begin
  if exists(select 1 from public.production_recipes where id=p_id and business_unit_id=p_unit) then return p_id;end if;
  if coalesce(trim(p_data->>'name'),'')='' or v_qty is null or v_qty<=0 or v_qty>='Infinity'::numeric
    or jsonb_typeof(p_data->'inputs') is distinct from 'array' or jsonb_array_length(p_data->'inputs')=0 then
    raise exception 'Receita de produção inválida';end if;
  if not exists(select 1 from public.raw_materials where id=v_output and business_unit_id=p_unit and active and is_produced) then
    raise exception 'Saída deve ser um insumo produzido da unidade';end if;
  if coalesce((p_data->>'shelfLifeDays')::integer,0)<0
    or coalesce((p_data->>'tempoProducao')::integer,0)<0
    or coalesce((p_data->>'perdaEsperada')::numeric,0)<0
    or coalesce((p_data->>'perdaEsperada')::numeric,0)>100 then raise exception 'Validade, perda ou tempo inválido';end if;
  insert into public.production_recipes(id,business_unit_id,name,output_raw_material_id,output_quantity,shelf_life_days,tipo,perda_esperada,tempo_producao)
    values(p_id,p_unit,trim(p_data->>'name'),v_output,v_qty,(p_data->>'shelfLifeDays')::integer,
      coalesce(p_data->>'tipo','producao'),(p_data->>'perdaEsperada')::numeric,(p_data->>'tempoProducao')::integer);
  for i in select value from jsonb_array_elements(p_data->'inputs') loop
    v_raw:=(i->>'rawMaterialId')::uuid;v_input_qty:=(i->>'quantity')::numeric;
    if v_input_qty is null or v_input_qty<=0 or v_input_qty>='Infinity'::numeric
      or not exists(select 1 from public.raw_materials where id=v_raw and business_unit_id=p_unit and active) then
      raise exception 'Insumo-base ou quantidade inválida';end if;
    insert into public.production_recipe_inputs(recipe_id,raw_material_id,quantity) values(p_id,v_raw,v_input_qty);
  end loop;
  if exists(with recursive dependencies(id) as (
    select raw_material_id from public.production_recipe_inputs where recipe_id=p_id
    union select pi.raw_material_id from dependencies d join public.production_recipes pr on pr.output_raw_material_id=d.id
      and pr.business_unit_id=p_unit and pr.active join public.production_recipe_inputs pi on pi.recipe_id=pr.id
  ) select 1 from dependencies where id=v_output) then raise exception 'Receita de produção circular';end if;
  perform ops_private.write_recipe_document(p_unit,'raw_material',v_output::text,jsonb_build_object('schema_version',1,'document_type','ficha_tecnica',
    'output',jsonb_build_object('id',v_output,'type','raw_material','name',(select name from public.raw_materials where id=v_output),
      'unit',(select unit from public.raw_materials where id=v_output),'quantity',v_qty),
    'ingredients',(select jsonb_agg(jsonb_build_object('raw_material_id',pi.raw_material_id,'name',rm.name,'quantity',pi.quantity,'unit',rm.unit,'process','desconto_direto'))
      from public.production_recipe_inputs pi join public.raw_materials rm on rm.id=pi.raw_material_id where pi.recipe_id=p_id)));
  return p_id;
end $$;
revoke all on function ops_private.insert_production_recipe(uuid,uuid,jsonb) from public,anon,authenticated;

create or replace function ops_private.save_preparation(p_unit uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_output uuid;v_base uuid;b jsonb;v_inputs jsonb:='[]'::jsonb;v_qty numeric;v_recipe uuid;
begin
  v_output:=ops_private.resolve_recipe_material(p_unit,p_data,'semiacabado');
  v_recipe:=coalesce(nullif(p_data->'preparation'->>'requestId','')::uuid,gen_random_uuid());
  for b in select value from jsonb_array_elements(p_data->'preparation'->'inputs') loop
    v_base:=ops_private.resolve_recipe_material(p_unit,b,'insumo');
    v_qty:=ops_private.to_stock_quantity((b->>'quantity')::numeric,b->>'newUnit',(select unit from public.raw_materials where id=v_base));
    v_inputs:=v_inputs||jsonb_build_array(jsonb_build_object('rawMaterialId',v_base,'quantity',v_qty));
  end loop;
  v_qty:=ops_private.to_stock_quantity((p_data->'preparation'->>'outputQuantity')::numeric,p_data->>'newUnit',(select unit from public.raw_materials where id=v_output));
  perform ops_private.insert_production_recipe(p_unit,v_recipe,jsonb_build_object('name','Receita — '||(select name from public.raw_materials where id=v_output),
    'outputRawMaterialId',v_output,'outputQuantity',v_qty,'tipo',case when p_data->>'transformation'='porcionamento' then 'porcionamento' else 'producao' end,'inputs',v_inputs));
  return v_output;
end $$;
revoke all on function ops_private.save_preparation(uuid,jsonb) from public,anon,authenticated;

create or replace function public.save_stock_preparation(p_unit uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  if not ops_private.staff(p_unit,array['admin']) then raise exception 'Sem permissão para salvar ficha de produção';end if;
  perform pg_advisory_xact_lock(hashtextextended('menu-stock:'||p_unit::text,0));
  return ops_private.save_preparation(p_unit,p_data);
end $$;
revoke all on function public.save_stock_preparation(uuid,jsonb) from public,anon;
grant execute on function public.save_stock_preparation(uuid,jsonb) to authenticated;

create or replace function public.save_menu_item_with_recipe(p_unit uuid,p_item_id text,p_data jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare v_price numeric:=(p_data->>'price')::numeric;v_status text:=p_data->>'status';i jsonb;b jsonb;v_raw uuid;v_base uuid;v_inputs jsonb;v_qty numeric;v_pos integer:=0;
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
  delete from public.recipe_items where menu_item_id=p_item_id;
  for i in select value from jsonb_array_elements(p_data->'recipe') loop
    v_qty:=(i->>'quantity')::numeric;
    if v_qty is null or v_qty<=0 or v_qty>='Infinity'::numeric then raise exception 'Quantidade da ficha inválida';end if;
    v_raw:=ops_private.resolve_recipe_material(p_unit,i,case when i->'preparation' is not null and i->'preparation'<>'null'::jsonb then 'semiacabado'::public.item_tipo else 'insumo'::public.item_tipo end);
    if i->'preparation' is not null and i->'preparation'<>'null'::jsonb
      and not exists(select 1 from public.production_recipes where business_unit_id=p_unit and output_raw_material_id=v_raw and active) then
      v_raw:=ops_private.save_preparation(p_unit,i);
    end if;
    v_qty:=ops_private.to_stock_quantity(v_qty,i->>'newUnit',(select unit from public.raw_materials where id=v_raw));
    insert into public.recipe_items(menu_item_id,raw_material_id,quantity,display_quantity,display_unit,transformacao)
      values(p_item_id,v_raw,v_qty,(i->>'quantity')::numeric,coalesce(nullif(i->>'newUnit',''),(select unit from public.raw_materials where id=v_raw)),coalesce(i->>'transformation','desconto_direto'));
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

create or replace function public.create_stock_recipe(p_unit uuid,p_recipe_id uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  if not ops_private.staff(p_unit,array['admin']) then raise exception 'Sem permissão para criar receita';end if;
  perform pg_advisory_xact_lock(hashtextextended('menu-stock:'||p_unit::text,0));
  return ops_private.insert_production_recipe(p_unit,p_recipe_id,p_data);
end $$;
revoke all on function public.create_stock_recipe(uuid,uuid,jsonb) from public,anon;
grant execute on function public.create_stock_recipe(uuid,uuid,jsonb) to authenticated;

create or replace function public.register_stock_purchase(p_unit uuid,p_lote_id uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_raw uuid:=(p_data->>'rawMaterialId')::uuid;v_qty numeric:=(p_data->>'quantity')::numeric;
  v_purchased numeric:=(p_data->>'purchaseQuantity')::numeric;v_factor numeric:=(p_data->>'conversionFactor')::numeric;
  v_total numeric:=(p_data->>'totalCost')::numeric;v_supplier uuid:=nullif(p_data->>'supplierId','')::uuid;v_cost numeric;v_lote public.lotes%rowtype;
begin
  if not ops_private.staff(p_unit,array['admin','kitchen']) then raise exception 'Sem permissão para registrar compra';end if;
  perform 1 from public.raw_materials where id=v_raw and business_unit_id=p_unit and active for update;
  if not found then raise exception 'Insumo de outra unidade ou inexistente';end if;
  select * into v_lote from public.lotes where id=p_lote_id;
  if found then
    if v_lote.business_unit_id<>p_unit or v_lote.raw_material_id<>v_raw or v_lote.origem<>'compra' then raise exception 'Identificador de lote já utilizado';end if;
    return p_lote_id;
  end if;
  if v_qty is null or v_qty<=0 or v_qty>='Infinity'::numeric or v_purchased is null or v_purchased<=0
    or v_factor is null or v_factor<=0 or abs(v_qty-v_purchased*v_factor)>0.000001 or coalesce(trim(p_data->>'purchaseUnit'),'')=''
    or (v_total is not null and (v_total<0 or v_total>='Infinity'::numeric)) then raise exception 'Quantidade, conversão ou custo inválido';end if;
  if v_supplier is not null and not exists(select 1 from public.suppliers where id=v_supplier and business_unit_id=p_unit and active) then raise exception 'Fornecedor de outra unidade ou inexistente';end if;
  v_qty:=v_purchased*v_factor;
  v_cost:=case when v_total is not null then v_total/v_qty else (p_data->>'unitCost')::numeric end;
  insert into public.lotes(id,business_unit_id,raw_material_id,numero_lote,origem,quantidade_entrada,validade,fornecedor_id,preco_unitario,unidade_compra,quantidade_compra,fator_conversao,custo_total,caixas,conteudo_por_caixa,data_entrada)
    values(p_lote_id,p_unit,v_raw,coalesce(nullif(trim(p_data->>'numeroLote'),''),'L-'||p_lote_id::text),'compra',v_qty,
      nullif(p_data->>'validade','')::date,v_supplier,v_cost,p_data->>'purchaseUnit',v_purchased,v_factor,v_total,
      (p_data->>'boxCount')::numeric,(p_data->>'unitsPerBox')::numeric,coalesce(nullif(p_data->>'dataEntrada','')::timestamptz,now()));
  insert into public.stock_movements(business_unit_id,raw_material_id,type,quantity,reason,supplier_id,unit_cost,lote_id,created_by)
    values(p_unit,v_raw,'entrada',v_qty,'compra',v_supplier,v_cost,p_lote_id,auth.uid());
  return p_lote_id;
end $$;
revoke all on function public.register_stock_purchase(uuid,uuid,jsonb) from public,anon;
grant execute on function public.register_stock_purchase(uuid,uuid,jsonb) to authenticated;

create or replace function public.produce_stock_batch(p_unit uuid,p_batch_id uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.production_recipes%rowtype;v_qty numeric:=(p_data->>'quantityProduced')::numeric;i record;a record;
  v_before public.raw_materials%rowtype;v_cost numeric;
begin
  if not ops_private.staff(p_unit,array['admin','kitchen']) then raise exception 'Sem permissão para produzir';end if;
  select * into r from public.production_recipes where id=(p_data->>'recipeId')::uuid and business_unit_id=p_unit and active for share;
  if not found then raise exception 'Receita de outra unidade ou inexistente';end if;
  if v_qty is null or v_qty<=0 or v_qty>='Infinity'::numeric or jsonb_typeof(p_data->'inputsUsed') is distinct from 'array'
    or jsonb_array_length(p_data->'inputsUsed')=0 then raise exception 'Quantidade ou consumos inválidos';end if;
  if exists(select 1 from jsonb_array_elements(p_data->'inputsUsed') e where (e->>'quantityUsed')::numeric is null
      or (e->>'quantityUsed')::numeric<=0 or (e->>'quantityUsed')::numeric>='Infinity'::numeric
      or not exists(select 1 from public.production_recipe_inputs pi join public.raw_materials rm on rm.id=pi.raw_material_id
        where pi.recipe_id=r.id and pi.raw_material_id=(e->>'rawMaterialId')::uuid and rm.business_unit_id=p_unit and rm.active))
    or exists(select 1 from public.production_recipe_inputs pi where pi.recipe_id=r.id and not exists(
      select 1 from jsonb_array_elements(p_data->'inputsUsed') e where (e->>'rawMaterialId')::uuid=pi.raw_material_id)) then
    raise exception 'Consumos devem incluir todos os insumos da receita e pertencer à unidade';end if;
  -- Lock inputs and output in the same order before crediting or allocating.
  perform 1 from public.raw_materials rm where rm.id=r.output_raw_material_id
    or rm.id in(select raw_material_id from public.production_recipe_inputs where recipe_id=r.id) order by rm.id for update;
  if exists(select 1 from public.production_batches where id=p_batch_id) then
    if not exists(select 1 from public.production_batches where id=p_batch_id and business_unit_id=p_unit and recipe_id=r.id) then raise exception 'Identificador de produção já utilizado';end if;
    return p_batch_id;
  end if;
  select * into v_before from public.raw_materials where id=r.output_raw_material_id;
  insert into public.production_batches(id,business_unit_id,recipe_id,quantity_produced,notes,produced_by)
    values(p_batch_id,p_unit,r.id,v_qty,nullif(trim(p_data->>'notes'),''),auth.uid());
  for i in select (e->>'rawMaterialId')::uuid raw_id,sum((e->>'quantityUsed')::numeric) qty
    from jsonb_array_elements(p_data->'inputsUsed') e group by raw_id order by raw_id
  loop
    for a in select * from ops_private.allocate_stock_lots(p_unit,i.raw_id,i.qty) loop
      insert into public.production_batch_inputs(batch_id,raw_material_id,quantity_used,lote_id)
        values(p_batch_id,i.raw_id,a.quantity,a.lote_id);
    end loop;
  end loop;
  select sum(sm.quantity*sm.unit_cost)/v_qty into v_cost from public.stock_movements sm
    join public.production_batch_inputs pi on sm.reference_type='production_batch_input' and sm.reference_id=pi.id
    where pi.batch_id=p_batch_id;
  update public.lotes set preco_unitario=v_cost where batch_id=p_batch_id;
  update public.stock_movements set unit_cost=v_cost where reference_type='production_batch' and reference_id=p_batch_id and reason='producao_output';
  if v_cost is not null then
    update public.raw_materials set average_cost=(greatest(v_before.current_stock,0)*v_before.average_cost+v_qty*v_cost)
      /(greatest(v_before.current_stock,0)+v_qty) where id=r.output_raw_material_id;
  end if;
  return p_batch_id;
end $$;
revoke all on function public.produce_stock_batch(uuid,uuid,jsonb) from public,anon;
grant execute on function public.produce_stock_batch(uuid,uuid,jsonb) to authenticated;

-- Correct the previously versioned but missing RPC: net ledger consumption,
-- exact unit permissions, and the same material -> lot lock order as sales.
create or replace function public.manage_purchase_lot(p_lote_id uuid,p_action text,p_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare l public.lotes%rowtype;v_consumed numeric;v_qty numeric;v_purchased numeric;v_factor numeric;v_total numeric;v_delta numeric;v_average numeric;v_supplier uuid;
begin
  select * into l from public.lotes where id=p_lote_id;
  if not found or l.origem<>'compra' or l.cancelado_em is not null then raise exception 'Lote de compra não encontrado ou cancelado';end if;
  if not ops_private.staff(l.business_unit_id,array['admin']) then raise exception 'Sem permissão para alterar lote';end if;
  perform 1 from public.raw_materials where id=l.raw_material_id for update;
  select * into l from public.lotes where id=p_lote_id for update;
  if l.cancelado_em is not null then raise exception 'Lote já cancelado';end if;
  v_consumed:=l.quantidade_entrada-ops_private.lot_remaining(l.id);
  if p_action='cancel' then
    if v_consumed<>0 then raise exception 'Lote consumido ou ajustado: cancelamento indisponível';end if;
    v_delta:=-l.quantidade_entrada;
  elsif p_action='edit' then
    v_purchased:=(p_data->>'quantidade_compra')::numeric;v_factor:=(p_data->>'fator_conversao')::numeric;
    v_qty:=v_purchased*v_factor;v_total:=nullif(p_data->>'custo_total','')::numeric;v_supplier:=nullif(p_data->>'fornecedor_id','')::uuid;
    if v_purchased is null or v_purchased<=0 or v_factor is null or v_factor<=0 or v_qty>='Infinity'::numeric
      or (v_total is not null and (v_total<0 or v_total>='Infinity'::numeric)) or coalesce(trim(p_data->>'unidade_compra'),'')='' then raise exception 'Quantidade, conversão, unidade ou custo inválidos';end if;
    if v_supplier is not null and not exists(select 1 from public.suppliers where id=v_supplier and business_unit_id=l.business_unit_id) then raise exception 'Fornecedor de outra unidade';end if;
    if v_consumed<>0 and v_qty<>l.quantidade_entrada then raise exception 'Lote consumido: quantidade não pode ser alterada';end if;
    v_delta:=v_qty-l.quantidade_entrada;
    update public.lotes set quantidade_entrada=v_qty,numero_lote=coalesce(nullif(trim(p_data->>'numero_lote'),''),numero_lote),
      quantidade_compra=v_purchased,fator_conversao=v_factor,unidade_compra=p_data->>'unidade_compra',custo_total=v_total,
      preco_unitario=case when v_total is null then null else v_total/v_qty end,fornecedor_id=v_supplier,
      validade=nullif(p_data->>'validade','')::date,caixas=nullif(p_data->>'caixas','')::numeric,
      conteudo_por_caixa=nullif(p_data->>'conteudo_por_caixa','')::numeric where id=p_lote_id;
  else raise exception 'Ação desconhecida';end if;
  if v_delta<>0 then
    insert into public.stock_movements(raw_material_id,business_unit_id,type,quantity,reason,lote_id,reference_type,reference_id,created_by)
      values(l.raw_material_id,l.business_unit_id,case when v_delta>0 then 'entrada' else 'saida' end,abs(v_delta),'ajuste',l.id,'lote_correcao',l.id,auth.uid());
  end if;
  if p_action='cancel' then update public.lotes set cancelado_em=now() where id=p_lote_id;end if;
  select sum(greatest(0,ops_private.lot_remaining(id))*preco_unitario)/nullif(sum(greatest(0,ops_private.lot_remaining(id))),0)
    into v_average from public.lotes where raw_material_id=l.raw_material_id and business_unit_id=l.business_unit_id
      and cancelado_em is null and preco_unitario is not null;
  if v_average is not null then update public.raw_materials set average_cost=v_average,updated_at=now() where id=l.raw_material_id;end if;
end $$;
revoke all on function public.manage_purchase_lot(uuid,text,jsonb) from public,anon;
grant execute on function public.manage_purchase_lot(uuid,text,jsonb) to authenticated;
