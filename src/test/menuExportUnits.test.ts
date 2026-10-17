import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261017120000_export_menu_item_to_units.sql", "utf8");

describe("export_menu_item_to_units", () => {
  it("exige admin na origem e em cada destino", () => {
    expect(sql).toMatch(/Sem permissão na unidade de origem/);
    expect(sql).toMatch(/Sem permissão na unidade de destino/);
  });
  it("reaproveita o salvamento da ficha (insumos teóricos) e cria categoria ausente", () => {
    expect(sql).toMatch(/save_menu_item_with_recipe\(v_target/);
    expect(sql).toMatch(/insert into public\.menu_categories/);
  });
  it("nunca cria lotes, compras ou movimentações", () => {
    expect(sql).not.toMatch(/insert into public\.(lotes|stock_movements|stock_lot_balances)/i);
  });
  it("não é executável por anon", () => {
    expect(sql).toMatch(/revoke all on function public\.export_menu_item_to_units[^;]*from public,anon/);
  });
});
