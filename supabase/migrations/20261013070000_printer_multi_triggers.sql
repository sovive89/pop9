-- Impressoras com mais de um gatilho (ex.: a mesma térmica imprime a comanda da
-- cozinha e a conta da mesa). Aditivo: a coluna antiga "gatilho" continua existindo
-- e fica sincronizada com o primeiro item de "gatilhos", para não quebrar quem a lê.
--
-- Drift documentado: em produção printer_configs tem colunas (host, port, paper_width,
-- copies, auto_cut, encoding, transport) que não estão em nenhuma migration deste
-- repositório. Esta migration não toca nelas.

alter table public.printer_configs
  add column if not exists gatilhos text[] not null default '{}';

update public.printer_configs set gatilhos = array[gatilho] where cardinality(gatilhos) = 0;

create or replace function app_private.sync_printer_gatilhos()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Quem ainda grava só "gatilho" (código antigo) continua funcionando.
  if new.gatilhos is null or cardinality(new.gatilhos) = 0
     or (tg_op = 'UPDATE' and new.gatilho is distinct from old.gatilho and new.gatilhos = old.gatilhos) then
    new.gatilhos := array[new.gatilho];
  end if;
  -- Sem repetidos, na ordem informada.
  new.gatilhos := array(select g from unnest(new.gatilhos) with ordinality as t(g, i) group by g order by min(i));
  new.gatilho := new.gatilhos[1];
  return new;
end;
$$;
revoke all on function app_private.sync_printer_gatilhos() from public;
drop trigger if exists sync_printer_gatilhos on public.printer_configs;
create trigger sync_printer_gatilhos before insert or update on public.printer_configs
  for each row execute function app_private.sync_printer_gatilhos();

alter table public.printer_configs
  add constraint printer_configs_gatilhos_valid check (
    cardinality(gatilhos) between 1 and 6
    and gatilhos <@ array['comanda_cozinha', 'comanda_garcom', 'conta_mesa', 'conta_individual', 'pedido_pronto', 'etiqueta_producao']::text[]
  );

create index if not exists idx_printer_configs_gatilhos on public.printer_configs using gin (gatilhos) where active = true;
