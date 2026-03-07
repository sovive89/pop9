-- Cole no Supabase Dashboard → SQL Editor → Run
-- Concede todas as permissões (admin, attendant, kitchen) a ricardoferreiradonascimento89@gmail.com
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, r.role
FROM auth.users u
CROSS JOIN (VALUES ('admin'::public.app_role), ('attendant'::public.app_role), ('kitchen'::public.app_role)) AS r(role)
WHERE u.email = 'ricardoferreiradonascimento89@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
