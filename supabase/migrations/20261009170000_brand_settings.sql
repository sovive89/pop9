-- Marca (brand) por unidade, usada SOMENTE nas telas públicas do cliente
-- (pedido online /pedir/:unit e check-in por QR /m). Nada aqui altera o
-- visual do admin, da cozinha, do caixa ou do atendimento.
--
-- Segurança:
--  * lista fechada de campos (logo, fundo e quatro cores); sem CSS/HTML livre;
--  * cores só em #rrggbb; imagens só no bucket brand-assets da própria unidade;
--  * escrita restrita ao admin da unidade (ops_private.staff);
--  * o cliente anônimo NÃO lê a tabela: as funções públicas
--    (public-order e customer-checkin) leem com service role e devolvem
--    apenas os campos validados.

create table public.brand_settings (
  business_unit_id uuid primary key references public.business_units(id) on delete cascade,
  logo_url text check (logo_url is null or (length(logo_url) <= 500 and logo_url like 'https://%')),
  background_url text check (background_url is null or (length(background_url) <= 500 and background_url like 'https://%')),
  primary_color text check (primary_color is null or primary_color ~ '^#[0-9a-fA-F]{6}$'),
  background_color text check (background_color is null or background_color ~ '^#[0-9a-fA-F]{6}$'),
  card_color text check (card_color is null or card_color ~ '^#[0-9a-fA-F]{6}$'),
  text_color text check (text_color is null or text_color ~ '^#[0-9a-fA-F]{6}$'),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

alter table public.brand_settings enable row level security;

create policy brand_settings_admin_select on public.brand_settings
  for select to authenticated using (ops_private.staff(business_unit_id, array['admin']));
create policy brand_settings_admin_insert on public.brand_settings
  for insert to authenticated with check (ops_private.staff(business_unit_id, array['admin']));
create policy brand_settings_admin_update on public.brand_settings
  for update to authenticated
  using (ops_private.staff(business_unit_id, array['admin']))
  with check (ops_private.staff(business_unit_id, array['admin']));
create policy brand_settings_admin_delete on public.brand_settings
  for delete to authenticated using (ops_private.staff(business_unit_id, array['admin']));

revoke all on public.brand_settings from public, anon, authenticated;
grant select, insert, update, delete on public.brand_settings to authenticated;
grant all on public.brand_settings to service_role;

-- Bucket público (as imagens aparecem para o cliente) com limite de tamanho e
-- tipos aceitos; sem SVG, que pode carregar script. A escrita só é permitida
-- na pasta da unidade em que o usuário é admin: <unit_id>/arquivo.ext
do $storage$
begin
  if to_regnamespace('storage') is null then
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('brand-assets', 'brand-assets', true, 3145728, array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  execute $p$
    create policy "Unit admin can upload brand assets" on storage.objects
      for insert to authenticated with check (
        bucket_id = 'brand-assets'
        and case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then ops_private.staff(((storage.foldername(name))[1])::uuid, array['admin']) else false end)
  $p$;
  execute $p$
    create policy "Unit admin can update brand assets" on storage.objects
      for update to authenticated using (
        bucket_id = 'brand-assets'
        and case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then ops_private.staff(((storage.foldername(name))[1])::uuid, array['admin']) else false end)
  $p$;
  execute $p$
    create policy "Unit admin can delete brand assets" on storage.objects
      for delete to authenticated using (
        bucket_id = 'brand-assets'
        and case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then ops_private.staff(((storage.foldername(name))[1])::uuid, array['admin']) else false end)
  $p$;
end
$storage$;
