-- Redes sociais na Marca (cardápio do cliente). Aditivo: só novas colunas opcionais.
-- O app normaliza "@perfil" para o link completo; aqui só guardamos https e domínios esperados.
alter table public.brand_settings
  add column if not exists instagram_url text check (instagram_url is null or (length(instagram_url) <= 200 and instagram_url ~ '^https://(www\.)?instagram\.com/[A-Za-z0-9._]+/?$')),
  add column if not exists facebook_url text check (facebook_url is null or (length(facebook_url) <= 200 and facebook_url ~ '^https://(www\.|m\.)?facebook\.com/[A-Za-z0-9.\-/?=_]+$')),
  add column if not exists tiktok_url text check (tiktok_url is null or (length(tiktok_url) <= 200 and tiktok_url ~ '^https://(www\.)?tiktok\.com/@[A-Za-z0-9._]+/?$')),
  add column if not exists youtube_url text check (youtube_url is null or (length(youtube_url) <= 200 and youtube_url ~ '^https://(www\.)?youtube\.com/[A-Za-z0-9@._\-/]+$')),
  add column if not exists website_url text check (website_url is null or (length(website_url) <= 200 and website_url ~ '^https://[A-Za-z0-9.\-]+\.[A-Za-z]{2,}(/[^\s"''<>]*)?$'));

-- Informações adicionais exibidas no cardápio do cliente (texto simples, sem HTML).
alter table public.brand_settings
  add column if not exists about_text text check (about_text is null or length(about_text) <= 500),
  add column if not exists address text check (address is null or length(address) <= 200),
  add column if not exists opening_hours text check (opening_hours is null or length(opening_hours) <= 300);
