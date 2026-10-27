-- delete_dining_table é SECURITY DEFINER e foi criada sem revoke/grant (diferente de table_qr_token, na
-- mesma migration). Sem isso, a permissão de executar depende do que já existe no banco de cada ambiente.
-- A função confere o papel admin da unidade por dentro; aqui fechamos também a porta de fora:
-- visitante anônimo não executa, e só usuário autenticado chega até a checagem de papel.
revoke all on function public.delete_dining_table(uuid) from public, anon;
grant execute on function public.delete_dining_table(uuid) to authenticated;
