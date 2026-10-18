-- Structured layouts per existing trigger, stored on the existing printer row.
-- Existing unit-scoped SELECT/UPDATE policies continue to control access.
-- No new tables, elevated RPCs or permissive policies.
alter table public.printer_configs
  add column if not exists print_layouts jsonb not null default '{}'::jsonb;
alter table public.printer_configs
  add constraint printer_configs_print_layouts_object
  check (jsonb_typeof(print_layouts) = 'object' and octet_length(print_layouts::text) <= 65536);
comment on column public.printer_configs.print_layouts is
  'Versioned structured print options keyed by existing gatilho; clients normalize bounded fields, never arbitrary HTML/CSS.';
