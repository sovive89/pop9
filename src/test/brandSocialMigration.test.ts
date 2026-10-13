// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { normalizeSocial, type SocialKey } from "../../supabase/functions/_shared/brand";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec("create table public.brand_settings (business_unit_id uuid primary key)");
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
