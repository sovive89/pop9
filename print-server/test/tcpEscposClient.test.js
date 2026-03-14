import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { TcpEscPosPrinterClient } from "../src/printers/tcpEscposClient.js";

const listen = (server) =>
  new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });

const close = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

test("TcpEscPosPrinterClient sends bytes to TCP printer endpoint", async () => {
  let received = Buffer.alloc(0);
  const server = net.createServer((socket) => {
    socket.on("data", (chunk) => {
      received = Buffer.concat([received, chunk]);
    });
  });

  const port = await listen(server);
  const client = new TcpEscPosPrinterClient({ timeoutMs: 2000 });

  await client.send(
    {
      id: "printer-1",
      enabled: true,
      ip_address: "127.0.0.1",
      port,
    },
    Buffer.from("TEST_PRINT"),
  );

  await close(server);
  assert.equal(received.toString("ascii"), "TEST_PRINT");
});
