alter table public.menu_categories
  add column if not exists icon_name text,
  add column if not exists icon_color text;

comment on column public.menu_categories.icon_name is 'Lucide icon identifier chosen per category';
comment on column public.menu_categories.icon_color is 'Category icon accent color hex';
