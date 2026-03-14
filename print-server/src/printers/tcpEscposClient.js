import net from "node:net";

export class TcpEscPosPrinterClient {
  constructor({ timeoutMs = 5000, logger }) {
    this.timeoutMs = timeoutMs;
    this.logger = logger;
  }

  async send(printer, payloadBuffer) {
    if (!printer?.enabled) {
      throw new Error(`Printer ${printer?.id ?? "unknown"} is disabled`);
    }

    const host = printer.ip_address;
    const port = Number(printer.port ?? 9100);
    if (!host || !port) {
      throw new Error(`Invalid printer endpoint for ${printer?.id ?? "unknown"}`);
    }

    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      let settled = false;

      const done = (error) => {
        if (settled) return;
        settled = true;
        socket.removeAllListeners();
        socket.destroy();
        if (error) reject(error);
        else resolve();
      };

      socket.setTimeout(this.timeoutMs);

      socket.once("connect", () => {
        socket.write(payloadBuffer, (writeError) => {
          if (writeError) {
            done(writeError);
            return;
          }
          socket.end();
        });
      });

      socket.once("timeout", () => {
        done(new Error(`Printer timeout ${host}:${port}`));
      });

      socket.once("error", (error) => {
        done(new Error(`Printer offline ${host}:${port} (${error.message})`));
      });

      socket.once("close", () => {
        done();
      });
    });
  }
}
