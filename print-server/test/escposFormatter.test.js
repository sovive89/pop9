import test from "node:test";
import assert from "node:assert/strict";
import { EscPosFormatter } from "../src/formatters/escposFormatter.js";

test("EscPosFormatter builds ticket with order context and items", () => {
  const formatter = new EscPosFormatter({ lineWidth: 32 });
  const buffer = formatter.buildTicket(
    {
      job_id: "job_1",
      restaurant_id: "rest_1",
      event_type: "ORDER_CREATED",
      payload: {
        restaurantName: "Pop9 Centro",
        tableNumber: "12",
        orderNumber: "A1001",
        items: [
          { name: "Burger", quantity: 1 },
          { name: "Fries", quantity: 2 },
        ],
        notes: "Sem cebola",
      },
    },
    {
      location: "KITCHEN",
    },
  );

  const text = buffer.toString("ascii");
  assert.match(text, /Pop9 Centro/);
  assert.match(text, /Mesa: 12/);
  assert.match(text, /Pedido: A1001/);
  assert.match(text, /1x Burger/);
  assert.match(text, /2x Fries/);
  assert.match(text, /Sem cebola/);
});
