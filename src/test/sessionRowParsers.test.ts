import { describe, expect, it } from "vitest";
import {
  parseActiveSessionRow,
  parseIngredientMods,
  parseOrderRealtimeRow,
  parsePlacedOrder,
  parseSessionClientRows,
  parseSessionOrderRows,
  toClientInfo,
} from "@/lib/session-row-parsers";

describe("session row parsers", () => {
  it("accepts the active-session projection without requiring unselected columns", () => {
    const session = parseActiveSessionRow({
      id: "session-1",
      table_number: 4,
      started_at: "2026-10-09T10:00:00Z",
      session_clients: [{ id: "client-1", name: "Ana Silva", added_at: "2026-10-09T10:01:00Z" }],
      orders: [],
    });

    expect(session).toMatchObject({ id: "session-1", table_number: 4 });
    expect(Array.isArray(session?.session_clients)).toBe(true);
    expect(session).not.toBeNull();
    expect(session).not.toHaveProperty("business_unit_id");
  });

  it("keeps valid clients while treating malformed optional values as absent", () => {
    const rows = parseSessionClientRows([
      {
        id: "client-1",
        name: "Ana Silva",
        added_at: "2026-10-09T10:01:00Z",
        phone: "+5511999999999",
        email: null,
        faixa_etaria: "25-34",
      },
      { id: "client-2", name: "Bruno", added_at: "2026-10-09T10:02:00Z", phone: 123 },
      { id: "missing-name", added_at: "2026-10-09T10:03:00Z" },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: "client-1", phone: "+5511999999999", faixa_etaria: "25-34" });
    expect(rows[1]).toMatchObject({ id: "client-2", phone: undefined });
    expect(toClientInfo(rows[0])).toMatchObject({
      id: "client-1",
      name: "Ana Silva",
      phone: "+5511999999999",
      faixa_etaria: "25-34",
    });
  });

  it("preserves valid ingredient modifiers and falls back for malformed JSON", () => {
    const mods = [
      { name: "Bacon", action: "extra" as const, extraPrice: 0 },
      { name: "Cebola", action: "remove" as const },
    ];

    expect(parseIngredientMods(mods)).toEqual(mods);
    expect(parseIngredientMods([])).toEqual([]);
    expect(parseIngredientMods(null)).toBeUndefined();
    expect(parseIngredientMods([{ name: "Bacon", action: "unknown" }])).toBeUndefined();
    expect(parseIngredientMods([{ name: "Bacon", action: "extra", extraPrice: "2" }])).toBeUndefined();
  });

  it("uses the legacy origin and pending status fallbacks without losing the order", () => {
    const rows = parseSessionOrderRows([
      {
        id: "order-1",
        client_id: "client-1",
        status: "new-status-from-server",
        placed_at: "2026-10-09T10:03:00Z",
        order_items: [
          {
            menu_item_id: "item-1",
            name: "Café",
            price: 7.5,
            quantity: 2,
            observation: null,
            ingredient_mods: [{ name: "Leite", action: "extra", extraPrice: 1.5 }],
          },
        ],
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(parsePlacedOrder(rows[0])).toMatchObject({
      id: "order-1",
      status: "pending",
      origin: "mesa",
      items: [{ menuItemId: "item-1", price: 7.5, quantity: 2, ingredientMods: [{ name: "Leite", action: "extra", extraPrice: 1.5 }] }],
    });
    expect(parsePlacedOrder({ id: "cancelled", client_id: "client-1", status: "cancelled", placed_at: "2026-10-09T10:03:00Z" })).toBeNull();
  });

  it("requires the realtime scope fields before reading them", () => {
    expect(parseOrderRealtimeRow({ id: "order-1", status: "ready" })).toBeNull();
    expect(parseOrderRealtimeRow({ id: "order-1", business_unit_id: "unit-1", status: "ready" })).toEqual({
      id: "order-1",
      business_unit_id: "unit-1",
      status: "ready",
    });
  });
});
