-- Structured layouts per existing trigger, stored on the existing printer row.
-- Existing unit-scoped SELECT/UPDATE policies continue to control access.
-- No new tables, elevated RPCs or permissive policies.
alter table public.printer_configs
  add column if not exists print_layouts jsonb not null default '{}'::jsonb;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.printer_configs'::regclass
      and conname = 'printer_configs_print_layouts_object'
  ) then
    alter table public.printer_configs
      add constraint printer_configs_print_layouts_object
      check (jsonb_typeof(print_layouts) = 'object' and octet_length(print_layouts::text) <= 65536);
  end if;
end;
$$;
comment on column public.printer_configs.print_layouts is
  'Versioned structured print options keyed by existing gatilho; clients normalize bounded fields, never arbitrary HTML/CSS.';

-- Refresh the Data API after adding the column.
notify pgrst, 'reload schema';
