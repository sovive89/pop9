/**
 * POP9 print transport — QZ Tray adapter.
 * QZ Tray runs on the Windows/macOS/Linux workstation, not on iOS.
 * Keep receipt generation separate from transport so a local print agent can
 * later consume the same jobs without changing the waiter UI.
 */
type QzClient = {
  websocket: { isActive(): boolean; connect(options?: Record<string, unknown>): Promise<void> };
  printers: { find(name: string): Promise<string> };
  configs: { create(name: string | null, options?: Record<string, unknown>): unknown };
  print(config: unknown, data: Array<{ type: string; format: string; flavor: string; data: string }>): Promise<void>;
};
declare global { interface Window { qz?: QzClient } }
let loading: Promise<QzClient> | undefined;

async function getQz(): Promise<QzClient> {
  if (window.qz) return window.qz;
  if (!loading) {
    loading = new Promise<QzClient>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/qz-tray@2.2.5/qz-tray.js";
      script.onload = () => window.qz ? resolve(window.qz) : reject(new Error("Biblioteca QZ Tray carregada, mas API indisponível"));
      script.onerror = () => reject(new Error("Não foi possível carregar a biblioteca QZ Tray"));
      document.head.appendChild(script);
    }).catch((error) => { loading = undefined; throw error; });
  }
  return loading;
}

export type PrintJob = {
  destination: { transport: "tcp" | "usb"; host?: string | null; port?: number; printerName?: string | null };
  payload: string;
  copies?: number;
  encoding?: string;
};

export async function sendQzPrintJob(job: PrintJob): Promise<void> {
  if (/iPad|iPhone|iPod/i.test(navigator.userAgent)) {
    throw new Error("QZ Tray não funciona no iOS. Execute este teste no PC com QZ Tray aberto.");
  }
  const qz = await getQz();
  try {
    if (!qz.websocket.isActive()) await qz.websocket.connect();
  } catch (cause) {
    throw new Error("Não foi possível conectar ao QZ Tray local. Confira se está aberto neste computador.", { cause });
  }

  let config: unknown;
  if (job.destination.transport === "tcp") {
    if (!job.destination.host) throw new Error("Informe o IP da impressora TCP");
    // QZ Tray supports direct RAW socket destinations via host/port.
    config = qz.configs.create(null, {
      host: job.destination.host,
      port: job.destination.port ?? 9100,
      copies: job.copies ?? 1,
      encoding: job.encoding ?? "CP850",
    });
  } else {
    const name = job.destination.printerName?.trim();
    if (!name) throw new Error("Informe o nome exato da impressora cadastrada no Windows");
    let found: string;
    try {
      found = await qz.printers.find(name);
    } catch (cause) {
      throw new Error('O QZ Tray não encontrou a impressora "' + name + '" no Windows.', { cause });
    }
    config = qz.configs.create(found, { copies: job.copies ?? 1, encoding: job.encoding ?? "CP850" });
  }
  try {
    await qz.print(config, [{ type: "raw", format: "command", flavor: "plain", data: job.payload }]);
  } catch (cause) {
    throw new Error("QZ Tray conectado, mas não conseguiu enviar o trabalho à impressora.", { cause });
  }
}

export async function testQzPrinter(input: {
  host: string | null; port: number; deviceIdentifier: string | null;
  transport: string; autoCut: boolean; copies: number; encoding?: string;
}): Promise<void> {
  const message = "POP9 ERP\nTESTE ESC/POS\n" + new Date().toLocaleString("pt-BR") + "\n\n\n";
  await sendQzPrintJob({
    destination: {
      transport: input.transport === "tcp" ? "tcp" : "usb",
      host: input.host,
      port: input.port,
      printerName: input.deviceIdentifier,
    },
    copies: input.copies,
    encoding: (input.encoding ?? "cp850").toUpperCase(),
    payload: "\x1b\x40" + message + (input.autoCut ? "\x1d\x56\x00" : ""),
  });
}
