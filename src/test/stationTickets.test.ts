import { describe, expect, it } from "vitest";
import { buildStationTickets, escapeHtml } from "@/utils/thermal-print";

describe("station tickets", () => {
  it("escapes customer text so an online order cannot inject markup or script", () => {
    const [ticket] = buildStationTickets("Retirada #1", "<img src=x onerror=alert(1)>", [
      { name: "X<script>alert(1)</script>", quantity: 1, observation: "sem <b>cebola</b>", ingredientMods: [{ action: "remove", name: "<svg/onload=1>" }], destination: "kitchen" },
    ], "abcdef12-0000", ["kitchen"], "Online");
    expect(ticket).not.toMatch(/<script>|<img |<svg|<b>/);
    expect(ticket).toContain("&lt;SCRIPT&gt;");
    expect(ticket).toContain("ONLINE");
    const [ifood] = buildStationTickets("iFood #A1B2C3", "Ana", [{ name: "Burger", quantity: 1, destination: "kitchen" }], "o2", ["kitchen"], "iFood");
    expect(ifood).toContain("IFOOD");
  });

  it("prints only the destinations chosen for this device, one ticket per unit", () => {
    const items = [
      { name: "Burger", quantity: 2, destination: "kitchen" },
      { name: "Suco", quantity: 1, destination: "bar" },
    ];
    expect(buildStationTickets("Mesa 1", "Ana", items, "o1", ["kitchen"])).toHaveLength(2);
    expect(buildStationTickets("Mesa 1", "Ana", items, "o1", ["bar"])).toHaveLength(1);
    expect(buildStationTickets("Mesa 1", "Ana", items, "o1", ["kitchen", "bar"])).toHaveLength(3);
  });

  it("escapeHtml covers quotes and ampersands", () => {
    expect(escapeHtml(`a&b"c'<>`)).toBe("a&amp;b&quot;c&#39;&lt;&gt;");
  });
});
