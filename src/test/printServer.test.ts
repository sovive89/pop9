// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildKitchenTickets, encodeCp850, renderTicket, wrap, columnsFor } from "../../print-server/src/escpos.mjs";
import { kitchenPrinters, route, channelLabel } from "../../print-server/src/routing.mjs";

const order = {
  label: "Mesa 05", clientName: "Ana", orderId: "abcdef12-0000-0000-0000-000000000000", channel: null,
  now: new Date("2026-10-13T15:30:00Z"),
  items: [
    { name: "X-Burguer", quantity: 2, observation: "bem passado", ingredientMods: [{ action: "remove", name: "Cebola" }], destination: "kitchen" },
    { name: "Caipirinha", quantity: 1, destination: "bar" },
  ],
};
const printer = (over: Record<string, unknown> = {}) => ({
  id: "p1", name: "Cozinha", active: true, transport: "tcp", host: "192.168.0.50", port: 9100,
  gatilho: "comanda_cozinha", gatilhos: ["comanda_cozinha"], destinos: ["kitchen"], paper_width: 80, copies: 1, auto_cut: true, ...over,
});

describe("print server tickets", () => {
  it("creates one ticket per unit, keeping modifications and sector", () => {
    const t = buildKitchenTickets(order);
    expect(t).toHaveLength(3);
    expect(t[0]).toMatchObject({ destination: "kitchen", title: "COMANDA", unit: "Unidade 1 de 2", name: "X-BURGUER", mods: ["S/ Cebola", "OBS: bem passado"], time: "12:30" });
    expect(t[2]).toMatchObject({ destination: "bar", title: "BAR", unit: null });
  });

  it("encodes Portuguese accents in CP850 and strips unknown characters", () => {
    expect(encodeCp850("Ação Á")).toEqual([0x41, 0x87, 0xc6, 0x6f, 0x20, 0xb5]);
    expect(encodeCp850("🍔x")).toEqual([0x3f, 0x78]);
  });

  it("renders ESC/POS with init, codepage 850 and cut", () => {
    const bytes = Array.from(renderTicket(buildKitchenTickets(order)[0], { paperWidth: 80, autoCut: true }) as Uint8Array);
    expect(bytes.slice(0, 5)).toEqual([0x1b, 0x40, 0x1b, 0x74, 2]);
    expect(bytes.slice(-4)).toEqual([0x1d, 0x56, 0x42, 0x00]);
    const noCut = Array.from(renderTicket(buildKitchenTickets(order)[0], { autoCut: false }) as Uint8Array);
    expect(noCut.slice(-3)).toEqual([0x1b, 0x64, 4]);
  });

  it("wraps long lines to the paper width", () => {
    expect(columnsFor(58)).toBe(32);
    expect(wrap("1x HAMBURGUER ARTESANAL COM QUEIJO DUPLO E BACON", 32).every((l: string) => l.length <= 32)).toBe(true);
  });
});

describe("print server routing", () => {
  it("only uses active network printers with the kitchen trigger", () => {
    const rows = [
      printer(),
      printer({ id: "p2", host: null }),
      printer({ id: "p3", active: false }),
      printer({ id: "p4", gatilhos: ["conta_mesa"] }),
      printer({ id: "p5", host: "http://x/y" }),
      printer({ id: "p6", gatilhos: [], gatilho: "comanda_cozinha", destinos: [] }),
    ];
    const ids = kitchenPrinters(rows).map((p: { id: string }) => p.id);
    expect(ids).toEqual(["p1", "p6"]);
    expect(kitchenPrinters(rows).find((p: { id: string }) => p.id === "p6").destinos).toEqual(["kitchen", "bar"]);
  });

  it("sends each ticket to every printer of its sector and reports orphans", () => {
    const tickets = buildKitchenTickets(order);
    const { plan, orphans } = route(tickets, kitchenPrinters([printer(), printer({ id: "p2", name: "Cozinha 2" })]));
    expect(plan.map((p: { tickets: unknown[] }) => p.tickets.length)).toEqual([2, 2]);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].destination).toBe("bar");
  });

  it("labels integration channels", () => {
    expect(channelLabel({ source: "ifood" })).toBe("iFood");
    expect(channelLabel({ origin: "pwa" })).toBe("Online");
    expect(channelLabel({})).toBeNull();
  });
});
