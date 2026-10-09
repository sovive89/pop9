/**
 * QZ Tray transport. Requires QZ Tray installed and running on the same
 * workstation as the browser. Unsigned requests may require user approval.
 */
type QzClient = {
  websocket: { isActive(): boolean; connect(): Promise<void> };
  configs: { create(name: string | null, options?: Record<string, unknown>): unknown };
  print(config: unknown, data: Array<{ type: string; format: string; data: string }>): Promise<void>;
};
declare global { interface Window { qz?: QzClient } }
let loading: Promise<QzClient> | undefined;
function getQz(): Promise<QzClient> {
  if (window.qz) return Promise.resolve(window.qz);
  if (!loading) loading = new Promise<QzClient>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/qz-tray@2.2.5/qz-tray.js";
    script.onload = () => window.qz ? resolve(window.qz) : reject(new Error("Biblioteca QZ Tray indisponível"));
    script.onerror = () => reject(new Error("Não foi possível carregar a biblioteca QZ Tray"));
    document.head.appendChild(script);
  }).catch((error) => { loading = undefined; throw error; });
  return loading;
}
export async function testQzPrinter(input: { host: string | null; port: number; deviceIdentifier: string | null; transport: string; autoCut: boolean; copies: number }): Promise<void> {
  const qz = await getQz();
  if (!qz.websocket.isActive()) await qz.websocket.connect();
  const printer = input.transport === "tcp"
    ? qz.configs.create(null, { host: input.host, port: input.port, copies: input.copies })
    : qz.configs.create(input.deviceIdentifier, { copies: input.copies });
  if (input.transport === "tcp" && !input.host) throw new Error("Informe o IP/host da impressora");
  if (input.transport !== "tcp" && !input.deviceIdentifier) throw new Error("Informe o nome da impressora no Windows");
  const message = "POP9 ERP\nTESTE ESC/POS\n" + new Date().toLocaleString("pt-BR") + "\n\n\n";
  const cut = input.autoCut ? "\x1d\x56\x00" : "";
  await qz.print(printer, [{ type: "raw", format: "plain", data: "\x1b\x40" + message + cut }]);
}
