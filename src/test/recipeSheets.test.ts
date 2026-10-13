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
