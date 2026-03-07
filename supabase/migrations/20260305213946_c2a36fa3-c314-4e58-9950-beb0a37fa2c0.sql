-- Add missing role for existing user
INSERT INTO public.user_roles (user_id, role)
VALUES ('2e8dc8f8-72d4-43e8-8fbe-d0787ff1621f', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
VALUES ('2e8dc8f8-72d4-43e8-8fbe-d0787ff1621f', 'attendant')
ON CONFLICT (user_id, role) DO NOTHING;

-- Create trigger for new users
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();