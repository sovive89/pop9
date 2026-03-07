-- Atribui todas as permissões (admin, attendant, kitchen) ao usuário com este e-mail
-- Execute após o usuário ter se cadastrado (Supabase Dashboard → SQL Editor)
INSERT INTO public.user_roles (user_id, role)
SELECT id, r.role
FROM auth.users u
CROSS JOIN (VALUES ('admin'::public.app_role), ('attendant'::public.app_role), ('kitchen'::public.app_role)) AS r(role)
WHERE u.email = 'ricardoferreiradonascimento89@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
