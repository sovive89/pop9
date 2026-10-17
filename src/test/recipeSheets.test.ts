import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { templateFiles, SHEET_HEADER, PREP_HEADER, zipFiles } from "@/utils/recipeSheets";

describe("technical sheet templates", () => {
  it("ships both templates with the shared headers and import instructions", async () => {
    const files = templateFiles();
    expect(Object.keys(files).sort()).toEqual(["LEIA-ME.txt", "fichas-tecnicas.csv", "preparos-da-casa.csv"]);
    expect(files["fichas-tecnicas.csv"]).toContain(SHEET_HEADER.map((h) => `"${h}"`).join(";"));
    expect(files["preparos-da-casa.csv"]).toContain(PREP_HEADER.map((h) => `"${h}"`).join(";"));
    expect(files["LEIA-ME.txt"]).toContain("Importar com IA");
    const zip = await zipFiles(files);
    expect(zip[0]).toBe(0x50); // "PK"
  });
});

import { draftToSheetFiles } from "@/utils/recipeSheets";
describe("AI recipe sheet export", () => {
  it("writes the AI draft in the same CSV format, with preparations and notes", () => {
    const files = draftToSheetFiles({
      categories: [{ key: "burgers", label: "Hambúrgueres" }],
      items: [{ name: "X-Bacon", description: "Brioche e bacon", price: 36.9, category: "burgers", recipe: [
        { material: "Pão brioche", unit: "un", quantity: 1, preparation: null },
        { material: "Maionese da casa", unit: "g", quantity: 30, preparation: { outputQuantity: 1, inputs: [{ material: "Ovo", unit: "un", quantity: 2 }] } },
      ] }],
      notes: ["Quantidades sugeridas pela IA — confira e ajuste antes de usar."],
    });
    expect(files["fichas-tecnicas.csv"].replace(/"/g, "")).toContain("Hambúrgueres;X-Bacon;Brioche e bacon;36.90;Pão brioche;1;un");
    expect(files["preparos-da-casa.csv"].replace(/"/g, "")).toContain("Maionese da casa;1;g;Ovo;2;un");
    expect(files["LEIA-ME.txt"]).toContain("Quantidades sugeridas pela IA");
  });
});
