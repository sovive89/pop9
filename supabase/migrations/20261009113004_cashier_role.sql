-- Commit the new enum value before using it in permissions.
alter type public.app_role add value if not exists 'cashier';
