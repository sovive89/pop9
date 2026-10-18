// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("printer layout persistence", () => {
  it("keeps existing rows and enforces bounded object storage for independent models", async () => {
    const db = new PGlite();
    try {
      await db.exec("create table public.printer_configs(id integer primary key);insert into public.printer_configs values(1),(2);");
      await db.exec(readFileSync("supabase/migrations/20261018213936_printer_layout_models.sql", "utf8"));
      // Reapplying after a schema-only operational repair must preserve the row.
      await db.exec(readFileSync("supabase/migrations/20261018213936_printer_layout_models.sql", "utf8"));
      expect((await db.query("select print_layouts from printer_configs where id=1")).rows).toEqual([{ print_layouts: {} }]);
      await db.query("update printer_configs set print_layouts=$1 where id=1", [JSON.stringify({ comanda_cozinha: { header: "Cozinha" }, conta_mesa: { header: "Caixa" } })]);
      await db.exec(readFileSync("supabase/migrations/20261018213936_printer_layout_models.sql", "utf8"));
      expect((await db.query<{print_layouts: unknown}>("select print_layouts from printer_configs where id=1")).rows[0].print_layouts).toEqual({ comanda_cozinha: { header: "Cozinha" }, conta_mesa: { header: "Caixa" } });
      expect((await db.query("select print_layouts from printer_configs where id=2")).rows).toEqual([{ print_layouts: {} }]);
      await expect(db.query("update printer_configs set print_layouts='[]' where id=1")).rejects.toThrow();
      await expect(db.query("update printer_configs set print_layouts=$1 where id=1", [JSON.stringify({ header: "x".repeat(66000) })])).rejects.toThrow();
    } finally { await db.close(); }
  });
});
