-- RLS para as 3 tabelas criadas pelas migrations de estoque/multi-unidade
-- (lotes, businesses, business_units). O projeto ativa RLS por padrão em
-- toda tabela nova (confirmado via pg_class antes de escrever isto — as
-- tabelas de estoque existentes já vêm com relrowsecurity=true), mas sem
-- nenhuma política elas ficam travadas: RLS habilitada + zero políticas =
-- nenhuma role consegue ler ou escrever nada.
--
-- Mesmo padrão já usado em raw_materials/stock_movements/suppliers/
-- production_batch_inputs (confirmado via pg_policies antes de escrever
-- isto): kitchen+admin gerenciam, todo staff (admin/attendant/kitchen) lê.
--
-- lotes é operacional (mesmo nível de acesso que as tabelas de estoque
-- existentes). businesses/business_units é metadado de configuração — só
-- admin gerencia, mas todo staff pode ler (vai ser referenciado no app pra
-- filtrar por unidade no futuro).
create policy "Kitchen and admin manage lotes"
  on public.lotes for all
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'kitchen'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'kitchen'::app_role));

create policy "Staff can read lotes"
  on public.lotes for select
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'attendant'::app_role) or has_role(auth.uid(), 'kitchen'::app_role));

create policy "Admin manages businesses"
  on public.businesses for all
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

create policy "Staff can read businesses"
  on public.businesses for select
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'attendant'::app_role) or has_role(auth.uid(), 'kitchen'::app_role));

create policy "Admin manages business_units"
  on public.business_units for all
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

create policy "Staff can read business_units"
  on public.business_units for select
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'attendant'::app_role) or has_role(auth.uid(), 'kitchen'::app_role));
