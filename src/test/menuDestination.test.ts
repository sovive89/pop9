import { describe, expect, it } from "vitest";
import { resolveMenuItemDestination } from "@/lib/menuDestination";

describe("resolveMenuItemDestination", () => {
  it("usa o override do item quando está definido", () => {
    expect(resolveMenuItemDestination("kitchen", "bar")).toBe("kitchen");
  });

  it("herda o destino da categoria quando o override é nulo ou vazio", () => {
    expect(resolveMenuItemDestination(null, "bar")).toBe("bar");
    expect(resolveMenuItemDestination("  ", "kitchen")).toBe("kitchen");
  });

  it("retorna nulo quando nem item nem categoria têm destino", () => {
    expect(resolveMenuItemDestination(null, undefined)).toBeNull();
  });
});
