-- Módulo de configuração de impressoras (térmicas de comanda/conta e de
-- etiqueta adesiva). Escopo deliberadamente aberto na execução: hoje o
-- único mecanismo real de impressão no app é window.print() (diálogo
-- nativo do navegador — confirmado via auditoria de src/utils/thermal-print.ts),
-- que não permite selecionar/lembrar impressora nem imprimir silenciosamente.
-- connection_type existe pra não fechar a porta pra QZ Tray/WebUSB depois,
-- sem forçar essa decisão agora.
--
-- gatilho mapeia 1:1 com as funções que já existem em thermal-print.ts
-- (buildKitchenReceipts, buildWaiterReceipt, buildClientBillReceipt,
-- buildTableBillReceipt, buildReadyReceipt) + etiqueta_producao, que hoje
-- não tem NENHUMA ação de impressão associada (production_labels é só
-- lista somente-leitura no Estoque) — preparado pra quando isso existir.
create table if not exists public.printer_configs (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid references public.business_units(id),
  name text not null,
  tipo text not null check (tipo in ('termica', 'etiqueta')),
  gatilho text not null check (gatilho in (
    'comanda_cozinha', 'comanda_garcom', 'conta_mesa', 'conta_individual',
    'pedido_pronto', 'etiqueta_producao'
  )),
  connection_type text not null default 'browser'
    check (connection_type in ('browser', 'qz_tray', 'webusb')),
  device_identifier text, -- nome/IP/endereço do dispositivo, conforme connection_type
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_printer_configs_gatilho
  on public.printer_configs (gatilho) where active = true;

create policy "Admin manages printer_configs"
  on public.printer_configs for all
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

create policy "Staff can read printer_configs"
  on public.printer_configs for select
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'attendant'::app_role) or has_role(auth.uid(), 'kitchen'::app_role));
