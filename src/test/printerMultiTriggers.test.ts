// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { normalizeGatilhos } from "@/hooks/usePrinterConfigs";

let db: PGlite;
const rows = async () => (await db.query<{ name: string; gatilho: string; gatilhos: string[] }>("select name, gatilho, gatilhos from public.printer_configs order by name")).rows;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema app_private;
    create table public.printer_configs (
      id uuid primary key default gen_random_uuid(), name text not null, tipo text not null,
      gatilho text not null check (gatilho in ('comanda_cozinha','comanda_garcom','conta_mesa','conta_individual','pedido_pronto','etiqueta_producao')),
      active boolean not null default true);
    insert into public.printer_configs (name, tipo, gatilho) values ('Antiga', 'termica', 'conta_mesa');
  `);
  await db.exec(readFileSync("supabase/migrations/20261013070000_printer_multi_triggers.sql", "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });

describe("printer multi triggers", () => {
  it("keeps existing printers with their single trigger", async () => {
    expect(await rows()).toEqual([{ name: "Antiga", gatilho: "conta_mesa", gatilhos: ["conta_mesa"] }]);
  });

  it("stores several triggers, dedups and keeps gatilho as the first", async () => {
    await db.query("insert into public.printer_configs (name, tipo, gatilho, gatilhos) values ('Bar', 'termica', 'comanda_cozinha', array['comanda_cozinha','conta_mesa','comanda_cozinha'])");
    expect((await rows()).find((r) => r.name === "Bar")).toEqual({ name: "Bar", gatilho: "comanda_cozinha", gatilhos: ["comanda_cozinha", "conta_mesa"] });
    await db.query("update public.printer_configs set gatilhos = array['pedido_pronto','comanda_garcom'] where name = 'Bar'");
    expect((await rows()).find((r) => r.name === "Bar")?.gatilho).toBe("pedido_pronto");
  });

  it("old code that only writes gatilho still works", async () => {
    await db.query("update public.printer_configs set gatilho = 'comanda_garcom' where name = 'Antiga'");
    expect((await rows()).find((r) => r.name === "Antiga")?.gatilhos).toEqual(["comanda_garcom"]);
    await db.query("insert into public.printer_configs (name, tipo, gatilho) values ('Nova', 'termica', 'pedido_pronto')");
    expect((await rows()).find((r) => r.name === "Nova")?.gatilhos).toEqual(["pedido_pronto"]);
  });

  it("rejects unknown triggers", async () => {
    await expect(db.query("insert into public.printer_configs (name, tipo, gatilho, gatilhos) values ('X', 'termica', 'conta_mesa', array['conta_mesa','foo'])")).rejects.toThrow();
  });

  it("normalizes the app selection", () => {
    expect(normalizeGatilhos(["conta_mesa", "comanda_cozinha", "conta_mesa", "foo"])).toEqual(["comanda_cozinha", "conta_mesa"]);
  });
});
