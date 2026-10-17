import { describe, expect, it } from "vitest";
import { isMissingMenuItemDestinationColumn, isMissingMenuItemOptionalColumn } from "@/lib/menuItemSchemaCompatibility";

describe("menu item schema compatibility", () => {
  it("recognizes Postgres undefined-column errors for optional destination and classification fields", () => {
    expect(isMissingMenuItemDestinationColumn({ code: "42703", message: "column menu_items.destination does not exist" })).toBe(true);
    expect(isMissingMenuItemOptionalColumn({ code: "42703", message: "column menu_items.item_kind does not exist" }, ["destination", "item_kind", "combo_eligible"])).toBe(true);
  });

  it("recognizes PostgREST schema-cache errors for optional eligibility fields", () => {
    expect(isMissingMenuItemOptionalColumn({ code: "PGRST204", message: "Could not find the 'combo_eligible' column in the schema cache" }, ["item_kind", "combo_eligible"])).toBe(true);
  });

  it("does not fallback for unrelated database errors or unrelated columns", () => {
    expect(isMissingMenuItemDestinationColumn({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingMenuItemOptionalColumn({ code: "42703", message: "column menu_items.sku does not exist" }, ["destination", "item_kind", "combo_eligible"])).toBe(false);
    expect(isMissingMenuItemOptionalColumn(null, ["item_kind"])).toBe(false);
  });
});
