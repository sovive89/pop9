// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { normalizeSocial, type SocialKey } from "../../supabase/functions/_shared/brand";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth; create schema app_private;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.brand_settings (business_unit_id uuid primary key, updated_by uuid, updated_at timestamptz not null default now());
  `);
  await db.exec(readFileSync("supabase/migrations/20261013060000_brand_social_links.sql", "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });

const ok: [SocialKey, string][] = [
  ["instagram_url", "@confit.burguer"], ["facebook_url", "facebook.com/confit"], ["tiktok_url", "@confit"],
  ["youtube_url", "@confit"], ["website_url", "confit.com.br/cardapio?x=1"],
];

it("accepts every link the app normalizes and rejects other hosts", async () => {
  for (const [key, raw] of ok) {
    const url = normalizeSocial(key, raw);
    expect(url).not.toBeNull();
    await db.query(`insert into public.brand_settings (business_unit_id, ${key}) values (gen_random_uuid(), $1)`, [url]);
  }
  await expect(db.query("insert into public.brand_settings (business_unit_id, instagram_url) values (gen_random_uuid(), 'https://evil.com/x')")).rejects.toThrow();
  await expect(db.query("insert into public.brand_settings (business_unit_id, about_text) values (gen_random_uuid(), repeat('x', 501))")).rejects.toThrow();
});

it("records who edited last, without trusting the client", async () => {
  const unit = "00000000-0000-0000-0000-0000000000aa", admin = "00000000-0000-0000-0000-0000000000bb";
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [admin]);
  await db.query("insert into public.brand_settings (business_unit_id, updated_by, updated_at) values ($1, gen_random_uuid(), '2000-01-01')", [unit]);
  const row = (await db.query<{ updated_by: string; old: boolean }>("select updated_by, updated_at < now() - interval '1 day' as old from public.brand_settings where business_unit_id = $1", [unit])).rows[0];
  expect(row).toEqual({ updated_by: admin, old: false });
});
