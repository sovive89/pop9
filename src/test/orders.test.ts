import { describe, expect, it } from "vitest";
import {
  getCartTotal,
  getClientTotal,
  getItemExtrasTotal,
  getItemUnitPrice,
  getTableTotal,
  formatCurrency,
  type ClientOrder,
  type OrderItem,
} from "@/utils/orders";

// Testes de caracterização (etapa 0 da separação ERP/Hub): fixam o
// comportamento ATUAL das contas para detectar regressão ao reorganizar o código.

const item = (over: Partial<OrderItem> = {}): OrderItem => ({
  menuItemId: "m1",
  name: "Burger",
  price: 30,
  quantity: 1,
  ...over,
});

describe("cálculo de itens e contas", () => {
  it("soma só os extras com preço; remover ingrediente não cobra", () => {
    const i = item({
      ingredientMods: [
        { name: "bacon", action: "extra", extraPrice: 5 },
        { name: "queijo", action: "extra", extraPrice: 2.5 },
        { name: "cebola", action: "remove" },
        { name: "molho", action: "extra" }, // sem preço: ignorado
      ],
    });
    expect(getItemExtrasTotal(i)).toBe(7.5);
    expect(getItemUnitPrice(i)).toBe(37.5);
  });

  it("item sem modificadores custa o preço base", () => {
    expect(getItemExtrasTotal(item())).toBe(0);
    expect(getItemUnitPrice(item({ price: 12.9 }))).toBe(12.9);
  });

  it("carrinho multiplica preço unitário (com extras) pela quantidade", () => {
    const cart = [
      item({ price: 30, quantity: 2 }),
      item({ price: 10, quantity: 3, ingredientMods: [{ name: "x", action: "extra", extraPrice: 1 }] }),
    ];
    expect(getCartTotal(cart)).toBe(30 * 2 + 11 * 3);
    expect(getCartTotal([])).toBe(0);
  });

  it("total do cliente soma todos os pedidos feitos; o carrinho não entra", () => {
    const client: ClientOrder = {
      clientId: "c1",
      cart: [item({ price: 999 })],
      orders: [
        { id: "o1", items: [item({ price: 20, quantity: 2 })], status: "pending", placedAt: new Date() },
        { id: "o2", items: [item({ price: 5 })], status: "delivered", placedAt: new Date() },
      ],
    };
    expect(getClientTotal(client)).toBe(45);
  });

  it("total da mesa é a soma dos clientes (comandas individuais)", () => {
    const mk = (id: string, price: number): ClientOrder => ({
      clientId: id,
      cart: [],
      orders: [{ id: `o-${id}`, items: [item({ price })], status: "ready", placedAt: new Date() }],
    });
    expect(getTableTotal([mk("a", 10), mk("b", 22.5)])).toBe(32.5);
    expect(getTableTotal([])).toBe(0);
  });

  it("formata em reais (pt-BR)", () => {
    expect(formatCurrency(1234.5).replace(/\s/g, " ")).toBe("R$ 1.234,50");
  });
});
