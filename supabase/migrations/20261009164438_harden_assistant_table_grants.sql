revoke all on public.ai_assistant_usage from public,anon,authenticated;
grant select on public.ai_assistant_usage to authenticated;
grant all on public.ai_assistant_usage to service_role;
