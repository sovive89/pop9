// Cliente HTTP das Edge Functions públicas (public-order, pwa-verify): sem sessão do Supabase, com tempo limite,
// mensagens em português e repetição automática só onde repetir é seguro.
export type PublicApiErrorKind = "network" | "timeout" | "server" | "client" | "auth";

export class PublicApiError extends Error {
  constructor(message: string, readonly kind: PublicApiErrorKind, readonly status: number, readonly requestId?: string) {
    super(message);
    this.name = "PublicApiError";
  }
  /** Falha de rede, tempo esgotado ou erro 5xx: repetir a mesma chamada pode dar certo. Erro 4xx nunca. */
  get retryable() { return this.kind === "network" || this.kind === "timeout" || this.kind === "server"; }
}

export type PublicPostOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  /** Repetições além da primeira tentativa. Use 0 quando repetir não é idempotente (ex.: enviar SMS). */
  retries?: number;
  backoffMs?: number;
  notConfiguredMessage?: string;
  fallbackMessage?: string;
};

const NETWORK_MESSAGE = "Sem conexão com a loja. Verifique sua internet e tente de novo.";
const TIMEOUT_MESSAGE = "A loja demorou para responder. Tente de novo em instantes.";
const SERVER_MESSAGE = "A loja está com instabilidade. Tente de novo em instantes.";
const AUTH_MESSAGE = "Sua verificação expirou. Confirme seu celular de novo.";
const EXPIRED_LINK = /link expirado/i;

const withCode = (message: string, requestId?: string) => requestId ? `${message} (código ${requestId.slice(0, 8)})` : message;

async function attempt(url: string, body: unknown, fetchImpl: typeof fetch, timeoutMs: number, fallbackMessage: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal });
    } catch {
      // Nunca repassa a mensagem crua do navegador ("Failed to fetch", "Load failed").
      throw new PublicApiError(controller.signal.aborted ? TIMEOUT_MESSAGE : NETWORK_MESSAGE, controller.signal.aborted ? "timeout" : "network", 0);
    }
    const data = await response.json().catch(() => null) as { error?: unknown; request_id?: unknown } | null;
    if (controller.signal.aborted) throw new PublicApiError(TIMEOUT_MESSAGE, "timeout", 0);
    const message = typeof data?.error === "string" ? data.error : "";
    const requestId = typeof data?.request_id === "string" ? data.request_id : undefined;
    if (response.status >= 500) throw new PublicApiError(withCode(message || SERVER_MESSAGE, requestId), "server", response.status, requestId);
    if (response.status === 401 || EXPIRED_LINK.test(message)) throw new PublicApiError(message || AUTH_MESSAGE, "auth", response.status);
    if (!response.ok || message) throw new PublicApiError(message || fallbackMessage, "client", response.status);
    // 200 sem JSON válido (proxy ou página de erro no meio do caminho) é falha do servidor, não sucesso.
    if (data === null) throw new PublicApiError(SERVER_MESSAGE, "server", response.status);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function publicPost<T>(path: string, body: Record<string, unknown>, options: PublicPostOptions = {}): Promise<T> {
  const base = options.baseUrl ?? import.meta.env.VITE_SUPABASE_URL;
  if (!base) throw new PublicApiError(options.notConfiguredMessage ?? "O pedido online ainda não foi configurado", "client", 0);
  const url = `${base}/functions/v1/${path}`;
  const retries = options.retries ?? 2;
  const backoff = options.backoffMs ?? 1000;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  for (let tries = 0; ; tries++) {
    try {
      return await attempt(url, body, fetchImpl, options.timeoutMs ?? 15000, options.fallbackMessage ?? "Não foi possível acessar a loja") as T;
    } catch (error) {
      if (!(error instanceof PublicApiError) || !error.retryable || tries >= retries) throw error;
      await sleep(backoff * 2 ** tries);
    }
  }
}
